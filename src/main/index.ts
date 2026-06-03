import { join } from 'node:path'
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell, systemPreferences } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { ArgmaxServerManager } from './asr/argmaxServer'
import { AudioStorageService } from './audio/storage'
import { AppDatabase } from './db/database'
import { DictationService } from './dictation/service'
import { ErrorReporter } from './errors/errors'
import { HotkeyService } from './hotkey/hotkey'
import { ClipboardInsertionService } from './insertion/clipboard'
import { testAnthropicProvider, testArgmaxEndpoint, testTogetherProvider } from './providers/testers'
import { SecretService } from './secrets/secrets'
import { SettingsService } from './settings/settings'
import { getScreenPermissionStatus, testScreenCapture } from './context/screenshot'
import type {
  AppSettings,
  AppView,
  DictationModePreset,
  DictationStatus,
  HotkeyRegistrationStatus,
  SessionMode
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
let hudWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayStatus: DictationStatus = 'idle'
let isQuitting = false
let lastHotkeyEvent: { mode: SessionMode; firedAt: number } | undefined
const settings = new SettingsService()
let hotkeyRegistration: HotkeyRegistrationStatus = {
  dictation: {
    accelerator: settings.get().hotkey,
    registered: false
  },
  instruction: {
    accelerator: settings.get().instructionHotkey,
    registered: false
  }
}

const secrets = new SecretService()
let database: AppDatabase
let dictation: DictationService
const insertion = new ClipboardInsertionService()
const audioStorage = new AudioStorageService()
const argmaxServer = new ArgmaxServerManager()
const hotkeys = new HotkeyService()
let errors: ErrorReporter
let hudHideTimer: ReturnType<typeof setTimeout> | undefined
let cancelShortcutActive = false
const APP_NAME = 'OpenWhisperflow'
const MENU_BAR_PREFIX = 'OW'

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  updateTray()
  if (process.platform === 'darwin') app.focus({ steal: true })
}

function toggleMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
    return
  }

  showMainWindow()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: APP_NAME,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6fffd',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', showMainWindow)
  mainWindow.webContents.on('did-finish-load', showMainWindow)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Renderer failed to load (${errorCode}): ${errorDescription}`)
    showMainWindow()
  })

  setTimeout(showMainWindow, 1500)

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('show', () => updateTray())
  mainWindow.on('hide', () => updateTray())

  mainWindow.on('closed', () => {
    mainWindow = null
    updateTray()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function hudBounds(): Electron.Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea
  const width = 300
  const height = 46
  return {
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + 12
  }
}

function createHudWindow(): void {
  hudWindow = new BrowserWindow({
    ...hudBounds(),
    title: `${APP_NAME} HUD`,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  hudWindow.setAlwaysOnTop(true, 'floating')
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hudWindow.setFullScreenable(false)

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    hudWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/hud`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/hud' })
  }

  hudWindow.on('closed', () => {
    hudWindow = null
  })
}

function setHudForStatus(status: string): void {
  if (!hudWindow) return
  if (isDictationStatus(status)) updateTray(status)
  setCancelShortcutActive(status === 'listening' || status === 'processing')
  if (hudHideTimer) clearTimeout(hudHideTimer)

  if (['listening', 'processing', 'inserted', 'preview', 'cancelled', 'too-short', 'error'].includes(status)) {
    hudWindow.setBounds(hudBounds())
    hudWindow.showInactive()
    hudWindow.moveTop()
  }

  if (['inserted', 'preview', 'cancelled', 'too-short', 'error'].includes(status)) {
    hudHideTimer = setTimeout(() => {
      hudWindow?.hide()
    }, status === 'error' ? 3200 : 1300)
  }

  if (status === 'idle') {
    hudWindow.hide()
  }
}

function createTray(): void {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip(`${APP_NAME} - Idle`)
  if (process.platform === 'darwin') tray.setTitle(MENU_BAR_PREFIX)
  tray.on('click', toggleMainWindow)
  updateTray('idle')
}

