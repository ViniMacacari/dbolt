import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { ToastComponent } from "../../toast/toast.component"
import { QuerySaveService, SavedQuery, SavedQueryVersion } from '../../../services/query-save/query-save.service'

@Component({
  selector: 'app-load-query',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastComponent, InputListComponent],
  templateUrl: './load-query.component.html',
  styleUrl: './load-query.component.scss'
})
export class LoadQueryComponent {
  @Output() close = new EventEmitter<void>()
  @Output() open = new EventEmitter<any>()
  @Input() data: any = {}
  @ViewChild('database') databaseInput!: InputListComponent
  @ViewChild('version') versionInput!: InputListComponent
  @ViewChild(ToastComponent) toast!: ToastComponent

  dataList: any = []
  queryName: string = ''
  queries: SavedQuery[] = []
  originalQueries: SavedQuery[] = []
  folders: string[] = []
  versionsByQueryId: Record<number, SavedQueryVersion[]> = {}
  expandedHistoryQueryId: number | null = null
  currentFolderPath: string = ''
  private _sgbd: string = ''

  constructor(
    private IAPI: InternalApiService,
    private querySave: QuerySaveService
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      this.originalQueries = await this.querySave.loadQueries()
      this.folders = await this.querySave.loadFolders()
      this.applyFilters()

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
    this.queryName = value
    this.applyFilters()
  }

  onDatabaseSelected(item: { [key: string]: string | number } | null): void {
    this._sgbd = item ? item?.['name'] as string : ''
    this.applyFilters()
  }

  applyFilters(): void {
    const database = this._sgbd.toLowerCase()
    const queryName = this.queryName.toLowerCase()
    const currentFolderPath = this.currentFolderPath.toLowerCase()

    this.queries = this.originalQueries.filter(query => {
      const queryDatabase = String(query.dbSchema?.sgbd || '').toLowerCase()
      const queryFolderPath = String(query.folderPath || '').toLowerCase()

      return (!database || queryDatabase.includes(database)) &&
        (!queryName || query.name.toLowerCase().includes(queryName)) &&
        queryFolderPath === currentFolderPath
    })
  }

  async loadQuery(query: SavedQuery): Promise<void> {
    this.open.emit(query)
  }

  async deleteQuery(query: SavedQuery): Promise<void> {
    try {
      await this.querySave.deleteQuery(query.id)
      this.originalQueries = this.originalQueries.filter((item: { id: number }) => item.id !== query.id)
      this.applyFilters()
      this.toast.showToast('Query deleted successfully', 'green')
    } catch (error: any) {
      this.toast.showToast(error?.error || error?.message || 'Could not delete query', 'red')
    }
  }

  async toggleHistory(query: SavedQuery, event: MouseEvent): Promise<void> {
    event.stopPropagation()

    if (this.expandedHistoryQueryId === query.id) {
      this.expandedHistoryQueryId = null
      return
    }

    this.expandedHistoryQueryId = query.id

    if (this.versionsByQueryId[query.id]) {
      return
    }

    try {
      this.versionsByQueryId[query.id] = await this.querySave.loadVersions(query.id)
    } catch (error: any) {
      this.toast.showToast(error?.error || error?.message || 'Could not load query history', 'red')
    }
  }

  async restoreVersion(query: SavedQuery, version: SavedQueryVersion, event: MouseEvent): Promise<void> {
    event.stopPropagation()

    try {
      const restoredQuery = await this.querySave.restoreVersion(query.id, version.id)
      this.replaceQuery(restoredQuery)
      this.versionsByQueryId[query.id] = await this.querySave.loadVersions(query.id)
      this.toast.showToast('Query version restored successfully', 'green')
      this.open.emit(restoredQuery)
    } catch (error: any) {
      this.toast.showToast(error?.error || error?.message || 'Could not restore query version', 'red')
    }
  }

  formatQueryPath(query: SavedQuery): string {
    return this.querySave.formatQueryPath(query)
  }

  formatDate(value?: string): string {
    return this.querySave.formatDate(value)
  }

  getQueryVersions(query: SavedQuery): SavedQueryVersion[] {
    return this.versionsByQueryId[query.id] || []
  }

  openFolder(folderName: string): void {
    this.currentFolderPath = this.joinPath(this.currentFolderPath, folderName)
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  goBack(): void {
    if (!this.currentFolderPath) return

    const parts = this.currentFolderPath.split('/')
    parts.pop()
    this.currentFolderPath = parts.join('/')
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  goRoot(): void {
    this.currentFolderPath = ''
    this.expandedHistoryQueryId = null
    this.applyFilters()
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
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  getVisibleFolders(): string[] {
    const allFolders = new Set([
      ...this.folders,
      ...this.originalQueries
        .map(query => query.folderPath || '')
        .filter(Boolean)
    ])
    const folderNames = new Set<string>()

    for (const folderPath of allFolders) {
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

  hasVisibleItems(): boolean {
    return this.getVisibleFolders().length > 0 || this.queries.length > 0
  }

  private replaceQuery(query: SavedQuery): void {
    this.originalQueries = this.originalQueries.map(item => item.id === query.id ? query : item)
    this.applyFilters()
  }

  private joinPath(basePath: string, folderName: string): string {
    return [basePath, folderName].filter(Boolean).join('/')
  }
}
