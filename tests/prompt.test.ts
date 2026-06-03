import { describe, expect, it } from 'vitest'
import { buildDictationCleanupPrompt } from '../src/main/prompts/dictationCleanup'

describe('buildDictationCleanupPrompt', () => {
  it('places dictionary terms in the configured LLM cleanup instead of ASR prompting', () => {
    const prompt = buildDictationCleanupPrompt({
      rawTranscript: 'open whisker should be open whispr',
      appName: 'Notes',
      dictionaryTerms: ['Open Whispr', 'OpenWhisperflow']
    })

    expect(prompt).toContain('Open Whispr')
    expect(prompt).toContain('OpenWhisperflow')
    expect(prompt).toContain('Notes')
    expect(prompt).toContain('open whisker should be open whispr')
  })
})
