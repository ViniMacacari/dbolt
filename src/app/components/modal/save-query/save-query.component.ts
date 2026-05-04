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
  versioningEnabled: boolean = false
  folders: string[] = []
  currentFolderPath: string = ''
  newFolderName: string = ''
  creatingFolder: boolean = false

  constructor(private querySave: QuerySaveService) { }

  get maxQueryNameLength(): number {
    return this.querySave.maxQueryNameLength
  }

  async ngOnInit(): Promise<void> {
    this.queryName = this.data?.name || ''
    this.currentFolderPath = this.querySave.normalizeFolderPath(this.data?.folderPath || '')
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
        folderPath: this.currentFolderPath,
        versioningEnabled: this.versioningEnabled
      })

      this.saved.emit(savedQuery)
      this.close.emit()
    } catch (error: any) {
      console.error(error)
      this.toast.showToast(error?.error || error?.message || 'Could not save query', 'red')
    }
  }

  openFolder(folderName: string): void {
    this.currentFolderPath = this.joinPath(this.currentFolderPath, folderName)
    this.creatingFolder = false
  }

  goBack(): void {
    if (!this.currentFolderPath) return

    const parts = this.currentFolderPath.split('/')
    parts.pop()
    this.currentFolderPath = parts.join('/')
    this.creatingFolder = false
  }

  goRoot(): void {
    this.currentFolderPath = ''
    this.creatingFolder = false
  }

  createFolder(): void {
    const folderName = this.newFolderName.trim()
    if (!folderName) return

    const newPath = this.joinPath(this.currentFolderPath, folderName)
    if (!this.folders.includes(newPath)) {
      this.folders = [...this.folders, newPath].sort((left, right) => left.localeCompare(right))
    }

    this.currentFolderPath = newPath
    this.newFolderName = ''
    this.creatingFolder = false
  }

  get currentFolderLabel(): string {
    return this.currentFolderPath || 'Queries'
  }

  get breadcrumbParts(): Array<{ label: string, path: string }> {
    if (!this.currentFolderPath) return []

    const parts = this.currentFolderPath.split('/')
    return parts.map((label, index) => ({
      label,
      path: parts.slice(0, index + 1).join('/')
    }))
  }

  openBreadcrumb(path: string): void {
    this.currentFolderPath = path
    this.creatingFolder = false
  }

  getVisibleFolders(): string[] {
    const folderNames = new Set<string>()

    for (const folderPath of this.folders) {
      const normalizedPath = this.querySave.normalizeFolderPath(folderPath)
      if (!normalizedPath) continue

      const relativePath = this.currentFolderPath
        ? normalizedPath.startsWith(`${this.currentFolderPath}/`)
          ? normalizedPath.slice(this.currentFolderPath.length + 1)
          : ''
        : normalizedPath

      const folderName = relativePath.split('/')[0]
      if (folderName) {
        folderNames.add(folderName)
      }
    }

    return [...folderNames].sort((left, right) => left.localeCompare(right))
  }

  private joinPath(basePath: string, folderName: string): string {
    return [basePath, folderName].filter(Boolean).join('/')
  }
}
