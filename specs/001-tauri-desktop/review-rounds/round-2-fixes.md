# Round 2 Fixes Applied

## CRITICAL Fixes

1. **Window close lifecycle**: Added `WindowEvent::CloseRequested` handler in setup() that calls shutdown_server() and app.exit(0). Combined with RunEvent::Exit safety net, all exit paths are covered.

2. **FR-006 sidecar terminology**: Updated spec FR-006 and Key Entities to say "bundled resources" instead of "sidecar". Plan already uses bundle.resources + std::process::Command.

## HIGH Fixes

3. **Health check timeout**: Reduced from 10s to 4s to fit within SC-001's 5-second constraint.

4. **Dev hot reload**: Changed beforeDevCommand to `"bun run --watch src/index.ts"` for actual hot reload support.

## MEDIUM Fixes

5. **Build script both arches**: Updated build:server script to compile both arm64 and x64 targets.

6. **Port check error handling**: Added explicit ConnectionRefused → free, Ok → in use, other errors → treat as unavailable with warning.
