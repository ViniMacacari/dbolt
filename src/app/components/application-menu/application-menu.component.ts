import { CommonModule } from '@angular/common'
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core'
import { Router } from '@angular/router'

import { AppLanguageService } from '../../services/language/app-language.service'
import { AppPlatformService } from '../../services/platform/app-platform.service'
import { AppInfoService } from '../../services/app-info/app-info.service'

type WindowAction =
  | 'minimize'
  | 'toggle-maximize'
  | 'close'
  | 'quit'
  | 'reset-zoom'
  | 'zoom-in'
  | 'zoom-out'
  | 'toggle-fullscreen'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'select-all'
  | 'open-original-repository'

type AppMenuCommand = WindowAction | 'open-help'

interface WindowState {
  isFullScreen: boolean
  isMaximized: boolean
  platform: string
}

interface ApplicationMenuItem {
  command?: AppMenuCommand
  disabledWithoutElectron?: boolean
  labelKey?: string
  separator?: boolean
  shortcut?: string
}

interface ApplicationMenuGroup {
  id: string
  labelKey: string
  items: ApplicationMenuItem[]
}

const ORIGINAL_REPOSITORY_URL = 'https://github.com/ViniMacacari/dbolt'

@Component({
  selector: 'app-application-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './application-menu.component.html',
  styleUrl: './application-menu.component.scss'
})
export class ApplicationMenuComponent implements OnInit, OnDestroy {
  readonly menus: ApplicationMenuGroup[] = [
    {
      id: 'file',
      labelKey: 'applicationMenu.file',
      items: [
        { labelKey: 'applicationMenu.file.quit', command: 'quit', shortcut: 'Alt+F4', disabledWithoutElectron: true }
      ]
    },
    {
      id: 'edit',
      labelKey: 'applicationMenu.edit',
      items: [
        { labelKey: 'applicationMenu.edit.undo', command: 'undo', shortcut: 'Ctrl+Z' },
        { labelKey: 'applicationMenu.edit.redo', command: 'redo', shortcut: 'Ctrl+Y' },
        { separator: true },
        { labelKey: 'applicationMenu.edit.cut', command: 'cut', shortcut: 'Ctrl+X' },
        { labelKey: 'applicationMenu.edit.copy', command: 'copy', shortcut: 'Ctrl+C' },
        { labelKey: 'applicationMenu.edit.paste', command: 'paste', shortcut: 'Ctrl+V' },
        { labelKey: 'applicationMenu.edit.delete', command: 'delete', shortcut: 'Del' },
        { separator: true },
        { labelKey: 'applicationMenu.edit.selectAll', command: 'select-all', shortcut: 'Ctrl+A' }
      ]
    },
    {
      id: 'view',
      labelKey: 'applicationMenu.view',
      items: [
        { labelKey: 'applicationMenu.view.resetZoom', command: 'reset-zoom', shortcut: 'Ctrl+0', disabledWithoutElectron: true },
        { labelKey: 'applicationMenu.view.zoomIn', command: 'zoom-in', shortcut: 'Ctrl++', disabledWithoutElectron: true },
        { labelKey: 'applicationMenu.view.zoomOut', command: 'zoom-out', shortcut: 'Ctrl+-', disabledWithoutElectron: true },
        { separator: true },
        {
          labelKey: 'applicationMenu.view.toggleFullscreen',
          command: 'toggle-fullscreen',
          shortcut: 'F11',
          disabledWithoutElectron: true
        }
      ]
    },
    {
      id: 'window',
      labelKey: 'applicationMenu.window',
      items: [
        { labelKey: 'applicationMenu.window.minimize', command: 'minimize', disabledWithoutElectron: true },
        { labelKey: 'applicationMenu.window.maximizeRestore', command: 'toggle-maximize', disabledWithoutElectron: true },
        { labelKey: 'applicationMenu.window.close', command: 'close', shortcut: 'Alt+F4', disabledWithoutElectron: true }
      ]
    },
    {
      id: 'help',
      labelKey: 'applicationMenu.help',
      items: [
        { labelKey: 'applicationMenu.help.openHelp', command: 'open-help' },
        { labelKey: 'applicationMenu.help.originalRepository', command: 'open-original-repository' }
      ]
    }
  ]

