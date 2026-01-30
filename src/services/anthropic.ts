/**
 * Claude Code Summarization Service
 * Uses Claude CLI for transcript summarization
 */

import { config } from '../config';

export interface VideoMetadata {
  title?: string;
  channel?: string;
  duration?: string;
}

export interface SummaryResult {
  summary: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const SUMMARIZE_PROMPT = `You are a YouTube video summarizer that produces clear, actionable summaries.

Given this video transcript, produce a summary in the following format:

## 📺 {title}

**Duration:** {duration} | **Channel:** {channel}

### 🎯 TL;DR
> [1-2 sentence summary of the main point]

### 🔑 Key Points
1. [First major point]
2. [Second major point]
3. [Third major point]
[4-6 points max]

### 💡 Notable Insights
- [Interesting quote or observation]
- [Counterintuitive claim]

### ⚡ Action Items (if applicable)
- [ ] [Something to try]
- [ ] [Something to research]

### 🔗 Related
- Connects to: [topics or concepts]

Guidelines:
- Be concise - for quick consumption
- Highlight surprises - what's non-obvious
- Skip filler - intros, outros, sponsor reads
- Preserve nuance - don't oversimplify complex points
- If no action items are applicable, omit that section
- Output ONLY the summary, no explanations or preamble`;

/**
 * Summarize a YouTube transcript using Claude CLI
 */
export async function summarizeTranscript(
  transcript: string,
  metadata: VideoMetadata = {}
): Promise<SummaryResult> {
  const { title = 'Unknown Video', channel = 'Unknown Channel', duration = 'Unknown' } = metadata;

  const prompt = SUMMARIZE_PROMPT
    .replace('{title}', title)
    .replace('{duration}', duration)
    .replace('{channel}', channel);

  const fullPrompt = `${prompt}\n\nTRANSCRIPT:\n${transcript}`;

  // Use Claude CLI with --print flag to get just the output
  const proc = Bun.spawn([config.claudeCliPath, '--print', '--model', 'sonnet', fullPrompt], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Claude CLI failed: ${stderr || 'Unknown error'}`);
  }

  return {
    summary: stdout.trim(),
    model: 'claude-sonnet',
    inputTokens: 0, // Not available from CLI
    outputTokens: 0,
  };
}

/**
 * Convert summary markdown to TTS-friendly plain text
 */
export function summaryToSpeech(summary: string): string {
  return summary
    // Convert headings to spoken form
    .replace(/## 📺\s*/g, 'Video: ')
    .replace(/### 🎯 TL;DR/g, 'TL;DR:')
    .replace(/### 🔑 Key Points/g, 'Key Points:')
    .replace(/### 💡 Notable Insights/g, 'Notable Insights:')
    .replace(/### ⚡ Action Items.*$/gm, 'Action Items:')
    .replace(/### 🔗 Related/g, 'Related Topics:')
    // Remove emoji
    .replace(/[📺🎯🔑💡⚡🔗]/g, '')
    // Convert markdown formatting
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/>\s*/g, '') // Remove blockquote markers
    .replace(/- \[ \]/g, '') // Remove checkbox markers
    .replace(/^\d+\.\s*/gm, '') // Remove numbered list markers (let TTS handle naturally)
    .replace(/^-\s*/gm, '') // Remove bullet markers
    .replace(/\|/g, ',') // Convert pipe separators
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
