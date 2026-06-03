import type { BrowserWindow } from 'electron'
import type {
  AudioPayload,
  DictationModePreset,
  DictationProcessResult,
  DictationStatus,
  ProcessAudioRequest,
  ScreenshotContext,
  TranscriptionResult
} from '../../shared/types'
import { AudioStorageService } from '../audio/storage'
import { ArgmaxLocalASRProvider } from '../asr/argmaxLocal'
import { TogetherASRProvider } from '../asr/together'
import { AppDatabase } from '../db/database'
import { deterministicPolish, rawPolish } from './cleanup'
import { ErrorReporter } from '../errors/errors'
import { ClipboardInsertionService } from '../insertion/clipboard'
import { AnthropicLLMProvider } from '../llm/anthropic'
import type { LLMProvider } from '../llm/provider'
import { SecretService } from '../secrets/secrets'
import { SettingsService } from '../settings/settings'
import { getFrontmostContext, redactText } from '../context/frontmost'
import { captureScreenContext, getScreenPermissionStatus } from '../context/screenshot'

const MAX_DICTATION_DURATION_MS = 2 * 60 * 1000
const MIN_DICTATION_DURATION_MS = 500
const MIN_AUDIO_BYTES = 100

function dictationModePrompt(mode: DictationModePreset): string {
  if (mode === 'formal') {
    return 'Rewrite the dictation in a polished, professional, natural tone. Preserve meaning, remove filler, fix grammar, and keep it concise.'
  }

  if (mode === 'bullets') {
    return 'Turn the dictation into a concise bullet list. Group related points, use short bullets, and preserve all important meaning.'
  }

  if (mode === 'reply') {
    return 'Write a clear, ready-to-send reply based on the dictation. Make it natural, helpful, and concise.'
  }

  return 'Clean up the dictation naturally while preserving meaning.'
}

export class DictationService {
  private activeAbort?: AbortController

  constructor(
    private readonly database: AppDatabase,
    private readonly settings: SettingsService,
    private readonly secrets: SecretService,
    private readonly insertion: ClipboardInsertionService,
    private readonly audioStorage: AudioStorageService,
    private readonly errors: ErrorReporter,
    private readonly getWindows: () => BrowserWindow[],
    private readonly onStatus?: (status: DictationStatus) => void
  ) {}

  cancelActive(): void {
    this.activeAbort?.abort()
    this.activeAbort = undefined
    this.emitStatus('cancelled')
  }

  async retryHistory(id: string): Promise<DictationProcessResult> {
    const item = this.database.getHistory(id)
    if (!item?.audioFilePath) {
      return { inserted: false, error: 'No saved audio is available for this history item.' }
    }

    const bytes = this.audioStorage.load(item.audioFilePath)
    if (!bytes) {
      return { inserted: false, error: 'Saved audio could not be read.' }
    }

    return this.processAudio({
      mode: item.flowType,
      selectedText: item.selectedText,
      audio: {
        bytes,
        mimeType: item.audioMimeType ?? 'audio/webm',
        durationMs: item.durationMs
      }
    })
  }

