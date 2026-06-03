# OpenWhisperflow

Privacy-first macOS voice dictation and text transformation, built with Electron, React, TypeScript, SQLite, local-first settings, and pluggable speech/LLM providers.

OpenWhisperflow is an early proof of concept. It is useful for local development and experimentation, but it is not yet signed, notarized, auto-updated, or packaged as a production macOS app.

## Features

- Global hotkeys for dictation and instruction mode.
- Fast speech-to-text through Together AI Parakeet, or local Argmax OSS WhisperKit through an OpenAI-compatible local server.
- Dictation modes: Raw, Natural, Formal, Bullets, and Reply.
- Instruction mode for selected-text rewrites such as "make this concise", "turn this into bullets", or "write a reply".
- Optional LLM text context with frontmost app/window title and selected text.
- Optional screenshot context for LLM-backed modes, gated by macOS Screen Recording permission.
- Clipboard-based insertion with clipboard restore, plus clipboard-only fallback.
- Local SQLite history, diagnostics, retry metadata, and usage counters.
- macOS Keychain-backed provider keys through `keytar`, with environment-variable fallback.
- Swift native hotkey helper skeleton for future reliable key-down/key-up handling.

## Privacy Model

OpenWhisperflow is opt-in by design:

- Microphone audio is captured only while recording is active.
- Audio is sent only to the configured ASR provider.
- Argmax local ASR keeps audio on the machine when pointed at a local server.
- Raw and Natural dictation avoid LLM calls and use local deterministic cleanup after ASR.
- LLM-backed modes can send transcript text, selected text, optional app/window context, and optional screenshot context to the configured Anthropic-compatible endpoint.
- Screenshot bytes are transient and are not written to SQLite, history exports, or retry audio storage.
- Selected-text capture backs up the clipboard, issues Copy, reads the selection, and restores the prior clipboard value.
- No raw key events are persisted.

See [docs/PERMISSIONS.md](docs/PERMISSIONS.md) for the detailed permissions model.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a short codebase map.
See [docs/RELEASE.md](docs/RELEASE.md) for DMG build and GitHub Release instructions.

## Requirements

- macOS for the full app workflow.
- Node.js 20.19 or newer.
- Xcode command line tools for the optional Swift hotkey helper.
- A Together AI key for Together Parakeet ASR, or a local Argmax OSS server.
- An Anthropic-compatible API key/endpoint for Instruction, Formal, Bullets, Reply, transforms, and screenshot context.

## Setup

```bash
git clone https://github.com/robertoamoreno/OpenWhisperflow.git
cd OpenWhisperflow
npm install
npm run rebuild:native
npm run build:hotkey-helper
npm run dev
```

For development secrets, either set environment variables:

```bash
export TOGETHER_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export ANTHROPIC_BASE_URL="http://127.0.0.1:4000" # optional LiteLLM or Anthropic-compatible proxy
```

or enter keys in Settings. Stored keys use macOS Keychain through `keytar` when available.

## Local ASR

OpenWhisperflow can use Argmax OSS WhisperKit as a local ASR backend. The app does not clone, install, download, or build Argmax from the UI; prepare it explicitly in Terminal, then configure the local endpoint in Settings.

See [docs/ARGMAX_LOCAL_ASR.md](docs/ARGMAX_LOCAL_ASR.md).

## Scripts

```bash
npm run dev                 # start Electron + Vite
npm run typecheck           # TypeScript checks
npm test                    # unit tests
npm run build               # production build
npm run dist:mac            # local unsigned macOS DMG in release/
npm run release:mac         # build and publish through electron-builder
npm run rebuild:native      # rebuild native Node modules for Electron
npm run build:hotkey-helper # build the optional Swift helper on macOS
```

## Project Layout

```text
src/main/       Electron main process, providers, database, insertion, hotkeys
src/renderer/   React UI and HUD
src/shared/     Shared types and audio helpers
src/native/     Optional Swift helper source
docs/           Permission and provider setup docs
tests/          Unit tests for providers, prompts, cleanup, and error mapping
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), keep privacy-sensitive changes explicit, and include tests for provider, prompt, permission, or insertion behavior changes.

## License

MIT. See [LICENSE](LICENSE).
