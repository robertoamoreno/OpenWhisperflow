import type { InstructionInput, PolishInput, PolishResult } from '../../shared/types'

export interface LLMProvider {
  polishDictation(input: PolishInput, signal?: AbortSignal): Promise<PolishResult>
  runInstruction(input: InstructionInput, signal?: AbortSignal): Promise<PolishResult>
}
