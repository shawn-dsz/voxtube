# Review Round 2 - Codex

## CRITICAL
1. macOS window close doesn't exit app — need WindowEvent::CloseRequested handler to also kill child
2. FR-006 says "sidecar" but plan uses bundle.resources — spec/plan mismatch

## HIGH
3. Health check timeout 10s violates 5s UI constraint
4. beforeDevCommand missing --watch flag for hot reload

## MEDIUM
5. Build script only covers arm64, not x64
6. Port check should distinguish ConnectionRefused from other errors
