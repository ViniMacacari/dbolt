import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { LoadingComponent } from '../loading/loading.component'
import { ToastComponent } from "../../toast/toast.component"
import { ConnectionsService } from '../../../services/resolve-connections/connections.service'
import type { SavedConnection } from '../../../services/resolve-connections/connections.service'

@Component({
  selector: 'app-connection',
  standalone: true,
  templateUrl: './connection.component.html',
  styleUrls: ['./connection.component.scss'],
  imports: [InputListComponent, CommonModule, FormsModule, ToastComponent]
})
export class ConnectionComponent {
  @Input() connection: SavedConnection | null = null
  @Output() close = new EventEmitter<void>()
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent
  @ViewChild('defaultDatabase') defaultDatabaseInput?: InputListComponent
  @ViewChild('defaultSchema') defaultSchemaInput?: InputListComponent
  @ViewChild('toast') toast!: ToastComponent

  dataList: any = []
  versionList: any = []
  defaultDatabaseList: any[] = []
  defaultSchemaList: any[] = []
  sgbdVersion: string = ''
  connectionName: string = ''
  connectionConfig: any = {
    host: '',
    port: null,
    user: '',
    password: ''
  }
  defaultConfig: any = {
    database: '',
    schema: ''
  }
  schemaOptions: any[] = []
  defaultOptionsLoaded: boolean = false
  connections: any = []

  private _sgbd: string = ''

  constructor(
    private IAPI: InternalApiService,
    private connectionsService: ConnectionsService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    const result: any = await this.IAPI.get('/api/databases/avaliable')

    this.dataList = result.map((item: { id: number, database: string, versions: any[] }) => ({
      id: item.id,
      name: item.database,
      versions: item.versions
    }))

    if (this.connection) {
      this.fillConnectionForm(this.connection)
    }
  }

  get isEditing(): boolean {
    return !!this.connection
  }

  get requiresDefaultDatabase(): boolean {
    return ['MySQL', 'Postgres', 'SqlServer'].includes(this.sgbd)
  }

  get requiresDefaultSchema(): boolean {
    return ['Hana', 'Postgres', 'SqlServer'].includes(this.sgbd)
  }

  get sgbd(): string {
    return this._sgbd
  }

  set sgbd(value: string) {
    this._sgbd = value
    this.sgbdVersion = ''
  }

  onDatabaseSelected(item: { [key: string]: string | number } | null): void {
    if (item === null) {
      this.sgbd = ''
      this.versionList = []
      this.databaseInput.clearInput()
      this.connectionConfig = {
        host: '',
        port: null,
        user: '',
        password: ''
      }
      this.clearDefaultSelection()

      if (this.sgbdVersion) {
        this.versionInput.clearInput()
      }
    } else {
      if (this.sgbdVersion) {
        this.versionInput.clearInput()
      }

      this.connectionConfig = {
        host: '',
        port: null,
        user: '',
        password: ''
      }
      this.clearDefaultSelection()

      this.sgbd = item['name'].toString()

      const selectedDatabase = this.dataList.find((db: any) => db.name === item['name'])
      this.versionList = selectedDatabase?.versions.map((version: any) => ({
        name: version.name
      })) || []
    }
  }

  onVersionSelected(item: { [key: string]: string | number } | null): void {
    if (item === null) {
      this.sgbdVersion = ''
      this.clearDefaultSelection()
    } else {
      this.sgbdVersion = item['name'].toString()
      this.clearDefaultSelection()
    }
  }

  onClose() {
    this.close.emit()
  }

