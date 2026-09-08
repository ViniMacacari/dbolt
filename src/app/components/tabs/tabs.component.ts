import { Component, HostListener, Output, EventEmitter, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import Sortable from 'sortablejs'
import { LoadQueryComponent } from "../modal/load-query/load-query.component"
import { YesNoModalComponent } from "../modal/yes-no-modal/yes-no-modal.component"
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service'
import { ConnectionContextService } from '../../services/connection-context/connection-context.service'
import { QueryCompareTargetService } from '../../services/query-compare-target/query-compare-target.service'
import { AppLanguageService } from '../../services/language/app-language.service'
import { ApplicationCloseGuardService } from '../../services/application-close/application-close-guard.service'
import { TabGroup, TabGroupsService, TabLayoutDescriptor, TabLayoutItem } from '../../services/tab-groups/tab-groups.service'
import { KeyboardShortcutService } from '../../services/keyboard-shortcuts/keyboard-shortcut.service'
import { TabSelectionService } from '../../services/tab-selection/tab-selection.service'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, LoadQueryComponent, YesNoModalComponent],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss'
})
export class TabsComponent implements OnInit, OnDestroy {
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

  groups: TabGroup[] = []
  layout: TabLayoutItem[] = []
  isDraggingTab: boolean = false
  selectedTabs = new Set<any>()
  private expandedGroupsBeforeDrag = new Set<string>()
  private isChipClickSuppressed = false
  tabContextMenu: any = null
  groupContextMenu: any = null
  groupEditor: any = null

  icon: string = 'CODE'

  private readonly tabOpenAnimationMs = 240
  private readonly tabCloseAnimationMs = 190
  private readonly tabSwitchAnimationMs = 180
  private readonly tabGroupFlashMs = 520
  private readonly tabAnimationTimers = new Set<ReturnType<typeof setTimeout>>()
  private unregisterUnsavedSqlQueryCheck: (() => void) | null = null
  private unregisterEscapeShortcut: (() => void) | null = null
  private layoutKeySequence = 0

  @ViewChild('tabsContainer') tabsContainer!: ElementRef
  @ViewChild('groupNameInput') groupNameInput?: ElementRef<HTMLInputElement>

  constructor(
    private dbSchema: GetDbschemaService,
    private connectionContext: ConnectionContextService,
    private compareTarget: QueryCompareTargetService,
    private language: AppLanguageService,
    private applicationCloseGuard: ApplicationCloseGuardService,
    private tabGroups: TabGroupsService,
    private keyboardShortcuts: KeyboardShortcutService,
    private tabSelection: TabSelectionService
  ) { }

  ngOnInit(): void {
    this.unregisterUnsavedSqlQueryCheck = this.applicationCloseGuard.registerUnsavedSqlQueryCheck(
      () => this.tabs.some(tab => tab?.type === 'sql' && tab?.icon === 'CHANGE')
    )

    this.unregisterEscapeShortcut = this.keyboardShortcuts.register({
      key: 'Escape',
      priority: 95,
      isEnabled: () => Boolean(this.tabContextMenu || this.groupContextMenu || this.groupEditor) ||
        this.selectedTabs.size > 0,
      handler: () => {
        if (this.groupEditor) this.applyGroupEditor()
        this.closeTabMenus()
        this.clearTabSelection()
        return true
      }
    })
  }

  ngOnDestroy(): void {
    this.tabAnimationTimers.forEach(timer => clearTimeout(timer))
    this.tabAnimationTimers.clear()
    this.unregisterUnsavedSqlQueryCheck?.()
    this.unregisterEscapeShortcut?.()
  }

