import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AppSettings, ArgmaxServerStatus } from '../../shared/types'

const MAX_LOG_LINES = 120

export class ArgmaxServerManager {
  private process?: ChildProcessWithoutNullStreams
  private logs: string[] = []
  private lastMessage?: string
  private lastSettings?: Pick<AppSettings, 'argmaxEndpoint' | 'argmaxModel' | 'argmaxServerCwd'>

  status(settings?: AppSettings): ArgmaxServerStatus {
    const current = settings
      ? {
          argmaxEndpoint: settings.argmaxEndpoint,
          argmaxModel: settings.argmaxModel,
          argmaxServerCwd: settings.argmaxServerCwd
        }
      : this.lastSettings

    return {
      running: Boolean(this.process && !this.process.killed),
      pid: this.process?.pid,
      endpoint: current?.argmaxEndpoint ?? 'http://127.0.0.1:50060/v1/audio/transcriptions',
      model: current?.argmaxModel ?? 'tiny',
      repoPath: current?.argmaxServerCwd,
      lastMessage: this.lastMessage,
      logs: [...this.logs]
    }
  }

  start(settings: AppSettings): ArgmaxServerStatus {
    if (this.process && !this.process.killed) {
      this.lastMessage = 'Argmax server is already running.'
      return this.status(settings)
    }

    const repoPath = this.resolveRepoPath(settings)

    this.lastSettings = {
      argmaxEndpoint: settings.argmaxEndpoint,
      argmaxModel: settings.argmaxModel,
      argmaxServerCwd: repoPath
    }
    this.logs = []

    if (!existsSync(join(repoPath, 'Package.swift'))) {
      this.lastMessage = 'Argmax repo is not ready.'
      this.logs = this.setupInstructions(repoPath, settings.argmaxModel)
      return this.status({ ...settings, argmaxServerCwd: repoPath })
    }

    this.startServer(repoPath, settings)
    return this.status({ ...settings, argmaxServerCwd: repoPath })
  }

  private startServer(repoPath: string, settings: AppSettings): void {
    const endpoint = new URL(settings.argmaxEndpoint)
    const host = endpoint.hostname || '127.0.0.1'
    const port = endpoint.port || '50060'
    const binaryPath = this.resolveArgmaxBinary(repoPath)
    const args = ['serve', '--model', settings.argmaxModel, '--host', host, '--port', port]

    this.lastSettings = {
      argmaxEndpoint: settings.argmaxEndpoint,
      argmaxModel: settings.argmaxModel,
      argmaxServerCwd: repoPath
    }
    this.logs = []
    this.appendLog(binaryPath ? `$ ${binaryPath} ${args.join(' ')}` : `$ BUILD_ALL=1 swift run argmax-cli ${args.join(' ')}`)
    this.process = spawn(binaryPath ?? 'swift', binaryPath ? args : ['run', 'argmax-cli', ...args], {
      cwd: repoPath,
      env: {
        ...process.env,
        BUILD_ALL: '1'
      }
    })

    this.lastMessage = `Starting Argmax local server on ${host}:${port}.`
    this.process.stdout.on('data', (chunk) => this.appendLog(String(chunk)))
    this.process.stderr.on('data', (chunk) => this.appendLog(String(chunk)))
    this.process.on('error', (error) => {
      this.lastMessage = error.message
      this.appendLog(error.message)
      this.process = undefined
    })
    this.process.on('exit', (code, signal) => {
      this.lastMessage = `Argmax server exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`
      this.appendLog(this.lastMessage)
      this.process = undefined
    })
  }

  stop(settings?: AppSettings): ArgmaxServerStatus {
    if (!this.process || this.process.killed) {
      this.lastMessage = 'Argmax server is not running.'
      return this.status(settings)
    }

    this.process.kill('SIGTERM')
    this.lastMessage = 'Stopping Argmax local server.'
    return this.status(settings)
  }

  private resolveRepoPath(settings: AppSettings): string {
    const configured = settings.argmaxServerCwd?.trim()
    if (configured && configured.endsWith('argmax-oss-swift')) return configured
    if (configured && existsSync(join(configured, 'argmax-oss-swift'))) return join(configured, 'argmax-oss-swift')
    if (configured && existsSync(join(configured, 'Package.swift'))) return configured
    return configured || ''
  }

  private resolveArgmaxBinary(repoPath: string): string | undefined {
    const candidates = [
      join(repoPath, '.build/arm64-apple-macosx/release/argmax-cli'),
      join(repoPath, '.build/arm64-apple-macosx/debug/argmax-cli'),
      join(repoPath, '.build/release/argmax-cli'),
      join(repoPath, '.build/debug/argmax-cli')
    ]
    return candidates.find((candidate) => existsSync(candidate))
  }

  private setupInstructions(repoPath: string, model: string): string[] {
    return [
      'OpenWhisperflow does not clone, install Homebrew dependencies, download models, or build Argmax from the UI.',
      'Prepare Argmax manually in Terminal, then use Run Server only to run the local server.',
      'Recommended commands:',
      'cd ~/Documents',
      'git clone https://github.com/argmaxinc/argmax-oss-swift.git',
      'cd argmax-oss-swift',
      `make download-model MODEL=${model}`,
      'make build-local-server',
      `./.build/arm64-apple-macosx/release/argmax-cli serve --model ${model} --host 127.0.0.1 --port 50060`,
      repoPath ? `Current configured path: ${repoPath}` : 'Current configured path is empty.'
    ]
  }

  private appendLog(message: string): void {
    const lines = message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    this.logs.push(...lines)
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
    }
  }
}
