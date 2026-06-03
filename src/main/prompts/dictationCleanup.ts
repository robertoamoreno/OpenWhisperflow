import type { PolishInput } from '../../shared/types'

export function buildDictationCleanupPrompt(input: PolishInput): string {
  const dictionary = input.dictionaryTerms.length
    ? input.dictionaryTerms.map((term) => `- ${term}`).join('\n')
    : '- No custom dictionary terms.'

  const transform = input.transformPrompt?.trim()
    ? `\nApply this user transform after cleanup:\n${input.transformPrompt.trim()}\n`
    : ''
  const context = input.contextText?.trim()
    ? `\nOptional context for interpreting the dictation. Use it only to resolve references, tone, or reply intent. Do not quote it unless asked:\n${input.contextText.trim()}\n`
    : ''

  return `You clean up voice dictation before it is pasted into the user's focused app.

Rules:
- Preserve the speaker's meaning.
- Fix obvious ASR errors, punctuation, casing, and paragraph breaks.
- Remove filler words only when they do not change intent.
- Do not add facts, commentary, markdown fences, preambles, or explanations.
- Return only the final text to paste.

Focused app: ${input.appName || 'Unknown'}
${context}

Custom dictionary terms:
${dictionary}
${transform}
Raw transcript:
${input.rawTranscript}`
}
