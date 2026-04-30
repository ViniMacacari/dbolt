import { Component, HostListener, Output, EventEmitter, ElementRef, AfterViewInit, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import Sortable from 'sortablejs'
import { LoadQueryComponent } from "../modal/load-query/load-query.component"
import { YesNoModalComponent } from "../modal/yes-no-modal/yes-no-modal.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { ConnectionContextService } from '../../services/connection-context/connection-context.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, LoadQueryComponent, YesNoModalComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  @Output() tabSelected = new EventEmitter<any>()
  @Output() tabClosed = new EventEmitter<void>()

  showLoadQuery: boolean = false
  showYNModal: boolean = false
  titleYN: string = 'Unsaved changes'
  messageYN: string = 'Do you want to close the tab even without saving the changes?'

  dataList: any = []
  dropdownVisible: boolean = false
  tabs: any[] = []
  activeTab: number | null = null
  idTabs: number = 0
  confirmToClose: any = {}

  icon: string = 'CODE'

  @ViewChild('tabsContainer') tabsContainer!: ElementRef

  constructor(
    private dbSchema: GetDbschemaService,
    private connectionContext: ConnectionContextService
  ) { }

  async ngAfterViewInit(): Promise<void> {
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
      info: info,
      originalContent: info.sql || '',
      dbInfo: this.createTabDbInfo(info.context, !info.context),
      icon: 'CODE'
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
      },
      dbInfo: this.createTabDbInfo(info.context, !info.context),
      originalSql: info.info.sql,
      icon: 'CODE'
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

  openSettingsTab(): void {
    const existingIndex = this.tabs.findIndex(tab => tab.type === 'settings')

    if (existingIndex >= 0) {
      this.selectTab(existingIndex)
      return
    }

    const newTab: any = {
      id: 'settings',
      name: 'Settings',
      type: 'settings',
      info: {},
      icon: 'SETTINGS'
    }

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)
  }

  openQueryAssistantTab(): void {
    const context = this.dbSchema.getSelectedSchemaDB()
    const newTab: any = {
      id: Date.now(),
      name: 'Query Assistant',
      type: 'query-assistant',
      info: {},
      dbInfo: this.createTabDbInfo(context, !context),
      icon: 'QUERY_ASSISTANT'
    }

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)

    setTimeout(() => {
      this.dropdownVisible = false
    }, 100)
  }

  openSelectBuilderTab(context: any = null): void {
    const resolvedContext = context || this.getActiveTab()?.dbInfo || this.dbSchema.getSelectedSchemaDB()
    const newTab: any = {
      id: Date.now(),
      name: 'Select Builder',
      type: 'select-builder',
      info: {},
      dbInfo: this.createTabDbInfo(resolvedContext, !resolvedContext),
      icon: 'SELECT_BUILDER'
    }

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)
  }

  closeTab(index: number, event: MouseEvent, tab: any): void {
    event.stopPropagation()

    this.confirmToClose = index

    if (tab.icon === 'CHANGE') {
      this.showYNModal = true
    } else {
      this.closeTabAt(index)
    }
  }

  confirmTabClose(): void {
    this.showYNModal = false
    this.closeTabAt(this.confirmToClose)
  }

  private closeTabAt(index: number): void {
    const tab = this.tabs[index]
    this.releaseTabResources(tab)
    this.tabs.splice(index, 1)

    if (this.tabs.length === 0) {
      this.activeTab = null
      this.tabClosed.emit()
    } else {
      const newActiveTab = Math.min(index, this.tabs.length - 1)
      this.selectTab(newActiveTab)
    }
  }

  private releaseTabResources(tab: any): void {
    if (!tab) return

    tab.closing = true

    if (tab.queryState) {
      tab.queryState.queryResponse = []
      tab.queryState.queryColumns = []
      tab.queryState.queryError = ''
      tab.queryState.queryResultOpen = false
      tab.queryState.maxResultLines = 0
    }
  }

  selectTab(index: number): void {
    this.activeTab = index
    this.tabSelected.emit(this.tabs[index])
  }

  getTabIcon(tab: any): string {
    if (tab.icon === 'CHANGE') return 'icons/circle-unsaved.png'
    if (tab.icon === 'SETTINGS') return 'icons/settings.png'
    if (tab.icon === 'QUERY_ASSISTANT') return 'icons/code-block.png'
    if (tab.icon === 'SELECT_BUILDER') return 'icons/table.png'
    if (tab.type === 'procedure') return 'icons/procedure.png'

    return 'icons/code.png'
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
      },
      originalContent: event.sql,
      dbInfo: this.createTabDbInfo(null, true),
      icon: 'CODE'
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

  updateActiveTabDbInfo(dbInfo: any): void {
    if (this.activeTab === null) return

    this.tabs[this.activeTab].dbInfo = dbInfo
  }

  getActiveTab(): any {
    return this.activeTab === null ? null : this.tabs[this.activeTab]
  }

  private createTabDbInfo(context: any = null, forceNewKey: boolean = false): any {
    return this.connectionContext.createContext(
      context || this.dbSchema.getSelectedSchemaDB(),
      forceNewKey
    )
  }

  onCloseLoadQuery(event: any): void {
    this.showLoadQuery = false
  }
}
