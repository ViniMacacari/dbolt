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
  @Input() query: any[] = [];
  @ViewChild('tableWrapper') tableWrapper!: ElementRef<HTMLDivElement>;

  @HostListener('window:resize')
  onResize() {
    this.adjustTableWrapperSize()
  }

  ngAfterViewInit(): void {
    this.adjustTableWrapperSize()
  }

  adjustTableWrapperSize(): void {
    if (this.tableWrapper) {
      const parent = this.tableWrapper.nativeElement.parentElement;
      if (parent) {
        this.tableWrapper.nativeElement.style.maxWidth = `${parent.clientWidth}px`
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