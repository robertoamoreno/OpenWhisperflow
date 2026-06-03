export type DictationStatus = 'idle' | 'listening' | 'processing' | 'inserted' | 'preview' | 'cancelled' | 'too-short' | 'error'

export type SessionMode = 'dictation' | 'instruction'
export type AppView = 'dictation' | 'history' | 'settings' | 'data'
export type ActivationMode = 'tap-toggle' | 'push-to-talk' | 'double-tap-push'
export type OutputMode = 'paste' | 'clipboard'
export type DictationModePreset = 'raw' | 'natural' | 'formal' | 'bullets' | 'reply'
export type ASRProviderName = 'together' | 'argmax-local' | 'groq' | 'deepgram' | 'ai-sdk'
export type LLMProviderName = 'anthropic' | 'together' | 'openai'

export interface AudioPayload {
  bytes: Uint8Array
  mimeType: string
  durationMs: number
}

export interface ProcessAudioRequest {
  audio: AudioPayload
  mode: SessionMode
  selectedText?: string
}

export interface TogetherASROptions {
  model: string
  language: string
  responseFormat: 'json' | 'verbose_json' | 'text'
  timestampGranularities?: 'word' | 'segment' | 'word,segment'
}

export interface ArgmaxLocalASROptions {
  endpoint: string
  model: string
  language: string
  responseFormat: 'json' | 'verbose_json' | 'text'
}

export interface TranscriptionSegment {
  id?: number
  start?: number
  end?: number
  text: string
}

export interface TranscriptionResult {
  text: string
  provider: ASRProviderName
  model: string
  durationMs: number
  requestId?: string
  segments?: TranscriptionSegment[]
}

export interface ArgmaxServerStatus {
  running: boolean
  pid?: number
  endpoint: string
  model: string
  repoPath?: string
  lastMessage?: string
  logs: string[]
}

export interface DictationContext {
  appName?: string
  windowTitle?: string
  textContext?: string
  contextIncluded?: boolean
  contextSource?: 'frontmost' | 'selected-text' | 'frontmost+selected-text'
  screenshotIncluded?: boolean
  screenshotSource?: string
  screenshotSize?: string
  redactionEnabled: boolean
}

export interface ScreenshotContext {
  dataBase64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  width: number
  height: number
  sourceName?: string
}

export interface ScreenshotCaptureResult {
  ok: boolean
  message: string
  permissionStatus: string
  width?: number
  height?: number
  sourceName?: string
  durationMs: number
}

export interface PolishInput {
  rawTranscript: string
  appName?: string
  contextText?: string
  screenshotContext?: ScreenshotContext
  dictionaryTerms: string[]
  transformPrompt?: string
}

export interface PolishResult {
  text: string
  provider: 'anthropic' | 'deterministic' | 'fallback'
  model: string
  rawResponse?: string
  inputTokens?: number
  outputTokens?: number
  warnings?: string[]
}

export interface InstructionInput {
  instruction: string
  selectedText?: string
  appName?: string
  contextText?: string
  screenshotContext?: ScreenshotContext
}

export interface HistoryItem {
  id: string
  flowType: SessionMode
  rawText: string
  formattedText: string
  instructionText?: string
  selectedText?: string
  appName?: string
  durationMs: number
  status: 'inserted' | 'preview' | 'error' | 'cancelled' | 'too-short'
  contextJson: string
  audioMimeType?: string
  audioFilePath?: string
  asrProvider?: string
  asrModel?: string
  llmProvider?: string
  llmModel?: string
  contextIncluded?: boolean
  screenshotIncluded?: boolean
  error?: string
  rawError?: string
  createdAt: string
}

export interface Transform {
  id: string
  name: string
  prompt: string
  enabled: boolean
  shortcut?: string
  createdAt: string
  updatedAt: string
}

export interface DictionaryTerm {
  id: string
  phrase: string
  pronunciation?: string
  createdAt: string
}

