import Anthropic from '@anthropic-ai/sdk'
import type { AppSettings, ProviderTestResult } from '../../shared/types'

export async function testAnthropicProvider(apiKey: string | undefined, settings: AppSettings): Promise<ProviderTestResult> {
  const start = performance.now()
  if (!apiKey) {
    return {
      ok: false,
      provider: 'anthropic',
      message: 'Anthropic API key is not configured.'
    }
  }

  try {
    const baseURL = settings.anthropicBaseUrl.trim() || undefined
    const client = new Anthropic({ apiKey, baseURL })
    const response = await client.messages.create({
      model: settings.anthropicModel,
      max_tokens: 8,
      temperature: 0,
      messages: [{ role: 'user', content: 'Reply with OK.' }]
    })
    return {
      ok: true,
      provider: 'anthropic',
      message: `Anthropic key works with ${settings.anthropicModel}.`,
      detail: `${baseURL ? `base ${baseURL}; ` : ''}input ${response.usage.input_tokens}, output ${response.usage.output_tokens}`,
      latencyMs: Math.round(performance.now() - start)
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'anthropic',
      message: 'Anthropic test failed.',
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - start)
    }
  }
}

export async function testTogetherProvider(apiKey: string | undefined): Promise<ProviderTestResult> {
  const start = performance.now()
  if (!apiKey) {
    return {
      ok: false,
      provider: 'together',
      message: 'Together API key is not configured.'
    }
  }

  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    const body = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        provider: 'together',
        message: `Together test failed with HTTP ${response.status}.`,
        detail: body.slice(0, 500),
        latencyMs: Math.round(performance.now() - start)
      }
    }

    return {
      ok: true,
      provider: 'together',
      message: 'Together key works.',
      detail: 'Models endpoint responded successfully.',
      latencyMs: Math.round(performance.now() - start)
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'together',
      message: 'Together test failed.',
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - start)
    }
  }
}

export async function testArgmaxEndpoint(settings: AppSettings): Promise<ProviderTestResult> {
  const start = performance.now()
  try {
    const form = new FormData()
    const wav = createSilentWav()
    form.append('model', settings.argmaxModel)
    form.append('language', settings.asrLanguage)
    form.append('response_format', 'json')
    const wavBuffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer
    form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'openwhisperflow-endpoint-test.wav')

    const response = await fetch(settings.argmaxEndpoint, {
      method: 'POST',
      body: form
    })
    const body = await response.text()

    if (response.ok) {
      return {
        ok: true,
        provider: 'argmax-local',
        message: 'Argmax endpoint accepted a transcription request.',
        detail: body.slice(0, 500),
        latencyMs: Math.round(performance.now() - start)
      }
    }

    return {
      ok: false,
      provider: 'argmax-local',
      message: `Argmax endpoint responded with HTTP ${response.status}.`,
      detail: body.slice(0, 500),
      latencyMs: Math.round(performance.now() - start)
    }
  } catch (error) {
    return {
      ok: false,
      provider: 'argmax-local',
      message: 'Argmax endpoint is not reachable.',
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - start)
    }
  }
}

function createSilentWav(): Uint8Array {
  const sampleRate = 16000
  const sampleCount = Math.floor(sampleRate * 0.25)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  let offset = 0

  const writeString = (value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index))
      offset += 1
    }
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + sampleCount * 2, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * 2, true)
  offset += 4
  view.setUint16(offset, 2, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, sampleCount * 2, true)
  return new Uint8Array(buffer)
}
