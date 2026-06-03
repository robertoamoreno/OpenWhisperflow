import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TogetherASRProvider } from '../src/main/asr/together'

describe('TogetherASRProvider', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const form = init?.body as FormData
        expect(init?.headers).toEqual({ Authorization: 'Bearer test-key' })
        expect(form.get('model')).toBe('nvidia/parakeet-tdt-0.6b-v3')
        expect(form.get('language')).toBe('auto')
        expect(form.get('response_format')).toBe('json')
        expect(form.get('prompt')).toBeNull()
        expect(form.get('file')).toBeInstanceOf(Blob)

        return new Response(JSON.stringify({ text: 'Hello from Together.' }), {
          status: 200,
          headers: { 'x-request-id': 'req_123' }
        })
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  it('sends Parakeet multipart transcription requests without prompt fields', async () => {
    const provider = new TogetherASRProvider('test-key', {
      model: 'nvidia/parakeet-tdt-0.6b-v3',
      language: 'auto',
      responseFormat: 'json'
    })

    const result = await provider.transcribeAudio({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm;codecs=opus',
      durationMs: 1200
    })

    expect(result).toMatchObject({
      text: 'Hello from Together.',
      provider: 'together',
      model: 'nvidia/parakeet-tdt-0.6b-v3',
      requestId: 'req_123'
    })
  })
})
