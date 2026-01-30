# Transcript Summarization - Technical Plan

## Architecture Changes

### New Components

1. **Anthropic Service** (`src/services/anthropic.ts`)
   - Wraps Anthropic SDK
   - `summarizeTranscript(transcript: string, metadata?: VideoMetadata): Promise<Summary>`
   - Uses claude-3-5-sonnet for speed/quality balance

2. **Summarize Route** (`src/routes/summarize.ts`)
   - `POST /api/summarize`
   - Input: `{ videoId, transcript, title?, channel? }`
   - Output: `{ summary: string, videoId: string }`

### Modified Components

1. **Frontend** (`public/app.js`, `public/index.html`)
   - Add "Summarize" step between fetch transcript and generate audio
   - Show summary in textarea instead of raw transcript
   - Optional: toggle between summary and full transcript

2. **Cache Service** (`src/services/cache.ts`)
   - Add summary caching: `{videoId}_summary.json`

## Data Flow

```
User pastes URL
      │
      ▼
POST /api/transcript { url }
      │
      ▼
Returns { videoId, transcript, title?, channel? }
      │
      ▼
POST /api/summarize { videoId, transcript, title, channel }
      │
      ├── Cache hit → Return cached summary
      │
      └── Cache miss → Call Claude API
                            │
                            ▼
                      Parse structured response
                            │
                            ▼
                      Cache summary
                            │
                            ▼
                      Return summary
      │
      ▼
Frontend displays summary
      │
      ▼
User clicks "Generate Audio"
      │
      ▼
POST /api/synthesize { videoId, text: summary, voice }
```

## Summary Format (for TTS)

The structured format needs to be TTS-friendly. Will convert markdown to spoken text:
- "📺" → "Video:"
- "### 🎯 TL;DR" → "TL;DR:"
- Bullet points read naturally
- Skip emoji or convert to words

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM | Claude 3.5 Sonnet | Fast, high quality, familiar API |
| SDK | @anthropic-ai/sdk | Official, typed, maintained |
| Cache | File-based JSON | Consistent with existing cache |
| Cache key | `{videoId}_summary.json` | Simple, consistent |

## Tasks

1. Add `@anthropic-ai/sdk` dependency
2. Create `src/services/anthropic.ts` with summarization logic
3. Create `src/routes/summarize.ts` endpoint
4. Update cache service for summary caching
5. Update frontend to call summarize after transcript
6. Update frontend UI to display summary
7. Add `ANTHROPIC_API_KEY` to config

## Prompt Template

```
You are a YouTube video summarizer that produces clear, actionable summaries.

Given this video transcript, produce a summary in the following format:

## 📺 {title}

**Duration:** {duration} | **Channel:** {channel}

### 🎯 TL;DR
> [1-2 sentence summary]

### 🔑 Key Points
1. [Point 1]
2. [Point 2]
...

### 💡 Notable Insights
- [Insight 1]
- [Insight 2]

### ⚡ Action Items (if applicable)
- [ ] [Action 1]
- [ ] [Action 2]

### 🔗 Related
- Connects to: [topics]

Guidelines:
- Be concise - for quick consumption
- Highlight surprises - what's non-obvious
- Skip filler - intros, outros, sponsor reads
- Preserve nuance - don't oversimplify

TRANSCRIPT:
{transcript}
```

## File Changes Summary

| File | Change |
|------|--------|
| `package.json` | Add @anthropic-ai/sdk |
| `src/config.ts` | Add ANTHROPIC_API_KEY |
| `src/services/anthropic.ts` | New - Claude summarization |
| `src/routes/summarize.ts` | New - /api/summarize endpoint |
| `src/index.ts` | Register new route |
| `src/services/cache.ts` | Add summary caching functions |
| `public/app.js` | Add summarize step, update UI |
| `public/index.html` | Minor UI updates |
| `.env.example` | Add ANTHROPIC_API_KEY |
