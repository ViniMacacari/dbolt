export const WORKSPACE_SESSION_VERSION = 1

export interface PersistedWorkspaceGroup {
  id: string
  name: string
  colorId: string
  collapsed: boolean
}

export interface PersistedWorkspaceTab {
  type: string
  name: string
  id?: string | number
  groupId?: string | null
  context?: any
  sql?: string
  originalContent?: string
  folderPath?: string
  persisted?: boolean
  versioningEnabled?: boolean
  dirty?: boolean
  objectName?: string
  objectType?: string
  activeView?: string
  settingsTab?: string
  diagramScope?: string
  compareLeft?: any
  compareRight?: any
}

export interface WorkspaceSession {
  version: number
  savedAt: number
  activeTabIndex: number | null
  tabs: PersistedWorkspaceTab[]
  groups: PersistedWorkspaceGroup[]
}

export const RESTORABLE_WORKSPACE_TAB_TYPES = [
  'sql',
  'schema',
  'table',
  'procedure',
  'diagram',
  'query-compare',
  'query-assistant',
  'select-builder',
  'database-export',
  'settings'
]
