import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { AgGridAngular } from 'ag-grid-angular'
import { AllCommunityModule, ColDef, ModuleRegistry } from 'ag-grid-community'
import { ToastComponent } from '../../toast/toast.component'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { FixTableDataComponent } from '../fix-table-data/fix-table-data.component'

ModuleRegistry.registerModules([AllCommunityModule])

type TableInfoView = 'data' | 'columns' | 'keys' | 'indexes' | 'ddl'
type MetadataRow = Record<string, any>

@Component({
  selector: 'app-table-info',
  standalone: true,
  imports: [CommonModule, ToastComponent, FixTableDataComponent, AgGridAngular],
  templateUrl: './table-info.component.html',
  styleUrl: './table-info.component.scss'
})
export class TableInfoComponent implements OnInit, OnChanges {
  @Input() data: any
  @Input() widthTable: number = 300
  @Input() tabInfo: any
  @Input() elementName: string = ''

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
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  private activeView: TableInfoView = 'data'

  constructor(private IAPI: InternalApiService) { }

  ngOnInit(): void {
    void this.loadTableMetadata()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['elementName'] && !changes['elementName'].firstChange) {
      void this.loadTableMetadata()
    }
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

  private async loadTableMetadata(): Promise<void> {
    const context = this.tabInfo?.dbInfo || this.data
    if (!context?.sgbd || !context?.version || !this.elementName) {
      this.metadataError = 'No table context available.'
      return
    }

    this.isLoadingMetadata = true
    this.metadataError = ''

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

      this.columnsRows = this.normalizeRows(columns?.data || [])
      this.keysRows = this.normalizeRows(keys?.data || [])
      this.indexesRows = this.normalizeRows(indexes?.data || [])
      this.ddl = ddl?.ddl || ''

      this.refreshActiveRows()
    } catch (error: any) {
      console.error(error)
      this.metadataError = error?.error || error?.message || 'Could not load table metadata.'
    } finally {
      this.isLoadingMetadata = false
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
    this.activeView = view
    this.showData = view === 'data'
    this.showColumns = view === 'columns'
    this.showKeys = view === 'keys'
    this.showIndexes = view === 'indexes'
    this.showDDL = view === 'ddl'

    this.refreshActiveRows()
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
}
