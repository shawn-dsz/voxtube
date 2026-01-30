# VoxTube - Technical Plan

## Architecture Overview

Simple 3-layer architecture optimized for speed and simplicity.

## Components

### 1. Frontend (Web UI)
- **Purpose:** User interface for URL input, voice selection, transcript display, audio playback
- **Tech:** Vanilla HTML/CSS/JS (no framework, instant load)
- **Files:** `public/index.html`, `public/style.css`, `public/app.js`

### 2. Backend (Bun + Hono API)
- **Purpose:** Handle API requests, orchestrate services
- **Tech:** Bun runtime + Hono framework
- **Routes:**
  - `GET /api/voices` - List available Kokoro voices
  - `POST /api/transcript` - Fetch YouTube transcript
  - `POST /api/synthesize` - Generate TTS audio

### 3. Cache Layer (File-based)
- **Purpose:** Store generated audio to avoid regeneration
- **Tech:** File system with TTL-based cleanup
- **Key:** `{video_id}_{voice}.mp3`
- **Cleanup:**
  - On server start: scan and delete files older than TTL
  - On cache access: check age before returning

## Data Flow

```
User pastes URL
      │
      ▼
POST /api/transcript { url }
      │
      ▼
Backend spawns: yt "URL" --format text
      │
      ▼
Returns transcript text
      │
      ▼
User selects voice, clicks "Generate"
      │
      ▼
POST /api/synthesize { videoId, text, voice }
      │
      ▼
Check cache for {videoId}_{voice}.mp3
      │
      ├── Cache hit (and fresh) → Return audio URL
      │
      └── Cache miss (or stale) → Call Kokoro TTS
                                        │
                                        ▼
                                  Save to cache
                                        │
                                        ▼
                                  Return audio URL
      │
      ▼
Frontend plays audio via <audio> element
```

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | 3x faster than Node, native TypeScript |
| Framework | Hono | Minimal, fast, excellent DX |
| Frontend | Vanilla JS | No build step, instant load, simple |
| Cache | File system | Simple, inspectable, no extra deps |
| Config | .env | Standard, easy to modify |
| Transcript | yt CLI | Already exists, works well |
| TTS | Kokoro | Local, high quality, configurable |

## File Structure

```
voxtube/
├── src/
│   ├── index.ts              # Server entry point
│   ├── routes/
│   │   ├── transcript.ts     # YouTube transcript endpoint
│   │   ├── synthesize.ts     # TTS generation endpoint
│   │   └── voices.ts         # List Kokoro voices
│   ├── services/
│   │   ├── youtube.ts        # Wraps yt CLI
│   │   ├── kokoro.ts         # Kokoro TTS client
│   │   └── cache.ts          # File cache with TTL
│   └── config.ts             # Environment configuration
├── public/
│   ├── index.html            # Main UI
│   ├── style.css             # Styles
│   └── app.js                # Frontend logic
├── cache/                    # Generated audio (gitignored)
├── .env                      # Configuration
├── .env.example              # Example config
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

### YouTube Transcript CLI
Users must install the YouTube transcript tool from:
**https://github.com/shawn-dsz/youtube-transcribe**

This will be documented in the README with installation instructions.

## Configuration (.env)

```env
PORT=3000
KOKORO_URL=http://localhost:8880
CACHE_DIR=./cache
CACHE_TTL_DAYS=7
YT_CLI_PATH=yt  # Assumes 'yt' is in PATH after installing youtube-transcribe
```

## Security Measures

### Input Validation
- **YouTube URL validation**: Regex to ensure valid YouTube URL format before processing
- **Video ID extraction**: Parse and validate video ID (alphanumeric + `-_`, 11 chars)
- **Voice validation**: Validate against known list of Kokoro voices

### Command Injection Prevention
- Use `Bun.spawn()` with **array arguments**, never shell strings:
  ```typescript
  // SAFE
  Bun.spawn(['yt', videoId, '--format', 'text'])

  // DANGEROUS - never do this
  Bun.spawn(`yt "${url}" --format text`, { shell: true })
  ```

### Path Traversal Prevention
- Hash cache filenames to prevent `../` attacks:
  ```typescript
  const cacheKey = md5(`${videoId}_${voice}`);
  const filename = `${cacheKey}.mp3`;
  ```

### Input Limits
- Max transcript length: 50,000 characters
- Return error if exceeded

## Cache Strategy

### TTL-based cleanup (7 days default)
1. **Background interval:** Run cleanup every 12 hours (catches orphan files)
2. **On server start:** Async scan, non-blocking
3. **On cache access:** Check file mtime if needed

### Cache key format (hashed for security)
```
{md5(video_id + voice)}.mp3
```

Example: `a1b2c3d4e5f6.mp3`

## Text Pre-processing

Before sending to TTS:
- Remove `[Music]`, `[Applause]`, `(Laughter)` artifacts
- Clean up formatting issues
- Optional: Let user edit transcript in UI before synthesis
