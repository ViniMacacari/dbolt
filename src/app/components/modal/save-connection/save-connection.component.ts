import { Component, EventEmitter, Output, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { LoadingComponent } from '../loading/loading.component'

@Component({
  selector: 'app-save-connection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './save-connection.component.html',
  styleUrl: './save-connection.component.scss'
})
export class SaveConnectionComponent {
  @Output() close = new EventEmitter<void>()
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent

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

  constructor(private IAPI: InternalApiService) { }

  async ngAfterViewInit(): Promise<void> {
    const result: any = await this.IAPI.get('/api/databases/avaliable')

    this.dataList = result.map((item: { id: number, database: string, versions: any[] }) => ({
      id: item.id,
      name: item.database,
      versions: item.versions
    }))
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

    } else {
      this.sgbdVersion = item['name'].toString()
    }
  }

  onClose() {
    this.close.emit()
  }

  async newConnection(): Promise<any> {
    if (this.connectionName.length === 0) {
      return
    }

    LoadingComponent.show()

    try {
      await this.IAPI.post(`/api/${this.sgbd}/${this.sgbdVersion}/test-connection`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      })

      await this.IAPI.post('/api/connections/new', {
        name: this.connectionName,
        database: this.sgbd,
        version: this.sgbdVersion,
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      })

      setTimeout(() => {
        LoadingComponent.hide()
        this.close.emit()
      }, 500)
    } catch (error: any) {
      console.error(error)
      setTimeout(() => {
        LoadingComponent.hide()
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
}
