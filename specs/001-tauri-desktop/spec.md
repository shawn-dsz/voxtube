# Feature Specification: Tauri Desktop App

**Feature Branch**: `001-tauri-desktop`
**Created**: 2026-02-08
**Status**: Draft
**Input**: Convert VoxTube from a Bun+Hono web server into a Tauri v2 desktop application

## User Scenarios & Testing

### User Story 1 - Launch VoxTube as Desktop App (Priority: P1)

User double-clicks VoxTube.app (or runs `bun run tauri:dev` during development). A native macOS window opens showing the VoxTube UI. The Bun server starts automatically in the background — no terminal interaction needed. All existing functionality (transcript fetch, summarization, audio generation, history) works identically to the web version.

**Why this priority**: This is the entire feature. Without the app launching and the server running, nothing else works.

**Independent Test**: Launch the app, verify the window opens and the UI loads. Paste a YouTube URL and confirm the full workflow (transcript -> summary -> audio) completes.

**Acceptance Scenarios**:

1. **Given** VoxTube.app is launched, **When** the Tauri window opens, **Then** the Bun server starts automatically and the UI loads within 5 seconds
2. **Given** the app is running, **When** user pastes a YouTube URL and clicks "INITIATE SEQUENCE", **Then** transcript is fetched, summarized, and displayed identically to the web version
3. **Given** the app is running, **When** user selects a voice and clicks "SYNTHESIZE AUDIO", **Then** audio is generated via Kokoro TTS and plays in the embedded player
4. **Given** the app is running, **When** user closes the window, **Then** the Bun server child process is killed (no orphan processes)

---

### User Story 2 - Cache Persistence Across Sessions (Priority: P2)

User processes a video, closes the app, reopens it. The history sidebar shows previously processed videos and cached audio can be replayed without re-generating.

**Why this priority**: Cache persistence is already implemented in the file system. This story validates it still works through the Tauri wrapper.

**Independent Test**: Process a video, close app, reopen, verify history shows the video and cached audio plays.

**Acceptance Scenarios**:

1. **Given** a video was previously processed and cached, **When** the app is reopened, **Then** the history sidebar lists the video
2. **Given** cached audio exists for a video, **When** user clicks the history item and generates audio, **Then** audio loads from cache (X-Cache: HIT) without calling Kokoro

---

### User Story 3 - Graceful Error Handling (Priority: P3)

When external dependencies are unavailable (Kokoro TTS not running, `yt` CLI missing, no internet), the app displays clear error messages rather than crashing.

**Why this priority**: Error states should be handled gracefully but the app already handles these in the existing server code.

**Independent Test**: Stop Kokoro Docker container, attempt audio synthesis, verify error message appears.

**Acceptance Scenarios**:

1. **Given** Kokoro TTS is not running, **When** user attempts audio synthesis, **Then** error message "TTS server not available. Is Kokoro running?" is displayed
2. **Given** the `yt` CLI is not at the configured path, **When** user submits a YouTube URL, **Then** a clear error is shown

---

### Edge Cases

- **Port conflict**: If port 3847 is already in use, show a user-friendly error in the Tauri window and exit gracefully
- **Server crash**: If the Bun server process exits unexpectedly, display an error in the webview
- **Close during generation**: Window close kills the child process immediately; in-progress audio generation is abandoned
- **Missing dependencies**: All dependencies are bundled (bun compiled binary, yt CLI as resource), so PATH issues are avoided

## Requirements

### Functional Requirements

- **FR-001**: System MUST spawn the compiled Bun server binary as a child process on app launch
- **FR-002**: System MUST wait for the server health check (`/api/health`) before loading the webview
- **FR-003**: System MUST kill the Bun server child process when the app window is closed
- **FR-004**: System MUST use `app.path().app_data_dir()` (resolves to `~/Library/Application Support/com.voxtube.app/`) for file persistence
- **FR-005**: System MUST load the webview from `http://localhost:3847` (the Bun server)
- **FR-006**: System MUST bundle the server as a compiled binary (`bun build --compile`) and the `yt` CLI as Tauri resources (via `bundle.resources`)
- **FR-007**: System MUST redirect server stdout/stderr to date-stamped log files in `{app_data_dir}/logs/`, with cleanup of logs older than 7 days
- **FR-008**: System MUST fail gracefully if port 3847 is already in use, displaying an error message

### Key Entities

- **Tauri App Shell**: Native macOS window wrapping the webview, manages server lifecycle and logging
- **Compiled Server Binary**: Bun-compiled standalone executable of the Hono server (bundled resource)
- **yt CLI Binary**: Bundled youtube-transcribe CLI (bundled resource)
- **Webview**: Tauri's embedded browser pointing at localhost:3847

## Success Criteria

### Measurable Outcomes

- **SC-001**: App launches and displays the UI within 5 seconds of double-clicking
- **SC-002**: All existing functionality works identically (transcript, summary, audio, history, cache)
- **SC-003**: No orphan `bun` processes remain after closing the app
- **SC-004**: Zero changes to existing `src/` service files and `public/app.js`
- **SC-005**: Development workflow: `bun run tauri:dev` opens the desktop app with hot reload
