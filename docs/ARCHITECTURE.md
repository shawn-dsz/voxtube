# Architecture: VoxTube

> Last updated: 2026-02-21

## Overview
VoxTube converts YouTube videos into listenable audio with optional transcript summaries.

Core pipeline:
1. Fetch transcript from a YouTube video.
2. Optionally summarize transcript with a configurable LLM provider.
3. Convert full text (or summary text) to audio using Kokoro TTS.
4. Cache generated assets for fast replay.

## Runtime Components

### Frontend (`public/`)
- Vanilla HTML/CSS/JS UI.
- Calls backend APIs for transcript fetch, summary generation, TTS generation, and history.

### API Server (`src/index.ts`)
- Bun + Hono server.
- CORS enabled.
- Static file serving from `public/`.
- Background cache cleanup started at boot.

### Route Layer (`src/routes/`)
- `POST /api/transcript`: fetch transcript and metadata.
- `POST /api/summarize`: generate summary via configured LLM provider.
- `POST /api/synthesize`: generate or return cached audio.
- `GET /api/voices`: list available Kokoro voices.
- `GET /api/history`: list cached outputs.
- `DELETE /api/history/:videoId`: delete cached artifacts for a video.
- `GET /api/health`: health + cache stats.

### Service Layer (`src/services/`)
- `youtube.ts`: validates YouTube input and shells out to transcript CLI (`yt`).
- `anthropic.ts`: summarization service with provider routing:
  - `openai_compat` (default): HTTP `chat/completions` provider model.
  - `claude_cli`: local CLI fallback path.
- `kokoro.ts`: TTS integration with Kokoro FastAPI.
- `cache.ts`: file-based cache read/write/list/delete and cleanup.

### Configuration (`src/config.ts`)
Environment-driven config:
- Server + cache: `PORT`, `CACHE_DIR`, `CACHE_TTL_DAYS`, `CLEANUP_INTERVAL_HOURS`.
- Transcript: `YT_CLI_PATH`, `MAX_TRANSCRIPT_LENGTH`.
- LLM: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_MS`, `CLAUDE_CLI_PATH`.
- TTS: `KOKORO_URL`.

## Data Flow
```text
YouTube URL/ID
  -> /api/transcript
  -> yt CLI
  -> transcript + metadata

transcript + metadata
  -> /api/summarize
  -> summarize service
     -> openai_compat (HTTP) OR claude_cli (local)
  -> markdown summary
  -> cached summary JSON

text + voice
  -> /api/synthesize
  -> cache lookup
     -> hit: return audio
     -> miss: call Kokoro -> write cache -> return audio
```

## Key Decisions and Learnings

### 1) LLM provider is now API-configurable
- Previous behavior hard-coupled summary generation to Claude CLI.
- Current behavior defaults to `openai_compat` for hosted/deployed environments.
- Claude CLI remains available as a fallback via `LLM_PROVIDER=claude_cli`.

Why:
- Easier Docker/server deployment (no local CLI auth dependency).
- Simpler secret management through environment variables.

### 2) Long transcript handling is configuration-driven
- `MAX_TRANSCRIPT_LENGTH` default increased to `100000`.
- Transcript requests fail fast with explicit error when exceeding limit.

Why:
- Real-world long-form videos exceeded the previous 50k limit.
- Keeping a configurable cap avoids runaway token/cost scenarios.

### 3) Claude CLI prompt transport uses stdin
- CLI prompt is written to stdin instead of command args.

Why:
- Avoids argv length limitations with large transcripts.
- More robust for long-input summarization workflows.

### 4) Error reporting is explicit and actionable
- Summarizer now returns concrete provider errors (`HTTP status`, auth, transport failure, empty output).
- Removed opaque fallback errors during provider failures.

Why:
- Faster diagnosis in production and local dev.
- Clear separation of config error vs provider/runtime error.

## Security and Reliability Notes
- Command injection prevention: CLI executions use argument arrays, not shell interpolation.
- Input validation: YouTube URL/ID checks before transcript processing.
- Boundaries: transcript length cap enforced server-side.
- Cache isolation: cached artifacts are keyed by deterministic cache keys.
- External dependencies:
  - Transcript CLI availability (`yt`).
  - Kokoro service reachability.
  - LLM API credential validity.

## Deployment Notes

### Recommended hosted profile
- `LLM_PROVIDER=openai_compat`
- Set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.
- Run Kokoro service as a sibling container/service.

### Optional local profile
- `LLM_PROVIDER=claude_cli`
- Ensure `CLAUDE_CLI_PATH` is available and authenticated on host.

## File Structure (Current)
```text
voxtube/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── routes/
│   │   ├── history.ts
│   │   ├── summarize.ts
│   │   ├── synthesize.ts
│   │   ├── transcript.ts
│   │   └── voices.ts
│   └── services/
│       ├── anthropic.ts
│       ├── cache.ts
│       ├── kokoro.ts
│       └── youtube.ts
├── public/
└── docs/
    └── ARCHITECTURE.md
```

## Changelog
| Date | Change |
|------|--------|
| 2026-02-21 | Updated architecture to match current codebase and provider-configurable LLM design |
| 2026-02-21 | Documented transcript length increase and long-input summarization considerations |
| 2026-02-21 | Added explicit deployment guidance for OpenAI-compatible providers and Claude CLI fallback |
