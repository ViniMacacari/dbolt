import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewEncapsulation } from '@angular/core'
import { AgGridAngular } from 'ag-grid-angular'
import { AllCommunityModule, ColDef, GridApi, GridReadyEvent, ModuleRegistry } from 'ag-grid-community'

import { DatabaseMetadataService } from '../../../services/db-metadata/database-metadata.service'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { ButtonComponent } from '../button/button.component'

ModuleRegistry.registerModules([AllCommunityModule])

export interface SqlObjectSummaryRequest {
  name: string
  schema?: string
  context: any
  objectType?: 'table' | 'view'
}

type SummaryView = 'columns' | 'ddl'
type SummaryRow = Record<string, any>

@Component({
  selector: 'app-sql-object-summary',
  standalone: true,
  imports: [CommonModule, AgGridAngular, ButtonComponent],
  templateUrl: './sql-object-summary.component.html',
  styleUrl: './sql-object-summary.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class SqlObjectSummaryComponent implements OnChanges {
  @Input({ required: true }) request!: SqlObjectSummaryRequest
  @Output() closed = new EventEmitter<void>()

  activeView: SummaryView = 'columns'
  rows: SummaryRow[] = []
  columnDefs: ColDef[] = []
  objectType: 'table' | 'view' = 'table'
  filterText: string = ''
  ddl: string = ''
  loadingColumns: boolean = false
  loadingDdl: boolean = false
  columnsError: string = ''
  ddlError: string = ''

  readonly defaultColDef: ColDef = {
    filter: true,
    resizable: true,
    sortable: true
  }

  private gridApi?: GridApi
  private columnsRequestId = 0
  private ddlRequestId = 0
  private ddlLoadedFor = ''

  constructor(
    private databaseMetadata: DatabaseMetadataService,
    private language: AppLanguageService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['request']) return

    this.activeView = 'columns'
    this.filterText = ''
    this.ddl = ''
    this.ddlError = ''
    this.ddlLoadedFor = ''
    this.ddlRequestId += 1
    this.objectType = this.request?.objectType === 'view' ? 'view' : 'table'
    this.gridApi?.setGridOption('quickFilterText', '')
    void this.loadSummary()
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close()
  }

  get isView(): boolean {
    return this.objectType === 'view'
  }

  get contextLabel(): string {
    const context = this.request?.context || {}
    return [context.database, this.request?.schema || context.schema]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' / ')
  }

  get filteredRowCount(): number {
    return this.gridApi?.getDisplayedRowCount() ?? this.rows.length
  }

  close(): void {
    this.closed.emit()
  }

  showColumns(): void {
    this.activeView = 'columns'
  }

  async showDdl(): Promise<void> {
    if (!this.isView) return

    this.activeView = 'ddl'
    const objectKey = this.getObjectKey()
    if (this.ddlLoadedFor === objectKey) return

    const requestId = ++this.ddlRequestId
    this.loadingDdl = true
    this.ddlError = ''

    try {
      const ddl = await this.databaseMetadata.loadTableDDL(this.request.context, this.request.name)
      if (requestId !== this.ddlRequestId) return

      this.ddl = ddl
      this.ddlLoadedFor = objectKey
    } catch (error: any) {
      if (requestId !== this.ddlRequestId) return

      this.ddl = ''
      this.ddlError = error?.error || error?.message || this.t('sqlObjectSummary.loadDdlFailed')
    } finally {
      if (requestId === this.ddlRequestId) {
        this.loadingDdl = false
      }
    }
  }

  async loadSummary(): Promise<void> {
    if (!this.request?.context || !this.request?.name) {
      this.rows = []
      this.columnDefs = []
      this.columnsError = this.t('sqlObjectSummary.noContext')
      return
    }

    const requestId = ++this.columnsRequestId
    this.loadingColumns = true
    this.columnsError = ''
    this.rows = []
    this.columnDefs = []

    try {
      const summary = await this.databaseMetadata.loadTableColumnSummary(
        this.request.context,
        this.request.name
      )
      if (requestId !== this.columnsRequestId) return

      this.rows = this.normalizeRows(summary.columns)
      this.objectType = summary.objectType
      this.columnDefs = this.buildColumnDefs(this.rows)
      this.gridApi?.setGridOption('columnDefs', this.columnDefs)
      this.gridApi?.setGridOption('rowData', this.rows)
    } catch (error: any) {
      if (requestId !== this.columnsRequestId) return

      this.rows = []
      this.columnDefs = []
      this.columnsError = error?.error || error?.message || this.t('sqlObjectSummary.loadColumnsFailed')
    } finally {
      if (requestId === this.columnsRequestId) {
        this.loadingColumns = false
      }
    }
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api
    this.gridApi.setGridOption('quickFilterText', this.filterText)
  }

  onFilterInput(event: Event): void {
    this.filterText = (event.target as HTMLInputElement | null)?.value || ''
    this.gridApi?.setGridOption('quickFilterText', this.filterText)
  }

  clearFilter(): void {
    this.filterText = ''
    this.gridApi?.setGridOption('quickFilterText', '')
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private normalizeRows(rows: SummaryRow[]): SummaryRow[] {
    return (rows || []).map((row) => {
      const normalized: SummaryRow = {}
      Object.entries(row || {}).forEach(([key, value]) => {
        normalized[key.toLowerCase()] = value
      })
      return normalized
    })
  }

  private buildColumnDefs(rows: SummaryRow[]): ColDef[] {
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
      .filter((key) => key !== 'object_type')
    const preferredKeys = [
      'ordinal_position',
      'name',
      'type',
      'is_nullable',
      'default_value',
      'column_default',
      'comment'
    ]
    const orderedKeys = [
      ...preferredKeys.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !preferredKeys.includes(key))
    ]

    return orderedKeys.map((key) => ({
      field: key,
      headerName: this.getColumnHeader(key),
      width: this.getColumnWidth(key),
      minWidth: this.getColumnMinWidth(key),
      maxWidth: key === 'ordinal_position' ? 72 : undefined,
      tooltipField: key
    }))
  }

  private getColumnWidth(key: string): number {
    const widths: Record<string, number> = {
      ordinal_position: 66,
      name: 190,
      type: 180,
      is_nullable: 105,
      default_value: 220,
      column_default: 220,
      comment: 260
    }

    return widths[key] || 170
  }

  private getColumnMinWidth(key: string): number {
    const minimumWidths: Record<string, number> = {
      ordinal_position: 58,
      name: 150,
      type: 140,
      is_nullable: 90,
      default_value: 160,
      column_default: 160,
      comment: 180
    }

    return minimumWidths[key] || 130
  }

  private getColumnHeader(key: string): string {
    const translationKeys: Record<string, string> = {
      ordinal_position: 'sqlObjectSummary.position',
      name: 'sqlObjectSummary.column',
      type: 'sqlObjectSummary.type',
      is_nullable: 'sqlObjectSummary.nullable',
      default_value: 'sqlObjectSummary.defaultValue',
      column_default: 'sqlObjectSummary.defaultValue',
      comment: 'sqlObjectSummary.comment'
    }
    const translationKey = translationKeys[key]
    if (translationKey) return this.t(translationKey)

    return key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  private getObjectKey(): string {
    const context = this.request?.context || {}
    return [
      context.connectionKey,
      context.database,
      this.request?.schema || context.schema,
      this.request?.name
    ].map((part) => String(part || '')).join('\u001F')
  }
}
