import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DictationContext } from '../../shared/types'

const execFileAsync = promisify(execFile)

export async function getFrontmostContext(redactionEnabled: boolean): Promise<DictationContext> {
  try {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set windowTitle to ""
        try
          set windowTitle to name of front window of frontApp
        end try
      end tell
      return appName & linefeed & windowTitle
    `
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    const [appName, windowTitle] = stdout.split('\n')
    return {
      appName: appName?.trim() || undefined,
      windowTitle: redactText(windowTitle?.trim() || '', redactionEnabled) || undefined,
      redactionEnabled
    }
  } catch {
    return { redactionEnabled }
  }
}

export function redactText(text: string, enabled: boolean): string {
  if (!enabled) return text

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:sk|pk|rk|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g, '[redacted token]')
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[redacted secret]')
}
