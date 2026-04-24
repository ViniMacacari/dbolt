import { Component, Input, Output, EventEmitter, ViewChild, OnChanges, SimpleChanges, ViewEncapsulation } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { AgGridAngular } from 'ag-grid-angular'
import { AllCommunityModule, ColDef, GridApi, GridReadyEvent, ModuleRegistry, RowClickedEvent } from 'ag-grid-community'
import { ToastComponent } from '../../toast/toast.component'

ModuleRegistry.registerModules([AllCommunityModule])

type ObjectGroup = 'tables' | 'views' | 'procedures' | 'indexes'
type ObjectRow = Record<string, any>

@Component({
  selector: 'app-db-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, FormsModule, AgGridAngular],
  templateUrl: './db-info.component.html',
  styleUrl: './db-info.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DbInfoComponent implements OnChanges {
  @Input() data: any
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Output() moreInfo = new EventEmitter<any>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any

  @ViewChild(ToastComponent) toast!: ToastComponent

  showTables: boolean = true
  showViews: boolean = false
  showProcedures: boolean = false
  showIndexes: boolean = false

  filterTable: string = ''
  activeRows: ObjectRow[] = []
  activeGroup: ObjectGroup = 'tables'

  columnDefs: ColDef[] = []
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  private gridApi?: GridApi
  private readonly groupConfig: Record<ObjectGroup, {
    label: string
    singular: string
    searchPlaceholder: string
    emptyMessage: string
  }> = {
    tables: {
      label: 'Tables',
      singular: 'Table',
      searchPlaceholder: 'Search tables...',
      emptyMessage: 'No tables found'
    },
    views: {
      label: 'Views',
      singular: 'View',
      searchPlaceholder: 'Search views...',
      emptyMessage: 'No views found'
    },
    procedures: {
      label: 'Procedures',
      singular: 'Procedure',
      searchPlaceholder: 'Search procedures...',
      emptyMessage: 'No procedures found'
    },
    indexes: {
      label: 'Indexes',
      singular: 'Index',
      searchPlaceholder: 'Search indexes...',
      emptyMessage: 'No indexes found'
    }
  }

  ngOnInit(): void {
    this.updateColumns()
    this.refreshActiveRows()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.refreshActiveRows()
    }
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
    this.gridApi.setGridOption('quickFilterText', this.filterTable)
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

  applyFilterTable(): void {
    this.gridApi?.setGridOption('quickFilterText', this.filterTable)
  }

  get searchPlaceholder(): string {
    return this.groupConfig[this.activeGroup].searchPlaceholder
  }

  get emptyMessage(): string {
    return this.groupConfig[this.activeGroup].emptyMessage
  }

  private setActiveGroup(group: ObjectGroup): void {
    this.activeGroup = group
    this.filterTable = ''
    this.showTables = group === 'tables'
    this.showViews = group === 'views'
    this.showProcedures = group === 'procedures'
    this.showIndexes = group === 'indexes'

    this.updateColumns()
    this.refreshActiveRows()
    this.gridApi?.setGridOption('quickFilterText', '')
  }

  private refreshActiveRows(): void {
    this.activeRows = this.getRows(this.activeGroup).map((row, index) => this.normalizeObjectRow(row, index))
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
}
