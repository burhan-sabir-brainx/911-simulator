'use client';

import React, { useState, useEffect } from 'react';
import App from '../App';
import { TranscriptProvider } from '@/app/contexts/TranscriptContext';
import { EventProvider } from '@/app/contexts/EventContext';
import { emergencyCallScenarios, EmergencyScenarioConfig } from '@/app/agentConfigs/emergencyCall';
import Sidebar from './Sidebar';
import * as XLSX from 'xlsx';

const EmergencyCallSimulator: React.FC = () => {
    const [isCallActive, setIsCallActive] = useState(false);
    const [callStartTime, setCallStartTime] = useState<Date | null>(null);
    const [callDuration, setCallDuration] = useState('00:00');
    const [showAudioModal, setShowAudioModal] = useState(false);
    const [audioUrl, setAudioUrl] = useState('');
    const [showTranscriptionModal, setShowTranscriptionModal] = useState(false);
    const [transcriptText, setTranscriptText] = useState('');
    const [micPermission, setMicPermission] = useState<
        'granted' | 'denied' | 'prompt'
    >('prompt');
    const [micStream, setMicStream] = useState<MediaStream | null>(null);
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isStartingCall, setIsStartingCall] = useState(false);
    const [shouldRefreshHistory, setShouldRefreshHistory] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    const [selectedTab, setSelectedTab] = useState<'history' | 'scenarios'>('scenarios');

    // Function to check microphone permission
    const checkMicPermission = async () => {
        try {
            const permission = await navigator.permissions.query({
                name: 'microphone' as PermissionName,
            });
            setMicPermission(permission.state);

            permission.onchange = () => {
                setMicPermission(permission.state);
            };
        } catch (error) {
            console.error('Error checking microphone permission:', error);
        }
    };

    // Function to request microphone access
    const requestMicAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            setMicStream(stream);
            setMicPermission('granted');
            return stream;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            setMicPermission('denied');
            throw error;
        }
    };

    // Load call history with retry logic and better error handling
    const loadCallHistory = async () => {
        try {
            setIsLoading(true);
            console.log('Fetching call history...');

            const response = await fetch('/api/emergency-calls/all', {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const calls = await response.json();
            console.log('Call history loaded:', calls);

            setCallHistory(calls || []);
            setRetryCount(0); // Reset retry count on success
        } catch (error) {
            console.error('Failed to load call history:', error);
            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
                setRetryCount(prev => prev + 1);
                setTimeout(() => {
                    loadCallHistory();
                }, RETRY_DELAY * (retryCount + 1)); // Exponential backoff
            } else {
                console.error('Max retries reached. Giving up.');
                setCallHistory([]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Manual refresh function
    const handleManualRefresh = () => {
        setRetryCount(0);
        loadCallHistory();
    };

    useEffect(() => {
        checkMicPermission();
        loadCallHistory();
    }, []);

    useEffect(() => {
        if (shouldRefreshHistory) {
            loadCallHistory();
            setShouldRefreshHistory(false);
        }
    }, [shouldRefreshHistory]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCallActive && callStartTime) {
            interval = setInterval(() => {
                const now = new Date();
                const diff = Math.floor((now.getTime() - callStartTime.getTime()) / 1000);
                const minutes = Math.floor(diff / 60);
                const seconds = diff % 60;
                setCallDuration(
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isCallActive, callStartTime]);

    const handleStartScenarioCall = async (scenario: EmergencyScenarioConfig) => {
        if (micPermission === 'denied') {
            alert(
                'Microphone access is required for 911 call simulation. Please enable microphone access in your browser settings and refresh the page.'
            );
            return;
        }

        try {
            setIsStartingCall(true);

            if (micPermission === 'prompt') {
                await requestMicAccess();
            }

            // Build the URL with the scenario key
            const url = new URL(window.location.href);
            url.searchParams.set('agentConfig', 'emergencyCall');
            url.searchParams.set('scenarioKey', scenario.key);

            // Update the URL without causing a page reload
            window.history.pushState({}, '', url.toString());

            setCallStartTime(new Date());
            setIsCallActive(true);
        } catch (error) {
            console.error('Failed to start call:', error);
            alert(
                'Failed to start call. Please check your microphone permissions and try again.'
            );
        } finally {
            setIsStartingCall(false);
        }
    };

    const handleEndCall = async () => {
        setIsCallActive(false);
        setCallStartTime(null);
        if (micStream) {
            micStream.getTracks().forEach((track) => track.stop());
            setMicStream(null);
        }

        try {
            // Add a longer delay to ensure the call is fully saved
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Fetch the most recent call
            const response = await fetch('/api/emergency-calls/all', {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });
            const calls = await response.json();

            if (calls && calls.length > 0) {
                const mostRecentCall = calls[0];
                console.log('Found most recent call:', mostRecentCall);

                // Verify the call has a transcript URL before processing
                if (!mostRecentCall.transcript_url) {
                    console.warn('Most recent call missing transcript_url:', mostRecentCall);
                    setShouldRefreshHistory(true);
                    return;
                }

                // Check if the transcript_url is valid
                try {
                    const transcriptResponse = await fetch(mostRecentCall.transcript_url);
                    if (!transcriptResponse.ok) {
                        console.warn('Transcript URL not accessible:', mostRecentCall.transcript_url);
                        setShouldRefreshHistory(true);
                        return;
                    }
                } catch (err) {
                    console.warn('Error accessing transcript URL:', err);
                    setShouldRefreshHistory(true);
                    return;
                }

                // If we get here, the call data looks good
                console.log('Call data appears complete, refreshing history');
                setShouldRefreshHistory(true);
            } else {
                console.log('No calls found, will retry shortly');
                // Retry after a short delay
                setTimeout(() => {
                    setShouldRefreshHistory(true);
                }, 3000);
            }
        } catch (error) {
            console.error('Error checking call completion:', error);
            // Still refresh the history in case of errors
            setShouldRefreshHistory(true);
        }
    };

    const openAudioModal = (url: string) => {
        setAudioUrl(url);
        setShowAudioModal(true);
    };

    const openTranscriptionModal = async (url: string) => {
        try {
            const response = await fetch(url);
            const text = await response.text();
            setTranscriptText(text);
            setShowTranscriptionModal(true);
        } catch (error) {
            console.error('Error loading transcription:', error);
            alert('Failed to load transcription');
        }
    };

    const handleExportToExcel = () => {
        if (callHistory.length === 0) {
            alert('No call history to export');
            return;
        }

        // Prepare data for Excel export
        const excelData = callHistory.map((call, index) => ({
            'Call #': call.id || index + 1,
            'Date': call.start_time ? new Date(call.start_time).toLocaleDateString() : 'N/A',
            'Time': call.start_time ? new Date(call.start_time).toLocaleTimeString() : 'N/A',
            'Duration': call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : 'N/A',
            'Caller Name': call.caller_name || 'Unknown',
            'Caller Phone': call.caller_phone || 'N/A',
            'Caller Address': call.caller_address || 'N/A',
            'Description': call.description || 'Emergency Call',
            'Priority Level': call.priority_level || 'N/A',
            'Call Type': call.call_type || 'emergency',
            'Call Status': call.call_status || 'completed'
        }));

        // Create workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Call History');

        // Generate filename with current date
        const now = new Date();
        const filename = `911_call_history_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.xlsx`;

        // Save the file
        XLSX.writeFile(wb, filename);
    };

    const parseTranscriptToChat = (transcript: string) => {
        // Split transcript into lines and parse each line
        const lines = transcript.split('\n').filter(line => line.trim());
        const chatMessages = [];
        let currentRole = 'ai_agent'; // Start with caller (AI agent) as first speaker

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip empty lines and separators
            if (!trimmedLine || trimmedLine.match(/^[\-\=\*]{3,}|^transcript|^recording|^call|^session/i)) {
                continue;
            }

            // Extract timestamp if present
            let timestamp = null;
            let messageText = trimmedLine;
            const timestampMatch = trimmedLine.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*(.+)/i);
            if (timestampMatch) {
                timestamp = timestampMatch[1];
                messageText = timestampMatch[2].trim();
            }

            // Clear role indicators - Student Dispatcher (911 Operator)
            const studentMatch = messageText.match(/^(911|Dispatcher|Emergency|Operator|Student|Trainee|System|Bot|Reality):\s*(.+)/i);

            // Clear role indicators - AI Emergency Caller
            const aiMatch = messageText.match(/^(Caller|User|Person|Human|Client|AI|Agent|Assistant|Emergency\s*Caller|You):\s*(.+)/i);

            if (studentMatch) {
                // Explicitly marked as student/dispatcher
                currentRole = 'student';
                chatMessages.push({
                    role: 'student',
                    message: studentMatch[2].trim(),
                    timestamp: timestamp
                });
            } else if (aiMatch) {
                // Explicitly marked as caller/AI
                currentRole = 'ai_agent';
                chatMessages.push({
                    role: 'ai_agent',
                    message: aiMatch[2].trim(),
                    timestamp: timestamp
                });
            } else {
                // No explicit role - use smart detection based on content
                const isDispatcherMessage = messageText.match(/^(911.*emergency|what.*emergency|where.*located|what's.*address|how many|are you|do you|can you|is there|stay.*line|help.*way|officers.*way|paramedics.*way|fire.*way|remain calm|stay with me|i need you to|tell me|describe|what happened|how old|when did|emergency services)/i);

                const isCallerMessage = messageText.match(/^(help|please|i need|there's|someone|my|i'm|oh|hurry|quick|emergency|fire|accident|injured|hurt|bleeding|unconscious|something.*wrong|i think|i see|i hear|happened|occurred|hello|hi|yes|no|it's|at|in|on|by|near|about|around)/i);

                if (isDispatcherMessage && !isCallerMessage) {
                    currentRole = 'student';
                } else if (isCallerMessage && !isDispatcherMessage) {
                    currentRole = 'ai_agent';
                } else {
                    // If still unclear, alternate roles to ensure conversation flow
                    if (chatMessages.length > 0) {
                        const lastRole = chatMessages[chatMessages.length - 1].role;
                        currentRole = lastRole === 'ai_agent' ? 'student' : 'ai_agent';
                    }
                    // else keep current role (starts with ai_agent)
                }

                chatMessages.push({
                    role: currentRole,
                    message: messageText,
                    timestamp: timestamp
                });
            }
        }

        // Ensure we have messages and they alternate properly
        if (chatMessages.length > 0) {
            console.log('Parsed chat messages:', chatMessages.map(m => ({ role: m.role, preview: m.message.substring(0, 50) + '...' })));
        }

        return chatMessages;
    };

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            {/* Emergency Call Header - Fixed */}
            <div className="bg-reality-orange p-4 text-center fixed top-0 left-0 right-0 z-50">
                <h1 className="text-2xl font-bold text-white">
                    911 Reality Training Simulator
                </h1>
                {isCallActive && (
                    <div className="mt-2">
                        <span className="text-white font-semibold">
                            Call Duration: {callDuration}
                        </span>
                    </div>
                )}
            </div>

            {/* Main Content - with top padding for fixed header */}
            <div className="flex-1 relative pt-20">
                {!isCallActive ? (
                    <div className="h-full flex">
                        {/* Sidebar - Fixed */}
                        <div className="fixed left-0 top-20 bottom-0 z-40">
                            <Sidebar
                                selectedTab={selectedTab}
                                onTabChange={setSelectedTab}
                            />
                        </div>

                        {/* Main Content Area - Scrollable with left margin for fixed sidebar */}
                        <div className="flex-1 flex flex-col ml-64">
                            <div className="flex-1 p-6 overflow-y-auto">
                                <div className="max-w-4xl mx-auto">
                                    <div className="history-container bg-card rounded-lg p-6">
                                        {/* Tab Content */}
                                        {selectedTab === 'history' ? (
                                            <>
                                                <div className="history-header flex justify-between items-center mb-6">
                                                    <h2 className="text-xl font-semibold text-foreground">
                                                        Call History
                                                    </h2>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={handleExportToExcel}
                                                            className="export-button bg-reality-gray hover:bg-reality-orange hover:text-white text-white border border-black px-3 py-1 rounded flex items-center gap-1 font-medium transition-colors"
                                                            disabled={isLoading || callHistory.length === 0}
                                                        >
                                                            <span role="img" aria-label="export">
                                                                📊
                                                            </span>
                                                            Export Excel
                                                        </button>
                                                        <button
                                                            onClick={handleManualRefresh}
                                                            className="refresh-button bg-reality-gray hover:bg-reality-orange hover:text-white text-white border border-black px-3 py-1 rounded flex items-center gap-1 font-medium transition-colors"
                                                            disabled={isLoading}
                                                        >
                                                            {isLoading ? (
                                                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                                                            ) : (
                                                                <span role="img" aria-label="refresh">
                                                                    🔄
                                                                </span>
                                                            )}
                                                            Refresh
                                                        </button>
                                                    </div>
                                                </div>
                                                {isLoading ? (
                                                    <div className="flex justify-center items-center py-12">
                                                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
                                                    </div>
                                                ) : retryCount > 0 ? (
                                                    <div className="text-center py-12">
                                                        <p className="text-red-500 mb-4">
                                                            Failed to load call history after {retryCount} attempts
                                                        </p>
                                                        <button
                                                            onClick={() => {
                                                                setRetryCount(0);
                                                                setShouldRefreshHistory(true);
                                                            }}
                                                            className="bg-reality-orange text-white px-4 py-2 rounded hover:bg-reality-amber transition-colors font-semibold"
                                                        >
                                                            Try Again
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="history-list space-y-4">
                                                        {callHistory.length === 0 ? (
                                                            <div className="text-center py-12 text-gray-400">
                                                                No call history available
                                                            </div>
                                                        ) : (
                                                            callHistory.map((call) => (
                                                                <div
                                                                    key={call.id}
                                                                    className="history-item bg-reality-gray p-4 rounded-lg border border-border"
                                                                >
                                                                    <p className="font-medium mb-2 text-white">
                                                                        Call #{call.id} -{' '}
                                                                        {call.description || 'Emergency Call'}
                                                                    </p>
                                                                    <div className="call-actions flex gap-2">
                                                                        <button
                                                                            className="audio-button bg-reality-gray hover:bg-reality-orange hover:text-white text-white border border-black px-3 py-1 rounded flex items-center gap-1 font-medium transition-colors"
                                                                            onClick={() =>
                                                                                openAudioModal(call.recording_url)
                                                                            }
                                                                        >
                                                                            <span role="img" aria-label="audio">
                                                                                🔊
                                                                            </span>{' '}
                                                                            Audio
                                                                        </button>
                                                                        <button
                                                                            className="transcription-button bg-reality-gray hover:bg-reality-orange hover:text-white text-white border border-black px-3 py-1 rounded flex items-center gap-1 font-medium transition-colors"
                                                                            onClick={() =>
                                                                                openTranscriptionModal(call.transcript_url)
                                                                            }
                                                                        >
                                                                            <span role="img" aria-label="transcript">
                                                                                📝
                                                                            </span>{' '}
                                                                            Transcription
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className="scenarios-header flex justify-between items-center mb-6">
                                                    <h2 className="text-xl font-semibold text-foreground">Scenarios</h2>
                                                </div>
                                                <div className="scenarios-list space-y-4">
                                                    {emergencyCallScenarios.map((scenario, index) => (
                                                        <div key={scenario.key} className="scenario-item bg-reality-gray p-4 rounded-lg border border-border flex items-center justify-between">
                                                            <div className="flex items-center">
                                                                <div>
                                                                    <span className="text-lg font-bold text-white">Case #{index + 1}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                className="start-scenario-button bg-reality-orange hover:bg-reality-amber text-white px-6 py-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                onClick={() => handleStartScenarioCall(scenario)}
                                                                disabled={isStartingCall}
                                                            >
                                                                {isStartingCall ? 'Starting...' : 'Start Call'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full">
                        <TranscriptProvider>
                            <EventProvider>
                                <App
                                    isCallActive={isCallActive}
                                    onCallEnd={handleEndCall}
                                    callStartTime={callStartTime}
                                />
                            </EventProvider>
                        </TranscriptProvider>
                    </div>
                )}
            </div>

            {/* Audio Modal */}
            {showAudioModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-card rounded-lg p-6 max-w-lg w-full border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-foreground">
                                Call Audio
                            </h3>
                            <button
                                onClick={() => setShowAudioModal(false)}
                                className="text-reality-orange hover:text-reality-amber text-2xl font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <audio controls src={audioUrl} className="w-full" />
                    </div>
                </div>
            )}

            {/* Transcript Modal */}
            {showTranscriptionModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-background rounded-lg shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col border border-border">
                        {/* Header */}
                        <div className="bg-reality-orange text-white p-6 rounded-t-lg">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-2xl font-bold">
                                        Training Session Transcript
                                    </h3>
                                    <p className="text-orange-100 mt-2 text-sm">
                                        911 Emergency Call Simulation - Student Training Session
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowTranscriptionModal(false)}
                                    className="text-white hover:text-orange-200 text-3xl font-bold hover:bg-black hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200"
                                    aria-label="Close modal"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>



                        {/* Chat Container */}
                        <div className="flex-1 overflow-y-auto bg-background p-6">
                            {parseTranscriptToChat(transcriptText).length > 0 ? (
                                parseTranscriptToChat(transcriptText).map((message, index) => (
                                    <div
                                        key={index}
                                        className={`w-full flex ${message.role === 'student' ? 'justify-start' : 'justify-end'} animate-fade-in mb-4`}
                                    >
                                        <div className={`flex ${message.role === 'student' ? 'flex-row' : 'flex-row-reverse'} items-start max-w-[75%] group`}>
                                            {/* Avatar */}
                                            <div className={`flex-shrink-0 w-10 h-10 rounded-full shadow-lg border-2 ${message.role === 'student'
                                                ? 'bg-reality-gray border-reality-orange'
                                                : 'bg-reality-orange border-reality-gray'
                                                } ${message.role === 'student' ? 'mr-3' : 'ml-3'}`}>
                                            </div>

                                            {/* Message Bubble Container */}
                                            <div className={`flex flex-col ${message.role === 'student' ? 'items-start' : 'items-end'} flex-1 min-w-0`}>
                                                {/* Message Content */}
                                                <div
                                                    className={`px-4 py-3 rounded-2xl shadow-md border-2 transition-all duration-200 group-hover:shadow-lg max-w-full break-words ${message.role === 'student'
                                                        ? 'bg-reality-gray text-white rounded-bl-sm border-reality-orange'
                                                        : 'bg-reality-orange text-white rounded-br-sm border-reality-gray'
                                                        }`}
                                                >
                                                    <div className="text-sm leading-relaxed font-medium whitespace-pre-wrap">
                                                        {message.message}
                                                        {message.timestamp && (
                                                            <span className="text-xs opacity-75 block mt-1">
                                                                {message.timestamp}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center">
                                    <div className="bg-background border-2 border-dashed border-border rounded-xl p-8 max-w-2xl mx-auto">
                                        <h4 className="font-bold mb-4 text-foreground text-lg">Raw Training Session Transcript</h4>
                                        <p className="text-secondary mb-6">Unable to parse conversation format. Displaying raw transcript data:</p>
                                        <div className="bg-card rounded-lg p-6 text-left border border-border">
                                            <div className="text-xs font-mono text-foreground whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
                                                {transcriptText || 'No transcript data available'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}


                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmergencyCallSimulator; 