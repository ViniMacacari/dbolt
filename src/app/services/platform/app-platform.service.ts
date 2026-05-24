import { Injectable } from '@angular/core'

type KnownPlatform = 'linux' | 'win32' | 'darwin' | 'browser' | string

@Injectable({
  providedIn: 'root'
})
export class AppPlatformService {
  private platform: KnownPlatform = this.detectBrowserPlatform()
  private readonly isElectron = typeof window !== 'undefined' && !!window.dboltWindow

  constructor() {
    if (!this.isElectron || !window.dboltWindow) {
      return
    }

    void window.dboltWindow.getState()
      .then((state) => {
        this.platform = state.platform || this.platform
      })
      .catch(() => undefined)
  }

  isLinuxElectron(): boolean {
    return this.isElectron && this.platform === 'linux'
  }

  private detectBrowserPlatform(): KnownPlatform {
    if (typeof navigator === 'undefined') {
      return 'browser'
    }

    const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()

    if (platform.includes('linux')) return 'linux'
    if (platform.includes('win')) return 'win32'
    if (platform.includes('mac')) return 'darwin'

    return 'browser'
  }
}
