# Implementation Plan: Tauri Desktop App

**Branch**: `001-tauri-desktop` | **Date**: 2026-02-08 | **Spec**: `specs/001-tauri-desktop/spec.md`

## Summary

Convert VoxTube from a manually-started Bun+Hono web server into a Tauri v2 desktop application. The Bun server is compiled into a standalone binary and bundled as a Tauri resource. Rust manages process lifecycle (spawn, health check, graceful shutdown, logging). The existing frontend loads in Tauri's webview via runtime URL navigation after the server is confirmed healthy.

## Technical Context

**Language/Version**: Rust (Tauri v2 backend) + TypeScript/Bun (existing server, compiled to binary)
**Primary Dependencies**: Tauri v2, reqwest (health check polling), serde/serde_json
**Storage**: File-based cache in app data dir (resolved via `app.path().app_data_dir()`)
**Testing**: Manual integration testing (launch app, verify workflow)
**Target Platform**: macOS (Apple Silicon + Intel)
**Project Type**: Desktop app wrapping existing web app
**Constraints**: App must launch and show UI within 5 seconds; zero orphan processes on close
**Scale/Scope**: Single-user personal tool

## Constitution Check

Constitution is a blank template (no project-specific constraints defined). No gates to enforce.

## Project Structure

### Documentation (this feature)

```text
specs/001-tauri-desktop/
├── spec.md
├── plan.md              # This file
├── research.md
├── data-model.md
├── quickstart.md
├── clarifications.log
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
# Existing (unchanged — env vars set by Rust spawner)
src/
├── index.ts             # Hono server entry point (unchanged)
├── config.ts            # Configuration (unchanged — reads from process.env)
├── services/            # All unchanged
└── routes/              # All unchanged

public/                  # All unchanged (served by Bun server)

# New (Tauri shell)
src-tauri/
├── Cargo.toml
├── build.rs
├── tauri.conf.json
├── capabilities/
│   └── default.json
├── assets/
│   └── error.html       # Fallback error page (port conflict, server crash)
├── icons/               # App icons
└── src/
    ├── main.rs          # Entry point, builder, RunEvent handlers
    └── lib.rs           # Server lifecycle, health check, logging, port check
```

**Structure Decision**: Tauri's standard `src-tauri/` directory alongside existing project. No existing source files are modified — the Rust spawner sets env vars that `src/config.ts` already reads.

## Implementation Phases

### Phase 0: Research (resolved)

- **Binary management**: Use `std::process::Command` exclusively (NOT Tauri sidecar plugin). Binaries are bundled as Tauri resources via `tauri.conf.json` `bundle.resources`. Resolved at runtime via `app.path().resource_dir()`.
- **Bun compile**: `bun build --compile src/index.ts --outfile voxtube-server` produces a standalone binary. Build both `aarch64` and `x86_64` targets for universal macOS support.
- **Cache path**: Use `app.path().app_data_dir()` (resolves to `~/Library/Application Support/com.voxtube.app/`). Pass to server via `CACHE_DIR` env var.
- **Frontend loading**: `frontendDist` in `tauri.conf.json` points to a local bootstrap directory (`src-tauri/assets/`) containing `error.html`. After server health check passes, Rust navigates the webview to `http://localhost:3847` at runtime via `window.navigate()`.
- **Port checking**: `TcpStream::connect_timeout` before spawn. On failure, load `error.html` with the error message.
- **Health check**: The existing server has `GET /api/health` (in `src/index.ts`). Confirmed present.

### Phase 1: Tauri Scaffolding

1. Create `src-tauri/` directory structure
2. Write `Cargo.toml`:
   - `tauri 2` with features `[]`
   - `tauri-build 2`
   - `serde`, `serde_json`
   - `reqwest` (for health polling)
   - `md5` (not needed — no cache logic in Rust)
3. Write `tauri.conf.json`:
   - `build.frontendDist`: `"./assets"` (local bootstrap/error page)
   - `build.beforeDevCommand`: `"bun run --watch src/index.ts"` (auto-starts server with hot reload in dev)
   - `build.devUrl`: `"http://localhost:3847"` (dev webview points here)
   - Window: 1200x800, title "VoxTube", decorations true
   - `app.withGlobalTauri`: false
   - Bundle identifier: `com.voxtube.app`
   - `bundle.resources`: `["binaries/*"]` (compiled server + yt CLI)
4. Write `capabilities/default.json` with `core:default`
5. Write `build.rs` (standard Tauri build script)
6. Write `src-tauri/assets/error.html` — minimal styled error page with message placeholder

### Phase 2: Rust Process Manager

`src-tauri/src/lib.rs` (~120 lines):

