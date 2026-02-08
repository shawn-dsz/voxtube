# Architecture: VoxTube

> Last updated: 2026-02-08 (Tauri Desktop App)

## What VoxTube Does

VoxTube converts YouTube videos into listenable audio. Paste a URL, get a Claude-powered summary narrated by Kokoro TTS. It runs as a local web server (Bun + Hono) with a vanilla HTML/JS frontend, optionally wrapped in a Tauri v2 native desktop window.

```
Paste YouTube URL --> Fetch transcript --> Summarise with Claude --> Narrate with Kokoro TTS --> Play
```

## System Architecture

```
+------------------------------------------------------------------+
|                     Tauri Desktop Shell (Rust)                    |
|                                                                  |
|   main.rs                        lib.rs                          |
|   - ServerState (Mutex<Child>)   - check_port_available()        |
|   - setup(): spawn server        - wait_for_server()             |
|     thread, navigate webview     - start_server()                |
|   - CloseRequested: shutdown     - shutdown_server()             |
|   - RunEvent::Exit: safety net   - setup_logging()               |
|                                                                  |
|   Spawns child process with env vars:                            |
|     PORT=3847                                                    |
|     CACHE_DIR=~/Library/Application Support/com.voxtube.app/     |
|                                                                  |
|   +------------------------------------------------------------+|
|   |                    macOS WebView (WKWebView)                ||
|   |              Navigated to http://localhost:3847              ||
|   +------------------------------------------------------------+|
+------------------------------------------------------------------+
        |
        | Spawns + manages lifecycle of:
        v
+------------------------------------------------------------------+
|                 Bun + Hono Server (TypeScript)                    |
|                    http://localhost:3847                          |
|                                                                  |
|   index.ts (entry point)                                         |
|   - Registers CORS middleware                                    |
|   - Mounts routes under /api/*                                   |
|   - Serves static files from public/                             |
|   - Starts background cache cleanup                              |
|                                                                  |
|   +---------------------------+  +-----------------------------+ |
|   |        Routes             |  |        Services             | |
|   |                           |  |                             | |
|   | GET  /api/health          |  |  youtube.ts                 | |
|   | GET  /api/voices     -----+->|   - extractVideoId()        | |
|   | POST /api/transcript -----+->|   - fetchTranscript()       | |
|   | POST /api/summarize  -----+->|   - fetchVideoMetadata()    | |
|   | POST /api/synthesize -----+->|                             | |
|   | GET  /api/history    -----+->|  anthropic.ts               | |
|   | DELETE /api/history/:id --+->|   - summarizeTranscript()   | |
|   +---------------------------+  |   - summaryToSpeech()       | |
|                                  |                             | |
|                                  |  kokoro.ts                  | |
|                                  |   - synthesize()            | |
|                                  |   - getVoices()             | |
|                                  |   - cleanTranscript()       | |
|                                  |                             | |
|                                  |  cache.ts                   | |
|                                  |   - read/write audio + JSON | |
|                                  |   - TTL expiry + cleanup    | |
|                                  |   - history listing         | |
|                                  +-----------------------------+ |
+------------------------------------------------------------------+
        |                              |
        v                              v
+----------------+             +------------------+
|  claude CLI    |             |  Kokoro TTS      |
| (child process)|             | (HTTP, port 8880)|
|                |             |                  |
| Calls Anthropic|             | OpenAI-compatible|
| API (Sonnet)   |             | /v1/audio/speech |
+----------------+             +------------------+
```

## Data Flow

### Main Use Case: YouTube URL to Audio

