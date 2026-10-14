# AGENTS.md — Build & Environment Guidance for crypto-fast-math

## C++ Build (Windows dev → Linux/macOS CI)

The C++ addon compiles with MSVC on Windows dev machines and GCC/Clang on GitHub Actions.
Include every `std` header you use explicitly — MSVC transitively includes many headers
(e.g. `<memory>`) that GCC/Clang do **not**. A build that passes on Windows can fail on CI.

| Type used | Required include |
| ----------- | ----------------- |
| `std::unique_ptr`, `std::make_unique` | `<memory>` |
| `std::mutex`, `std::lock_guard` | `<mutex>` |
| `std::unordered_map` | `<unordered_map>` |
| `std::atomic` | `<atomic>` |
| `std::deque` | `<deque>` |
| `std::move`, `std::pair` | `<utility>` (include defensively) |

**Never place `#include` directives inside a `namespace`** — preprocessor paste
happens at namespace scope, wrapping std into `cfm::std::` and breaking all headers.

## Build commands

- **Windows dev**: `.\build-cpp2.bat` (vcvars64 + msvs_version=2022). `npm run build:cpp`
  fails locally (node-gyp cannot find VS). CI uses `npm run build:cpp` (works, CI has
  system compilers).
- **Clean rebuild** (avoids LNK1103 corrupted-debug-info):
  `Remove-Item -Recurse -Force build/obj; Remove-Item -Force build/Release/addon.*; .\build-cpp2.bat`

## PowerShell in bash tool

`&&` is a parse error. Chain with `;` and `if ($?)`. `head`/`grep`/`sed` are unavailable —
use `Select-String` / `Select-Object`. `nul` is the Windows NUL device, not a file.
