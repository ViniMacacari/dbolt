import { AfterViewInit, Component, ElementRef, HostListener, Input, Output, EventEmitter, ViewChild, OnChanges, OnDestroy, SimpleChanges, ViewEncapsulation } from '@angular/core'
import { CommonModule } from '@angular/common'
import { AgGridAngular } from 'ag-grid-angular'
import { AllCommunityModule, ColDef, GridApi, GridReadyEvent, ModuleRegistry, RowClickedEvent } from 'ag-grid-community'
import { ToastComponent } from '../../toast/toast.component'

ModuleRegistry.registerModules([AllCommunityModule])

type ObjectGroup = 'tables' | 'views' | 'procedures' | 'indexes'
type ObjectRow = Record<string, any>

@Component({
  selector: 'app-db-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, AgGridAngular],
  templateUrl: './db-info.component.html',
  styleUrl: './db-info.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DbInfoComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: any
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Output() moreInfo = new EventEmitter<any>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any

  @ViewChild('gridWrapper') gridWrapper!: ElementRef<HTMLDivElement>
  @ViewChild(ToastComponent) toast!: ToastComponent

  showTables: boolean = true
  showViews: boolean = false
  showProcedures: boolean = false
  showIndexes: boolean = false

  activeRows: ObjectRow[] = []
  activeGroup: ObjectGroup = 'tables'
  gridHeight: string = '100%'

  columnDefs: ColDef[] = []
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  private gridApi?: GridApi
  private isRestoringGridState = false
  private readonly groupConfig: Record<ObjectGroup, {
    label: string
    singular: string
    emptyMessage: string
  }> = {
    tables: {
      label: 'Tables',
      singular: 'Table',
      emptyMessage: 'No tables found'
    },
    views: {
      label: 'Views',
      singular: 'View',
      emptyMessage: 'No views found'
    },
    procedures: {
      label: 'Procedures',
      singular: 'Procedure',
      emptyMessage: 'No procedures found'
    },
    indexes: {
      label: 'Indexes',
      singular: 'Index',
      emptyMessage: 'No indexes found'
    }
  }

  ngOnInit(): void {
    this.restoreDbInfoState()
    this.updateColumns()
    this.refreshActiveRows()
  }

  ngAfterViewInit(): void {
    this.syncGridHeight()
  }

  ngOnDestroy(): void {
    this.persistDbInfoState()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['data'] && !changes['data'].firstChange) ||
      (changes['tabInfo'] && !changes['tabInfo'].firstChange)
    ) {
      this.restoreDbInfoState()
      this.updateColumns()
      this.refreshActiveRows()
      this.queueGridResize()
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.queueGridResize()
  }

  filterTables(): void {
    this.setActiveGroup('tables')
  }

  filterViews(): void {
    this.setActiveGroup('views')
  }

  filterProcedures(): void {
    this.setActiveGroup('procedures')
  }

  filterIndexes(): void {
    this.setActiveGroup('indexes')
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api
    this.restoreGridState()
    this.queueGridResize()
  }

  onGridStateChanged(): void {
    if (this.isRestoringGridState) return

    this.persistDbInfoState()
  }

  onRowClicked(event: RowClickedEvent<ObjectRow>): void {
    if (event.data) {
      this.tableInfo(event.data)
    }
  }

  tableInfo(tabInfo: ObjectRow): void {
    if (!tabInfo['name']) {
      return
    }

    this.moreInfo.emit({
      ...tabInfo,
      info: this.data?.connection
    })
  }

  get emptyMessage(): string {
    return this.groupConfig[this.activeGroup].emptyMessage
  }

  private setActiveGroup(group: ObjectGroup): void {
    this.persistDbInfoState()

    this.activeGroup = group
    this.showTables = group === 'tables'
    this.showViews = group === 'views'
    this.showProcedures = group === 'procedures'
    this.showIndexes = group === 'indexes'

    this.updateColumns()
    this.refreshActiveRows()
    this.persistDbInfoState()
    this.queueGridResize()
  }

  private refreshActiveRows(): void {
    this.activeRows = this.getRows(this.activeGroup).map((row, index) => this.normalizeObjectRow(row, index))
    this.gridApi?.setGridOption('columnDefs', this.columnDefs)
    this.gridApi?.setGridOption('rowData', this.activeRows)
    this.restoreGridState()
  }

  private restoreDbInfoState(): void {
    const dbInfoState = this.tabInfo?.dbInfoState
    const group = dbInfoState?.activeGroup as ObjectGroup | undefined

    if (group && ['tables', 'views', 'procedures', 'indexes'].includes(group)) {
      this.activeGroup = group
      this.showTables = group === 'tables'
      this.showViews = group === 'views'
      this.showProcedures = group === 'procedures'
      this.showIndexes = group === 'indexes'
    }
  }

  private persistDbInfoState(): void {
    if (!this.tabInfo) return

    const existingState = this.tabInfo.dbInfoState || {}
    const gridStates = {
      ...(existingState.gridStates || {})
    }

    if (this.gridApi) {
      gridStates[this.activeGroup] = {
        filterModel: this.gridApi.getFilterModel(),
        columnState: this.gridApi.getColumnState()
      }
    }

    this.tabInfo.dbInfoState = {
      ...existingState,
      activeGroup: this.activeGroup,
      gridStates
    }
  }

  private restoreGridState(): void {
    if (!this.gridApi) return

    const gridState = this.tabInfo?.dbInfoState?.gridStates?.[this.activeGroup]

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

  private getRows(group: ObjectGroup): ObjectRow[] {
    return this.data?.[group] || []
  }

  private normalizeObjectRow(row: ObjectRow, index: number): ObjectRow {
    const name = this.readString(row, ['name', 'NAME', 'table_name', 'TABLE_NAME', 'index_name', 'INDEX_NAME'])
    const table = this.readString(row, ['table', 'TABLE', 'table_name', 'TABLE_NAME'])
    const indexType = this.readString(row, ['index_type', 'INDEX_TYPE', 'type_desc', 'TYPE_DESC'])

    return {
      ...row,
      id: row['id'] || [this.activeGroup, table, name || index].filter(Boolean).join(':'),
      name,
      objectType: this.groupConfig[this.activeGroup].singular,
      table,
      index_type: indexType
    }
  }

  private readString(row: ObjectRow, keys: string[]): string {
    for (const key of keys) {
      const value = row[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value)
      }
    }

    return ''
  }

  private updateColumns(): void {
    const columns: ColDef[] = [
      {
        headerName: 'Name',
        field: 'name',
        flex: 1,
        minWidth: 260,
        tooltipField: 'name'
      },
      {
        headerName: 'Type',
        field: 'objectType',
        width: 140
      }
    ]

    if (this.activeGroup === 'indexes') {
      columns.splice(1, 0, {
        headerName: 'Table',
        field: 'table',
        flex: 1,
        minWidth: 220,
        tooltipField: 'table'
      })

      columns.push({
        headerName: 'Index Type',
        field: 'index_type',
        width: 180
      })
    }

    this.columnDefs = columns
  }

  private queueGridResize(): void {
    requestAnimationFrame(() => this.syncGridHeight())
  }

  private syncGridHeight(): void {
    if (!this.gridWrapper?.nativeElement) {
      return
    }

    const wrapper = this.gridWrapper.nativeElement
    const content = wrapper.closest('.user-content') as HTMLElement | null
    const wrapperTop = wrapper.getBoundingClientRect().top
    const bottom = content?.getBoundingClientRect().bottom ?? window.innerHeight
    const availableHeight = Math.max(260, Math.floor(bottom - wrapperTop))

    this.gridHeight = `${availableHeight}px`
    wrapper.style.height = this.gridHeight
  }
}
