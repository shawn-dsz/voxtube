import { config } from '../config';

/**
 * YouTube URL validation and transcript fetching service
 *
 * Uses the YouTube innertube player API with a multi-client fallback
 * strategy to obtain captions URLs, then fetches and parses the
 * timedtext XML to extract transcript text.
 *
 * Client priority:
 *   1. ANDROID: most reliable from a server context, not blocked by
 *      bot detection and returns working captions URLs
 *   2. IOS: good fallback for most content
 *   3. WEB: last resort, often returns UNPLAYABLE without cookies
 *
 * Each client is tried in order. If a client returns LOGIN_REQUIRED,
 * has no captions, or returns empty XML, the next client is attempted.
 * An error is only thrown when all clients have been exhausted.
 */

// Valid YouTube URL patterns
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:[&?].*)?$/;

// Video ID format: 11 chars, alphanumeric + dash + underscore
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Public innertube API key (shared across all innertube clients)
const INNERTUBE_API_KEY = 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc';

/**
 * Innertube client configuration for the multi-client fallback strategy.
 */
interface InnertubeClient {
  name: string;
  clientName: string;
  clientVersion: string;
  userAgent?: string;
  deviceModel?: string;
  androidSdkVersion?: number;
  thirdParty?: { embedUrl: string };
}

const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    name: 'ANDROID',
    clientName: 'ANDROID',
    clientVersion: '19.30.36',
    androidSdkVersion: 33,
    userAgent: 'com.google.android.youtube/19.30.36 (Linux; U; Android 13; en_US) gzip',
  },
  {
    name: 'IOS',
    clientName: 'IOS',
    clientVersion: '19.29.1',
    deviceModel: 'iPhone16,2',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
  },
  {
    name: 'WEB',
    clientName: 'WEB',
    clientVersion: '2.20240530.02.00',
  },
];

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

  // Maybe it is already just a video ID
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
 * Fetch the player response from the innertube API using a given client.
 */
