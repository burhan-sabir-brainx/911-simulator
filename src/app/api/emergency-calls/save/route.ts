import { NextResponse } from "next/server";
import { EmergencyCallModel } from "@/models/EmergencyCall";
import { uploadAudioFile, uploadTranscriptFile } from "@/services/blobStorage";

export async function POST(request: Request) {
  try {
    console.log('Starting emergency call save process...');
    
    // Check if the request is JSON or FormData
    const contentType = request.headers.get('content-type') || '';
    let callData;
    let audio: Blob | null = null;
    let transcript: string | null = null;
    
    if (contentType.includes('application/json')) {
      // Handle JSON request (minimal call record)
      const jsonData = await request.json();
      callData = jsonData;
      transcript = jsonData.description || '';
    } else {
      // Handle FormData request (full call record with audio)
      const formData = await request.formData();
      audio = formData.get("audio") as Blob;
      transcript = formData.get("transcript") as string;
      const callDataRaw = formData.get("callData");
      
      if (!callDataRaw || typeof callDataRaw !== "string") {
        console.error('Missing or invalid call data');
        return NextResponse.json({ error: "Missing or invalid call data" }, { status: 400 });
      }
      
      callData = JSON.parse(callDataRaw);
    }

    console.log('Received data:', {
      hasAudio: !!audio,
      hasTranscript: !!transcript,
      hasCallData: !!callData,
      audioSize: audio ? audio.size : 0,
      transcriptLength: transcript ? transcript.length : 0
    });

    let recordingUrl: string | null = null;
    let transcriptUrl: string | null = null;

    // Upload files if available
    if (audio && transcript) {
      try {
        // Generate unique filenames with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const audioFileName = `call-${timestamp}.webm`;
        const transcriptFileName = `transcript-${timestamp}.txt`;

        console.log('Starting file uploads...');
        
        // Upload files sequentially to ensure proper error handling
        try {
          console.log('Uploading audio file...');
          recordingUrl = await uploadAudioFile(audio, audioFileName);
          console.log('Audio file uploaded successfully:', recordingUrl);
        } catch (error) {
          console.error('Failed to upload audio file:', error);
          // Continue with transcript upload even if audio fails
        }

        try {
          console.log('Uploading transcript file...');
          transcriptUrl = await uploadTranscriptFile(transcript, transcriptFileName);
          console.log('Transcript file uploaded successfully:', transcriptUrl);
        } catch (error) {
          console.error('Failed to upload transcript file:', error);
          // Continue with call record creation even if transcript fails
        }
      } catch (error) {
        console.error('Error during file uploads:', error);
        // Continue with saving the call record even if file upload fails
      }
    }

    // Create Emergency Call record
    const now = new Date();
    const startTime = new Date(callData.start_time);
    const durationSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    console.log('Creating emergency call record with data:', {
      ...callData,
      recording_url: recordingUrl,
      transcript_url: transcriptUrl,
      end_time: now,
      duration: durationSeconds
    });

    const emergencyCall = await EmergencyCallModel.create({
      ...callData,
      call_type: callData.call_type || 'other',
      call_status: 'completed',
      recording_url: recordingUrl,
      transcript_url: transcriptUrl,
      end_time: now,
      duration: durationSeconds
    });

    return NextResponse.json({
      ...emergencyCall,
      recording_url: recordingUrl,
      transcript_url: transcriptUrl
    }, { status: 201 });

  } catch (error) {
    console.error("Error saving emergency call:", error);
    return NextResponse.json({ 
      error: "Failed to save emergency call",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
