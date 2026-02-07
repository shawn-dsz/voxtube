# Round 1 Fixes Applied

## CRITICAL Fixes

1. **Dev workflow config**: Added `build.beforeDevCommand` and `build.devUrl` to tauri.conf.json spec. Dev mode now auto-starts Bun server.

2. **Cache path alignment**: Unified all references to use `app.path().app_data_dir()` which resolves to `~/Library/Application Support/com.voxtube.app/`. Updated FR-004 in spec.

3. **Sidecar vs Command conflict**: Resolved by using `std::process::Command` exclusively with `bundle.resources` for binary packaging (NOT Tauri sidecar plugin). Removed "External binaries config" reference.

## HIGH Fixes

1. **Process lifecycle**: Changed from `on_window_event` to `RunEvent::ExitRequested` / `RunEvent::Exit` handlers via `.build().run()` pattern. Catches Cmd+Q and all exit paths.

2. **Rolling logs**: Changed to date-stamped log files (`voxtube-YYYY-MM-DD.log`) with cleanup of files older than 7 days. Updated FR-007 in spec.

3. **Port error display**: Added `src-tauri/assets/error.html` as fallback page. `frontendDist` points to assets dir; server URL loaded at runtime via `window.navigate()` after health check.

4. **frontendDist misuse**: Changed from URL to local `./assets` directory. Production app loads error.html initially, then navigates to localhost after server is healthy.

5. **Health check route**: Confirmed `/api/health` exists in `src/index.ts`.

## Additional Improvements

- **SC-004 preserved**: Eliminated CLI arg changes to config.ts by using env var overrides in `Command::new().env()`. Zero TypeScript changes needed.
- **Both architectures**: Build pipeline now compiles aarch64 and x86_64 binaries.
- **Graceful shutdown**: Added SIGTERM → wait 2s → SIGKILL sequence.
- **Log file handles**: Kept in managed state to prevent premature drop.
