# Architecture: VoxTube

> This document is automatically updated after each checkpoint.
> Last updated: 2026-01-31 (Clipboard Feature)

## Overview
VoxTube converts YouTube videos to audio podcasts using TTS. Users paste a URL, select a voice, and listen to the video content narrated by Kokoro TTS.

**Problem:** Users don't want to watch entire YouTube videos - they want to extract content and listen to it as audio.

**Workflow:** Paste URL → Fetch transcript → Select voice → Generate audio → Play

## Components

### Frontend (Web UI)
- Vanilla HTML/CSS/JS for instant load
- URL input, voice selector, summary display, audio player
- Clipboard integration for copying summaries

### Backend (Bun + Hono)
- `GET /api/voices` - List Kokoro voices
- `POST /api/transcript` - Fetch YouTube transcript via CLI
- `POST /api/synthesize` - Generate TTS audio

### Cache Layer
- File-based storage for generated audio
- TTL cleanup (7 days) on startup and access

## Data Flow
```
URL → POST /api/transcript → yt CLI → transcript
transcript + voice → POST /api/synthesize → cache check
  └── hit → return cached audio
  └── miss → Kokoro TTS → save to cache → return audio
```

## Technology Decisions
| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Runtime | Bun | 3x faster than Node | Node.js, Deno |
| Framework | Hono | Minimal, fast | Express, Fastify |
| Frontend | Vanilla JS | No build step | React, Vue |
| Cache | File system | Simple, inspectable | SQLite, Redis |
| TTS | Kokoro | Local, high quality | OpenAI TTS, ElevenLabs |

## API Contracts
*Pending: Will be populated during Build phase*

## File Structure
```
voxtube/
├── src/
│   ├── index.ts                    # Main server
│   ├── config.ts                   # Config loader (env or file)
│   ├── routes/
│   │   ├── transcript.ts
│   │   ├── synthesize.ts
│   │   ├── summarize.ts
│   │   ├── voices.ts
│   │   ├── history.ts
│   │   └── settings.ts             # (desktop mode only)
│   └── services/
│       ├── youtube.ts
│       ├── kokoro.ts
│       ├── cache.ts
│       └── llm/                    # Provider abstraction
│           ├── index.ts            # Provider interface + factory
│           ├── anthropic.ts        # Anthropic SDK
│           ├── openai.ts           # OpenAI SDK
│           ├── gemini.ts           # Google Gemini
│           └── ollama.ts           # Local Ollama
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── settings.html               # (desktop mode only)
├── cache/
└── .env                            # (hosted mode)
```

## Deployment Modes

VoxTube supports two deployment modes from the same codebase:

### Mode A: Hosted Web Service
- You host the server, users access via browser
- API keys stored as environment variables (your keys)
- No user accounts needed for basic usage
- You pay for LLM/TTS API costs

### Mode B: Desktop App (BYOK)
- Users download and run locally
- API keys stored in `~/.tubespeak/config.json` (their keys)
- Settings UI for provider/model selection
- Zero hosting cost for you

### Architecture for Dual Mode

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│              (same HTML/CSS/JS for both)                │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    Bun + Hono Server                    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  /api/...   │  │  /settings  │  │  /api/config│     │
│  │  (existing) │  │ (desktop)   │  │  (desktop)  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   Config Layer                          │
│                                                         │
│  Hosted: process.env.*                                  │
│  Desktop: ~/.tubespeak/config.json + Settings UI        │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   LLM Provider Layer                    │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Anthropic │ │ OpenAI   │ │ Gemini   │ │ Ollama   │   │
│  │   SDK    │ │   SDK    │ │   SDK    │ │  (local) │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Abstractions Needed

1. **LLM Provider Interface** (`src/services/llm/`)
   ```typescript
   interface LLMProvider {
     name: string;
     summarize(transcript: string, meta: VideoMetadata): Promise<SummaryResult>;
   }
   ```

2. **Config Source** (`src/services/config/`)
   ```typescript
   interface ConfigSource {
     get(key: string): string | undefined;
     set(key: string, value: string): Promise<void>;  // desktop only
     getAll(): Record<string, string>;
   }
   ```

3. **Mode Detection**
   ```typescript
   const isDesktopMode = !process.env.HOSTED_MODE;
   ```

### Desktop-Only Routes

| Route | Purpose |
|-------|---------|
| `GET /api/config` | Get current settings (redacted keys) |
| `POST /api/config` | Update settings |
| `GET /settings` | Settings UI page |

### Build Targets

```bash
# Hosted: standard Bun server
bun run src/index.ts

# Desktop: compiled binary
bun build --compile --target=bun-darwin-arm64 src/index.ts -o tubespeak
```

## Security Considerations
- **Command injection prevention**: Use array args in Bun.spawn, never shell strings
- **Path traversal prevention**: Hash cache filenames with MD5
- **Input validation**: YouTube URL regex, video ID validation, voice whitelist
- **Input limits**: Max 50k chars for transcript

## Performance Considerations
- **Background cache cleanup**: Run every 12 hours (non-blocking)
- **Async startup**: Don't block server ready on cache scan
- **Text pre-processing**: Clean transcript artifacts before TTS

## Change Log
| Phase | Checkpoint | Change | Timestamp |
|-------|------------|--------|-----------|
| Setup | Initial | Created architecture document | 2026-01-30 |
| Understand | Complete | Added overview and problem statement | 2026-01-30 |
| Design | Complete | Added components, data flow, tech decisions | 2026-01-30 |
| Feature | Clipboard | Added copy-to-clipboard for summaries | 2026-01-31 |
| Design | Dual Mode | Added hosted + desktop deployment architecture | 2026-01-31 |
