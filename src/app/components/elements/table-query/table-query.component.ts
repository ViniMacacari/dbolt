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

ModuleRegistry.registerModules([AllCommunityModule])

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

  scrollTimeout: any

  columnDefs: ColDef[] = []
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) { }

  @Input()
  set query(value: any[]) {
    this.saveScrollPosition()
    this._query = value || []
    this.updateColumns()
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

  refreshVisibleGrid(): void {
    window.requestAnimationFrame(() => {
      this.agGrid?.api?.refreshCells({ force: false })
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
      const signature = normalizedColumns.join('\u001F')
      if (signature === this.columnSignature) return

      this.columnSignature = signature
      this.columnDefs = this.buildEmptyResultColumnDefs(normalizedColumns)
      return
    }

    const signature = Object.keys(this.query[0]).join('\u001F')
    if (signature === this.columnSignature) return

    this.columnSignature = signature
    this.columnDefs = buildTypedColumnDefs(this.query, 90)
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
    return !this.isSelectResult || this.totalRows === null || this.query.length < this.totalRows
  }
}
