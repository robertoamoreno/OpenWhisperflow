import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AudioPayload } from '../../shared/types'
import { resolveAudioFileMetadata } from '../../shared/audio'

const MAX_AUDIO_FILES = 8

export class AudioStorageService {
  private get dir(): string {
    const directory = join(app.getPath('userData'), 'audio')
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    return directory
  }

  save(id: string, audio: AudioPayload): string {
    const metadata = resolveAudioFileMetadata(audio.mimeType)
    const path = join(this.dir, `${id}.${metadata.extension}`)
    writeFileSync(path, Buffer.from(audio.bytes))
    this.prune()
    return path
  }

  load(path: string): Uint8Array | undefined {
    if (!existsSync(path)) return undefined
    return new Uint8Array(readFileSync(path))
  }

  clear(): void {
    if (!existsSync(this.dir)) return
    for (const file of readdirSync(this.dir)) {
      if (file.includes('.')) unlinkSync(join(this.dir, file))
    }
  }

  private prune(): void {
    const files = readdirSync(this.dir)
      .map((file) => {
        const path = join(this.dir, file)
        return { path, mtime: statSync(path).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)

    for (const file of files.slice(MAX_AUDIO_FILES)) {
      unlinkSync(file.path)
    }
  }
}