```
User pastes YouTube URL
      |
      v
[Frontend: app.js]
      |
      |  1. POST /api/transcript  { url }
      v
[transcript.ts] --> [youtube.ts]
      |                  |
      |     fetch("youtube.com/watch?v=...")  (scrape captions data)
      |     fetch("youtube.com/api/timedtext?...")  (XML transcript)
      |     parse XML --> plain text
      |                  |
      |     fetch("youtube.com/oembed?url=...")  (metadata)
      |
      |  Returns: { videoId, transcript, title, channel }
      v
[Frontend: app.js]  -- displays transcript info
      |
      |  2. POST /api/summarize  { videoId, transcript, title, channel }
      v
[summarize.ts] --> [cache.ts]  -- check summary cache
      |                |
      |    CACHE HIT: return cached summary
      |    CACHE MISS:
      |                v
      |         [anthropic.ts]
      |              |
      |     Bun.spawn(["claude", "--print", "--model", "sonnet", ...])
      |              |
      |     Returns: markdown summary
      |              |
      |     summaryToSpeech(): strip markdown/emoji for TTS
      |     writeSummaryCache(): persist to disk
      |
      |  Returns: { summary (markdown), summaryForSpeech (plain text) }
      v
[Frontend: app.js]  -- renders summary as HTML, user selects voice
      |
      |  3. POST /api/synthesize  { videoId, text, voice }
      v
[synthesize.ts] --> [cache.ts]  -- check audio cache
      |                |
      |    CACHE HIT: return cached MP3
      |    CACHE MISS:
      |                v
      |         [kokoro.ts]
      |              |
      |     fetch("localhost:8880/v1/audio/speech", { model, input, voice })
      |              |
      |     Returns: MP3 audio buffer
      |              |
      |     writeCache(): persist to disk
      |
      |  Returns: binary MP3 (Content-Type: audio/mpeg)
      v
[Frontend: app.js]  -- creates blob URL, sets <audio> src, plays
```

## File Map

```
voxtube/
|
+-- src/                          # Backend (TypeScript, runs on Bun)
|   +-- index.ts                  # Server entry: Hono app, routes, static files
|   +-- config.ts                 # Env-based config with defaults
|   +-- routes/
|   |   +-- transcript.ts         # POST /api/transcript
|   |   +-- summarize.ts          # POST /api/summarize
|   |   +-- synthesize.ts         # POST /api/synthesize
|   |   +-- voices.ts             # GET  /api/voices
|   |   +-- history.ts            # GET  /api/history, DELETE /api/history/:id
|   +-- services/
|       +-- youtube.ts            # URL validation, native transcript fetch, oEmbed metadata
|       +-- anthropic.ts          # Claude CLI spawn, prompt construction, markdown strip
|       +-- kokoro.ts             # TTS HTTP client, voice list, transcript cleaning
|       +-- cache.ts              # File-based cache: audio + summary, TTL, cleanup
|
+-- public/                       # Frontend (vanilla HTML/CSS/JS)
|   +-- index.html                # Single page: sidebar + main content
|   +-- style.css                 # Brutalist dark theme (Space Grotesk + JetBrains Mono)
|   +-- app.js                    # UI logic: fetch, render, play, history
|   +-- favicon.svg               # Waveform icon
|
+-- src-tauri/                    # Desktop shell (Rust, Tauri v2)
|   +-- src/
|   |   +-- main.rs               # App entry: state, setup, event handlers
|   |   +-- lib.rs                # Server lifecycle: spawn, health check, shutdown
|   +-- tauri.conf.json           # Window, bundle, dev config
|   +-- Cargo.toml                # Rust dependencies
|   +-- assets/
|   |   +-- error.html            # Fallback page for startup errors
|   +-- binaries/                 # Compiled server binary (built at package time)
|   +-- icons/                    # App icons (.icns, .png)
|
+-- cache/                        # Runtime cache (gitignored)
|   +-- {md5}_summary.json        # Cached summaries
|   +-- {md5}.mp3                 # Cached audio
|
+-- specs/001-tauri-desktop/      # Feature specification and planning
+-- docs/ARCHITECTURE.md          # This file
```

## Configuration

All configuration lives in `src/config.ts`, read from environment variables:

| Variable               | Default               | Purpose                              |
|------------------------|-----------------------|--------------------------------------|
| `PORT`                 | `3000`                | Server listen port                   |
| `KOKORO_URL`           | `http://localhost:8880` | Kokoro TTS server address          |
| `CACHE_DIR`            | `./cache`             | Cache directory path                 |
| `CACHE_TTL_DAYS`       | `7`                   | Cache expiry in days                 |
| `MAX_TRANSCRIPT_LENGTH`| `50000`               | Max transcript chars to process      |
| `CLEANUP_INTERVAL_HOURS`| `12`                 | Background cleanup frequency         |
| `CLAUDE_CLI_PATH`      | `claude`              | Path to Claude CLI binary            |

