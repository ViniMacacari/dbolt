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
import { ColDef, ModuleRegistry, AllCommunityModule, GridApi } from 'ag-grid-community'
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { LoadingComponent } from "../../modal/loading/loading.component"
import { ToastComponent } from "../../toast/toast.component"

ModuleRegistry.registerModules([AllCommunityModule])

@Component({
  selector: 'app-fix-table-data',
  standalone: true,
  imports: [CommonModule, AgGridAngular, LoadingComponent, ToastComponent],
  templateUrl: './fix-table-data.component.html',
  styleUrl: './fix-table-data.component.scss'
})
export class FixTableDataComponent {
  private _query: any[] = []
  private scrollTop = 0

  @Input() calcWidth: number = 300
  @Input() elementName: string = ''

  @Output() newValuesQuery = new EventEmitter<void>()

  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>
  @ViewChild('agGrid') agGrid!: AgGridAngular
  @ViewChild(ToastComponent) toast!: ToastComponent

  isElementVisible = false
  private resizeTimeout: any
  private isResizing = false
  private initialMouseY = 0
  private initialHeight = 0
  private initialTop = 0
  private initialBottom = 0
  private lastScrollTop = 0
  private rowData: any = []
  private gridApi!: GridApi

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
    await this.getTableInfo()
    this.isElementVisible = true
    this.adjustTableWrapperSize()
    this.updateColumns()
    this.cdr.detectChanges()
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
        console.log('Scrolled to the top')
      }

      if (isAtBottom && isScrollingDown) {
        console.log('Scrolled to the bottom')
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
    const bodyViewport = document.querySelector('.ag-body-viewport') as HTMLElement

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
    const bodyViewport = document.querySelector('.ag-body-viewport') as HTMLElement
    if (bodyViewport) {
      this.scrollTop = bodyViewport.scrollTop
    }
  }

  restoreScrollPosition() {
    const bodyViewport = document.querySelector('.ag-body-viewport') as HTMLElement
    if (bodyViewport) {
      bodyViewport.scrollTop = this.scrollTop
    }
  }

  private updateColumns() {
    if (this.query.length > 0) {
      this.columnDefs = [
        {
          headerName: '#',
          valueGetter: 'node.rowIndex + 1',
          pinned: 'left',
          filter: false,
          width: 50
        },
        ...Object.keys(this.query[0]).map((key) => ({ field: key }))
      ]
    }
  }

  async getTableInfo(): Promise<void> {
    try {
      const result: any = await this.runQuery.runSQL('select * from ' + this.elementName, this.queryLines)
      const maxLines: any = this.runQuery.getQueryLines()

      this.maxResultLines = maxLines
      this.query = result

      console.log(result)
    } catch (error: any) {
      console.log(error)
    }
  }

  async newLines(): Promise<void> {
    console.log(this.query.length, this.maxResultLines)
    if (this.query.length >= (this.maxResultLines || 0)) return

    LoadingComponent.show()

    try {
      this.queryLines += 50
      const result: any = await this.runQuery.runSQL('select * from ' + this.elementName, this.queryLines)
      this.query = result
    } catch (error: any) {
      console.log(error)
      this.toast.showToast(error.error, 'red')
    }

    LoadingComponent.hide()
  }
}
