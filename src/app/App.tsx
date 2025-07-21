"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import BottomToolbar from "./components/BottomToolbar";

// Types
import { SessionStatus, TranscriptItem } from "@/app/types";
import type { RealtimeAgent } from '@openai/agents/realtime';

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";

// Utilities
import { RealtimeClient } from "@/app/agentConfigs/realtimeClient";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
// New SDK scenarios
import { simpleHandoffScenario } from "@/app/agentConfigs/simpleHandoff";
import { customerServiceRetailScenario } from "@/app/agentConfigs/customerServiceRetail";
import { chatSupervisorScenario } from "@/app/agentConfigs/chatSupervisor";
import { emergencyCallScenario, getEmergencyCallScenarioByKey, getElevenLabsVoiceFromAgentName, getVoiceIdFromScenario } from "@/app/agentConfigs/emergencyCall";

const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  emergencyCall: emergencyCallScenario,
};

import useAudioDownload from "./hooks/useAudioDownload";
import { fetchElevenLabsTTS } from "@/app/lib/elevenLabsTTS";

interface AppProps {
  isCallActive: boolean;
  onCallEnd: () => void;
  callStartTime: Date | null;
}

function App({ isCallActive, onCallEnd, callStartTime }: AppProps) {
  const searchParams = useSearchParams()!;

  // Store all assistant TTS audio blobs for concatenation
  const assistantAudioBlobs = useRef<{ itemId: string, blob: Blob }[]>([]);

  // Track all active TTS audio objects for proper cleanup
  const activeTTSAudio = useRef<Set<HTMLAudioElement>>(new Set());

  // Function to forcefully stop all audio
  const stopAllAudio = () => {
    console.log(`[AUDIO CLEANUP] Stopping ${activeTTSAudio.current.size} active TTS audio objects`);

    // Stop all TTS audio
    activeTTSAudio.current.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        audio.load(); // Reset the audio element
      } catch (err) {
        console.warn('Error stopping TTS audio:', err);
      }
    });
    activeTTSAudio.current.clear();

    // Stop SDK audio
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current.muted = true;
        audioElementRef.current.src = '';
        audioElementRef.current.load();
      } catch (err) {
        console.warn('Error stopping SDK audio:', err);
      }
    }

    // Stop any media streams (for microphone)
    try {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(() => {
          // Ignore errors - stream might not exist
        });
    } catch {
      // Ignore errors
    }
  };

  const {
    transcriptItems,
    addTranscriptMessage,
    addTranscriptBreadcrumb,
    updateTranscriptMessage,
    updateTranscriptItem,
  } = useTranscript();

  // Keep a mutable reference to the latest transcriptItems so that streaming
  // callbacks registered once during setup always have access to up-to-date
  // data without being re-registered on every render.
  const transcriptItemsRef = useRef<TranscriptItem[]>(transcriptItems);
  useEffect(() => {
    transcriptItemsRef.current = transcriptItems;
  }, [transcriptItems]);
  const { logClientEvent, logServerEvent, logHistoryItem } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const sdkAudioElement = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }, []);

  // Attach SDK audio element once it exists (after first render in browser)
  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement;
    }
  }, [sdkAudioElement]);

  const sdkClientRef = useRef<RealtimeClient | null>(null);
  const loggedFunctionCallsRef = useRef<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [userText, setUserText] = useState<string>("");

  // Initialize the recording hook.
  const {
    startRecording,
    stopRecording,
    downloadRecording,
    getAudioBlob,
    recordingError,
  } = useAudioDownload();

  // Add recording status indicator
  const [showRecordingStatus, setShowRecordingStatus] = useState(false);

  const sendClientEvent = (eventObj: any) => {
    if (!sdkClientRef.current) {
      console.error('SDK client not available', eventObj);
      return;
    }

    try {
      sdkClientRef.current.sendEvent(eventObj);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }
  };

  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
    }

    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      updateSession(true);
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [sessionStatus]);

  // Cleanup effect to stop all audio when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup all audio on unmount
      stopAllAudio();
    };
  }, []);

  // Add keyboard shortcut for emergency audio stop (Escape key)
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        console.log('[EMERGENCY] Escape key pressed - stopping all audio');
        stopAllAudio();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    // Force refresh of search params to ensure we have the latest URL parameters
    const currentUrl = new URL(window.location.href);
    const currentSearchParams = new URLSearchParams(currentUrl.search);

    const agentSetKey = currentSearchParams.get("agentConfig") || "default";
    console.log(`🔧 connectToRealtime - agentSetKey: ${agentSetKey}`);

    if (sdkScenarioMap[agentSetKey]) {
      // Use new SDK path
      if (sessionStatus !== "DISCONNECTED") return;
      setSessionStatus("CONNECTING");

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

        // Handle specific emergency call scenario if scenarioKey is provided
        let agentsToUse = [...sdkScenarioMap[agentSetKey]];
        if (agentSetKey === 'emergencyCall') {
          const scenarioKey = currentSearchParams.get('scenarioKey');
          console.log(`🔧 App.tsx - agentSetKey: ${agentSetKey}, scenarioKey: ${scenarioKey}`);
          console.log(`🌐 Full URL:`, window.location.href);
          console.log(`📝 All URL params:`, Object.fromEntries(currentSearchParams.entries()));

          if (scenarioKey) {
            console.log(`🎭 Using specific scenario: ${scenarioKey}`);
            agentsToUse = getEmergencyCallScenarioByKey(scenarioKey);
          } else {
            console.log(`⚠️ No scenarioKey found, using default emergency call agents`);
          }
        }

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...agentsToUse];
        const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        const client = new RealtimeClient({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          // audioElement: sdkAudioElement, // Removed to disable SDK audio playback
          extraContext: {
            addTranscriptBreadcrumb,
          },
          enableTextToSpeech: true, // Enable voice output for emergency scenarios
        } as any);

        sdkClientRef.current = client;

        client.on("connection_change", (status) => {
          if (status === "connected") setSessionStatus("CONNECTED");
          else if (status === "connecting") setSessionStatus("CONNECTING");
          else {
            setSessionStatus("DISCONNECTED");
            onCallEnd();
          }
        });

        client.on("audio_interrupted", () => {
          console.log("Audio interrupted, attempting to reconnect...");
          client.disconnect();
          connectToRealtime();
        });

        client.on("message", (ev) => {
          logServerEvent(ev);

          // Log the full event object for debugging
          console.log("[Realtime API] Full assistant response:", ev);

          // If the event contains text, log just the text
          if (ev && (ev.type === 'response.text.delta' || ev.type === 'response.audio_transcript.delta')) {
            const delta = (ev as any).delta ?? (ev as any).text;
            if (delta) {
              console.log("[Realtime API] Assistant text delta:", delta);
            }
          }

          // --- Realtime streaming handling ---------------------------------
          // The Realtime transport emits granular *delta* events while the
          // assistant is speaking or while the user's audio is still being
          // transcribed. Those events were previously only logged which made
          // the UI update only once when the final conversation.item.* event
          // arrived – effectively disabling streaming. We now listen for the
          // delta events and update the transcript as they arrive so that
          // 1) assistant messages stream token-by-token, and
          // 2) the user sees a live "Transcribing…" placeholder while we are
          //    still converting their speech to text.

          // NOTE: The exact payloads are still evolving.  We intentionally
          // access properties defensively to avoid runtime crashes if fields
          // are renamed or missing.

          try {
            // Guardrail trip event – mark last assistant message as FAIL
            if (ev.type === 'guardrail_tripped') {
              const lastAssistant = [...transcriptItemsRef.current]
                .reverse()
                .find((i) => i.role === 'assistant');

              if (lastAssistant) {
                updateTranscriptItem(lastAssistant.itemId, {
                  guardrailResult: {
                    status: 'DONE',
                    category: 'OFF_BRAND',
                    rationale: 'Guardrail triggered',
                    testText: '',
                  },
                } as any);
              }
              return;
            }

            // Response finished – if we still have Pending guardrail mark as
            // Pass. This event fires once per assistant turn.
            if (ev.type === 'response.done') {
              const lastAssistant = [...transcriptItemsRef.current]
                .reverse()
                .find((i) => i.role === 'assistant');

              if (lastAssistant) {
                const existing: any = (lastAssistant as any).guardrailResult;
                if (!existing || existing.status === 'IN_PROGRESS') {
                  updateTranscriptItem(lastAssistant.itemId, {
                    guardrailResult: {
                      status: 'DONE',
                      category: 'NONE',
                      rationale: '',
                    },
                  } as any);
                }
              }
              // continue processing other logic if needed
            }
            // Assistant text (or audio-to-text) streaming
            if (
              ev.type === 'response.text.delta' ||
              ev.type === 'response.audio_transcript.delta'
            ) {
              const itemId: string | undefined = (ev as any).item_id ?? (ev as any).itemId;
              const delta: string | undefined = (ev as any).delta ?? (ev as any).text;
              if (!itemId || !delta) return;

              // Ensure a transcript message exists for this assistant item.
              if (!transcriptItemsRef.current.some((t) => t.itemId === itemId)) {
                addTranscriptMessage(itemId, 'assistant', '');
                updateTranscriptItem(itemId, {
                  guardrailResult: {
                    status: 'IN_PROGRESS',
                  },
                } as any);
              }

              // Append the latest delta so the UI streams.
              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: 'IN_PROGRESS' });
              return;
            }

            // Live user transcription streaming
            if (ev.type === 'conversation.input_audio_transcription.delta') {
              const itemId: string | undefined = (ev as any).item_id ?? (ev as any).itemId;
              const delta: string | undefined = (ev as any).delta ?? (ev as any).text;
              if (!itemId || typeof delta !== 'string') return;

              // If this is the very first chunk, create a hidden user message
              // so that we can surface "Transcribing…" immediately.
              if (!transcriptItemsRef.current.some((t) => t.itemId === itemId)) {
                addTranscriptMessage(itemId, 'user', 'Transcribing…');
              }

              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: 'IN_PROGRESS' });
            }

            // Detect start of a new user speech segment when VAD kicks in.
            if (ev.type === 'input_audio_buffer.speech_started') {
              const itemId: string | undefined = (ev as any).item_id;
              if (!itemId) return;

              const exists = transcriptItemsRef.current.some(
                (t) => t.itemId === itemId,
              );
              if (!exists) {
                addTranscriptMessage(itemId, 'user', 'Transcribing…');
                updateTranscriptItem(itemId, { status: 'IN_PROGRESS' });
              }
            }

            // Final transcript once Whisper finishes
            if (
              ev.type === 'conversation.item.input_audio_transcription.completed'
            ) {
              const itemId: string | undefined = (ev as any).item_id;
              const transcriptText: string | undefined = (ev as any).transcript;
              if (!itemId || typeof transcriptText !== 'string') return;

              const exists = transcriptItemsRef.current.some(
                (t) => t.itemId === itemId,
              );
              if (!exists) {
                addTranscriptMessage(itemId, 'user', transcriptText.trim());
              } else {
                // Replace placeholder / delta text with final transcript
                updateTranscriptMessage(itemId, transcriptText.trim(), false);
              }
              updateTranscriptItem(itemId, { status: 'DONE' });
            }

            // Assistant streaming tokens or transcript
            if (
              ev.type === 'response.text.delta' ||
              ev.type === 'response.audio_transcript.delta'
            ) {
              const responseId: string | undefined =
                (ev as any).response_id ?? (ev as any).responseId;
              const delta: string | undefined = (ev as any).delta ?? (ev as any).text;
              if (!responseId || typeof delta !== 'string') return;

              // We'll use responseId as part of itemId to make it deterministic.
              const itemId = `assistant-${responseId}`;

              if (!transcriptItemsRef.current.some((t) => t.itemId === itemId)) {
                addTranscriptMessage(itemId, 'assistant', '');
              }

              updateTranscriptMessage(itemId, delta, true);
              updateTranscriptItem(itemId, { status: 'IN_PROGRESS' });
            }
          } catch (err) {
            // Streaming is best-effort – never break the session because of it.
            console.warn('streaming-ui error', err);
          }
        });

        client.on('history_added', async (item) => {
          logHistoryItem(item);

          // Debug: log every item
          console.log("[TTS DEBUG] history_added item:", item);

          // Update the transcript view
          if (item.type === 'message') {
            const textContent = (item.content || [])
              .map((c: any) => {
                if (c.type === 'text') return c.text;
                if (c.type === 'input_text') return c.text;
                if (c.type === 'input_audio') return c.transcript ?? '';
                if (c.type === 'audio') return c.transcript ?? '';
                return '';
              })
              .join(' ')
              .trim();

            if (!textContent) return;

            const role = item.role as 'user' | 'assistant';
            const status = (item as any).status;

            // Debug: log role and status
            console.log("[TTS DEBUG] Assistant message status:", status, "itemId:", item.itemId);

            // No PTT placeholder logic needed

            const exists = transcriptItemsRef.current.some(
              (t) => t.itemId === item.itemId,
            );

            if (!exists) {
              addTranscriptMessage(item.itemId, role, textContent, false);
              if (role === 'assistant') {
                updateTranscriptItem(item.itemId, {
                  guardrailResult: {
                    status: 'IN_PROGRESS',
                  },
                } as any);
              }
            } else {
              updateTranscriptMessage(item.itemId, textContent, false);
            }

            if (role === 'assistant') {
              if (status === 'in_progress' && !ttsPlayedFor.current.has(item.itemId)) {
                console.log("[TTS DEBUG] Triggering TTS for item:", item.itemId);
                // --- ElevenLabs TTS Integration ---
                // Get the correct voice ID based on the current scenario and character
                const currentSearchParams = new URLSearchParams(window.location.search);
                const agentSetKey = currentSearchParams.get('agentConfig');
                const scenarioKey = currentSearchParams.get('scenarioKey');

                let voiceId: string | undefined;

                // Use direct voice ID from scenario configuration for emergency call scenarios
                if (agentSetKey === 'emergencyCall' && scenarioKey) {
                  const scenarioVoiceId = getVoiceIdFromScenario(scenarioKey);
                  if (scenarioVoiceId) {
                    voiceId = scenarioVoiceId;
                    console.log(`[TTS DEBUG] Using direct voice ID from scenario: ${scenarioKey} -> ${voiceId}`);
                  }
                }

                // Fallback to agent name-based selection
                if (!voiceId) {
                  const currentAgent = selectedAgentConfigSet?.[0]; // Get the first agent (root agent)
                  voiceId = currentAgent ? getElevenLabsVoiceFromAgentName(currentAgent.name) : undefined;
                  console.log(`[TTS DEBUG] Using fallback agent-based voice selection: ${currentAgent?.name} -> ${voiceId}`);
                }
                try {
                  // Mute SDK audio so only ElevenLabs is heard
                  if (audioElementRef.current) {
                    audioElementRef.current.muted = true;
                  }
                  // Debug log to confirm TTS call
                  console.log("About to call fetchElevenLabsTTS", textContent, voiceId);
                  const audioBlob = await fetchElevenLabsTTS(textContent, voiceId);
                  // Check if we got a valid audio blob (not empty)
                  if (audioBlob.size > 0 && audioElementRef.current) {
                    const audioUrl = URL.createObjectURL(audioBlob);
                    // audioElementRef.current.src = audioUrl;
                    // audioElementRef.current.play();
                    audioElementRef.current.onended = () => {
                      URL.revokeObjectURL(audioUrl);
                      // Optionally unmute after playback if you want SDK audio for other things
                      if (audioElementRef.current) {
                        audioElementRef.current.muted = false;
                      }
                    };
                  } else if (audioBlob.size === 0) {
                    console.log("TTS unavailable - skipping audio playback");
                  }
                } catch (err) {
                  console.error('Failed to synthesize or play ElevenLabs audio:', err);
                }
                ttsPlayedFor.current.add(item.itemId);
              }
            }
          }

          // Surface function / hand-off calls as breadcrumbs
          if (item.type === 'function_call') {
            const title = `Tool call: ${(item as any).name}`;

            if (!loggedFunctionCallsRef.current.has(item.itemId)) {
              addTranscriptBreadcrumb(title, {
                arguments: (item as any).arguments,
              });
              loggedFunctionCallsRef.current.add(item.itemId);

              // If this looks like a handoff (transfer_to_*), switch active
              // agent so subsequent session updates & breadcrumbs reflect the
              // new agent. The Realtime SDK already updated the session on
              // the backend; this only affects the UI state.
              const toolName: string = (item as any).name ?? '';
              const handoffMatch = toolName.match(/^transfer_to_(.+)$/);
              if (handoffMatch) {
                const newAgentKey = handoffMatch[1];

                // Find agent whose name matches (case-insensitive)
                const candidate = selectedAgentConfigSet?.find(
                  (a) => a.name.toLowerCase() === newAgentKey.toLowerCase(),
                );
                if (candidate && candidate.name !== selectedAgentName) {
                  setSelectedAgentName(candidate.name);
                }
              }
            }
            return;
          }
        });

        // Handle continuous updates for existing items so streaming assistant
        // speech shows up while in_progress.
        client.on('history_updated', async (history) => {
          history.forEach(async (item: any) => {
            console.log("[TTS DEBUG] history_updated item:", item);
            if (item.role === 'assistant') {
              console.log("[TTS DEBUG] Assistant message status:", item.status, "itemId:", item.itemId);
              // Trigger TTS on first in_progress for each assistant message
              if (item.status === 'in_progress' && !ttsPlayedFor.current.has(item.itemId)) {
                console.log("[TTS DEBUG] Triggering TTS for item:", item.itemId);
                // --- ElevenLabs TTS Integration ---
                // Get the correct voice ID based on the current scenario and character
                const currentSearchParams = new URLSearchParams(window.location.search);
                const agentSetKey = currentSearchParams.get('agentConfig');
                const scenarioKey = currentSearchParams.get('scenarioKey');

                let voiceId: string | undefined;

                // Use direct voice ID from scenario configuration for emergency call scenarios
                if (agentSetKey === 'emergencyCall' && scenarioKey) {
                  const scenarioVoiceId = getVoiceIdFromScenario(scenarioKey);
                  if (scenarioVoiceId) {
                    voiceId = scenarioVoiceId;
                    console.log(`[TTS DEBUG] Using direct voice ID from scenario: ${scenarioKey} -> ${voiceId}`);
                  }
                }

                // Fallback to agent name-based selection
                if (!voiceId) {
                  const currentAgent = selectedAgentConfigSet?.[0]; // Get the first agent (root agent)
                  voiceId = currentAgent ? getElevenLabsVoiceFromAgentName(currentAgent.name) : undefined;
                  console.log(`[TTS DEBUG] Using fallback agent-based voice selection: ${currentAgent?.name} -> ${voiceId}`);
                }
                try {
                  // Get the text content for TTS
                  const textContent = (item.content || [])
                    .map((c: any) => {
                      if (c.type === 'text') return c.text;
                      if (c.type === 'input_text') return c.text;
                      if (c.type === 'input_audio') return c.transcript ?? '';
                      if (c.type === 'audio') return c.transcript ?? '';
                      return '';
                    })
                    .join(' ')
                    .trim();
                  if (!textContent) {
                    console.warn("Skipping TTS: empty text content for item", item);
                    return;
                  }
                  console.log("About to call fetchElevenLabsTTS", textContent, voiceId);
                  const audioBlob = await fetchElevenLabsTTS(textContent, voiceId);

                  // Check if we got a valid audio blob (not empty)
                  if (audioBlob.size > 0) {
                    // Store the blob for later concatenation
                    assistantAudioBlobs.current.push({ itemId: item.itemId, blob: audioBlob });
                    // Play the audio as before
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);

                    // Track this audio object for cleanup
                    activeTTSAudio.current.add(audio);

                    audio.play().then(() => {
                      console.log("ElevenLabs audio is playing");
                    }).catch(e => {
                      console.error("Failed to play ElevenLabs audio", e);
                    });

                    audio.onended = () => {
                      URL.revokeObjectURL(audioUrl);
                      // Remove from tracking when finished
                      activeTTSAudio.current.delete(audio);
                    };

                    audio.onerror = () => {
                      URL.revokeObjectURL(audioUrl);
                      // Remove from tracking on error
                      activeTTSAudio.current.delete(audio);
                    };
                  } else {
                    console.log("TTS unavailable - skipping audio playback for assistant message");
                  }
                } catch (err) {
                  console.error('Failed to synthesize or play ElevenLabs audio:', err);
                }
                ttsPlayedFor.current.add(item.itemId);
              }
            }

            if (item.type === 'function_call') {
              // Update breadcrumb data (e.g., add output) once we have more info.

              if (!loggedFunctionCallsRef.current.has(item.itemId)) {
                addTranscriptBreadcrumb(`Tool call: ${(item as any).name}`, {
                  arguments: (item as any).arguments,
                  output: (item as any).output,
                });
                loggedFunctionCallsRef.current.add(item.itemId);

                const toolName: string = (item as any).name ?? '';
                const handoffMatch = toolName.match(/^transfer_to_(.+)$/);
                if (handoffMatch) {
                  const newAgentKey = handoffMatch[1];
                  const candidate = selectedAgentConfigSet?.find(
                    (a) => a.name.toLowerCase() === newAgentKey.toLowerCase(),
                  );
                  if (candidate && candidate.name !== selectedAgentName) {
                    setSelectedAgentName(candidate.name);
                  }
                }
              }

              return;
            }

            if (item.type !== 'message') return;

            const textContent = (item.content || [])
              .map((c: any) => {
                if (c.type === 'text') return c.text;
                if (c.type === 'input_text') return c.text;
                if (c.type === 'input_audio') return c.transcript ?? '';
                if (c.type === 'audio') return c.transcript ?? '';
                return '';
              })
              .join(' ')
              .trim();

            const role = item.role as 'user' | 'assistant';

            if (!textContent) return;

            const exists = transcriptItemsRef.current.some(
              (t) => t.itemId === item.itemId,
            );
            if (!exists) {
              addTranscriptMessage(item.itemId, role, textContent, false);
              if (role === 'assistant') {
                updateTranscriptItem(item.itemId, {
                  guardrailResult: {
                    status: 'IN_PROGRESS',
                  },
                } as any);
              }
            } else {
              updateTranscriptMessage(item.itemId, textContent, false);
            }

            if ('status' in item) {
              updateTranscriptItem(item.itemId, {
                status:
                  (item as any).status === 'completed'
                    ? 'DONE'
                    : 'IN_PROGRESS',
              });
            }
          });
        });

        await client.connect();

        // After connecting, tell the API to only stream text (no built-in TTS audio)
        client.sendEvent({
          type: "session.update",
          session: {
            modalities: ["text"], // Only request text output, no TTS audio stream
            // ...other session options if needed
          }
        });
        // Mute all SDK audio output (assistant voice only)
        if (audioElementRef.current) {
          audioElementRef.current.muted = true;
        }
        // Remove or comment out any code that globally stops or mutes all MediaStreams or AudioContexts
        // (Do NOT stop tracks or close AudioContexts globally, as this can break mic input)
        // --- Removed global MediaStream/AudioContext muting logic to avoid breaking user input ---
      } catch (err) {
        console.error("Error connecting via SDK:", err);
        setSessionStatus("DISCONNECTED");
        onCallEnd();
      }
      return;
    }
  };

  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isAIFinished, setIsAIFinished] = useState(false);

  // Add effect to detect when AI finishes speaking
  useEffect(() => {
    const lastAssistantMessage = [...transcriptItemsRef.current]
      .reverse()
      .find(item => item.role === 'assistant');

    if (lastAssistantMessage && lastAssistantMessage.status === 'DONE') {
      setIsAIFinished(true);
    }
  }, [transcriptItemsRef.current]);

  // Update the recording effect
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && audioElementRef.current?.srcObject) {
      const remoteStream = audioElementRef.current.srcObject as MediaStream;
      if (isCallActive && remoteStream.active) {
        startRecording(remoteStream);
        setShowRecordingStatus(true);
      }
    }

    return () => {
      if (isCallActive) {
        stopRecording();
        setShowRecordingStatus(false);
      }
    };
  }, [sessionStatus, isCallActive]);

  // Add recording error effect
  useEffect(() => {
    if (recordingError) {
      console.error('Recording error:', recordingError);
      // Show error to user
      alert(`Recording error: ${recordingError}`);
    }
  }, [recordingError]);

  // Update the disconnect handler
  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);

    try {
      // Stop all active audio immediately
      stopAllAudio();

      // Wait for AI to finish if it hasn't already
      if (!isAIFinished) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Stop recording first
      stopRecording();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for final data

      // Get audio blob and transcript
      getAudioBlob();
      function stripHtml(html: string) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
      }
      const transcriptText = transcriptItemsRef.current
        .filter(item => item.type === "MESSAGE" && item.title)
        .map(item => stripHtml(item.title ?? ""))
        .join('\n');

      const now = new Date();
      const callData = {
        start_time: callStartTime?.toISOString() || now.toISOString(),
        end_time: now.toISOString(),
        duration: callStartTime ? Math.floor((now.getTime() - callStartTime.getTime()) / 1000) : 0,
        caller_name: 'Unknown',
        caller_phone: '',
        caller_address: '',
        description: '',
        priority_level: 1,
        call_type: 'emergency',
        call_status: 'completed'
      };

      // First disconnect from realtime
      if (sdkClientRef.current) {
        sdkClientRef.current.disconnect();
        sdkClientRef.current = null;
      }
      setSessionStatus("DISCONNECTED");
      logClientEvent({}, "disconnected");
      onCallEnd();

      // Concatenate all assistant audio blobs into a single file
      async function concatenateAudioBlobs(blobs: Blob[]): Promise<Blob> {
        // Simple concatenation for same format blobs (e.g., mp3 or wav)
        return new Blob(blobs, { type: blobs[0]?.type || 'audio/mpeg' });
      }

      const allAssistantBlobs = assistantAudioBlobs.current.map((obj: { itemId: string, blob: Blob }) => obj.blob);
      const finalAudioBlob = await concatenateAudioBlobs(allAssistantBlobs);

      // Save audio and transcript to backend
      if (finalAudioBlob && finalAudioBlob.size > 0) {
        const formData = new FormData();
        formData.append('audio', finalAudioBlob, 'call.mp3');
        formData.append('transcript', transcriptText);
        formData.append('callData', JSON.stringify(callData));

        try {
          const response = await fetch('/api/emergency-calls/save', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to save call data: ${errorData.message || response.statusText}`);
          }

          const result = await response.json();

          // Wait for the database to be updated
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Now process the transcript
          if (result.id) {
            const processResponse = await fetch(`/api/emergency-calls/process-transcript/${result.id}`, {
              method: 'POST'
            });

            if (!processResponse.ok) {
              throw new Error('Failed to process transcript');
            }
          }
        } catch (err) {
          console.error('Failed to save call:', err);
          // Try to recover from cache
          const cachedRecording = localStorage.getItem('tempRecording');
          if (cachedRecording) {
            try {
              const response = await fetch(cachedRecording);
              const cachedBlob = await response.blob();
              if (cachedBlob.size > 0) {
                const formData = new FormData();
                formData.append('audio', cachedBlob, 'call.webm');
                formData.append('transcript', transcriptText);
                formData.append('callData', JSON.stringify(callData));

                const retryResponse = await fetch('/api/emergency-calls/save', {
                  method: 'POST',
                  body: formData,
                });

                if (retryResponse.ok) {
                  const retryResult = await retryResponse.json();

                  // Process transcript after successful save
                  if (retryResult.id) {
                    await fetch(`/api/emergency-calls/process-transcript/${retryResult.id}`, {
                      method: 'POST'
                    });
                  }
                }
              }
            } catch (cacheErr) {
              console.error('Failed to save from cache:', cacheErr);
            }
          }
          alert('Call was disconnected but failed to save recording. Please check the console for details.');
        }
      } else {
        // Create a minimal call record without audio
        try {
          await fetch('/api/emergency-calls/save', {
            method: 'POST',
            body: JSON.stringify({
              ...callData,
              description: 'Call disconnected without recording',
              transcript: transcriptText
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          });
        } catch (err) {
          console.error('Failed to save minimal call record:', err);
        }
      }
    } catch (error) {
      console.error('Error during disconnection:', error);
      alert('An error occurred during disconnection. Please check the console for details.');
    } finally {
      setIsDisconnecting(false);
      setIsAIFinished(false);
      setShowRecordingStatus(false);
    }
  };

  // Add missing functions
  const updateSession = (shouldTriggerResponse: boolean = false) => {
    if (sdkClientRef.current) {
      if (shouldTriggerResponse) {
        const id = uuidv4().slice(0, 32);
        addTranscriptMessage(id, "user", "hi", true);
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            id,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hi" }],
          },
        });
        sendClientEvent({ type: "response.create" });
      }

      const client = sdkClientRef.current;
      if (client) {
        try {
          client.sendEvent({
            type: 'session.update',
            session: {
              turn_detection: {
                type: 'server_vad',
                threshold: 0.9,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
              },
            },
          });
        } catch (err) {
          console.warn('Failed to update session', err);
        }
      }
    }
  };

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    if (sdkClientRef.current) {
      sdkClientRef.current.interrupt();
    }

    if (!sdkClientRef.current) {
      console.error('SDK client not available');
      return;
    }

    try {
      sdkClientRef.current.sendUserText(userText.trim());
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }

    setUserText("");
  };

  const onToggleConnection = async () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      await handleDisconnect();
    } else {
      connectToRealtime();
    }
  };

  // Add recording status indicator to the UI
  const ttsPlayedFor = useRef(new Set());
  return (
    <div className="text-base flex flex-col h-screen bg-background text-foreground relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center bg-background border-b border-border">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '8px 16px',
            display: 'inline-block',
            boxShadow: '0 2px 8px rgba(255, 107, 53, 0.20)'
          }}>
            <Image
              src="/911reality-logo.png"
              alt="911 Reality Logo"
              width={150}
              height={50}
              className="mr-2"
              style={{ display: 'block' }}
            />
          </div>
          <div className="ml-6 text-reality-gray">
            911 Reality <span className="text-reality-orange font-bold">Call Simulator</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          downloadRecording={downloadRecording}
          canSend={
            sessionStatus === "CONNECTED" &&
            sdkClientRef.current != null
          }
        />

        {/* <Events isExpanded={isEventsPaneExpanded} /> */}
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isDisconnecting={isDisconnecting}
      />

      {showRecordingStatus && (
        <div className="fixed top-4 right-4 bg-reality-orange text-white px-4 py-2 rounded-full flex items-center gap-2 z-50 font-semibold">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
          RECORDING
        </div>
      )}
    </div>
  );
}

export default App;
