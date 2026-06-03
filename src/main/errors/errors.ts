import type { DiagnosticError } from '../../shared/types'

export class ErrorReporter {
  private readonly memory: DiagnosticError[] = []

  constructor(private readonly persist?: (source: string, message: string, rawMessage?: string) => void) {}

  simplify(raw: unknown): string {
    const message = raw instanceof Error ? raw.message : String(raw)
    const lower = message.toLowerCase()

    if (lower.includes('abort')) return 'Cancelled.'
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403') || lower.includes('auth')) {
      return 'Provider authentication failed. Check your API key.'
    }
    if (lower.includes('429') || lower.includes('rate limit')) return 'Provider rate limit reached. Try again shortly.'
    if (lower.includes('too large') || lower.includes('413')) return 'The recording is too large.'
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('enotfound') || lower.includes('timeout')) {
      return 'Network error. Check your connection.'
    }
    if (lower.includes('microphone') || lower.includes('notallowederror') || lower.includes('permission')) {
      return 'Microphone or Accessibility permission is missing.'
    }
    if (lower.includes('empty transcription') || lower.includes('no speech')) return "Didn't catch that."
    return 'Something went wrong. Try again.'
  }

  report(source: string, raw: unknown): string {
    const rawMessage = raw instanceof Error ? raw.message : String(raw)
    const message = this.simplify(raw)
    const entry = {
      source,
      message,
      rawMessage,
      createdAt: new Date().toISOString()
    }
    this.memory.unshift(entry)
    this.memory.length = Math.min(this.memory.length, 100)
    this.persist?.(source, message, rawMessage)
    return message
  }

  list(): DiagnosticError[] {
    return [...this.memory]
  }
}
