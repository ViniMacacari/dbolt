import { Component, Input, AfterViewInit, ViewChild, ElementRef, HostListener, ViewEncapsulation, SimpleChanges, ChangeDetectorRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgZone } from '@angular/core'

@Component({
  selector: 'app-table-query',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-query.component.html',
  styleUrls: ['./table-query.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class TableQueryComponent implements AfterViewInit {
  @Input() query: any[] = []
  @Input() calcWidth: number = 300
  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>

  isElementVisible = false
  private resizeTimeout: any
  private isResizing = false
  private initialMouseY = 0
  private initialHeight = 0
  private initialTop = 0
  private initialBottom = 0
  private lastScrollTop = 0

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  @HostListener('window:resize')
  onResize() {
    clearTimeout(this.resizeTimeout)
    this.resizeTimeout = setTimeout(() => this.adjustTableWrapperSize(), 100)
  }

  ngAfterViewInit(): void {
    this.isElementVisible = true
    this.adjustTableWrapperSize()
    this.cdr.detectChanges()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['calcWidth']) {
      setTimeout(() => this.adjustTableWrapperSize(), 100)
    }
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

  @HostListener('scroll', ['$event'])
  onScroll(event: Event) {
    console.log(event)
    if (!this.isElementVisible) return

    const wrapper = this.tableWrapper.nativeElement
    const scrollTop = wrapper.scrollTop
    const scrollHeight = wrapper.scrollHeight
    const clientHeight = wrapper.clientHeight

    const isAtTop = scrollTop === 0
    const isAtBottom = scrollTop + clientHeight === scrollHeight

    if (isAtTop) {
      console.log('Scrolled to the top')
    }

    if (isAtBottom) {
      console.log('Scrolled to the bottom')
    }

    this.lastScrollTop = scrollTop
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
}