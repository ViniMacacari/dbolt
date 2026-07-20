import { Component, ViewChild, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ActivatedRoute } from '@angular/router'
import { SidebarComponent, SidebarLayoutChange } from "../../components/sidebar/sidebar.component"
import { TabsComponent } from "../../components/tabs/tabs.component"
import { LoadingComponent } from '../../components/modal/loading/loading.component'
import { CodeEditorComponent } from "../../components/elements/code-editor/code-editor.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { DbInfoComponent } from "../../components/elements/db-info/db-info.component"
import { ToastComponent } from "../../components/toast/toast.component"
import { TableInfoComponent } from "../../components/elements/table-info/table-info.component"
import { ConnectionsService } from '../../services/resolve-connections/connections.service'
import { ConnectionContextService } from '../../services/connection-context/connection-context.service'
import { SettingsComponent } from '../../components/elements/settings/settings.component'
import { QueryAssistantComponent } from '../../components/elements/query-assistant/query-assistant.component'
import { SelectBuilderComponent } from '../../components/elements/select-builder/select-builder.component'
import { ProcedureInfoComponent } from '../../components/elements/procedure-info/procedure-info.component'
import { QueryVersionCompareComponent } from '../../components/elements/query-version-compare/query-version-compare.component'
import { QuerySaveService, SavedQuery } from '../../services/query-save/query-save.service'
import { AppLanguageService } from '../../services/language/app-language.service'
import { AiAssistantPanelComponent } from '../../components/ai-assistant/ai-assistant-panel/ai-assistant-panel.component'

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent, TabsComponent, ProcedureInfoComponent, CodeEditorComponent, QueryVersionCompareComponent, CommonModule, DbInfoComponent, ToastComponent, TableInfoComponent, SettingsComponent, QueryAssistantComponent, SelectBuilderComponent, AiAssistantPanelComponent],
  templateUrl: './database-manager.component.html',
  styleUrl: './database-manager.component.scss'
})
export class DatabaseManagerComponent {
  @ViewChild(TabsComponent) tabsComponent!: TabsComponent
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(AiAssistantPanelComponent) aiAssistantPanel?: AiAssistantPanelComponent
  @Output() dbInfo = new EventEmitter<any>()

  activeConnection: any = {}
  databasesSchemasActiveConnections: any = []
  connections: any[] = []
  selectedSchemaDB: any

  dbSchemasData: any
  tableInfoData: any
  procedureInfoData: any

  firstMessage: boolean = true
  recentQueries: SavedQuery[] = []
  loadingRecentQueries: boolean = false
  dbInfoOpen: boolean = false
  tableInfoOpen: boolean = false
  procedureInfoOpen: boolean = false
  editorOpen: boolean = false
  settingsOpen: boolean = false
  queryAssistantOpen: boolean = false
  selectBuilderOpen: boolean = false
  queryCompareOpen: boolean = false
  aiAssistantOpen: boolean = false
  dbInfoInitialized: boolean = false
  tableInfoInitialized: boolean = false
  procedureInfoInitialized: boolean = false
  settingsInitialized: boolean = false

  sqlContent: string = ''
  tabInfo: any
  dbInfoTabInfo: any
  tableInfoTabInfo: any
  procedureInfoTabInfo: any

  elementName: string = ''
  procedureElementName: string = ''

  widthTable: number = 300

  constructor(
    private IAPI: InternalApiService,
    private route: ActivatedRoute,
    private dbSchemaService: GetDbschemaService,
    private connectionsService: ConnectionsService,
    private connectionContext: ConnectionContextService,
    private querySave: QuerySaveService,
    private language: AppLanguageService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    LoadingComponent.show()
    await this.firstConnectionConfig()
    await this.pageConnectionConfig()
    LoadingComponent.hide()
    void this.loadRecentQueries()
  }

  getPageId() {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    return routeParamId
  }

  async firstConnectionConfig(): Promise<void> {
    try {
      this.activeConnection = [await this.connectionsService.getConnectionById(this.getPageId())]
    } catch (error: any) {
      this.toast.showToast(error.message, 'danger')
      console.error(error)
    }
  }

