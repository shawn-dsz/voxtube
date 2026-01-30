# Transcript Summarization Feature - Understanding

## Problem Statement
Users don't want to listen to the entire YouTube video transcript - they want a concise, actionable summary that captures the key points, delivered as audio.

## Current State
- App fetches YouTube transcript and displays full text
- User can generate TTS audio from transcript
- No summarization - users must listen to everything

## Desired State
After fetching transcript:
1. **Summarize** using Claude API with structured format
2. **Display summary** (not full transcript) on page
3. **Generate audio** from the summary
4. User listens to condensed, valuable content

## Summary Format Requirements
The summary must follow this structure:
```
## 📺 [Video Title]

**Duration:** [X minutes] | **Channel:** [Channel name]

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
```

## Guidelines for Summarization
- Be concise - for quick consumption
- Highlight surprises - what's non-obvious
- Skip filler - intros, outros, sponsor reads
- Preserve nuance - don't oversimplify
- Note timestamps for key moments if useful

## Technical Approach
- Use Anthropic API (Claude) for summarization
- API key from environment variable `ANTHROPIC_API_KEY`
- Call happens server-side after transcript fetch
- Cache summaries alongside audio to avoid re-summarizing

## Key Requirements
1. Add `/api/summarize` endpoint (or integrate into transcript flow)
2. Use Claude API with structured prompt
3. Update frontend to show summary instead of raw transcript
4. Generate audio from summary text only
