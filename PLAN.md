# Plan: Convert VoxTube to a Tauri Desktop App

## Context

VoxTube is currently a Bun+Hono web server that you have to start manually (`bun run dev`) and then open in a browser. The goal is to wrap it in a Tauri v2 desktop app so you double-click to launch it — no terminal, no manual server start.

## Approach: Tauri + Embedded Bun Sidecar

Rather than rewriting ~400 lines of working TypeScript into Rust, we'll use Tauri's **sidecar** capability to embed and auto-launch the existing Bun server. Tauri provides the native window, and the Bun server runs as a managed child process.

**Why this approach:**
- Zero rewrite of backend logic — all services (YouTube, Claude, Kokoro, cache) stay as-is
- Zero rewrite of frontend — `app.js` keeps its `fetch('/api/...')` calls
- Tauri just provides the native macOS window + process lifecycle management
- The Bun server starts when the app launches and stops when the app closes

## Files to Create

### 1. `src-tauri/Cargo.toml`
Standard Tauri v2 dependencies: `tauri`, `serde`, `serde_json`, `tauri-build`.

### 2. `src-tauri/build.rs`
Standard Tauri build script (3 lines).

### 3. `src-tauri/tauri.conf.json`
Key configuration:
- `frontendDist`: `"http://localhost:3847"` — Tauri's webview loads from the Bun server
- Window: 1200x800, title "VoxTube", dark background
- No `beforeDevCommand`/`beforeBuildCommand` — we manage the server ourselves in Rust

### 4. `src-tauri/capabilities/default.json`
Minimal permissions: `core:default`.

### 5. `src-tauri/src/main.rs` (~40 lines)
- On app `setup`, spawn `bun run src/index.ts` as a child process
- Wait for the server to be ready (poll `http://localhost:3847/api/health`)
- On app exit, kill the child process
- Store the child process handle so it gets cleaned up

### 6. `src-tauri/src/lib.rs`
Tauri plugin registration (standard boilerplate).

## Files to Modify

### 7. `package.json`
Add `@tauri-apps/cli` as a dev dependency and tauri scripts:
```json
"scripts": {
  "dev": "bun run --watch src/index.ts",
  "start": "bun run src/index.ts",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

### 8. `public/index.html`
No changes needed — asset paths like `/style.css` and `/app.js` are served by the Bun server, so absolute paths work fine.

### 9. `public/app.js`
No changes needed — `fetch('/api/...')` calls hit the Bun server which is running on the same origin the webview loads from.

## How It Works

```
User launches VoxTube.app
  └─ Tauri starts native window
  └─ Rust setup() spawns: bun run src/index.ts
  └─ Rust polls localhost:3847/api/health until ready
  └─ Tauri webview navigates to http://localhost:3847
  └─ User interacts normally (all fetch() calls hit local server)
  └─ User closes window → Rust kills the Bun child process
```

## Build & Run

**Development:**
```bash
cd /Users/shawn/proj/voxtube
bun run tauri:dev
```

**Production build:**
```bash
bun run tauri:build
# Produces: src-tauri/target/release/bundle/macos/VoxTube.app
```

For production, we'll need to either:
- Bundle the `bun` binary + source files into the app (via Tauri's resources)
- Or use `bun build --compile` to create a standalone executable sidecar

For now, we'll start with the dev workflow (assumes `bun` is in PATH) and can add standalone compilation later.

## Verification

1. Run `bun run tauri:dev` — should open a native window showing VoxTube
2. Paste a YouTube URL — transcript fetch, summarization, and audio generation should all work
3. Close the window — verify the Bun server process is killed (no orphan `bun` processes)
4. Check that cache still works (reopen app, history should show previous entries)
