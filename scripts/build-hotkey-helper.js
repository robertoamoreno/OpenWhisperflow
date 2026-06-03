import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = resolve('src/native/macos/OpenWhisperflowHotkeyHelper.swift')
const output = resolve('resources/bin/openwhisperflow-hotkey-helper')

if (process.platform !== 'darwin') {
  console.log('Skipping OpenWhisperflow hotkey helper build: macOS only.')
  process.exit(0)
}

mkdirSync(dirname(output), { recursive: true })

const result = spawnSync(
  'xcrun',
  ['swiftc', source, '-o', output, '-framework', 'Cocoa', '-framework', 'ApplicationServices'],
  { stdio: 'inherit' }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
