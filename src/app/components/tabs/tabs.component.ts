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
  @Output() tabCreated = new EventEmitter<any>()

  dataList: any = []
  dropdownVisible: boolean = false
  tabs: { id: number, name: string }[] = []
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
    this.tabCreated.emit(newTab)

    setTimeout(() => {
      this.dropdownVisible = false
    }, 100)
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

    if (this.activeTab === index) {
      this.activeTab = this.tabs.length > 0 ? Math.max(0, index - 1) : null
    } else if (this.activeTab !== null && this.activeTab > index) {
      this.activeTab -= 1
    }
  }

  selectTab(index: number): void {
    this.activeTab = index
    console.log(`Aba ${index} selecionada:`, this.tabs[index])
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement
    if (!targetElement.closest('.add')) {
      this.dropdownVisible = false
    }
  }
}