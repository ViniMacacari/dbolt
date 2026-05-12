import { CommonModule } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import {
  AppSettingsService,
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

type SettingsTab = 'query' | 'connections' | 'autocomplete' | 'highlight' | 'language'

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, InputListComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
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
  readonly appLanguageOptions: { value: AppLanguage, label: string }[]
  savedMessage: string = ''
  expirationSavedMessage: string = ''
  syntaxValidationSavedMessage: string = ''
  formatterSavedMessage: string = ''
  highlightSavedMessage: string = ''
  languageSavedMessage: string = ''
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

  constructor(
    private settings: AppSettingsService,
    private connectionsService: ConnectionsService,
    private IAPI: InternalApiService,
    private language: AppLanguageService
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
    this.appLanguageOptions = this.language.languageOptions
  }

  async ngOnInit(): Promise<void> {
    await this.loadConnections()
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
    if (this.activeTab === 'language') return this.t('settings.language.title')
    if (this.activeTab === 'connections') return this.t('settings.connections.title')
    if (this.activeTab === 'autocomplete') return this.t('settings.autocomplete.title')
    if (this.activeTab === 'highlight') return this.t('settings.highlight.title')

    return this.t('settings.query.title')
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
    this.languageSavedMessage = this.t('settings.language.saved')
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

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
