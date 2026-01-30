import { config } from '../config';

/**
 * Kokoro TTS Service
 *
 * Interfaces with local Kokoro server (OpenAI-compatible API)
 * Endpoint: /v1/audio/speech
 */

export interface Voice {
  id: string;
  name: string;
}

export interface SynthesisResult {
  success: true;
  audioBuffer: ArrayBuffer;
  contentType: string;
}

export interface SynthesisError {
  success: false;
  error: string;
}

export type SynthesisResponse = SynthesisResult | SynthesisError;

// Known Kokoro voices (can be extended)
// These are validated against to prevent path traversal
const KNOWN_VOICES: Voice[] = [
  { id: 'af_sky', name: 'Sky (Female)' },
  { id: 'af_bella', name: 'Bella (Female)' },
  { id: 'af_nicole', name: 'Nicole (Female)' },
  { id: 'af_sarah', name: 'Sarah (Female)' },
  { id: 'am_adam', name: 'Adam (Male)' },
  { id: 'am_michael', name: 'Michael (Male)' },
  { id: 'bf_emma', name: 'Emma (British Female)' },
  { id: 'bm_george', name: 'George (British Male)' },
];

/**
 * Get list of available voices
 * Returns hardcoded list - Kokoro doesn't have a voice listing endpoint
 */
export function getVoices(): Voice[] {
  return KNOWN_VOICES;
}

/**
 * Validate voice ID against known voices
 * SECURITY: Prevents path traversal via voice parameter
 */
export function isValidVoice(voiceId: string): boolean {
  return KNOWN_VOICES.some((v) => v.id === voiceId);
}

/**
 * Clean transcript text before TTS
 * Removes YouTube artifacts that don't sound good when spoken
 */
export function cleanTranscript(text: string): string {
  return (
    text
      // Remove common YouTube transcript artifacts
      .replace(/\[Music\]/gi, '')
      .replace(/\[Applause\]/gi, '')
      .replace(/\[Laughter\]/gi, '')
      .replace(/\(Music\)/gi, '')
      .replace(/\(Applause\)/gi, '')
      .replace(/\(Laughter\)/gi, '')
      .replace(/♪[^♪]*♪/g, '') // Music notes
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Synthesize speech from text using Kokoro TTS
 *
 * @param text - Text to synthesize
 * @param voiceId - Voice ID (must be validated first)
 * @returns Audio buffer or error
 */
export async function synthesize(
  text: string,
  voiceId: string
): Promise<SynthesisResponse> {
  // Validate voice
  if (!isValidVoice(voiceId)) {
    return {
      success: false,
      error: `Invalid voice: ${voiceId}`,
    };
  }

  // Clean the transcript
  const cleanedText = cleanTranscript(text);

  if (!cleanedText) {
    return {
      success: false,
      error: 'No text to synthesize after cleaning',
    };
  }

  try {
    const response = await fetch(`${config.kokoroUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: cleanedText,
        voice: voiceId,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Kokoro TTS error (${response.status}):`, errorText);
      return {
        success: false,
        error: `TTS server error: ${response.status} - ${errorText}`,
      };
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    return {
      success: true,
      audioBuffer,
      contentType,
    };
  } catch (error) {
    console.error('Failed to synthesize speech:', error);

    // Check for connection refused (Kokoro not running)
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return {
        success: false,
        error: 'TTS server not available. Is Kokoro running?',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown TTS error',
    };
  }
}