function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#000" d="M9 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path fill="#000" d="M4 8.4a1 1 0 1 0-2 0A7 7 0 0 0 8 15v1H5.8a1 1 0 1 0 0 2h6.4a1 1 0 1 0 0-2H10v-1a7 7 0 0 0 6-6.6 1 1 0 1 0-2 0A5 5 0 0 1 4 8.4Z"/>
    </svg>
  `
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function updateTray(status: DictationStatus = trayStatus): void {
  trayStatus = status
  if (!tray) return

  const label = trayStatusLabel(status)
  const currentSettings = settings.get()
  const modeLabel = dictationModeLabel(currentSettings.dictationMode)
  tray.setToolTip(`${APP_NAME} - ${label} - ${modeLabel}`)
  if (process.platform === 'darwin') {
    tray.setTitle(trayStatusTitle(status, currentSettings.dictationMode))
    app.dock?.setBadge(dockStatusBadge(status))
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Status: ${label} · ${modeLabel}`,
        enabled: false
      },
      {
        label: 'Dictation Mode',
        submenu: dictationModeMenu(currentSettings.dictationMode)
      },
      { type: 'separator' },
      {
        label: mainWindow?.isVisible() ? `Hide ${APP_NAME}` : `Show ${APP_NAME}`,
        click: toggleMainWindow
      },
      { type: 'separator' },
      {
        label: status === 'listening' ? 'Stop Dictation' : 'Start Dictation',
        click: () => sendRecordingToggle('dictation')
      },
      {
        label: status === 'listening' ? 'Stop Instruction' : 'Start Instruction',
        click: () => sendRecordingToggle('instruction')
      },
      {
        label: 'Cancel Active Recording',
        enabled: status === 'listening' || status === 'processing',
        click: () => {
          mainWindow?.webContents.send('dictation:cancel-recording')
          hudWindow?.webContents.send('dictation:cancel-recording')
          dictation?.cancelActive()
        }
      },
      { type: 'separator' },
      {
        label: 'Paste Last Transcript',
        click: async () => {
          const latest = database.listHistory()[0]
          if (latest) await insertion.insertText(latest.formattedText, settings.get().outputMode)
        }
      },
      {
        label: 'Open Settings',
        click: () => openView('settings')
      },
      {
        label: 'Open History',
        click: () => openView('history')
      },
      { type: 'separator' },
      { role: 'quit' }
    ])
  )
}

function createDockMenu(): void {
  if (process.platform !== 'darwin' || !app.dock) return

  app.dock.setMenu(
    Menu.buildFromTemplate([
      {
        label: `Show ${APP_NAME}`,
        click: () => openView('dictation')
      },
      {
        label: 'Start Dictation',
        click: () => sendRecordingToggle('dictation')
      },
      {
        label: 'Start Instruction',
        click: () => sendRecordingToggle('instruction')
      },
      {
        label: 'Open Settings',
        click: () => openView('settings')
      }
    ])
  )
}

function openView(view: AppView): void {
  if (!mainWindow) createWindow()
  showMainWindow()

  const send = (): void => {
    mainWindow?.webContents.send('app:navigate', view)
  }

  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send)
    return
  }

  send()
}

function trayStatusLabel(status: DictationStatus): string {
  if (status === 'listening') return 'Listening'
  if (status === 'processing') return 'Processing'
  if (status === 'inserted') return 'Inserted'
  if (status === 'preview') return 'Copied'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'too-short') return "Didn't catch that"
  if (status === 'error') return 'Needs attention'
  return 'Idle'
}

function trayStatusTitle(status: DictationStatus, mode: DictationModePreset): string {
  const suffix = dictationModeShortLabel(mode)
  if (status === 'listening') return `${MENU_BAR_PREFIX} ${suffix} REC`
  if (status === 'processing') return `${MENU_BAR_PREFIX} ${suffix} ...`
  if (status === 'error') return `${MENU_BAR_PREFIX} ${suffix} !`
  return `${MENU_BAR_PREFIX} ${suffix}`
}

function dictationModeMenu(currentMode: DictationModePreset): Electron.MenuItemConstructorOptions[] {
  return (['natural', 'raw', 'formal', 'bullets', 'reply'] as const).map((mode) => ({
    label: `${dictationModeLabel(mode)}${modeRequiresLlm(mode) ? ' - uses LLM' : ' - local'}`,
    type: 'radio',
    checked: currentMode === mode,
    click: () => {
      settings.update({ dictationMode: mode })
      updateTray()
    }
  }))
}

function dictationModeLabel(mode: DictationModePreset): string {
  if (mode === 'raw') return 'Raw'
  if (mode === 'formal') return 'Formal'
  if (mode === 'bullets') return 'Bullets'
  if (mode === 'reply') return 'Reply'
  return 'Natural'
}

function dictationModeShortLabel(mode: DictationModePreset): string {
  if (mode === 'raw') return 'R'
  if (mode === 'formal') return 'F'
  if (mode === 'bullets') return 'B'
  if (mode === 'reply') return 'P'
  return 'N'
}

