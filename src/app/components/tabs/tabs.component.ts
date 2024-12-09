import { Component, HostListener, Output, EventEmitter } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, ActivatedRoute } from '@angular/router'
import { InputListComponent } from "../elements/input-list/input-list.component"
import { InternalApiService } from '../../services/requests/internal-api.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  @Output() tabSelected = new EventEmitter<any>()
  @Output() tabClosed = new EventEmitter<void>()

  dataList: any = []
  dropdownVisible: boolean = false
  tabs: { id: number, name: string, info: { sql: string } }[] = []
  activeTab: number | null = null
  idTabs: number = 0

  constructor(
    private route: ActivatedRoute,
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    const database = await this.IAPI.get(`/api/connections/${routeParamId}`)
  }

  toggleDropdown(): void {
    this.dropdownVisible = !this.dropdownVisible
  }

  newTab(type: string, info: any): void {
    const newTab: any = {
      id: Date.now(),
      name: Date.now(),
      type: type,
      info: info
    }

    this.idTabs += 1

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)

    setTimeout(() => {
      this.dropdownVisible = false
    }, 100)
  }

  newSavedTab(type: string, info: any): void {
    const newTab: any = {
      id: Date.now(),
      name: info.name.name,
      type: type,
      info: {
        sql: info.info.sql
      }
    }

    this.idTabs += 1

    this.tabs.push(newTab)

    setTimeout(() => {
      this.selectTab(this.tabs.length - 1)
      this.dropdownVisible = false
    }, 0)
  }

  loadTab(): void {
    console.log('Opção 2 selecionada')
    setTimeout(() => {
      this.dropdownVisible = false
    }, 100)
  }

  closeTab(index: number, event: MouseEvent): void {
    event.stopPropagation()

    this.tabs.splice(index, 1)

    if (this.tabs.length === 0) {
      this.activeTab = null
      this.tabClosed.emit()
    } else {
      const newActiveTab = Math.min(index, this.tabs.length - 1)
      this.selectTab(newActiveTab)
    }
  }

  selectTab(index: number): void {
    this.activeTab = index
    console.log(this.tabs[index])
    this.tabSelected.emit(this.tabs[index])
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement
    if (!targetElement.closest('.add')) {
      this.dropdownVisible = false
    }
  }
}