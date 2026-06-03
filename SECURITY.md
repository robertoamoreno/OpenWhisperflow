# Security Policy

OpenWhisperflow is an early proof of concept. Please treat privacy and credential-handling issues as security-sensitive.

## Reporting a Vulnerability

Do not post API keys, transcripts, screenshots, recordings, or private logs in public issues.

For now, report security concerns by opening a GitHub issue with a minimal description and no sensitive payloads. If private disclosure details are needed, ask for a private contact path in that issue.

## Sensitive Areas

- Provider API keys and Keychain storage.
- Microphone capture and local audio retry files.
- Clipboard backup/restore and selected-text capture.
- Screen Recording and screenshot context.
- SQLite history export/delete behavior.
- Provider request construction and redaction.

## Supported Versions

The project is pre-1.0. Security fixes should target the current `main` branch unless release branches are introduced later.
