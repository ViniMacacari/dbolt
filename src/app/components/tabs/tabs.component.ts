import { Component, HostListener, Output, EventEmitter, ElementRef, AfterViewInit, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, ActivatedRoute } from '@angular/router'
import Sortable from 'sortablejs'
import { InternalApiService } from '../../services/requests/internal-api.service'
import { LoadQueryComponent } from "../modal/load-query/load-query.component"

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, LoadQueryComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  @Output() tabSelected = new EventEmitter<any>()
  @Output() tabClosed = new EventEmitter<void>()

  showLoadQuery: boolean = false

  dataList: any = []
  dropdownVisible: boolean = false
  tabs: { id: number, name: string, info: { sql: string } }[] = []
  activeTab: number | null = null
  idTabs: number = 0

  @ViewChild('tabsContainer') tabsContainer!: ElementRef

  constructor(
    private route: ActivatedRoute,
    private IAPI: InternalApiService
  ) { }

  async ngAfterViewInit(): Promise<void> {
    const routeParams = this.route.snapshot.paramMap
    const routeParamId = Number(routeParams.get('id'))
    const database = await this.IAPI.get(`/api/connections/${routeParamId}`)

    // Configuração do SortableJS
    Sortable.create(this.tabsContainer.nativeElement, {
      animation: 150,
      onEnd: (event) => {
        const movedTab = this.tabs.splice(event.oldIndex!, 1)[0]
        this.tabs.splice(event.newIndex!, 0, movedTab)
        this.updateActiveTab(event.oldIndex!, event.newIndex!)
      }
    })
  }

  toggleDropdown(): void {
    this.dropdownVisible = !this.dropdownVisible
  }

  newTab(type: string, info: any, name: string | null = null): void {
    const newTab: any = {
      id: Date.now(),
      name: name || Date.now(),
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
    this.showLoadQuery = true
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

  onOpenLoadQuery(event: any): void {
    this.showLoadQuery = false

    const newTab: any = {
      id: event.id,
      name: event.name,
      type: event.type,
      info: {
        sql: event.sql
      }
    }

    this.idTabs += 1

    this.tabs.push(newTab)

    setTimeout(() => {
      this.selectTab(this.tabs.length - 1)
      this.dropdownVisible = false
    }, 0)
  }

  private updateActiveTab(oldIndex: number, newIndex: number): void {
    if (this.activeTab === oldIndex) {
      this.activeTab = newIndex
    } else if (
      this.activeTab !== null &&
      oldIndex < this.activeTab &&
      newIndex >= this.activeTab
    ) {
      this.activeTab--
    } else if (
      this.activeTab !== null &&
      oldIndex > this.activeTab &&
      newIndex <= this.activeTab
    ) {
      this.activeTab++
    }
  }

  onCloseLoadQuery(event: any): void {
    this.showLoadQuery = false
  }
}