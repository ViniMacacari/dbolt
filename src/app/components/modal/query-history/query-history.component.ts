import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { QuerySaveService, SavedQueryVersion } from '../../../services/query-save/query-save.service'
import { QueryDiffResult, QueryVersionDiffService } from '../../../services/query-version-diff/query-version-diff.service'

@Component({
  selector: 'app-query-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-history.component.html',
  styleUrl: './query-history.component.scss'
})
export class QueryHistoryComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() tabInfo: any
  @Input() currentSql = ''
  @Output() closed = new EventEmitter<void>()
  @Output() newFile = new EventEmitter<{ sql: string, name?: string, context?: any }>()
  @ViewChild('dialog') dialog!: ElementRef<HTMLElement>
  versions: SavedQueryVersion[] = []
  selected: SavedQueryVersion | null = null
  loading = false
  error = false
  closing = false
  private closeTimer?: ReturnType<typeof setTimeout>
  diff: QueryDiffResult = { lines: [], added: 0, removed: 0, unchanged: 0 }
  private destroyed = false
  private previousFocus = document.activeElement as HTMLElement | null

  constructor(private querySave: QuerySaveService, private differences: QueryVersionDiffService,
    private language: AppLanguageService) { }

  ngOnInit(): void { void this.load() }
  ngAfterViewInit(): void { this.dialog.nativeElement.focus() }
  ngOnDestroy(): void {
    this.destroyed = true
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.previousFocus?.focus()
  }

  async load(): Promise<void> {
    if (!this.tabInfo?.persisted) return
    this.loading = true
    this.error = false
    try {
      const versions = await this.querySave.loadVersions(Number(this.tabInfo.id))
      if (this.destroyed) return
      this.versions = [...versions].sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id - a.id)
      this.select(this.versions[0] || null)
    } catch {
      if (!this.destroyed) this.error = true
    } finally {
      if (!this.destroyed) this.loading = false
    }
  }

  select(version: SavedQueryVersion | null): void {
    this.selected = version
    this.diff = version ? this.differences.buildDiff(version.sql, this.currentSql)
      : { lines: [], added: 0, removed: 0, unchanged: 0 }
  }

  openCopy(): void {
    if (this.loading || this.error || this.closing) return
    this.close({
      sql: this.selected?.sql ?? this.currentSql,
      name: this.selected
        ? this.t('queryLibrary.versionName', { name: this.tabInfo?.name || '', version: this.selected.id })
        : `${this.tabInfo?.name || this.t('tabs.newQuery')} - ${this.t('queryHistory.copy')}`,
      context: this.selected?.dbSchema || this.tabInfo?.dbInfo
    })
  }

  openBlank(): void {
    this.close({ sql: '', context: this.tabInfo?.dbInfo })
  }

  close(file?: { sql: string, name?: string, context?: any }): void {
    if (this.closing || this.destroyed) return
    this.closing = true
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180
    this.closeTimer = setTimeout(() => {
      this.closed.emit()
      if (file) this.newFile.emit(file)
    }, duration)
  }

  onKeydown(event: KeyboardEvent): void {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close()
    }
    if (event.key !== 'Tab') return
    const elements = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
    const first = elements[0], last = elements[elements.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.dialog.nativeElement)) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === this.dialog.nativeElement)) {
      event.preventDefault(); first?.focus()
    }
  }

  formatDate(value: string): string { return this.querySave.formatDate(value) }
  t(key: string, params: Record<string, string | number> = {}): string { return this.language.translate(key, params) }
}
