import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AppView,
  ArgmaxServerStatus,
  AudioPayload,
  DiagnosticError,
  DictationProcessResult,
  DictationStatus,
  HistoryItem,
  HotkeyRegistrationStatus,
  LocalDataSummary,
  ProcessAudioRequest,
  ProviderTestResult,
  SelectedTextCaptureResult,
  SecretUpdate,
  SessionMode,
  UsageSummary,
  OpenWhisperflowApi
} from '../shared/types'

const api: OpenWhisperflowApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', settings),
  setSecrets: (secrets: SecretUpdate) => ipcRenderer.invoke('settings:set-secrets', secrets),
  completeOnboarding: () => ipcRenderer.invoke('settings:complete-onboarding'),
  processAudio: (request: ProcessAudioRequest): Promise<DictationProcessResult> =>
    ipcRenderer.invoke('dictation:process-audio', request),
  cancelActive: (): Promise<void> => ipcRenderer.invoke('dictation:cancel-active'),
  setRecordingState: (active: boolean): Promise<void> => ipcRenderer.invoke('dictation:recording-state', active),
  captureSelectedText: (): Promise<string | undefined> => ipcRenderer.invoke('context:capture-selected-text'),
  testSelectedTextCapture: (): Promise<SelectedTextCaptureResult> =>
    ipcRenderer.invoke('context:test-selected-text-capture'),
  captureSelectedTextWithDiagnostics: (): Promise<SelectedTextCaptureResult> =>
    ipcRenderer.invoke('context:test-selected-text-capture'),
  testScreenCapture: () => ipcRenderer.invoke('context:test-screen-capture'),
  pasteText: (text: string): Promise<boolean> => ipcRenderer.invoke('insertion:paste-text', text),
  listHistory: (query?: string): Promise<HistoryItem[]> => ipcRenderer.invoke('history:list', query),
  deleteHistory: (id: string): Promise<void> => ipcRenderer.invoke('history:delete', id),
  repasteHistory: (id: string): Promise<boolean> => ipcRenderer.invoke('history:repaste', id),
  retryHistory: (id: string): Promise<DictationProcessResult> => ipcRenderer.invoke('history:retry', id),
  getUsage: (): Promise<UsageSummary> => ipcRenderer.invoke('usage:get'),
  resetUsage: (): Promise<UsageSummary> => ipcRenderer.invoke('usage:reset'),
  getDiagnostics: (): Promise<DiagnosticError[]> => ipcRenderer.invoke('diagnostics:list'),
  getHotkeyStatus: (): Promise<HotkeyRegistrationStatus> => ipcRenderer.invoke('hotkeys:status'),
  testAnthropic: (): Promise<ProviderTestResult> => ipcRenderer.invoke('providers:test-anthropic'),
  testTogether: (): Promise<ProviderTestResult> => ipcRenderer.invoke('providers:test-together'),
  testArgmaxEndpoint: (): Promise<ProviderTestResult> => ipcRenderer.invoke('providers:test-argmax'),
  getArgmaxServerStatus: (): Promise<ArgmaxServerStatus> => ipcRenderer.invoke('argmax:status'),
  chooseArgmaxRepoPath: (): Promise<string | undefined> => ipcRenderer.invoke('argmax:choose-repo'),
  startArgmaxServer: (): Promise<ArgmaxServerStatus> => ipcRenderer.invoke('argmax:start'),
  stopArgmaxServer: (): Promise<ArgmaxServerStatus> => ipcRenderer.invoke('argmax:stop'),
  exportLocalData: () => ipcRenderer.invoke('local-data:export'),
  deleteAllData: (): Promise<void> => ipcRenderer.invoke('local-data:delete-all'),
  getLocalDataSummary: (): Promise<LocalDataSummary> => ipcRenderer.invoke('local-data:summary'),
  getMicPermissionStatus: (): Promise<string> => ipcRenderer.invoke('permissions:mic-status'),
  getScreenPermissionStatus: (): Promise<string> => ipcRenderer.invoke('permissions:screen-status'),
  requestMicPermission: (): Promise<boolean> => ipcRenderer.invoke('permissions:request-mic'),
  getAccessibilityStatus: (): Promise<boolean> => ipcRenderer.invoke('permissions:accessibility-status'),
  requestAccessibility: (): Promise<boolean> => ipcRenderer.invoke('permissions:request-accessibility'),
  openSystemSettings: (section: 'microphone' | 'accessibility' | 'keyboard' | 'screen'): Promise<void> =>
    ipcRenderer.invoke('system-settings:open', section),
  onToggleRecording(callback: (mode: SessionMode) => void) {
    const listener = (_event: Electron.IpcRendererEvent, mode: SessionMode): void => callback(mode)
    ipcRenderer.on('dictation:toggle-recording', listener)
    return () => ipcRenderer.removeListener('dictation:toggle-recording', listener)
  },
  onCancelRecording(callback: () => void) {
    const listener = (): void => callback()
    ipcRenderer.on('dictation:cancel-recording', listener)
    return () => ipcRenderer.removeListener('dictation:cancel-recording', listener)
  },
  onStatus(callback: (status: DictationStatus, detail?: string) => void) {
    const listener = (_event: Electron.IpcRendererEvent, status: DictationStatus, detail?: string): void =>
      callback(status, detail)
    ipcRenderer.on('dictation:status', listener)
    return () => ipcRenderer.removeListener('dictation:status', listener)
  },
  onNavigate(callback: (view: AppView) => void) {
    const listener = (_event: Electron.IpcRendererEvent, view: AppView): void => callback(view)
    ipcRenderer.on('app:navigate', listener)
    return () => ipcRenderer.removeListener('app:navigate', listener)
  }
}

contextBridge.exposeInMainWorld('openWhisperflow', api)
contextBridge.exposeInMainWorld('voiceDesk', api)
