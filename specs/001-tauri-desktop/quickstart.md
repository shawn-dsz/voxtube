# Quickstart: VoxTube Desktop

## Prerequisites

- Rust toolchain (`rustup`)
- Bun runtime
- Tauri CLI: `bun add -D @tauri-apps/cli`

## Development

```bash
# Start the Tauri dev window (auto-starts Bun server)
bun run tauri:dev
```

This opens a native window loading from `http://localhost:3847`. The Bun server runs with hot reload.

## Production Build

```bash
# Compile server + build macOS app bundle
bun run tauri:build
```

Output: `src-tauri/target/release/bundle/macos/VoxTube.app`

## Standalone Server (no Tauri)

The original web server still works:

```bash
bun run dev    # Development with watch mode
bun run start  # Production
```

## External Dependencies

The desktop app bundles everything except:
- **Kokoro TTS**: Must be running at `http://localhost:8880` (Docker container)
- **Claude CLI**: Must be in PATH (for summarization)

## Logs

Server logs are written to:
```
~/Library/Application Support/com.voxtube.app/logs/
```

## Cache

Audio and summary cache stored at:
```
~/Library/Application Support/com.voxtube.app/cache/
```
