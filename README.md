# QuietRoute

QuietRoute is an atmospheric, pixel-art night-tram experience for the web, with a companion Electron desktop shell for Windows.

## Features

- A full-screen animated tram scene with rain, window interaction, and reduced-motion support.
- Independently controlled music, rain, tram, wind, night, birds, and thunder audio channels.
- Keyboard and pointer controls for the sound mixer, fullscreen mode, and the web scene's movable dock.
- An Electron shell with compact and always-on-top window modes.
- Locally bundled audio assets with provenance and attribution records.

## Architecture

- `src/` contains the Vite web application, including scene rendering, audio behavior, and UI state.
- `QuietRouteDesktop/src/` contains the Electron main process, a sandboxed preload bridge, and the desktop shell.
- `public/` contains web assets; `QuietRouteDesktop/assets/` contains desktop-only assets.
- `tests/` and `QuietRouteDesktop/test/` contain the web and desktop test suites.

The Electron window uses a sandboxed renderer, context isolation, disabled Node integration, a narrow preload API, and trusted-renderer checks for IPC handlers.

## Tech stack

- TypeScript
- Vite
- Vitest
- Electron
- electron-builder

## Requirements

- Node.js and npm
- Windows is required to build or run the packaged Electron desktop application.

## Setup

Install dependencies from the project root:

```powershell
npm.cmd ci
```

The desktop shell uses the root dependency installation for Vite and TypeScript. Its Electron dependencies are installed from its own directory:

```powershell
Set-Location QuietRouteDesktop
npm.cmd ci
```

## Run the web experience

```powershell
npm.cmd run dev
```

Use the URL printed by Vite, then select the on-screen entry action before audio can start.

## Run the desktop shell

```powershell
Set-Location QuietRouteDesktop
npm.cmd start
```

This first builds the desktop site bundle and then starts Electron from source.

## Verification

From the project root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

For desktop verification:

```powershell
Set-Location QuietRouteDesktop
npm.cmd test
npm.cmd run typecheck
npm.cmd run site:build
npm.cmd run qa:runtime
```

## Build the desktop package

```powershell
Set-Location QuietRouteDesktop
npm.cmd run package
```

The generated package is written to `QuietRouteDesktop/release/` and is intentionally excluded from version control.

## Audio attribution

The repository includes CC0 and CC BY audio recordings used by the web and desktop experiences. Their sources, license details, and checksums are recorded in [public/audio/LICENSES.md](public/audio/LICENSES.md) and [QuietRouteDesktop/assets/AUDIO_LICENSES.md](QuietRouteDesktop/assets/AUDIO_LICENSES.md). The desktop clock font is documented in [QuietRouteDesktop/assets/FONT_LICENSES.md](QuietRouteDesktop/assets/FONT_LICENSES.md).

## Configuration and privacy

QuietRoute does not require environment variables for normal development or runtime. Do not place secrets in `VITE_*` variables: Vite exposes those variables to the client bundle.

The desktop shell stores its window preferences in Electron's user-data directory at runtime. Runtime state, logs, local configuration, generated bundles, and packages are excluded from version control.

## Limitations

- The repository does not include a production deployment configuration.
- No license has been selected for the project source; none is added automatically.
