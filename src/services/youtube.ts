import { config } from '../config';

/**
 * YouTube URL validation and transcript fetching service
 *
 * Security: Uses array args in Bun.spawn to prevent command injection
 */

// Valid YouTube URL patterns
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:[&?].*)?$/;

// Video ID format: 11 chars, alphanumeric + dash + underscore
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface VideoMetadata {
  title: string;
  channel: string;
  thumbnailUrl?: string;
}

export interface TranscriptResult {
  success: true;
  videoId: string;
  transcript: string;
  metadata?: VideoMetadata;
}

export interface TranscriptError {
  success: false;
  error: string;
}

export type TranscriptResponse = TranscriptResult | TranscriptError;

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  if (match && match[1]) {
    return match[1];
  }

  // Maybe it's already just a video ID
  if (VIDEO_ID_REGEX.test(url)) {
    return url;
  }

  return null;
}

/**
 * Validate that a string is a valid YouTube URL or video ID
 */
export function isValidYouTubeInput(input: string): boolean {
  return extractVideoId(input) !== null;
}

/**
 * Fetch transcript for a YouTube video
 *
 * @param urlOrId - YouTube URL or video ID
 * @returns Transcript text or error
 */
export async function fetchTranscript(urlOrId: string): Promise<TranscriptResponse> {
  const videoId = extractVideoId(urlOrId);

  if (!videoId) {
    return {
      success: false,
      error: 'Invalid YouTube URL or video ID',
    };
  }

  try {
    // SECURITY: Use array args to prevent command injection
    // Never use shell: true or string interpolation
    const proc = Bun.spawn([config.ytCliPath, videoId, '--format', 'text'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error(`yt CLI error (exit ${exitCode}):`, stderr);
      return {
        success: false,
        error: stderr || `Failed to fetch transcript (exit code ${exitCode})`,
      };
    }

    const transcript = stdout.trim();

    if (!transcript) {
      return {
        success: false,
        error: 'No transcript available for this video',
      };
    }

    // Check transcript length limit
    if (transcript.length > config.maxTranscriptLength) {
      return {
        success: false,
        error: `Transcript too long (${transcript.length} chars, max ${config.maxTranscriptLength})`,
      };
    }

    // Fetch video metadata (non-blocking, best effort)
    const metadata = await fetchVideoMetadata(videoId);

    return {
      success: true,
      videoId,
      transcript,
      metadata,
    };
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching transcript',
    };
  }
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Fetch video metadata using YouTube oEmbed API
 * Free, no API key required
 */
export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata | undefined> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url);

    if (!res.ok) {
      return undefined;
    }

    const data = (await res.json()) as OEmbedResponse;

    return {
      title: data.title || 'Unknown Video',
      channel: data.author_name || 'Unknown Channel',
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (error) {
    console.error('Failed to fetch video metadata:', error);
    return undefined;
  }
}
