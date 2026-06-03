import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'

type PersistedSettings = Omit<AppSettings, 'hasTogetherApiKey' | 'hasAnthropicApiKey'>

const defaultSettings: PersistedSettings = {
  hotkey: 'CommandOrControl+Shift+Space',
  instructionHotkey: 'CommandOrControl+Shift+I',
  activationMode: 'tap-toggle',
  outputMode: 'paste',
  dictationMode: 'natural',
  asrProvider: 'together',
  togetherModel: 'nvidia/parakeet-tdt-0.6b-v3',
  argmaxEndpoint: 'http://127.0.0.1:50060/v1/audio/transcriptions',
  argmaxModel: 'tiny',
  argmaxServerCwd: '',
  asrLanguage: 'auto',
  inputLanguage: 'auto',
  launchAtLogin: false,
  onboardingComplete: false,
  llmProvider: 'anthropic',
  llmModel: 'claude-3-5-haiku-20241022',
  anthropicModel: 'claude-3-5-haiku-20241022',
  anthropicBaseUrl: '',
  llmContextEnabled: false,
  llmScreenshotContextEnabled: false,
  contextEnabled: true,
  redactionEnabled: true
}

export class SettingsService {
  private readonly store = new Store<PersistedSettings>({
    name: 'settings',
    defaults: defaultSettings
  })

  get(hasTogetherApiKey = Boolean(process.env.TOGETHER_API_KEY), hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY)): AppSettings {
    return {
      ...defaultSettings,
      ...this.store.store,
      asrProvider: this.store.store.asrProvider ?? 'together',
      argmaxEndpoint: this.store.store.argmaxEndpoint ?? defaultSettings.argmaxEndpoint,
      argmaxModel: this.store.store.argmaxModel ?? defaultSettings.argmaxModel,
      argmaxServerCwd: this.store.store.argmaxServerCwd ?? defaultSettings.argmaxServerCwd,
      llmProvider: this.store.store.llmProvider ?? 'anthropic',
      dictationMode: this.store.store.dictationMode ?? defaultSettings.dictationMode,
      llmContextEnabled: this.store.store.llmContextEnabled ?? defaultSettings.llmContextEnabled,
      llmScreenshotContextEnabled:
        this.store.store.llmScreenshotContextEnabled ?? defaultSettings.llmScreenshotContextEnabled,
      anthropicBaseUrl: this.store.store.anthropicBaseUrl || process.env.ANTHROPIC_BASE_URL || '',
      hasTogetherApiKey,
      hasAnthropicApiKey
    }
  }

  update(partial: Partial<AppSettings>): PersistedSettings {
    const sanitized: Partial<PersistedSettings> = { ...partial }
    delete (sanitized as Partial<AppSettings>).hasTogetherApiKey
    delete (sanitized as Partial<AppSettings>).hasAnthropicApiKey
    if (!sanitized.llmModel && sanitized.anthropicModel) sanitized.llmModel = sanitized.anthropicModel
    this.store.set(sanitized)
    return {
      ...defaultSettings,
      ...this.store.store
    }
  }
}
