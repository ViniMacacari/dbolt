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
  @ViewChild('toast') toast!: ToastComponent

  dataList: any = []
  versionList: any = []
  sgbdVersion: string = ''
  connectionName: string = ''
  connectionConfig: any = {
    host: '',
    port: null,
    user: '',
    password: ''
  }
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
    } else {
      this.sgbdVersion = item['name'].toString()
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

      const connectionPayload = {
        name: this.connectionName,
        database: this.sgbd,
        version: this.sgbdVersion,
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password,
        defaultDatabase: this.connection?.defaultDatabase,
        defaultSchema: this.connection?.defaultSchema
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
    const selectedDatabase = this.dataList.find((db: any) => db.name === connection.database)
    this.versionList = selectedDatabase?.versions.map((version: any) => ({
      name: version.name
    })) || []
  }
}