function modeRequiresLlm(mode: DictationModePreset): boolean {
  return mode === 'formal' || mode === 'bullets' || mode === 'reply'
}

function dockStatusBadge(status: DictationStatus): string {
  if (status === 'listening') return 'REC'
  if (status === 'processing') return '...'
  if (status === 'error') return '!'
  return ''
}

function isDictationStatus(status: string): status is DictationStatus {
  return ['idle', 'listening', 'processing', 'inserted', 'preview', 'cancelled', 'too-short', 'error'].includes(status)
}

function sendRecordingToggle(mode: SessionMode): void {
  if (!mainWindow) createWindow()
  showMainWindow()

  const send = (): void => {
    mainWindow?.webContents.send('dictation:toggle-recording', mode)
  }

  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send)
    return
  }

  send()
}

function sendHotkeyToggle(mode: SessionMode): void {
  const now = Date.now()
  if (lastHotkeyEvent?.mode === mode && now - lastHotkeyEvent.firedAt < 650) {
    return
  }
  lastHotkeyEvent = { mode, firedAt: now }

  console.log(`${APP_NAME} hotkey fired: ${mode}`)

  if (!mainWindow) {
    createWindow()
  }

  const send = (): void => {
    mainWindow?.webContents.send('dictation:toggle-recording', mode)
  }

  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send)
    return
  }

  send()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => {
    const [togetherApiKey, anthropicApiKey] = await Promise.all([
      secrets.getTogetherApiKey(),
      secrets.getAnthropicApiKey()
    ])
    return settings.get(Boolean(togetherApiKey), Boolean(anthropicApiKey))
  })

  ipcMain.handle('settings:update', async (_event, partial) => {
    const updated = settings.update(partial)
    applyRuntimeSettings(updated)
    const [togetherApiKey, anthropicApiKey] = await Promise.all([
      secrets.getTogetherApiKey(),
      secrets.getAnthropicApiKey()
    ])
    return settings.get(Boolean(togetherApiKey), Boolean(anthropicApiKey))
  })

  ipcMain.handle('settings:set-secrets', async (_event, payload) => {
    if ('togetherApiKey' in payload) await secrets.setTogetherApiKey(payload.togetherApiKey)
    if ('anthropicApiKey' in payload) await secrets.setAnthropicApiKey(payload.anthropicApiKey)
    const [togetherApiKey, anthropicApiKey] = await Promise.all([
      secrets.getTogetherApiKey(),
      secrets.getAnthropicApiKey()
    ])
    return settings.get(Boolean(togetherApiKey), Boolean(anthropicApiKey))
  })

  ipcMain.handle('settings:complete-onboarding', async () => {
    const updated = settings.update({ onboardingComplete: true })
    return settings.get(Boolean(await secrets.getTogetherApiKey()), Boolean(await secrets.getAnthropicApiKey()))
  })
  ipcMain.handle('dictation:process-audio', (_event, request) => dictation.processAudio(request))
  ipcMain.handle('dictation:cancel-active', () => {
    dictation.cancelActive()
    setCancelShortcutActive(false)
  })
  ipcMain.handle('dictation:recording-state', (_event, active: boolean) => {
    setCancelShortcutActive(Boolean(active))
  })
  ipcMain.handle('context:capture-selected-text', () => insertion.captureSelectedText())
  ipcMain.handle('context:test-selected-text-capture', () => insertion.captureSelectedTextResult())
  ipcMain.handle('context:test-screen-capture', () => testScreenCapture())
  ipcMain.handle('insertion:paste-text', async (_event, text: string) => {
    const current = settings.get()
    return insertion.insertText(text, current.outputMode)
  })
  ipcMain.handle('history:list', (_event, query?: string) => database.listHistory(query))
  ipcMain.handle('history:delete', (_event, id: string) => database.deleteHistory(id))
  ipcMain.handle('history:repaste', async (_event, id: string) => {
    const item = database.getHistory(id)
    return item ? insertion.insertText(item.formattedText, settings.get().outputMode) : false
  })
  ipcMain.handle('history:retry', (_event, id: string) => dictation.retryHistory(id))
  ipcMain.handle('usage:get', () => database.getUsageSummary())
  ipcMain.handle('usage:reset', () => database.resetUsage())
  ipcMain.handle('diagnostics:list', () => database.getDiagnostics())
  ipcMain.handle('hotkeys:status', () => hotkeyRegistration)
  ipcMain.handle('providers:test-anthropic', async () =>
    testAnthropicProvider(await secrets.getAnthropicApiKey(), settings.get())
  )
  ipcMain.handle('providers:test-together', async () => testTogetherProvider(await secrets.getTogetherApiKey()))
  ipcMain.handle('providers:test-argmax', () => testArgmaxEndpoint(settings.get()))
  ipcMain.handle('argmax:status', () => argmaxServer.status(settings.get()))
  ipcMain.handle('argmax:choose-repo', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose argmax-oss-swift folder',
      properties: ['openDirectory']
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })
  ipcMain.handle('argmax:start', () => argmaxServer.start(settings.get()))
  ipcMain.handle('argmax:stop', () => argmaxServer.stop(settings.get()))
  ipcMain.handle('local-data:export', async () => {
    const [togetherApiKey, anthropicApiKey] = await Promise.all([
      secrets.getTogetherApiKey(),
      secrets.getAnthropicApiKey()
    ])
    return database.exportData(settings.get(Boolean(togetherApiKey), Boolean(anthropicApiKey)))
  })
  ipcMain.handle('local-data:delete-all', () => {
    database.deleteAllData()
    audioStorage.clear()
  })
  ipcMain.handle('local-data:summary', () => database.summary())
  ipcMain.handle('permissions:mic-status', () => {
    if (process.platform !== 'darwin') return 'granted'
    return systemPreferences.getMediaAccessStatus('microphone')
  })
  ipcMain.handle('permissions:screen-status', () => getScreenPermissionStatus())
  ipcMain.handle('permissions:request-mic', async () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  ipcMain.handle('permissions:accessibility-status', () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(false)
  })
  ipcMain.handle('permissions:request-accessibility', () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(true)
  })
  ipcMain.handle('system-settings:open', (_event, section: string) => {
    const urls: Record<string, string> = {
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      keyboard: 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'
    }
    return shell.openExternal(urls[section] ?? urls.keyboard)
  })
}

