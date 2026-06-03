# Architecture

OpenWhisperflow is split into Electron main-process services, a React renderer, shared types, and an optional native helper.

## Main Process

- `src/main/index.ts`: Electron app lifecycle, windows, tray, IPC, permissions, and global shortcuts.
- `src/main/dictation/service.ts`: Dictation lifecycle orchestration from audio payload to ASR, cleanup, insertion, and history.
- `src/main/asr/`: ASR provider interface and Together/Argmax implementations.
- `src/main/llm/`: LLM provider interface and Anthropic-compatible implementation.
- `src/main/context/`: Frontmost app/window, selected text redaction helpers, and screenshot capture.
- `src/main/insertion/`: Clipboard backup, paste simulation, selected-text capture, and fallback errors.
- `src/main/db/`: SQLite schema, migrations, repositories, usage, diagnostics, and local data summary.
- `src/main/settings/` and `src/main/secrets/`: Persisted settings and Keychain/environment-backed secrets.

## Renderer

- `src/renderer/src/main.tsx`: Main React app, onboarding, settings, history, local data, and HUD route.
- `src/renderer/src/styles.css`: App and HUD styling.
- `src/preload/index.ts`: Context-isolated bridge exposed as `window.openWhisperflow`.

## Native Helper

- `src/native/macos/OpenWhisperflowHotkeyHelper.swift`: Optional listen-only macOS helper skeleton for future key-down/key-up handling.
- `scripts/build-hotkey-helper.js`: Compiles the helper to `resources/bin/openwhisperflow-hotkey-helper` on macOS.

## Data Flow

1. Renderer records audio with `MediaRecorder` or WAV fallback for local Argmax.
2. Renderer sends audio bytes to the main process over IPC.
3. Main process transcribes with the selected ASR provider.
4. Raw/Natural modes use local cleanup; LLM-backed modes call the configured Anthropic-compatible provider.
5. Optional text/screen context is added only when enabled and permission is available.
6. Main process inserts text or leaves it on the clipboard, then records local history/usage/diagnostics.

## Privacy Boundaries

Provider calls should be created only in provider classes or dictation orchestration. New data flows should document whether data is local-only, persisted, or sent to a configured provider.
