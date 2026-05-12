import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { AppSettingsService } from '../app-settings/app-settings.service'
import {
  APP_LANGUAGE_OPTIONS,
  AppLanguage,
  AppLanguageOption,
  DEFAULT_APP_LANGUAGE,
  normalizeAppLanguage
} from './language.model'
import { TranslationCatalogService } from './translation-catalog.service'

@Injectable({
  providedIn: 'root'
})
export class AppLanguageService {
  readonly languageOptions: AppLanguageOption[] = APP_LANGUAGE_OPTIONS
  private readonly languageSubject = new BehaviorSubject<AppLanguage>(DEFAULT_APP_LANGUAGE)
  readonly languageChanges$ = this.languageSubject.asObservable()

  constructor(
    private settings: AppSettingsService,
    private catalog: TranslationCatalogService
  ) {
    this.languageSubject.next(this.settings.getAppLanguage())
    this.settings.settingsChanges$.subscribe((settings) => {
      const nextLanguage = normalizeAppLanguage(settings.appLanguage)
      if (nextLanguage !== this.languageSubject.value) {
        this.languageSubject.next(nextLanguage)
      }
    })
  }

  getCurrentLanguage(): AppLanguage {
    return this.languageSubject.value
  }

  setLanguage(language: unknown): AppLanguage {
    const settings = this.settings.setAppLanguage(language)
    const normalizedLanguage = normalizeAppLanguage(settings.appLanguage)
    this.languageSubject.next(normalizedLanguage)

    return normalizedLanguage
  }

  translate(key: string, params: Record<string, string | number> = {}): string {
    const value = this.catalog.translate(this.getCurrentLanguage(), key)

    return Object.entries(params).reduce((text, [paramKey, paramValue]) =>
      text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue)),
      value
    )
  }
}