  appVersion: string = ''

  openMenuId: string | null = null
  windowState: WindowState = {
    isFullScreen: false,
    isMaximized: false,
    platform: 'browser'
  }

  readonly isElectron = typeof window !== 'undefined' && !!window.dboltWindow
  private removeWindowStateListener: (() => void) | null = null

  constructor(
    private router: Router,
    private language: AppLanguageService,
    private platform: AppPlatformService,
    private appInfo: AppInfoService
  ) { }

  async ngOnInit(): Promise<void> {
    this.appVersion = await this.appInfo.getAppInfo()

    if (!this.isElectron || !window.dboltWindow) {
      return
    }

    void window.dboltWindow.getState().then((state) => {
      this.windowState = state
    })

    this.removeWindowStateListener = window.dboltWindow.onStateChanged((state) => {
      this.windowState = state
    })
  }

  ngOnDestroy(): void {
    this.removeWindowStateListener?.()
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenuId = null
  }

  @HostListener('document:keydown.escape')
  closeMenusWithKeyboard(): void {
    this.openMenuId = null
  }

  @HostListener('document:keydown', ['$event'])
  handleWindowShortcut(event: KeyboardEvent): void {
    if (this.isBlockedBrowserShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (!this.isElectron) {
      return
    }

    const key = event.key.toLowerCase()

    if (event.key === 'F11') {
      event.preventDefault()
      void this.runAction('toggle-fullscreen')
      return
    }

    if (!event.ctrlKey || event.altKey) {
      return
    }

    if (key === '0') {
      event.preventDefault()
      void this.runAction('reset-zoom')
      return
    }

    if (key === '+' || key === '=') {
      event.preventDefault()
      void this.runAction('zoom-in')
      return
    }

    if (key === '-') {
      event.preventDefault()
      void this.runAction('zoom-out')
      return
    }
  }

  keepMenuFocus(event: MouseEvent): void {
    event.preventDefault()
  }

  toggleMenu(menuId: string, event: MouseEvent): void {
    event.stopPropagation()
    this.openMenuId = this.openMenuId === menuId ? null : menuId
  }

  async runMenuItem(item: ApplicationMenuItem, event: MouseEvent): Promise<void> {
    event.stopPropagation()

    if (!item.command || this.isMenuItemDisabled(item)) {
      return
    }

    this.openMenuId = null

    if (item.command === 'open-help') {
      await this.router.navigate(['/help'])
      return
    }

    await this.runAction(item.command)
  }

  isMenuItemDisabled(item: ApplicationMenuItem): boolean {
    return !!item.disabledWithoutElectron && !this.isElectron
  }

  async runAction(action: WindowAction): Promise<void> {
    if (this.isElectron && window.dboltWindow) {
      this.windowState = await window.dboltWindow.invoke(action)
      return
    }

    this.runBrowserFallback(action)
  }

  t(key: string): string {
    return this.language.translate(key)
  }

  private runBrowserFallback(action: WindowAction): void {
    switch (action) {
      case 'undo':
      case 'redo':
      case 'cut':
      case 'copy':
      case 'paste':
      case 'delete':
        document.execCommand(action)
        break
      case 'select-all':
        document.execCommand('selectAll')
        break
      case 'open-original-repository':
        window.open(ORIGINAL_REPOSITORY_URL, '_blank', 'noopener')
        break
    }
  }

  private isBlockedBrowserShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    const ctrlOrMeta = event.ctrlKey || event.metaKey

    return key === 'f5' ||
      key === 'f12' ||
      (this.platform.isLinuxElectron() && ctrlOrMeta && key === 's') ||
      (ctrlOrMeta && key === 'r') ||
      (ctrlOrMeta && event.shiftKey && ['i', 'j', 'c'].includes(key))
  }
}
