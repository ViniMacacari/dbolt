import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { LoadingComponent } from '../loading/loading.component'
import { ToastComponent } from "../../toast/toast.component"

@Component({
  selector: 'app-load-query',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, InputListComponent],
  templateUrl: './load-query.component.html',
  styleUrl: './load-query.component.scss'
})
export class LoadQueryComponent {
  @Output() close = new EventEmitter<void>()
  @Output() saved = new EventEmitter<any>()
  @Input() data: any = {}
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent
  @ViewChild(ToastComponent) toast!: ToastComponent

  dataList: any = []
  queryName: string = ''
  queries: any[] = []
  originalQueries: any[] = []

  private _sgbd: string = ''

  constructor(private IAPI: InternalApiService) { }

  async ngOnInit(): Promise<void> {
    try {
      this.originalQueries = await this.IAPI.get('/api/query/load')
      this.queries = this.originalQueries

      console.log(this.queries)

      const result: any = await this.IAPI.get('/api/databases/avaliable')

      this.dataList = result.map((item: { id: number, database: string, versions: any[] }) => ({
        id: item.id,
        name: item.database,
        versions: item.versions
      }))
    } catch (error: any) {
      this.toast.showToast(error.error, 'red')
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

  onDatabaseSelected(item: { [key: string]: string | number } | null): void {
    console.log(item)
  }

  async loadQuery(query: any): Promise<void> {
    console.log(query)
  }
}
