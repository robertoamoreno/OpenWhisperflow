import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  Check,
  Clipboard,
  Database,
  History,
  KeyRound,
  Loader2,
  Mic,
  MicOff,
  RefreshCcw,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Wand2
} from 'lucide-react'
import type {
  AppSettings,
  AppView,
  ArgmaxServerStatus,
  DiagnosticError,
  DictationProcessResult,
  DictationStatus,
  HistoryItem,
  HotkeyRegistrationStatus,
  LocalDataSummary,
  ProviderTestResult,
  ScreenshotCaptureResult,
  SelectedTextCaptureResult,
  SecretUpdate,
  SessionMode,
  UsageSummary
} from '../../shared/types'
import './styles.css'

type View = AppView
type HotkeyField = 'hotkey' | 'instructionHotkey'

const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
const silenceThreshold = 0.012
const modifierOnlyKeys = new Set(['Alt', 'Control', 'Meta', 'Shift', 'OS', 'Fn'])
const keyAliases: Record<string, string> = {
  ' ': 'Space',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab'
}

function acceleratorFromKeyboardEvent(event: KeyboardEvent | React.KeyboardEvent): string | undefined {
  const key = keyAliases[event.key] ?? event.key
  if (!key || modifierOnlyKeys.has(key)) return undefined

  const parts: string[] = []
  if (event.metaKey) parts.push('CommandOrControl')
  if (event.ctrlKey && !event.metaKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  const normalizedKey = /^Key[A-Z]$/.test((event as KeyboardEvent).code ?? '')
    ? ((event as KeyboardEvent).code as string).replace('Key', '')
    : /^Digit[0-9]$/.test((event as KeyboardEvent).code ?? '')
      ? ((event as KeyboardEvent).code as string).replace('Digit', '')
      : key.length === 1
        ? key.toUpperCase()
        : key

  if (!parts.length && normalizedKey.length === 1) return undefined
  return [...parts, normalizedKey].join('+')
}

function buildSecretUpdate(togetherKey: string, anthropicKey: string): SecretUpdate {
  const secrets: SecretUpdate = {}
  if (togetherKey.trim()) secrets.togetherApiKey = togetherKey.trim()
  if (anthropicKey.trim()) secrets.anthropicApiKey = anthropicKey.trim()
  return secrets
}

function hasSecretUpdate(secrets: SecretUpdate): boolean {
  return 'togetherApiKey' in secrets || 'anthropicApiKey' in secrets
}

async function encodeMediaRecorderAudio(chunks: Blob[], mimeType: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const blob = new Blob(chunks, { type: mimeType })
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: blob.type || mimeType
  }
}

function encodeWav(chunks: Float32Array[], sampleRate: number): { bytes: Uint8Array; mimeType: string } {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  let offset = 0

  function writeString(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index))
      offset += 1
    }
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + sampleCount * 2, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * 2, true)
  offset += 4
  view.setUint16(offset, 2, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, sampleCount * 2, true)
  offset += 4

  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      offset += 2
    }
  }

  return {
    bytes: new Uint8Array(buffer),
    mimeType: 'audio/wav'
  }
}

function App(): React.JSX.Element {
  if (!window.openWhisperflow) return <BridgeUnavailable />
  if (window.location.hash === '#/hud') return <HudApp />
  return <OpenWhisperflowApp />
}

function BridgeUnavailable(): React.JSX.Element {
  return (
    <main className="bridge-unavailable">
      <div className="brand-mark">
        <Mic size={18} aria-hidden="true" />
      </div>
      <h1>Open OpenWhisperflow from Electron</h1>
      <p>
        The renderer is loaded, but the desktop bridge is unavailable. Start the app with
        <code>npm run dev</code> and use the Electron window.
      </p>
    </main>
  )
}

function HudApp(): React.JSX.Element {
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [detail, setDetail] = useState<string>()

  useEffect(() => window.openWhisperflow.onStatus((next, message) => {
    setStatus(next)
    setDetail(message)
  }), [])

  const label = status === 'listening'
    ? 'Listening'
    : status === 'processing'
      ? 'Processing'
      : status === 'inserted'
        ? 'Inserted'
        : status === 'preview'
          ? 'Copied'
          : status === 'cancelled'
            ? 'Cancelled'
            : status === 'too-short'
              ? "Didn't catch that"
              : status === 'error'
                ? 'Needs attention'
                : 'OpenWhisperflow'

  return (
    <main className={`hud-shell ${status}`}>
      <div className={`hud-dot ${status}`} />
      <span>{detail || label}</span>
      {status === 'processing' && <Loader2 size={16} className="spin" aria-hidden="true" />}
    </main>
  )
}