  async pageConnectionConfig(): Promise<void> {
    if (!this.databasesSchemasActiveConnections) {
      this.databasesSchemasActiveConnections = { info: [], data: [] }
    }

    if (!this.databasesSchemasActiveConnections.info) {
      this.databasesSchemasActiveConnections.info = []
    }
    if (!this.databasesSchemasActiveConnections.data) {
      this.databasesSchemasActiveConnections.data = []
    }

    try {
      this.connections = await this.connectionsService.loadConnections()

      if (!this.activeConnection || !this.activeConnection[0]) {
        console.warn('Conexão ativa não definida ou inválida.')
        return
      }

      const activeConn = this.activeConnection[0]

      const existingConnection = this.databasesSchemasActiveConnections.info.find(
        (info: any) => info.host === activeConn.host && info.port === activeConn.port
      )

      if (!existingConnection) {
        this.databasesSchemasActiveConnections.info.push({
          id: activeConn.id,
          host: activeConn.host,
          port: activeConn.port,
          database: activeConn.database,
          name: activeConn.name,
          version: activeConn.version,
          sgbd: activeConn.database
        })
      }

      const result: any = await this.IAPI.get(
        `/api/${activeConn.database}/${activeConn.version}/list-databases-and-schemas`
      )

      if (result.success && result.data) {
        result.data.forEach((db: any) => {
          const exists = this.databasesSchemasActiveConnections.data.find(
            (item: any) =>
              item.database === db.database &&
              item.host === activeConn.host &&
              item.port === activeConn.port
          )

          if (!exists) {
            this.databasesSchemasActiveConnections.data.push({
              host: activeConn.host,
              port: activeConn.port,
              version: activeConn.version,
              sgbd: activeConn.database,
              database: db.database,
              schemas: db.schemas,
              connected: true
            })
          }
        })

        await this.loadInitSelectedSchemaAndDB()
      } else {
        console.error('Erro ao carregar os schemas:', result.message)
      }
    } catch (error: any) {
      console.error('Erro ao configurar conexão e carregar schemas:', error)
      this.toast.showToast(error.error, 'red')
    }
  }

  async loadInitSelectedSchemaAndDB(): Promise<void> {
    LoadingComponent.show()

    const activeConnection = this.activeConnection[0]
    const database = activeConnection.database
    const version = this.databasesSchemasActiveConnections.data[0].version
    const defaultTarget = this.resolveConnectionDefaultTarget(activeConnection)
    let result: any

    if (defaultTarget) {
      const schemaResult: any = await this.IAPI.post(`/api/${database}/${version}/set-schema`, {
        database: defaultTarget.database,
        schema: defaultTarget.schema
      })

      if (schemaResult?.success === false) {
        throw new Error(schemaResult.error || schemaResult.message || this.t('workspace.applyDefaultTargetError'))
      }

      result = {
        database: defaultTarget.database,
        schema: defaultTarget.schema
      }
    } else {
      result = await this.IAPI.get(`/api/${database}/${version}/get-selected-schema`)
    }

    this.selectedSchemaDB = {
      database: result.database,
      schema: result.schema,
      sgbd: this.databasesSchemasActiveConnections.data[0].sgbd,
      version: activeConnection.version,
      name: activeConnection.name,
      host: activeConnection.host,
      port: activeConnection.port,
      connId: activeConnection.id
    }

    this.dbSchemaService.setSelectedSchemaDB(this.selectedSchemaDB)

    LoadingComponent.hide()
  }

  private resolveConnectionDefaultTarget(connection: any): any | null {
    if (!connection?.defaultDatabase && !connection?.defaultSchema) {
      return null
    }

    const availableDatabases = (this.databasesSchemasActiveConnections.data || []).filter((item: any) =>
      item.sgbd === connection.database &&
      item.host === connection.host &&
      String(item.port) === String(connection.port)
    )

    if (availableDatabases.length === 0) {
      return null
    }

    const databaseEntry = connection.defaultDatabase
      ? availableDatabases.find((item: any) => item.database === connection.defaultDatabase)
      : availableDatabases[0]

    if (!databaseEntry) {
      return null
    }

    const schema = connection.defaultSchema || databaseEntry.schemas?.[0]
    if (connection.defaultSchema && !databaseEntry.schemas?.includes(connection.defaultSchema)) {
      return null
    }

    return {
      database: databaseEntry.database,
      schema
    }
  }

