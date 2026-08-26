import { Injectable } from '@angular/core'

import { ConnectionContextService } from '../connection-context/connection-context.service'
import {
  PersistedWorkspaceGroup,
  PersistedWorkspaceTab,
  RESTORABLE_WORKSPACE_TAB_TYPES,
  WORKSPACE_SESSION_VERSION,
  WorkspaceSession
} from './workspace-session.model'

type WorkspaceSessionStore = Record<string, WorkspaceSession>

@Injectable({
  providedIn: 'root'
})
export class WorkspaceSessionService {
  private readonly storageKey = 'workspace-sessions'
  private readonly saveDebounceMs = 700
  private readonly maxStoredCharacters = 4_000_000

  private readonly snapshotProviders = new Map<string, () => WorkspaceSession | null>()
  private saveTimeout: any = null
  private beforeUnloadListener: (() => void) | null = null

  constructor(private connectionContext: ConnectionContextService) {
    this.registerBeforeUnload()
  }

  registerSnapshotProvider(workspaceId: string, provider: () => WorkspaceSession | null): () => void {
    this.snapshotProviders.set(workspaceId, provider)

    return () => {
      if (this.snapshotProviders.get(workspaceId) === provider) {
        this.snapshotProviders.delete(workspaceId)
      }
    }
  }

