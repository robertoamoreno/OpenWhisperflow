import type { OpenWhisperflowApi } from '../../shared/types'

declare global {
  interface Window {
    openWhisperflow: OpenWhisperflowApi
    voiceDesk?: OpenWhisperflowApi
  }
}
