import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { InputListComponent } from "../../elements/input-list/input-list.component"
import { ToastComponent } from "../../toast/toast.component"
import { QuerySaveService, SavedQuery, SavedQueryVersion } from '../../../services/query-save/query-save.service'
import {
  QueryLibraryBreadcrumbPart,
  QueryLibraryNavigatorService,
  QueryLibraryView
} from '../../../services/query-library/query-library-navigator.service'

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
  @Output() compare = new EventEmitter<any>()
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
  view: QueryLibraryView = {
    folders: [],
    queries: [],
    breadcrumbParts: [],
    currentFolderLabel: 'Queries',
    hasVisibleItems: false
  }
  private _sgbd: string = ''

  constructor(
    private IAPI: InternalApiService,
    private querySave: QuerySaveService,
    private navigator: QueryLibraryNavigatorService
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
    this.view = this.navigator.buildView(this.originalQueries, this.folders, this.currentFolderPath, {
      database: this._sgbd,
      queryName: this.queryName
    })
    this.queries = this.view.queries
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
    } catch (error: any) {
      this.toast.showToast(error?.error || error?.message || 'Could not restore query version', 'red')
    }
  }

  compareVersion(query: SavedQuery, version: SavedQueryVersion, event: MouseEvent): void {
    event.stopPropagation()
    this.compare.emit({ query, version })
  }

  openVersionCopy(query: SavedQuery, version: SavedQueryVersion, event: MouseEvent): void {
    event.stopPropagation()
    this.open.emit({
      name: `${query.name} - version ${version.id}`,
      type: 'sql',
      sql: version.sql,
      dbSchema: version.dbSchema || query.dbSchema,
      folderPath: query.folderPath || '',
      versioningEnabled: false,
      persisted: false
    })
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
    this.currentFolderPath = this.navigator.enterFolder(this.currentFolderPath, folderName)
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  goBack(): void {
    if (!this.currentFolderPath) return

    this.currentFolderPath = this.navigator.parentFolder(this.currentFolderPath)
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  goRoot(): void {
    this.currentFolderPath = ''
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  get currentFolderLabel(): string {
    return this.view.currentFolderLabel
  }

  get breadcrumbParts(): QueryLibraryBreadcrumbPart[] {
    return this.view.breadcrumbParts
  }

  openBreadcrumb(path: string): void {
    this.currentFolderPath = path
    this.expandedHistoryQueryId = null
    this.applyFilters()
  }

  getVisibleFolders(): string[] {
    return this.view.folders
  }

  hasVisibleItems(): boolean {
    return this.view.hasVisibleItems
  }

  private replaceQuery(query: SavedQuery): void {
    this.originalQueries = this.originalQueries.map(item => item.id === query.id ? query : item)
    this.applyFilters()
  }
}
