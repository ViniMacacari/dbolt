import { Component, EventEmitter, Output, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { LoadingComponent } from '../loading/loading.component'

@Component({
  selector: 'app-connection',
  standalone: true,
  templateUrl: './connection.component.html',
  styleUrls: ['./connection.component.scss'],
  imports: [InputListComponent, CommonModule, FormsModule]
})
export class ConnectionComponent {
  @Output() close = new EventEmitter<void>()
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent

  dataList: any = []
  versionList: any = []
  sgbdVersion: string = ''
  connectionConfig: any = {
    host: '',
    port: null,
    user: '',
    password: ''
  }

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

      if (this.sgbdVersion) {
        this.versionInput.clearInput()
      }
    } else {
      if (this.sgbdVersion) {
        this.versionInput.clearInput()
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
      console.log('None selected')
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
      const result: any = await this.IAPI.post(`/api/hana/${this.sgbdVersion}/test-connection`, {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      })

      console.log(result)

      setTimeout(() => {
        LoadingComponent.hide()
      }, 500)
    } catch (error) {
      setTimeout(() => {
        LoadingComponent.hide()
      }, 500)
    }
  }
}