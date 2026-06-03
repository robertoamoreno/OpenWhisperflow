# OpenWhisperflow Permissions

## Microphone

Required for dictation. OpenWhisperflow asks macOS for microphone access when recording starts.

## Accessibility

Recommended but still optional for the POC. Clipboard paste, selected-text capture, and the native helper may require Accessibility or Automation permission depending on macOS settings. The helper uses a listen-only event tap for OpenWhisperflow hotkey transitions and should be expanded to AXUIElement insertion only after explicit user consent.

OpenWhisperflow never stores raw key events. Selected-text workflows use a scoped copy action, restore the previous clipboard value, and store selected text only when a history entry is created.

If macOS reports that `osascript` or System Events is not allowed to send keystrokes, enable OpenWhisperflow/Electron in Privacy & Security > Accessibility. Until permission is granted, OpenWhisperflow leaves generated output on the clipboard and shows a preview fallback.

## Screen Recording

Optional. Screen Recording is required only when **Screen context for LLM modes** is enabled. OpenWhisperflow captures a bounded thumbnail of the current screen and attaches it to the LLM request for instruction, transform, Formal, Bullets, or Reply modes. Raw and Natural dictation do not use screen context.

When screen context is enabled and permission is missing, OpenWhisperflow opens the Screen Recording privacy pane from Settings. If dictation runs before permission is granted, OpenWhisperflow shows a HUD warning and continues without the screenshot.

Screenshots are transient. OpenWhisperflow does not write screenshot bytes to SQLite, history export, or retry audio storage. History stores only whether screen context was included, plus basic metadata such as the source name and thumbnail size in context JSON.

Meeting/system-audio capture should remain separately opt-in and documented before it is added.

## Network Providers

OpenWhisperflow sends audio only after the user starts a dictation. The Together provider sends audio to Together AI. The Argmax local provider sends audio to the configured local WhisperKit server URL. Plain dictation uses local deterministic cleanup after ASR. Instruction mode and explicit transform/polish flows send text/context to the configured Anthropic endpoint, which may be Anthropic directly or a user-configured LiteLLM proxy. Provider keys are user supplied and never hardcoded.

LLM text context is opt-in. When enabled, OpenWhisperflow may include the frontmost app/window title and selected text in LLM-backed modes only. Redaction hooks run before this text context is sent. Raw and Natural dictation modes do not send context to an LLM.

Screen context is a separate opt-in. It may include visible information from the current screen, so use it only with an LLM model and proxy path that you trust and that supports image input.

## Local Retry Audio

OpenWhisperflow keeps a small rolling set of recent audio files to support retry from History. Files are stored under the app data directory, tied to history entries, and pruned automatically by count.
