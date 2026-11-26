# Debug symbols lab

Live: https://fsmaster.com/sentry/symbols/

One C++ program (`crashlab/`), built several times on Windows with MSVC and
sentry-native (crashpad backend). Every build was crashed once and the
minidump was saved to `dumps/`. The page sends these dumps to the Sentry
minidump endpoint. The code is the same in all builds, only the debug files
that were uploaded to the Sentry project are different.

| build | uploaded to Sentry | result |
|---|---|---|
| 1.0.0 | exe + pdb + sources | full stack trace with code |
| 1.0.1 | nothing | "A required debug information file was missing" |
| 1.0.2 | exe + pdb of a rebuild | same error, the Debug ID is different |
| 1.0.3 | pdb only | names, but the stack has extra frames (no unwind info) |
| 1.0.6 | exe only | right frames, no names |
| 1.0.4 | exe + stripped pdb | names, no lines |
| 1.0.5 | exe + pdb, no sources | names and lines, no code |
| 1.0.0 | all, project without Microsoft symbols | stack stops at ucrtbase |
| 1.0.0 | all, dump cut at 60 KB | one frame |
| - | a text file as the dump | HTTP 400, no event |
| 1.0.8 | all, a divide by zero | the zero divisor is visible in the registers |

## Build it yourself

Needs Visual Studio 2022 (C++), CMake, and sentry-native unpacked to
`crashlab/external/sentry-native`.

    cmake -B build -G "Visual Studio 17 2022" -A x64 -DAPP_VERSION=1.0.0
    cmake --build build --config RelWithDebInfo

Build in a short path like `C:\lab\crashlab`: the path of the PDB and of the
sources goes into the binaries. `mkbuild.sh` makes one more build with a new
PDB GUID. To get a dump without sending it, run with a DSN that points
nowhere, the dump stays in `.sentry-native/reports/`:

    set SENTRY_DSN=http://k@127.0.0.1:9/1
    crashlab.exe crash somebody

Symbols for every build are in the
[symbols-lab-1 release](https://github.com/fsmaster/sentry-playground/releases/tag/symbols-lab-1).
