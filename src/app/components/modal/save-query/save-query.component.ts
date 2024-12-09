import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { LoadingComponent } from '../loading/loading.component'
import { ToastComponent } from "../../toast/toast.component"

@Component({
  selector: 'app-save-query',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent],
  templateUrl: './save-query.component.html',
  styleUrl: './save-query.component.scss'
})
export class SaveQueryComponent {
  @Output() close = new EventEmitter<void>()
  @Input() data: any = {}
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent
  @ViewChild(ToastComponent) toast!: ToastComponent

  dataList: any = []
  versionList: any = []
  sgbdVersion: string = ''
  queryName: string = ''
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

  validateQueryName(value: string): void {
    if (value.length > 20) {
      this.queryName = value.substring(0, 20)
    } else {
      this.queryName = value
    }
  }

  async saveQuery(): Promise<void> {
    try {
      const result = await this.IAPI.post('/api/query/new', {
        name: this.queryName,
        type: "sql",
        sql: this.data.sql,
        dbSchema: this.data.dataDbSchema
      })

      this.close.emit()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.message, 'red')
    }
  }
}
