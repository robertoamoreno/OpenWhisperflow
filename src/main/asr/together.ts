import { resolveAudioFileMetadata } from '../../shared/audio'
import type { AudioPayload, TogetherASROptions, TranscriptionResult, TranscriptionSegment } from '../../shared/types'
import type { ASRProvider } from './provider'

interface TogetherTranscriptionResponse {
  text?: string
  segments?: TranscriptionSegment[]
  error?: {
    message?: string
    type?: string
  }
}

export class TogetherASRProvider implements ASRProvider {
  constructor(
    private readonly apiKey: string,
    private readonly options: TogetherASROptions,
    private readonly endpoint = 'https://api.together.xyz/v1/audio/transcriptions'
  ) {}

  async transcribeAudio(payload: AudioPayload, signal?: AbortSignal): Promise<TranscriptionResult> {
    const start = performance.now()
    const metadata = resolveAudioFileMetadata(payload.mimeType)
    const form = new FormData()

    form.append('model', this.options.model)
    form.append('language', this.options.language)
    form.append('response_format', this.options.responseFormat)

    if (this.options.timestampGranularities) {
      form.append('timestamp_granularities', this.options.timestampGranularities)
    }

    const arrayBuffer = payload.bytes.buffer.slice(
      payload.bytes.byteOffset,
      payload.bytes.byteOffset + payload.bytes.byteLength
    ) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: metadata.contentType })
    form.append('file', blob, `dictation.${metadata.extension}`)

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: form,
      signal
    })

    const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-together-request-id') ?? undefined
    const rawBody = await response.text()

    if (!response.ok) {
      throw new Error(this.describeError(response.status, rawBody))
    }

    const parsed = this.parseResponse(rawBody)
    const text = parsed.text?.trim()
    if (!text) {
      throw new Error('Together ASR returned an empty transcription.')
    }

    return {
      text,
      provider: 'together',
      model: this.options.model,
      durationMs: Math.round(performance.now() - start),
      requestId,
      segments: parsed.segments
    }
  }

  private parseResponse(rawBody: string): TogetherTranscriptionResponse {
    if (this.options.responseFormat === 'text') {
      return { text: rawBody }
    }

    try {
      return JSON.parse(rawBody) as TogetherTranscriptionResponse
    } catch {
      return { text: rawBody }
    }
  }

  private describeError(status: number, rawBody: string): string {
    let message = rawBody
    try {
      const parsed = JSON.parse(rawBody) as TogetherTranscriptionResponse
      message = parsed.error?.message ?? rawBody
    } catch {
      // Keep the plain body.
    }

    if (status === 401 || status === 403) return 'Together ASR authentication failed. Check your API key.'
    if (status === 413) return 'The recording is too large for direct upload.'
    if (status === 429) return 'Together ASR rate limit reached. Try again shortly.'
    return `Together ASR failed (${status}): ${message}`
  }
}