function OpenWhisperflowApp(): React.JSX.Element {
  const [view, setView] = useState<View>('dictation')
  const [status, setStatus] = useState<DictationStatus>('idle')
  const [detail, setDetail] = useState<string>()
  const [settings, setSettings] = useState<AppSettings>()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [usage, setUsage] = useState<UsageSummary>()
  const [diagnostics, setDiagnostics] = useState<DiagnosticError[]>([])
  const [argmaxStatus, setArgmaxStatus] = useState<ArgmaxServerStatus>()
  const [localData, setLocalData] = useState<LocalDataSummary>()
  const [preview, setPreview] = useState<DictationProcessResult>()
  const [currentMode, setCurrentMode] = useState<SessionMode>('dictation')
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('audio/webm')
  const recordingStartedAtRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const speechCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const inputSampleRateRef = useRef(48000)
  const heardSpeechRef = useRef(false)
  const selectedTextRef = useRef<string | undefined>(undefined)
  const cancelledRef = useRef(false)

  const reload = useCallback(async () => {
    const [nextSettings, nextHistory, nextLocalData, nextUsage, nextDiagnostics, nextArgmaxStatus] = await Promise.all([
      window.openWhisperflow.getSettings(),
      window.openWhisperflow.listHistory(),
      window.openWhisperflow.getLocalDataSummary(),
      window.openWhisperflow.getUsage(),
      window.openWhisperflow.getDiagnostics(),
      window.openWhisperflow.getArgmaxServerStatus()
    ])
    setSettings(nextSettings)
    setHistory(nextHistory)
    setLocalData(nextLocalData)
    setUsage(nextUsage)
    setDiagnostics(nextDiagnostics)
    setArgmaxStatus(nextArgmaxStatus)
  }, [])

  useEffect(() => {
    void reload()
    void navigator.mediaDevices.enumerateDevices().then((devices) => {
      setAudioDevices(devices.filter((device) => device.kind === 'audioinput'))
    }).catch(() => undefined)
    const unsubscribeStatus = window.openWhisperflow.onStatus((nextStatus, nextDetail) => {
      setStatus(nextStatus)
      setDetail(nextDetail)
    })
    return unsubscribeStatus
  }, [reload])

  const cleanupAudio = useCallback(() => {
    if (speechCheckRef.current) clearInterval(speechCheckRef.current)
    speechCheckRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }, [])

  const cancelRecording = useCallback(async () => {
    cancelledRef.current = true
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    cleanupAudio()
    setStatus('cancelled')
    setDetail(undefined)
    await window.openWhisperflow.cancelActive()
    await window.openWhisperflow.setRecordingState(false)
  }, [cleanupAudio])

  const startRecording = useCallback(async (mode: SessionMode) => {
    if (status === 'listening') {
      await stopRecording()
      return
    }
    if (status === 'processing') return

    setPreview(undefined)
    setDetail(undefined)
    setCurrentMode(mode)
    selectedTextRef.current = undefined
    cancelledRef.current = false
    heardSpeechRef.current = false
    pcmChunksRef.current = []

    try {
      if (mode === 'instruction') {
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))
          const capture = await window.openWhisperflow.captureSelectedTextWithDiagnostics()
          selectedTextRef.current = capture.text
          setDetail(
            capture.ok
              ? `${capture.message} Speak the change, then press the instruction hotkey again.`
              : `${capture.message} OpenWhisperflow will continue as instruction-only generation.`
          )
        } catch (error) {
          selectedTextRef.current = undefined
          setDetail(error instanceof Error ? error.message : String(error))
        }
      }

      const deviceId = settings?.selectedAudioDeviceId
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      })
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      inputSampleRateRef.current = audioContext.sampleRate
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      if (settings?.asrProvider === 'argmax-local') {
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        processor.onaudioprocess = (event): void => {
          pcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)))
        }
        source.connect(processor)
        processor.connect(silentGain)
        silentGain.connect(audioContext.destination)
      }
      const samples = new Uint8Array(analyser.frequencyBinCount)
      speechCheckRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const normalized = (sample - 128) / 128
          sum += normalized * normalized
        }
        if (Math.sqrt(sum / samples.length) > silenceThreshold) heardSpeechRef.current = true
      }, 120)

      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      mimeTypeRef.current = mimeType || recorder.mimeType || 'audio/webm'

      recorder.ondataavailable = (event): void => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async (): Promise<void> => {
        cleanupAudio()
        if (cancelledRef.current) return

        const durationMs = Date.now() - recordingStartedAtRef.current
        const hasAudio =
          settings?.asrProvider === 'argmax-local' ? pcmChunksRef.current.length > 0 : chunksRef.current.length > 0
        if (durationMs < 500 || !hasAudio || !heardSpeechRef.current) {
          await window.openWhisperflow.setRecordingState(false)
          setStatus('too-short')
          setDetail("Didn't catch that.")
          return
        }

        const audio =
          settings?.asrProvider === 'argmax-local'
            ? encodeWav(pcmChunksRef.current, inputSampleRateRef.current)
            : await encodeMediaRecorderAudio(chunksRef.current, mimeTypeRef.current)
        await window.openWhisperflow.setRecordingState(false)
        setStatus('processing')
        const result = await window.openWhisperflow.processAudio({
          mode,
          selectedText: selectedTextRef.current,
          audio: {
            bytes: audio.bytes,
            mimeType: audio.mimeType,
            durationMs
          }
        })
        setPreview(result)
        await reload()
      }

      recordingStartedAtRef.current = Date.now()
      setStatus('listening')
      await window.openWhisperflow.setRecordingState(true)
      recorder.start(250)
    } catch (error) {
      cleanupAudio()
      await window.openWhisperflow.setRecordingState(false)
      setStatus('error')
      setDetail(error instanceof Error ? error.message : String(error))
    }
  }, [cleanupAudio, reload, settings?.selectedAudioDeviceId, status, stopRecording])

  const handleToggle = useCallback((mode: SessionMode = 'dictation') => {
    if (status === 'listening') {
      void stopRecording()
      return
    }
    void startRecording(mode)
  }, [startRecording, status, stopRecording])

  useEffect(() => window.openWhisperflow.onToggleRecording(handleToggle), [handleToggle])
  useEffect(() => window.openWhisperflow.onCancelRecording(() => void cancelRecording()), [cancelRecording])
  useEffect(() => window.openWhisperflow.onNavigate(setView), [])

  const statusCopy = useMemo(() => {
    if (status === 'listening') return currentMode === 'instruction' ? 'Instruction' : 'Listening'
    if (status === 'processing') return 'Processing'
    if (status === 'inserted') return 'Inserted'
    if (status === 'preview') return settings?.outputMode === 'clipboard' ? 'Copied' : 'Preview'
    if (status === 'cancelled') return 'Cancelled'
    if (status === 'too-short') return "Didn't catch that"
    if (status === 'error') return 'Needs attention'
    return 'Idle'
  }, [currentMode, settings?.outputMode, status])

  if (!settings) {
    return <main className="loading-screen"><Loader2 className="spin" aria-hidden="true" /></main>
  }

  if (!settings.onboardingComplete) {
    return <Onboarding settings={settings} onDone={async () => setSettings(await window.openWhisperflow.completeOnboarding())} />
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="OpenWhisperflow navigation">
        <div className="brand">
          <div className="brand-mark">
            <Mic size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>OpenWhisperflow</strong>
            <span>Private dictation</span>
          </div>
        </div>
        <nav className="nav-list">
          <NavButton active={view === 'dictation'} icon={<Mic />} label="Dictation" onClick={() => setView('dictation')} />
          <NavButton active={view === 'history'} icon={<History />} label="History" onClick={() => setView('history')} />
          <NavButton active={view === 'settings'} icon={<Settings />} label="Settings" onClick={() => setView('settings')} />
          <NavButton active={view === 'data'} icon={<Database />} label="Local Data" onClick={() => setView('data')} />
        </nav>
        <div className="privacy-strip">
          <Shield size={16} aria-hidden="true" />
          <span>Fast dictation uses ASR plus local cleanup. The configured LLM runs for instructions and transforms.</span>
        </div>
      </aside>

      <section className="workspace">
        {view === 'dictation' && (
          <DictationView
            status={status}
            mode={currentMode}
            statusCopy={statusCopy}
            detail={detail}
            settings={settings}
            preview={preview}
            selectedText={selectedTextRef.current}
            onDictate={() => handleToggle('dictation')}
            onInstruct={() => handleToggle('instruction')}
            onCancel={cancelRecording}
            onPastePreview={async () => {
              if (!preview?.polish?.text) return
              try {
                const pasted = await window.openWhisperflow.pasteText(preview.polish.text)
                setStatus(pasted ? 'inserted' : 'preview')
                setDetail(pasted ? undefined : 'Copied to clipboard.')
              } catch (error) {
                setStatus('preview')
                setDetail(error instanceof Error ? error.message : String(error))
              }
            }}
          />
        )}
        {view === 'history' && <HistoryView history={history} onReload={reload} />}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            usage={usage}
            argmaxStatus={argmaxStatus}
            audioDevices={audioDevices}
            onSettings={setSettings}
            onArgmaxStatus={setArgmaxStatus}
            onReload={reload}
          />
        )}
        {view === 'data' && localData && (
          <LocalDataView
            summary={localData}
            diagnostics={diagnostics}
            onExport={async () => {
              const exported = await window.openWhisperflow.exportLocalData()
              await navigator.clipboard.writeText(JSON.stringify(exported, null, 2))
            }}
            onDeleteAll={async () => {
              await window.openWhisperflow.deleteAllData()
              await reload()
            }}
          />
        )}
      </section>
    </main>
  )
}

