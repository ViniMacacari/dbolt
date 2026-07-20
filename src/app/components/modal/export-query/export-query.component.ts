import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import {
  QueryResultExportPayload,
  QueryResultExportService
} from '../../../services/query-result-export/query-result-export.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

type QueryExportFormat = 'xlsx' | 'csv' | 'txt'

interface QueryExportColumn {
  source: string
  label: string
  selected: boolean
}

@Component({
  selector: 'app-export-query',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-query.component.html',
  styleUrl: './export-query.component.scss'
})
export class ExportQueryComponent implements OnInit {
  @Input() sql = ''
  @Input() dbContext: any
  @Input() availableColumns: string[] = []
  @Input() initialRowLimit = 50
  @Input() totalRows: number | null = null
  @Output() close = new EventEmitter<void>()

  rowLimit: number | null = 50
  format: QueryExportFormat = 'xlsx'
  columns: QueryExportColumn[] = []
  exporting = false
  errorMessage = ''

  constructor(
    private runQuery: RunQueryService,
    private resultExport: QueryResultExportService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    this.rowLimit = this.normalizeLimit(this.initialRowLimit)
    this.columns = this.availableColumns.map((column) => ({
      source: column,
      label: column,
      selected: true
    }))
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.exporting) this.close.emit()
  }

  onBackdropMouseDown(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.exporting) {
      this.close.emit()
    }
  }

  chooseFormat(format: QueryExportFormat): void {
    if (this.exporting) return
    this.format = format
  }

  selectAllColumns(selected: boolean): void {
    this.columns.forEach((column) => column.selected = selected)
    this.errorMessage = ''
  }

  setColumnSelected(column: QueryExportColumn, selected: boolean): void {
    column.selected = selected
    this.errorMessage = ''
  }

  get selectedColumnCount(): number {
    return this.columns.filter((column) => column.selected).length
  }

  get maxRowLimit(): number | null {
    if (this.totalRows === null || this.totalRows === undefined || this.totalRows < 1) return null
    return Math.floor(this.totalRows)
  }

  get canExport(): boolean {
    return !this.exporting &&
      !!this.sql.trim() &&
      this.selectedColumnCount > 0 &&
      this.isValidLimit(this.rowLimit)
  }

  onLimitBlur(): void {
    if (this.rowLimit === null || !Number.isFinite(Number(this.rowLimit))) return
    this.rowLimit = this.normalizeLimit(Number(this.rowLimit))
  }

  async export(): Promise<void> {
    if (this.exporting) return

    const selectedColumns = this.columns.filter((column) => column.selected)
    if (!selectedColumns.length) {
      this.errorMessage = this.t('exportQuery.selectColumnError')
      return
    }

    if (!this.isValidLimit(this.rowLimit)) {
      this.errorMessage = this.t('exportQuery.invalidLimitError')
      return
    }

    try {
      this.exporting = true
      this.errorMessage = ''

      const limit = this.normalizeLimit(Number(this.rowLimit))
      const result = await this.runQuery.runSQL(this.sql, limit, this.dbContext)
      const payload: QueryResultExportPayload = {
        columns: selectedColumns.map((column) => column.label.trim() || column.source),
        rows: result.map((row: any) => selectedColumns.map((column) => this.readColumnValue(row, column.source)))
      }

      if (this.format === 'csv') {
        this.resultExport.exportCsv(payload)
      } else if (this.format === 'txt') {
        this.resultExport.exportTxt(payload)
      } else {
        this.resultExport.exportXlsx(payload)
      }

      this.close.emit()
    } catch (error: any) {
      console.error(error)
      this.errorMessage = error?.error || error?.message || this.t('exportQuery.exportFailed')
    } finally {
      this.exporting = false
    }
  }

  trackByColumn(_index: number, column: QueryExportColumn): string {
    return column.source
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private normalizeLimit(value: number): number {
    const normalized = Math.max(1, Math.floor(Number(value) || 1))
    return this.maxRowLimit === null ? normalized : Math.min(normalized, this.maxRowLimit)
  }

  private isValidLimit(value: number | null): boolean {
    const parsed = Number(value)
    return value !== null && Number.isFinite(parsed) && parsed >= 1
  }

  private readColumnValue(row: any, source: string): any {
    if (!row || typeof row !== 'object') return ''
    if (Object.prototype.hasOwnProperty.call(row, source)) return row[source]

    const normalizedSource = source.toLocaleLowerCase()
    const matchingKey = Object.keys(row).find((key) => key.toLocaleLowerCase() === normalizedSource)
    return matchingKey ? row[matchingKey] : ''
  }
}
