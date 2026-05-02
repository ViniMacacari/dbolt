import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'
import { CacheManagerService } from '../cache/cache-manager.service'

export interface SqlHighlightColors {
  keyword: string
  function: string
  identifier: string
  string: string
  number: string
  comment: string
  operator: string
  type: string
  variable: string
  delimiter: string
}

export type SqlHighlightColorKey = keyof SqlHighlightColors

export interface AppSettings {
  defaultQueryRows: number
  connectionExpirationMinutes: number
  tableAutocompleteEnabled: boolean
  columnAutocompleteEnabled: boolean
  sqlFormatterIndentSize: number
  sqlFormatterUppercaseKeywords: boolean
  sqlHighlightColors: SqlHighlightColors
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
    columnAutocompleteEnabled: true,
    sqlFormatterIndentSize: 2,
    sqlFormatterUppercaseKeywords: true,
    sqlHighlightColors: {
      keyword: '#739eca',
      function: '#f1e02d',
      identifier: '#e8e7e6',
      string: '#cac580',
      number: '#d996ff',
      comment: '#7f8c98',
      operator: '#badedc',
      type: '#c7859c',
      variable: '#c7859c',
      delimiter: '#c9d1d9'
    }
  }
  private readonly settingsChangedSubject = new Subject<AppSettings>()
  readonly settingsChanges$ = this.settingsChangedSubject.asObservable()

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

  getSqlFormatterIndentSize(): number {
    return this.getSettings().sqlFormatterIndentSize
  }

  shouldUppercaseSqlFormatterKeywords(): boolean {
    return this.getSettings().sqlFormatterUppercaseKeywords
  }

  getSqlHighlightColors(): SqlHighlightColors {
    return this.getSettings().sqlHighlightColors
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

  setSqlFormatterSettings(indentSize: number, uppercaseKeywords: boolean): AppSettings {
    const settings = {
      ...this.getSettings(),
      sqlFormatterIndentSize: this.normalizeIndentSize(indentSize),
      sqlFormatterUppercaseKeywords: Boolean(uppercaseKeywords)
    }

    this.saveSettings(settings)

    return settings
  }

  setSqlHighlightColors(value: Partial<SqlHighlightColors>): AppSettings {
    const settings = {
      ...this.getSettings(),
      sqlHighlightColors: this.normalizeSqlHighlightColors(value)
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

  normalizeIndentSize(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.fallbackSettings.sqlFormatterIndentSize
    }

    return Math.min(Math.floor(parsed), 8)
  }

  normalizeSqlHighlightColors(value: unknown): SqlHighlightColors {
    const colors = this.isObject(value) ? value as Partial<Record<SqlHighlightColorKey, unknown>> : {}

    return {
      keyword: this.normalizeHexColor(colors.keyword, this.fallbackSettings.sqlHighlightColors.keyword),
      function: this.normalizeHexColor(colors.function, this.fallbackSettings.sqlHighlightColors.function),
      identifier: this.normalizeHexColor(colors.identifier, this.fallbackSettings.sqlHighlightColors.identifier),
      string: this.normalizeHexColor(colors.string, this.fallbackSettings.sqlHighlightColors.string),
      number: this.normalizeHexColor(colors.number, this.fallbackSettings.sqlHighlightColors.number),
      comment: this.normalizeHexColor(colors.comment, this.fallbackSettings.sqlHighlightColors.comment),
      operator: this.normalizeHexColor(colors.operator, this.fallbackSettings.sqlHighlightColors.operator),
      type: this.normalizeHexColor(colors.type, this.fallbackSettings.sqlHighlightColors.type),
      variable: this.normalizeHexColor(colors.variable, this.fallbackSettings.sqlHighlightColors.variable),
      delimiter: this.normalizeHexColor(colors.delimiter, this.fallbackSettings.sqlHighlightColors.delimiter)
    }
  }

  private normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
    return {
      defaultQueryRows: this.normalizeRows(settings?.defaultQueryRows),
      connectionExpirationMinutes: this.normalizeExpirationMinutes(settings?.connectionExpirationMinutes),
      tableAutocompleteEnabled: settings?.tableAutocompleteEnabled ?? this.fallbackSettings.tableAutocompleteEnabled,
      columnAutocompleteEnabled: settings?.columnAutocompleteEnabled ?? this.fallbackSettings.columnAutocompleteEnabled,
      sqlFormatterIndentSize: this.normalizeIndentSize(settings?.sqlFormatterIndentSize),
      sqlFormatterUppercaseKeywords: settings?.sqlFormatterUppercaseKeywords ?? this.fallbackSettings.sqlFormatterUppercaseKeywords,
      sqlHighlightColors: this.normalizeSqlHighlightColors(settings?.sqlHighlightColors)
    }
  }

  private normalizeHexColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback

    const color = value.trim()
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()

    return fallback
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  private saveSettings(settings: AppSettings): void {
    this.cache.set(this.cacheKey, settings)
    this.writeStoredSettings(settings)
    this.settingsChangedSubject.next(settings)
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