  async processAudio(request: ProcessAudioRequest): Promise<DictationProcessResult> {
    this.emitStatus('processing')
    const payload = request.audio

    if (payload.durationMs > MAX_DICTATION_DURATION_MS) {
      const message = 'POC dictation recordings are capped at 2 minutes.'
      this.emitStatus('error', message)
      return { inserted: false, error: message }
    }

    if (payload.durationMs < MIN_DICTATION_DURATION_MS || payload.bytes.byteLength < MIN_AUDIO_BYTES) {
      const message = "Didn't catch that."
      this.emitStatus('too-short', message)
      return { inserted: false, error: message }
    }

    this.activeAbort?.abort()
    this.activeAbort = new AbortController()
    const signal = this.activeAbort.signal

    try {
      const [togetherApiKey, anthropicApiKey] = await Promise.all([
        this.secrets.getTogetherApiKey(),
        this.secrets.getAnthropicApiKey()
      ])
      const appSettings = this.settings.get(Boolean(togetherApiKey), Boolean(anthropicApiKey))
      const dictionaryTerms = this.database.listDictionaryTerms().map((term) => term.phrase)
      const defaultTransform = this.database
        .listTransforms()
        .find((transform) => transform.enabled && transform.id === appSettings.defaultTransformId)
      const shouldIncludeLlmContext = this.shouldIncludeLlmContext({
        flowType: request.mode,
        dictationMode: appSettings.dictationMode,
        hasTransform: Boolean(defaultTransform),
        settings: appSettings
      })
      const shouldIncludeScreenshotContext = this.shouldIncludeScreenshotContext({
        flowType: request.mode,
        dictationMode: appSettings.dictationMode,
        hasTransform: Boolean(defaultTransform),
        settings: appSettings
      })
      const context = appSettings.contextEnabled || shouldIncludeLlmContext
        ? await getFrontmostContext(appSettings.redactionEnabled)
        : { redactionEnabled: appSettings.redactionEnabled }
      const contextSelectedText = shouldIncludeLlmContext
        ? request.selectedText || (request.mode === 'dictation' ? await this.captureContextSelection() : undefined)
        : undefined
      const contextText = shouldIncludeLlmContext
        ? this.buildLlmContextText({
            appName: context.appName,
            windowTitle: context.windowTitle,
            selectedText: contextSelectedText,
            redactionEnabled: appSettings.redactionEnabled
          })
        : undefined
      if (contextText) {
        context.textContext = contextText
        context.contextIncluded = true
        context.contextSource = contextSelectedText
          ? context.windowTitle || context.appName
            ? 'frontmost+selected-text'
            : 'selected-text'
          : 'frontmost'
        this.emitStatus('processing', 'Using LLM context')
      }
      const screenshotContext = shouldIncludeScreenshotContext ? await this.tryCaptureScreenshotContext() : undefined
      if (screenshotContext) {
        context.screenshotIncluded = true
        context.screenshotSource = screenshotContext.sourceName
        context.screenshotSize = `${screenshotContext.width}x${screenshotContext.height}`
        this.emitStatus('processing', 'Using screen context')
      }

      const audioFilePath = this.audioStorage.save(`${Date.now()}-${request.mode}`, payload)
      const transcription = await this.transcribeAudio(payload, appSettings, togetherApiKey, signal)
      this.database.recordUsage({
        model: transcription.model,
        asrSeconds: payload.durationMs / 1000
      })

      const llm = new AnthropicLLMProvider(
        anthropicApiKey,
        appSettings.anthropicModel,
        appSettings.anthropicBaseUrl
      )
      const polish =
        request.mode === 'instruction'
          ? await llm.runInstruction(
              {
                instruction: transcription.text,
                selectedText: request.selectedText,
                appName: context.appName,
                contextText,
                screenshotContext
              },
              signal
            )
          : await this.polishDictationByMode({
              transcriptionText: transcription.text,
              appName: context.appName,
              contextText,
              screenshotContext,
              dictionaryTerms,
              defaultTransformPrompt: defaultTransform?.prompt,
              dictationMode: appSettings.dictationMode,
              llm,
              signal
            })

      if (polish.inputTokens || polish.outputTokens) {
        this.database.recordUsage({
          model: polish.model,
          inputTokens: polish.inputTokens,
          outputTokens: polish.outputTokens
        })
      }

      let inserted = false
      let insertError: string | undefined
      try {
        inserted = await this.insertion.insertText(polish.text, appSettings.outputMode)
      } catch (error) {
        insertError = error instanceof Error ? error.message : String(error)
      }
      const copiedOnly = appSettings.outputMode === 'clipboard' || insertError?.includes('text is on your clipboard') || false

      const historyItem = this.database.insertHistory({
        flowType: request.mode,
        rawText: transcription.text,
        formattedText: polish.text,
        instructionText: request.mode === 'instruction' ? transcription.text : undefined,
        selectedText: request.selectedText || contextSelectedText,
        appName: context.appName,
        durationMs: payload.durationMs,
        status: inserted ? 'inserted' : appSettings.outputMode === 'clipboard' ? 'preview' : 'preview',
        contextJson: JSON.stringify(context),
        audioMimeType: payload.mimeType,
        audioFilePath,
        asrProvider: transcription.provider,
        asrModel: transcription.model,
        llmProvider: polish.provider,
        llmModel: polish.model,
        contextIncluded: Boolean(context.contextIncluded),
        screenshotIncluded: Boolean(context.screenshotIncluded),
        error: insertError,
        rawError: insertError
      })

      this.emitStatus(inserted ? 'inserted' : 'preview', insertError)
      return {
        transcription,
        polish,
        historyItem,
        inserted,
        copiedOnly,
        error: insertError
      }
    } catch (error) {
      const message = this.errors.report('dictation/process', error)
      this.emitStatus('error', message)
      return { inserted: false, error: message }
    } finally {
      if (this.activeAbort?.signal === signal) this.activeAbort = undefined
    }
  }

