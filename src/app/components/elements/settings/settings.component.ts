import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core'
import {
  AppSettingsService,
  AppTheme,
  SqlFormatterCommaStyle,
  SqlHighlightColorKey,
  SqlHighlightColors,
  SqlHighlightMode,
  TableAutocompleteMatchMode
} from '../../../services/app-settings/app-settings.service'
import { ConnectionsService, SavedConnection } from '../../../services/resolve-connections/connections.service'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from '../input-list/input-list.component'
import { LoadingComponent } from '../../modal/loading/loading.component'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { AppLanguage } from '../../../services/language/language.model'
import { AiAssistantSettingsService } from '../../../services/ai-assistant/ai-assistant-settings.service'
import { AppThemeService } from '../../../services/theme/app-theme.service'
import {
  AiAssistantLimits,
  AiAssistantProvider,
  AiAssistantSettings
} from '../../../services/ai-assistant/ai-assistant.model'

type SettingsTab = 'query' | 'connections' | 'autocomplete' | 'highlight' | 'appearance' | 'language' | 'ai'

const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_AI_LIMITS: AiAssistantLimits = {
  maxApiCallsPerMessage: 4,
  maxDatabaseRequestsPerMessage: 4,
  maxDatabaseRequestsPerApiCall: 2,
  maxContextMessages: 10,
  maxToolResultChars: 9000,
  maxToolTranscriptChars: 18000
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, InputListComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit, OnChanges {
  @Input() initialTab: SettingsTab | null = null
  @Output() aiSettingsSaved = new EventEmitter<AiAssistantSettings>()
  activeTab: SettingsTab = 'query'
  defaultQueryRows: number
  connectionExpirationMinutes: number
  sqlSyntaxValidationEnabled: boolean
  tableAutocompleteEnabled: boolean
  tableAutocompleteMatchMode: TableAutocompleteMatchMode
  columnAutocompleteEnabled: boolean
  autoQuoteCapitalizedColumns: boolean
  sqlFormatterIndentSize: number
  sqlFormatterUppercaseKeywords: boolean
  sqlFormatterCommaStyle: SqlFormatterCommaStyle
  sqlFormatterBlankLineBetweenStatements: boolean
  sqlFormatterIndentCreateBody: boolean
  sqlHighlightMode: SqlHighlightMode
  sqlHighlightColors: SqlHighlightColors
  appLanguage: AppLanguage
  appTheme: AppTheme
  readonly appLanguageOptions: { value: AppLanguage, label: string }[]
  appThemeOptions: { value: AppTheme, label: string }[]
  savedMessage: string = ''
  expirationSavedMessage: string = ''
  syntaxValidationSavedMessage: string = ''
  formatterSavedMessage: string = ''
  highlightSavedMessage: string = ''
  languageSavedMessage: string = ''
  themeSavedMessage: string = ''
  tableAutocompleteSavedMessage: string = ''
  tableMatchModeSavedMessage: string = ''
  columnAutocompleteSavedMessage: string = ''
  autoQuoteCapitalizedColumnsSavedMessage: string = ''
  connectionMessage: string = ''
  connectionError: string = ''
  connections: SavedConnection[] = []
  connectionOptions: { id: number, label: string }[] = []
  selectedConnection: SavedConnection | null = null
  targetOptionsLoaded: boolean = false
  schemaOptions: any[] = []
  defaultDatabaseList: { name: string }[] = []
  defaultSchemaList: { name: string }[] = []
  selectedDefaultDatabase: string = ''
  selectedDefaultSchema: string = ''
  aiSettings: AiAssistantSettings | null = null
  aiSettingsLoading: boolean = false
  aiSettingsSaving: boolean = false
  aiRemovingApiKey: AiAssistantProvider | null = null
  aiSettingsMessage: string = ''
  aiSettingsError: string = ''
  aiProvider: AiAssistantProvider = 'openai'
  aiModel: string = 'gpt-5.4-mini'
  aiBaseUrl: string = DEFAULT_AI_BASE_URL
  aiCustomEndpointEnabled: boolean = false
  aiApiKeys: Record<AiAssistantProvider, string> = {
    openai: '',
    gemini: '',
    anthropic: '',
    openrouter: ''
  }
  aiLimits: AiAssistantLimits = { ...DEFAULT_AI_LIMITS }
  readonly aiProviderOptions: { label: string, value: AiAssistantProvider }[] = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Gemini', value: 'gemini' },
    { label: 'Claude', value: 'anthropic' },
    { label: 'OpenRouter', value: 'openrouter' }
  ]
  readonly aiApiKeyFields: { provider: AiAssistantProvider, label: string }[] = [
    { provider: 'openai', label: 'OpenAI' },
    { provider: 'gemini', label: 'Gemini' },
    { provider: 'anthropic', label: 'Claude' },
    { provider: 'openrouter', label: 'OpenRouter' }
  ]
  readonly openAiModelOptions: { label: string, value: string }[] = [
    { label: 'GPT-5.5', value: 'gpt-5.5' },
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' },
    { label: 'GPT-5.4 nano', value: 'gpt-5.4-nano' },
    { label: 'GPT-5.2', value: 'gpt-5.2' },
    { label: 'GPT-5.1', value: 'gpt-5.1' },
    { label: 'GPT-5', value: 'gpt-5' },
    { label: 'GPT-5 mini', value: 'gpt-5-mini' },
    { label: 'GPT-5 nano', value: 'gpt-5-nano' },
    { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'GPT-4.1 nano', value: 'gpt-4.1-nano' },
    { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'o4-mini', value: 'o4-mini' }
  ]
  readonly geminiModelOptions: { label: string, value: string }[] = [
    { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 3.1 Flash-Lite', value: 'gemini-3.1-flash-lite' },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Flash-Lite', value: 'gemini-2.5-flash-lite' }
  ]
  readonly anthropicModelOptions: { label: string, value: string }[] = [
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' }
  ]

  constructor(
    private settings: AppSettingsService,
    private connectionsService: ConnectionsService,
    private IAPI: InternalApiService,
    private language: AppLanguageService,
    private aiSettingsService: AiAssistantSettingsService,
    private theme: AppThemeService
  ) {
    this.defaultQueryRows = this.settings.getDefaultQueryRows()
    this.connectionExpirationMinutes = this.settings.getConnectionExpirationMinutes()
    this.sqlSyntaxValidationEnabled = this.settings.isSqlSyntaxValidationEnabled()
    this.tableAutocompleteEnabled = this.settings.isTableAutocompleteEnabled()
    this.tableAutocompleteMatchMode = this.settings.getTableAutocompleteMatchMode()
    this.columnAutocompleteEnabled = this.settings.isColumnAutocompleteEnabled()
    this.autoQuoteCapitalizedColumns = this.settings.shouldAutoQuoteCapitalizedColumns()
    this.sqlFormatterIndentSize = this.settings.getSqlFormatterIndentSize()
    this.sqlFormatterUppercaseKeywords = this.settings.shouldUppercaseSqlFormatterKeywords()
    this.sqlFormatterCommaStyle = this.settings.getSqlFormatterCommaStyle()
    this.sqlFormatterBlankLineBetweenStatements = this.settings.shouldAddBlankLineBetweenSqlStatements()
    this.sqlFormatterIndentCreateBody = this.settings.shouldIndentSqlCreateBody()
    this.sqlHighlightMode = this.settings.getSqlHighlightMode()
    this.sqlHighlightColors = this.settings.getSqlHighlightColors()
    this.appLanguage = this.settings.getAppLanguage()
    this.appTheme = this.theme.getTheme()
    this.appLanguageOptions = this.language.languageOptions
    this.appThemeOptions = this.buildAppThemeOptions()
  }

  async ngOnInit(): Promise<void> {
    this.applyInitialTab()
    await Promise.all([
      this.loadConnections(),
      this.loadAiSettings()
    ])
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTab']) {
      this.applyInitialTab()
    }
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab = tab
  }

  get sqlFormatterCommaStyleOptions(): { value: SqlFormatterCommaStyle, label: string }[] {
    return [
      { value: 'trailing', label: this.t('settings.formatter.commaStyle.trailing') },
      { value: 'leading', label: this.t('settings.formatter.commaStyle.leading') }
    ]
  }

  get tableAutocompleteMatchModeOptions(): { value: TableAutocompleteMatchMode, label: string }[] {
    return [
      { value: 'contains', label: this.t('settings.autocomplete.matchMode.contains') },
      { value: 'fuzzy', label: this.t('settings.autocomplete.matchMode.fuzzy') }
    ]
  }

  get sqlHighlightOptions(): { value: SqlHighlightMode, label: string }[] {
    return [
      { value: 'dbolt-dark', label: this.t('settings.highlight.option.dboltDark') },
      { value: 'dbolt-high-contrast', label: this.t('settings.highlight.option.dboltHighContrast') },
      { value: 'classic-sql', label: this.t('settings.highlight.option.classicSql') },
      { value: 'vibrant', label: this.t('settings.highlight.option.vibrant') },
      { value: 'custom', label: this.t('settings.highlight.option.custom') }
    ]
  }

  get sqlHighlightColorFields(): { key: SqlHighlightColorKey, label: string }[] {
    return [
      { key: 'keyword', label: this.t('settings.highlight.color.keyword') },
      { key: 'function', label: this.t('settings.highlight.color.function') },
      { key: 'identifier', label: this.t('settings.highlight.color.identifier') },
      { key: 'string', label: this.t('settings.highlight.color.string') },
      { key: 'number', label: this.t('settings.highlight.color.number') },
      { key: 'comment', label: this.t('settings.highlight.color.comment') },
      { key: 'operator', label: this.t('settings.highlight.color.operator') },
      { key: 'type', label: this.t('settings.highlight.color.type') },
      { key: 'variable', label: this.t('settings.highlight.color.variable') },
      { key: 'delimiter', label: this.t('settings.highlight.color.delimiter') }
    ]
  }

  get settingsTitle(): string {
    if (this.activeTab === 'ai') return this.t('settings.ai.title')
    if (this.activeTab === 'language') return this.t('settings.language.title')
    if (this.activeTab === 'appearance') return this.t('settings.appearance.title')
    if (this.activeTab === 'connections') return this.t('settings.connections.title')
    if (this.activeTab === 'autocomplete') return this.t('settings.autocomplete.title')
    if (this.activeTab === 'highlight') return this.t('settings.highlight.title')

    return this.t('settings.query.title')
  }

  get aiModelOptions(): { [key: string]: string | number }[] {
    const options = this.modelOptionsForAiProvider(this.aiProvider)

    if (!this.aiModel || options.some((option) => option.value === this.aiModel)) {
      return options
    }

    return [
      { label: `${this.aiModel} (${this.t('aiAssistant.currentModel')})`, value: this.aiModel },
      ...options
    ]
  }

  onAppLanguageSelected(item: { [key: string]: string | number } | null): void {
    if (!item) return

    this.appLanguage = this.settings.appLanguageOptions
      .some((option) => option.value === item['value'])
      ? item['value'] as AppLanguage
      : this.settings.getAppLanguage()
    this.languageSavedMessage = ''
  }

  saveLanguageSettings(): void {
    this.appLanguage = this.language.setLanguage(this.appLanguage)
    this.appThemeOptions = this.buildAppThemeOptions()
    this.languageSavedMessage = this.t('settings.language.saved')
  }

  onAppThemeSelected(item: { [key: string]: string | number } | null): void {
    if (!item) return

    this.appTheme = this.settings.normalizeAppTheme(item['value'])
    this.themeSavedMessage = ''
  }

  saveThemeSettings(): void {
    this.appTheme = this.theme.setTheme(this.appTheme)
    this.themeSavedMessage = this.t('generic.saved')
  }

  onAiProviderSelected(item: { [key: string]: string | number } | null): void {
    const provider = this.normalizeAiProvider(item?.['value'])
    if (provider === this.aiProvider) return

    this.aiProvider = provider
    this.aiModel = this.defaultModelForAiProvider(provider)
    this.aiSettingsMessage = ''
    this.aiSettingsError = ''

    if (provider === 'openai') {
      this.aiBaseUrl = this.aiBaseUrl || DEFAULT_AI_BASE_URL
      this.aiCustomEndpointEnabled = this.aiBaseUrl !== DEFAULT_AI_BASE_URL
    } else if (provider === 'openrouter') {
      this.aiBaseUrl = DEFAULT_OPENROUTER_BASE_URL
      this.aiCustomEndpointEnabled = false
    } else {
      this.aiCustomEndpointEnabled = false
    }
  }

  onAiModelSelected(item: { [key: string]: string | number } | null): void {
    const value = item?.['value']
    this.aiModel = typeof value === 'string' ? value : this.defaultModelForAiProvider(this.aiProvider)
    this.aiSettingsMessage = ''
  }

  onAiModelInput(event: Event): void {
    this.aiModel = (event.target as HTMLInputElement).value
    this.aiSettingsMessage = ''
  }

  onAiCustomEndpointChanged(event: Event): void {
    this.aiCustomEndpointEnabled = (event.target as HTMLInputElement).checked
    this.aiSettingsMessage = ''

    if (!this.aiCustomEndpointEnabled) {
      this.aiBaseUrl = DEFAULT_AI_BASE_URL
    }
  }

  onAiBaseUrlInput(event: Event): void {
    this.aiBaseUrl = (event.target as HTMLInputElement).value
    this.aiSettingsMessage = ''
  }

  onAiApiKeyInput(provider: AiAssistantProvider, event: Event): void {
    this.aiApiKeys = {
      ...this.aiApiKeys,
      [provider]: (event.target as HTMLInputElement).value
    }
    this.aiSettingsMessage = ''
  }

  onAiLimitInput(key: keyof AiAssistantLimits, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    this.aiLimits = {
      ...this.aiLimits,
      [key]: this.normalizeAiLimit(key, value)
    }
    this.aiSettingsMessage = ''
  }

  getAiApiKeyPlaceholder(provider: AiAssistantProvider): string {
    return this.hasAiApiKeyForProvider(provider)
      ? this.t('settings.ai.apiKeys.configured')
      : this.t('settings.ai.apiKeys.placeholder')
  }

  hasAiApiKeyForProvider(provider: AiAssistantProvider): boolean {
    return Boolean(this.aiSettings?.hasApiKeys?.[provider])
  }

  async saveAiSettings(): Promise<void> {
    this.aiSettingsSaving = true
    this.aiSettingsMessage = ''
    this.aiSettingsError = ''

    try {
      const apiKeys: Partial<Record<AiAssistantProvider, string>> = {}

      this.aiApiKeyFields.forEach((field) => {
        const apiKey = this.aiApiKeys[field.provider].trim()
        if (apiKey) {
          apiKeys[field.provider] = apiKey
        }
      })

      const settings = await this.aiSettingsService.saveSettings({
        provider: this.aiProvider,
        model: this.aiModel.trim(),
        baseUrl: this.aiProviderNeedsBaseUrl(this.aiProvider) ? this.aiBaseUrl.trim() : undefined,
        apiKeys,
        limits: this.sanitizeAiLimits(this.aiLimits)
      })

      this.applyAiSettings(settings)
      this.aiSettingsSaved.emit(settings)
      this.aiSettingsMessage = this.t('generic.saved')
    } catch (error: unknown) {
      this.aiSettingsError = this.getErrorMessage(error, this.t('settings.ai.saveFailed'))
    } finally {
      this.aiSettingsSaving = false
    }
  }

  async removeAiApiKey(provider: AiAssistantProvider): Promise<void> {
    if (this.aiSettingsSaving || this.aiSettingsLoading || this.aiRemovingApiKey) return

    const persistedSettings = this.aiSettings
    const persistedProvider = persistedSettings?.provider || this.aiProvider

    this.aiRemovingApiKey = provider
    this.aiSettingsMessage = ''
    this.aiSettingsError = ''

    try {
      const settings = await this.aiSettingsService.saveSettings({
        provider: persistedProvider,
        model: persistedSettings?.model || this.defaultModelForAiProvider(persistedProvider),
        baseUrl: this.aiProviderNeedsBaseUrl(persistedProvider)
          ? persistedSettings?.baseUrl || this.defaultBaseUrlForAiProvider(persistedProvider)
          : undefined,
        clearApiKeys: { [provider]: true },
        limits: persistedSettings?.limits || DEFAULT_AI_LIMITS
      })

      this.applyAiSettings(settings)
      this.aiSettingsSaved.emit(settings)
      this.aiSettingsMessage = this.t('settings.ai.apiKeys.removed')
    } catch (error: unknown) {
      this.aiSettingsError = this.getErrorMessage(error, this.t('settings.ai.saveFailed'))
    } finally {
      this.aiRemovingApiKey = null
    }
  }

  get isCustomSqlHighlight(): boolean {
    return this.sqlHighlightMode === 'custom'
  }

  get requiresDefaultDatabase(): boolean {
    return ['MySQL', 'Postgres', 'SqlServer'].includes(this.selectedConnection?.database || '')
  }

  get requiresDefaultSchema(): boolean {
    return ['Hana', 'Postgres', 'SqlServer'].includes(this.selectedConnection?.database || '')
  }

  get currentDefaultTarget(): string {
    if (!this.selectedConnection?.defaultDatabase && !this.selectedConnection?.defaultSchema) {
      return this.t('settings.connections.noDefaultTarget')
    }

    return [
      this.selectedConnection.defaultDatabase,
      this.selectedConnection.defaultSchema
    ].filter(Boolean).join(' / ')
  }

  onDefaultRowsInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.defaultQueryRows = Math.max(1, Math.floor(value))
    this.savedMessage = ''
  }

  saveDefaultRows(): void {
    const settings = this.settings.setDefaultQueryRows(this.defaultQueryRows)
    this.defaultQueryRows = settings.defaultQueryRows
    this.savedMessage = this.t('generic.saved')
  }

  onConnectionExpirationInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.connectionExpirationMinutes = Math.max(1, Math.floor(value))
    this.expirationSavedMessage = ''
  }

  saveConnectionExpiration(): void {
    const settings = this.settings.setConnectionExpirationMinutes(this.connectionExpirationMinutes)
    this.connectionExpirationMinutes = settings.connectionExpirationMinutes
    this.expirationSavedMessage = this.t('generic.saved')
  }

  onSqlSyntaxValidationChange(event: Event): void {
    this.sqlSyntaxValidationEnabled = (event.target as HTMLInputElement).checked
    this.syntaxValidationSavedMessage = ''
  }

  saveSqlSyntaxValidationSettings(): void {
    const settings = this.settings.setSqlSyntaxValidationEnabled(this.sqlSyntaxValidationEnabled)
    this.sqlSyntaxValidationEnabled = settings.sqlSyntaxValidationEnabled
    this.syntaxValidationSavedMessage = this.t('generic.saved')
  }

  onSqlFormatterIndentInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.sqlFormatterIndentSize = Math.min(Math.max(1, Math.floor(value)), 8)
    this.formatterSavedMessage = ''
  }

  onSqlFormatterUppercaseChange(event: Event): void {
    this.sqlFormatterUppercaseKeywords = (event.target as HTMLInputElement).checked
    this.formatterSavedMessage = ''
  }

  onSqlFormatterCommaStyleSelected(item: { [key: string]: string | number } | null): void {
    if (!item) return

    this.sqlFormatterCommaStyle = this.settings.normalizeSqlFormatterCommaStyle(item['value'])
    this.formatterSavedMessage = ''
  }

  onSqlFormatterBlankLineChange(event: Event): void {
    this.sqlFormatterBlankLineBetweenStatements = (event.target as HTMLInputElement).checked
    this.formatterSavedMessage = ''
  }

  onSqlFormatterIndentCreateBodyChange(event: Event): void {
    this.sqlFormatterIndentCreateBody = (event.target as HTMLInputElement).checked
    this.formatterSavedMessage = ''
  }

  saveSqlFormatterSettings(): void {
    const settings = this.settings.setSqlFormatterSettings(
      this.sqlFormatterIndentSize,
      this.sqlFormatterUppercaseKeywords,
      this.sqlFormatterCommaStyle,
      this.sqlFormatterBlankLineBetweenStatements,
      this.sqlFormatterIndentCreateBody
    )
    this.sqlFormatterIndentSize = settings.sqlFormatterIndentSize
    this.sqlFormatterUppercaseKeywords = settings.sqlFormatterUppercaseKeywords
    this.sqlFormatterCommaStyle = settings.sqlFormatterCommaStyle
    this.sqlFormatterBlankLineBetweenStatements = settings.sqlFormatterBlankLineBetweenStatements
    this.sqlFormatterIndentCreateBody = settings.sqlFormatterIndentCreateBody
    this.formatterSavedMessage = this.t('generic.saved')
  }

  onSqlHighlightColorInput(key: SqlHighlightColorKey, event: Event): void {
    this.sqlHighlightColors = {
      ...this.sqlHighlightColors,
      [key]: (event.target as HTMLInputElement).value
    }
    this.sqlHighlightMode = 'custom'
    this.highlightSavedMessage = ''
  }

  onSqlHighlightModeSelected(item: { [key: string]: string | number } | null): void {
    if (!item) return

    this.sqlHighlightMode = this.settings.normalizeSqlHighlightMode(item['value'])

    if (this.sqlHighlightMode !== 'custom') {
      this.sqlHighlightColors = this.settings.getSqlHighlightPresetColors(this.sqlHighlightMode)
    }

    this.highlightSavedMessage = ''
  }

  saveSqlHighlightSettings(): void {
    const settings = this.sqlHighlightMode === 'custom'
      ? this.settings.setSqlHighlightColors(this.sqlHighlightColors)
      : this.settings.setSqlHighlightMode(this.sqlHighlightMode)

    this.sqlHighlightMode = settings.sqlHighlightMode
    this.sqlHighlightColors = settings.sqlHighlightColors
    this.highlightSavedMessage = this.t('generic.saved')
  }

  onTableAutocompleteChange(event: Event): void {
    this.tableAutocompleteEnabled = (event.target as HTMLInputElement).checked
    this.tableAutocompleteSavedMessage = ''
  }

  onTableAutocompleteMatchModeSelected(item: { [key: string]: string | number } | null): void {
    if (!item) return

    this.tableAutocompleteMatchMode = this.settings.normalizeTableAutocompleteMatchMode(item['value'])
    this.tableMatchModeSavedMessage = ''
  }

  onColumnAutocompleteChange(event: Event): void {
    this.columnAutocompleteEnabled = (event.target as HTMLInputElement).checked
    this.columnAutocompleteSavedMessage = ''
  }

  onAutoQuoteCapitalizedColumnsChange(event: Event): void {
    this.autoQuoteCapitalizedColumns = (event.target as HTMLInputElement).checked
    this.autoQuoteCapitalizedColumnsSavedMessage = ''
  }

  saveTableAutocompleteSettings(): void {
    const settings = this.settings.setTableAutocompleteEnabled(this.tableAutocompleteEnabled)
    this.tableAutocompleteEnabled = settings.tableAutocompleteEnabled
    this.tableAutocompleteSavedMessage = this.t('generic.saved')
  }

  saveTableMatchModeSettings(): void {
    const settings = this.settings.setTableAutocompleteMatchMode(this.tableAutocompleteMatchMode)
    this.tableAutocompleteMatchMode = settings.tableAutocompleteMatchMode
    this.tableMatchModeSavedMessage = this.t('generic.saved')
  }

  saveColumnAutocompleteSettings(): void {
    const settings = this.settings.setColumnAutocompleteEnabled(this.columnAutocompleteEnabled)
    this.columnAutocompleteEnabled = settings.columnAutocompleteEnabled
    this.columnAutocompleteSavedMessage = this.t('generic.saved')
  }

  saveAutoQuoteCapitalizedColumnsSettings(): void {
    const settings = this.settings.setAutoQuoteCapitalizedColumns(this.autoQuoteCapitalizedColumns)
    this.autoQuoteCapitalizedColumns = settings.autoQuoteCapitalizedColumns
    this.autoQuoteCapitalizedColumnsSavedMessage = this.t('generic.saved')
  }

  onConnectionSelected(item: { [key: string]: string | number } | null): void {
    this.connectionMessage = ''
    this.connectionError = ''
    this.targetOptionsLoaded = false
    this.schemaOptions = []
    this.defaultDatabaseList = []
    this.defaultSchemaList = []

    if (!item) {
      this.selectedConnection = null
      this.selectedDefaultDatabase = ''
      this.selectedDefaultSchema = ''
      return
    }

    this.selectedConnection = this.connections.find((connection) => connection.id === Number(item['id'])) || null
    this.selectedDefaultDatabase = this.selectedConnection?.defaultDatabase || ''
    this.selectedDefaultSchema = this.selectedConnection?.defaultSchema || ''
  }

  async loadConnectionTargets(): Promise<void> {
    if (!this.selectedConnection) return

    LoadingComponent.show(this.t('settings.connections.loadingTargets'))
    this.connectionMessage = ''
    this.connectionError = ''

    try {
      const connectionKey = `settings-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const connectionResult: any = await this.IAPI.post(
        `/api/${this.selectedConnection.database}/${this.selectedConnection.version}/connect`,
        {
          host: this.selectedConnection.host,
          port: this.selectedConnection.port,
          user: this.selectedConnection.user,
          password: this.selectedConnection.password,
          connectionKey
        }
      )

      if (connectionResult?.success === false) {
        throw new Error(connectionResult.error || connectionResult.message || this.t('settings.connections.connectionFailed'))
      }

      const response: any = await this.IAPI.get(
        `/api/${this.selectedConnection.database}/${this.selectedConnection.version}/list-databases-and-schemas?connectionKey=${encodeURIComponent(connectionKey)}`
      )

      if (response?.success === false) {
        throw new Error(response.error || response.message || this.t('settings.connections.loadTargetsFailed'))
      }

      this.schemaOptions = response.data || []
      this.defaultDatabaseList = this.schemaOptions.map((item: any) => ({ name: item.database }))

      if (!this.requiresDefaultDatabase && this.schemaOptions[0]) {
        this.selectedDefaultDatabase = this.schemaOptions[0].database
      }

      this.refreshSchemaList()
      this.targetOptionsLoaded = true
    } catch (error: any) {
      console.error(error)
      this.connectionError = error?.error || error?.message || this.t('settings.connections.loadTargetsFailed')
    } finally {
      LoadingComponent.hide()
    }
  }

  onDefaultDatabaseSelected(item: { [key: string]: string | number } | null): void {
    this.selectedDefaultDatabase = item?.['name']?.toString() || ''
    this.selectedDefaultSchema = ''
    this.refreshSchemaList()
  }

  onDefaultSchemaSelected(item: { [key: string]: string | number } | null): void {
    this.selectedDefaultSchema = item?.['name']?.toString() || ''
  }

  async saveConnectionTarget(): Promise<void> {
    if (!this.selectedConnection) return

    LoadingComponent.show(this.t('settings.connections.savingDefaults'))

    try {
      this.validateSelectedTarget()

      const updatedConnection = await this.connectionsService.updateConnection(this.selectedConnection.id, {
        name: this.selectedConnection.name,
        database: this.selectedConnection.database,
        version: this.selectedConnection.version,
        databaseVersion: this.selectedConnection.databaseVersion,
        host: this.selectedConnection.host,
        port: this.selectedConnection.port,
        user: this.selectedConnection.user,
        password: this.selectedConnection.password,
        defaultDatabase: this.requiresDefaultDatabase ? this.selectedDefaultDatabase || undefined : undefined,
        defaultSchema: this.requiresDefaultSchema ? this.selectedDefaultSchema || undefined : undefined
      })

      this.selectedConnection = updatedConnection
      await this.loadConnections()
      this.connectionMessage = this.t('generic.saved')
      this.connectionError = ''
    } catch (error: any) {
      console.error(error)
      this.connectionMessage = ''
      this.connectionError = error?.error || error?.message || this.t('settings.connections.saveDefaultsFailed')
    } finally {
      LoadingComponent.hide()
    }
  }

  async clearConnectionTarget(): Promise<void> {
    if (!this.selectedConnection) return

    this.selectedDefaultDatabase = ''
    this.selectedDefaultSchema = ''
    await this.saveConnectionTarget()
  }

  private async loadAiSettings(): Promise<void> {
    this.aiSettingsLoading = true
    this.aiSettingsError = ''

    try {
      this.applyAiSettings(await this.aiSettingsService.loadSettings())
    } catch (error: unknown) {
      this.aiSettingsError = this.getErrorMessage(error, this.t('settings.ai.loadFailed'))
    } finally {
      this.aiSettingsLoading = false
    }
  }

  private applyAiSettings(settings: AiAssistantSettings): void {
    this.aiSettings = settings
    this.aiProvider = settings.provider
    this.aiModel = settings.model || this.defaultModelForAiProvider(settings.provider)
    this.aiBaseUrl = settings.baseUrl || this.defaultBaseUrlForAiProvider(settings.provider)
    this.aiCustomEndpointEnabled = settings.provider === 'openai' && this.aiBaseUrl !== DEFAULT_AI_BASE_URL
    this.aiApiKeys = {
      openai: '',
      gemini: '',
      anthropic: '',
      openrouter: ''
    }
    this.aiLimits = this.sanitizeAiLimits(settings.limits || DEFAULT_AI_LIMITS)
  }

  private async loadConnections(): Promise<void> {
    this.connections = await this.connectionsService.loadConnections()
    this.connectionOptions = this.connections.map((connection) => ({
      id: connection.id,
      label: `${connection.name} (${connection.database})`
    }))
  }

  private refreshSchemaList(): void {
    const selectedDatabase = this.requiresDefaultDatabase
      ? this.selectedDefaultDatabase
      : this.schemaOptions[0]?.database

    const databaseInfo = this.schemaOptions.find((item: any) => item.database === selectedDatabase)
    this.defaultSchemaList = (databaseInfo?.schemas || []).map((schema: string) => ({ name: schema }))
  }

  private validateSelectedTarget(): void {
    if (!this.targetOptionsLoaded && (this.selectedDefaultDatabase || this.selectedDefaultSchema)) {
      throw new Error(this.t('settings.connections.loadBeforeSaving'))
    }

    if (this.requiresDefaultDatabase && this.selectedDefaultDatabase) {
      const databaseExists = this.defaultDatabaseList.some((database) => database.name === this.selectedDefaultDatabase)
      if (!databaseExists) {
        throw new Error(this.t('settings.connections.databaseMissing'))
      }
    }

    if (this.requiresDefaultSchema && this.selectedDefaultSchema) {
      const schemaExists = this.defaultSchemaList.some((schema) => schema.name === this.selectedDefaultSchema)
      if (!schemaExists) {
        throw new Error(this.t('settings.connections.schemaMissing'))
      }
    }
  }

  private applyInitialTab(): void {
    if (this.isSettingsTab(this.initialTab)) {
      this.activeTab = this.initialTab
    }
  }

  private isSettingsTab(value: unknown): value is SettingsTab {
    return value === 'query' ||
      value === 'connections' ||
      value === 'autocomplete' ||
      value === 'highlight' ||
      value === 'appearance' ||
      value === 'language' ||
      value === 'ai'
  }

  private defaultModelForAiProvider(provider: AiAssistantProvider): string {
    if (provider === 'anthropic') {
      return 'claude-sonnet-4-6'
    }

    if (provider === 'openrouter') {
      return '~openai/gpt-latest'
    }

    return provider === 'gemini' ? 'gemini-3.5-flash' : 'gpt-5.4-mini'
  }

  private buildAppThemeOptions(): { value: AppTheme, label: string }[] {
    return [
      { value: 'dark', label: this.t('settings.appearance.theme.dark') },
      { value: 'light', label: this.t('settings.appearance.theme.light') }
    ]
  }

  private defaultBaseUrlForAiProvider(provider: AiAssistantProvider): string {
    return provider === 'openrouter' ? DEFAULT_OPENROUTER_BASE_URL : DEFAULT_AI_BASE_URL
  }

  private aiProviderNeedsBaseUrl(provider: AiAssistantProvider): boolean {
    return provider === 'openai' || provider === 'openrouter'
  }

  private modelOptionsForAiProvider(provider: AiAssistantProvider): { label: string, value: string }[] {
    if (provider === 'openrouter') {
      return []
    }

    if (provider === 'anthropic') {
      return this.anthropicModelOptions
    }

    return provider === 'gemini'
      ? this.geminiModelOptions
      : this.openAiModelOptions
  }

  private normalizeAiProvider(value: string | number | undefined): AiAssistantProvider {
    if (value === 'gemini' || value === 'anthropic' || value === 'openrouter') {
      return value
    }

    return 'openai'
  }

  private sanitizeAiLimits(limits: Partial<AiAssistantLimits>): AiAssistantLimits {
    return {
      maxApiCallsPerMessage: this.normalizeAiLimit('maxApiCallsPerMessage', limits.maxApiCallsPerMessage),
      maxDatabaseRequestsPerMessage: this.normalizeAiLimit('maxDatabaseRequestsPerMessage', limits.maxDatabaseRequestsPerMessage),
      maxDatabaseRequestsPerApiCall: this.normalizeAiLimit('maxDatabaseRequestsPerApiCall', limits.maxDatabaseRequestsPerApiCall),
      maxContextMessages: this.normalizeAiLimit('maxContextMessages', limits.maxContextMessages),
      maxToolResultChars: this.normalizeAiLimit('maxToolResultChars', limits.maxToolResultChars),
      maxToolTranscriptChars: this.normalizeAiLimit('maxToolTranscriptChars', limits.maxToolTranscriptChars)
    }
  }

  private normalizeAiLimit(key: keyof AiAssistantLimits, value: unknown): number {
    const ranges: Record<keyof AiAssistantLimits, { fallback: number, min: number, max: number }> = {
      maxApiCallsPerMessage: { fallback: DEFAULT_AI_LIMITS.maxApiCallsPerMessage, min: 1, max: 10 },
      maxDatabaseRequestsPerMessage: { fallback: DEFAULT_AI_LIMITS.maxDatabaseRequestsPerMessage, min: 0, max: 20 },
      maxDatabaseRequestsPerApiCall: { fallback: DEFAULT_AI_LIMITS.maxDatabaseRequestsPerApiCall, min: 1, max: 5 },
      maxContextMessages: { fallback: DEFAULT_AI_LIMITS.maxContextMessages, min: 1, max: 20 },
      maxToolResultChars: { fallback: DEFAULT_AI_LIMITS.maxToolResultChars, min: 1000, max: 50000 },
      maxToolTranscriptChars: { fallback: DEFAULT_AI_LIMITS.maxToolTranscriptChars, min: 4000, max: 100000 }
    }
    const range = ranges[key]
    const numberValue = Number(value)

    if (!Number.isFinite(numberValue)) {
      return range.fallback
    }

    return Math.min(Math.max(Math.floor(numberValue), range.min), range.max)
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>
      const message = record['message']
      const detail = record['error']

      if (typeof detail === 'string' && detail.trim()) return detail
      if (typeof message === 'string' && message.trim()) return message
    }

    return fallback
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
