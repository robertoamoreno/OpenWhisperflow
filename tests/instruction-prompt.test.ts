import { describe, expect, it } from 'vitest'
import { buildInstructionPrompt } from '../src/main/prompts/instruction'

describe('buildInstructionPrompt', () => {
  it('builds selected-text rewrite prompts without adding unrelated context', () => {
    const prompt = buildInstructionPrompt({
      instruction: 'make this more concise',
      selectedText: 'This is a very long sentence that repeats itself.',
      appName: 'Mail'
    })

    expect(prompt).toContain('Focused app: Mail')
    expect(prompt).toContain('Selected text:')
    expect(prompt).toContain('make this more concise')
    expect(prompt).toContain('Output only the final text to paste.')
  })

  it('builds instruction-only generation prompts when no selection is available', () => {
    const prompt = buildInstructionPrompt({
      instruction: 'write a polite reply declining the invite',
      appName: 'Slack'
    })

    expect(prompt).toContain('Focused app: Slack')
    expect(prompt).toContain('Spoken instruction:')
    expect(prompt).not.toContain('Selected text:')
  })
})
