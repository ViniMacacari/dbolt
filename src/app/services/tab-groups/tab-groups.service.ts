import { Injectable } from '@angular/core'

export type TabGroupColorId =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'

export interface TabGroupColor {
  id: TabGroupColorId
  value: string
  soft: string
}

export interface TabGroup {
  id: string
  name: string
  colorId: TabGroupColorId
  collapsed: boolean
  animating?: boolean
}

export type TabLayoutItem =
  | { kind: 'group'; group: TabGroup; tabCount: number; hasActiveTab: boolean }
  | { kind: 'tab'; tab: any; index: number; group: TabGroup | null }

export interface TabLayoutDescriptor {
  kind: 'group' | 'tab'
  key: string
}

@Injectable({
  providedIn: 'root'
})
export class TabGroupsService {
  readonly colors: TabGroupColor[] = [
    { id: 'blue', value: 'var(--dbolt-tab-group-blue)', soft: 'var(--dbolt-tab-group-blue-soft)' },
    { id: 'purple', value: 'var(--dbolt-tab-group-purple)', soft: 'var(--dbolt-tab-group-purple-soft)' },
    { id: 'green', value: 'var(--dbolt-tab-group-green)', soft: 'var(--dbolt-tab-group-green-soft)' },
    { id: 'yellow', value: 'var(--dbolt-tab-group-yellow)', soft: 'var(--dbolt-tab-group-yellow-soft)' },
    { id: 'red', value: 'var(--dbolt-tab-group-red)', soft: 'var(--dbolt-tab-group-red-soft)' },
    { id: 'pink', value: 'var(--dbolt-tab-group-pink)', soft: 'var(--dbolt-tab-group-pink-soft)' },
    { id: 'cyan', value: 'var(--dbolt-tab-group-cyan)', soft: 'var(--dbolt-tab-group-cyan-soft)' },
    { id: 'grey', value: 'var(--dbolt-tab-group-grey)', soft: 'var(--dbolt-tab-group-grey-soft)' }
  ]

  private groupSequence = 0

