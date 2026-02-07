# Round 3 Fixes

## HIGH Fix
1. **Arch selection**: Added `std::env::consts::ARCH` detection in start_server() to select the correct binary (aarch64 vs x86_64).
