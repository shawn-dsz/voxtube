import { Hono } from 'hono';
import { fetchTranscript, isValidYouTubeInput } from '../services/youtube';

/**
 * POST /api/transcript
 * Fetch transcript for a YouTube video
 *
 * Body: { url: string }
 * Returns: { videoId, transcript } or { error }
 */
const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json<{ url?: string }>();

  if (!body.url) {
    return c.json({ error: 'Missing url parameter' }, 400);
  }

  // Validate before processing
  if (!isValidYouTubeInput(body.url)) {
    return c.json({ error: 'Invalid YouTube URL or video ID' }, 400);
  }

  const result = await fetchTranscript(body.url);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({
    videoId: result.videoId,
    transcript: result.transcript,
    title: result.metadata?.title,
    channel: result.metadata?.channel,
  });
});

export const transcriptRoute = app;