function Onboarding({ settings, onDone }: { settings: AppSettings; onDone: () => Promise<void> }): React.JSX.Element {
  const [mic, setMic] = useState('unknown')
  const [screen, setScreen] = useState('unknown')
  const [accessibility, setAccessibility] = useState(false)
  const [draft, setDraft] = useState(settings)
  const [togetherKey, setTogetherKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')

  async function refresh(): Promise<void> {
    setMic(await window.openWhisperflow.getMicPermissionStatus())
    setScreen(await window.openWhisperflow.getScreenPermissionStatus())
    setAccessibility(await window.openWhisperflow.getAccessibilityStatus())
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <main className="onboarding">
      <div className="brand-mark"><Mic size={18} aria-hidden="true" /></div>
      <h1>OpenWhisperflow</h1>
      <p>Dictate anywhere, instruct an LLM when you need a rewrite, and keep local history under your control.</p>
      <div className="onboarding-grid">
        <button className="secondary-action" onClick={async () => { await window.openWhisperflow.requestMicPermission(); await refresh() }}>
          <Check size={16} aria-hidden="true" /> Microphone: {mic}
        </button>
        <button className="secondary-action" onClick={async () => { await window.openWhisperflow.requestAccessibility(); await refresh() }}>
          <Check size={16} aria-hidden="true" /> Accessibility: {accessibility ? 'granted' : 'not granted'}
        </button>
        <button className="secondary-action" onClick={async () => { await window.openWhisperflow.openSystemSettings('screen'); await refresh() }}>
          <Check size={16} aria-hidden="true" /> Screen Recording: {screen}
        </button>
        <button className="secondary-action" onClick={() => window.openWhisperflow.openSystemSettings('keyboard')}>
          <KeyRound size={16} aria-hidden="true" /> Keyboard Settings
        </button>
      </div>
      <div className="settings-grid onboarding-keys">
        <label>
          <span>Speech to text</span>
          <select className="input" value={draft.asrProvider} onChange={(event) => setDraft({ ...draft, asrProvider: event.target.value as AppSettings['asrProvider'] })}>
            <option value="together">Together Parakeet</option>
            <option value="argmax-local">Argmax local WhisperKit</option>
          </select>
        </label>
        <label>
          <span>Argmax repo path</span>
          <div className="input-row">
            <input className="input" value={draft.argmaxServerCwd || ''} onChange={(event) => setDraft({ ...draft, argmaxServerCwd: event.target.value })} />
            <button
              className="secondary-action"
              type="button"
              onClick={async () => {
                const selected = await window.openWhisperflow.chooseArgmaxRepoPath()
                if (selected) setDraft({ ...draft, argmaxServerCwd: selected })
              }}
            >
              Choose...
            </button>
          </div>
        </label>
        <label>
          <span>Argmax endpoint</span>
          <input className="input" value={draft.argmaxEndpoint} onChange={(event) => setDraft({ ...draft, argmaxEndpoint: event.target.value })} />
        </label>
        <label>
          <span>Argmax model</span>
          <input className="input" value={draft.argmaxModel} onChange={(event) => setDraft({ ...draft, argmaxModel: event.target.value })} />
        </label>
        <label>
          <span>Together API key {settings.hasTogetherApiKey ? '(set)' : ''}</span>
          <input className="input" type="password" value={togetherKey} onChange={(event) => setTogetherKey(event.target.value)} />
        </label>
        <label>
          <span>Anthropic API key {settings.hasAnthropicApiKey ? '(set)' : ''}</span>
          <input className="input" type="password" value={anthropicKey} onChange={(event) => setAnthropicKey(event.target.value)} />
        </label>
        <label>
          <span>Anthropic base URL</span>
          <input
            className="input"
            placeholder="http://127.0.0.1:4000"
            value={draft.anthropicBaseUrl}
            onChange={(event) => setDraft({ ...draft, anthropicBaseUrl: event.target.value })}
          />
        </label>
      </div>
      <button
        className="primary-action compact"
        onClick={async () => {
          await window.openWhisperflow.updateSettings(draft)
          const secrets = buildSecretUpdate(togetherKey, anthropicKey)
          if (hasSecretUpdate(secrets)) await window.openWhisperflow.setSecrets(secrets)
          await onDone()
        }}
      >
        Start
      </button>
    </main>
  )
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ReactElement
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      {React.cloneElement(icon, { size: 18, 'aria-hidden': true } as React.SVGProps<SVGSVGElement>)}
      <span>{label}</span>
    </button>
  )
}

