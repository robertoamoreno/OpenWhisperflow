import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { InstructionInput, PolishInput, PolishResult } from '../../shared/types'
import type { LLMProvider } from './provider'
import { buildDictationCleanupPrompt } from '../prompts/dictationCleanup'
import { buildInstructionPrompt } from '../prompts/instruction'

export class AnthropicLLMProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly baseURL?: string
  ) {}

  async polishDictation(input: PolishInput, signal?: AbortSignal): Promise<PolishResult> {
    return this.complete({
      prompt: buildDictationCleanupPrompt(input),
      fallbackText: input.rawTranscript.trim(),
      system: 'You are a concise dictation cleanup engine. Return only paste-ready text.',
      screenshotContext: input.screenshotContext,
      signal
    })
  }

  async runInstruction(input: InstructionInput, signal?: AbortSignal): Promise<PolishResult> {
    return this.complete({
      prompt: buildInstructionPrompt(input),
      fallbackText: input.selectedText || input.instruction,
      system: 'You are a concise text transformation engine. Return only paste-ready text.',
      screenshotContext: input.screenshotContext,
      signal
    })
  }

  private async complete(input: {
    prompt: string
    fallbackText: string
    system: string
    screenshotContext?: PolishInput['screenshotContext']
    signal?: AbortSignal
  }): Promise<PolishResult> {
    if (!this.apiKey) {
      return {
        text: input.fallbackText.trim(),
        provider: 'fallback',
        model: 'none',
        warnings: ['ANTHROPIC_API_KEY is not configured; using raw transcript.']
      }
    }

    const client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseURL?.trim() || undefined
    })
    const content: ContentBlockParam[] = [
      {
        type: 'text',
        text: input.screenshotContext
          ? `${input.prompt}\n\nA current-screen screenshot is attached. Use it only as optional visual context for visible UI, selected content, recipient, tone, or reply target. Do not mention the screenshot.`
          : input.prompt
      }
    ]
    if (input.screenshotContext) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.screenshotContext.mediaType,
          data: input.screenshotContext.dataBase64
        }
      })
    }
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1200,
      temperature: 0.1,
      system: input.system,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    }, input.signal ? { signal: input.signal } : undefined)

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    return {
      text: text || input.fallbackText.trim(),
      provider: 'anthropic',
      model: this.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      rawResponse: JSON.stringify(response)
    }
  }
}