  onTabSelected(tab: any): void {
    if (tab?.dbInfo) {
      this.selectedSchemaDB = tab.dbInfo
      this.dbSchemaService.setSelectedSchemaDB(tab.dbInfo)
    }

    this.firstMessage = false
    this.tabInfo = tab
    this.sqlContent = tab.info?.sql || ''

    this.editorOpen = tab.type === 'sql'
    this.dbInfoOpen = tab.type === 'schema'
    this.settingsOpen = tab.type === 'settings'
    this.queryAssistantOpen = tab.type === 'query-assistant'
    this.selectBuilderOpen = tab.type === 'select-builder'
    this.queryCompareOpen = tab.type === 'query-compare'
    this.procedureInfoOpen = tab.type === 'procedure'
    this.tableInfoOpen = !this.editorOpen &&
      !this.dbInfoOpen &&
      !this.settingsOpen &&
      !this.queryAssistantOpen &&
      !this.selectBuilderOpen &&
      !this.queryCompareOpen &&
      !this.procedureInfoOpen

    if (this.dbInfoOpen) {
      this.dbInfoInitialized = true
      this.dbInfoTabInfo = tab
      this.dbSchemasData = tab.info.dbInfo
    }

    if (this.settingsOpen) {
      this.settingsInitialized = true
    }

    if (this.tableInfoOpen) {
      this.tableInfoInitialized = true
      this.tableInfoTabInfo = tab
      this.elementName = tab.info.name
      this.tableInfoData = tab.info.info
    }

    if (this.procedureInfoOpen) {
      this.procedureInfoInitialized = true
      this.procedureInfoTabInfo = tab
      this.procedureElementName = tab.info.name
      this.procedureInfoData = tab.info.info
    }
  }

  onTabClosed(event: any): void {
    const tab = event?.tab || event

    if (tab?.type === 'settings') {
      this.settingsInitialized = false
    }

    if (event?.hasTabs) {
      return
    }

    this.firstMessage = true
    this.tabInfo = null
    this.editorOpen = false
    this.dbInfoOpen = false
    this.tableInfoOpen = false
    this.procedureInfoOpen = false
    this.settingsOpen = false
    this.queryAssistantOpen = false
    this.selectBuilderOpen = false
    this.queryCompareOpen = false
    void this.loadRecentQueries()
  }

  openNewQueryFromHome(): void {
    this.tabsComponent.newTab('sql', {
      sql: '',
      context: this.selectedSchemaDB
    }, this.t('tabs.newQuery'))
  }

  openLatestQuery(): void {
    const latestQuery = this.recentQueries[0]
    if (!latestQuery) {
      this.openQueryLibrary()
      return
    }

    this.openRecentQuery(latestQuery)
  }

  openRecentQuery(query: SavedQuery): void {
    this.tabsComponent.openSavedQueryTab(query)
  }

  openQueryLibrary(): void {
    this.tabsComponent.loadTab()
  }

  formatRecentQueryDate(value?: string): string {
    return this.querySave.formatDate(value)
  }

  trackRecentQuery(index: number, query: SavedQuery): number {
    return query.id
  }

  private async loadRecentQueries(): Promise<void> {
    if (this.loadingRecentQueries) return

    this.loadingRecentQueries = true

    try {
      const queries = await this.querySave.loadQueries()
      this.recentQueries = [...(queries || [])]
        .sort((left, right) => this.getQueryTimestamp(right) - this.getQueryTimestamp(left))
        .slice(0, 4)
    } catch (error) {
      console.error('Erro ao carregar queries recentes:', error)
      this.recentQueries = []
    } finally {
      this.loadingRecentQueries = false
    }
  }

