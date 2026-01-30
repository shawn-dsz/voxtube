import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { config } from './config';
import { voicesRoute } from './routes/voices';
import { transcriptRoute } from './routes/transcript';
import { synthesizeRoute } from './routes/synthesize';
import { startCleanupInterval, getCacheStats } from './services/cache';

const app = new Hono();

// Middleware
app.use('*', cors());

// Health check with cache stats
app.get('/api/health', async (c) => {
  const cacheStats = await getCacheStats();
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    cache: {
      files: cacheStats.files,
      sizeMB: Math.round(cacheStats.totalSizeBytes / 1024 / 1024 * 100) / 100,
    },
  });
});

// API routes
app.route('/api/voices', voicesRoute);
app.route('/api/transcript', transcriptRoute);
app.route('/api/synthesize', synthesizeRoute);

// Serve static files from public/
app.use('/*', serveStatic({ root: './public' }));

// Start background cache cleanup
startCleanupInterval();

console.log(`🎙️ VoxTube starting on http://localhost:${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
