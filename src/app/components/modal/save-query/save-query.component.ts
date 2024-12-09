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
  @Output() saved = new EventEmitter<any>()
  @Input() data: any = {}
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent
  @ViewChild(ToastComponent) toast!: ToastComponent

  dataList: any = []
  queryName: string = ''

  private _sgbd: string = ''

  constructor(private IAPI: InternalApiService) { }

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
      await this.IAPI.post('/api/query/new', {
        name: this.queryName,
        type: "sql",
        sql: this.data.sql,
        dbSchema: this.data.dataDbSchema
      })

      this.saved.emit({
        name: this.queryName,
        type: "sql",
        sql: this.data.sql,
        dbSchema: this.data.dataDbSchema
      })
      this.close.emit()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error.error, 'red')
    }
  }
}