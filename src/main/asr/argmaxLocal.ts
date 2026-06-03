import { resolveAudioFileMetadata } from '../../shared/audio'
import type { ArgmaxLocalASROptions, AudioPayload, TranscriptionResult, TranscriptionSegment } from '../../shared/types'
import type { ASRProvider } from './provider'

interface ArgmaxTranscriptionResponse {
  text?: string
  segments?: TranscriptionSegment[]
  error?: {
    message?: string
    type?: string
  }
}

export class ArgmaxLocalASRProvider implements ASRProvider {
  constructor(private readonly options: ArgmaxLocalASROptions) {}

  async transcribeAudio(payload: AudioPayload, signal?: AbortSignal): Promise<TranscriptionResult> {
    const start = performance.now()
    const metadata = resolveAudioFileMetadata(payload.mimeType)
    const form = new FormData()

    form.append('model', this.options.model)
    form.append('language', this.options.language)
    form.append('response_format', this.options.responseFormat)

    const arrayBuffer = payload.bytes.buffer.slice(
      payload.bytes.byteOffset,
      payload.bytes.byteOffset + payload.bytes.byteLength
    ) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: metadata.contentType })
    form.append('file', blob, `dictation.${metadata.extension}`)

    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      body: form,
      signal
    })
    const rawBody = await response.text()

    if (!response.ok) {
      throw new Error(this.describeError(response.status, rawBody))
    }

    const parsed = this.parseResponse(rawBody)
    const text = parsed.text?.trim()
    if (!text) {
      throw new Error('Argmax local ASR returned an empty transcription.')
    }

    return {
      text,
      provider: 'argmax-local',
      model: this.options.model,
      durationMs: Math.round(performance.now() - start),
      segments: parsed.segments
    }
  }

  private parseResponse(rawBody: string): ArgmaxTranscriptionResponse {
    if (this.options.responseFormat === 'text') {
      return { text: rawBody }
    }

    try {
      return JSON.parse(rawBody) as ArgmaxTranscriptionResponse
    } catch {
      return { text: rawBody }
    }
  }

  private describeError(status: number, rawBody: string): string {
    let message = rawBody
    try {
      const parsed = JSON.parse(rawBody) as ArgmaxTranscriptionResponse
      message = parsed.error?.message ?? rawBody
    } catch {
      // Keep the plain body.
    }

    if (status === 404) return 'Argmax local ASR endpoint was not found. Check the local server URL.'
    if (status === 413) return 'The recording is too large for Argmax local ASR.'
    if (status === 415) return 'Argmax local ASR rejected the audio format.'
    if (status === 422 || status === 400) return `Argmax local ASR could not process this audio: ${message}`
    return `Argmax local ASR failed (${status}): ${message}`
  }
}
