# Architecture: VoxTube

> This document is automatically updated after each checkpoint.
> Last updated: 2026-01-30 (Design)

## Overview
VoxTube converts YouTube videos to audio podcasts using TTS. Users paste a URL, select a voice, and listen to the video content narrated by Kokoro TTS.

**Problem:** Users don't want to watch entire YouTube videos - they want to extract content and listen to it as audio.

**Workflow:** Paste URL → Fetch transcript → Select voice → Generate audio → Play

## Components

### Frontend (Web UI)
- Vanilla HTML/CSS/JS for instant load
- URL input, voice selector, transcript display, audio player

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
│   ├── index.ts
│   ├── routes/{transcript,synthesize,voices}.ts
│   ├── services/{youtube,kokoro,cache}.ts
│   └── config.ts
├── public/{index.html,style.css,app.js}
├── cache/
└── .env
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
