// Utility for ElevenLabs Text-to-Speech integration
// See: https://docs.elevenlabs.io/api-reference/text-to-speech

// Place your ElevenLabs API key in an environment variable, e.g., process.env.ELEVENLABS_API_KEY
// Place your desired voice ID (elderly female) below or pass as a parameter

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "YOUR_ELEVENLABS_API_KEY_HERE"; // <-- Replace or set in .env.local
const DEFAULT_VOICE_ID = "y1adqrqs4jNaANXsIZnD"; // Test voice ID for differentiation

// Simple queue to prevent concurrent TTS requests
class TTSQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        await request();
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    this.processing = false;
  }
}

const ttsQueue = new TTSQueue();

/**
 * Fetches TTS audio from the local API route for ElevenLabs for the given text.
 * @param {string} text - The text to synthesize.
 * @param {string} [voiceId] - Optional: Override the default voice ID.
 * @returns {Promise<Blob>} - The audio as a Blob (MPEG audio).
 */
export async function fetchElevenLabsTTS(text: string, voiceId?: string): Promise<Blob> {
  // Add to queue to prevent concurrent requests
  return ttsQueue.add(async () => {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));

      // Handle specific TTS errors gracefully
      if (response.status === 503) {
        console.log("TTS temporarily unavailable:", errorData.message);
        // Return empty blob to prevent errors but skip audio playback
        return new Blob([], { type: 'audio/mpeg' });
      }

      throw new Error(`TTS API failed: ${response.status} ${JSON.stringify(errorData)}`);
    }

    return await response.blob();
  });
}