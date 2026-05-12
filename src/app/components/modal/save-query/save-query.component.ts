import { Component, EventEmitter, Output, Input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ToastComponent } from "../../toast/toast.component"
import { QuerySaveService, SavedQuery } from '../../../services/query-save/query-save.service'
import {
  QueryLibraryBreadcrumbPart,
  QueryLibraryNavigatorService,
  QueryLibraryView
} from '../../../services/query-library/query-library-navigator.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

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
  view: QueryLibraryView = {
    folders: [],
    queries: [],
    breadcrumbParts: [],
    currentFolderLabel: '',
    hasVisibleItems: false
  }

  constructor(
    private querySave: QuerySaveService,
    private navigator: QueryLibraryNavigatorService,
    private language: AppLanguageService
  ) { }

  get maxQueryNameLength(): number {
    return this.querySave.maxQueryNameLength
  }

  async ngOnInit(): Promise<void> {
    this.queryName = this.data?.name || ''
    this.currentFolderPath = this.querySave.normalizeFolderPath(this.data?.folderPath || '')
    this.versioningEnabled = Boolean(this.data?.versioningEnabled)

    try {
      this.folders = await this.querySave.loadFolders()
      this.refreshFolderView()
    } catch (error) {
      console.warn('Could not load query folders:', error)
      this.refreshFolderView()
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
        this.toast.showToast(this.t('saveQuery.nameRequired'), 'red')
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
      this.toast.showToast(error?.error || error?.message || this.t('saveQuery.saveFailed'), 'red')
    }
  }

  openFolder(folderName: string): void {
    this.currentFolderPath = this.navigator.enterFolder(this.currentFolderPath, folderName)
    this.creatingFolder = false
    this.refreshFolderView()
  }

  goBack(): void {
    if (!this.currentFolderPath) return

    this.currentFolderPath = this.navigator.parentFolder(this.currentFolderPath)
    this.creatingFolder = false
    this.refreshFolderView()
  }

  goRoot(): void {
    this.currentFolderPath = ''
    this.creatingFolder = false
    this.refreshFolderView()
  }

  createFolder(): void {
    const folderName = this.newFolderName.trim()
    if (!folderName) return

    const newPath = this.navigator.enterFolder(this.currentFolderPath, folderName)
    if (!this.folders.includes(newPath)) {
      this.folders = [...this.folders, newPath].sort((left, right) => left.localeCompare(right))
    }

    this.currentFolderPath = newPath
    this.newFolderName = ''
    this.creatingFolder = false
    this.refreshFolderView()
  }

  get currentFolderLabel(): string {
    return this.currentFolderPath ? this.view.currentFolderLabel : this.t('queryLibrary.root')
  }

  get breadcrumbParts(): QueryLibraryBreadcrumbPart[] {
    return this.view.breadcrumbParts
  }

  openBreadcrumb(path: string): void {
    this.currentFolderPath = path
    this.creatingFolder = false
    this.refreshFolderView()
  }

  getVisibleFolders(): string[] {
    return this.view.folders
  }

  private refreshFolderView(): void {
    this.view = this.navigator.buildView([], this.folders, this.currentFolderPath, {
      database: '',
      queryName: ''
    })
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
