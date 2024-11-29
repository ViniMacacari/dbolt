import { Component, Input, HostListener, EventEmitter, Output, OnChanges, SimpleChanges } from '@angular/core'
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
  @Input() width: string = '300px'

  searchValue: string = ''
  filteredList: { [key: string]: string | number }[] = []
  isDropdownOpen: boolean = false
  selectedItem: { [key: string]: string | number } | null = null

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['list'] && changes['list'].currentValue) {
      this.updateFilteredList()
    }
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen
    if (this.isDropdownOpen) this.updateFilteredList()
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

  @HostListener('document:click', ['$event.target'])
  closeDropdown(target: HTMLElement): void {
    const dropdownElement = target.closest('.dropdown-container')
    if (!dropdownElement) {
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
    } else {
      this.filteredList = this.list.filter(item =>
        item[this.displayKey]?.toString().toLowerCase().includes(query)
      )
    }
  }
}