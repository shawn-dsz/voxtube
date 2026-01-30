/**
 * Summarize Route
 * POST /api/summarize - Summarize a YouTube transcript using Claude
 */

import { Hono } from 'hono';
import { summarizeTranscript, summaryToSpeech } from '../services/anthropic';
import { readSummaryCache, writeSummaryCache } from '../services/cache';

export const summarizeRoute = new Hono();

interface SummarizeRequest {
  videoId: string;
  transcript: string;
  title?: string;
  channel?: string;
  duration?: string;
}

summarizeRoute.post('/', async (c) => {
  try {
    const body = await c.req.json<SummarizeRequest>();
    const { videoId, transcript, title, channel, duration } = body;

    // Validate required fields
    if (!videoId) {
      return c.json({ error: 'videoId is required' }, 400);
    }
    if (!transcript) {
      return c.json({ error: 'transcript is required' }, 400);
    }

    // Check cache first
    const cached = await readSummaryCache(videoId);
    if (cached) {
      console.log(`📦 Summary cache hit for ${videoId}`);
      return c.json({
        videoId,
        summary: cached.summary,
        summaryForSpeech: summaryToSpeech(cached.summary),
        cached: true,
        model: cached.model,
      });
    }

    // Generate summary using Claude CLI
    console.log(`🤖 Generating summary for ${videoId}...`);
    const result = await summarizeTranscript(transcript, { title, channel, duration });

    // Cache the summary
    await writeSummaryCache(videoId, result.summary, result.model, { title, channel, duration });

    return c.json({
      videoId,
      summary: result.summary,
      summaryForSpeech: summaryToSpeech(result.summary),
      cached: false,
      model: result.model,
    });
  } catch (error) {
    console.error('Summarize error:', error);
    const message = error instanceof Error ? error.message : 'Failed to summarize transcript';
    return c.json({ error: message }, 500);
  }
});