  private getQueryTimestamp(query: SavedQuery): number {
    const value = query.updatedAt || query.createdAt
    const timestamp = value ? new Date(value).getTime() : 0
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  onSettingsRequested(): void {
    this.tabsComponent.openSettingsTab()
  }

  onAiSettingsRequested(): void {
    this.tabsComponent.openSettingsTab('ai')
  }

  onAiSettingsSaved(): void {
    if (this.aiAssistantOpen) {
      void this.aiAssistantPanel?.loadSettings()
    }
  }

  openAiAssistant(): void {
    this.aiAssistantOpen = true
  }

  closeAiAssistant(): void {
    this.aiAssistantOpen = false
  }

  async onSqlScriptRequested(event: any): Promise<void> {
    LoadingComponent.show(this.t('workspace.openingSqlScript'))

    try {
      const context = await this.connectionContext.ensureContext(
        this.connectionContext.createContext(this.normalizeContextInput(event), true)
      )

      this.selectedSchemaDB = context
      this.dbSchemaService.setSelectedSchemaDB(context)

      this.tabsComponent.newTab('sql', {
        sql: '',
        context
      }, this.getSqlScriptName(context))
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || this.t('workspace.openSqlScriptError'), 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async onContextConnectionRequested(event: any): Promise<void> {
    LoadingComponent.show(event?.forceReconnect ? this.t('workspace.reconnecting') : this.t('workspace.connecting'))

    try {
      await this.applySelectedSchemaContext(event?.context, event?.forceReconnect)
      this.toast.showToast(event?.forceReconnect ? this.t('workspace.reconnectedSuccessfully') : this.t('workspace.connectedSuccessfully'), 'green')
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || this.t('workspace.connectError'), 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  onSelectBuilderRequested(event: any): void {
    this.tabsComponent.openSelectBuilderTab(event?.context || this.tabInfo?.dbInfo || this.selectedSchemaDB)
  }

  onBuilderQueryRequested(event: any): void {
    this.tabsComponent.newTab('sql', {
      sql: event.sql,
      context: event?.context || this.tabInfo?.dbInfo || this.selectedSchemaDB
    }, event?.name || this.t('workspace.builtSelect'))
  }

  get openTabs(): any[] {
    return (this.tabsComponent?.tabs || []).filter((tab: any) => tab?.type === 'sql')
  }

  get openSchemaTabs(): any[] {
    return (this.tabsComponent?.tabs || []).filter((tab: any) => tab?.type === 'schema')
  }

  get openTableTabs(): any[] {
    return (this.tabsComponent?.tabs || []).filter((tab: any) => tab?.type === 'table')
  }

  get openProcedureTabs(): any[] {
    return (this.tabsComponent?.tabs || []).filter((tab: any) => tab?.type === 'procedure')
  }

  isActiveSqlTab(tab: any): boolean {
    return tab?.type === 'sql' && this.tabsComponent?.getActiveTab() === tab
  }

  isActiveContentTab(tab: any): boolean {
    return this.tabsComponent?.getActiveTab() === tab
  }

  trackTabByIdentity(index: number, tab: any): any {
    return tab
  }

  onSqlContentChange(content: string, sourceTab: any = null): void {
    this.sqlContent = content

    const tab = sourceTab || this.tabsComponent.getActiveTab()
    if (tab) {
      tab.info.sql = content
      const currentSql = tab.info.sql || ''
      const originalSql = tab.originalContent || ''

      if (currentSql.trim() !== originalSql.trim()) {
        tab.icon = 'CHANGE'
      } else {
        tab.icon = 'CODE'
      }
    }
  }

  onSidebarStatusChange(event: SidebarLayoutChange): void {
    this.widthTable = event.width + 120
  }

  async onSelectedSchemaChanged(selectedSchemaDB: any): Promise<void> {
    try {
      await this.applySelectedSchemaContext(selectedSchemaDB)
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || this.t('workspace.changeSelectedConnectionError'), 'red')
    }
  }

  private async applySelectedSchemaContext(selectedSchemaDB: any, forceReconnect: boolean = false): Promise<any> {
    const activeTab = this.tabsComponent?.getActiveTab()
    const normalizedSelection = this.normalizeContextInput(selectedSchemaDB)
    if (!normalizedSelection) {
      throw new Error(this.t('workspace.noConnectionSelected'))
    }

    const previousContext = activeTab?.dbInfo || this.selectedSchemaDB
    const sameConnection = this.isSameSelectedConnection(previousContext, normalizedSelection)
    const connectionKey = normalizedSelection.connectionKey || (sameConnection ? previousContext?.connectionKey : undefined)

    if (forceReconnect && connectionKey) {
      this.connectionContext.forgetContext(connectionKey)
    }

    const tabContext = await this.connectionContext.ensureContext(this.connectionContext.createContext({
      ...normalizedSelection,
      connectionKey
    }, !connectionKey), forceReconnect)

    this.selectedSchemaDB = tabContext
    this.dbSchemaService.setSelectedSchemaDB(tabContext)

    if (!activeTab || !this.shouldApplySelectedContextToTab(activeTab)) {
      return tabContext
    }

    activeTab.dbInfo = tabContext
    activeTab.info = {
      ...activeTab.info,
      context: tabContext
    }

    return tabContext
  }

  private shouldApplySelectedContextToTab(tab: any): boolean {
    return ['sql', 'query-assistant', 'select-builder'].includes(tab?.type)
  }

  private isSameSelectedConnection(previousContext: any, selectedSchemaDB: any): boolean {
    if (!previousContext || !selectedSchemaDB) return false

    const previousConnectionId = previousContext.connId || previousContext.connectionId
    const selectedConnectionId = selectedSchemaDB.connId || selectedSchemaDB.connectionId
    if (previousConnectionId && selectedConnectionId) {
      return String(previousConnectionId) === String(selectedConnectionId)
    }

    return previousContext.sgbd === selectedSchemaDB.sgbd &&
      previousContext.host === selectedSchemaDB.host &&
      String(previousContext.port) === String(selectedSchemaDB.port)
  }

  onSavedQuery(savedQuery: any, sourceTab: any = null): void {
    this.applySavedQueryToTab(savedQuery, sourceTab)
    void this.loadRecentQueries()
  }

  onExistingSavedQuery(savedTab: any): void {
    this.applySavedQueryToTab(savedTab)
    void this.loadRecentQueries()
  }

  onCompareEditRequested(event: any): void {
    const target = event?.target
    if (!target) return

    if (target.kind === 'query') {
      this.tabsComponent.openSavedQueryTab(target.query)
      return
    }

    this.tabsComponent.newTab('sql', {
      sql: target.sql || '',
      context: target.dbSchema || target.query?.dbSchema || this.selectedSchemaDB
    }, this.t('tabs.queryVersionName', {
      name: target.query?.name || this.t('tabs.newQuery'),
      version: target.version?.id || ''
    }))
  }

  async onCompareRestoreRequested(event: any): Promise<void> {
    const target = event?.target
    if (!target?.query || !target?.version) return

    try {
      const restoredQuery = await this.querySave.restoreVersion(target.query.id, target.version.id)
      this.tabsComponent.openSavedQueryTab(restoredQuery)
      this.toast.showToast(this.t('workspace.restoreVersionSuccess'), 'green')
    } catch (error: any) {
      this.toast.showToast(error?.error || error?.message || this.t('workspace.restoreVersionError'), 'red')
    }
  }

  private applySavedQueryToTab(savedQuery: any, sourceTab: any = null): void {
    if (!savedQuery) return

    const activeTab = this.tabsComponent.getActiveTab()
    const tab = sourceTab ||
      this.tabsComponent.tabs.find(t => t.id === savedQuery.id && t.type === 'sql') ||
      (activeTab?.type === 'sql' ? activeTab : null)
    if (!tab) return

    tab.id = savedQuery.id || tab.id
    tab.name = savedQuery.name || tab.name
    tab.info = {
      ...tab.info,
      sql: savedQuery.sql ?? tab.info?.sql ?? this.sqlContent
    }
    tab.originalContent = tab.info.sql || ''
    tab.dbInfo = savedQuery.dbSchema || tab.dbInfo
    tab.folderPath = savedQuery.folderPath || ''
    tab.versioningEnabled = Boolean(savedQuery.versioningEnabled)
    tab.createdAt = savedQuery.createdAt
    tab.updatedAt = savedQuery.updatedAt
    tab.versions = savedQuery.versions || []
    tab.persisted = Boolean(savedQuery.id)
    tab.icon = 'CODE'
  }

  async onDbInfoRequested(event: any): Promise<void> {
    const requestedContext = this.normalizeContextInput(event)
    const initialContext = this.connectionContext.createContext(this.withReusableSchemaConnectionKey(requestedContext))
    const schemaTab = this.tabsComponent.newTab('schema', {
      dbInfo: this.createDatabaseObjectsState(initialContext, requestedContext, {
        loading: true
      }),
      context: initialContext
    }, this.getDbInfoTabName(initialContext))

    try {
      let context = await this.connectionContext.ensureContext(initialContext)

      const queryString = this.connectionContext.toQueryString(context)
      const schemaDb: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/get-selected-schema${queryString}`)
      if (schemaDb?.success === false) {
        throw new Error(schemaDb.message || schemaDb.error || this.t('workspace.resolveSelectedSchemaError'))
      }

      context = {
        ...context,
        database: schemaDb?.database || context.database,
        schema: schemaDb?.schema || context.schema
      }

      this.selectedSchemaDB = context
      this.dbSchemaService.setSelectedSchemaDB(context)

      const result: any = await this.loadDatabaseObjects(context, requestedContext)
      if (!this.isTabOpen(schemaTab)) return

      schemaTab.name = this.getDbInfoTabName(context)
      schemaTab.dbInfo = context
      schemaTab.info = {
        ...schemaTab.info,
        dbInfo: result,
        context
      }

      if (this.isActiveTab(schemaTab)) {
        this.dbSchemasData = result
        this.dbInfoTabInfo = schemaTab
      }
    } catch (error: any) {
      console.error(error)
      if (this.isTabOpen(schemaTab)) {
        const errorContext = schemaTab.info?.context || initialContext
        const errorMessage = error?.error || error?.message || this.t('workspace.loadDatabaseObjectsError')
        const errorData = this.createDatabaseObjectsState(errorContext, requestedContext, {
          errorMessage
        })

        schemaTab.info = {
          ...schemaTab.info,
          dbInfo: errorData,
          context: errorContext
        }

        if (this.isActiveTab(schemaTab)) {
          this.dbSchemasData = errorData
          this.dbInfoTabInfo = schemaTab
        }
      }
      this.toast.showToast(error?.error || error?.message || this.t('workspace.loadDatabaseObjectsError'), 'red')
    }
  }

  private normalizeContextInput(context: any): any {
    if (!context) return context

    return {
      ...context,
      connId: context.connId || context.connectionId || context.id
    }
  }

  private getSqlScriptName(context: any): string {
    const target = [context?.database, context?.schema].filter(Boolean).join('.')
    return target ? `SQL - ${target}` : this.t('tabs.newQuery')
  }

  private getDbInfoTabName(context: any): string {
    const schema = context?.schema && context.schema !== 'mysql' ? context.schema : ''
    const target = [context?.database, schema].filter(Boolean).join('.')

    return target || context?.schema || this.t('workspace.databaseInfo')
  }

  openMoreInfo(event: any): void {
    const sourceContext = event?.context || event?.info || this.tabsComponent.getActiveTab()?.dbInfo || this.selectedSchemaDB
    const objectType = String(event.type || event.objectType || '').toLowerCase()

    if (objectType === 'procedure' || objectType === 'function') {
      this.tabsComponent.newTab('procedure', {
        name: (event.name || event.NAME),
        info: sourceContext,
        context: sourceContext
      }, (event.name || event.NAME))
      return
    }

    this.tabsComponent.newTab('table', {
      name: (event.name || event.NAME),
      info: sourceContext,
      context: sourceContext
    }, (event.name || event.NAME))
  }

  onSqlObjectInfoRequested(event: any): void {
    const objectName = event?.name || event?.NAME
    if (!objectName) return

    const activeContext = event?.context || this.tabsComponent.getActiveTab()?.dbInfo || this.selectedSchemaDB
    const tableInfoState = event?.initialView
      ? { activeView: event.initialView }
      : undefined

    this.tabsComponent.newTab('table', {
      name: objectName,
      info: event?.info || activeContext,
      context: activeContext
    }, objectName).tableInfoState = tableInfoState
  }

  onProcedureEditRequested(event: any): void {
    this.tabsComponent.newTab('sql', {
      sql: event?.ddl || '',
      context: event?.context || this.procedureInfoTabInfo?.dbInfo || this.selectedSchemaDB
    }, event?.name || this.t('workspace.procedure'))
  }

  private async reloadSchemaInfoTab(tab: any, context: any): Promise<void> {
    try {
      const loadingData = this.createDatabaseObjectsState(context, context, {
        loading: true
      })

      tab.info = {
        ...tab.info,
        dbInfo: loadingData,
        context
      }
      if (this.isActiveTab(tab)) {
        this.dbSchemasData = loadingData
        this.dbInfoTabInfo = tab
      }

      const result = await this.loadDatabaseObjects(context, context)
      if (!this.isTabOpen(tab)) return

      tab.info = {
        ...tab.info,
        dbInfo: result,
        context
      }
      tab.name = context.schema || tab.name

      if (this.isActiveTab(tab)) {
        this.dbSchemasData = result
        this.dbInfoTabInfo = tab
      }
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || this.t('workspace.reloadDatabaseObjectsError'), 'red')
    }
  }

  private async loadDatabaseObjects(context: any, source: any): Promise<any> {
    const queryString = this.connectionContext.toQueryString(context)
    const response: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/list-objects${queryString}`)
    if (!response.success) {
      throw new Error(response.message || this.t('workspace.loadDatabaseObjectsError'))
    }

    const result: any = this.normalizeDatabaseObjects(response)

    result.connection = this.buildDatabaseObjectsConnection(context, source)

    return result
  }

  private createDatabaseObjectsState(context: any, source: any, state: any = {}): any {
    return {
      tables: [],
      views: [],
      procedures: [],
      indexes: [],
      connection: this.buildDatabaseObjectsConnection(context, source),
      ...state
    }
  }

  private buildDatabaseObjectsConnection(context: any = {}, source: any = {}): any {
    context = context || {}
    source = source || {}

    return {
      host: source.host || context.host,
      port: source.port || context.port,
      database: source.database || context.database,
      schema: source.schema || context.schema,
      sgbd: source.sgbd || context.sgbd,
      version: source.version || context.version,
      user: source.user || context.user,
      name: source.name || context.name,
      connId: source.connectionId || source.connId || source.id || context.connId,
      connectionKey: context.connectionKey
    }
  }

  private withReusableSchemaConnectionKey(context: any): any {
    if (!context || context.connectionKey) return context

    const activeContext = this.tabsComponent?.getActiveTab()?.dbInfo || this.selectedSchemaDB
    if (!activeContext?.connectionKey) return context

    const sameConnection = this.isSameSelectedConnection(activeContext, context)
    const sameDatabase = activeContext.database === context.database
    const sameSchema = activeContext.schema === context.schema

    if (!sameConnection || !sameDatabase || !sameSchema) return context

    return {
      ...context,
      connectionKey: activeContext.connectionKey
    }
  }

  private isTabOpen(tab: any): boolean {
    return !!tab && !!this.tabsComponent?.tabs?.includes(tab)
  }

  private isActiveTab(tab: any): boolean {
    return !!tab && this.tabsComponent?.getActiveTab() === tab
  }

  private normalizeDatabaseObjects(response: any): any {
    const groupedResult = {
      tables: [...(response.tables || [])],
      views: [...(response.views || [])],
      procedures: [...(response.procedures || [])],
      indexes: [...(response.indexes || [])],
      connection: {}
    }

    if (groupedResult.tables.length || groupedResult.views.length || groupedResult.procedures.length || groupedResult.indexes.length) {
      return groupedResult
    }

    const data = response.data || []
    data.forEach((item: any) => {
      if (item.type === 'table') groupedResult.tables.push(item)
      else if (item.type === 'view') groupedResult.views.push(item)
      else if (item.type === 'procedure' || item.type === 'function') groupedResult.procedures.push(item)
      else if (item.type === 'index') groupedResult.indexes.push(item)
    })

    return groupedResult
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
