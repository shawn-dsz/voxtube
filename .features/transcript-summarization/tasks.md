# Transcript Summarization - Tasks

## Task 1: Add Anthropic SDK dependency
- [ ] Run `bun add @anthropic-ai/sdk`
- [ ] Verify installation

## Task 2: Update configuration
- [ ] Add `ANTHROPIC_API_KEY` to `src/config.ts`
- [ ] Update `.env.example` with placeholder

## Task 3: Create Anthropic service
- [ ] Create `src/services/anthropic.ts`
- [ ] Implement `summarizeTranscript()` function
- [ ] Use structured prompt from plan

## Task 4: Add summary caching
- [ ] Add `getSummaryFromCache()` to cache service
- [ ] Add `saveSummaryToCache()` to cache service
- [ ] Use `{videoId}_summary.json` format

## Task 5: Create summarize route
- [ ] Create `src/routes/summarize.ts`
- [ ] Implement `POST /api/summarize`
- [ ] Check cache first, then call Claude
- [ ] Return structured summary

## Task 6: Register route in server
- [ ] Import and register `/api/summarize` route in `src/index.ts`

## Task 7: Update frontend
- [ ] Add summarize step after transcript fetch
- [ ] Call `/api/summarize` endpoint
- [ ] Display summary in textarea
- [ ] Update generate audio to use summary text

## Task 8: Test end-to-end
- [ ] Test with real YouTube URL
- [ ] Verify summary format
- [ ] Verify audio generation from summary
- [ ] Verify caching works