  scheduleSave(): void {
    clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => this.persistNow(), this.saveDebounceMs)
  }

  persistNow(): void {
    clearTimeout(this.saveTimeout)
    this.saveTimeout = null

    this.snapshotProviders.forEach((provider, workspaceId) => {
      try {
        this.save(workspaceId, provider())
      } catch (error) {
        console.warn('Could not persist the workspace session:', error)
      }
    })
  }

  save(workspaceId: string, session: WorkspaceSession | null): void {
    const store = this.readStore()

    if (!session || session.tabs.length === 0) {
      if (!store[workspaceId]) return

      delete store[workspaceId]
      this.writeStore(store)
      return
    }

    store[workspaceId] = session
    this.writeStore(store)
  }

  load(workspaceId: string): WorkspaceSession | null {
    const session = this.readStore()[workspaceId]

    return session ? this.normalizeSession(session) : null
  }

  clear(workspaceId: string): void {
    const store = this.readStore()
    if (!store[workspaceId]) return

    delete store[workspaceId]
    this.writeStore(store)
  }

  buildSnapshot(tabs: any[], groups: any[], activeTabIndex: number | null): WorkspaceSession {
    const restorableTabs = (tabs || []).filter((tab) => this.isRestorable(tab))
    const activeTab = activeTabIndex === null ? null : (tabs || [])[activeTabIndex]
    const activeIndex = activeTab ? restorableTabs.indexOf(activeTab) : -1
    const persistedTabs = restorableTabs.map((tab) => this.describeTab(tab))
    const usedGroupIds = new Set(persistedTabs.map((tab) => tab.groupId).filter(Boolean))

    return {
      version: WORKSPACE_SESSION_VERSION,
      savedAt: Date.now(),
      activeTabIndex: activeIndex >= 0 ? activeIndex : null,
      tabs: persistedTabs,
      groups: (groups || [])
        .filter((group) => usedGroupIds.has(group?.id))
        .map((group) => this.toPersistedGroup(group))
    }
  }

  isRestorable(tab: any): boolean {
    return Boolean(tab) && !tab.closing && RESTORABLE_WORKSPACE_TAB_TYPES.includes(tab.type)
  }

  describeTab(tab: any): PersistedWorkspaceTab {
    const persistedTab: PersistedWorkspaceTab = {
      type: tab.type,
      name: String(tab.name ?? ''),
      groupId: tab.groupId || null,
      context: this.connectionContext.withoutRuntimeFields(tab.dbInfo || tab.info?.context) || undefined
    }

    if (tab.type === 'sql') {
      persistedTab.id = tab.persisted ? tab.id : undefined
      persistedTab.sql = tab.info?.sql || ''
      persistedTab.originalContent = tab.originalContent || ''
      persistedTab.folderPath = tab.folderPath || ''
      persistedTab.persisted = Boolean(tab.persisted)
      persistedTab.versioningEnabled = Boolean(tab.versioningEnabled)
      persistedTab.dirty = tab.icon === 'CHANGE'
    }

    if (tab.type === 'table' || tab.type === 'procedure') {
      persistedTab.objectName = tab.info?.name || ''
      persistedTab.objectType = tab.info?.objectType || tab.type
      persistedTab.activeView = tab.tableInfoState?.activeView || undefined
    }

    if (tab.type === 'diagram') {
      persistedTab.diagramScope = tab.info?.scope || 'schema'
      persistedTab.objectName = tab.info?.objectName || ''
      persistedTab.objectType = tab.info?.objectType || undefined
    }

    if (tab.type === 'query-compare') {
      persistedTab.compareLeft = tab.info?.left
      persistedTab.compareRight = tab.info?.right
    }

    if (tab.type === 'settings') {
      persistedTab.settingsTab = tab.info?.activeTab || undefined
    }

    return persistedTab
  }

  private toPersistedGroup(group: any): PersistedWorkspaceGroup {
    return {
      id: String(group.id),
      name: String(group.name ?? ''),
      colorId: String(group.colorId ?? 'blue'),
      collapsed: Boolean(group.collapsed)
    }
  }

  private normalizeSession(session: any): WorkspaceSession | null {
    if (!session || session.version !== WORKSPACE_SESSION_VERSION) return null

    const tabs = Array.isArray(session.tabs)
      ? session.tabs.filter((tab: any) => tab && RESTORABLE_WORKSPACE_TAB_TYPES.includes(tab.type))
      : []
    if (tabs.length === 0) return null

    const groups = Array.isArray(session.groups) ? session.groups : []
    const activeTabIndex = Number.isInteger(session.activeTabIndex) &&
      session.activeTabIndex >= 0 &&
      session.activeTabIndex < tabs.length
      ? session.activeTabIndex
      : null

    return {
      version: WORKSPACE_SESSION_VERSION,
      savedAt: Number(session.savedAt) || 0,
      activeTabIndex,
      tabs,
      groups
    }
  }

  private readStore(): WorkspaceSessionStore {
    try {
      const rawStore = localStorage.getItem(this.storageKey)
      if (!rawStore) return {}

      const store = JSON.parse(rawStore)
      return store && typeof store === 'object' ? store as WorkspaceSessionStore : {}
    } catch {
      return {}
    }
  }

  private writeStore(store: WorkspaceSessionStore): void {
    try {
      const payload = JSON.stringify(store)
      if (payload.length > this.maxStoredCharacters) {
        localStorage.setItem(this.storageKey, JSON.stringify(this.dropLargestSessions(store)))
        return
      }

      localStorage.setItem(this.storageKey, payload)
    } catch (error) {
      console.warn('Could not store the workspace session:', error)
    }
  }

  private dropLargestSessions(store: WorkspaceSessionStore): WorkspaceSessionStore {
    const entries = Object.entries(store)
      .sort(([, left], [, right]) => (right.savedAt || 0) - (left.savedAt || 0))
    const reducedStore: WorkspaceSessionStore = {}

    entries.forEach(([workspaceId, session]) => {
      const candidate = { ...reducedStore, [workspaceId]: session }
      if (JSON.stringify(candidate).length <= this.maxStoredCharacters) {
        reducedStore[workspaceId] = session
      }
    })

    return reducedStore
  }

  private registerBeforeUnload(): void {
    if (typeof window === 'undefined' || this.beforeUnloadListener) return

    this.beforeUnloadListener = () => this.persistNow()
    window.addEventListener('beforeunload', this.beforeUnloadListener)
  }
}