  createGroup(groups: TabGroup[], name: string): TabGroup {
    this.groupSequence += 1

    return {
      id: `group-${this.groupSequence}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      colorId: this.nextColorId(groups),
      collapsed: false,
      animating: false
    }
  }

  nextGroupNumber(): number {
    return this.groupSequence + 1
  }

  nextColorId(groups: TabGroup[]): TabGroupColorId {
    const usedColors = new Set(groups.map((group) => group.colorId))
    const availableColor = this.colors.find((color) => !usedColors.has(color.id))

    return (availableColor || this.colors[groups.length % this.colors.length]).id
  }

  getColor(colorId: TabGroupColorId): TabGroupColor {
    return this.colors.find((color) => color.id === colorId) || this.colors[0]
  }

  resolveGroup(groups: TabGroup[], groupId: any): TabGroup | null {
    if (!groupId) return null

    return groups.find((group) => group.id === groupId) || null
  }

  groupTabs(tabs: any[], groups: TabGroup[], groupId: string): any[] {
    return tabs.filter((tab) => this.resolveGroup(groups, tab?.groupId)?.id === groupId)
  }

  buildLayout(tabs: any[], groups: TabGroup[], activeTab: number | null): TabLayoutItem[] {
    const activeTabReference = activeTab === null ? null : tabs[activeTab]
    const items: TabLayoutItem[] = []
    let currentGroupId: string | null = null

    tabs.forEach((tab, index) => {
      const group = this.resolveGroup(groups, tab?.groupId)

      if (group && group.id !== currentGroupId) {
        const groupTabs = this.groupTabs(tabs, groups, group.id)
        items.push({
          kind: 'group',
          group,
          tabCount: groupTabs.length,
          hasActiveTab: Boolean(activeTabReference) && groupTabs.includes(activeTabReference)
        })
      }

      currentGroupId = group ? group.id : null

      if (group?.collapsed && !group.animating) return

      items.push({ kind: 'tab', tab, index, group })
    })

    return items
  }

  assignTab(tabs: any[], groups: TabGroup[], tab: any, groupId: string | null): any[] {
    if (!tabs.includes(tab)) return [...tabs]

    const group = this.resolveGroup(groups, groupId)
    const groupTabs = group ? this.groupTabs(tabs, groups, group.id) : []
    const previousGroupId = this.resolveGroup(groups, tab?.groupId)?.id || null

    tab.groupId = group ? group.id : null

    if (group && groupTabs.length > 0 && !groupTabs.includes(tab)) {
      const remainingTabs = tabs.filter((item) => item !== tab)
      const lastGroupTab = groupTabs[groupTabs.length - 1]
      const insertIndex = remainingTabs.indexOf(lastGroupTab) + 1
      remainingTabs.splice(insertIndex, 0, tab)

      return this.normalizeOrder(remainingTabs, groups)
    }

    if (!group && previousGroupId) {
      const remainingTabs = tabs.filter((item) => item !== tab)
      const previousGroupTabs = this.groupTabs(remainingTabs, groups, previousGroupId)
      const lastGroupTab = previousGroupTabs[previousGroupTabs.length - 1]
      const insertIndex = lastGroupTab ? remainingTabs.indexOf(lastGroupTab) + 1 : remainingTabs.length
      remainingTabs.splice(insertIndex, 0, tab)

      return this.normalizeOrder(remainingTabs, groups)
    }

    return this.normalizeOrder(tabs, groups)
  }

  resolveDropGroupId(
    tabs: any[],
    groups: TabGroup[],
    previousItem: TabLayoutDescriptor | null
  ): string | null {
    if (!previousItem) return null

    if (previousItem.kind === 'group') {
      return this.resolveGroup(groups, previousItem.key)?.id || null
    }

    const previousTab = tabs.find((tab) => String(tab?.layoutKey) === previousItem.key)

    return this.resolveGroup(groups, previousTab?.groupId)?.id || null
  }

  buildOrderFromLayout(tabs: any[], groups: TabGroup[], layout: TabLayoutDescriptor[]): any[] {
    const orderedTabs: any[] = []
    const emittedTabs = new Set<any>()
    const emittedGroups = new Set<string>()

    const emitTab = (tab: any) => {
      if (!tab || emittedTabs.has(tab)) return

      emittedTabs.add(tab)
      orderedTabs.push(tab)
    }

    const emitGroup = (groupId: string, visibleOrder: any[]) => {
      if (emittedGroups.has(groupId)) return

      emittedGroups.add(groupId)
      const groupTabs = this.groupTabs(tabs, groups, groupId)
      visibleOrder
        .filter((tab) => groupTabs.includes(tab))
        .forEach(emitTab)
      groupTabs.forEach(emitTab)
    }

    const visibleOrder = layout
      .filter((item) => item.kind === 'tab')
      .map((item) => tabs.find((tab) => String(tab?.layoutKey) === item.key))
      .filter(Boolean)

    layout.forEach((item) => {
      if (item.kind === 'group') {
        const group = this.resolveGroup(groups, item.key)
        if (group) emitGroup(group.id, visibleOrder)
        return
      }

      const tab = tabs.find((candidate) => String(candidate?.layoutKey) === item.key)
      if (!tab) return

      const group = this.resolveGroup(groups, tab.groupId)
      if (group) {
        emitGroup(group.id, visibleOrder)
        return
      }

      emitTab(tab)
    })

    tabs.forEach((tab) => {
      const group = this.resolveGroup(groups, tab?.groupId)
      if (group) {
        emitGroup(group.id, visibleOrder)
        return
      }

      emitTab(tab)
    })

    return this.normalizeOrder(orderedTabs, groups)
  }

  normalizeOrder(tabs: any[], groups: TabGroup[]): any[] {
    const orderedTabs: any[] = []
    const emittedTabs = new Set<any>()

    tabs.forEach((tab) => {
      if (emittedTabs.has(tab)) return

      const group = this.resolveGroup(groups, tab?.groupId)
      if (!group) {
        emittedTabs.add(tab)
        orderedTabs.push(tab)
        return
      }

      tabs
        .filter((candidate) => this.resolveGroup(groups, candidate?.groupId)?.id === group.id)
        .forEach((groupTab) => {
          if (emittedTabs.has(groupTab)) return

          emittedTabs.add(groupTab)
          orderedTabs.push(groupTab)
        })
    })

    return orderedTabs
  }

  removeEmptyGroups(tabs: any[], groups: TabGroup[]): TabGroup[] {
    const usedGroupIds = new Set(
      tabs
        .map((tab) => this.resolveGroup(groups, tab?.groupId)?.id)
        .filter(Boolean)
    )

    return groups.filter((group) => usedGroupIds.has(group.id))
  }
}
