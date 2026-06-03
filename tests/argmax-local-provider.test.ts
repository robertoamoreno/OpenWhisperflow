import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArgmaxLocalASRProvider } from '../src/main/asr/argmaxLocal'

describe('ArgmaxLocalASRProvider', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const form = init?.body as FormData
        expect(String(url)).toBe('http://127.0.0.1:50060/v1/audio/transcriptions')
        expect(init?.headers).toBeUndefined()
        expect(form.get('model')).toBe('tiny')
        expect(form.get('language')).toBe('auto')
        expect(form.get('response_format')).toBe('json')
        expect(form.get('prompt')).toBeNull()
        expect(form.get('timestamp_granularities')).toBeNull()
        expect(form.get('file')).toBeInstanceOf(Blob)

        return new Response(JSON.stringify({ text: 'Local transcription.' }), { status: 200 })
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('sends multipart transcription requests to the Argmax local server without auth or prompt fields', async () => {
    const provider = new ArgmaxLocalASRProvider({
      endpoint: 'http://127.0.0.1:50060/v1/audio/transcriptions',
      model: 'tiny',
      language: 'auto',
      responseFormat: 'json'
    })

    const result = await provider.transcribeAudio({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/wav',
      durationMs: 1200
    })

    expect(result).toMatchObject({
      text: 'Local transcription.',
      provider: 'argmax-local',
      model: 'tiny'
    })
  })
})