  async ngAfterViewInit(): Promise<void> {
    Sortable.create(this.tabsContainer.nativeElement, {
      animation: 170,
      easing: 'cubic-bezier(.2, .8, .2, 1)',
      draggable: '.tab, .tab-group-chip',
      preventOnFilter: false,
      ghostClass: 'tab-ghost',
      chosenClass: 'tab-chosen',
      dragClass: 'tab-dragging',
      onStart: (event) => {
        this.isDraggingTab = true
        this.closeTabMenus()
        this.startGroupDrag(event?.item as HTMLElement | undefined)
      },
      onEnd: (event) => {
        this.isDraggingTab = false
        this.onTabDragEnd(event)
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

    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)

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

    this.appendTab(newTab)

    setTimeout(() => {
      const newTabIndex = this.tabs.indexOf(newTab)
      if (newTabIndex >= 0) this.selectTab(newTabIndex)
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

    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)
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

    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)

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

    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)
  }

  openDatabaseExportTab(): void {
    const existingIndex = this.tabs.findIndex(tab => tab.type === 'database-export')
    if (existingIndex >= 0) {
      this.selectTab(existingIndex)
      return
    }

    const newTab: any = {
      id: 'database-export',
      name: this.t('tabs.databaseExport'),
      type: 'database-export',
      info: {},
      icon: 'DATABASE_EXPORT'
    }
    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)
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
    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)
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

