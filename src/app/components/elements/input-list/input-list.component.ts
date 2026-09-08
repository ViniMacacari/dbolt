import { booleanAttribute, Component, Input, HostListener, EventEmitter, Output, OnChanges, SimpleChanges, ElementRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-input-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './input-list.component.html',
  styleUrls: ['./input-list.component.scss'],
  host: {
    '[class.dropdown-open]': 'isDropdownOpen',
    '[class.compact]': 'compact'
  }
})
export class InputListComponent implements OnChanges {
  @Output() itemSelected = new EventEmitter<{ [key: string]: string | number } | null>()
  @Input() list: { [key: string]: string | number }[] = []
  @Input() displayKey: string = 'name'
  @Input() valueKey: string = 'id'
  @Input() selectedValue: string | number | null = null
  @Input() width: string = '300px'
  @Input() placeholder: string = ''
  @Input({ transform: booleanAttribute }) disabled: boolean = false
  @Input({ transform: booleanAttribute }) compact: boolean = false

  searchValue: string = ''
  filteredList: { [key: string]: string | number }[] = []
  isDropdownOpen: boolean = false
  selectedItem: { [key: string]: string | number } | null = null

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private language: AppLanguageService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['disabled']?.currentValue) {
      this.isDropdownOpen = false
    }
    const optionsChanged = Boolean(
      changes['list'] ||
      changes['selectedValue'] ||
      changes['valueKey'] ||
      changes['displayKey']
    )
    const shouldSyncSelectedItem = Boolean(
      changes['selectedValue'] ||
      changes['valueKey'] ||
      changes['displayKey'] ||
      (changes['list'] && (!this.searchValue || this.isShowingSelectedValue()))
    )

    if (shouldSyncSelectedItem) {
      this.syncSelectedItem()
    }

    if (optionsChanged) {
      this.updateFilteredList(this.isDropdownOpen && this.isShowingSelectedValue())
    }
  }

  openDropdown(): void {
    if (this.disabled) return
    this.isDropdownOpen = true
    this.updateFilteredList(this.isShowingSelectedValue())
  }

  updateSearch(): void {
    if (this.selectedItem && this.searchValue !== this.selectedItem[this.displayKey]?.toString()) {
      this.selectedItem = null
      this.itemSelected.emit(null)
    }

    this.updateFilteredList(false)
  }

  onSearchInput(event: Event): void {
    if (this.disabled) return
    this.searchValue = (event.target as HTMLInputElement).value
    this.updateSearch()
  }

  selectItem(item: { [key: string]: string | number }): void {
    if (this.disabled) return
    this.searchValue = item[this.displayKey]?.toString() || ''
    this.selectedItem = item
    this.itemSelected.emit(item)
    this.isDropdownOpen = false
  }

  trackByItem(index: number, item: { [key: string]: string | number }): string {
    const identity = item[this.valueKey] ?? item[this.displayKey] ?? ''

    return `${this.valueKey}:${typeof identity}:${String(identity)}:${index}`
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: MouseEvent): void {
    const clickedInside = this.elementRef.nativeElement.contains(event.target as Node)

    if (!clickedInside) {
      this.isDropdownOpen = false
    }
  }

  clearInput(): void {
    if (this.disabled) return
    this.searchValue = ''
    this.selectedItem = null
    this.itemSelected.emit(null)
    this.updateFilteredList(false)
  }

  private updateFilteredList(showAll: boolean = false): void {
    if (showAll) {
      this.filteredList = [...this.list]
      return
    }

    const query = this.searchValue.toLowerCase().trim()

    if (!query) {
      this.filteredList = [...this.list]
      return
    }

    this.filteredList = this.list.filter(item =>
      item[this.displayKey]?.toString().toLowerCase().includes(query)
    )
  }

  private isShowingSelectedValue(): boolean {
    return Boolean(
      this.selectedItem &&
      this.searchValue === this.selectedItem[this.displayKey]?.toString()
    )
  }

  private syncSelectedItem(): void {
    const wasShowingSelectedValue = this.isShowingSelectedValue()
    if (this.selectedValue === null || this.selectedValue === undefined || this.selectedValue === '') {
      this.selectedItem = null
      if (wasShowingSelectedValue) this.searchValue = ''
      return
    }
    if (this.selectedItem?.[this.valueKey] === this.selectedValue) return

    const selectedItem = this.list.find(item => item[this.valueKey] === this.selectedValue)
    if (!selectedItem) {
      this.selectedItem = null
      if (wasShowingSelectedValue) this.searchValue = ''
      return
    }

    this.selectedItem = selectedItem
    this.searchValue = selectedItem[this.displayKey]?.toString() || ''
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
