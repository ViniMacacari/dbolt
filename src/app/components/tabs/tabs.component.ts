import { Component, HostListener, Output, EventEmitter, ElementRef, AfterViewInit, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import Sortable from 'sortablejs'
import { LoadQueryComponent } from "../modal/load-query/load-query.component"
import { YesNoModalComponent } from "../modal/yes-no-modal/yes-no-modal.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { ConnectionContextService } from '../../services/connection-context/connection-context.service'
import { QueryCompareTargetService } from '../../services/query-compare-target/query-compare-target.service'
import { AppLanguageService } from '../../services/language/app-language.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, LoadQueryComponent, YesNoModalComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent {
  @Output() tabSelected = new EventEmitter<any>()
  @Output() tabClosed = new EventEmitter<any>()
  @Output() assistantRequested = new EventEmitter<void>()

  showLoadQuery: boolean = false
  showYNModal: boolean = false

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
    private connectionContext: ConnectionContextService,
    private compareTarget: QueryCompareTargetService,
    private language: AppLanguageService
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

  openAssistant(event: MouseEvent): void {
    event.stopPropagation()
    this.dropdownVisible = false
    this.assistantRequested.emit()
  }

  newTab(type: string, info: any, name: string | null = null): any {
    const newTab: any = {
      id: Date.now(),
      name: name || Date.now(),
      type: type,
      info: info,
      originalContent: info.sql || '',
      dbInfo: this.createTabDbInfo(info.context, !info.context),
      icon: 'CODE',
      persisted: false
    }

    this.idTabs += 1

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)

    setTimeout(() => {
      this.dropdownVisible = false
    }, 100)

    return newTab
  }

  newSavedTab(type: string, info: any): void {
    const savedQuery = info.query || info
    const newTab: any = {
      id: savedQuery.id || Date.now(),
      name: savedQuery.name || info.name?.name || this.t('tabs.savedQuery'),
      type: type,
      info: {
        sql: savedQuery.sql || info.info?.sql || ''
      },
      dbInfo: this.createTabDbInfo(savedQuery.dbSchema || info.context, !(savedQuery.dbSchema || info.context)),
      originalContent: savedQuery.sql || info.info?.sql || '',
      folderPath: savedQuery.folderPath || '',
      versioningEnabled: Boolean(savedQuery.versioningEnabled),
      updatedAt: savedQuery.updatedAt,
      createdAt: savedQuery.createdAt,
      versions: savedQuery.versions || [],
      icon: 'CODE',
      persisted: Boolean(savedQuery.id)
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

  openSettingsTab(activeSettingsTab: string | null = null): void {
    const existingIndex = this.tabs.findIndex(tab => tab.type === 'settings')

    if (existingIndex >= 0) {
      if (activeSettingsTab) {
        this.tabs[existingIndex].info = {
          ...this.tabs[existingIndex].info,
          activeTab: activeSettingsTab
        }
      }

      this.selectTab(existingIndex)
      return
    }

    const newTab: any = {
      id: 'settings',
      name: this.t('tabs.settings'),
      type: 'settings',
      info: activeSettingsTab ? { activeTab: activeSettingsTab } : {},
      icon: 'SETTINGS'
    }

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)
  }

  openQueryAssistantTab(): void {
    const context = this.dbSchema.getSelectedSchemaDB()
    const newTab: any = {
      id: Date.now(),
      name: this.t('tabs.queryAssistant'),
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
      name: this.t('tabs.selectBuilder'),
      type: 'select-builder',
      info: {},
      dbInfo: this.createTabDbInfo(resolvedContext, !resolvedContext),
      icon: 'SELECT_BUILDER'
    }

    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)
  }

  openSavedQueryTab(query: any): void {
    const existingIndex = this.tabs.findIndex(tab =>
      tab.type === 'sql' &&
      tab.persisted &&
      Number(tab.id) === Number(query.id)
    )

    if (existingIndex >= 0) {
      const existingTab = this.tabs[existingIndex]
      if (existingTab.icon !== 'CHANGE') {
        this.applySavedQueryToTab(existingTab, query)
      }
      this.selectTab(existingIndex)
      this.dropdownVisible = false
      return
    }

    const newTab = {
      type: query.type || 'sql',
      info: {}
    }

    this.applySavedQueryToTab(newTab, query)
    this.tabs.push(newTab)
    this.selectTab(this.tabs.length - 1)
    this.dropdownVisible = false
  }

  openQueryVersionCompareTab(event: any): void {
    const left = event?.left || (event?.query ? this.compareTarget.createQueryTarget(event.query) : null)
    const right = event?.right || (event?.query && event?.version
      ? this.compareTarget.createVersionTarget(event.query, event.version)
      : null)
    if (!left || !right) return

    const compareTabId = this.compareTarget.buildTabId(left, right)
    const existingIndex = this.tabs.findIndex(tab => tab.id === compareTabId)

    if (existingIndex >= 0) {
      this.selectTab(existingIndex)
      this.showLoadQuery = false
      this.dropdownVisible = false
      return
    }

    this.tabs.push({
      id: compareTabId,
      name: this.compareTarget.buildTabName(left, right),
      type: 'query-compare',
      info: {
        left,
        right
      },
      icon: 'COMPARE'
    })
    this.selectTab(this.tabs.length - 1)
    this.showLoadQuery = false
    this.dropdownVisible = false
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
    const wasActive = this.activeTab === index
    this.releaseTabResources(tab)
    this.tabs.splice(index, 1)
    this.tabClosed.emit({
      tab,
      wasActive,
      hasTabs: this.tabs.length > 0
    })

    if (this.tabs.length === 0) {
      this.activeTab = null
      return
    }

    if (wasActive) {
      const newActiveTab = Math.min(index, this.tabs.length - 1)
      this.selectTab(newActiveTab)
      return
    }

    if (this.activeTab !== null && index < this.activeTab) {
      this.activeTab--
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
    if (tab.icon === 'COMPARE' || tab.type === 'query-compare') return 'icons/ddl.png'
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

    if (event?.persisted === false || !event?.id) {
      this.newTab('sql', {
        sql: event?.sql || '',
        context: event?.dbSchema
    }, event?.name || this.t('tabs.queryVersion'))
      return
    }

    this.openSavedQueryTab(event)
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

  private applySavedQueryToTab(tab: any, query: any): void {
    tab.id = query.id
    tab.name = query.name
    tab.type = query.type || 'sql'
    tab.info = {
      ...tab.info,
      sql: query.sql
    }
    tab.originalContent = query.sql
    tab.dbInfo = this.createTabDbInfo(query.dbSchema, !query.dbSchema)
    tab.folderPath = query.folderPath || ''
    tab.versioningEnabled = Boolean(query.versioningEnabled)
    tab.updatedAt = query.updatedAt
    tab.createdAt = query.createdAt
    tab.versions = query.versions || []
    tab.icon = 'CODE'
    tab.persisted = Boolean(query.id)
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
