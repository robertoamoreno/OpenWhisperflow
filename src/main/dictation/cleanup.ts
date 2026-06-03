import type { PolishInput, PolishResult } from '../../shared/types'

const NON_SPEECH_RE = /\[\s*(?:blank_audio|silence|noise|music|inaudible|no\s*speech|laughter|applause)\s*\]/gi
const TRAILING_HALLUCINATION_RE = /\s*(?:thanks? for watching[.!]?|please subscribe[.!]?|thank you[.!]?)\s*$/i
const FILLER_RE = /\b(?:um+|uh+|erm|ah|like|you know)\b[,.]?\s*/gi
const SPOKEN_PUNCTUATION: Array<[RegExp, string]> = [
  [/\b(?:period|full stop)\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation (?:mark|point)\b/gi, '!'],
  [/\bcolon\b/gi, ':'],
  [/\bsemicolon\b/gi, ';'],
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bnew line\b/gi, '\n']
]
const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bi am\b/gi, "I'm"],
  [/\bi have\b/gi, "I've"],
  [/\bi will\b/gi, "I'll"],
  [/\bi would\b/gi, "I'd"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bcan not\b/gi, "cannot"],
  [/\bcannot\b/gi, "cannot"],
  [/\bwill not\b/gi, "won't"],
  [/\bare not\b/gi, "aren't"],
  [/\bis not\b/gi, "isn't"],
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\byou are\b/gi, "you're"],
  [/\bwe are\b/gi, "we're"],
  [/\bthey are\b/gi, "they're"]
]

export function cleanRawDictation(text: string, options: { naturalize?: boolean } = { naturalize: true }): string {
  const cleaned = text
    .replace(/\r/g, '')
    .replace(NON_SPEECH_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(TRAILING_HALLUCINATION_RE, '')
    .trim()

  if (options.naturalize === false) {
    return applySpacing(cleaned)
  }

  const naturalized = cleaned
    .replace(FILLER_RE, '')
    .replace(/\bi mean\b[,.]?\s*/gi, '')
    .replace(/\bsorry\b[,.]?\s*/gi, '')

  return sentenceCase(applySpacing(applyContractions(applySpokenPunctuation(naturalized))))
}

export function deterministicPolish(input: PolishInput): PolishResult {
  return {
    text: cleanRawDictation(input.rawTranscript),
    provider: 'deterministic',
    model: 'local-cleanup'
  }
}

export function rawPolish(input: PolishInput): PolishResult {
  return {
    text: cleanRawDictation(input.rawTranscript, { naturalize: false }),
    provider: 'deterministic',
    model: 'raw-cleanup'
  }
}

function applySpokenPunctuation(text: string): string {
  return SPOKEN_PUNCTUATION.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
}

function applyContractions(text: string): string {
  return CONTRACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
}

function applySpacing(text: string): string {
  return text
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sentenceCase(text: string): string {
  let result = text.replace(/\bi\b/g, 'I')
  result = result.replace(/(^|[.!?]\s+|\n+)([a-z])/g, (match, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`
  })

  return result
}
