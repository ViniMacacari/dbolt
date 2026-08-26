import { Injectable } from '@angular/core'

import { PersistedWorkspaceTab } from '../workspace-session/workspace-session.model'

@Injectable({
  providedIn: 'root'
})
export class ClosedTabsHistoryService {
  private readonly maxEntries = 15
  private readonly histories = new Map<string, PersistedWorkspaceTab[]>()

  push(workspaceId: string, closedTab: PersistedWorkspaceTab | null): void {
    if (!closedTab?.type) return

    const history = this.histories.get(workspaceId) || []
    const updatedHistory = [closedTab, ...history].slice(0, this.maxEntries)

    this.histories.set(workspaceId, updatedHistory)
  }

  pop(workspaceId: string): PersistedWorkspaceTab | null {
    const history = this.histories.get(workspaceId)
    if (!history?.length) return null

    const [closedTab, ...remainingHistory] = history

    if (remainingHistory.length > 0) {
      this.histories.set(workspaceId, remainingHistory)
    } else {
      this.histories.delete(workspaceId)
    }

    return closedTab
  }

  peek(workspaceId: string): PersistedWorkspaceTab | null {
    return this.histories.get(workspaceId)?.[0] || null
  }

  hasClosedTabs(workspaceId: string): boolean {
    return Boolean(this.histories.get(workspaceId)?.length)
  }

  clear(workspaceId: string): void {
    this.histories.delete(workspaceId)
  }
}
