import { describe, expect, it } from 'vitest'
import { ErrorReporter } from '../src/main/errors/errors'

describe('ErrorReporter', () => {
  it('maps common provider failures to user-facing messages and keeps raw diagnostics', () => {
    const persisted: Array<{ source: string; message: string; raw?: string }> = []
    const reporter = new ErrorReporter((source, message, raw) => persisted.push({ source, message, raw }))

    expect(reporter.report('asr', new Error('Together ASR failed: 401 invalid API key'))).toBe(
      'Provider authentication failed. Check your API key.'
    )
    expect(reporter.report('asr', new Error('fetch timeout'))).toBe('Network error. Check your connection.')
    expect(reporter.report('llm', new Error('429 rate limit'))).toBe(
      'Provider rate limit reached. Try again shortly.'
    )

    expect(persisted).toHaveLength(3)
    expect(persisted[0]).toMatchObject({
      source: 'asr',
      message: 'Provider authentication failed. Check your API key.',
      raw: 'Together ASR failed: 401 invalid API key'
    })
  })
})
