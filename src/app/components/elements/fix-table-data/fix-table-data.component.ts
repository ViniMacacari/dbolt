import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
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
import { ColDef, ModuleRegistry, AllCommunityModule, GridApi, GridReadyEvent } from 'ag-grid-community'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from "../../modal/loading/loading.component"
import { buildTypedColumnDefs } from '../../../utils/grid-column-formatting'

ModuleRegistry.registerModules([AllCommunityModule])

@Component({
  selector: 'app-fix-table-data',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './fix-table-data.component.html',
  styleUrl: './fix-table-data.component.scss'
})
export class FixTableDataComponent implements AfterViewInit, OnDestroy {
  private _query: any[] = []
  private scrollTop = 0

  @Input() calcWidth: number = 300
  @Input() elementName: string = ''
  @Input() tabInfo: any

  @Output() newValuesQuery = new EventEmitter<void>()

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
  private gridApi?: GridApi
  private isRestoringGridState = false

  scrollTimeout: any
  maxResultLines: number | null = 0
  queryLines: number = 50

  columnDefs: ColDef[] = []
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private IAPI: InternalApiService,
    private runQuery: RunQueryService
  ) { }

  @Input()
  set query(value: any[]) {
    this.saveScrollPosition()
    this._query = value
    setTimeout(() => {
      this.restoreScrollPosition()
    })
  }
  get query(): any[] {
    return this._query
  }

  @HostListener('window:resize')
  onResize() {
    clearTimeout(this.resizeTimeout)
    this.resizeTimeout = setTimeout(() => this.adjustTableWrapperSize(), 100)
  }

  async ngAfterViewInit(): Promise<void> {
    const restored = this.restoreTableState()
    if (!restored) {
      await this.getTableInfo()
    }

    this.isElementVisible = true
    this.adjustTableWrapperSize()
    this.updateColumns()
    this.restoreGridState()
    this.cdr.detectChanges()
  }

  ngOnDestroy(): void {
    this.persistTableState()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['calcWidth']) {
      setTimeout(() => this.adjustTableWrapperSize(), 100)
    }
    this.updateColumns()
  }

  adjustTableWrapperSize() {
    const wrapper = this.tableWrapper.nativeElement

    const screenWidth = window.innerWidth

    if (this.calcWidth === 0) {
      this.calcWidth = 300
    }

    const adjustedWidth = screenWidth - this.calcWidth

    if (adjustedWidth > 0) {
      wrapper.style.width = `${adjustedWidth}px`
      if (!this.isResizing) {
        wrapper.style.height = `300px`
      }
      wrapper.style.overflowX = 'auto'
      wrapper.style.overflowY = 'auto'
      wrapper.style.resize = 'vertical'
    } else {
      console.warn('Invalid adjusted dimensions:', { adjustedWidth })
    }
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

      }

      if (isAtBottom && isScrollingDown) {
        this.newValues()
      }

      this.lastScrollTop = currentScrollTop
    }, 100)
  }

  getKeys(row: any): string[] {
    return row ? Object.keys(row) : []
  }

  getValues(row: any): any[] {
    return row ? Object.values(row) : []
  }

  async newValues(): Promise<void> {
    this.saveScrollPosition()
    await this.newLines()
    this.restoreScrollPosition()
  }

  onBodyScroll(event: any) {
    const bodyViewport = this.getBodyViewport()

    if (bodyViewport) {
      const scrollTop = bodyViewport.scrollTop
      const scrollHeight = bodyViewport.scrollHeight
      const clientHeight = bodyViewport.clientHeight

      const tolerance = 5

      if (scrollTop + clientHeight >= scrollHeight - tolerance) {
        console.log('Reached the bottom of the grid!')
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

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api
    this.restoreGridState()
  }

  onGridStateChanged(): void {
    if (this.isRestoringGridState) return

    this.persistTableState()
  }

  private updateColumns() {
    if (this.query.length > 0) {
      this.columnDefs = buildTypedColumnDefs(this.query, 50)
    }
  }

  async getTableInfo(): Promise<void> {
    try {
      const result: any = await this.runQuery.runSQL('select * from ' + this.elementName, this.queryLines, this.tabInfo?.dbInfo)
      const maxLines: any = this.runQuery.getQueryLines()

      this.maxResultLines = maxLines
    this.query = result
    this.persistTableState()
    } catch (error: any) {
      console.log(error)
    }
  }

  async newLines(): Promise<void> {
    if (this.query.length >= (this.maxResultLines || 0)) return

    LoadingComponent.show()

    try {
      this.queryLines += 50
      const result: any = await this.runQuery.runSQL('select * from ' + this.elementName, this.queryLines, this.tabInfo?.dbInfo)
    this.query = result
    this.persistTableState()
    } catch (error: any) {
      console.error(error)
    }

    LoadingComponent.hide()
  }

  private restoreTableState(): boolean {
    const tableState = this.tabInfo?.tableDataState
    if (!tableState) return false

    this.query = tableState.query || []
    this.queryLines = tableState.queryLines ?? 50
    this.maxResultLines = tableState.maxResultLines ?? 0
    this.scrollTop = tableState.scrollTop ?? 0

    return this.query.length > 0
  }

  private persistTableState(): void {
    if (!this.tabInfo) return

    this.saveScrollPosition()

    this.tabInfo.tableDataState = {
      query: this.query,
      queryLines: this.queryLines,
      maxResultLines: this.maxResultLines,
      scrollTop: this.scrollTop,
      filterModel: this.gridApi?.getFilterModel(),
      columnState: this.gridApi?.getColumnState()
    }
  }

  private restoreGridState(): void {
    const tableState = this.tabInfo?.tableDataState
    if (!this.gridApi || !tableState) return

    this.isRestoringGridState = true

    setTimeout(() => {
      if (tableState.columnState?.length) {
        this.gridApi?.applyColumnState({
          state: tableState.columnState,
          applyOrder: true
        })
      }

      if (tableState.filterModel) {
        this.gridApi?.setFilterModel(tableState.filterModel)
      }

      this.restoreScrollPosition()
      this.isRestoringGridState = false
    }, 0)
  }

  private getBodyViewport(): HTMLElement | null {
    return this.tableWrapper?.nativeElement?.querySelector('.ag-body-viewport') || null
  }
}
