/**
 * History Route
 * GET /api/history - List cached video summaries
 * DELETE /api/history/:videoId - Delete cache for a specific video
 */

import { Hono } from 'hono';
import { getCacheHistory, deleteVideoCache } from '../services/cache';

export const historyRoute = new Hono();

historyRoute.get('/', async (c) => {
  try {
    const history = await getCacheHistory();
    return c.json({ history });
  } catch (error) {
    console.error('History error:', error);
    return c.json({ error: 'Failed to fetch history' }, 500);
  }
});

historyRoute.delete('/:videoId', async (c) => {
  try {
    const videoId = c.req.param('videoId');

    // Validate video ID format
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return c.json({ error: 'Invalid video ID' }, 400);
    }

    const result = await deleteVideoCache(videoId);
    return c.json({ success: true, deleted: result.deleted });
  } catch (error) {
    console.error('Delete cache error:', error);
    return c.json({ error: 'Failed to delete cache' }, 500);
  }
});
