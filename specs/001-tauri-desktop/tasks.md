# Tasks: Tauri Desktop App

**Input**: Design documents from `/specs/001-tauri-desktop/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

## Phase 1: Setup

- [ ] T001 Initialize Tauri v2 project: create `src-tauri/` directory structure
- [ ] T002 Write `src-tauri/Cargo.toml` with dependencies (tauri 2, reqwest, serde, serde_json)
- [ ] T003 [P] Write `src-tauri/build.rs` (standard Tauri build script)
- [ ] T004 [P] Write `src-tauri/capabilities/default.json` with `core:default`
- [ ] T005 Write `src-tauri/tauri.conf.json` with frontendDist, devUrl, beforeDevCommand, window config, bundle.resources
- [ ] T006 [P] Write `src-tauri/assets/error.html` — styled fallback error page with message placeholder
- [ ] T007 Add `@tauri-apps/cli` dev dependency and tauri scripts to `package.json`

---

## Phase 2: Foundational — Rust Process Manager

- [ ] T008 [US1] Implement `check_port_available(port)` in `src-tauri/src/lib.rs` — TCP connect with ConnectionRefused/Ok/error handling
- [ ] T009 [US1] Implement `wait_for_server(port, timeout)` in `src-tauri/src/lib.rs` — poll GET /api/health every 200ms, 4s timeout
- [ ] T010 [US1] Implement `setup_logging(app_data_dir)` in `src-tauri/src/lib.rs` — date-stamped log file, 7-day cleanup
- [ ] T011 [US1] Implement `start_server(app)` in `src-tauri/src/lib.rs` — arch detection, resource resolution, env var spawn, health check
- [ ] T012 [US1] Implement `shutdown_server(child)` in `src-tauri/src/lib.rs` — SIGTERM, 2s wait, SIGKILL
- [ ] T013 [US1] Write `src-tauri/src/main.rs` — ServerState struct, Builder setup, managed state, window close handler, RunEvent::Exit handler

**Checkpoint**: Tauri app compiles and runs `tauri dev` with Bun server auto-starting

---

## Phase 3: User Story 1 — Launch as Desktop App (P1)

**Goal**: Double-click launches native window with full VoxTube functionality
**Independent Test**: `bun run tauri:dev` opens window, paste YouTube URL, full workflow works

- [ ] T014 [US1] Wire up setup() to call start_server(), navigate webview to localhost:3847 on success
- [ ] T015 [US1] Wire up setup() error path — display error.html with port conflict or server failure message
- [ ] T016 [US1] Wire up WindowEvent::CloseRequested to call shutdown_server() + app.exit(0)
- [ ] T017 [US1] Wire up RunEvent::Exit safety net to call shutdown_server() if child still running
- [ ] T018 [US1] Test: run `bun run tauri:dev`, verify window opens, UI loads, full workflow (transcript → summary → audio)
- [ ] T019 [US1] Test: close window, verify no orphan bun/voxtube-server processes (`ps aux | grep voxtube`)

**Checkpoint**: US1 complete — app launches and all functionality works

---

## Phase 4: User Story 2 — Cache Persistence (P2)

**Goal**: Cache persists across app sessions
**Independent Test**: Process video, close app, reopen, verify history + cached audio

- [ ] T020 [US2] Verify cache directory is created at `app_data_dir/cache/` on first run
- [ ] T021 [US2] Test: process a video, close app, reopen — history sidebar shows the video
- [ ] T022 [US2] Test: generate audio, close app, reopen — audio plays from cache (X-Cache: HIT)

**Checkpoint**: US2 complete — cache works across sessions

---

## Phase 5: User Story 3 — Error Handling (P3)

**Goal**: Graceful errors when dependencies unavailable
**Independent Test**: Stop Kokoro, attempt synthesis, verify error message

- [ ] T023 [US3] Test: stop Kokoro Docker, attempt audio synthesis — verify "TTS server not available" error
- [ ] T024 [US3] Test: start app with port 3847 already in use — verify error.html displays with message
- [ ] T025 [US3] Test: remove yt CLI from resource path — verify error on transcript fetch

**Checkpoint**: US3 complete — all error scenarios handled gracefully

---

## Phase 6: Build Pipeline

- [ ] T026 [P] Compile server binary (arm64): `bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile src-tauri/binaries/voxtube-server-aarch64`
- [ ] T027 [P] Compile server binary (x64): `bun build --compile --target=bun-darwin-x64 src/index.ts --outfile src-tauri/binaries/voxtube-server-x86_64`
- [ ] T028 Copy yt CLI binary to `src-tauri/binaries/yt`
- [ ] T029 Generate app icons from `public/favicon.svg`
- [ ] T030 Run `bun run tauri:build` — verify .app bundle is produced in `src-tauri/target/release/bundle/macos/`
- [ ] T031 Test: launch VoxTube.app from bundle, verify full workflow works

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 3 (need working app to test cache)
- **Phase 5 (US3)**: Depends on Phase 3 (need working app to test errors)
- **Phase 6 (Build)**: Depends on Phase 3 (need working app to compile)

### Parallel Opportunities

- T003, T004, T006 can run in parallel (independent files)
- T026, T027 can run in parallel (independent compile targets)
- Phase 4 and Phase 5 can run in parallel after Phase 3
