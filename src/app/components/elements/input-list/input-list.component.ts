import { Component, Input, HostListener, EventEmitter, Output, OnChanges, SimpleChanges, ElementRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

@Component({
  selector: 'app-input-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './input-list.component.html',
  styleUrls: ['./input-list.component.scss']
})
export class InputListComponent implements OnChanges {
  @Output() itemSelected = new EventEmitter<{ [key: string]: string | number } | null>()
  @Input() list: { [key: string]: string | number }[] = []
  @Input() displayKey: string = 'name'
  @Input() valueKey: string = 'id'
  @Input() selectedValue: string | number | null = null
  @Input() width: string = '300px'
  @Input() placeholder: string = ''

  searchValue: string = ''
  filteredList: { [key: string]: string | number }[] = []
  isDropdownOpen: boolean = false
  selectedItem: { [key: string]: string | number } | null = null

  constructor(private elementRef: ElementRef<HTMLElement>) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['list'] && changes['list'].currentValue) {
      this.updateFilteredList()
    }

    if (
      changes['list'] ||
      changes['selectedValue'] ||
      changes['valueKey'] ||
      changes['displayKey']
    ) {
      this.syncSelectedItem()
    }
  }

  openDropdown(): void {
    this.isDropdownOpen = true
    this.updateFilteredList()
  }

  updateSearch(): void {
    if (this.selectedItem && this.searchValue !== this.selectedItem[this.displayKey]?.toString()) {
      this.selectedItem = null
      this.itemSelected.emit(null)
    }

    this.updateFilteredList()
  }

  selectItem(item: { [key: string]: string | number }): void {
    this.searchValue = item[this.displayKey]?.toString() || ''
    this.selectedItem = item
    this.itemSelected.emit(item)
    this.isDropdownOpen = false
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: MouseEvent): void {
    const clickedInside = this.elementRef.nativeElement.contains(event.target as Node)

    if (!clickedInside) {
      this.isDropdownOpen = false
    }
  }

  clearInput(): void {
    this.searchValue = ''
    this.selectedItem = null
    this.itemSelected.emit(null)
    this.updateFilteredList()
  }

  private updateFilteredList(): void {
    const query = this.searchValue.toLowerCase().trim()

    if (!query) {
      this.filteredList = [...this.list]
      return
    }

    this.filteredList = this.list.filter(item =>
      item[this.displayKey]?.toString().toLowerCase().includes(query)
    )
  }

  private syncSelectedItem(): void {
    if (this.selectedValue === null || this.selectedValue === undefined) return
    if (this.selectedItem?.[this.valueKey] === this.selectedValue) return

    const selectedItem = this.list.find(item => item[this.valueKey] === this.selectedValue)
    if (!selectedItem) return

    this.selectedItem = selectedItem
    this.searchValue = selectedItem[this.displayKey]?.toString() || ''
    this.updateFilteredList()
  }
}
