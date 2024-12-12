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
import { ColDef, ModuleRegistry, AllCommunityModule, GridOptions } from 'ag-grid-community'

// Registrar módulos do AG Grid
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
  @Input() query: any[] = []
  @Input() calcWidth: number = 300

  @Output() newValuesQuery = new EventEmitter<void>()

  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>

  isElementVisible = false
  private resizeTimeout: any
  private isResizing = false
  private initialMouseY = 0
  private initialHeight = 0
  private initialTop = 0
  private initialBottom = 0
  private lastScrollTop = 0

  scrollTimeout: any

  // Configurações do AG Grid
  columnDefs: ColDef[] = []
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true
  }
  
  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) { }

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

  startResize(event: MouseEvent) {
    this.isResizing = true
    this.initialMouseY = event.clientY
    const wrapper = this.tableWrapper.nativeElement
    this.initialHeight = wrapper.offsetHeight
    this.initialBottom = window.innerHeight - wrapper.offsetTop - wrapper.offsetHeight

    document.addEventListener('mousemove', this.resize)
    document.addEventListener('mouseup', this.stopResize)
  }

  resize = (event: MouseEvent) => {
    if (!this.isResizing) return

    const wrapper = this.tableWrapper.nativeElement
    const deltaY = this.initialMouseY - event.clientY

    const newHeight = Math.max(this.initialHeight + deltaY, 100)

    wrapper.style.height = `${newHeight}px`
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
    this.newValuesQuery.emit()
  }

  private updateColumns() {
    if (this.query.length > 0) {
      this.columnDefs = Object.keys(this.query[0]).map((key) => ({ field: key }))
    }
  }
}