import { Injectable, NgZone, OnDestroy } from '@angular/core'

export interface KeyboardShortcutRegistration {
  key: string
  ctrlOrMeta?: boolean
  altKey?: boolean
  shiftKey?: boolean
  priority?: number
  preventDefault?: boolean
  stopPropagation?: boolean
  allowRepeat?: boolean
  isEnabled?: () => boolean
  isInContext?: (event: KeyboardEvent) => boolean
  handler: (event: KeyboardEvent) => boolean | void
}

interface RegisteredKeyboardShortcut extends KeyboardShortcutRegistration {
  order: number
}

@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutService implements OnDestroy {
  private shortcuts: RegisteredKeyboardShortcut[] = []
  private nextOrder = 0
  private readonly keydownListener = (event: KeyboardEvent) => this.handleKeydown(event)

  constructor(private zone: NgZone) {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.keydownListener, true)
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.keydownListener, true)
    }
  }

  register(shortcut: KeyboardShortcutRegistration): () => void {
    const registeredShortcut: RegisteredKeyboardShortcut = {
      ...shortcut,
      order: this.nextOrder++
    }

    this.shortcuts = [...this.shortcuts, registeredShortcut]

    return () => {
      this.shortcuts = this.shortcuts.filter((item) => item !== registeredShortcut)
    }
  }

  isEventInside(event: Event, element: HTMLElement | null | undefined): boolean {
    const target = event.target as Node | null
    return !!target && !!element?.contains(target)
  }

  private handleKeydown(event: KeyboardEvent): void {
    const shortcut = this.shortcuts
      .filter((item) => this.matchesShortcut(event, item))
      .sort((left, right) =>
        (right.priority || 0) - (left.priority || 0) ||
        right.order - left.order
      )
      .find((item) => this.canRunShortcut(event, item))

    if (!shortcut) return

    const handled = this.zone.run(() => shortcut.handler(event))
    if (handled === false) return

    if (shortcut.preventDefault !== false) {
      event.preventDefault()
    }

    if (shortcut.stopPropagation === true) {
      event.stopPropagation()
    }
  }

  private matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcutRegistration): boolean {
    if (this.normalizeKey(event.key) !== this.normalizeKey(shortcut.key)) return false

    if (shortcut.ctrlOrMeta && !event.ctrlKey && !event.metaKey) return false
    if (!shortcut.ctrlOrMeta && (event.ctrlKey || event.metaKey)) return false
    if (event.altKey !== Boolean(shortcut.altKey)) return false
    if (event.shiftKey !== Boolean(shortcut.shiftKey)) return false
    if (event.repeat && !shortcut.allowRepeat) return false

    return true
  }

  private canRunShortcut(event: KeyboardEvent, shortcut: KeyboardShortcutRegistration): boolean {
    if (shortcut.isEnabled && !shortcut.isEnabled()) return false
    if (shortcut.isInContext && !shortcut.isInContext(event)) return false

    return true
  }

  private normalizeKey(key: string): string {
    return String(key || '').trim().toLowerCase()
  }
}