export interface AppSettings {
  hotkey: string
  instructionHotkey: string
  activationMode: ActivationMode
  outputMode: OutputMode
  dictationMode: DictationModePreset
  asrProvider: ASRProviderName
  togetherModel: string
  argmaxEndpoint: string
  argmaxModel: string
  argmaxServerCwd?: string
  asrLanguage: string
  inputLanguage: string
  selectedAudioDeviceId?: string
  launchAtLogin: boolean
  onboardingComplete: boolean
  llmProvider: LLMProviderName
  llmModel: string
  anthropicModel: string
  anthropicBaseUrl: string
  llmContextEnabled: boolean
  llmScreenshotContextEnabled: boolean
  contextEnabled: boolean
  redactionEnabled: boolean
  defaultTransformId?: string
  hasTogetherApiKey: boolean
  hasAnthropicApiKey: boolean
}

export interface SecretUpdate {
  togetherApiKey?: string
  anthropicApiKey?: string
}

export interface DictationProcessResult {
  transcription?: TranscriptionResult
  polish?: PolishResult
  historyItem?: HistoryItem
  inserted: boolean
  copiedOnly?: boolean
  error?: string
}

export interface UsageWindow {
  estimatedCostUsd: number
  asrSeconds: number
  inputTokens: number
  outputTokens: number
}

export interface UsageSummary {
  today: UsageWindow
  month: UsageWindow
  allTime: UsageWindow
}

export interface DiagnosticError {
  source: string
  message: string
  rawMessage?: string
  createdAt: string
}

export interface ProviderTestResult {
  ok: boolean
  provider: 'anthropic' | 'together' | 'argmax-local'
  message: string
  detail?: string
  latencyMs?: number
}

export interface HotkeyRegistrationStatus {
  dictation: {
    accelerator: string
    registered: boolean
  }
  instruction: {
    accelerator: string
    registered: boolean
  }
}

export interface SelectedTextCaptureResult {
  ok: boolean
  text?: string
  method: 'accessibility' | 'clipboard' | 'none'
  reason?: 'permission-blocked' | 'empty' | 'error'
  message: string
  durationMs: number
}

export interface LocalDataSummary {
  databasePath: string
  tables: Array<{ name: string; fields: string[] }>
}

export interface OpenWhisperflowApi {
  getSettings(): Promise<AppSettings>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  setSecrets(secrets: SecretUpdate): Promise<AppSettings>
  completeOnboarding(): Promise<AppSettings>
  processAudio(request: ProcessAudioRequest): Promise<DictationProcessResult>
  cancelActive(): Promise<void>
  setRecordingState(active: boolean): Promise<void>
  captureSelectedText(): Promise<string | undefined>
  testSelectedTextCapture(): Promise<SelectedTextCaptureResult>
  captureSelectedTextWithDiagnostics(): Promise<SelectedTextCaptureResult>
  testScreenCapture(): Promise<ScreenshotCaptureResult>
  pasteText(text: string): Promise<boolean>
  listHistory(query?: string): Promise<HistoryItem[]>
  deleteHistory(id: string): Promise<void>
  repasteHistory(id: string): Promise<boolean>
  retryHistory(id: string): Promise<DictationProcessResult>
  getUsage(): Promise<UsageSummary>
  resetUsage(): Promise<UsageSummary>
  getDiagnostics(): Promise<DiagnosticError[]>
  getHotkeyStatus(): Promise<HotkeyRegistrationStatus>
  testAnthropic(): Promise<ProviderTestResult>
  testTogether(): Promise<ProviderTestResult>
  testArgmaxEndpoint(): Promise<ProviderTestResult>
  getArgmaxServerStatus(): Promise<ArgmaxServerStatus>
  chooseArgmaxRepoPath(): Promise<string | undefined>
  startArgmaxServer(): Promise<ArgmaxServerStatus>
  stopArgmaxServer(): Promise<ArgmaxServerStatus>
  exportLocalData(): Promise<{ history: HistoryItem[]; settings: AppSettings }>
  deleteAllData(): Promise<void>
  getLocalDataSummary(): Promise<LocalDataSummary>
  getMicPermissionStatus(): Promise<string>
  getScreenPermissionStatus(): Promise<string>
  requestMicPermission(): Promise<boolean>
  getAccessibilityStatus(): Promise<boolean>
  requestAccessibility(): Promise<boolean>
  openSystemSettings(section: 'microphone' | 'accessibility' | 'keyboard' | 'screen'): Promise<void>
  onToggleRecording(callback: (mode: SessionMode) => void): () => void
  onCancelRecording(callback: () => void): () => void
  onStatus(callback: (status: DictationStatus, detail?: string) => void): () => void
  onNavigate(callback: (view: AppView) => void): () => void
}
