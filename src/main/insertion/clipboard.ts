import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SelectedTextCaptureResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

const AUTOMATION_PERMISSION_MESSAGE =
  'macOS blocked automated paste. The text is on your clipboard. Enable Accessibility permission for OpenWhisperflow/Electron/System Events, or switch Output mode to Clipboard only.'
const SELECTION_PERMISSION_MESSAGE =
  'macOS blocked selected-text capture. Enable Accessibility permission for OpenWhisperflow/Electron/System Events, then try the instruction hotkey again.'

export class ClipboardInsertionService {
  async captureSelectedText(): Promise<string | undefined> {
    const result = await this.captureSelectedTextResult()
    if (result.reason === 'permission-blocked') throw new Error(result.message)
    return result.text
  }

  async captureSelectedTextResult(): Promise<SelectedTextCaptureResult> {
    const start = Date.now()

    try {
      const accessibilityText = await this.captureSelectedTextViaAccessibility()
      if (accessibilityText?.trim()) {
        return {
          ok: true,
          text: accessibilityText.trim(),
          method: 'accessibility',
          message: `Captured selected text with Accessibility (${accessibilityText.trim().length} characters).`,
          durationMs: Date.now() - start
        }
      }
    } catch (error) {
      if (isAutomationPermissionError(error) || isAccessibilityPermissionError(error)) {
        return {
          ok: false,
          method: 'none',
          reason: 'permission-blocked',
          message: SELECTION_PERMISSION_MESSAGE,
          durationMs: Date.now() - start
        }
      }
    }

    try {
      const clipboardText = await this.captureSelectedTextViaClipboard()
      if (clipboardText?.trim()) {
        return {
          ok: true,
          text: clipboardText.trim(),
          method: 'clipboard',
          message: `Captured selected text with clipboard fallback (${clipboardText.trim().length} characters).`,
          durationMs: Date.now() - start
        }
      }

      return {
        ok: false,
        method: 'none',
        reason: 'empty',
        message: 'No selected text was captured. Select editable text in the frontmost app and try again.',
        durationMs: Date.now() - start
      }
    } catch (error) {
      if (isAutomationPermissionError(error)) {
        return {
          ok: false,
          method: 'none',
          reason: 'permission-blocked',
          message: SELECTION_PERMISSION_MESSAGE,
          durationMs: Date.now() - start
        }
      }

      return {
        ok: false,
        method: 'none',
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start
      }
    }
  }

  private async captureSelectedTextViaAccessibility(): Promise<string | undefined> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set focusedElement to value of attribute "AXFocusedUIElement" of frontApp
        try
          set selectedText to value of attribute "AXSelectedText" of focusedElement
          if selectedText is missing value then return ""
          return selectedText as text
        on error
          return ""
        end try
      end tell
    `
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    const text = stdout.trim()
    return text && text !== 'missing value' ? text : undefined
  }

  private async captureSelectedTextViaClipboard(): Promise<string | undefined> {
    const previousText = clipboard.readText()
    const marker = `__VOICEDESK_SELECTION_CAPTURE_${Date.now()}__`

    try {
      clipboard.writeText(marker)
      await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down'])
      const selectedText = await waitForClipboardChange(marker, 900)
      return selectedText?.trim() ? selectedText : undefined
    } catch (error) {
      if (isAutomationPermissionError(error)) {
        throw new Error(SELECTION_PERMISSION_MESSAGE)
      }

      return undefined
    } finally {
      clipboard.writeText(previousText)
    }
  }

  async insertText(text: string, outputMode: 'paste' | 'clipboard' = 'paste'): Promise<boolean> {
    const previousText = clipboard.readText()

    if (outputMode === 'clipboard') {
      clipboard.writeText(text)
      return false
    }

    try {
      clipboard.writeText(text)
      await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
      await new Promise((resolve) => setTimeout(resolve, 350))
      clipboard.writeText(previousText)
      return true
    } catch (error) {
      if (isAutomationPermissionError(error)) {
        throw new Error(AUTOMATION_PERMISSION_MESSAGE)
      }

      clipboard.writeText(previousText)
      throw error
    }
  }
}

async function waitForClipboardChange(previousValue: string, timeoutMs: number): Promise<string | undefined> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 60))
    const next = clipboard.readText()
    if (next && next !== previousValue) return next
  }

  return undefined
}

function isAutomationPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('not allowed to send keystrokes') ||
    message.includes('not authorized to send Apple events') ||
    message.includes('osascript is not allowed') ||
    message.includes('(1002)')
  )
}

function isAccessibilityPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('not allowed assistive access') ||
    message.includes('not authorized for assistive access') ||
    message.includes('is not allowed to control') ||
    message.includes('System Events got an error')
  )
}
