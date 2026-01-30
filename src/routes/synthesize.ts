import { Hono } from 'hono';
import { synthesize, isValidVoice, cleanTranscript } from '../services/kokoro';
import { isCached, readCache, writeCache, getCacheKey } from '../services/cache';
import { config } from '../config';

/**
 * POST /api/synthesize
 * Generate TTS audio from transcript
 *
 * Body: { videoId: string, text: string, voice: string }
 * Returns: Audio file (mp3) or { error }
 */
const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json<{
    videoId?: string;
    text?: string;
    voice?: string;
  }>();

  // Validate required fields
  if (!body.videoId || !body.text || !body.voice) {
    return c.json({ error: 'Missing required fields: videoId, text, voice' }, 400);
  }

  // Validate video ID format (alphanumeric + dash/underscore, 11 chars)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(body.videoId)) {
    return c.json({ error: 'Invalid video ID format' }, 400);
  }

  // Validate voice
  if (!isValidVoice(body.voice)) {
    return c.json({ error: `Invalid voice: ${body.voice}` }, 400);
  }

  // Check text length
  if (body.text.length > config.maxTranscriptLength) {
    return c.json(
      {
        error: `Text too long (${body.text.length} chars, max ${config.maxTranscriptLength})`,
      },
      400
    );
  }

  // Check cache first
  if (await isCached(body.videoId, body.voice)) {
    console.log(`📦 Cache hit: ${getCacheKey(body.videoId, body.voice)}`);
    const cachedAudio = await readCache(body.videoId, body.voice);

    if (cachedAudio) {
      return new Response(cachedAudio, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Cache': 'HIT',
        },
      });
    }
  }

  // Cache miss - synthesize
  console.log(`🎙️  Synthesizing: ${body.videoId} with voice ${body.voice}`);
  const result = await synthesize(body.text, body.voice);

  if (!result.success) {
    return c.json({ error: result.error }, 500);
  }

  // Save to cache (async, don't block response)
  writeCache(body.videoId, body.voice, result.audioBuffer).then((saved) => {
    if (saved) {
      console.log(`💾 Cached: ${getCacheKey(body.videoId, body.voice)}`);
    }
  });

  return new Response(result.audioBuffer, {
    headers: {
      'Content-Type': result.contentType,
      'X-Cache': 'MISS',
    },
  });
});

export const synthesizeRoute = app;
