import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ToastComponent } from "../../toast/toast.component"
import { QuerySaveService, SavedQuery } from '../../../services/query-save/query-save.service'

@Component({
  selector: 'app-save-query',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent],
  templateUrl: './save-query.component.html',
  styleUrl: './save-query.component.scss'
})
export class SaveQueryComponent {
  @Output() close = new EventEmitter<void>()
  @Output() saved = new EventEmitter<SavedQuery>()
  @Input() data: any = {}
  @ViewChild(ToastComponent) toast!: ToastComponent

  queryName: string = ''
  folderPath: string = ''
  versioningEnabled: boolean = false
  folders: string[] = []

  constructor(private querySave: QuerySaveService) { }

  get maxQueryNameLength(): number {
    return this.querySave.maxQueryNameLength
  }

  async ngOnInit(): Promise<void> {
    this.queryName = this.data?.name || ''
    this.folderPath = this.data?.folderPath || ''
    this.versioningEnabled = Boolean(this.data?.versioningEnabled)

    try {
      this.folders = await this.querySave.loadFolders()
    } catch (error) {
      console.warn('Could not load query folders:', error)
    }
  }

  onClose() {
    this.close.emit()
  }

  validateQueryName(value: string): void {
    if (value.length > this.maxQueryNameLength) {
      this.queryName = value.substring(0, this.maxQueryNameLength)
    } else {
      this.queryName = value
    }
  }

  async saveQuery(): Promise<void> {
    try {
      const name = this.queryName.trim()
      if (!name) {
        this.toast.showToast('Query name cannot be empty', 'red')
        return
      }

      const savedQuery = await this.querySave.createQuery({
        name,
        type: "sql",
        sql: this.data.sql,
        dbSchema: this.data.dataDbSchema,
        folderPath: this.querySave.normalizeFolderPath(this.folderPath),
        versioningEnabled: this.versioningEnabled
      })

      this.saved.emit(savedQuery)
      this.close.emit()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || 'Could not save query', 'red')
    }
  }
}
