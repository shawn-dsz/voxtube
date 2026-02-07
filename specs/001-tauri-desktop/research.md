# Research: Tauri Desktop App

## Tauri v2 Sidecar vs std::process::Command

**Decision**: Use `std::process::Command` directly in Rust `setup()` hook.

Tauri's formal sidecar system (`tauri-plugin-shell`) is designed for bundling external binaries with the app. However, it adds complexity:
- Requires the shell plugin dependency
- Binary naming conventions (`binary-name-{arch}-{os}`)
- Plugin permissions in capabilities

For this use case, spawning a child process directly is simpler:
- Full control over process lifecycle
- No plugin dependencies
- Direct access to stdout/stderr for logging
- Process handle stored in Tauri managed state for cleanup

## Bun Compile

`bun build --compile src/index.ts --outfile voxtube-server` produces a standalone binary that:
- Includes the Bun runtime
- Bundles all TypeScript source and dependencies
- Loads `.env` automatically (Bun behavior)
- Size: ~50-80MB depending on dependencies

The compiled binary accepts the same CLI args and env vars as the source.

Note: `bun build --compile` bundles npm dependencies but NOT external binaries like `yt`. The `yt` CLI must be bundled separately.

## Port Conflict Detection

Before spawning the server, attempt a TCP connection to `localhost:3847`:
- If connection succeeds → port is in use → show error
- If connection refused → port is free → proceed

In Rust: `TcpStream::connect_timeout(&addr, Duration::from_millis(100))`

## macOS App Data Directory

Tauri provides `app.path().app_data_dir()` which resolves to:
`~/Library/Application Support/{bundle-identifier}/`

For `com.voxtube.app` this is:
`~/Library/Application Support/com.voxtube.app/`

Subdirectories:
- `cache/` — audio and summary cache files
- `logs/` — server stdout/stderr logs

## yt CLI Bundling

The `yt` CLI at `/Users/shawn/proj/youtube-transcribe/yt` is a Bun-compiled binary. It can be copied into the Tauri resources directory and referenced via `app.path().resource_dir()` at runtime.

Alternative: Also compile `yt` with `bun build --compile` if the source is available, ensuring it's a standalone binary with no runtime dependencies.
