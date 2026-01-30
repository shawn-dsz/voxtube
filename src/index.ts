import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { config } from './config';

// Import routes (will be created in later tasks)
// import { transcriptRoute } from './routes/transcript';
// import { synthesizeRoute } from './routes/synthesize';
// import { voicesRoute } from './routes/voices';

const app = new Hono();

// Middleware
app.use('*', cors());

// API routes (placeholder - will be implemented in Task 5)
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Serve static files from public/
app.use('/*', serveStatic({ root: './public' }));

console.log(`🎙️ VoxTube starting on http://localhost:${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