    const newTab = {
      id: compareTabId,
      name: this.compareTarget.buildTabName(left, right),
      type: 'query-compare',
      info: {
        left,
        right
      },
      icon: 'COMPARE'
    }
    const newTabIndex = this.appendTab(newTab)
    this.selectTab(newTabIndex)
    this.showLoadQuery = false
    this.dropdownVisible = false
  }

  closeTab(index: number, event: MouseEvent, tab: any): void {
    event.stopPropagation()
    if (tab?.closing) return

    const tabElement = (event.currentTarget as HTMLElement | null)?.closest('.tab') as HTMLElement | null
    this.confirmToClose = {
      tab,
      width: Math.ceil(tabElement?.getBoundingClientRect().width || 0)
    }

    if (tab.icon === 'CHANGE') {
      this.showYNModal = true
    } else {
      this.closeTabAt(index, this.confirmToClose.width)
    }
  }

  confirmTabClose(): void {
    this.showYNModal = false

    if (this.confirmToClose?.group) {
      this.performGroupClose(this.confirmToClose.group)
      return
    }

    if (this.confirmToClose?.tabs) {
      this.performTabsClose(this.confirmToClose.tabs)
      return
    }

    const index = this.tabs.indexOf(this.confirmToClose?.tab)
    if (index >= 0) this.closeTabAt(index, this.confirmToClose?.width)
  }

  getUnsavedChangesMessage(): string {
    if (this.confirmToClose?.group) return this.t('tabs.group.unsavedChangesMessage')
    if (this.confirmToClose?.tabs) {
      return this.t('tabs.selection.unsavedChangesMessage', { count: this.confirmToClose.tabs.length })
    }

    return this.t('tabs.unsavedChangesMessage')
  }

  private closeTabAt(index: number, measuredWidth: number = 0): void {
    const tab = this.tabs[index]
    if (!tab || tab.closing) return

    tab.opening = false
    tab.animationWidth = Math.max(50, measuredWidth || 0)
    tab.closing = true

    this.scheduleTabAnimation(() => this.finalizeTabClose(tab), this.getTabAnimationDuration(this.tabCloseAnimationMs))
  }

  private finalizeTabClose(tab: any): void {
    const index = this.tabs.indexOf(tab)
    if (index < 0) return

    const wasActive = this.activeTab === index
    this.releaseTabResources(tab)
    this.selectedTabs = this.tabSelection.prune(this.tabs.filter((item) => item !== tab), this.selectedTabs)
    this.tabs.splice(index, 1)
    this.tabClosed.emit({
      tab,
      wasActive,
      hasTabs: this.tabs.length > 0
    })

    this.groups = this.tabGroups.removeEmptyGroups(this.tabs, this.groups)

    if (this.tabs.length === 0) {
      this.activeTab = null
      this.rebuildLayout()
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

    this.rebuildLayout()
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

  private appendTab(tab: any): number {
    this.layoutKeySequence += 1
    tab.layoutKey = String(this.layoutKeySequence)
    tab.groupId = tab.groupId || null
    tab.opening = true
    tab.closing = false
    this.tabs.push(tab)
    this.rebuildLayout()

    this.scheduleTabAnimation(() => {
      if (this.tabs.includes(tab)) tab.opening = false
    }, this.getTabAnimationDuration(this.tabOpenAnimationMs))

    return this.tabs.length - 1
  }

  private scheduleTabAnimation(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.tabAnimationTimers.delete(timer)
      callback()
    }, delay)

    this.tabAnimationTimers.add(timer)
  }

  private getTabAnimationDuration(duration: number): number {
    if (typeof window === 'undefined') return duration
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : duration
  }

  selectTab(index: number): void {
    const nextTab = this.tabs[index]
    if (!nextTab || nextTab.closing) return

    const previousTab = this.activeTab === null ? null : this.tabs[this.activeTab]
    if (previousTab && previousTab !== nextTab && !nextTab.opening) {
      nextTab.switchOffset = index < this.activeTab! ? '-18px' : '18px'
      nextTab.switching = true
      this.scheduleTabAnimation(() => {
        if (this.tabs.includes(nextTab)) nextTab.switching = false
      }, this.getTabAnimationDuration(this.tabSwitchAnimationMs))
    }

    this.activeTab = index
    this.rebuildLayout()
    this.scrollTabIntoView(nextTab)
    this.tabSelected.emit(nextTab)
  }

  private scrollTabIntoView(tab: any): void {
    setTimeout(() => {
      const container = this.tabsContainer?.nativeElement as HTMLElement | undefined
      const element = container?.querySelector(`[data-tab-key="${tab?.layoutKey}"]`) as HTMLElement | null

      element?.scrollIntoView({
        behavior: this.getTabAnimationDuration(this.tabSwitchAnimationMs) ? 'smooth' : 'auto',
        block: 'nearest',
        inline: 'nearest'
      })
    }, 0)
  }

  rebuildLayout(): void {
    this.layout = this.tabGroups.buildLayout(this.tabs, this.groups, this.activeTab)
  }

  trackLayoutItem(index: number, item: TabLayoutItem): any {
    return item.kind === 'group' ? item.group.id : item.tab
  }

  selectTabRef(tab: any): void {
    const index = this.tabs.indexOf(tab)
    if (index >= 0) this.selectTab(index)
  }

  closeTabRef(tab: any, event: MouseEvent): void {
    const index = this.tabs.indexOf(tab)
    if (index >= 0) this.closeTab(index, event, tab)
  }

  get groupColors() {
    return this.tabGroups.colors
  }

  getGroupColorValue(group: TabGroup): string {
    return this.tabGroups.getColor(group.colorId).value
  }

  getGroupColorSoft(group: TabGroup): string {
    return this.tabGroups.getColor(group.colorId).soft
  }

  openTabContextMenu(tab: any, event: MouseEvent): void {
    this.selectedTabs = this.tabSelection.includeForContextMenu(this.selectedTabs, tab)
    const selectionCount = this.getSelectedTabsCount()

    this.closeTabMenus()
    this.tabContextMenu = {
      tab,
      group: this.tabGroups.resolveGroup(this.groups, tab?.groupId),
      selectionCount,
      ...this.getMenuPosition(event)
    }
  }

  openGroupContextMenu(group: TabGroup, event: MouseEvent): void {
    this.closeTabMenus()
    this.groupContextMenu = {
      group,
      ...this.getMenuPosition(event)
    }
  }

  closeTabMenus(): void {
    this.tabContextMenu = null
    this.groupContextMenu = null
    this.groupEditor = null
  }

  getGroupsForTab(tab: any): TabGroup[] {
    const currentGroupId = this.tabGroups.resolveGroup(this.groups, tab?.groupId)?.id || null

    return this.groups.filter((group) => group.id !== currentGroupId)
  }

  createGroupForTab(tab: any, event: MouseEvent): void {
    event.stopPropagation()

    const group = this.tabGroups.createGroup(
      this.groups,
      this.t('tabs.group.defaultName', { number: this.tabGroups.nextGroupNumber() })
    )
    this.groups = [...this.groups, group]
    this.moveTabToGroup(tab, group.id)
    this.closeTabMenus()
    this.openGroupEditor(group, event)
  }

  addTabToGroup(tab: any, group: TabGroup, event: MouseEvent): void {
    event.stopPropagation()
    if (group.collapsed) group.collapsed = false

    this.moveTabToGroup(tab, group.id)
    this.closeTabMenus()
  }

  removeTabFromGroup(tab: any, event: MouseEvent): void {
    event.stopPropagation()
    this.moveTabToGroup(tab, null)
    this.closeTabMenus()
  }

  closeTabFromMenu(tab: any, event: MouseEvent): void {
    event.stopPropagation()
    this.closeTabMenus()
    this.closeTabRef(tab, event)
  }

  toggleGroupCollapse(group: TabGroup, event?: MouseEvent): void {
    event?.stopPropagation()
    if (event && this.isChipClickSuppressed) return

    this.closeTabMenus()

    const groupTabs = this.tabGroups.groupTabs(this.tabs, this.groups, group.id)

    if (group.collapsed) {
      group.collapsed = false
      group.animating = false
      groupTabs.forEach((tab) => {
        tab.collapsing = false
        tab.opening = true
      })
      this.rebuildLayout()

      this.scheduleTabAnimation(() => {
        groupTabs.forEach((tab) => {
          tab.opening = false
        })
      }, this.getTabAnimationDuration(this.tabOpenAnimationMs))
      return
    }

    groupTabs.forEach((tab) => {
      tab.animationWidth = Math.max(50, this.measureTabWidth(tab))
      tab.opening = false
      tab.collapsing = true
    })
    group.collapsed = true
    group.animating = true
    this.rebuildLayout()

    this.scheduleTabAnimation(() => {
      group.animating = false
      groupTabs.forEach((tab) => {
        tab.collapsing = false
      })
      this.rebuildLayout()
    }, this.getTabAnimationDuration(this.tabCloseAnimationMs))
  }

  onTabMouseDown(tab: any, event: MouseEvent): void {
    if (event.button === 1) event.preventDefault()
  }

  onTabAuxClick(tab: any, event: MouseEvent): void {
    if (event.button !== 1) return

    event.preventDefault()
    event.stopPropagation()
    this.closeTabRef(tab, event)
  }

  onTabClick(tab: any, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      this.toggleTabSelection(tab)
      return
    }

    this.clearTabSelection()
    this.selectTabRef(tab)
  }

  toggleTabSelection(tab: any): void {
    this.selectedTabs = this.tabSelection.toggle(this.selectedTabs, tab, this.getActiveTab())

    if (this.selectedTabs.size === 0) this.closeTabMenus()
  }

  clearTabSelection(): void {
    if (this.selectedTabs.size === 0) return

    this.selectedTabs = new Set<any>()
  }

  isTabSelected(tab: any): boolean {
    return this.selectedTabs.has(tab)
  }

  getSelectedTabsCount(): number {
    return this.getSelectedTabs().length
  }

  createGroupForSelectedTabs(event: MouseEvent): void {
    event.stopPropagation()

    const selectedTabs = this.getSelectedTabs()
    if (selectedTabs.length === 0) return

    const group = this.tabGroups.createGroup(
      this.groups,
      this.t('tabs.group.defaultName', { number: this.tabGroups.nextGroupNumber() })
    )
    this.groups = [...this.groups, group]
    selectedTabs.forEach((tab) => this.moveTabToGroup(tab, group.id))

    this.clearTabSelection()
    this.closeTabMenus()
    this.openGroupEditor(group, event)
  }

  closeSelectedTabs(event: MouseEvent): void {
    event.stopPropagation()

    const selectedTabs = this.getSelectedTabs()
    if (selectedTabs.length === 0) return

    this.clearTabSelection()
    this.closeTabMenus()
    this.requestTabsClose(selectedTabs)
  }

  clearSelectionFromMenu(event: MouseEvent): void {
    event.stopPropagation()
    this.clearTabSelection()
    this.closeTabMenus()
  }

  private getSelectedTabs(): any[] {
    return this.tabSelection.resolve(this.tabs, this.selectedTabs)
  }

  private requestTabsClose(tabsToClose: any[]): void {
    if (tabsToClose.length === 0) return

    if (tabsToClose.some((tab) => tab?.icon === 'CHANGE')) {
      this.confirmToClose = { tabs: tabsToClose }
      this.showYNModal = true
      return
    }

    this.performTabsClose(tabsToClose)
  }

  private performTabsClose(tabsToClose: any[]): void {
    tabsToClose
      .slice()
      .reverse()
      .forEach((tab) => {
        const index = this.tabs.indexOf(tab)
        if (index >= 0) this.closeTabAt(index, this.measureTabWidth(tab))
      })

    this.confirmToClose = {}
  }

  applyRestoredGroups(
    groups: Array<{ id: string; name: string; colorId: string; collapsed?: boolean }>,
    assignments: Array<{ tab: any; groupId: string }>
  ): void {
    if (!groups?.length || !assignments?.length) return

    const activeTabReference = this.getActiveTab()

    this.groups = groups.map((group) => ({
      id: String(group.id),
      name: String(group.name || ''),
      colorId: group.colorId as TabGroup['colorId'],
      collapsed: false,
      animating: false
    }))

    assignments.forEach(({ tab, groupId }) => {
      if (this.tabs.includes(tab)) tab.groupId = groupId
    })

    this.groups = this.tabGroups.removeEmptyGroups(this.tabs, this.groups)
    this.applyTabsOrder(this.tabGroups.normalizeOrder(this.tabs, this.groups), activeTabReference)

    groups.forEach((persistedGroup) => {
      const group = this.groups.find((item) => item.id === String(persistedGroup.id))
      if (group) group.collapsed = Boolean(persistedGroup.collapsed)
    })

    this.rebuildLayout()
  }

  createGroupForActiveTab(event: MouseEvent): void {
    event.stopPropagation()
    this.dropdownVisible = false

    const activeTabReference = this.getActiveTab()
    if (!activeTabReference) return

    this.createGroupForTab(activeTabReference, event)
  }

  private measureTabWidth(tab: any): number {
    const container = this.tabsContainer?.nativeElement as HTMLElement | undefined
    const element = container?.querySelector(`[data-tab-key="${tab?.layoutKey}"]`) as HTMLElement | null

    return Math.ceil(element?.getBoundingClientRect().width || 0)
  }

  private flashTabs(tabs: any[]): void {
    tabs.forEach((tab) => {
      tab.groupFlash = false
    })

    setTimeout(() => {
      tabs.forEach((tab) => {
        tab.groupFlash = true
      })

      this.scheduleTabAnimation(() => {
        tabs.forEach((tab) => {
          tab.groupFlash = false
        })
      }, this.getTabAnimationDuration(this.tabGroupFlashMs))
    }, 0)
  }

  openGroupEditor(group: TabGroup, event: MouseEvent): void {
    this.tabContextMenu = null
    this.groupContextMenu = null
    this.groupEditor = {
      group,
      name: group.name,
      ...this.getMenuPosition(event)
    }

    setTimeout(() => {
      this.groupNameInput?.nativeElement.focus()
      this.groupNameInput?.nativeElement.select()
    }, 0)
  }

  onGroupEditorName(event: Event): void {
    if (!this.groupEditor) return

    this.groupEditor.name = (event.target as HTMLInputElement).value
  }

  setGroupEditorColor(colorId: TabGroup['colorId'], event: MouseEvent): void {
    event.stopPropagation()
    if (!this.groupEditor) return

    this.groupEditor.group.colorId = colorId
    this.rebuildLayout()
  }

  applyGroupEditor(): void {
    if (!this.groupEditor) return

    const name = String(this.groupEditor.name || '').trim()
    if (name) this.groupEditor.group.name = name

    this.groupEditor = null
    this.rebuildLayout()
  }

  newTabInGroup(group: TabGroup, event: MouseEvent): void {
    event.stopPropagation()
    this.closeTabMenus()

    if (group.collapsed) group.collapsed = false

    const tab = this.newTab('sql', { sql: '' }, this.t('tabs.newQuery'))
    this.moveTabToGroup(tab, group.id)
  }

  ungroupGroup(group: TabGroup, event: MouseEvent): void {
    event.stopPropagation()
    this.closeTabMenus()

    const activeTabReference = this.getActiveTab()
    this.tabGroups.groupTabs(this.tabs, this.groups, group.id).forEach((tab) => {
      tab.groupId = null
    })
    this.groups = this.groups.filter((item) => item.id !== group.id)
    this.applyTabsOrder([...this.tabs], activeTabReference)
  }

  closeGroupTabs(group: TabGroup, event: MouseEvent): void {
    event.stopPropagation()
    this.closeTabMenus()

    const groupTabs = this.tabGroups.groupTabs(this.tabs, this.groups, group.id)
    if (groupTabs.length === 0) return

    if (groupTabs.some((tab) => tab?.icon === 'CHANGE')) {
      this.confirmToClose = { group }
      this.showYNModal = true
      return
    }

    this.performGroupClose(group)
  }

  private performGroupClose(group: TabGroup): void {
    const groupTabs = this.tabGroups.groupTabs(this.tabs, this.groups, group.id)

    groupTabs
      .slice()
      .reverse()
      .forEach((tab) => {
        const index = this.tabs.indexOf(tab)
        if (index >= 0) this.closeTabAt(index)
      })

    this.confirmToClose = {}
  }

  private moveTabToGroup(tab: any, groupId: string | null): void {
    const activeTabReference = this.getActiveTab()
    const orderedTabs = this.tabGroups.assignTab(this.tabs, this.groups, tab, groupId)
    this.applyTabsOrder(orderedTabs, activeTabReference)

    if (groupId) this.flashTabs([tab])
  }

  private startGroupDrag(draggedElement?: HTMLElement): void {
    const group = this.resolveGroupFromElement(draggedElement)
    if (!group) return

    if (group.collapsed) {
      this.expandedGroupsBeforeDrag.delete(group.id)
      return
    }

    this.expandedGroupsBeforeDrag.add(group.id)
    group.collapsed = true
    group.animating = false
    this.rebuildLayout()
  }

  private finishGroupDrag(draggedElement: HTMLElement, container?: HTMLElement): void {
    this.isChipClickSuppressed = true
    setTimeout(() => {
      this.isChipClickSuppressed = false
    }, 0)

    const group = this.resolveGroupFromElement(draggedElement)
    const activeTabReference = this.getActiveTab()

    if (container) {
      const descriptors = Array.from(container.children)
        .map((element) => this.toLayoutDescriptor(element as HTMLElement))
        .filter((descriptor): descriptor is TabLayoutDescriptor => Boolean(descriptor))

      this.applyTabsOrder(
        this.tabGroups.buildOrderFromLayout(this.tabs, this.groups, descriptors),
        activeTabReference
      )
    }

    if (group && this.expandedGroupsBeforeDrag.has(group.id)) {
      this.expandedGroupsBeforeDrag.delete(group.id)
      this.toggleGroupCollapse(group)
      return
    }

    this.rebuildLayout()
  }

  private resolveGroupFromElement(element?: HTMLElement | null): TabGroup | null {
    if (!element?.classList.contains('tab-group-chip')) return null

    return this.tabGroups.resolveGroup(this.groups, element.dataset?.['groupId'])
  }

  private onTabDragEnd(event: any): void {
    const container = this.tabsContainer?.nativeElement as HTMLElement | undefined
    const draggedElement = event?.item as HTMLElement | undefined

    if (draggedElement?.classList.contains('tab-group-chip')) {
      this.finishGroupDrag(draggedElement, container)
      return
    }

    const draggedTab = this.findTabByLayoutKey(draggedElement?.dataset?.['tabKey'])

    if (!container || !draggedTab) {
      this.rebuildLayout()
      return
    }

    const activeTabReference = this.getActiveTab()
    const previousDescriptor = this.toLayoutDescriptor(draggedElement?.previousElementSibling as HTMLElement | null)
    const targetGroupId = this.tabGroups.resolveDropGroupId(this.tabs, this.groups, previousDescriptor)
    const previousGroupId = this.tabGroups.resolveGroup(this.groups, draggedTab.groupId)?.id || null

    draggedTab.groupId = targetGroupId

    if (targetGroupId && targetGroupId !== previousGroupId) this.flashTabs([draggedTab])

    const targetGroup = this.tabGroups.resolveGroup(this.groups, targetGroupId)
    if (targetGroup?.collapsed) targetGroup.collapsed = false

    const descriptors = Array.from(container.children)
      .map((element) => this.toLayoutDescriptor(element as HTMLElement))
      .filter((descriptor): descriptor is TabLayoutDescriptor => Boolean(descriptor))

    this.applyTabsOrder(
      this.tabGroups.buildOrderFromLayout(this.tabs, this.groups, descriptors),
      activeTabReference
    )
  }

  private toLayoutDescriptor(element: HTMLElement | null): TabLayoutDescriptor | null {
    if (!element) return null

    if (element.classList.contains('tab-group-chip')) {
      const key = element.dataset?.['groupId']
      return key ? { kind: 'group', key } : null
    }

    if (element.classList.contains('tab')) {
      const key = element.dataset?.['tabKey']
      return key ? { kind: 'tab', key } : null
    }

    return null
  }

  private findTabByLayoutKey(layoutKey?: string): any {
    if (!layoutKey) return null

    return this.tabs.find((tab) => String(tab?.layoutKey) === layoutKey) || null
  }

  private applyTabsOrder(orderedTabs: any[], activeTabReference: any): void {
    this.tabs.splice(0, this.tabs.length, ...orderedTabs)
    this.groups = this.tabGroups.removeEmptyGroups(this.tabs, this.groups)

    const activeIndex = activeTabReference ? this.tabs.indexOf(activeTabReference) : -1
    if (activeIndex >= 0) {
      this.activeTab = activeIndex
    } else if (this.tabs.length === 0) {
      this.activeTab = null
    }

    this.rebuildLayout()
  }

  private getMenuPosition(event: MouseEvent): { x: number; y: number } {
    event.preventDefault()
    event.stopPropagation()

    return {
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 250)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 300))
    }
  }

  trackTabByIdentity(index: number, tab: any): any {
    return tab
  }

  getTabIcon(tab: any): string {
    if (tab.icon === 'CHANGE') return 'icons/circle-unsaved.png'
    if (tab.icon === 'SETTINGS') return 'icons/settings.png'
    if (tab.icon === 'QUERY_ASSISTANT') return 'icons/code-block.png'
    if (tab.icon === 'SELECT_BUILDER') return 'icons/table.png'
    if (tab.icon === 'COMPARE' || tab.type === 'query-compare') return 'icons/ddl.png'
    if (tab.icon === 'DATABASE_EXPORT' || tab.type === 'database-export') return 'icons/export.png'
    if (tab.type === 'diagram') return 'icons/diagram.png'
    if (tab.type === 'procedure') return 'icons/procedure.png'

    return 'icons/code.png'
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const targetElement = event.target as HTMLElement
    if (!targetElement.closest('.add')) {
      this.dropdownVisible = false
    }

    if (!targetElement.closest('.tabs-context-menu') && !targetElement.closest('.tab-group-editor')) {
      if (this.groupEditor) this.applyGroupEditor()
      this.closeTabMenus()
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
