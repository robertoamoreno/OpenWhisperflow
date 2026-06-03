import { describe, expect, it } from 'vitest'
import { cleanRawDictation, deterministicPolish, rawPolish } from '../src/main/dictation/cleanup'

describe('deterministic dictation cleanup', () => {
  it('removes common non-speech markers and trailing ASR outro hallucinations', () => {
    expect(cleanRawDictation('  Hello   world. [silence] Thanks for watching. ')).toBe('Hello world.')
  })

  it('keeps raw dictation on the local cleanup path without LLM metadata', () => {
    expect(
      deterministicPolish({
        rawTranscript: 'send this tomorrow',
        dictionaryTerms: []
      })
    ).toEqual({
      text: 'Send this tomorrow',
      provider: 'deterministic',
      model: 'local-cleanup'
    })
  })

  it('makes common dictated text sound cleaner and more natural', () => {
    expect(cleanRawDictation('um i am running late comma can you move this to tomorrow question mark')).toBe(
      "I'm running late, can you move this to tomorrow?"
    )
  })

  it('supports spoken line breaks and punctuation spacing', () => {
    expect(cleanRawDictation('first item new line second item period next sentence')).toBe(
      'First item\nSecond item. Next sentence'
    )
  })

  it('keeps raw mode minimally cleaned without naturalizing spoken text', () => {
    expect(
      rawPolish({
        rawTranscript: 'um i am running late comma can you move this',
        dictionaryTerms: []
      }).text
    ).toBe('um i am running late comma can you move this')
  })
})
