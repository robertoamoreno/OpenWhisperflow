# Contributing

Thanks for taking the time to improve OpenWhisperflow.

## Development Setup

```bash
npm install
npm run rebuild:native
npm run build:hotkey-helper
npm run dev
```

Use `.env.example` as a reference for optional local provider keys. Never commit real API keys, SQLite databases, recordings, screenshots, or generated binaries.

## Quality Checks

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run build
```

On macOS, also run:

```bash
npm run build:hotkey-helper
```

## Privacy-Sensitive Changes

OpenWhisperflow deals with microphone audio, selected text, clipboard data, screenshots, local history, and provider credentials. Changes in these areas should be explicit and narrowly scoped.

Please document:

- What data is collected.
- Whether it is stored locally.
- Whether it is sent to a provider.
- Which setting or permission gates the behavior.
- How failures degrade when permission is missing.

## Pull Requests

Keep PRs focused. Include tests for provider behavior, prompt building, permission handling, insertion behavior, and error mapping when those areas change.
