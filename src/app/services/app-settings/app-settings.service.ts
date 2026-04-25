import { Injectable } from '@angular/core'
import { CacheManagerService } from '../cache/cache-manager.service'

export interface AppSettings {
  defaultQueryRows: number
}

@Injectable({
  providedIn: 'root'
})
export class AppSettingsService {
  private readonly cacheKey = 'app-settings'
  private readonly fallbackSettings: AppSettings = {
    defaultQueryRows: 50
  }

  constructor(private cache: CacheManagerService) { }

  getSettings(): AppSettings {
    return {
      ...this.fallbackSettings,
      ...(this.cache.get<AppSettings>(this.cacheKey) || {})
    }
  }

  getDefaultQueryRows(): number {
    return this.getSettings().defaultQueryRows
  }

  setDefaultQueryRows(value: number): AppSettings {
    const defaultQueryRows = this.normalizeRows(value)
    const settings = {
      ...this.getSettings(),
      defaultQueryRows
    }

    this.cache.set(this.cacheKey, settings)

    return settings
  }

  normalizeRows(value: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.fallbackSettings.defaultQueryRows
    }

    return Math.floor(parsed)
  }
}
