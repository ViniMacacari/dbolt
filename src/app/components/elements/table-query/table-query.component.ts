import { Component, Input, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table-query',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-query.component.html',
  styleUrls: ['./table-query.component.scss']
})
export class TableQueryComponent implements AfterViewInit {
  @Input() query: any[] = []
  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>

  private resizeTimeout: any

  @HostListener('window:resize')
  onResize() {
    clearTimeout(this.resizeTimeout)
    this.resizeTimeout = setTimeout(() => this.adjustTableWrapperSize(), 100)
  }

  ngAfterViewInit(): void {
    this.adjustTableWrapperSize()
  }

  adjustTableWrapperSize() {
    if (this.tableWrapper) {
      const parent = this.tableWrapper.nativeElement.parentElement

      if (parent) {
        const parentWidth = parent.offsetWidth
        const parentHeight = parent.offsetHeight

        this.tableWrapper.nativeElement.style.maxWidth = `${parentWidth}px`
        this.tableWrapper.nativeElement.style.maxHeight = `${parentHeight}px`
        this.tableWrapper.nativeElement.style.overflow = 'auto'
      }
    }
  }

  getKeys(row: any): string[] {
    return row ? Object.keys(row) : []
  }

  getValues(row: any): any[] {
    return row ? Object.values(row) : []
  }
}