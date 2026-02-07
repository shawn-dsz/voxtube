# Data Model: Tauri Desktop App

No new data entities introduced. The existing cache data model (CachedSummary, HistoryItem) is unchanged.

The only change is the **location** of cached files:
- Before: `./cache/` (relative to project root)
- After: `~/Library/Application Support/com.voxtube.app/cache/` (macOS standard)

File formats remain identical:
- `{md5(videoId)}_summary.json` — summary cache
- `{md5(videoId + '_' + voice)}.mp3` — audio cache
