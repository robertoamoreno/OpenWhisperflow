# Argmax Local ASR

OpenWhisperflow can use Argmax OSS WhisperKit through its local OpenAI-compatible audio transcription server.

## Setup

Clone and build Argmax OSS outside this repository:

```bash
git clone https://github.com/argmaxinc/argmax-oss-swift.git
cd argmax-oss-swift
make download-model MODEL=tiny
make build-local-server
BUILD_ALL=1 swift run argmax-cli serve --model tiny --host 127.0.0.1 --port 50060
```

Then open OpenWhisperflow Settings and set:

- Speech to text: `Argmax local WhisperKit`
- Argmax endpoint: `http://127.0.0.1:50060/v1/audio/transcriptions`
- Argmax model: `tiny`, or another model available in your Argmax model folder
- Argmax repo path: the local clone path, such as `/Users/you/src/argmax-oss-swift`

OpenWhisperflow does not clone, install Homebrew packages, download models, or build Argmax from the UI. Those steps should be run explicitly in Terminal so you can see and control the install/build process.

After the repo is prepared, OpenWhisperflow can start and stop the server from Settings. The Run Server button runs only:

```bash
BUILD_ALL=1 swift run argmax-cli serve --model <Argmax model> --host 127.0.0.1 --port 50060
```

from the configured Argmax repo path.

## Notes

- OpenWhisperflow records the Argmax path as WAV because the local server supports file-style audio uploads such as WAV.
- This path does not require `TOGETHER_API_KEY`; audio stays on the machine as long as the local Argmax server is local.
- The configured LLM is still used for instruction mode and explicit transform/polish flows unless those are disabled or replaced later.
