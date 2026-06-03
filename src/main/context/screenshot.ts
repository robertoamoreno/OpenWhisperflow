import { desktopCapturer, screen, systemPreferences } from 'electron'
import type { ScreenshotCaptureResult, ScreenshotContext } from '../../shared/types'

const MAX_SCREENSHOT_WIDTH = 1280

export function getScreenPermissionStatus(): string {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen')
}

export async function captureScreenContext(): Promise<ScreenshotContext | undefined> {
  const result = await testScreenCaptureContext()
  return result.context
}

export async function testScreenCapture(): Promise<ScreenshotCaptureResult> {
  const startedAt = Date.now()
  let result: Awaited<ReturnType<typeof testScreenCaptureContext>>
  try {
    result = await testScreenCaptureContext()
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      permissionStatus: getScreenPermissionStatus(),
      durationMs: Date.now() - startedAt
    }
  }

  if (!result.context) {
    return {
      ok: false,
      message: result.message,
      permissionStatus: result.permissionStatus,
      durationMs: Date.now() - startedAt
    }
  }

  return {
    ok: true,
    message: 'Screen capture is available.',
    permissionStatus: result.permissionStatus,
    width: result.context.width,
    height: result.context.height,
    sourceName: result.context.sourceName,
    durationMs: Date.now() - startedAt
  }
}

async function testScreenCaptureContext(): Promise<{
  context?: ScreenshotContext
  message: string
  permissionStatus: string
}> {
  const permissionStatus = getScreenPermissionStatus()
  if (process.platform === 'darwin' && permissionStatus !== 'granted') {
    return {
      permissionStatus,
      message: 'Screen Recording permission is not granted.'
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const thumbnailSize = fitSize(primaryDisplay.bounds.width, primaryDisplay.bounds.height)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  })
  const source = sources.find((item) => item.display_id === String(primaryDisplay.id)) ?? sources[0]

  if (!source || source.thumbnail.isEmpty()) {
    return {
      permissionStatus,
      message: 'No screen thumbnail was available.'
    }
  }

  const image = source.thumbnail
  const size = image.getSize()

  return {
    permissionStatus,
    message: 'Screen capture is available.',
    context: {
      dataBase64: image.toPNG().toString('base64'),
      mediaType: 'image/png',
      width: size.width,
      height: size.height,
      sourceName: source.name
    }
  }
}

function fitSize(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return {
      width: MAX_SCREENSHOT_WIDTH,
      height: Math.round(MAX_SCREENSHOT_WIDTH * 0.5625)
    }
  }

  const scale = Math.min(1, MAX_SCREENSHOT_WIDTH / width)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}
