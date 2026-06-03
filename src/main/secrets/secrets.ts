const SERVICE_NAME = 'OpenWhisperflow'
const LEGACY_SERVICE_NAMES = ['VoiceDesk']

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword?: (service: string, account: string) => Promise<boolean>
}

export class SecretService {
  async getTogetherApiKey(): Promise<string | undefined> {
    return this.getSecret('TOGETHER_API_KEY', 'together-api-key')
  }

  async getAnthropicApiKey(): Promise<string | undefined> {
    return this.getSecret('ANTHROPIC_API_KEY', 'anthropic-api-key')
  }

  async setTogetherApiKey(value?: string): Promise<void> {
    await this.setSecret('together-api-key', value)
  }

  async setAnthropicApiKey(value?: string): Promise<void> {
    await this.setSecret('anthropic-api-key', value)
  }

  private async getSecret(envName: string, account: string): Promise<string | undefined> {
    const envValue = process.env[envName]
    if (envValue) return envValue

    const keytar = await this.loadKeytar()
    if (!keytar) return undefined

    const value = await keytar.getPassword(SERVICE_NAME, account)
    if (value) return value

    for (const legacyServiceName of LEGACY_SERVICE_NAMES) {
      const legacyValue = await keytar.getPassword(legacyServiceName, account)
      if (legacyValue) return legacyValue
    }

    return undefined
  }

  private async setSecret(account: string, value?: string): Promise<void> {
    const keytar = await this.loadKeytar()
    if (!keytar) {
      throw new Error('macOS Keychain integration is unavailable. Use environment variables for this run.')
    }

    if (!value) {
      if (typeof keytar.deletePassword === 'function') {
        await keytar.deletePassword(SERVICE_NAME, account)
      } else {
        await keytar.setPassword(SERVICE_NAME, account, '')
      }
      return
    }

    await keytar.setPassword(SERVICE_NAME, account, value)
  }

  private async loadKeytar(): Promise<KeytarLike | undefined> {
    try {
      const mod = await import('keytar')
      return ((mod as { default?: KeytarLike }).default ?? mod) as KeytarLike
    } catch {
      return undefined
    }
  }
}
