import { config } from '../config';

/**
 * YouTube URL validation and transcript fetching service
 *
 * Uses the YouTube innertube player API (iOS client) to obtain captions
 * URLs, then fetches and parses the timedtext XML to extract transcript
 * text. This approach is more reliable than page scraping because the
 * page-embedded captions URLs include experimental parameters (e.g.
 * exp=xpe) that cause empty responses when fetched server-side.
 */

// Valid YouTube URL patterns
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:[&?].*)?$/;

// Video ID format: 11 chars, alphanumeric + dash + underscore
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Innertube iOS client constants
const INNERTUBE_API_KEY = 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc';
const INNERTUBE_IOS_CLIENT_VERSION = '19.29.1';
const INNERTUBE_IOS_DEVICE_MODEL = 'iPhone16,2';
const INNERTUBE_IOS_USER_AGENT =
  `com.google.ios.youtube/${INNERTUBE_IOS_CLIENT_VERSION} (${INNERTUBE_IOS_DEVICE_MODEL}; U; CPU iOS 17_5_1 like Mac OS X;)`;

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
 * Fetch the player response from the innertube API using the iOS client.
 *
 * The iOS client is used because:
 *  1. It reliably returns captions data with working URLs.
 *  2. The WEB client's page-embedded captions URLs include an `exp=xpe`
 *     parameter that causes YouTube to return empty responses when
 *     fetched from a server context.
 *  3. The iOS client does not require authentication or cookies.
 */
async function fetchPlayerResponse(videoId: string): Promise<Record<string, unknown>> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_IOS_USER_AGENT,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: INNERTUBE_IOS_CLIENT_VERSION,
          deviceModel: INNERTUBE_IOS_DEVICE_MODEL,
          hl: 'en',
        },
      },
      videoId,
      contentCheckOk: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Innertube player API returned HTTP ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

/**
 * Extract the captions base URL from the player response.
 * Navigates the nested structure:
 *   captions.playerCaptionsTracklistRenderer.captionTracks[].baseUrl
 *
 * Prefers English tracks but falls back to the first available track.
 */
function extractCaptionsUrl(playerResponse: Record<string, unknown>): string | null {
  try {
    const captions = (playerResponse as any)?.captions;
    if (!captions) return null;

    const tracklistRenderer = captions?.playerCaptionsTracklistRenderer;
    if (!tracklistRenderer) return null;

    const captionTracks = tracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;

    // Prefer English, fall back to the first available track
    const englishTrack = captionTracks.find(
      (track: any) => track.languageCode === 'en' || track.languageCode?.startsWith('en')
    );

    const track = englishTrack || captionTracks[0];
    return track?.baseUrl || null;
  } catch {
    return null;
  }
}

/**
 * Check the playability status from the player response and throw
 * a descriptive error if the video is not playable.
 */
function checkPlayability(playerResponse: Record<string, unknown>): void {
  const status = (playerResponse as any)?.playabilityStatus?.status;
  const reason = (playerResponse as any)?.playabilityStatus?.reason;

  switch (status) {
    case 'OK':
      return;
    case 'ERROR':
      throw new Error(reason || 'Video is unavailable (it may be private or deleted)');
    case 'LOGIN_REQUIRED':
      throw new Error('Video requires login (it may be private or age-restricted)');
    case 'UNPLAYABLE':
      throw new Error(reason || 'Video is unplayable (it may be region-restricted or removed)');
    case 'LIVE_STREAM_OFFLINE':
      throw new Error('This is a live stream that is currently offline');
    default:
      if (status && status !== 'OK') {
        throw new Error(reason || `Video is not available (status: ${status})`);
      }
  }
}

/**
 * Parse the timedtext XML response into an array of text segments.
 * The XML structure is: <transcript><text start="0" dur="5.2">Hello</text>...</transcript>
 *
 * Uses regex parsing to avoid needing a full XML/DOM parser dependency.
 */
function parseTimedTextXml(xml: string): string[] {
  const segments: string[] = [];
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;

  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(xml)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    // Decode common HTML entities
    let text = decodeHtmlEntities(raw);
    text = text.trim();
    if (text) {
      segments.push(text);
    }
  }

  return segments;
}

/**
 * Decode HTML entities commonly found in YouTube transcript XML.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\n/g, ' ');
}

/**
 * Fetch the raw transcript text for a given video ID.
 *
 * Uses the innertube iOS player API to obtain a working captions URL,
 * then fetches and parses the timedtext XML.
 */
async function fetchRawTranscript(videoId: string): Promise<string> {
  const playerResponse = await fetchPlayerResponse(videoId);

  // Check if the video is playable
  checkPlayability(playerResponse);

  const captionsUrl = extractCaptionsUrl(playerResponse);
  if (!captionsUrl) {
    throw new Error('No captions available for this video');
  }

  // Fetch the timedtext XML
  const transcriptResponse = await fetch(captionsUrl);
  if (!transcriptResponse.ok) {
    throw new Error(`Failed to fetch transcript XML (HTTP ${transcriptResponse.status})`);
  }

  const xml = await transcriptResponse.text();
  const segments = parseTimedTextXml(xml);

  if (segments.length === 0) {
    throw new Error('Transcript XML contained no text segments');
  }

  // Join segments with spaces, matching the Python CLI's text format output
  return segments.join(' ');
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
    const transcript = await fetchRawTranscript(videoId);

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
