import { Injectable } from '@angular/core'

import { PersistedWorkspaceTab, WorkspaceSession } from './workspace-session.model'

export type WorkspaceTabOpener = (tab: PersistedWorkspaceTab) => any

export interface WorkspaceRestoreHandlers {
  openers: Record<string, WorkspaceTabOpener>
  getTabs: () => any[]
  applyGroups: (groups: WorkspaceSession['groups'], assignments: Array<{ tab: any; groupId: string }>) => void
  selectTab: (index: number) => void
}

@Injectable({
  providedIn: 'root'
})
export class WorkspaceSessionRestoreService {
  async restore(session: WorkspaceSession | null, handlers: WorkspaceRestoreHandlers): Promise<number> {
    if (!session?.tabs?.length) return 0

    const connectionKeys = new Map<string, string>()
    const assignments: Array<{ tab: any; groupId: string }> = []
    let restoredCount = 0

    for (const persistedTab of session.tabs) {
      const opener = handlers.openers[persistedTab.type]
      if (!opener) continue

      const knownTabs = [...handlers.getTabs()]
      const preparedTab: PersistedWorkspaceTab = {
        ...persistedTab,
        context: this.withSharedConnectionKey(persistedTab.context, connectionKeys)
      }

      const createdTab = await this.openTab(opener, preparedTab, knownTabs, handlers)
      if (!createdTab) continue

      restoredCount += 1
      if (preparedTab.groupId) {
        assignments.push({ tab: createdTab, groupId: preparedTab.groupId })
      }
    }

    if (restoredCount === 0) return 0

    handlers.applyGroups(session.groups || [], assignments)

    const tabs = handlers.getTabs()
    const activeIndex = session.activeTabIndex === null
      ? tabs.length - 1
      : Math.min(session.activeTabIndex, tabs.length - 1)

    if (activeIndex >= 0) handlers.selectTab(activeIndex)

    return restoredCount
  }

  private async openTab(
    opener: WorkspaceTabOpener,
    persistedTab: PersistedWorkspaceTab,
    knownTabs: any[],
    handlers: WorkspaceRestoreHandlers
  ): Promise<any> {
    try {
      const result = opener(persistedTab)
      const awaitedResult = result instanceof Promise ? await result : result
      if (awaitedResult && typeof awaitedResult === 'object') return awaitedResult

      return this.findCreatedTab(knownTabs, handlers.getTabs())
    } catch (error) {
      console.warn('Could not restore a workspace tab:', error)
      return null
    }
  }

  private findCreatedTab(knownTabs: any[], currentTabs: any[]): any {
    const previousTabs = new Set(knownTabs)

    return currentTabs.find((tab) => !previousTabs.has(tab)) || null
  }

  private withSharedConnectionKey(context: any, connectionKeys: Map<string, string>): any {
    if (!context) return context
    if (context.connectionKey) return context

    const signature = [
      context.connId || context.connectionId || '',
      context.name || '',
      context.host || '',
      context.port || '',
      context.sgbd || '',
      context.version || '',
      context.database || '',
      context.schema || ''
    ].join(':')

    const existingKey = connectionKeys.get(signature)
    if (existingKey) {
      return { ...context, connectionKey: existingKey }
    }

    const connectionKey = `restored-${connectionKeys.size + 1}-${signature.length}`
    connectionKeys.set(signature, connectionKey)

    return { ...context, connectionKey }
  }
}
