import type { AudioPayload, TranscriptionResult } from '../../shared/types'

export interface ASRProvider {
  transcribeAudio(payload: AudioPayload, signal?: AbortSignal): Promise<TranscriptionResult>
}
