# VoxTube - Understanding

## Problem Statement
Users don't want to watch entire YouTube videos - they want to extract the content and listen to it as audio, narrated by a high-quality TTS voice (like a podcast).

## User Workflow
1. Paste YouTube URL into web page
2. App fetches transcript using existing `yt` CLI tool
3. Transcript displayed on page
4. User selects a Kokoro TTS voice
5. App sends transcript to Kokoro TTS server
6. Audio plays back in browser

## Key Requirements
- **Web app** (frontend + backend server)
- **YouTube transcript extraction** via existing CLI tool
- **Kokoro TTS integration** for text-to-speech
- **Voice selection** - let user choose from available Kokoro voices
- **Audio caching** - save generated audio to avoid regeneration
- **Recycling policy** - auto-cleanup old cached audio (LRU or time-based)

## Clarifications Resolved
| Question | Answer |
|----------|--------|
| App type? | Web app (hosted) |
| Audio persistence? | Yes, cache with recycling policy |
| Voice selection? | User chooses from available voices |

## Technical Context
- YouTube transcript tool: `/Users/shawn/youtube-transcribe/yt`
- TTS server: Kokoro (OpenAI-compatible endpoint)
- Kokoro endpoint: `/v1/audio/speech`
