import { useRef, useState, useCallback } from "react";
import { convertWebMBlobToWav } from "../lib/audioUtils";

function useAudioDownload() {
  // Ref to store the MediaRecorder instance.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Ref to collect all recorded Blob chunks.
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const lastSaveTimeRef = useRef<number>(Date.now());

  /**
   * Starts recording by combining the provided remote stream with
   * the microphone audio.
   * @param remoteStream - The remote MediaStream (e.g., from the audio element).
   */
  const startRecording = async (remoteStream: MediaStream) => {
    try {
      setRecordingError(null);
      let micStream: MediaStream;
      
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error("Error getting microphone stream:", err);
        setRecordingError("Failed to access microphone");
        micStream = new MediaStream();
      }

      // Create an AudioContext to merge the streams.
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Connect the remote audio stream.
      try {
        const remoteSource = audioContext.createMediaStreamSource(remoteStream);
        remoteSource.connect(destination);
      } catch (err) {
        console.error("Error connecting remote stream:", err);
        setRecordingError("Failed to connect remote audio stream");
      }

      // Connect the microphone audio stream.
      try {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);
      } catch (err) {
        console.error("Error connecting microphone stream:", err);
        setRecordingError("Failed to connect microphone stream");
      }

      const options = { mimeType: "audio/webm" };
      try {
        const mediaRecorder = new MediaRecorder(destination.stream, options);
        
        mediaRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
            
            // Auto-save every 30 seconds
            const now = Date.now();
            if (now - lastSaveTimeRef.current > 30000) {
              saveRecordingToCache();
              lastSaveTimeRef.current = now;
            }
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          setRecordingError("Recording error occurred");
        };

        mediaRecorder.start(1000); // Collect data every second
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
      } catch (err) {
        console.error("Error starting MediaRecorder:", err);
        setRecordingError("Failed to start recording");
      }
    } catch (err) {
      console.error("Error in startRecording:", err);
      setRecordingError("Failed to initialize recording");
    }
  };

  /**
   * Stops the MediaRecorder, if active.
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        setIsRecording(false);
        
        // Final save to cache
        saveRecordingToCache();
      } catch (err) {
        console.error("Error stopping recording:", err);
        setRecordingError("Failed to stop recording properly");
      }
    }
  }, []);

  const saveRecordingToCache = useCallback(() => {
    try {
      const audioBlob = getAudioBlob();
      if (audioBlob && audioBlob.size > 0) {
        const url = URL.createObjectURL(audioBlob);
        localStorage.setItem('tempRecording', url);
        console.log('Recording saved to cache');
      }
    } catch (err) {
      console.error("Error saving to cache:", err);
    }
  }, []);

  const getAudioBlob = useCallback(() => {
    if (recordedChunksRef.current.length === 0) return null;
    return new Blob(recordedChunksRef.current, { type: 'audio/webm' });
  }, []);

  /**
   * Initiates download of the recording after converting from WebM to WAV.
   * If the recorder is still active, we request its latest data before downloading.
   */
  const downloadRecording = async () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.requestData();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const audioBlob = getAudioBlob();
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("No recording data available");
      }

      const wavBlob = await convertWebMBlobToWav(audioBlob);
      const url = URL.createObjectURL(wavBlob);
      const now = new Date().toISOString().replace(/[:.]/g, "-");

      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `realtime_agents_audio_${now}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Error downloading recording:", err);
      setRecordingError("Failed to download recording");
    }
  };

  return {
    startRecording,
    stopRecording,
    downloadRecording,
    getAudioBlob,
    isRecording,
    recordingError,
    saveRecordingToCache
  };
}

export default useAudioDownload; 