function DictationView({
  status,
  mode,
  statusCopy,
  detail,
  settings,
  preview,
  selectedText,
  onDictate,
  onInstruct,
  onCancel,
  onPastePreview
}: {
  status: DictationStatus
  mode: SessionMode
  statusCopy: string
  detail?: string
  settings: AppSettings
  preview?: DictationProcessResult
  selectedText?: string
  onDictate: () => void
  onInstruct: () => void
  onCancel: () => Promise<void>
  onPastePreview: () => Promise<void>
}): React.JSX.Element {
  const disabled = status === 'processing'
  return (
    <div className="dictation-layout">
      <section className="status-stage" aria-live="polite">
        <div className={`pulse ${status} ${mode}`}>
          {status === 'processing' ? <Loader2 size={44} className="spin" aria-hidden="true" /> : mode === 'instruction' ? <Wand2 size={44} aria-hidden="true" /> : <Mic size={44} aria-hidden="true" />}
        </div>
        <div className="status-copy">
          <p className="eyebrow">{mode === 'instruction' ? settings.instructionHotkey : settings.hotkey}</p>
          <h1>{statusCopy}</h1>
          <p>{detail || 'Dictate raw text fast, or use Instruction to transform selected text with the configured LLM.'}</p>
        </div>
        <div className="button-row centered">
          <button className="primary-action" onClick={onDictate} disabled={disabled}>
            {status === 'listening' ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            <span>{status === 'listening' ? 'Stop' : 'Dictate'}</span>
          </button>
          <button className="secondary-action" onClick={onInstruct} disabled={disabled}>
            <Sparkles size={18} aria-hidden="true" />
            Instruct
          </button>
          <button className="danger-action" onClick={() => void onCancel()} disabled={status !== 'listening' && status !== 'processing'}>
            Cancel
          </button>
        </div>
      </section>

      <section className="preview-panel">
        <div className="section-heading">
          <h2>Latest Text</h2>
          {preview?.inserted && <span className="success-pill"><Check size={14} aria-hidden="true" />Inserted</span>}
        </div>
        {selectedText && <p className="selected-context">Selected text captured: {selectedText.slice(0, 140)}</p>}
        <textarea
          readOnly
          value={preview?.polish?.text || preview?.transcription?.text || ''}
          placeholder="Dictation or instruction output appears here."
          aria-label="Latest dictation output"
        />
        <div className="button-row">
          <button className="secondary-action" onClick={onPastePreview} disabled={!preview?.polish?.text}>
            <Clipboard size={16} aria-hidden="true" />
            Paste
          </button>
        </div>
      </section>
    </div>
  )
}

function HistoryView({ history, onReload }: { history: HistoryItem[]; onReload: () => Promise<void> }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [visibleHistory, setVisibleHistory] = useState(history)
  useEffect(() => setVisibleHistory(history), [history])

  async function search(value: string): Promise<void> {
    setQuery(value)
    setVisibleHistory(await window.openWhisperflow.listHistory(value))
  }

  return (
    <section className="stack-view">
      <div className="section-heading">
        <h1>History</h1>
        <button className="icon-button" aria-label="Reload history" onClick={() => void onReload()}>
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>
      <input className="input" value={query} onChange={(event) => void search(event.target.value)} placeholder="Search" aria-label="Search history" />
      <div className="history-list">
        {visibleHistory.map((item) => (
          <article className="history-item" key={item.id}>
            <div>
              <time>{new Date(item.createdAt).toLocaleString()}</time>
              <strong>
                {item.flowType === 'instruction' ? 'Instruction' : 'Dictation'} · {item.appName || 'Unknown app'}
                {item.contextIncluded ? ' · Context' : ''}
                {item.screenshotIncluded ? ' · Screen' : ''}
              </strong>
            </div>
            <p>{item.formattedText || item.error}</p>
            {item.selectedText && <p className="history-context">Selection: {item.selectedText.slice(0, 180)}</p>}
            <div className="button-row">
              <button className="secondary-action" onClick={() => void window.openWhisperflow.repasteHistory(item.id)}>
                <Clipboard size={15} aria-hidden="true" />
                Paste
              </button>
              <button
                className="secondary-action"
                onClick={async () => {
                  await window.openWhisperflow.retryHistory(item.id)
                  await onReload()
                }}
                disabled={!item.audioFilePath}
              >
                <RefreshCcw size={15} aria-hidden="true" />
                Retry
              </button>
              <button className="danger-action" onClick={async () => { await window.openWhisperflow.deleteHistory(item.id); await onReload() }}>
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function SettingsView({
  settings,
  usage,
  argmaxStatus,
  audioDevices,
  onSettings,
  onArgmaxStatus,
  onReload
}: {
  settings: AppSettings
  usage?: UsageSummary
  argmaxStatus?: ArgmaxServerStatus
  audioDevices: MediaDeviceInfo[]
  onSettings: (settings: AppSettings) => void
  onArgmaxStatus: (status: ArgmaxServerStatus) => void
  onReload: () => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState(settings)
  const [togetherKey, setTogetherKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState<HotkeyField | null>(null)
  const [testResults, setTestResults] = useState<Partial<Record<ProviderTestResult['provider'], ProviderTestResult>>>({})
  const [testingProvider, setTestingProvider] = useState<ProviderTestResult['provider'] | null>(null)
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean | undefined>()
  const [screenPermission, setScreenPermission] = useState<string>('unknown')
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyRegistrationStatus>()
  const [selectionTestResult, setSelectionTestResult] = useState<SelectedTextCaptureResult>()
  const [selectionTestRunning, setSelectionTestRunning] = useState(false)
  const [screenTestResult, setScreenTestResult] = useState<ScreenshotCaptureResult>()
  const [screenTestRunning, setScreenTestRunning] = useState(false)
  useEffect(() => setDraft(settings), [settings])

  const refreshPermissions = useCallback(async () => {
    setAccessibilityGranted(await window.openWhisperflow.getAccessibilityStatus())
    setScreenPermission(await window.openWhisperflow.getScreenPermissionStatus())
  }, [])

  const refreshHotkeys = useCallback(async () => {
    setHotkeyStatus(await window.openWhisperflow.getHotkeyStatus())
  }, [])

  useEffect(() => {
    void refreshPermissions()
    void refreshHotkeys()
  }, [refreshPermissions, refreshHotkeys])

  useEffect(() => {
    if (!capturingHotkey) return undefined
    const field = capturingHotkey

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setCapturingHotkey(null)
        return
      }

      const accelerator = acceleratorFromKeyboardEvent(event)
      if (!accelerator) return
      setDraft((current) => ({ ...current, [field]: accelerator }))
      setCapturingHotkey(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [capturingHotkey])

  async function save(): Promise<void> {
    const next = await window.openWhisperflow.updateSettings(draft)
    const secrets = buildSecretUpdate(togetherKey, anthropicKey)
    if (hasSecretUpdate(secrets)) {
      onSettings(await window.openWhisperflow.setSecrets(secrets))
      setTogetherKey('')
      setAnthropicKey('')
    } else {
      onSettings(next)
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
    await onReload()
    await refreshHotkeys()
  }

  async function startArgmax(): Promise<void> {
    const next = await window.openWhisperflow.updateSettings(draft)
    onSettings(next)
    onArgmaxStatus(await window.openWhisperflow.startArgmaxServer())
    await onReload()
  }

  async function stopArgmax(): Promise<void> {
    onArgmaxStatus(await window.openWhisperflow.stopArgmaxServer())
    await onReload()
  }

  async function useClipboardOnly(): Promise<void> {
    const nextDraft = { ...draft, outputMode: 'clipboard' as const }
    setDraft(nextDraft)
      onSettings(await window.openWhisperflow.updateSettings(nextDraft))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
      await onReload()
      await refreshHotkeys()
  }

  async function runSelectionCaptureTest(): Promise<void> {
    setSelectionTestRunning(true)
    setSelectionTestResult({
      ok: false,
      method: 'none',
      reason: 'empty',
      message: 'Select text in another app now. OpenWhisperflow will test capture in 3 seconds.',
      durationMs: 0
    })

    window.setTimeout(async () => {
      try {
        setSelectionTestResult(await window.openWhisperflow.testSelectedTextCapture())
      } finally {
        setSelectionTestRunning(false)
      }
    }, 3000)
  }

  async function runScreenCaptureTest(): Promise<void> {
    setScreenTestRunning(true)
    try {
      setScreenTestResult(await window.openWhisperflow.testScreenCapture())
    } finally {
      setScreenTestRunning(false)
      setScreenPermission(await window.openWhisperflow.getScreenPermissionStatus())
    }
  }

  async function setScreenshotContextEnabled(enabled: boolean): Promise<void> {
    setDraft((current) => ({ ...current, llmScreenshotContextEnabled: enabled }))
    if (!enabled) return

    const permissionStatus = await window.openWhisperflow.getScreenPermissionStatus()
    setScreenPermission(permissionStatus)
    if (permissionStatus === 'granted') return

    setScreenTestResult({
      ok: false,
      message: 'Grant Screen Recording permission, then click Check Again or Test Screen Capture.',
      permissionStatus,
      durationMs: 0
    })
    await window.openWhisperflow.openSystemSettings('screen')
  }

  async function runProviderTest(provider: ProviderTestResult['provider']): Promise<void> {
    setTestingProvider(provider)
    try {
      let nextSettings = await window.openWhisperflow.updateSettings(draft)
      const secrets = buildSecretUpdate(togetherKey, anthropicKey)
      if (hasSecretUpdate(secrets)) {
        nextSettings = await window.openWhisperflow.setSecrets(secrets)
        setTogetherKey('')
        setAnthropicKey('')
      }
      onSettings(nextSettings)

      const result =
        provider === 'anthropic'
          ? await window.openWhisperflow.testAnthropic()
          : provider === 'together'
            ? await window.openWhisperflow.testTogether()
            : await window.openWhisperflow.testArgmaxEndpoint()
      setTestResults((current) => ({ ...current, [provider]: result }))
    } finally {
      setTestingProvider(null)
    }
  }

  return (
    <section className="stack-view">
      <div className="section-heading">
        <h1>Settings</h1>
        {saved && <span className="success-pill">Saved</span>}
      </div>
      <div className="usage-strip">
        <UsageStat label="Today" usage={usage?.today} />
        <UsageStat label="Month" usage={usage?.month} />
        <UsageStat label="All time" usage={usage?.allTime} />
      </div>
      <div className="settings-grid">
        <HotkeyCapture label="Dictation hotkey" value={draft.hotkey} active={capturingHotkey === 'hotkey'} onStart={() => setCapturingHotkey('hotkey')} />
        <HotkeyCapture label="Instruction hotkey" value={draft.instructionHotkey} active={capturingHotkey === 'instructionHotkey'} onStart={() => setCapturingHotkey('instructionHotkey')} />
        <label><span>Activation mode</span><select className="input" value={draft.activationMode} onChange={(event) => setDraft({ ...draft, activationMode: event.target.value as AppSettings['activationMode'] })}><option value="tap-toggle">Tap toggle</option><option value="push-to-talk" disabled>Push to talk - native helper later</option><option value="double-tap-push" disabled>Double tap - native helper later</option></select></label>
        <label><span>Output mode</span><select className="input" value={draft.outputMode} onChange={(event) => setDraft({ ...draft, outputMode: event.target.value as AppSettings['outputMode'] })}><option value="paste">Paste at cursor</option><option value="clipboard">Clipboard only</option></select></label>
        <label><span>Dictation mode</span><select className="input" value={draft.dictationMode} onChange={(event) => setDraft({ ...draft, dictationMode: event.target.value as AppSettings['dictationMode'] })}><option value="natural">Natural - local</option><option value="raw">Raw - local</option><option value="formal">Formal - uses LLM</option><option value="bullets">Bullets - uses LLM</option><option value="reply">Reply - uses LLM</option></select></label>
        <label><span>Speech to text</span><select className="input" value={draft.asrProvider} onChange={(event) => setDraft({ ...draft, asrProvider: event.target.value as AppSettings['asrProvider'] })}><option value="together">Together Parakeet</option><option value="argmax-local">Argmax local WhisperKit</option></select></label>
        <label><span>Microphone</span><select className="input" value={draft.selectedAudioDeviceId || ''} onChange={(event) => setDraft({ ...draft, selectedAudioDeviceId: event.target.value || undefined })}><option value="">System default</option>{audioDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 8)}`}</option>)}</select></label>
        <label><span>Language</span><input className="input" value={draft.asrLanguage} onChange={(event) => setDraft({ ...draft, asrLanguage: event.target.value })} /></label>
        <label><span>Together model</span><input className="input" value={draft.togetherModel} onChange={(event) => setDraft({ ...draft, togetherModel: event.target.value })} /></label>
        <label><span>Argmax endpoint</span><input className="input" value={draft.argmaxEndpoint} onChange={(event) => setDraft({ ...draft, argmaxEndpoint: event.target.value })} /></label>
        <label><span>Argmax model</span><input className="input" value={draft.argmaxModel} onChange={(event) => setDraft({ ...draft, argmaxModel: event.target.value })} /></label>
        <label>
          <span>Argmax repo path</span>
          <div className="input-row">
            <input className="input" placeholder="/Users/you/src/argmax-oss-swift" value={draft.argmaxServerCwd || ''} onChange={(event) => setDraft({ ...draft, argmaxServerCwd: event.target.value })} />
            <button
              className="secondary-action"
              type="button"
              onClick={async () => {
                const selected = await window.openWhisperflow.chooseArgmaxRepoPath()
                if (selected) setDraft({ ...draft, argmaxServerCwd: selected })
              }}
            >
              Choose...
            </button>
          </div>
        </label>
        <label><span>Anthropic model</span><input className="input" value={draft.anthropicModel} onChange={(event) => setDraft({ ...draft, anthropicModel: event.target.value, llmModel: event.target.value })} /></label>
        <label><span>Together API key {settings.hasTogetherApiKey ? '(set)' : ''}</span><input className="input" type="password" value={togetherKey} onChange={(event) => setTogetherKey(event.target.value)} /></label>
        <label><span>Anthropic API key {settings.hasAnthropicApiKey ? '(set)' : ''}</span><input className="input" type="password" value={anthropicKey} onChange={(event) => setAnthropicKey(event.target.value)} /></label>
        <label><span>Anthropic base URL</span><input className="input" placeholder="http://127.0.0.1:4000" value={draft.anthropicBaseUrl} onChange={(event) => setDraft({ ...draft, anthropicBaseUrl: event.target.value })} /></label>
      </div>
      <div className="toggle-row">
        <label><input type="checkbox" checked={draft.contextEnabled} onChange={(event) => setDraft({ ...draft, contextEnabled: event.target.checked })} /> App context</label>
        <label><input type="checkbox" checked={draft.llmContextEnabled} onChange={(event) => setDraft({ ...draft, llmContextEnabled: event.target.checked })} /> Context for LLM modes</label>
        <label><input type="checkbox" checked={draft.llmScreenshotContextEnabled} onChange={(event) => void setScreenshotContextEnabled(event.target.checked)} /> Screen context for LLM modes</label>
        <label><input type="checkbox" checked={draft.redactionEnabled} onChange={(event) => setDraft({ ...draft, redactionEnabled: event.target.checked })} /> Redaction hooks</label>
        <label><input type="checkbox" checked={draft.launchAtLogin} onChange={(event) => setDraft({ ...draft, launchAtLogin: event.target.checked })} /> Launch at login</label>
      </div>
      <div className="button-row">
        <button className="primary-action compact" onClick={() => void save()}><KeyRound size={18} aria-hidden="true" />Save</button>
        <button className="secondary-action" onClick={async () => { await window.openWhisperflow.resetUsage(); await onReload() }}>Reset usage</button>
      </div>
      <section className="server-panel">
        <div>
          <strong>Global hotkeys</strong>
          <span>{hotkeyStatus?.dictation.registered && hotkeyStatus?.instruction.registered ? 'Registered' : 'Check shortcuts'}</span>
        </div>
        <div className="test-result-list">
          <HotkeyStatusItem label="Dictation" item={hotkeyStatus?.dictation} />
          <HotkeyStatusItem label="Instruction" item={hotkeyStatus?.instruction} />
        </div>
        <p>Dictation toggles recording. Instruction captures selected text first, then records your spoken command.</p>
        <div className="button-row no-margin">
          <button className="secondary-action" onClick={() => void refreshHotkeys()}>
            Check Again
          </button>
          <button className="secondary-action" onClick={() => window.openWhisperflow.openSystemSettings('keyboard')}>
            Keyboard Settings
          </button>
        </div>
      </section>
      <section className="server-panel">
        <div>
          <strong>macOS permissions</strong>
          <span>Accessibility {accessibilityGranted ? 'granted' : 'not granted'} · Screen {screenPermission}</span>
        </div>
        <p>Auto-paste and selected-text capture need Accessibility permission. Screen context needs Screen Recording and is only sent for LLM-backed modes when enabled.</p>
        <div className="button-row no-margin">
          <button
            className="secondary-action"
            onClick={async () => {
              await window.openWhisperflow.requestAccessibility()
              await refreshPermissions()
            }}
          >
            Open Accessibility
          </button>
          <button className="secondary-action" onClick={() => window.openWhisperflow.openSystemSettings('screen')}>
            Open Screen Recording
          </button>
          <button className="secondary-action" onClick={() => void refreshPermissions()}>
            Check Again
          </button>
          <button className="secondary-action" onClick={() => void useClipboardOnly()} disabled={draft.outputMode === 'clipboard'}>
            Use Clipboard Only
          </button>
          <button className="secondary-action" onClick={() => void runSelectionCaptureTest()} disabled={selectionTestRunning}>
            {selectionTestRunning && <Loader2 size={15} className="spin" aria-hidden="true" />}
            Test Text Capture
          </button>
          <button className="secondary-action" onClick={() => void runScreenCaptureTest()} disabled={screenTestRunning}>
            {screenTestRunning && <Loader2 size={15} className="spin" aria-hidden="true" />}
            Test Screen Capture
          </button>
        </div>
        {selectionTestResult && (
          <article className={`test-result ${selectionTestResult.ok ? 'ok' : 'bad'}`}>
            <strong>Selected text capture</strong>
            <span>{selectionTestResult.message}</span>
            <small>{selectionTestResult.method} · {selectionTestResult.durationMs} ms</small>
            {selectionTestResult.text && <code>{selectionTestResult.text.slice(0, 240)}</code>}
          </article>
        )}
        {screenTestResult && (
          <article className={`test-result ${screenTestResult.ok ? 'ok' : 'bad'}`}>
            <strong>Screen capture</strong>
            <span>{screenTestResult.message}</span>
            <small>{screenTestResult.permissionStatus} · {screenTestResult.durationMs} ms</small>
            {screenTestResult.width && screenTestResult.height && (
              <code>{screenTestResult.sourceName || 'Screen'} · {screenTestResult.width}x{screenTestResult.height}</code>
            )}
          </article>
        )}
      </section>
      <section className="server-panel">
        <div>
          <strong>Provider tests</strong>
          <span>Stored keys and local endpoint</span>
        </div>
        <div className="button-row no-margin">
          <button className="secondary-action" onClick={() => void runProviderTest('anthropic')} disabled={testingProvider === 'anthropic'}>
            {testingProvider === 'anthropic' && <Loader2 size={15} className="spin" aria-hidden="true" />}
            Test Anthropic
          </button>
          <button className="secondary-action" onClick={() => void runProviderTest('together')} disabled={testingProvider === 'together'}>
            {testingProvider === 'together' && <Loader2 size={15} className="spin" aria-hidden="true" />}
            Test Together
          </button>
          <button className="secondary-action" onClick={() => void runProviderTest('argmax-local')} disabled={testingProvider === 'argmax-local'}>
            {testingProvider === 'argmax-local' && <Loader2 size={15} className="spin" aria-hidden="true" />}
            Test Argmax
          </button>
        </div>
        <div className="test-result-list">
          {(['anthropic', 'together', 'argmax-local'] as const).map((provider) => (
            <ProviderTestItem key={provider} result={testResults[provider]} provider={provider} />
          ))}
        </div>
      </section>
      <section className="server-panel">
        <div>
          <strong>Argmax local server</strong>
          <span>{argmaxStatus?.running ? `Running${argmaxStatus.pid ? ` · pid ${argmaxStatus.pid}` : ''}` : 'Stopped'}</span>
        </div>
        {argmaxStatus?.lastMessage && <p>{argmaxStatus.lastMessage}</p>}
        <div className="button-row no-margin">
          <button className="secondary-action" onClick={() => void startArgmax()} disabled={argmaxStatus?.running}>
            Run Server
          </button>
          <button className="danger-action" onClick={() => void stopArgmax()} disabled={!argmaxStatus?.running}>
            Stop
          </button>
        </div>
        <pre className="server-log">{(argmaxStatus?.logs ?? []).slice(-12).join('\n') || 'Prepare Argmax in Terminal, choose the repo folder here, then run the server.'}</pre>
      </section>
    </section>
  )
}

function UsageStat({ label, usage }: { label: string; usage?: UsageSummary['today'] }): React.JSX.Element {
  return (
    <div className="usage-stat">
      <strong>{label}</strong>
      <span>{Math.round(usage?.asrSeconds ?? 0)}s ASR</span>
      <span>{usage?.inputTokens ?? 0}/{usage?.outputTokens ?? 0} tokens</span>
      <span>${(usage?.estimatedCostUsd ?? 0).toFixed(4)}</span>
    </div>
  )
}

function HotkeyCapture({
  label,
  value,
  active,
  onStart
}: {
  label: string
  value: string
  active: boolean
  onStart: () => void
}): React.JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <button type="button" className={`hotkey-capture ${active ? 'active' : ''}`} onClick={onStart}>
        <KeyRound size={16} aria-hidden="true" />
        <span>{active ? 'Press shortcut...' : value}</span>
      </button>
    </label>
  )
}

function HotkeyStatusItem({
  label,
  item
}: {
  label: string
  item?: HotkeyRegistrationStatus['dictation']
}): React.JSX.Element {
  return (
    <article className={`test-result ${item ? (item.registered ? 'ok' : 'bad') : ''}`}>
      <strong>{label}</strong>
      <span>{item?.registered ? 'Registered' : 'Not registered'}</span>
      <code>{item?.accelerator ?? 'Unknown'}</code>
    </article>
  )
}

function ProviderTestItem({
  provider,
  result
}: {
  provider: ProviderTestResult['provider']
  result?: ProviderTestResult
}): React.JSX.Element {
  const label = provider === 'argmax-local' ? 'Argmax' : provider === 'anthropic' ? 'Anthropic' : 'Together'
  return (
    <article className={`test-result ${result ? (result.ok ? 'ok' : 'bad') : ''}`}>
      <strong>{label}</strong>
      <span>{result ? result.message : 'Not tested'}</span>
      {result?.latencyMs !== undefined && <small>{result.latencyMs} ms</small>}
      {result?.detail && <code>{result.detail}</code>}
    </article>
  )
}

function LocalDataView({
  summary,
  diagnostics,
  onExport,
  onDeleteAll
}: {
  summary: LocalDataSummary
  diagnostics: DiagnosticError[]
  onExport: () => Promise<void>
  onDeleteAll: () => Promise<void>
}): React.JSX.Element {
  return (
    <section className="stack-view">
      <div className="section-heading"><h1>Local Data</h1></div>
      <code className="db-path">{summary.databasePath}</code>
      <div className="schema-list">
        {summary.tables.map((table) => <article className="schema-item" key={table.name}><strong>{table.name}</strong><span>{table.fields.join(', ')}</span></article>)}
      </div>
      <div className="button-row">
        <button className="secondary-action" onClick={() => void onExport()}><Clipboard size={16} aria-hidden="true" />Export</button>
        <button className="danger-action" onClick={() => void onDeleteAll()}><Trash2 size={16} aria-hidden="true" />Delete All</button>
      </div>
      <div className="section-heading"><h2>Diagnostics</h2></div>
      <div className="history-list">
        {diagnostics.map((item) => <article className="schema-item" key={`${item.createdAt}-${item.source}`}><strong><AlertTriangle size={14} aria-hidden="true" /> {item.source}</strong><span>{item.message}</span><span>{item.rawMessage}</span></article>)}
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
