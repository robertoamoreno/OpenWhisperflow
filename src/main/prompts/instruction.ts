import type { InstructionInput } from '../../shared/types'

export function buildInstructionPrompt(input: InstructionInput): string {
  const selected = input.selectedText?.trim()
  const context = input.contextText?.trim()
    ? `\nOptional context. Use it only to understand the requested edit or reply target:\n${input.contextText.trim()}\n`
    : ''

  if (selected) {
    return `You are editing text for a macOS voice dictation tool.

Follow the spoken instruction and transform the selected text.

Rules:
- Output only the final text to paste.
- Do not wrap the result in quotes or code fences.
- Preserve meaning unless the instruction explicitly asks to change it.
- If the instruction asks for a reply, produce the reply text directly.

Focused app: ${input.appName || 'Unknown'}
${context}

Selected text:
${selected}

Spoken instruction:
${input.instruction}`
  }

  return `You are generating paste-ready text for a macOS voice dictation tool.

Follow the spoken instruction.

Rules:
- Output only the requested content.
- Do not add explanations, preambles, quotes, or code fences unless explicitly requested.
- Resolve filler words and self-corrections in the instruction.

Focused app: ${input.appName || 'Unknown'}
${context}

Spoken instruction:
${input.instruction}`
}
