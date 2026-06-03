import { globalShortcut } from 'electron'

export class HotkeyService {
  private readonly registeredHotkeys = new Set<string>()

  register(hotkey: string, onFire: () => void): boolean {
    this.unregister(hotkey)
    const ok = globalShortcut.register(hotkey, onFire)

    if (ok) {
      this.registeredHotkeys.add(hotkey)
    }

    return ok
  }

  registerCancel(onCancel: () => void): boolean {
    this.unregister('Escape')
    const ok = globalShortcut.register('Escape', onCancel)
    if (ok) this.registeredHotkeys.add('Escape')
    return ok
  }

  unregister(hotkey?: string): void {
    if (hotkey) {
      if (this.registeredHotkeys.has(hotkey)) {
        globalShortcut.unregister(hotkey)
        this.registeredHotkeys.delete(hotkey)
      }
      return
    }

    for (const registered of this.registeredHotkeys) {
      globalShortcut.unregister(registered)
    }
    this.registeredHotkeys.clear()
  }
}