async function fetchPlayerResponse(
  videoId: string,
  client: InnertubeClient,
): Promise<Record<string, unknown>> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`;

  const clientPayload: Record<string, unknown> = {
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    hl: 'en',
  };

  if (client.deviceModel) {
    clientPayload.deviceModel = client.deviceModel;
  }

  if (client.androidSdkVersion) {
    clientPayload.androidSdkVersion = client.androidSdkVersion;
  }

  const context: Record<string, unknown> = { client: clientPayload };

  if (client.thirdParty) {
    context.thirdParty = client.thirdParty;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (client.userAgent) {
    headers['User-Agent'] = client.userAgent;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      context,
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
 * Get the playability status from the player response.
 * Returns an object with the status string and an optional reason.
 */
function getPlayabilityStatus(
  playerResponse: Record<string, unknown>,
): { status: string; reason?: string } {
  const playability = (playerResponse as any)?.playabilityStatus;
  return {
    status: playability?.status ?? 'UNKNOWN',
    reason: playability?.reason,
  };
}

/**
 * Check if a playability status is a hard failure (video definitely
 * cannot be played, regardless of which client is used). Returns an
 * error message if the status is fatal, or null if a different client
 * should be attempted.
 *
 * Most statuses (ERROR, UNPLAYABLE, LOGIN_REQUIRED) are NOT treated
 * as universally fatal because different innertube clients receive
 * different responses for the same video. For example, the WEB client
 * may return "Video unavailable" while the embedded player client
 * succeeds. Only statuses that are inherently about the video itself
 * (e.g. LIVE_STREAM_OFFLINE) are considered fatal.
 */
function getFatalPlayabilityError(status: string, _reason?: string): string | null {
  switch (status) {
    case 'OK':
      return null;
    case 'LIVE_STREAM_OFFLINE':
      return 'This is a live stream that is currently offline';
    case 'ERROR':
    case 'UNPLAYABLE':
    case 'LOGIN_REQUIRED':
      // Not fatal per client; another client may succeed
      return null;
    default:
      // Unknown statuses are treated as non-fatal so fallback clients are tried
      return null;
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
 * Tries multiple innertube clients in priority order (WEB, then
 * TVHTML5_SIMPLY_EMBEDDED_PLAYER, then IOS). For each client:
 *   1. Fetch the player response
 *   2. Check playability (fatal errors abort immediately)
 *   3. Extract captions URL (skip to next client if missing)
 *   4. Fetch the timedtext XML (skip to next client if empty)
 *   5. Parse segments (skip to next client if none found)
 *
 * Only throws when every client has been exhausted.
 */
async function fetchRawTranscript(videoId: string): Promise<string> {
  const errors: string[] = [];

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const playerResponse = await fetchPlayerResponse(videoId, client);

      // Check playability
      const { status, reason } = getPlayabilityStatus(playerResponse);
      const fatalError = getFatalPlayabilityError(status, reason);

      if (fatalError) {
        // Hard failure: no point trying other clients
        throw new Error(fatalError);
      }

      if (status !== 'OK') {
        const label = reason ? `${status} (${reason})` : status;
        console.log(
          `[youtube] ${client.name} returned ${label} for ${videoId}, trying next client`,
        );
        errors.push(`${client.name}: ${label}`);
        continue;
      }

      // Extract captions URL
      const captionsUrl = extractCaptionsUrl(playerResponse);
      if (!captionsUrl) {
        console.log(
          `[youtube] ${client.name} returned no captions for ${videoId}, trying next client`,
        );
        errors.push(`${client.name}: no captions data`);
        continue;
      }

      // Fetch the timedtext XML
      const transcriptResponse = await fetch(captionsUrl);
      if (!transcriptResponse.ok) {
        console.log(
          `[youtube] ${client.name} captions fetch returned HTTP ${transcriptResponse.status} for ${videoId}, trying next client`,
        );
        errors.push(`${client.name}: captions HTTP ${transcriptResponse.status}`);
        continue;
      }

      const xml = await transcriptResponse.text();
      if (!xml || xml.trim().length === 0) {
        console.log(
          `[youtube] ${client.name} returned empty captions XML for ${videoId}, trying next client`,
        );
        errors.push(`${client.name}: empty captions XML`);
        continue;
      }

      const segments = parseTimedTextXml(xml);
      if (segments.length === 0) {
        console.log(
          `[youtube] ${client.name} captions XML had no text segments for ${videoId}, trying next client`,
        );
        errors.push(`${client.name}: no text segments in XML`);
        continue;
      }

      // Success
      console.log(
        `[youtube] Successfully fetched transcript for ${videoId} using ${client.name} client`,
      );
      return segments.join(' ');
    } catch (error) {
      // Re-throw fatal playability errors (they apply to all clients)
      if (error instanceof Error && error.message.includes('live stream')) {
        throw error;
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(
        `[youtube] ${client.name} failed for ${videoId}: ${errMsg}, trying next client`,
      );
      errors.push(`${client.name}: ${errMsg}`);
    }
  }

  // All clients exhausted; produce a user-friendly error based on patterns
  const allLoginRequired = errors.every((e) => e.includes('LOGIN_REQUIRED'));
  if (allLoginRequired) {
    throw new Error('Video requires login (it may be private or age-restricted)');
  }

  const allUnavailable = errors.every(
    (e) => e.includes('ERROR') || e.includes('unavailable'),
  );
  if (allUnavailable) {
    throw new Error('Video is unavailable (it may be private or deleted)');
  }

  const allUnplayable = errors.every(
    (e) => e.includes('UNPLAYABLE') || e.includes('unplayable'),
  );
  if (allUnplayable) {
    throw new Error('Video is unplayable (it may be region-restricted or removed)');
  }

  const allNoCaptions = errors.every(
    (e) => e.includes('no captions') || e.includes('empty captions') || e.includes('no text segments'),
  );
  if (allNoCaptions) {
    throw new Error('No captions available for this video');
  }

  throw new Error(
    `Failed to fetch transcript after trying all clients: ${errors.join('; ')}`,
  );
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
