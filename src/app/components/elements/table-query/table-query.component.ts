import {
  Component,
  Input,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  SimpleChanges,
  ChangeDetectorRef,
  EventEmitter,
  Output,
  NgZone
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { AgGridAngular } from 'ag-grid-angular'
import { ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import { buildTypedColumnDefs } from '../../../utils/grid-column-formatting'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { ConnectionContextService } from '../../../services/connection-context/connection-context.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'

ModuleRegistry.registerModules([AllCommunityModule])

type EditableColumnKind = 'string' | 'integer' | 'decimal' | 'boolean' | 'date'

interface EditableColumnMeta {
  name: string
  resultField: string
  type: string
  kind: EditableColumnKind
  primaryKey: boolean
}

interface EditableTableTarget {
  tableName: string
  qualifiedName: string
}

@Component({
  selector: 'app-table-query',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './table-query.component.html',
  styleUrls: ['./table-query.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class TableQueryComponent implements AfterViewInit {
  private _query: any[] = []
  private scrollTop = 0

  @Input() calcWidth: number = 300
  @Input() rowLimit: number = 50
  @Input() totalRows: number | null = null
  @Input() isSelectResult: boolean = false
  @Input() resultHeight: number = 300
  @Input() isExpanded: boolean = false
  @Input() isLoading: boolean = false
  @Input() isLoadingMore: boolean = false
  @Input() errorMessage: string = ''
  @Input() columns: string[] = []
  @Input() executedSql: string = ''
  @Input() dbContext: any

  @Output() newValuesQuery = new EventEmitter<void>()
  @Output() closeResult = new EventEmitter<void>()
  @Output() rowLimitChange = new EventEmitter<number>()
  @Output() refreshQuery = new EventEmitter<void>()
  @Output() resultHeightChange = new EventEmitter<number>()
  @Output() toggleExpanded = new EventEmitter<void>()

  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>
  @ViewChild('agGrid') agGrid!: AgGridAngular

  isElementVisible = false
  private resizeTimeout: any
  private isResizing = false
  private initialMouseY = 0
  private initialHeight = 0
  private initialTop = 0
  private initialBottom = 0
  private lastScrollTop = 0
  private rowData: any = []
  private columnSignature = ''
  private viewportRefreshTimeout: any
  private displayRowIds = new WeakMap<any, number>()
  private editMetadataSignature = ''
  private editableColumnsByField = new Map<string, EditableColumnMeta>()
  private resultColumnsByField = new Map<string, EditableColumnMeta>()
  private pendingUpdates = new Map<number, Map<string, any>>()
  private pendingDeletes = new Set<number>()
  private selectedRows = new Set<number>()
  private editableTable: EditableTableTarget | null = null

  scrollTimeout: any

  columnDefs: ColDef[] = []
  displayRows: any[] = []
  editingEnabled = false
  editMetadataLoading = false
  editCapabilityMessage = ''
  editErrorMessage = ''
  isApplyingEdits = false
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }
  rowClassRules = {
    'dbolt-row-delete-preview': (params: any) => this.pendingDeletes.has(this.getRowId(params.data))
  }

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService,
    private runQuery: RunQueryService
  ) { }

  @Input()
  set query(value: any[]) {
    this.saveScrollPosition()
    this._query = value || []
    this.resetEditPreview()
    this.rebuildDisplayRows()
    this.updateColumns()
    this.refreshEditCapability()
    this.queueViewportRefresh()
  }
  get query(): any[] {
    return this._query
  }

  @HostListener('window:resize')
  onResize() {
    clearTimeout(this.resizeTimeout)
    this.resizeTimeout = setTimeout(() => this.adjustTableWrapperSize(), 100)
  }

  ngAfterViewInit(): void {
    this.isElementVisible = true
    this.adjustTableWrapperSize()
    this.updateColumns()
    this.cdr.detectChanges()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['calcWidth'] || changes['resultHeight']) {
      this.adjustTableWrapperSize()
    }

    if (changes['columns']) {
      this.updateColumns()
    }

    if (changes['executedSql'] || changes['dbContext'] || changes['isSelectResult']) {
      this.resetEditPreview()
      this.refreshEditCapability()
      this.updateColumns()
    }
  }

  adjustTableWrapperSize() {
    // Keep AG Grid virtualisation intact. The browser updates the fixed viewport size.
  }

  onScroll(event: Event) {
    const wrapper = this.tableWrapper.nativeElement

    const currentScrollTop = Math.floor(wrapper.scrollTop)
    const currentScrollLeft = Math.floor(wrapper.scrollLeft)

    if (currentScrollTop === this.lastScrollTop) {
      return
    }

    const scrollHeight = Math.ceil(wrapper.scrollHeight)
    const clientHeight = Math.ceil(wrapper.clientHeight)

    const buffer = 10
    const isScrollingDown = currentScrollTop > this.lastScrollTop

    clearTimeout(this.scrollTimeout)

    this.scrollTimeout = setTimeout(() => {
      const isAtTop = currentScrollTop <= buffer
      const isAtBottom = currentScrollTop + clientHeight >= scrollHeight - buffer

      if (isAtTop) {
        console.log('Scrolled to the top')
      }

      if (isAtBottom && isScrollingDown) {
        console.log('Scrolled to the bottom')
        this.newValues()
      }

      this.lastScrollTop = currentScrollTop
    }, 100)
  }

  startResize(event: MouseEvent) {
    event.preventDefault()
    this.isResizing = true
    this.initialMouseY = event.clientY
    this.initialHeight = this.resultHeight

    document.addEventListener('mousemove', this.resize)
    document.addEventListener('mouseup', this.stopResize)
  }

  resize = (event: MouseEvent) => {
    if (!this.isResizing) return

    const deltaY = this.initialMouseY - event.clientY

    const newHeight = Math.max(this.initialHeight + deltaY, 100)

    this.resultHeightChange.emit(newHeight)
  }

  stopResize = () => {
    this.isResizing = false

    document.removeEventListener('mousemove', this.resize)
    document.removeEventListener('mouseup', this.stopResize)
  }

  getKeys(row: any): string[] {
    return row ? Object.keys(row) : []
  }

  getValues(row: any): any[] {
    return row ? Object.values(row) : []
  }

  newValues() {
    if (this.isLoadingMore || !this.canLoadMore()) return

    this.saveScrollPosition()
    this.newValuesQuery.emit()
  }

  onRowLimitInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.rowLimitChange.emit(Math.max(1, Math.floor(value)))
  }

  applyRowLimit(): void {
    this.refreshQuery.emit()
  }

  toggleResultSize(): void {
    this.toggleExpanded.emit()
  }

  close(): void {
    this.closeResult.emit()
  }

  canStartEditing(): boolean {
    return this.isSelectResult &&
      !this.editMetadataLoading &&
      !!this.editableTable &&
      this.editableColumnsByField.size > 0 &&
      this.query.length > 0
  }

  startEditing(): void {
    if (!this.canStartEditing()) return

    this.editingEnabled = true
    this.editErrorMessage = ''
    this.updateColumns()
  }

  cancelEditing(): void {
    this.editingEnabled = false
    this.resetEditPreview()
    this.rebuildDisplayRows()
    this.updateColumns()
    this.refreshVisibleGrid()
  }

  markSelectedRowsForDelete(): void {
    if (!this.editingEnabled || this.selectedRows.size === 0) return

    this.selectedRows.forEach((rowId) => {
      this.pendingDeletes.add(rowId)
      this.pendingUpdates.delete(rowId)
    })
    this.selectedRows.clear()
    this.refreshVisibleGrid()
  }

  hasPendingChanges(): boolean {
    return this.pendingDeletes.size > 0 || this.pendingUpdates.size > 0
  }

  getPendingChangeCount(): number {
    return this.pendingDeletes.size + this.pendingUpdates.size
  }

  getSelectedRowCount(): number {
    return this.selectedRows.size
  }

  async applyPendingChanges(): Promise<void> {
    if (!this.editingEnabled || !this.hasPendingChanges() || !this.editableTable || this.isApplyingEdits) return

    this.isApplyingEdits = true
    this.editErrorMessage = ''

    try {
      const statements = this.buildPendingStatements()

      for (const statement of statements) {
        await this.runQuery.runSQL(statement, null, this.dbContext)
      }

      this.editingEnabled = false
      this.resetEditPreview()
      this.refreshQuery.emit()
    } catch (error: any) {
      console.error(error)
      this.editErrorMessage = error?.error || error?.message || 'Could not apply result changes.'
    } finally {
      this.isApplyingEdits = false
    }
  }

  refreshVisibleGrid(): void {
    window.requestAnimationFrame(() => {
      this.agGrid?.api?.refreshCells({ force: false })
      this.agGrid?.api?.redrawRows()
    })
  }

  onBodyScroll(event: any) {
    if (this.isLoadingMore || !this.canLoadMore()) return

    const bodyViewport = this.getBodyViewport()

    if (bodyViewport) {
      const scrollTop = bodyViewport.scrollTop
      const scrollHeight = bodyViewport.scrollHeight
      const clientHeight = bodyViewport.clientHeight
      this.scrollTop = scrollTop

      const tolerance = 5

      if (scrollTop + clientHeight >= scrollHeight - tolerance) {
        this.newValues()
      }
    }
  }

  saveScrollPosition() {
    const bodyViewport = this.getBodyViewport()
    if (bodyViewport) {
      this.scrollTop = bodyViewport.scrollTop
    }
  }

  restoreScrollPosition() {
    const bodyViewport = this.getBodyViewport()
    if (bodyViewport) {
      bodyViewport.scrollTop = this.scrollTop
    }
  }

  private updateColumns() {
    const normalizedColumns = this.columns.filter((column) => String(column || '').trim() !== '')

    if (this.query.length === 0) {
      const signature = [
        normalizedColumns.join('\u001F'),
        this.editingEnabled ? 'editing' : 'readonly',
        this.editableColumnsByField.size
      ].join('\u001E')
      if (signature === this.columnSignature) return

      this.columnSignature = signature
      this.columnDefs = this.decorateColumnDefs(this.buildEmptyResultColumnDefs(normalizedColumns))
      return
    }

    const signature = [
      Object.keys(this.query[0]).join('\u001F'),
      this.editingEnabled ? 'editing' : 'readonly',
      Array.from(this.editableColumnsByField.keys()).join('\u001F'),
      this.pendingDeletes.size
    ].join('\u001E')
    if (signature === this.columnSignature) return

    this.columnSignature = signature
    this.columnDefs = this.decorateColumnDefs(buildTypedColumnDefs(this.query, 90))
  }

  private buildEmptyResultColumnDefs(columns: string[]): ColDef[] {
    if (columns.length === 0) return []

    return [
      {
        headerName: '#',
        valueGetter: 'node.rowIndex + 1',
        pinned: 'left',
        filter: false,
        width: 90
      },
      ...columns.map((column) => ({
        field: column,
        headerName: column.trim()
      }))
    ]
  }

  private decorateColumnDefs(columnDefs: ColDef[]): ColDef[] {
    const decoratedColumns = columnDefs.map((columnDef) => {
      const field = columnDef.field
      if (!field) return columnDef

      const editableMeta = this.editableColumnsByField.get(field)
      const existingCellClass = columnDef.cellClass
      const existingClassRules = columnDef.cellClassRules || {}

      return {
        ...columnDef,
        editable: () => this.editingEnabled && !!editableMeta,
        valueSetter: (params: any) => this.setEditableCellValue(params, field),
        cellClass: existingCellClass,
        cellClassRules: {
          ...existingClassRules,
          'dbolt-cell-edited': (params: any) => this.isCellEdited(params.data, field),
          'dbolt-cell-readonly': () => this.editingEnabled && !editableMeta
        },
        tooltipValueGetter: () => {
          if (!this.editingEnabled) return null
          if (!editableMeta) return 'Read-only in result editor'
          return `Type: ${editableMeta.type}`
        }
      }
    })

    if (!this.editingEnabled) {
      return decoratedColumns
    }

    return [
      this.buildSelectionColumnDef(),
      ...decoratedColumns
    ]
  }

  private buildSelectionColumnDef(): ColDef {
    return {
      headerName: '',
      pinned: 'left',
      width: 46,
      minWidth: 46,
      maxWidth: 46,
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      cellClass: ['dbolt-row-selector-cell'],
      cellRenderer: (params: any) => {
        const rowId = this.getRowId(params.data)
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = this.selectedRows.has(rowId)
        input.disabled = this.pendingDeletes.has(rowId)
        input.title = this.pendingDeletes.has(rowId) ? 'Pending delete' : 'Select row'
        input.addEventListener('click', (event) => {
          event.stopPropagation()
          this.toggleSelectedRow(rowId, input.checked)
        })

        return input
      }
    }
  }

  private async refreshEditCapability(): Promise<void> {
    this.editErrorMessage = ''

    if (!this.isSelectResult || !this.executedSql || !this.dbContext?.sgbd || !this.dbContext?.version) {
      this.clearEditMetadata()
      this.editCapabilityMessage = ''
      this.editMetadataSignature = ''
      return
    }

    const target = this.resolveEditableTableTarget(this.executedSql)
    if (!target) {
      this.clearEditMetadata()
      this.editCapabilityMessage = 'Editing is available only for simple SELECTs from one table.'
      this.editMetadataSignature = ''
      return
    }

    const visibleFields = this.getVisibleFields()
    if (visibleFields.length === 0) {
      this.clearEditMetadata()
      this.editCapabilityMessage = ''
      this.editMetadataSignature = ''
      return
    }

    const signature = [
      this.dbContext.sgbd,
      this.dbContext.version,
      this.dbContext.connectionKey,
      target.tableName,
      visibleFields.join('\u001F')
    ].join('\u001E')

    if (signature === this.editMetadataSignature) return
    this.editMetadataSignature = signature
    this.clearEditMetadata()
    this.editMetadataLoading = true
    this.editCapabilityMessage = 'Loading edit metadata...'

    try {
      const queryString = this.connectionContext.toQueryString(this.dbContext)
      const tableName = encodeURIComponent(target.tableName)
      const [columnsResponse, keysResponse]: any[] = await Promise.all([
        this.IAPI.get(`/api/${this.dbContext.sgbd}/${this.dbContext.version}/table-columns/${tableName}${queryString}`),
        this.IAPI.get(`/api/${this.dbContext.sgbd}/${this.dbContext.version}/table-keys/${tableName}${queryString}`)
      ])

      if (signature !== this.editMetadataSignature) return

      if (!columnsResponse?.success) {
        throw new Error(columnsResponse?.message || columnsResponse?.error || 'Could not load table columns.')
      }

      if (!keysResponse?.success) {
        throw new Error(keysResponse?.message || keysResponse?.error || 'Could not load table keys.')
      }

      const columnMetas = this.buildEditableColumnMetas(columnsResponse.data || [], keysResponse.data || [], visibleFields)
      const primaryKeys = columnMetas.filter((column) => column.primaryKey)
      const missingPrimaryKeys = this.getPrimaryKeyNames(keysResponse.data || [])
        .filter((primaryKey) => !columnMetas.some((column) => column.primaryKey && this.sameIdentifier(column.name, primaryKey)))

      if (primaryKeys.length === 0 || missingPrimaryKeys.length > 0) {
        this.editCapabilityMessage = 'Include the primary key columns in the SELECT to edit or delete rows.'
        this.updateColumns()
        return
      }

      const editableColumns = columnMetas.filter((column) => !column.primaryKey)
      if (editableColumns.length === 0) {
        this.editCapabilityMessage = 'No editable table columns are present in this result.'
        this.updateColumns()
        return
      }

      this.editableTable = target
      columnMetas.forEach((column) => this.resultColumnsByField.set(column.resultField, column))
      editableColumns.forEach((column) => this.editableColumnsByField.set(column.resultField, column))
      this.editCapabilityMessage = ''
      this.updateColumns()
    } catch (error: any) {
      console.error(error)
      this.editMetadataSignature = ''
      this.editableTable = null
      this.editableColumnsByField.clear()
      this.resultColumnsByField.clear()
      this.editCapabilityMessage = error?.error || error?.message || 'Could not prepare result editing.'
      this.updateColumns()
    } finally {
      if (signature === this.editMetadataSignature) {
        this.editMetadataLoading = false
      }
    }
  }

  private clearEditMetadata(): void {
    this.editableColumnsByField.clear()
    this.resultColumnsByField.clear()
    this.editableTable = null
    this.editingEnabled = false
  }

  private buildEditableColumnMetas(columns: any[], keys: any[], visibleFields: string[]): EditableColumnMeta[] {
    const primaryKeys = this.getPrimaryKeyNames(keys)

    return columns
      .map((column: any) => {
        const name = String(column.name || column.NAME || '').trim()
        if (!name) return null

        const resultField = visibleFields.find((field) => this.sameIdentifier(field, name))
        if (!resultField) return null

        const type = String(column.type || column.TYPE || '').trim()
        const kind = this.getEditableColumnKind(type)
        if (!kind) return null

        return {
          name,
          resultField,
          type,
          kind,
          primaryKey: primaryKeys.some((primaryKey) => this.sameIdentifier(primaryKey, name))
        }
      })
      .filter(Boolean) as EditableColumnMeta[]
  }

  private getPrimaryKeyNames(keys: any[]): string[] {
    return keys
      .filter((key) => String(key.type || key.TYPE || '').toUpperCase() === 'PRIMARY KEY')
      .map((key) => String(key.column_name || key.COLUMN_NAME || '').trim())
      .filter((column) => column.length > 0)
  }

  private getEditableColumnKind(type: string): EditableColumnKind | null {
    const normalizedType = type.toLowerCase()

    if (/\b(blob|binary|varbinary|bytea|image)\b/.test(normalizedType)) return null
    if (/\b(bool|boolean|bit)\b/.test(normalizedType)) return 'boolean'
    if (/\b(tinyint|smallint|integer|int|bigint|serial|bigserial)\b/.test(normalizedType)) return 'integer'
    if (/\b(decimal|numeric|number|float|double|real|money|smallmoney|dec|smalldecimal)\b/.test(normalizedType)) return 'decimal'
    if (/\b(date|time|timestamp|datetime)\b/.test(normalizedType)) return 'date'

    return 'string'
  }

  private setEditableCellValue(params: any, field: string): boolean {
    const meta = this.editableColumnsByField.get(field)
    if (!this.editingEnabled || !meta) return false

    const rowId = this.getRowId(params.data)
    if (this.pendingDeletes.has(rowId)) return false

    const parsed = this.parseEditableValue(params.newValue, meta)
    if (!parsed.valid) {
      this.editErrorMessage = parsed.message || `Invalid value for ${field}.`
      return false
    }

    this.editErrorMessage = ''
    params.data[field] = parsed.value

    const originalValue = this.query[rowId]?.[field]
    let rowUpdates = this.pendingUpdates.get(rowId)
    if (!rowUpdates) {
      rowUpdates = new Map<string, any>()
      this.pendingUpdates.set(rowId, rowUpdates)
    }

    if (this.valuesMatch(originalValue, parsed.value, meta)) {
      rowUpdates.delete(field)
    } else {
      rowUpdates.set(field, parsed.value)
    }

    if (rowUpdates.size === 0) {
      this.pendingUpdates.delete(rowId)
    }

    window.requestAnimationFrame(() => this.agGrid?.api?.refreshCells({ force: false }))
    return true
  }

  private parseEditableValue(value: any, meta: EditableColumnMeta): { valid: boolean, value?: any, message?: string } {
    if (value === null || value === undefined) {
      return { valid: true, value: null }
    }

    const rawValue = String(value).trim()
    if (rawValue.toLowerCase() === 'null') {
      return { valid: true, value: null }
    }

    if (meta.kind === 'integer') {
      if (!/^-?\d+$/.test(rawValue)) {
        return { valid: false, message: `${meta.name} expects an integer value.` }
      }

      const parsed = Number(rawValue)
      return Number.isSafeInteger(parsed)
        ? { valid: true, value: parsed }
        : { valid: false, message: `${meta.name} is outside the supported integer range.` }
    }

    if (meta.kind === 'decimal') {
      const normalizedValue = rawValue.replace(',', '.')
      if (!/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
        return { valid: false, message: `${meta.name} expects a numeric value.` }
      }

      const parsed = Number(normalizedValue)
      return Number.isFinite(parsed)
        ? { valid: true, value: parsed }
        : { valid: false, message: `${meta.name} expects a numeric value.` }
    }

    if (meta.kind === 'boolean') {
      const normalizedValue = rawValue.toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(normalizedValue)) return { valid: true, value: true }
      if (['false', '0', 'no', 'n'].includes(normalizedValue)) return { valid: true, value: false }

      return { valid: false, message: `${meta.name} expects true/false or 1/0.` }
    }

    if (meta.kind === 'date' && rawValue && Number.isNaN(Date.parse(rawValue))) {
      return { valid: false, message: `${meta.name} expects a valid date/time value.` }
    }

    return { valid: true, value: rawValue }
  }

  private buildPendingStatements(): string[] {
    const statements: string[] = []
    const tableName = this.editableTable?.qualifiedName
    if (!tableName) return statements

    this.pendingUpdates.forEach((updates, rowId) => {
      if (updates.size === 0 || this.pendingDeletes.has(rowId)) return

      const assignments = Array.from(updates.entries())
        .map(([field, value]) => {
          const meta = this.editableColumnsByField.get(field)
          if (!meta) return null

          return `${this.quoteIdentifier(meta.name)} = ${this.toSqlLiteral(value, meta)}`
        })
        .filter(Boolean)

      if (assignments.length === 0) return

      statements.push(`UPDATE ${tableName} SET ${assignments.join(', ')} WHERE ${this.buildPrimaryKeyWhere(rowId)}`)
    })

    this.pendingDeletes.forEach((rowId) => {
      statements.push(`DELETE FROM ${tableName} WHERE ${this.buildPrimaryKeyWhere(rowId)}`)
    })

    return statements
  }

  private buildPrimaryKeyWhere(rowId: number): string {
    const row = this.query[rowId]
    const primaryKeyColumns = this.getPrimaryKeyMetas()

    return primaryKeyColumns
      .map((meta) => {
        const value = row?.[meta.resultField]
        if (value === null || value === undefined) {
          return `${this.quoteIdentifier(meta.name)} IS NULL`
        }

        return `${this.quoteIdentifier(meta.name)} = ${this.toSqlLiteral(value, meta)}`
      })
      .join(' AND ')
  }

  private getPrimaryKeyMetas(): EditableColumnMeta[] {
    const fields = this.getVisibleFields()
    const visibleMetas = fields
      .map((field) => this.getColumnMetaForField(field))
      .filter(Boolean) as EditableColumnMeta[]

    return visibleMetas.filter((meta) => meta.primaryKey)
  }

  private getColumnMetaForField(field: string): EditableColumnMeta | null {
    const directMeta = this.resultColumnsByField.get(field)
    if (directMeta) return directMeta

    const resultFields = Array.from(this.resultColumnsByField.values())
    return resultFields.find((meta) => this.sameIdentifier(meta.resultField, field)) || null
  }

  private toSqlLiteral(value: any, meta: EditableColumnMeta): string {
    if (value === null || value === undefined) return 'NULL'

    if (meta.kind === 'integer' || meta.kind === 'decimal') {
      return String(value)
    }

    if (meta.kind === 'boolean') {
      if (this.dbContext?.sgbd === 'SqlServer') {
        return value ? '1' : '0'
      }

      return value ? 'TRUE' : 'FALSE'
    }

    return `'${String(value).replace(/'/g, "''")}'`
  }

  private isCellEdited(row: any, field: string): boolean {
    return this.pendingUpdates.get(this.getRowId(row))?.has(field) || false
  }

  private toggleSelectedRow(rowId: number, selected: boolean): void {
    if (rowId < 0) return

    if (selected) {
      this.selectedRows.add(rowId)
    } else {
      this.selectedRows.delete(rowId)
    }

    this.refreshVisibleGrid()
  }

  private rebuildDisplayRows(): void {
    this.displayRowIds = new WeakMap<any, number>()
    this.displayRows = this.query.map((row, index) => {
      const displayRow = { ...row }
      this.displayRowIds.set(displayRow, index)
      return displayRow
    })
  }

  private resetEditPreview(): void {
    this.pendingUpdates.clear()
    this.pendingDeletes.clear()
    this.selectedRows.clear()
    this.editErrorMessage = ''
  }

  private getVisibleFields(): string[] {
    if (this.query.length > 0) {
      return Object.keys(this.query[0])
    }

    return this.columns.filter((column) => String(column || '').trim() !== '')
  }

  private getRowId(row: any): number {
    return this.displayRowIds.get(row) ?? -1
  }

  private valuesMatch(left: any, right: any, meta: EditableColumnMeta): boolean {
    if ((left === null || left === undefined) && (right === null || right === undefined)) return true

    if (meta.kind === 'integer' || meta.kind === 'decimal') {
      return Number(left) === Number(right)
    }

    if (meta.kind === 'boolean') {
      return this.normalizeBoolean(left) === this.normalizeBoolean(right)
    }

    return String(left ?? '') === String(right ?? '')
  }

  private normalizeBoolean(value: any): boolean | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value

    const normalizedValue = String(value).trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalizedValue)) return true
    if (['false', '0', 'no', 'n'].includes(normalizedValue)) return false

    return null
  }

  private resolveEditableTableTarget(sql: string): EditableTableTarget | null {
    const normalizedSql = this.stripSqlComments(sql).trim().replace(/;+\s*$/g, '')
    if (!/^select\b/i.test(normalizedSql)) return null
    if (normalizedSql.includes(';')) return null

    if (/\b(distinct|join|union|intersect|except|group\s+by|having)\b/i.test(normalizedSql)) {
      return null
    }

    const fromMatch = normalizedSql.match(/\bfrom\s+(.+?)(?:\s+where\b|\s+order\s+by\b|\s+limit\b|\s+offset\b|\s+fetch\b|$)/i)
    const fromSource = fromMatch?.[1]?.trim()
    if (!fromSource || fromSource.startsWith('(') || fromSource.includes(',')) return null

    const sourceParts = fromSource.split(/\s+/)
    const tableExpression = sourceParts[0]
    const identifierParts = this.parseIdentifierParts(tableExpression)
    const tableName = identifierParts[identifierParts.length - 1]
    if (!tableName) return null

    return {
      tableName,
      qualifiedName: identifierParts.map((part) => this.quoteIdentifier(part)).join('.')
    }
  }

  private parseIdentifierParts(identifier: string): string[] {
    return identifier
      .split('.')
      .map((part) => part.trim())
      .map((part) => part.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').replace(/^`|`$/g, ''))
      .filter((part) => part.length > 0)
  }

  private stripSqlComments(sql: string): string {
    return (sql || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n\r]*/g, ' ')
  }

  private sameIdentifier(left: string, right: string): boolean {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
  }

  private quoteIdentifier(identifier: string): string {
    const value = String(identifier || '')

    if (this.dbContext?.sgbd === 'MySQL') {
      return `\`${value.replace(/`/g, '``')}\``
    }

    if (this.dbContext?.sgbd === 'SqlServer') {
      return `[${value.replace(/]/g, ']]')}]`
    }

    return `"${value.replace(/"/g, '""')}"`
  }

  private getBodyViewport(): HTMLElement | null {
    return this.tableWrapper?.nativeElement.querySelector('.ag-body-viewport')
  }

  private queueViewportRefresh(): void {
    clearTimeout(this.viewportRefreshTimeout)

    this.viewportRefreshTimeout = setTimeout(() => {
      this.restoreScrollPosition()

      window.requestAnimationFrame(() => {
        this.agGrid?.api?.refreshCells({ force: false })
        this.restoreScrollPosition()
      })
    })
  }

  private canLoadMore(): boolean {
    if (this.editingEnabled || this.hasPendingChanges()) return false

    return !this.isSelectResult || this.totalRows === null || this.query.length < this.totalRows
  }
}