1. **`check_port_available(port: u16) -> bool`**
   - `TcpStream::connect_timeout(&addr, Duration::from_millis(200))`
   - `ConnectionRefused` → port is free (return `true`)
   - `Ok(_)` (connection succeeded) → port is in use (return `false`)
   - Any other error (timeout, permission, network) → treat as unavailable (return `false`) with logged warning

2. **`wait_for_server(port: u16, timeout: Duration) -> Result<()>`**
   - Poll `GET http://localhost:{port}/api/health` every 200ms
   - Timeout after 4 seconds (must fit within 5s SC-001 constraint including spawn overhead)
   - Returns error if timeout exceeded

3. **`setup_logging(app_data_dir: &Path) -> Result<(File, File)>`**
   - Create `logs/` subdirectory
   - Open date-stamped log file: `voxtube-YYYY-MM-DD.log`
   - Return (stdout_file, stderr_file) — kept alive in managed state
   - Clean up log files older than 7 days

4. **`start_server(app: &AppHandle) -> Result<Child>`**
   - Select correct server binary based on `std::env::consts::ARCH`:
     - `"aarch64"` → `voxtube-server-aarch64`
     - `"x86_64"` → `voxtube-server-x86_64`
   - Resolve resource dir for server binary and yt CLI
   - Resolve app data dir for cache and logs
   - Check port available → if not, return error
   - Spawn server process with env overrides:
     - `CACHE_DIR={app_data_dir}/cache`
     - `YT_CLI_PATH={resource_dir}/yt`
     - `PORT=3847`
   - Redirect stdout/stderr to log files
   - Wait for health check
   - Return child process handle

   **Note**: Using env vars (not CLI args) means `src/config.ts` needs zero changes — it already reads from env vars. This eliminates the need for Phase 3 entirely.

5. **`shutdown_server(child: &mut Child)`**
   - Send SIGTERM
   - Wait up to 2 seconds for exit
   - If still running, SIGKILL

`src-tauri/src/main.rs` (~40 lines):

1. Define `ServerState` struct holding `Option<Child>`, log file handles
2. `tauri::Builder::default()`
3. `.manage(Mutex::new(ServerState::default()))`
4. `.setup(|app| { ... })`
   - Call `start_server(app)`
   - If success: store child in state, navigate webview to `http://localhost:3847`
   - If error: load error.html with message via `window.eval()` or leave on error page
5. Handle window close: In `.setup()`, register a `WindowEvent::CloseRequested` listener on the main window that calls `shutdown_server()` and then `app.exit(0)`. This ensures closing the window kills the server on macOS (where closing window != quitting app).
6. `.build()` then `.run(|app, event| { ... })`
   - Match on `RunEvent::Exit` as a safety net
   - Call `shutdown_server()` on the stored child if still running
   - Between `CloseRequested` handler and `RunEvent::Exit`, all exit paths are covered (Cmd+Q, window close, Force Quit)

### Phase 3: Server Config (SIMPLIFIED)

~~CLI arg parsing~~ **No changes needed to `src/config.ts`.**

The Rust process manager sets environment variables when spawning the child process. Since `src/config.ts` already reads from `process.env`, no TypeScript changes are required:

```rust
Command::new(server_path)
    .env("CACHE_DIR", cache_dir)
    .env("YT_CLI_PATH", yt_cli_path)
    .env("PORT", "3847")
    .spawn()
```

This preserves SC-004 ("zero changes to existing src/ service files").

### Phase 4: Build Pipeline

1. **Compile server** (both architectures):
   ```bash
   bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile src-tauri/binaries/voxtube-server-aarch64
   bun build --compile --target=bun-darwin-x64 src/index.ts --outfile src-tauri/binaries/voxtube-server-x86_64
   ```
2. **Copy yt CLI**: Copy from youtube-transcribe project to `src-tauri/binaries/yt`
3. **Generate icons**: Convert `public/favicon.svg` to required Tauri icon sizes
4. **Package.json scripts**:
   ```json
   {
     "tauri:dev": "tauri dev",
     "tauri:build": "bun run build:server && tauri build",
     "build:server": "bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile src-tauri/binaries/voxtube-server-aarch64 && bun build --compile --target=bun-darwin-x64 src/index.ts --outfile src-tauri/binaries/voxtube-server-x86_64"
   }
   ```

### Phase 5: Dev Workflow

In development, `tauri.conf.json` handles everything:
- `beforeDevCommand: "bun run --watch src/index.ts"` starts the Bun server with hot reload
- `devUrl: "http://localhost:3847"` loads the webview from the running server
- The Rust `setup()` detects dev mode (no resource dir binaries) and skips spawning a child process
- `tauri dev` opens the native window with hot reload via Bun's `--watch`

## Complexity Tracking

No constitution violations to justify.
