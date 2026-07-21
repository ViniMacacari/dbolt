import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { SQLiteFileExplorerComponent } from '../../elements/sqlite-file-explorer/sqlite-file-explorer.component'
import { LoadingComponent } from '../loading/loading.component'
import { ToastComponent } from "../../toast/toast.component"
import { ConnectionsService } from '../../../services/resolve-connections/connections.service'
import type { SavedConnection } from '../../../services/resolve-connections/connections.service'
import { DatabaseVersionService } from '../../../services/database-version/database-version.service'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { ButtonComponent } from '../../elements/button/button.component'

@Component({
  selector: 'app-connection',
  standalone: true,
  templateUrl: './connection.component.html',
  styleUrls: ['./connection.component.scss'],
  imports: [InputListComponent, SQLiteFileExplorerComponent, CommonModule, FormsModule, ToastComponent, ButtonComponent]
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
    private connectionsService: ConnectionsService,
    private databaseVersion: DatabaseVersionService,
    private language: AppLanguageService
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

  get isSQLite(): boolean {
    return this.sgbd === 'SQLite'
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
        port: this.isSQLite ? 0 : null,
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
        port: item['name'].toString() === 'SQLite' ? 0 : null,
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

  getDatabaseLogoPath(): string {
    return this.isSQLite ? 'icons/database.png' : `db-logo/${this.sgbd}.png`
  }

  getHostPlaceholder(): string {
    return this.isSQLite ? this.t('connection.sqlitePathPlaceholder') : this.t('connection.hostPlaceholder')
  }

  async testConnection(): Promise<void> {
    LoadingComponent.show()

    try {
      const result: any = await this.IAPI.post(
        `/api/${this.sgbd}/${this.sgbdVersion}/test-connection`,
        this.getConnectionConfigPayload()
      )

      if (result?.success === false) {
        throw new Error(result.error || result.message || this.t('connection.failed'))
      }

      setTimeout(() => {
        LoadingComponent.hide()
        this.toast.showToast(this.t('connection.testSuccess'), 'green')
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
      this.toast.showToast(this.t('connection.nameRequired'), 'red')
      return
    }

    LoadingComponent.show()

    try {
      const connectionConfig = this.getConnectionConfigPayload()
      const result: any = await this.IAPI.post(
        `/api/${this.sgbd}/${this.sgbdVersion}/test-connection`,
        connectionConfig
      )

      if (result?.success === false) {
        throw new Error(result.error || result.message || this.t('connection.failed'))
      }

      const databaseVersion = await this.databaseVersion.detectDatabaseVersion(
        this.sgbd,
        this.sgbdVersion,
        connectionConfig
      )
      const connectionPayload = {
        name: this.connectionName,
        database: this.sgbd,
        version: this.sgbdVersion,
        databaseVersion,
        ...connectionConfig,
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
        this.toast.showToast(
          this.connection ? this.t('connection.updateSuccess') : this.t('connection.createSuccess'),
          'green'
        )
      }, 500)
    } catch (error: any) {
      console.error(error)
      setTimeout(() => {
        LoadingComponent.hide()
        this.toast.showToast(error?.error || error?.message || this.t('connection.saveError'), 'red')
      }, 500)
    }
  }

  private getConnectionConfigPayload(): { host: string, port: string | number, user: string, password: string } {
    return {
      host: this.connectionConfig.host,
      port: this.connectionConfig.port || 0,
      user: this.connectionConfig.user || '',
      password: this.connectionConfig.password || ''
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
      port: connection.port || 0,
      user: connection.user || '',
      password: connection.password || ''
    }
    const selectedDatabase = this.dataList.find((db: any) => db.name === connection.database)
    this.versionList = selectedDatabase?.versions.map((version: any) => ({
      name: version.name
    })) || []
  }

  t(key: string): string {
    return this.language.translate(key)
  }
}