  async testConnection(): Promise<void> {
    LoadingComponent.show()

    try {
      const result: any = await this.IAPI.post(`/api/${this.sgbd}/${this.sgbdVersion}/test-connection`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      })

      if (result?.success === false) {
        throw new Error(result.error || result.message || 'Connection failed')
      }

      await this.loadDefaultOptions(false)

      setTimeout(() => {
        LoadingComponent.hide()
        this.toast.showToast('Connection successfully established!', 'green')
      }, 500)
    } catch (error: any) {
      setTimeout(() => {
        LoadingComponent.hide()
        this.toast.showToast(error.message, 'red')
      }, 500)
    }
  }

  async newConnection(): Promise<any> {
    if (this.connectionName.length === 0) {
      this.toast.showToast('Connection name cannot be empty', 'red')
      return
    }

    LoadingComponent.show()

    try {
      const result: any = await this.IAPI.post(`/api/${this.sgbd}/${this.sgbdVersion}/test-connection`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      })

      if (result?.success === false) {
        throw new Error(result.error || result.message || 'Connection failed')
      }

      await this.ensureSelectedDefaultsAreValid()

      const connectionPayload = {
        name: this.connectionName,
        database: this.sgbd,
        version: this.sgbdVersion,
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password,
        defaultDatabase: this.requiresDefaultDatabase ? this.defaultConfig.database || undefined : undefined,
        defaultSchema: this.requiresDefaultSchema ? this.defaultConfig.schema || undefined : undefined
      }

      if (this.connection) {
        await this.connectionsService.updateConnection(this.connection.id, connectionPayload)
      } else {
        await this.connectionsService.createConnection(connectionPayload)
      }

      setTimeout(() => {
        LoadingComponent.hide()
        this.close.emit()
        this.toast.showToast(this.connection ? 'Connection successfully updated!' : 'New connection successfully created!', 'green')
      }, 500)
    } catch (error: any) {
      console.error(error)
      setTimeout(() => {
        LoadingComponent.hide()
        this.toast.showToast(error?.error || error?.message || 'Connection could not be saved', 'red')
      }, 500)
    }
  }

  validateConnectionName(value: string): void {
    if (value.length > 14) {
      this.connectionName = value.substring(0, 14)
    } else {
      this.connectionName = value
    }
  }

  async loadDefaultOptions(showLoading = true): Promise<void> {
    if (!this.sgbd || !this.sgbdVersion) return

    if (showLoading) {
      LoadingComponent.show('Loading available databases...')
    }

    try {
      const connectionKey = this.createDefaultOptionsConnectionKey()

      const connectionResult: any = await this.IAPI.post(`/api/${this.sgbd}/${this.sgbdVersion}/connect`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password,
        connectionKey
      })

      if (connectionResult?.success === false) {
        throw new Error(connectionResult.error || connectionResult.message || 'Connection failed')
      }

      const response: any = await this.IAPI.get(
        `/api/${this.sgbd}/${this.sgbdVersion}/list-databases-and-schemas?connectionKey=${encodeURIComponent(connectionKey)}`
      )

      if (response.success === false) {
        throw new Error(response.message || response.error || 'Could not load databases and schemas.')
      }

      this.schemaOptions = response.data || []
      this.defaultDatabaseList = this.schemaOptions.map((item: any) => ({ name: item.database }))

      if (!this.requiresDefaultDatabase && this.schemaOptions[0]) {
        this.defaultConfig.database = this.schemaOptions[0].database
      }

      if (this.requiresDefaultDatabase && this.defaultConfig.database) {
        this.syncDefaultDatabaseInput(false)
      }

      this.refreshSchemaList()

      if (this.defaultConfig.schema) {
        this.syncDefaultSchemaInput(false)
      }

      this.defaultOptionsLoaded = true
    } catch (error: any) {
      console.error(error)
      this.defaultOptionsLoaded = false
      this.toast.showToast(error?.error || error?.message || 'Could not load default options', 'red')
    } finally {
      if (showLoading) {
        LoadingComponent.hide()
      }
    }
  }

  onDefaultDatabaseSelected(item: { [key: string]: string | number } | null): void {
    this.defaultConfig.database = item?.['name']?.toString() || ''
    this.defaultConfig.schema = ''
    this.refreshSchemaList()
    setTimeout(() => this.defaultSchemaInput?.setSelectedItem(null, false), 0)
  }

  onDefaultSchemaSelected(item: { [key: string]: string | number } | null): void {
    this.defaultConfig.schema = item?.['name']?.toString() || ''
  }

  private fillConnectionForm(connection: SavedConnection): void {
    this.connectionName = connection.name
    this.sgbd = connection.database
    this.sgbdVersion = connection.version
    this.connectionConfig = {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password
    }
    this.defaultConfig = {
      database: connection.defaultDatabase || '',
      schema: connection.defaultSchema || ''
    }

    const selectedDatabase = this.dataList.find((db: any) => db.name === connection.database)
    this.versionList = selectedDatabase?.versions.map((version: any) => ({
      name: version.name
    })) || []

    setTimeout(() => {
      this.databaseInput?.setSelectedItem({ name: connection.database }, false)
      this.versionInput?.setSelectedItem({ name: connection.version }, false)
      void this.loadDefaultOptions(false)
    }, 0)
  }

  private clearDefaultSelection(): void {
    this.schemaOptions = []
    this.defaultDatabaseList = []
    this.defaultSchemaList = []
    this.defaultConfig = {
      database: '',
      schema: ''
    }
    this.defaultOptionsLoaded = false
    setTimeout(() => {
      this.defaultDatabaseInput?.setSelectedItem(null, false)
      this.defaultSchemaInput?.setSelectedItem(null, false)
    }, 0)
  }

  private refreshSchemaList(): void {
    const selectedDatabase = this.requiresDefaultDatabase
      ? this.defaultConfig.database
      : this.schemaOptions[0]?.database

    const databaseInfo = this.schemaOptions.find((item: any) => item.database === selectedDatabase)
    this.defaultSchemaList = (databaseInfo?.schemas || []).map((schema: string) => ({ name: schema }))
  }

  private syncDefaultDatabaseInput(emitEvent: boolean): void {
    const item = this.defaultDatabaseList.find((database) => database.name === this.defaultConfig.database)
    setTimeout(() => this.defaultDatabaseInput?.setSelectedItem(item || null, emitEvent), 0)
  }

  private syncDefaultSchemaInput(emitEvent: boolean): void {
    const item = this.defaultSchemaList.find((schema) => schema.name === this.defaultConfig.schema)
    setTimeout(() => this.defaultSchemaInput?.setSelectedItem(item || null, emitEvent), 0)
  }

  private async ensureSelectedDefaultsAreValid(): Promise<void> {
    if (!this.defaultOptionsLoaded && (this.defaultConfig.database || this.defaultConfig.schema)) {
      await this.loadDefaultOptions()
    }

    if (this.requiresDefaultDatabase && this.defaultConfig.database) {
      const databaseExists = this.defaultDatabaseList.some((database) => database.name === this.defaultConfig.database)
      if (!databaseExists) {
        throw new Error('Selected default database does not exist.')
      }
    }

    if (this.requiresDefaultSchema && this.defaultConfig.schema) {
      const schemaExists = this.defaultSchemaList.some((schema) => schema.name === this.defaultConfig.schema)
      if (!schemaExists) {
        throw new Error('Selected default schema does not exist.')
      }
    }
  }

  private createDefaultOptionsConnectionKey(): string {
    return `connection-form-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