  private transcribeAudio(
    payload: AudioPayload,
    appSettings: ReturnType<SettingsService['get']>,
    togetherApiKey: string | undefined,
    signal?: AbortSignal
  ): Promise<TranscriptionResult> {
    if (appSettings.asrProvider === 'together') {
      if (!togetherApiKey) {
        throw new Error('TOGETHER_API_KEY is not configured.')
      }

      const asr = new TogetherASRProvider(togetherApiKey, {
        model: appSettings.togetherModel,
        language: appSettings.asrLanguage,
        responseFormat: 'json',
        timestampGranularities: 'segment'
      })
      return asr.transcribeAudio(payload, signal)
    }

    if (appSettings.asrProvider === 'argmax-local') {
      const asr = new ArgmaxLocalASRProvider({
        endpoint: appSettings.argmaxEndpoint,
        model: appSettings.argmaxModel,
        language: appSettings.asrLanguage,
        responseFormat: 'json'
      })
      return asr.transcribeAudio(payload, signal)
    }

    throw new Error(`${appSettings.asrProvider} ASR is not implemented in this POC build.`)
  }

  private async polishDictationByMode(input: {
    transcriptionText: string
    appName?: string
    contextText?: string
    screenshotContext?: ScreenshotContext
    dictionaryTerms: string[]
    defaultTransformPrompt?: string
    dictationMode: DictationModePreset
    llm: LLMProvider
    signal?: AbortSignal
  }) {
    const baseInput = {
      rawTranscript: input.transcriptionText,
      appName: input.appName,
      contextText: input.contextText,
      screenshotContext: input.screenshotContext,
      dictionaryTerms: input.dictionaryTerms
    }

    if (input.defaultTransformPrompt) {
      return input.llm.polishDictation(
        {
          ...baseInput,
          transformPrompt: input.defaultTransformPrompt
        },
        input.signal
      )
    }

    if (input.dictationMode === 'raw') return rawPolish(baseInput)
    if (input.dictationMode === 'natural') return deterministicPolish(baseInput)

    return input.llm.polishDictation(
      {
        ...baseInput,
        transformPrompt: dictationModePrompt(input.dictationMode)
      },
      input.signal
    )
  }

  private shouldIncludeLlmContext(input: {
    flowType: 'dictation' | 'instruction'
    dictationMode: DictationModePreset
    hasTransform: boolean
    settings: ReturnType<SettingsService['get']>
  }): boolean {
    if (!input.settings.llmContextEnabled) return false
    if (input.flowType === 'instruction') return true
    if (input.hasTransform) return true
    return input.dictationMode === 'formal' || input.dictationMode === 'bullets' || input.dictationMode === 'reply'
  }

  private shouldIncludeScreenshotContext(input: {
    flowType: 'dictation' | 'instruction'
    dictationMode: DictationModePreset
    hasTransform: boolean
    settings: ReturnType<SettingsService['get']>
  }): boolean {
    if (!input.settings.llmScreenshotContextEnabled) return false
    if (input.flowType === 'instruction') return true
    if (input.hasTransform) return true
    return input.dictationMode === 'formal' || input.dictationMode === 'bullets' || input.dictationMode === 'reply'
  }

  private async tryCaptureScreenshotContext(): Promise<ScreenshotContext | undefined> {
    const permissionStatus = getScreenPermissionStatus()
    if (process.platform === 'darwin' && permissionStatus !== 'granted') {
      this.emitStatus('processing', 'Screen Recording permission needed; continuing without screen context.')
      return undefined
    }

    try {
      const context = await captureScreenContext()
      if (!context) {
        this.emitStatus('processing', 'Screen capture unavailable; continuing without screen context.')
      }
      return context
    } catch (error) {
      this.errors.report('context/screenshot', error)
      this.emitStatus('processing', 'Screen capture failed; continuing without screen context.')
      return undefined
    }
  }

  private async captureContextSelection(): Promise<string | undefined> {
    try {
      const capture = await this.insertion.captureSelectedTextResult()
      return capture.ok ? capture.text : undefined
    } catch {
      return undefined
    }
  }

  private buildLlmContextText(input: {
    appName?: string
    windowTitle?: string
    selectedText?: string
    redactionEnabled: boolean
  }): string | undefined {
    const parts: string[] = []
    if (input.appName) parts.push(`App: ${input.appName}`)
    if (input.windowTitle) parts.push(`Window: ${input.windowTitle}`)
    if (input.selectedText?.trim()) {
      parts.push(`Selected text:\n${redactText(input.selectedText.trim(), input.redactionEnabled).slice(0, 4000)}`)
    }

    return parts.length ? parts.join('\n') : undefined
  }

  private emitStatus(status: DictationStatus, detail?: string): void {
    this.onStatus?.(status)
    for (const window of this.getWindows()) {
      window.webContents.send('dictation:status', status, detail)
    }
  }
}
