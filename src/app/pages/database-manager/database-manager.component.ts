import { Component, ViewChild, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { Router, ActivatedRoute } from '@angular/router'
import { SidebarComponent } from "../../components/sidebar/sidebar.component"
import { TabsComponent } from "../../components/tabs/tabs.component"
import { LoadingComponent } from '../../components/modal/loading/loading.component'
import { CodeEditorComponent } from "../../components/elements/code-editor/code-editor.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { DbInfoComponent } from "../../components/elements/db-info/db-info.component"
import { ToastComponent } from "../../components/toast/toast.component"
import { TableInfoComponent } from "../../components/elements/table-info/table-info.component"

@Component({
  selector: 'app-database-manager',
  standalone: true,
  imports: [SidebarComponent, TabsComponent, CodeEditorComponent, CommonModule, DbInfoComponent, ToastComponent, TableInfoComponent],
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

  firstMessage: boolean = true
  dbInfoOpen: boolean = false
  tableInfoOpen: boolean = false
  editorOpen: boolean = false

  sqlContent: string = ''
  tabInfo: any

  elementName: string = ''

  widthTable: number = 0

  constructor(
    private IAPI: InternalApiService,
    private route: ActivatedRoute,
    private router: Router,
    private dbSchemaService: GetDbschemaService
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
      this.activeConnection = [await this.IAPI.get('/api/connections/' + this.getPageId())]
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
      this.connections = await this.IAPI.get('/api/connections/load')

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

    const database = this.activeConnection[0].database
    const version = this.databasesSchemasActiveConnections.data[0].version
    const result: any = await this.IAPI.get(`/api/${database}/${version}/get-selected-schema`)

    this.selectedSchemaDB = {
      database: result.database,
      schema: result.schema,
      sgbd: this.databasesSchemasActiveConnections.data[0].sgbd,
      version: this.activeConnection[0].version,
      name: this.activeConnection[0].name,
      host: this.activeConnection[0].host,
      port: this.activeConnection[0].port,
      connId: this.activeConnection[0].id
    }

    this.dbSchemaService.setSelectedSchemaDB(this.selectedSchemaDB)

    LoadingComponent.hide()
  }

  onTabSelected(tab: any): void {
    this.firstMessage = false
    this.editorOpen = false
    this.dbInfoOpen = false
    this.tableInfoOpen = false

    setTimeout(() => {
      if (tab.type === 'sql') {
        this.editorOpen = true
        this.dbInfoOpen = false
        this.tableInfoOpen = false
      } else if (tab.type === 'schema') {
        this.dbInfoOpen = true
        this.editorOpen = false
        this.tableInfoOpen = false
        this.dbSchemasData = tab.info.dbInfo
      } else {
        this.tableInfoOpen = true
        this.editorOpen = false
        this.dbInfoOpen = false
        this.elementName = tab.info.name
      }

      this.tabInfo = tab
      this.sqlContent = tab.info.sql
    }, 1)
  }

  onTabClosed(): void {
    this.editorOpen = false
    this.dbInfoOpen = false
    this.tableInfoOpen = false
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
      const schemaDb: any = await this.IAPI.get(`/api/${event.sgbd}/${event.version}/get-selected-schema`)

      const response: any = await this.IAPI.get(`/api/${event.sgbd}/${event.version}/list-objects`)

      const result: any = {
        tables: [],
        views: [],
        procedures: [],
        indexes: [],
        connection: {}
      }

      await response.data.forEach((item: any) => {
        if (item.type === 'table') result.tables.push(item)
        else if (item.type === 'view') result.views.push(item)
        else if (item.type === 'procedure') result.procedures.push(item)
        else if (item.type === 'index') result.indexes.push(item)
      })

      result.connection = {
        host: event.host,
        port: event.port,
        database: event.database,
        sgbd: event.sgbd,
        version: event.version,
        user: event.user
      }

      this.dbSchemasData = result

      this.tabsComponent.newTab('schema', { dbInfo: this.dbSchemasData }, schemaDb.schema)
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.error, 'red')
    }

    LoadingComponent.hide()
  }

  openMoreInfo(event: any): void {
    this.tabsComponent.newTab('table', {
      name: (event.name || event.NAME),
      info: event.info
    }, (event.name || event.NAME))
  }
}