# VoxTube - Task Breakdown

## Critical Path (Sequential)

### Task 1: Project Setup
**WHY FIRST:** Foundation for all other tasks
- Initialize Bun project
- Install dependencies (hono, typescript)
- Create directory structure
- Setup .env and config
- **Blocked by:** nothing
- **Blocks:** Tasks 2, 3, 4

### Task 2: YouTube Service
**WHY THIS ORDER:** Core data source, needed before UI can work
- Create `src/services/youtube.ts`
- URL validation (regex)
- Video ID extraction
- Spawn yt CLI with array args (safe)
- Return transcript text
- **Blocked by:** Task 1
- **Blocks:** Task 5

### Task 3: Kokoro TTS Service
**WHY THIS ORDER:** Core functionality, needed for audio generation
- Create `src/services/kokoro.ts`
- Fetch available voices from Kokoro
- Text-to-speech synthesis
- Text pre-processing (remove [Music] etc)
- Handle errors gracefully
- **Blocked by:** Task 1
- **Blocks:** Task 5

### Task 4: Cache Service
**WHY THIS ORDER:** Needed for synthesize route
- Create `src/services/cache.ts`
- Hash-based cache keys (MD5)
- TTL checking
- Background cleanup (12h interval)
- Async startup scan
- **Blocked by:** Task 1
- **Blocks:** Task 5

### Task 5: API Routes
**WHY THIS ORDER:** Depends on all services
- Create `src/routes/voices.ts` - GET /api/voices
- Create `src/routes/transcript.ts` - POST /api/transcript
- Create `src/routes/synthesize.ts` - POST /api/synthesize
- Input validation
- Error handling
- **Blocked by:** Tasks 2, 3, 4
- **Blocks:** Task 6

### Task 6: Frontend UI
**WHY THIS ORDER:** Needs API to be working
- Create `public/index.html`
- Create `public/style.css`
- Create `public/app.js`
- URL input + paste handler
- Voice selector dropdown
- Transcript display (editable?)
- Generate button
- Audio player
- Loading states
- Error display
- **Blocked by:** Task 5
- **Blocks:** Task 7

### Task 7: Integration & Polish
**WHY LAST:** Final touches
- README with setup instructions
- .env.example
- Test full flow
- Error edge cases
- **Blocked by:** Task 6
- **Blocks:** nothing

## Parallel Opportunities
- Tasks 2, 3, 4 can run in parallel (all depend only on Task 1)

## Task Status
- [ ] Task 1: Project Setup
- [ ] Task 2: YouTube Service
- [ ] Task 3: Kokoro TTS Service
- [ ] Task 4: Cache Service
- [ ] Task 5: API Routes
- [ ] Task 6: Frontend UI
- [ ] Task 7: Integration & Polish
