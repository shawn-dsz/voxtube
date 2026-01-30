import { Hono } from 'hono';
import { getVoices } from '../services/kokoro';

/**
 * GET /api/voices
 * Returns list of available Kokoro TTS voices
 */
const app = new Hono();

app.get('/', (c) => {
  const voices = getVoices();
  return c.json({ voices });
});

export const voicesRoute = app;
