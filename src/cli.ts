#!/usr/bin/env bun

/**
 * VoxTube CLI
 * Fetch and summarise YouTube video transcripts from the command line
 *
 * Usage: bun run src/cli.ts <youtube-url-or-video-id>
 */

import { fetchTranscript } from './services/youtube';
import { summarizeTranscript } from './services/anthropic';
import { readSummaryCache, writeSummaryCache } from './services/cache';

const input = process.argv[2];

if (!input) {
  console.error('Usage: bun run src/cli.ts <youtube-url-or-video-id>');
  process.exit(1);
}

const transcriptResult = await fetchTranscript(input);

if (!transcriptResult.success) {
  console.error(`Error: ${transcriptResult.error}`);
  process.exit(1);
}

const { videoId, transcript, metadata } = transcriptResult;

// Check summary cache first
const cached = await readSummaryCache(videoId);

if (cached) {
  console.log(cached.summary);
  process.exit(0);
}

// Generate summary using Claude
const result = await summarizeTranscript(transcript, {
  title: metadata?.title,
  channel: metadata?.channel,
});

// Cache the result
await writeSummaryCache(videoId, result.summary, result.model, {
  title: metadata?.title,
  channel: metadata?.channel,
});

console.log(result.summary);