In desktop mode, the Tauri Rust layer overrides `PORT` and `CACHE_DIR` via env vars when spawning the server process. The TypeScript code requires zero changes.

## Caching Strategy

Two-tier file-based cache using MD5-hashed filenames (prevents path traversal):

| Type    | Key                    | File                         | Contains                          |
|---------|------------------------|------------------------------|-----------------------------------|
| Summary | `md5(videoId)`         | `{hash}_summary.json`        | Summary text, model, metadata     |
| Audio   | `md5(videoId_voice)`   | `{hash}.mp3`                 | Synthesised MP3 audio             |

Cache behaviour:
- **TTL**: Files older than `CACHE_TTL_DAYS` are deleted during cleanup
- **Cleanup**: Runs on server startup and every `CLEANUP_INTERVAL_HOURS`
- **History**: Derived from `_summary.json` files in the cache directory
- **Deletion**: Per-video deletion removes both summary and all voice variants

## Desktop App Lifecycle

```
User double-clicks VoxTube.app
      |
      v
[main.rs] Tauri Builder starts
      |
      +-- Manages Mutex<ServerState> (holds child process handle)
      +-- Registers window close handler
      +-- Spawns background thread:
            |
            v
      [lib.rs] start_server()
            |
            +-- Detect CPU arch (aarch64 / x86_64)
            +-- Resolve binary from app bundle resources
            +-- Setup log file (~/Library/Application Support/com.voxtube.app/logs/)
            +-- Check port 3847 is free (TCP probe, 200ms timeout)
            +-- Spawn server binary with env vars
            +-- Poll GET /api/health every 200ms (4s timeout)
            |
            v
      Server healthy --> navigate webview to http://localhost:3847
      Server failed  --> show error.html with message
      |
      | ... app runs normally ...
      |
      v
User closes window or quits (Cmd+Q)
      |
      +-- WindowEvent::CloseRequested handler fires
      |     +-- shutdown_server(): SIGTERM, wait 2s, SIGKILL if needed
      |     +-- app.exit(0)
      |
      +-- RunEvent::Exit (safety net, covers force quit)
            +-- shutdown_server() if child still running
```

## External Dependencies

| Dependency      | Type           | Purpose                                | Required |
|-----------------|----------------|----------------------------------------|----------|
| `claude` CLI    | Child process  | Summarise transcripts (Anthropic API)  | Yes      |
| Kokoro TTS      | HTTP (port 8880) | Text-to-speech synthesis             | Yes      |
| YouTube oEmbed  | HTTP           | Video metadata (title, channel)        | Yes      |

YouTube transcript fetching is handled natively via HTTP. The server scrapes the YouTube watch page for captions data and fetches the timedtext XML directly, with no external CLI dependency.

## Security

- **Command injection prevention**: The Claude CLI is spawned via `Bun.spawn()` with array arguments, never shell strings
- **Path traversal prevention**: Cache filenames are MD5 hashes, not user input
- **Input validation**: YouTube URL regex, 11-char video ID format, voice whitelist
- **Input limits**: Transcripts capped at 50,000 characters
- **XSS prevention**: Frontend uses `escapeHtml()` before rendering user content

## Technology Decisions

| Decision     | Choice       | Rationale                               |
|--------------|--------------|-----------------------------------------|
| Runtime      | Bun          | Fast startup, built-in TS, compile to binary |
| Framework    | Hono         | Minimal, fast, runs on Bun natively     |
| Frontend     | Vanilla JS   | No build step, instant load             |
| Cache        | File system   | Simple, inspectable, no extra services  |
| TTS          | Kokoro       | Local, high quality, free               |
| Summarisation| Claude CLI   | Best quality, no SDK dependency         |
| Desktop      | Tauri v2     | Small binary, native webview, Rust safety |
| Process mgmt | std::process | Simpler than Tauri sidecar plugin       |
