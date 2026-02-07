# Review Round 1 - Codex

## Review Summary
Plan is directionally sound but has spec mismatches and operational gaps around dev workflow, cache path, sidecar handling, and lifecycle robustness.

## CRITICAL Issues

1. **Dev workflow Tauri v2 config**: `beforeDevCommand`/`devPath` not properly specified. `tauri dev` won't auto-start Bun server.
2. **Cache path mismatch**: Data model says `com.voxtube.app`, spec FR-004 says `VoxTube`. Need alignment.
3. **Sidecar vs Command conflict**: Plan says "use std::process::Command" but also mentions "External binaries config in tauri.conf.json". Pick one approach.

## HIGH Issues

1. **Process lifecycle**: `on_window_event` doesn't catch Cmd+Q or app crash. Need `RunEvent::Exit` handler.
2. **Rolling logs**: FR-007 says "rolling log files" but plan only opens a single file. Need rotation.
3. **Port error display**: No mechanism for showing error in webview if server fails to start.
4. **frontendDist misuse**: Can't point `frontendDist` to a URL in production. Need bootstrap page + runtime URL load.
5. **Health check route**: Need to verify `/api/health` exists in current server.

## MEDIUM Issues

1. Only aarch64 binary planned; spec says Apple Silicon + Intel.
2. yt CLI path is hardcoded absolute path.
3. File handle for logging may be dropped.
4. SC-004 ("zero changes to src/") conflicts with Phase 3 (CLI args changes).

## LOW Issues

1. No graceful SIGTERM before SIGKILL on close.
2. No dynamic port assignment.

## Verdict
NEEDS_REVISION
