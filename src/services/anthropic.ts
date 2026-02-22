/**
 * Summarization service with pluggable LLM providers.
 * Supports OpenAI-compatible HTTP APIs (default) and Claude CLI fallback.
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

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompatibleRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
}

interface OpenAICompatibleResponse {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
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
 * Summarize a YouTube transcript using the configured LLM provider.
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

  const fullPrompt = `${prompt}\n\nTRANSCRIPT:\n${transcript}`.trim();

  if (config.llmProvider === 'claude_cli') {
    return summarizeWithClaudeCli(fullPrompt);
  }

  if (config.llmProvider === 'codex') {
    return summarizeWithCodex(fullPrompt);
  }

  if (config.llmProvider === 'openai_compat') {
    return summarizeWithOpenAICompat(prompt, transcript);
  }

  throw new Error(
    `Unsupported LLM_PROVIDER "${config.llmProvider}". ` +
    'Use "openai_compat", "claude_cli", or "codex".'
  );
}

async function summarizeWithClaudeCli(fullPrompt: string): Promise<SummaryResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    // Send prompt over stdin to avoid argv size limits with long transcripts.
    // Strip CLAUDECODE env var so the CLI doesn't refuse to run inside a Claude Code session.
    const env = { ...process.env };
    delete env.CLAUDECODE;
    proc = Bun.spawn([config.claudeCliPath, '--print', '--model', 'sonnet'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Claude CLI failed to start (${config.claudeCliPath}). ` +
      `Check that Claude CLI is installed and authenticated. Details: ${detail}`
    );
  }

  // Bun's proc.stdin with stdin:'pipe' is a FileSink (write + end), not a WritableStream
  const sink = proc.stdin as import('bun').FileSink;
  sink.write(new TextEncoder().encode(fullPrompt));
  sink.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const errorText = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    throw new Error(
      `Claude CLI failed (exit ${exitCode}): ${errorText}. ` +
      'If this persists, run `claude --print --model sonnet` in your terminal to verify auth.'
    );
  }

  if (!stdout.trim()) {
    throw new Error('Claude CLI returned empty output');
  }

  return {
    summary: stdout.trim(),
    model: 'claude-sonnet',
    inputTokens: 0, // Not available from CLI
    outputTokens: 0,
  };
}

async function summarizeWithCodex(fullPrompt: string): Promise<SummaryResult> {
  // Create a temporary file for output since codex -o requires a file path
  const tempFile = `/tmp/voxtube_codex_${Date.now()}.txt`;
  
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    // Use codex exec with stdin for the prompt and -o for output file
    proc = Bun.spawn([config.codexCliPath, 'exec', '-', '--ephemeral', '-o', tempFile], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Codex CLI failed to start (${config.codexCliPath}). ` +
      `Check that Codex CLI is installed and authenticated. Details: ${detail}`
    );
  }

  // Bun's proc.stdin with stdin:'pipe' is a FileSink (write + end), not a WritableStream
  const sink = proc.stdin as import('bun').FileSink;
  sink.write(new TextEncoder().encode(fullPrompt));
  sink.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
    proc.exited,
  ]);

  // Clean up temp file after reading
  let output = '';
  try {
    output = await Bun.file(tempFile).text();
    await Bun.file(tempFile).delete();
  } catch {
    // If file doesn't exist, fall back to stdout
    output = stdout.trim();
  }

  if (exitCode !== 0) {
    const errorText = stderr.trim() || output || `exit code ${exitCode}`;
    throw new Error(
      `Codex CLI failed (exit ${exitCode}): ${errorText}. ` +
      'If this persists, run `codex exec "test"` to verify auth.'
    );
  }

  if (!output.trim()) {
    throw new Error('Codex CLI returned empty output');
  }

  return {
    summary: output.trim(),
    model: 'codex',
    inputTokens: 0, // Not available from CLI
    outputTokens: 0,
  };
}

async function summarizeWithOpenAICompat(
  systemPrompt: string,
  transcript: string
): Promise<SummaryResult> {
  if (!config.llmApiKey) {
    throw new Error('LLM_API_KEY is required when LLM_PROVIDER=openai_compat');
  }

  const baseUrl = config.llmBaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const body: OpenAICompatibleRequest = {
    model: config.llmModel,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `TRANSCRIPT:\n${transcript}` },
    ],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.llmTimeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM request failed: ${detail}`);
  }

  const text = await res.text();

  let parsed: OpenAICompatibleResponse | undefined;
  try {
    parsed = text ? (JSON.parse(text) as OpenAICompatibleResponse) : undefined;
  } catch {
    // Keep raw text for error handling below.
  }

  if (!res.ok) {
    const detail = parsed?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(`LLM provider error (${res.status}): ${detail}`);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  const summary = Array.isArray(content)
    ? content.map((part) => part.text || '').join('').trim()
    : (content || '').trim();

  if (!summary) {
    throw new Error('LLM provider returned empty summary');
  }

  return {
    summary,
    model: parsed?.model || config.llmModel,
    inputTokens: parsed?.usage?.prompt_tokens || 0,
    outputTokens: parsed?.usage?.completion_tokens || 0,
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
