import { Injectable } from '@angular/core'
import { CacheManagerService } from '../cache/cache-manager.service'

export interface AppSettings {
  defaultQueryRows: number
  connectionExpirationMinutes: number
  tableAutocompleteEnabled: boolean
  columnAutocompleteEnabled: boolean
}

@Injectable({
  providedIn: 'root'
})
export class AppSettingsService {
  private readonly cacheKey = 'app-settings'
  private readonly fallbackSettings: AppSettings = {
    defaultQueryRows: 50,
    connectionExpirationMinutes: 30,
    tableAutocompleteEnabled: true,
    columnAutocompleteEnabled: true
  }

  constructor(private cache: CacheManagerService) { }

  getSettings(): AppSettings {
    const cachedSettings = this.cache.get<AppSettings>(this.cacheKey)
    if (cachedSettings) {
      const settings = this.normalizeSettings(cachedSettings)
      this.cache.set(this.cacheKey, settings)

      return settings
    }

    const settings = this.normalizeSettings(this.readStoredSettings())
    this.cache.set(this.cacheKey, settings)

    return settings
  }

  getDefaultQueryRows(): number {
    return this.getSettings().defaultQueryRows
  }

  getConnectionExpirationMinutes(): number {
    return this.getSettings().connectionExpirationMinutes
  }

  isTableAutocompleteEnabled(): boolean {
    return this.getSettings().tableAutocompleteEnabled
  }

  isColumnAutocompleteEnabled(): boolean {
    return this.getSettings().columnAutocompleteEnabled
  }

  setDefaultQueryRows(value: number): AppSettings {
    const defaultQueryRows = this.normalizeRows(value)
    const settings = {
      ...this.getSettings(),
      defaultQueryRows
    }

    this.saveSettings(settings)

    return settings
  }

  setConnectionExpirationMinutes(value: number): AppSettings {
    const connectionExpirationMinutes = this.normalizeExpirationMinutes(value)
    const settings = {
      ...this.getSettings(),
      connectionExpirationMinutes
    }

    this.saveSettings(settings)

    return settings
  }

  setTableAutocompleteEnabled(value: boolean): AppSettings {
    const settings = {
      ...this.getSettings(),
      tableAutocompleteEnabled: Boolean(value)
    }

    this.saveSettings(settings)

    return settings
  }

  setColumnAutocompleteEnabled(value: boolean): AppSettings {
    const settings = {
      ...this.getSettings(),
      columnAutocompleteEnabled: Boolean(value)
    }

    this.saveSettings(settings)

    return settings
  }

  normalizeRows(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.fallbackSettings.defaultQueryRows
    }

    return Math.floor(parsed)
  }

  normalizeExpirationMinutes(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.fallbackSettings.connectionExpirationMinutes
    }

    return Math.floor(parsed)
  }

  private normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
    return {
      defaultQueryRows: this.normalizeRows(settings?.defaultQueryRows),
      connectionExpirationMinutes: this.normalizeExpirationMinutes(settings?.connectionExpirationMinutes),
      tableAutocompleteEnabled: settings?.tableAutocompleteEnabled ?? this.fallbackSettings.tableAutocompleteEnabled,
      columnAutocompleteEnabled: settings?.columnAutocompleteEnabled ?? this.fallbackSettings.columnAutocompleteEnabled
    }
  }

  private saveSettings(settings: AppSettings): void {
    this.cache.set(this.cacheKey, settings)
    this.writeStoredSettings(settings)
  }

  private readStoredSettings(): Partial<AppSettings> | undefined {
    try {
      const rawSettings = localStorage.getItem(this.cacheKey)
      if (!rawSettings) return undefined

      return JSON.parse(rawSettings)
    } catch {
      return undefined
    }
  }

  private writeStoredSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(settings))
    } catch {
      // Settings still work for the current session through CacheManagerService.
    }
  }
}
