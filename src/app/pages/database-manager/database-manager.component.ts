import { Component, ViewChild, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { ActivatedRoute } from '@angular/router'
import { SidebarComponent } from "../../components/sidebar/sidebar.component"
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

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent, TabsComponent, CodeEditorComponent, CommonModule, DbInfoComponent, ToastComponent, TableInfoComponent, SettingsComponent, QueryAssistantComponent, SelectBuilderComponent, ProcedureInfoComponent],
  templateUrl: './database-manager.component.html',
  styleUrl: './database-manager.component.scss'
})
export class DatabaseManagerComponent {
  @ViewChild(TabsComponent) tabsComponent!: TabsComponent
  @ViewChild(ToastComponent) toast!: ToastComponent
  @Output() dbInfo = new EventEmitter<any>()

  activeConnection: any = {}
  databasesSchemasActiveConnections: any = []
  connections: any[] = []
  selectedSchemaDB: any

  dbSchemasData: any
  tableInfoData: any
  procedureInfoData: any

  firstMessage: boolean = true
  dbInfoOpen: boolean = false
  tableInfoOpen: boolean = false
  procedureInfoOpen: boolean = false
  editorOpen: boolean = false
  settingsOpen: boolean = false
  queryAssistantOpen: boolean = false
  selectBuilderOpen: boolean = false
  dbInfoInitialized: boolean = false
  tableInfoInitialized: boolean = false
  procedureInfoInitialized: boolean = false

  sqlContent: string = ''
  tabInfo: any
  dbInfoTabInfo: any
  tableInfoTabInfo: any
  procedureInfoTabInfo: any

  elementName: string = ''
  procedureElementName: string = ''

  widthTable: number = 0

  constructor(
    private IAPI: InternalApiService,
    private route: ActivatedRoute,
    private dbSchemaService: GetDbschemaService,
    private connectionsService: ConnectionsService,
    private connectionContext: ConnectionContextService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    LoadingComponent.show()
    await this.firstConnectionConfig()
    await this.pageConnectionConfig()
    LoadingComponent.hide()
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
        throw new Error(schemaResult.error || schemaResult.message || 'Could not apply default database/schema')
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
    this.procedureInfoOpen = tab.type === 'procedure'
    this.tableInfoOpen = !this.editorOpen &&
      !this.dbInfoOpen &&
      !this.settingsOpen &&
      !this.queryAssistantOpen &&
      !this.selectBuilderOpen &&
      !this.procedureInfoOpen

    if (this.dbInfoOpen) {
      this.dbInfoInitialized = true
      this.dbInfoTabInfo = tab
      this.dbSchemasData = tab.info.dbInfo
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

  onTabClosed(): void {
    this.editorOpen = false
    this.dbInfoOpen = false
    this.tableInfoOpen = false
    this.procedureInfoOpen = false
    this.settingsOpen = false
    this.queryAssistantOpen = false
    this.selectBuilderOpen = false
  }

  onSettingsRequested(): void {
    this.tabsComponent.openSettingsTab()
  }

  onSelectBuilderRequested(event: any): void {
    this.tabsComponent.openSelectBuilderTab(event?.context || this.tabInfo?.dbInfo || this.selectedSchemaDB)
  }

  onBuilderQueryRequested(event: any): void {
    this.tabsComponent.newTab('sql', {
      sql: event.sql,
      context: event?.context || this.tabInfo?.dbInfo || this.selectedSchemaDB
    }, event?.name || 'Built select')
  }

  onSqlContentChange(content: string): void {
    this.sqlContent = content

    if (this.tabsComponent.activeTab !== null) {
      this.tabsComponent.tabs[this.tabsComponent.activeTab].info.sql = content

      const tab = this.tabsComponent.tabs[this.tabsComponent.activeTab]
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

  onSidebarStatusChange(event: boolean): void {
    if (!event) {
      this.widthTable = 440
    } else {
      this.widthTable = 300
    }
  }

  onSelectedSchemaChanged(selectedSchemaDB: any): void {
    const activeTab = this.tabsComponent?.getActiveTab()

    if (!activeTab) {
      this.selectedSchemaDB = selectedSchemaDB
      this.dbSchemaService.setSelectedSchemaDB(selectedSchemaDB)
      return
    }

    const tabContext = this.connectionContext.createContext({
      ...selectedSchemaDB,
      connectionKey: activeTab.dbInfo?.connectionKey
    })

    activeTab.dbInfo = tabContext
    this.selectedSchemaDB = tabContext
    this.dbSchemaService.setSelectedSchemaDB(tabContext)
  }

  onSavedQuery(name: string): void {
    this.tabsComponent.newSavedTab('sql', {
      id: Date.now(),
      info: { sql: this.sqlContent },
      originalContent: this.sqlContent,
      icon: 'CODE',
      name: name
    })
  }

  onExistingSavedQuery(savedTab: any): void {
    const tab = this.tabsComponent.tabs.find(t => t.id === savedTab.id)

    if (tab) {
      tab.icon = 'CODE'
    }
  }

  async onDbInfoRequested(event: any): Promise<void> {
    LoadingComponent.show()

    try {
      const context = await this.connectionContext.ensureContext(this.connectionContext.createContext({
        database: event.database,
        schema: event.schema,
        sgbd: event.sgbd,
        version: event.version,
        name: event.name,
        host: event.host,
        port: event.port,
        connId: event.connectionId
      }))

      this.selectedSchemaDB = context
      this.dbSchemaService.setSelectedSchemaDB(context)

      const queryString = this.connectionContext.toQueryString(context)
      const schemaDb: any = await this.IAPI.get(`/api/${event.sgbd}/${event.version}/get-selected-schema${queryString}`)

      const response: any = await this.IAPI.get(`/api/${event.sgbd}/${event.version}/list-objects${queryString}`)
      if (!response.success) {
        throw new Error(response.message || 'Could not load database objects.')
      }

      const result: any = this.normalizeDatabaseObjects(response)

      result.connection = {
        host: event.host,
        port: event.port,
        database: event.database,
        schema: event.schema,
        sgbd: event.sgbd,
        version: event.version,
        user: event.user,
        name: event.name,
        connId: event.connectionId || event.id,
        connectionKey: context.connectionKey
      }

      this.dbSchemasData = result

      this.tabsComponent.newTab('schema', { dbInfo: this.dbSchemasData, context }, schemaDb.schema)
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || 'Could not load database objects.', 'red')
    }

    LoadingComponent.hide()
  }

  openMoreInfo(event: any): void {
    const activeContext = this.tabsComponent.getActiveTab()?.dbInfo || this.selectedSchemaDB
    const objectType = String(event.type || event.objectType || '').toLowerCase()

    if (objectType === 'procedure' || objectType === 'function') {
      this.tabsComponent.newTab('procedure', {
        name: (event.name || event.NAME),
        info: event.info,
        context: activeContext
      }, (event.name || event.NAME))
      return
    }

    this.tabsComponent.newTab('table', {
      name: (event.name || event.NAME),
      info: event.info,
      context: activeContext
    }, (event.name || event.NAME))
  }

  onProcedureEditRequested(event: any): void {
    this.tabsComponent.newTab('sql', {
      sql: event?.ddl || '',
      context: event?.context || this.procedureInfoTabInfo?.dbInfo || this.selectedSchemaDB
    }, event?.name || 'Procedure')
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
}
