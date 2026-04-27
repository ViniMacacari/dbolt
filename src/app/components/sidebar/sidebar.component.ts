import { Component, Input, ViewChild, EventEmitter, Output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadingComponent } from '../modal/loading/loading.component'
import { ToastComponent } from '../toast/toast.component'
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { Router } from '@angular/router'
import { ConnectionsService } from '../../services/resolve-connections/connections.service'
import { ConnectionComponent } from '../modal/connection/connection.component'

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, ToastComponent, ConnectionComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() connections: any[] = []
  @Input() activeConnection: any = { info: {}, data: [] }
  @Input() dbSchemas: any = []
  @Input() selectedSchemaDB: any
  @Output() sidebarStatusChange = new EventEmitter<boolean>()
  @Output() dbInfoRequested = new EventEmitter<any>()
  @Output() selectedSchemaChanged = new EventEmitter<any>()
  @Output() settingsRequested = new EventEmitter<void>()

  @ViewChild('toast') toast!: ToastComponent

  isModalOpen: boolean = false
  editingConnection: any = null
  isOpen = true
  expandedConnections: Set<number> = new Set()
  expandedDatabases: Set<string> = new Set()
  clickTimeout: any = null
  quickSelectorType: 'connection' | 'database' | 'schema' | null = null
  quickSelectorFilter: string = ''

  constructor(
    private IAPI: InternalApiService,
    private dbSchemaService: GetDbschemaService,
    private router: Router,
    private connectionsService: ConnectionsService
  ) { }

  toggle() {
    this.isOpen = !this.isOpen
    this.sidebarStatusChange.emit(this.isOpen)
  }

  toggleQuickSelector(type: 'connection' | 'database' | 'schema', event: MouseEvent): void {
    event.stopPropagation()
    if (this.quickSelectorType === type) {
      this.closeQuickSelector()
      return
    }

    this.quickSelectorFilter = ''
    this.quickSelectorType = type
  }

  closeQuickSelector(event?: MouseEvent): void {
    event?.stopPropagation()
    this.quickSelectorType = null
    this.quickSelectorFilter = ''
  }

  getQuickSelectorTitle(): string {
    if (this.quickSelectorType === 'connection') return 'Select connection'
    if (this.quickSelectorType === 'database') return 'Select database'
    if (this.quickSelectorType === 'schema') return 'Select schema'

    return ''
  }

  getQuickSelectorOptions(): any[] {
    if (this.quickSelectorType === 'connection') {
      return this.connections.map((connection) => ({
        type: 'connection',
        label: connection.name,
        description: `${connection.database} - ${connection.host}:${connection.port}`,
        icon: `db-logo/${connection.database}.png`,
        value: connection
      }))
    }

    const selectedConnection = this.getSelectedSavedConnection()
    if (!selectedConnection) return []

    if (this.quickSelectorType === 'database') {
      return this.getSchemasByConnection(selectedConnection).map((database) => ({
        type: 'database',
        label: database.database,
        description: `${database.schemas.length} schemas`,
        icon: 'icons/database.png',
        value: database,
        connection: selectedConnection
      }))
    }

    if (this.quickSelectorType === 'schema') {
      const database = this.getSchemasByConnection(selectedConnection)
        .find((item) => item.database === this.selectedSchemaDB?.database)

      return (database?.schemas || []).map((schema: string) => ({
        type: 'schema',
        label: schema,
        description: this.selectedSchemaDB?.database,
        icon: 'icons/schema.png',
        value: schema,
        database,
        connection: selectedConnection
      }))
    }

    return []
  }

  getFilteredQuickSelectorOptions(): any[] {
    const filter = this.quickSelectorFilter.trim().toLowerCase()
    const options = this.getQuickSelectorOptions()

    if (!filter) return options

    return options.filter((option) =>
      `${option.label || ''} ${option.description || ''}`.toLowerCase().includes(filter)
    )
  }

  onQuickSelectorFilter(event: Event): void {
    this.quickSelectorFilter = (event.target as HTMLInputElement).value
  }

  async selectQuickOption(option: any, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    LoadingComponent.show('Changing selected connection...')

    try {
      if (option.type === 'connection') {
        await this.canConnect(option.value)
        const database = this.getDefaultDatabaseForConnection(option.value)
        const schema = this.getDefaultSchemaForConnection(option.value, database)

        if (database && schema) {
          await this.setSchema(this.buildSchemaSelection(option.value, database.database, schema))
        }
      }

      if (option.type === 'database') {
        const schema = option.value.schemas.includes(this.selectedSchemaDB?.schema)
          ? this.selectedSchemaDB.schema
          : option.value.schemas[0]

        if (schema) {
          await this.setSchema(this.buildSchemaSelection(option.connection, option.value.database, schema))
        }
      }

      if (option.type === 'schema') {
        await this.setSchema(this.buildSchemaSelection(option.connection, option.database.database, option.value))
      }

      this.quickSelectorType = null
    } finally {
      LoadingComponent.hide()
    }
  }

  goToHome(): void {
    this.router.navigate(['/'])
  }

  openSettings(): void {
    this.settingsRequested.emit()
  }

  toggleConnection(connectionId: number) {
    if (this.expandedConnections.has(connectionId)) {
      this.expandedConnections.delete(connectionId)
    } else {
      this.expandedConnections.add(connectionId)
    }
  }

  toggleDatabase(databaseId: string) {
    if (this.expandedDatabases.has(databaseId)) {
      this.expandedDatabases.delete(databaseId)
    } else {
      this.expandedDatabases.add(databaseId)
    }
  }

  isActiveConnection(connection: any): boolean {
    return this.activeConnection.some(
      (conn: any) => conn.host === connection.host && conn.port === connection.port
    )
  }

  getSchemasByConnection(connection: any): any[] {
    if (!this.dbSchemas || !this.dbSchemas.data) return []
    return this.dbSchemas.data.filter(
      (item: any) =>
        item.host === connection.host && item.port === connection.port
    )
  }

  private getDefaultDatabaseForConnection(connection: any): any {
    const databases = this.getSchemasByConnection(connection)
    if (!connection?.defaultDatabase) {
      return databases[0]
    }

    return databases.find((database) => database.database === connection.defaultDatabase) || databases[0]
  }

  private getDefaultSchemaForConnection(connection: any, database: any): string {
    if (!database) return ''

    if (connection?.defaultSchema && database.schemas?.includes(connection.defaultSchema)) {
      return connection.defaultSchema
    }

    return database.schemas?.[0] || ''
  }

  private getSelectedSavedConnection(): any {
    return this.connections.find((connection) =>
      connection.id === this.selectedSchemaDB?.connId ||
      (
        connection.host === this.selectedSchemaDB?.host &&
        String(connection.port) === String(this.selectedSchemaDB?.port) &&
        connection.database === this.selectedSchemaDB?.sgbd
      )
    )
  }

  private buildSchemaSelection(connection: any, database: string, schema: string): any {
    return {
      schema,
      database,
      sgbd: connection.database,
      version: connection.version,
      connectionId: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      password: connection.password,
      user: connection.user
    }
  }

  isSelectedDatabase(connection: any, database: any): boolean {
    if (!this.selectedSchemaDB) return false

    return this.isSameConnection(connection) &&
      this.selectedSchemaDB.database === database.database
  }

  isSelectedSchema(connection: any, database: string, schema: string): boolean {
    if (!this.selectedSchemaDB) return false

    return this.isSameConnection(connection) &&
      this.selectedSchemaDB.database === database &&
      this.selectedSchemaDB.schema === schema
  }

  private isSameConnection(connection: any): boolean {
    return this.selectedSchemaDB?.host === connection.host &&
      String(this.selectedSchemaDB?.port) === String(connection.port) &&
      this.selectedSchemaDB?.sgbd === connection.database
  }

  async canConnect(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.info || !this.dbSchemas.data) {
      this.dbSchemas = { info: [], data: [] }
    }

    const existsConnection = this.dbSchemas.data.find(
      (db: any) =>
        db.sgbd === connection.database &&
        db.host === connection.host &&
        db.port === connection.port
    )

    if (existsConnection) {
      return
    } else {
      await this.connectDatabase(connection)
    }
  }

  async connectDatabase(connection: any): Promise<void> {
    LoadingComponent.show()
    try {
      await this.IAPI.post(`/api/${connection.database}/${connection.version}/connect`, {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password
      })

      this.expandedConnections.add(connection.id)

      await this.disconnectDatabases(connection)
      await this.addDatabase(connection)
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')
    } finally {
      LoadingComponent.hide()
    }
  }

  async disconnectDatabases(connection: any): Promise<void> {
    this.dbSchemas.data = this.dbSchemas.data.map((db: any) => {
      if (db.sgbd === connection.database) {
        return { ...db, connected: false }
      }
      return db
    })
  }

  async addDatabase(connection: any): Promise<void> {
    const schemasDb: any = await this.IAPI.get(`/api/${connection.database}/${connection.version}/list-databases-and-schemas`)

    schemasDb.data.forEach((schema: any) => {
      const exists = this.dbSchemas.data.some((db: any) =>
        db.sgbd === connection.database &&
        db.host === connection.host &&
        db.port === connection.port &&
        db.version === connection.version &&
        db.database === schema.database &&
        this.arraysEqual(db.schemas, schema.schemas)
      )

      if (!exists) {
        this.dbSchemas.data.push({
          sgbd: connection.database,
          host: connection.host,
          port: connection.port,
          version: connection.version,
          database: schema.database,
          schemas: schema.schemas,
          connected: this.dbSchemas.data.length === 0
        })
      }
    })
  }

  private arraysEqual(arr1: any[], arr2: any[]): boolean {
    if (arr1.length !== arr2.length) return false
    return arr1.every((value, index) => value === arr2[index])
  }

  async selectSchema(connection: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
      return
    }

    this.clickTimeout = setTimeout(async () => {
      LoadingComponent.show()

      try {
        await this.setSchema(connection)
      } finally {
        LoadingComponent.hide()
        this.clickTimeout = null
      }
    }, 300)
  }

  async setSchema(connection: any): Promise<void> {
    if (!this.dbSchemas || !this.dbSchemas.data) {
      console.error('dbSchemas não está inicializado.')
      return
    }

    let schemaDb: any

    try {
      await this.connectDatabase({
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: connection.password,
        database: connection.sgbd,
        version: connection.version,
        id: connection.connectionId || connection.id
      })

      const matchedConnection = this.dbSchemas.data.find((db: any) =>
        db.database === connection.database &&
        db.host === connection.host &&
        db.port === connection.port &&
        db.sgbd === connection.sgbd &&
        db.version === connection.version
      )
      schemaDb = await this.connectToSchemaDb(matchedConnection, connection)

      this.selectedSchemaDB = {
        database: schemaDb?.currentSchema?.database || connection.database,
        schema: schemaDb?.currentSchema?.schema || connection.schema,
        sgbd: connection.sgbd,
        version: connection.version,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        connId: connection.connectionId || connection.id
      }

      this.dbSchemaService.setSelectedSchemaDB(this.selectedSchemaDB)
      this.selectedSchemaChanged.emit(this.selectedSchemaDB)
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message, 'red')
      return
    }
  }

  async openSchemaDBInfo(connection: any, data2: any): Promise<any> {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout)
      this.clickTimeout = null
    }

    LoadingComponent.show()

    try {
      await this.setSchema(data2)
      this.dbInfoRequested.emit(connection)
    } finally {
      LoadingComponent.hide()
    }
  }

  async openDatabaseInfo(connection: any, database: any, event: MouseEvent): Promise<void> {
    event.stopPropagation()

    const schema = database.schemas.includes(this.selectedSchemaDB?.schema)
      ? this.selectedSchemaDB.schema
      : database.schemas[0]

    if (!schema) return

    const selection = this.buildSchemaSelection(connection, database.database, schema)
    await this.openSchemaDBInfo(selection, selection)
  }

  async connectToSchemaDb(connection: any, data: any | null = null): Promise<any> {
    try {
      const result: any = await this.IAPI.post(`/api/${connection.sgbd}/${connection.version}/set-schema`, {
        database: connection.database || data.database,
        schema: connection.schema || data.schema
      })

      return {
        database: connection?.database || data?.database,
        schema: connection?.schema || data?.schema
      }
    } catch (error: any) {
      this.toast.showToast(error.message, 'red')

      return null
    }
  }

  openModal() {
    this.editingConnection = null
    this.isModalOpen = true
  }

  editConnection(connection: any, event: MouseEvent): void {
    event.stopPropagation()
    this.editingConnection = connection
    this.isModalOpen = true
  }

  async closeModal() {
    this.isModalOpen = false
    this.editingConnection = null
    this.connections = this.connectionsService.getCachedConnections()
  }
}
