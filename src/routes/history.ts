/**
 * History Route
 * GET /api/history - List cached video summaries
 */

import { Hono } from 'hono';
import { getCacheHistory } from '../services/cache';

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
