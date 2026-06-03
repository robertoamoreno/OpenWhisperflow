import ApplicationServices
import Cocoa
import Foundation

struct HelperEvent: Encodable {
  let type: String
  let value: String?
  let trusted: Bool?
  let timestamp: TimeInterval
}

final class OpenWhisperflowHotkeyHelper {
  private var eventTap: CFMachPort?
  private var runLoopSource: CFRunLoopSource?
  private var isCommandDown = false
  private var isOptionDown = false
  private var isShiftDown = false
  private var isSpaceDown = false

  func run() {
    emit(type: "ready", value: "OpenWhisperflow native helper started", trusted: isAccessibilityTrusted())
    startEventTap()
    listenForCommands()
    CFRunLoopRun()
  }

  private func startEventTap() {
    guard isAccessibilityTrusted() else {
      emit(type: "permission", value: "accessibility-not-trusted", trusted: false)
      return
    }

    let mask =
      (1 << CGEventType.flagsChanged.rawValue) |
      (1 << CGEventType.keyDown.rawValue) |
      (1 << CGEventType.keyUp.rawValue)

    let callback: CGEventTapCallBack = { _, eventType, event, refcon in
      guard let refcon else { return Unmanaged.passUnretained(event) }
      let helper = Unmanaged<OpenWhisperflowHotkeyHelper>.fromOpaque(refcon).takeUnretainedValue()
      helper.handle(eventType: eventType, event: event)
      return Unmanaged.passUnretained(event)
    }

    eventTap = CGEvent.tapCreate(
      tap: .cgSessionEventTap,
      place: .headInsertEventTap,
      options: .listenOnly,
      eventsOfInterest: CGEventMask(mask),
      callback: callback,
      userInfo: Unmanaged.passUnretained(self).toOpaque()
    )

    guard let eventTap else {
      emit(type: "error", value: "event-tap-unavailable", trusted: true)
      return
    }

    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
    if let runLoopSource {
      CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
      CGEvent.tapEnable(tap: eventTap, enable: true)
      emit(type: "listening", value: "event-tap-enabled", trusted: true)
    }
  }

  private func listenForCommands() {
    DispatchQueue.global(qos: .utility).async {
      while let line = readLine() {
        self.handleCommand(line.trimmingCharacters(in: .whitespacesAndNewlines))
      }
    }
  }

  private func handleCommand(_ command: String) {
    switch command {
    case "status":
      emit(type: "status", value: "ok", trusted: isAccessibilityTrusted())
    case "request-accessibility":
      let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
      let trusted = AXIsProcessTrustedWithOptions(options)
      emit(type: "permission", value: trusted ? "accessibility-trusted" : "accessibility-requested", trusted: trusted)
    case "quit":
      emit(type: "exit", value: "requested", trusted: isAccessibilityTrusted())
      CFRunLoopStop(CFRunLoopGetMain())
    default:
      emit(type: "error", value: "unknown-command", trusted: isAccessibilityTrusted())
    }
  }

  private func handle(eventType: CGEventType, event: CGEvent) {
    let flags = event.flags
    isCommandDown = flags.contains(.maskCommand)
    isOptionDown = flags.contains(.maskAlternate)
    isShiftDown = flags.contains(.maskShift)

    if eventType == .keyDown || eventType == .keyUp {
      let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
      if keyCode == 49 {
        isSpaceDown = eventType == .keyDown
      }
    }

    let active = isCommandDown && isOptionDown && isShiftDown && isSpaceDown
    if eventType == .keyDown && active {
      emit(type: "hotkey-down", value: "cmd-alt-shift-space", trusted: true)
    } else if eventType == .keyUp && !isSpaceDown {
      emit(type: "hotkey-up", value: "cmd-alt-shift-space", trusted: true)
    }
  }

  private func isAccessibilityTrusted() -> Bool {
    AXIsProcessTrusted()
  }

  private func emit(type: String, value: String?, trusted: Bool?) {
    let event = HelperEvent(type: type, value: value, trusted: trusted, timestamp: Date().timeIntervalSince1970)
    guard let data = try? JSONEncoder().encode(event), let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
  }
}

OpenWhisperflowHotkeyHelper().run()
