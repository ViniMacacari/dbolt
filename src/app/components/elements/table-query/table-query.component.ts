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
import {
  QueryResultExportPayload,
  QueryResultExportService
} from '../../../services/query-result-export/query-result-export.service'

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

interface CellSelectionPoint {
  rowId: number
  field: string
}

interface CellSelectionContextMenu {
  x: number
  y: number
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
  private pendingInserts = new Map<number, Map<string, any>>()
  private selectedRows = new Set<number>()
  private editableTable: EditableTableTarget | null = null
  private nextInsertRowId = -1
  private selectedCellKeys = new Set<string>()
  private selectionAnchor: CellSelectionPoint | null = null
  private selectionEnd: CellSelectionPoint | null = null
  private isSelectingCells = false

  scrollTimeout: any

  columnDefs: ColDef[] = []
  displayRows: any[] = []
  editingEnabled = false
  editMetadataLoading = false
  editCapabilityMessage = ''
  editErrorMessage = ''
  copyErrorMessage = ''
  cellSelectionMenu: CellSelectionContextMenu | null = null
  isApplyingEdits = false
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }
  rowClassRules = {
    'dbolt-row-delete-preview': (params: any) => this.pendingDeletes.has(this.getRowId(params.data)),
    'dbolt-row-insert-preview': (params: any) => this.isInsertRow(this.getRowId(params.data))
  }

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService,
    private runQuery: RunQueryService,
    private resultExport: QueryResultExportService
  ) { }

  @Input()
  set query(value: any[]) {
    this.saveScrollPosition()
    this._query = value || []
    this.resetCellSelection()
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

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.isSelectingCells = false
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (!target.closest('.cell-selection-menu')) {
      this.cellSelectionMenu = null
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cellSelectionMenu = null
      this.isSelectingCells = false
      return
    }

    if (!this.isCopyShortcut(event) || !this.isEventInsideTable(event) || this.isTextEditingTarget(event.target)) {
      return
    }

    const payload = this.getSelectionPayload()
    if (!payload || payload.rows.length === 0) return

    event.preventDefault()
    this.copySelectedData()
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

  onGridCellMouseDown(event: any): void {
    const mouseEvent = event.event as MouseEvent
    const field = event.colDef?.field
    if (mouseEvent?.button !== 0 || !field || !event.data) return
    if (this.isTextEditingTarget(mouseEvent.target)) return

    const point = this.getSelectionPoint(event.data, field)
    if (!point) return

    this.copyErrorMessage = ''
    this.cellSelectionMenu = null
    this.isSelectingCells = true
    this.selectionAnchor = point
    this.selectionEnd = point
    this.updateSelectedCells()
    this.refreshVisibleGrid()
  }

  onGridCellMouseOver(event: any): void {
    if (!this.isSelectingCells) return

    const field = event.colDef?.field
    const point = field && event.data ? this.getSelectionPoint(event.data, field) : null
    if (!point) return

    this.selectionEnd = point
    this.updateSelectedCells()
    this.refreshVisibleGrid()
  }

  onGridCellContextMenu(event: any): void {
    const mouseEvent = event.event as MouseEvent
    const field = event.colDef?.field
    if (!mouseEvent || !field || !event.data) return

    mouseEvent.preventDefault()
    mouseEvent.stopPropagation()

    const point = this.getSelectionPoint(event.data, field)
    if (!point) return

    if (!this.isCellSelectedByPoint(point)) {
      this.selectionAnchor = point
      this.selectionEnd = point
      this.updateSelectedCells()
      this.refreshVisibleGrid()
    }

    this.cellSelectionMenu = {
      x: Math.max(8, Math.min(mouseEvent.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(mouseEvent.clientY, window.innerHeight - 145))
    }
  }

  async copySelectedData(): Promise<void> {
    await this.runSelectionExport((payload) => this.resultExport.copyData(payload))
  }

  async copySelectedTable(): Promise<void> {
    await this.runSelectionExport((payload) => this.resultExport.copyTable(payload))
  }

  exportSelectedXlsx(): void {
    const payload = this.getSelectionPayload()
    if (!payload) return

    this.resultExport.exportXlsx(payload, 'query-result-selection.xlsx')
    this.cellSelectionMenu = null
  }

  canStartEditing(): boolean {
    return this.isSelectResult &&
      !this.editMetadataLoading &&
      !!this.editableTable &&
      this.resultColumnsByField.size > 0
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
      if (this.isInsertRow(rowId)) {
        this.removeInsertedRow(rowId)
        return
      }

      this.pendingDeletes.add(rowId)
      this.pendingUpdates.delete(rowId)
    })
    this.selectedRows.clear()
    this.refreshVisibleGrid()
  }

  addRow(): void {
    if (!this.editingEnabled || !this.editableTable || this.resultColumnsByField.size === 0) return

    const rowId = this.nextInsertRowId--
    const newRow = this.getVisibleFields().reduce((row: any, field) => {
      row[field] = null
      return row
    }, {})

    this.displayRowIds.set(newRow, rowId)
    this.pendingInserts.set(rowId, new Map<string, any>())
    this.displayRows = [...this.displayRows, newRow]
    this.scrollTop = Number.MAX_SAFE_INTEGER
    this.updateColumns()

    window.requestAnimationFrame(() => {
      const rowIndex = this.displayRows.length - 1
      const firstEditableField = this.getVisibleFields().find((field) => this.resultColumnsByField.has(field))

      this.agGrid?.api?.ensureIndexVisible(rowIndex, 'bottom')
      this.agGrid?.api?.refreshCells({ force: true })

      if (firstEditableField) {
        this.agGrid?.api?.startEditingCell({ rowIndex, colKey: firstEditableField })
      }
    })
  }

  hasPendingChanges(): boolean {
    return this.pendingDeletes.size > 0 || this.pendingUpdates.size > 0 || this.pendingInserts.size > 0
  }

  getPendingChangeCount(): number {
    return this.pendingDeletes.size + this.pendingUpdates.size + this.pendingInserts.size
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

  private async runSelectionExport(action: (payload: QueryResultExportPayload) => Promise<void>): Promise<void> {
    const payload = this.getSelectionPayload()
    if (!payload) return

    try {
      this.copyErrorMessage = ''
      await action(payload)
      this.cellSelectionMenu = null
    } catch (error: any) {
      console.error(error)
      this.copyErrorMessage = error?.message || 'Could not copy selected cells.'
    }
  }

  private getSelectionPayload(): QueryResultExportPayload | null {
    if (this.selectedCellKeys.size === 0) return null

    const fields = this.getSelectedFields()
    const rowIds = this.getSelectedRowIds()
    if (fields.length === 0 || rowIds.length === 0) return null

    return {
      columns: fields,
      rows: rowIds.map((rowId) => {
        const row = this.getDisplayRowById(rowId)
        return fields.map((field) => row?.[field])
      })
    }
  }

  private getSelectionPoint(row: any, field: string): CellSelectionPoint | null {
    const rowId = this.getRowId(row)
    if (!Number.isFinite(rowId) || !this.getVisibleFields().includes(field)) return null

    return { rowId, field }
  }

  private updateSelectedCells(): void {
    this.selectedCellKeys.clear()
    if (!this.selectionAnchor || !this.selectionEnd) return

    const rowIds = this.getDisplayRowIds()
    const fields = this.getVisibleFields()
    const anchorRowIndex = rowIds.indexOf(this.selectionAnchor.rowId)
    const endRowIndex = rowIds.indexOf(this.selectionEnd.rowId)
    const anchorFieldIndex = fields.indexOf(this.selectionAnchor.field)
    const endFieldIndex = fields.indexOf(this.selectionEnd.field)

    if (anchorRowIndex < 0 || endRowIndex < 0 || anchorFieldIndex < 0 || endFieldIndex < 0) return

    const rowStart = Math.min(anchorRowIndex, endRowIndex)
    const rowEnd = Math.max(anchorRowIndex, endRowIndex)
    const fieldStart = Math.min(anchorFieldIndex, endFieldIndex)
    const fieldEnd = Math.max(anchorFieldIndex, endFieldIndex)

    rowIds.slice(rowStart, rowEnd + 1).forEach((rowId) => {
      fields.slice(fieldStart, fieldEnd + 1).forEach((field) => {
        this.selectedCellKeys.add(this.cellKey(rowId, field))
      })
    })
  }

  private getSelectedFields(): string[] {
    return this.getVisibleFields().filter((field) =>
      this.getDisplayRowIds().some((rowId) => this.selectedCellKeys.has(this.cellKey(rowId, field)))
    )
  }

  private getSelectedRowIds(): number[] {
    return this.getDisplayRowIds().filter((rowId) =>
      this.getVisibleFields().some((field) => this.selectedCellKeys.has(this.cellKey(rowId, field)))
    )
  }

  private getDisplayRowIds(): number[] {
    return this.displayRows
      .map((row) => this.getRowId(row))
      .filter((rowId) => Number.isFinite(rowId))
  }

  private getDisplayRowById(rowId: number): any {
    return this.displayRows.find((row) => this.getRowId(row) === rowId)
  }

  private isCellSelected(row: any, field: string): boolean {
    return this.selectedCellKeys.has(this.cellKey(this.getRowId(row), field))
  }

  private isSelectionAnchor(row: any, field: string): boolean {
    return this.selectionAnchor?.rowId === this.getRowId(row) && this.selectionAnchor?.field === field
  }

  private isCellSelectedByPoint(point: CellSelectionPoint): boolean {
    return this.selectedCellKeys.has(this.cellKey(point.rowId, point.field))
  }

  private resetCellSelection(): void {
    this.selectedCellKeys.clear()
    this.selectionAnchor = null
    this.selectionEnd = null
    this.isSelectingCells = false
    this.cellSelectionMenu = null
    this.copyErrorMessage = ''
  }

  private cellKey(rowId: number, field: string): string {
    return `${rowId}\u001F${field}`
  }

  private isCopyShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c'
  }

  private isEventInsideTable(event: Event): boolean {
    const target = event.target as Node | null
    return !!target && !!this.tableWrapper?.nativeElement?.contains(target)
  }

  private isTextEditingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null
    if (!element) return false

    const tagName = element.tagName?.toLowerCase()
    return tagName === 'input' ||
      tagName === 'textarea' ||
      element.isContentEditable ||
      !!element.closest('.ag-cell-inline-editing')
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

      const existingCellClass = columnDef.cellClass
      const existingClassRules = columnDef.cellClassRules || {}

      return {
        ...columnDef,
        editable: (params: any) => this.editingEnabled && !!this.getEditableMetaForCell(params.data, field),
        valueSetter: (params: any) => this.setEditableCellValue(params, field),
        cellClass: existingCellClass,
        cellClassRules: {
          ...existingClassRules,
          'dbolt-cell-edited': (params: any) => this.isCellEdited(params.data, field),
          'dbolt-cell-selected': (params: any) => this.isCellSelected(params.data, field),
          'dbolt-cell-selection-anchor': (params: any) => this.isSelectionAnchor(params.data, field),
          'dbolt-cell-readonly': (params: any) => this.editingEnabled && !this.getEditableMetaForCell(params.data, field)
        },
        tooltipValueGetter: (params: any) => {
          const editableMeta = this.getEditableMetaForCell(params.data, field)
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
        input.disabled = this.pendingDeletes.has(rowId) && !this.isInsertRow(rowId)
        input.title = input.disabled ? 'Pending delete' : 'Select row'
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
      this.editableTable = target
      columnMetas.forEach((column) => this.resultColumnsByField.set(column.resultField, column))
      editableColumns.forEach((column) => this.editableColumnsByField.set(column.resultField, column))
      this.editCapabilityMessage = editableColumns.length === 0
        ? 'Existing rows are read-only; add row is available.'
        : ''
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
    const meta = this.getEditableMetaForCell(params.data, field)
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

    if (this.isInsertRow(rowId)) {
      this.pendingInserts.get(rowId)?.set(field, parsed.value)
      window.requestAnimationFrame(() => this.agGrid?.api?.refreshCells({ force: false }))
      return true
    }

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

  private getEditableMetaForCell(row: any, field: string): EditableColumnMeta | null {
    if (this.isInsertRow(this.getRowId(row))) {
      return this.resultColumnsByField.get(field) || null
    }

    return this.editableColumnsByField.get(field) || null
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

    this.pendingInserts.forEach((values) => {
      statements.push(this.buildInsertStatement(tableName, values))
    })

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

  private buildInsertStatement(tableName: string, values: Map<string, any>): string {
    const columns = Array.from(values.entries())
      .map(([field, value]) => {
        const meta = this.resultColumnsByField.get(field)
        if (!meta) return null

        return {
          column: this.quoteIdentifier(meta.name),
          value: this.toSqlLiteral(value, meta)
        }
      })
      .filter(Boolean) as Array<{ column: string, value: string }>

    if (columns.length === 0) {
      return this.dbContext?.sgbd === 'MySQL'
        ? `INSERT INTO ${tableName} () VALUES ()`
        : `INSERT INTO ${tableName} DEFAULT VALUES`
    }

    return `INSERT INTO ${tableName} (${columns.map((item) => item.column).join(', ')}) VALUES (${columns.map((item) => item.value).join(', ')})`
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
    const rowId = this.getRowId(row)

    return this.pendingUpdates.get(rowId)?.has(field) ||
      this.pendingInserts.get(rowId)?.has(field) ||
      false
  }

  private toggleSelectedRow(rowId: number, selected: boolean): void {
    if (!Number.isFinite(rowId)) return

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
    this.pendingInserts.clear()
    this.selectedRows.clear()
    this.nextInsertRowId = -1
    this.editErrorMessage = ''
  }

  private removeInsertedRow(rowId: number): void {
    this.pendingInserts.delete(rowId)
    this.displayRows = this.displayRows.filter((row) => this.getRowId(row) !== rowId)
  }

  private getVisibleFields(): string[] {
    if (this.query.length > 0) {
      return Object.keys(this.query[0])
    }

    return this.columns.filter((column) => String(column || '').trim() !== '')
  }

  private getRowId(row: any): number {
    return this.displayRowIds.get(row) ?? Number.NaN
  }

  private isInsertRow(rowId: number): boolean {
    return Number.isFinite(rowId) && rowId < 0 && this.pendingInserts.has(rowId)
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