function allAppWindows(): BrowserWindow[] {
  return [mainWindow, hudWindow].filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
}

function setCancelShortcutActive(active: boolean): void {
  if (active === cancelShortcutActive) return

  if (active) {
    cancelShortcutActive = hotkeys.registerCancel(() => {
      mainWindow?.webContents.send('dictation:cancel-recording')
      hudWindow?.webContents.send('dictation:cancel-recording')
      dictation?.cancelActive()
      setCancelShortcutActive(false)
    })
    return
  }

  hotkeys.unregister('Escape')
  cancelShortcutActive = false
}

function applyRuntimeSettings(
  currentSettings: Pick<AppSettings, 'hotkey' | 'instructionHotkey' | 'launchAtLogin'> = settings.get()
): { dictation: boolean; instruction: boolean } {
  cancelShortcutActive = false
  hotkeys.unregister()
  const dictationHotkey = hotkeys.register(currentSettings.hotkey, () => sendHotkeyToggle('dictation'))
  const instructionHotkey =
    currentSettings.instructionHotkey === currentSettings.hotkey
      ? false
      : hotkeys.register(currentSettings.instructionHotkey, () => sendHotkeyToggle('instruction'))

  hotkeyRegistration = {
    dictation: {
      accelerator: currentSettings.hotkey,
      registered: dictationHotkey
    },
    instruction: {
      accelerator: currentSettings.instructionHotkey,
      registered: instructionHotkey
    }
  }

  if (!dictationHotkey || !instructionHotkey) {
    console.warn(`${APP_NAME} hotkey registration failed`, hotkeyRegistration)
  }

  try {
    if (app.getLoginItemSettings().openAtLogin !== currentSettings.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: currentSettings.launchAtLogin })
    }
  } catch {
    // Login item APIs can be unavailable for unsigned dev builds.
  }
  return { dictation: dictationHotkey, instruction: instructionHotkey }
}

app.whenReady().then(() => {
  app.setName(APP_NAME)
  electronApp.setAppUserModelId('com.robertoamoreno.openwhisperflow')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  database = new AppDatabase()
  errors = new ErrorReporter((source, message, rawMessage) => database.addDiagnostic(source, message, rawMessage))
  dictation = new DictationService(database, settings, secrets, insertion, audioStorage, errors, allAppWindows, setHudForStatus)
  registerIpc()
  createWindow()
  createHudWindow()
  createTray()
  createDockMenu()

  const currentSettings = settings.get()
  const registered = applyRuntimeSettings(currentSettings)
  if (!registered.dictation || !registered.instruction) {
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('dictation:status', 'error', `Could not register one or more ${APP_NAME} hotkeys.`)
    })
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('second-instance', () => {
  if (!mainWindow) createWindow()
  showMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  hotkeys.unregister()
})
