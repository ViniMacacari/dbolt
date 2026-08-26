import { TestBed } from '@angular/core/testing'

import { ConnectionContextService } from '../connection-context/connection-context.service'
import { WorkspaceSessionService } from './workspace-session.service'
import { WORKSPACE_SESSION_VERSION } from './workspace-session.model'

describe('WorkspaceSessionService', () => {
  let service: WorkspaceSessionService

  const connectionContextStub = {
    withoutRuntimeFields: (context: any) => {
      if (!context) return context
      const { connectionKey, ...persistable } = context
      return persistable
    }
  }

  const context = {
    connId: 4,
    sgbd: 'Postgres',
    version: 'v9',
    database: 'app',
    schema: 'public',
    connectionKey: 'tab-1'
  }

  function sqlTab(name: string, sql: string, extra: any = {}): any {
    return {
      type: 'sql',
      name,
      info: { sql },
      originalContent: sql,
      dbInfo: context,
      icon: 'CODE',
      ...extra
    }
  }

  beforeEach(() => {
    localStorage.removeItem('workspace-sessions')

    TestBed.configureTestingModule({
      providers: [
        WorkspaceSessionService,
        { provide: ConnectionContextService, useValue: connectionContextStub }
      ]
    })
    service = TestBed.inject(WorkspaceSessionService)
  })

  afterEach(() => {
    localStorage.removeItem('workspace-sessions')
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('keeps the open tabs, their content and the active one', () => {
    const tabs = [sqlTab('Query A', 'select 1'), sqlTab('Query B', 'select 2', { icon: 'CHANGE' })]

    const snapshot = service.buildSnapshot(tabs, [], 1)

    expect(snapshot.version).toBe(WORKSPACE_SESSION_VERSION)
    expect(snapshot.tabs.map((tab) => tab.name)).toEqual(['Query A', 'Query B'])
    expect(snapshot.tabs[0].sql).toBe('select 1')
    expect(snapshot.tabs[1].dirty).toBeTrue()
    expect(snapshot.activeTabIndex).toBe(1)
  })

  it('drops the runtime connection key from the persisted context', () => {
    const snapshot = service.buildSnapshot([sqlTab('Query A', 'select 1')], [], 0)

    expect(snapshot.tabs[0].context.connectionKey).toBeUndefined()
    expect(snapshot.tabs[0].context.database).toBe('app')
  })

  it('ignores tabs that are closing or cannot be reopened', () => {
    const tabs = [
      sqlTab('Query A', 'select 1'),
      { type: 'unknown-tool', name: 'Tool', info: {} },
      sqlTab('Closing', 'select 3', { closing: true })
    ]

    const snapshot = service.buildSnapshot(tabs, [], 0)

    expect(snapshot.tabs.map((tab) => tab.name)).toEqual(['Query A'])
  })

  it('remaps the active index after skipping a tab that is not restorable', () => {
    const tabs = [
      { type: 'unknown-tool', name: 'Tool', info: {} },
      sqlTab('Query A', 'select 1')
    ]

    expect(service.buildSnapshot(tabs, [], 1).activeTabIndex).toBe(0)
  })

  it('persists only the groups still used by the saved tabs', () => {
    const tabs = [sqlTab('Query A', 'select 1', { groupId: 'g1' })]
    const groups = [
      { id: 'g1', name: 'Vendas', colorId: 'blue', collapsed: true },
      { id: 'g2', name: 'RH', colorId: 'red', collapsed: false }
    ]

    const snapshot = service.buildSnapshot(tabs, groups, 0)

    expect(snapshot.groups.map((group) => group.id)).toEqual(['g1'])
    expect(snapshot.groups[0].collapsed).toBeTrue()
    expect(snapshot.tabs[0].groupId).toBe('g1')
  })

  it('keeps the table view that was open', () => {
    const tabs = [{
      type: 'table',
      name: 'users',
      dbInfo: context,
      info: { name: 'users', objectType: 'view' },
      tableInfoState: { activeView: 'ddl' }
    }]

    const snapshot = service.buildSnapshot(tabs, [], 0)

    expect(snapshot.tabs[0].objectName).toBe('users')
    expect(snapshot.tabs[0].objectType).toBe('view')
    expect(snapshot.tabs[0].activeView).toBe('ddl')
  })

  it('stores and reloads a session per workspace', () => {
    const snapshot = service.buildSnapshot([sqlTab('Query A', 'select 1')], [], 0)
    service.save('connection-1', snapshot)

    expect(service.load('connection-1')?.tabs[0].sql).toBe('select 1')
    expect(service.load('connection-2')).toBeNull()
  })

  it('removes the stored session when no tab is left', () => {
    service.save('connection-1', service.buildSnapshot([sqlTab('Query A', 'select 1')], [], 0))
    service.save('connection-1', service.buildSnapshot([], [], null))

    expect(service.load('connection-1')).toBeNull()
  })

  it('discards a stored session written by another version', () => {
    localStorage.setItem('workspace-sessions', JSON.stringify({
      'connection-1': { version: WORKSPACE_SESSION_VERSION + 1, tabs: [{ type: 'sql', name: 'old' }] }
    }))

    expect(service.load('connection-1')).toBeNull()
  })

  it('survives a corrupted storage payload', () => {
    localStorage.setItem('workspace-sessions', '{not json')

    expect(service.load('connection-1')).toBeNull()
  })

  it('persists every registered workspace on demand', () => {
    const unregister = service.registerSnapshotProvider(
      'connection-9',
      () => service.buildSnapshot([sqlTab('Query A', 'select 1')], [], 0)
    )

    service.persistNow()
    expect(service.load('connection-9')?.tabs.length).toBe(1)

    unregister()
    service.save('connection-9', null)
    service.persistNow()
    expect(service.load('connection-9')).toBeNull()
  })
})
