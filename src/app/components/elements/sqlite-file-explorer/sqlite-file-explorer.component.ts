import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { AppLanguageService } from '../../../services/language/app-language.service'
import { InternalApiService } from '../../../services/requests/internal-api.service'

type SQLiteFileSystemItem = {
  name: string
  path: string
  type: 'directory' | 'file'
  extension: string
}

type SQLiteFileSystemListing = {
  currentPath: string
  parentPath: string | null
  roots: SQLiteFileSystemItem[]
  items: SQLiteFileSystemItem[]
}

@Component({
  selector: 'app-sqlite-file-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sqlite-file-explorer.component.html',
  styleUrls: ['./sqlite-file-explorer.component.scss']
})
export class SQLiteFileExplorerComponent implements OnChanges {
  @Input() selectedPath: string = ''
  @Output() selectedPathChange = new EventEmitter<string>()

  currentPath: string = ''
  parentPath: string | null = null
  roots: SQLiteFileSystemItem[] = []
  items: SQLiteFileSystemItem[] = []
  searchValue: string = ''
  isOpen: boolean = false
  isLoading: boolean = false
  errorMessage: string = ''

  constructor(
    private IAPI: InternalApiService,
    private language: AppLanguageService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedPath']) {
      this.selectedPath = changes['selectedPath'].currentValue || ''
    }
  }

  get filteredItems(): SQLiteFileSystemItem[] {
    const query = this.searchValue.toLowerCase().trim()

    if (!query) {
      return this.items
    }

    return this.items.filter(item => item.name.toLowerCase().includes(query))
  }

  async openExplorer(): Promise<void> {
    this.isOpen = true
    await this.loadPath(this.selectedPath || this.currentPath)
  }

  closeExplorer(): void {
    this.isOpen = false
    this.searchValue = ''
    this.errorMessage = ''
  }

  async openParent(): Promise<void> {
    if (!this.parentPath) return
    await this.loadPath(this.parentPath)
  }

  async openRoot(root: SQLiteFileSystemItem): Promise<void> {
    await this.loadPath(root.path)
  }

  async openDirectory(item: SQLiteFileSystemItem): Promise<void> {
    if (item.type !== 'directory') return
    await this.loadPath(item.path)
  }

  selectFile(item: SQLiteFileSystemItem): void {
    if (item.type !== 'file') return

    this.selectedPath = item.path
    this.selectedPathChange.emit(item.path)
    this.closeExplorer()
  }

  private async loadPath(path: string = ''): Promise<void> {
    this.isLoading = true
    this.errorMessage = ''

    try {
      const query = path ? `?path=${encodeURIComponent(path)}` : ''
      const result = await this.IAPI.get<SQLiteFileSystemListing>(`/api/sqlite-files${query}`)
      this.currentPath = result.currentPath
      this.parentPath = result.parentPath
      this.roots = result.roots
      this.items = result.items
    } catch (error: any) {
      this.errorMessage = error?.message || error?.error || this.t('sqliteExplorer.loadFailed')
      this.items = []
    } finally {
      this.isLoading = false
    }
  }

  t(key: string): string {
    return this.language.translate(key)
  }
}
