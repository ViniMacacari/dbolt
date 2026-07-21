import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

import { AppSettingsService, AppTheme } from '../app-settings/app-settings.service'

@Injectable({
  providedIn: 'root'
})
export class AppThemeService {
  private readonly themeSubject: BehaviorSubject<AppTheme>
  readonly themeChanges$

  constructor(private settings: AppSettingsService) {
    const initialTheme = this.settings.getAppTheme()
    this.themeSubject = new BehaviorSubject<AppTheme>(initialTheme)
    this.themeChanges$ = this.themeSubject.asObservable()
    this.applyTheme(initialTheme)

    this.settings.settingsChanges$.subscribe(settings => {
      const theme = this.settings.normalizeAppTheme(settings.appTheme)
      if (theme !== this.themeSubject.value) {
        this.themeSubject.next(theme)
      }
      this.applyTheme(theme)
    })
  }

  initialize(): void {
    this.applyTheme(this.themeSubject.value)
  }

  getTheme(): AppTheme {
    return this.themeSubject.value
  }

  setTheme(theme: unknown): AppTheme {
    return this.settings.setAppTheme(theme).appTheme
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') return

    document.documentElement.dataset['appTheme'] = theme
    document.documentElement.style.colorScheme = theme
  }
}
