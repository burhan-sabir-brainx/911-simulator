import { put } from "@vercel/blob";

export async function uploadAudioFile(audioBlob: Blob, fileName: string): Promise<string> {
  try {
    console.log('Starting audio file upload:', { fileName, size: audioBlob.size });
    
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Invalid audio blob: empty or zero size');
    }

    const { url } = await put(`recordings/${fileName}`, audioBlob, {
      access: "public",
      contentType: "audio/webm",
      addRandomSuffix: true // Add random suffix to prevent collisions
    });

    console.log('Audio file uploaded successfully:', { url });
    return url;
  } catch (error) {
    console.error("Error uploading audio:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw new Error(`Failed to upload audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function uploadTranscriptFile(transcriptText: string, fileName: string): Promise<string> {
  try {
    console.log('Starting transcript file upload:', { fileName, textLength: transcriptText.length });
    
    if (!transcriptText || transcriptText.length === 0) {
      throw new Error('Invalid transcript: empty text');
    }

    const transcriptBlob = new Blob([transcriptText], { type: "text/plain" });
    const { url } = await put(`transcripts/${fileName}`, transcriptBlob, {
      access: "public",
      contentType: "text/plain",
      addRandomSuffix: true // Add random suffix to prevent collisions
    });

    console.log('Transcript file uploaded successfully:', { url });
    return url;
  } catch (error) {
    console.error("Error uploading transcript:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw new Error(`Failed to upload transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
