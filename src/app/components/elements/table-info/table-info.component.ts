import { AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, ViewEncapsulation } from '@angular/core'
import { CommonModule } from '@angular/common'
import { AgGridAngular } from 'ag-grid-angular'
import { AllCommunityModule, ColDef, GridApi, GridReadyEvent, ModuleRegistry } from 'ag-grid-community'
import { ToastComponent } from '../../toast/toast.component'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { TableDataQueryService } from '../../../services/table-data-query/table-data-query.service'
import { TableQueryComponent } from '../table-query/table-query.component'
import { AppLanguageService } from '../../../services/language/app-language.service'

ModuleRegistry.registerModules([AllCommunityModule])

type TableInfoView = 'data' | 'columns' | 'keys' | 'indexes' | 'ddl'
type MetadataRow = Record<string, any>

@Component({
  selector: 'app-table-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, TableQueryComponent, AgGridAngular],
  templateUrl: './table-info.component.html',
  styleUrl: './table-info.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TableInfoComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() data: any
  @Input() widthTable: number = 300
  @Input() tabInfo: any
  @Input() elementName: string = ''

  @ViewChild('metadataGridWrapper') metadataGridWrapper?: ElementRef<HTMLDivElement>

  showData: boolean = true
  showColumns: boolean = false
  showKeys: boolean = false
  showIndexes: boolean = false
  showDDL: boolean = false

  isLoadingMetadata: boolean = false
  columnsRows: MetadataRow[] = []
  keysRows: MetadataRow[] = []
  indexesRows: MetadataRow[] = []
  ddl: string = ''
  metadataError: string = ''

  activeRows: MetadataRow[] = []
  columnDefs: ColDef[] = []
  metadataGridHeight: string = '100%'
  dataRows: any[] = []
  dataColumns: string[] = []
  dataFetchSize: number = 50
  dataQueryLines: number = 50
  dataTotalRows: number | null = null
  dataExecutionTimeMs: number | null = null
  dataErrorMessage: string = ''
  dataResultHeight: number = 300
  dataFilterModel: Record<string, any> = {}
  isLoadingData: boolean = false
  isLoadingMoreData: boolean = false
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  private gridApi?: GridApi
  activeView: TableInfoView = 'data'
  private isRestoringGridState = false
  private metadataRequestId = 0
  private dataRequestId = 0
  private dataFilterSignature = '{}'
  private dataFilterTimeout: any

  constructor(
    private IAPI: InternalApiService,
    private runQuery: RunQueryService,
    private tableDataQuery: TableDataQueryService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    this.restoreTableInfoState()
    void this.loadTableMetadata()
    void this.loadTableData()
  }

  ngAfterViewInit(): void {
    this.queueGridResize()
  }

  ngOnDestroy(): void {
    clearTimeout(this.dataFilterTimeout)
    this.persistTableInfoState()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['elementName'] && !changes['elementName'].firstChange) ||
      (changes['tabInfo'] && !changes['tabInfo'].firstChange)
    ) {
      this.restoreTableInfoState()
      void this.loadTableMetadata()
      void this.loadTableData()
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.queueGridResize()
  }

  filterData(): void {
    this.setActiveView('data')
  }

  filterColumns(): void {
    this.setActiveView('columns')
  }

  filterKeys(): void {
    this.setActiveView('keys')
  }

  filterIndexes(): void {
    this.setActiveView('indexes')
  }

  filterDDL(): void {
    this.setActiveView('ddl')
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api
    this.restoreMetadataGridState()
    this.queueGridResize()
  }

  onMetadataGridStateChanged(): void {
    if (this.isRestoringGridState) return

    this.persistTableInfoState()
  }

  onDataFetchSizeChange(size: number): void {
    this.dataFetchSize = this.normalizeDataFetchSize(size)
    this.persistTableDataState()
  }

  async refreshTableDataWithFetchSize(): Promise<void> {
    this.dataQueryLines = this.dataFetchSize
    await this.loadTableData(true, false, false)
  }

  async loadMoreTableData(): Promise<void> {
    if (this.isLoadingData || this.isLoadingMoreData) return
    if (this.dataTotalRows === null || this.dataTotalRows === undefined) return
    if (this.dataRows.length >= this.dataTotalRows) return

    this.dataQueryLines += this.dataFetchSize
    await this.loadTableData(true, true)
  }

  onDataResultHeightChange(height: number): void {
    this.dataResultHeight = Math.max(120, Math.floor(Number(height) || 300))
    this.persistTableDataState()
  }

  onDataFilterModelChange(filterModel: Record<string, any>): void {
    const normalizedFilterModel = filterModel || {}
    const signature = JSON.stringify(normalizedFilterModel)
    if (signature === this.dataFilterSignature) return

    this.dataFilterModel = normalizedFilterModel
    this.dataFilterSignature = signature
    this.dataQueryLines = this.dataFetchSize
    this.persistTableDataState()

    clearTimeout(this.dataFilterTimeout)
    void this.loadTableData(true, false, false)
  }

  private async loadTableMetadata(): Promise<void> {
    const context = this.tabInfo?.dbInfo || this.data
    if (!context?.sgbd || !context?.version || !this.elementName) {
      this.columnsRows = []
      this.keysRows = []
      this.indexesRows = []
      this.ddl = ''
      this.refreshActiveRows()
      this.metadataError = this.t('tableInfo.noTableContext')
      return
    }

    const requestId = ++this.metadataRequestId
    this.isLoadingMetadata = true
    this.metadataError = ''
    this.columnsRows = []
    this.keysRows = []
    this.indexesRows = []
    this.ddl = ''
    this.refreshActiveRows()

    try {
      const tableName = encodeURIComponent(this.elementName)
      const queryString = context.connectionKey
        ? `?connectionKey=${encodeURIComponent(context.connectionKey)}`
        : ''
      const baseUrl = `/api/${context.sgbd}/${context.version}`

      const [columns, keys, indexes, ddl] = await Promise.all([
        this.getMetadata(`${baseUrl}/table-columns/${tableName}${queryString}`),
        this.getMetadata(`${baseUrl}/table-keys/${tableName}${queryString}`),
        this.getMetadata(`${baseUrl}/table-indexes/${tableName}${queryString}`),
        this.getMetadata(`${baseUrl}/table-ddl/${tableName}${queryString}`)
      ])

      if (requestId !== this.metadataRequestId) return

      this.columnsRows = this.normalizeRows(columns?.data || [])
      this.keysRows = this.normalizeRows(keys?.data || [])
      this.indexesRows = this.normalizeRows(indexes?.data || [])
      this.ddl = ddl?.ddl || ''

      this.refreshActiveRows()
      this.queueGridResize()
    } catch (error: any) {
      if (requestId !== this.metadataRequestId) return

      console.error(error)
      this.metadataError = error?.error || error?.message || this.t('tableInfo.loadMetadataFailed')
    } finally {
      if (requestId === this.metadataRequestId) {
        this.isLoadingMetadata = false
      }
    }
  }

  private async loadTableData(
    forceReload: boolean = false,
    append: boolean = false,
    clearBeforeLoad: boolean = true
  ): Promise<void> {
    const context = this.tabInfo?.dbInfo || this.data
    if (!context?.sgbd || !context?.version || !this.elementName) {
      this.dataRows = []
      this.dataColumns = []
      this.dataErrorMessage = this.t('tableInfo.noTableContext')
      return
    }

    if (!forceReload && this.restoreTableDataState()) {
      return
    }

    if (!forceReload) {
      this.resetTableDataControls()
    }

    const requestId = ++this.dataRequestId
    const sql = this.getTableDataSql()

    if (!append && clearBeforeLoad) {
      this.dataRows = []
      this.dataColumns = []
      this.dataTotalRows = null
      this.dataExecutionTimeMs = null
      this.dataErrorMessage = ''
    }

    if (!append) {
      this.isLoadingData = true
    } else {
      this.isLoadingMoreData = true
    }

    try {
      const start = performance.now()
      const rows = await this.runQuery.runSQL(sql, this.dataQueryLines, context)

      if (requestId !== this.dataRequestId) return

      this.dataRows = rows || []
      this.dataColumns = this.resolveDataColumns(this.runQuery.getQueryColumns(), this.dataRows)
      this.dataTotalRows = this.runQuery.getQueryLines()
      this.dataExecutionTimeMs = performance.now() - start
      this.dataErrorMessage = ''
      this.persistTableDataState()
    } catch (error: any) {
      if (requestId !== this.dataRequestId) return

      console.error(error)
      this.dataRows = []
      this.dataColumns = []
      this.dataTotalRows = null
      this.dataExecutionTimeMs = null
      this.dataErrorMessage = error?.error || error?.message || this.t('tableInfo.loadDataFailed')
      this.persistTableDataState()
    } finally {
      if (requestId === this.dataRequestId) {
        this.isLoadingData = false
        this.isLoadingMoreData = false
      }
    }
  }

  private async getMetadata(url: string): Promise<any> {
    try {
      const response = await this.IAPI.get<any>(url)
      return response?.success === false ? {} : response
    } catch (error) {
      console.error(error)
      return {}
    }
  }

  private setActiveView(view: TableInfoView): void {
    this.persistTableInfoState()

    this.activeView = view
    this.showData = view === 'data'
    this.showColumns = view === 'columns'
    this.showKeys = view === 'keys'
    this.showIndexes = view === 'indexes'
    this.showDDL = view === 'ddl'

    this.refreshActiveRows()
    this.persistTableInfoState()
    this.queueGridResize()
  }

  private refreshActiveRows(): void {
    if (this.activeView === 'columns') {
      this.activeRows = this.columnsRows
    } else if (this.activeView === 'keys') {
      this.activeRows = this.keysRows
    } else if (this.activeView === 'indexes') {
      this.activeRows = this.indexesRows
    } else {
      this.activeRows = []
    }

    this.columnDefs = this.buildColumnDefs(this.activeRows)
    this.gridApi?.setGridOption('columnDefs', this.columnDefs)
    this.gridApi?.setGridOption('rowData', this.activeRows)
    this.restoreMetadataGridState()
  }

  private restoreTableInfoState(): void {
    const tableInfoState = this.tabInfo?.tableInfoState
    const view = tableInfoState?.activeView as TableInfoView | undefined

    if (view && ['data', 'columns', 'keys', 'indexes', 'ddl'].includes(view)) {
      this.activeView = view
      this.showData = view === 'data'
      this.showColumns = view === 'columns'
      this.showKeys = view === 'keys'
      this.showIndexes = view === 'indexes'
      this.showDDL = view === 'ddl'
    }
  }

  private persistTableInfoState(): void {
    if (!this.tabInfo) return

    const existingState = this.tabInfo.tableInfoState || {}
    const gridStates = {
      ...(existingState.gridStates || {})
    }

    if (this.gridApi && !this.showData && !this.showDDL) {
      gridStates[this.activeView] = {
        filterModel: this.gridApi.getFilterModel(),
        columnState: this.gridApi.getColumnState()
      }
    }

    this.tabInfo.tableInfoState = {
      ...existingState,
      activeView: this.activeView,
      gridStates
    }
  }

  private restoreTableDataState(): boolean {
    const state = this.tabInfo?.tableDataState
    if (!state || state.tableKey !== this.getTableDataKey() || !state.loaded) return false

    this.dataRows = state.rows || []
    this.dataColumns = state.columns || []
    this.dataFetchSize = this.normalizeDataFetchSize(state.fetchSize ?? 50)
    this.dataQueryLines = this.normalizeDataFetchSize(state.queryLines ?? this.dataFetchSize)
    this.dataTotalRows = state.totalRows ?? null
    this.dataExecutionTimeMs = state.executionTimeMs ?? null
    this.dataErrorMessage = state.errorMessage || ''
    this.dataResultHeight = state.resultHeight ?? 300
    this.dataFilterModel = state.filterModel || {}
    this.dataFilterSignature = JSON.stringify(this.dataFilterModel)
    this.isLoadingData = false
    this.isLoadingMoreData = false

    return true
  }

  private persistTableDataState(): void {
    if (!this.tabInfo) return

    this.tabInfo.tableDataState = {
      tableKey: this.getTableDataKey(),
      loaded: true,
      rows: this.dataRows,
      columns: this.dataColumns,
      fetchSize: this.dataFetchSize,
      queryLines: this.dataQueryLines,
      totalRows: this.dataTotalRows,
      executionTimeMs: this.dataExecutionTimeMs,
      errorMessage: this.dataErrorMessage,
      resultHeight: this.dataResultHeight,
      filterModel: this.dataFilterModel
    }
  }

  private restoreMetadataGridState(): void {
    if (!this.gridApi || this.showData || this.showDDL) return

    const gridState = this.tabInfo?.tableInfoState?.gridStates?.[this.activeView]

    this.isRestoringGridState = true

    setTimeout(() => {
      if (gridState?.columnState?.length) {
        this.gridApi?.applyColumnState({
          state: gridState.columnState,
          applyOrder: true
        })
      }

      this.gridApi?.setFilterModel(gridState?.filterModel || null)

      this.isRestoringGridState = false
      this.queueGridResize()
    }, 0)
  }

  private queueGridResize(): void {
    requestAnimationFrame(() => this.syncGridHeight())
  }

  private syncGridHeight(): void {
    if (!this.metadataGridWrapper?.nativeElement || this.showData || this.showDDL) {
      return
    }

    const wrapper = this.metadataGridWrapper.nativeElement
    const panel = wrapper.closest('.table-info-panel') as HTMLElement | null
    const wrapperTop = wrapper.getBoundingClientRect().top
    const bottom = panel?.getBoundingClientRect().bottom ?? window.innerHeight
    const availableHeight = Math.max(260, Math.floor(bottom - wrapperTop))

    this.metadataGridHeight = `${availableHeight}px`
    wrapper.style.height = this.metadataGridHeight
    this.gridApi?.setGridOption('domLayout', 'normal')
  }

  private normalizeRows(rows: MetadataRow[]): MetadataRow[] {
    return rows.map((row) => {
      const normalized: MetadataRow = {}
      Object.entries(row || {}).forEach(([key, value]) => {
        normalized[this.normalizeKey(key)] = value
      })
      return normalized
    })
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase()
  }

  private buildColumnDefs(rows: MetadataRow[]): ColDef[] {
    const firstRow = rows[0]
    if (!firstRow) {
      return []
    }

    return Object.keys(firstRow).map((key) => ({
      headerName: this.formatHeader(key),
      field: key,
      flex: key === 'name' || key === 'column_name' || key === 'ddl' ? 1 : undefined,
      minWidth: key === 'ddl' ? 420 : 150,
      tooltipField: key
    }))
  }

  private formatHeader(key: string): string {
    return key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  getTableDataSql(): string {
    const context = this.tabInfo?.dbInfo || this.data
    return this.tableDataQuery.buildSelectSql(this.elementName, this.dataFilterModel, context)
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private getTableDataKey(): string {
    const context = this.tabInfo?.dbInfo || this.data || {}

    return [
      context.sgbd,
      context.version,
      context.connectionKey,
      context.database,
      context.schema,
      this.elementName
    ].filter((part) => part !== undefined && part !== null).join('\u001F')
  }

  private normalizeDataFetchSize(value: number): number {
    const normalizedValue = Math.floor(Number(value) || 50)
    return Math.max(1, normalizedValue)
  }

  private resetTableDataControls(): void {
    this.dataFetchSize = 50
    this.dataQueryLines = 50
    this.dataTotalRows = null
    this.dataExecutionTimeMs = null
    this.dataErrorMessage = ''
    this.dataFilterModel = {}
    this.dataFilterSignature = '{}'
  }

  private resolveDataColumns(columns: string[], rows: any[]): string[] {
    if (columns?.length) {
      return columns
    }

    if (rows?.length) {
      return Object.keys(rows[0] || {})
    }

    if (this.dataColumns.length) {
      return this.dataColumns
    }

    return this.columnsRows
      .map((column) => String(column['name'] || column['column_name'] || '').trim())
      .filter(Boolean)
  }
}
