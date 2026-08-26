import { TestBed } from '@angular/core/testing'

import { WorkspaceSessionRestoreService } from './workspace-session-restore.service'
import { WORKSPACE_SESSION_VERSION, WorkspaceSession } from './workspace-session.model'

describe('WorkspaceSessionRestoreService', () => {
  let service: WorkspaceSessionRestoreService
  let tabs: any[]
  let selectedIndex: number | null
  let appliedGroups: any

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WorkspaceSessionRestoreService] })
    service = TestBed.inject(WorkspaceSessionRestoreService)
    tabs = []
    selectedIndex = null
    appliedGroups = null
  })

  function handlers(openers: Record<string, (tab: any) => any>) {
    return {
      openers,
      getTabs: () => tabs,
      applyGroups: (groups: any, assignments: any) => {
        appliedGroups = { groups, assignments }
      },
      selectTab: (index: number) => {
        selectedIndex = index
      }
    }
  }

  function session(partial: Partial<WorkspaceSession>): WorkspaceSession {
    return {
      version: WORKSPACE_SESSION_VERSION,
      savedAt: 0,
      activeTabIndex: null,
      tabs: [],
      groups: [],
      ...partial
    }
  }

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('reopens the tabs in order and selects the one that was active', async () => {
    const opener = (tab: any) => {
      const created = { name: tab.name }
      tabs.push(created)
      return created
    }

    const restored = await service.restore(session({
      tabs: [
        { type: 'sql', name: 'Query A' },
        { type: 'sql', name: 'Query B' }
      ],
      activeTabIndex: 0
    }), handlers({ sql: opener }))

    expect(restored).toBe(2)
    expect(tabs.map((tab) => tab.name)).toEqual(['Query A', 'Query B'])
    expect(selectedIndex).toBe(0)
  })

  it('adopts the tab an opener created without returning it', async () => {
    const restored = await service.restore(session({
      tabs: [{ type: 'schema', name: 'app.public' }]
    }), handlers({
      schema: () => {
        tabs.push({ name: 'app.public' })
      }
    }))

    expect(restored).toBe(1)
    expect(appliedGroups.assignments).toEqual([])
    expect(selectedIndex).toBe(0)
  })

  it('gives tabs of the same connection a single shared connection key', async () => {
    const openedContexts: any[] = []
    const opener = (tab: any) => {
      openedContexts.push(tab.context)
      const created = { name: tab.name }
      tabs.push(created)
      return created
    }

    await service.restore(session({
      tabs: [
        { type: 'sql', name: 'A', context: { connId: 1, database: 'app', schema: 'public' } },
        { type: 'sql', name: 'B', context: { connId: 1, database: 'app', schema: 'public' } },
        { type: 'sql', name: 'C', context: { connId: 1, database: 'app', schema: 'other' } }
      ]
    }), handlers({ sql: opener }))

    expect(openedContexts[0].connectionKey).toBe(openedContexts[1].connectionKey)
    expect(openedContexts[2].connectionKey).not.toBe(openedContexts[0].connectionKey)
  })

  it('reapplies the groups of the restored tabs', async () => {
    const opener = (tab: any) => {
      const created = { name: tab.name }
      tabs.push(created)
      return created
    }

    await service.restore(session({
      tabs: [
        { type: 'sql', name: 'A', groupId: 'g1' },
        { type: 'sql', name: 'B' }
      ],
      groups: [{ id: 'g1', name: 'Vendas', colorId: 'blue', collapsed: true }]
    }), handlers({ sql: opener }))

    expect(appliedGroups.groups.length).toBe(1)
    expect(appliedGroups.assignments).toEqual([{ tab: tabs[0], groupId: 'g1' }])
  })

  it('skips tab types without an opener and keeps restoring the rest', async () => {
    const restored = await service.restore(session({
      tabs: [
        { type: 'retired-tool', name: 'Old' },
        { type: 'sql', name: 'A' }
      ]
    }), handlers({
      sql: (tab) => {
        const created = { name: tab.name }
        tabs.push(created)
        return created
      }
    }))

    expect(restored).toBe(1)
    expect(tabs.map((tab) => tab.name)).toEqual(['A'])
  })

  it('keeps going when one opener fails', async () => {
    const restored = await service.restore(session({
      tabs: [
        { type: 'sql', name: 'A' },
        { type: 'diagram', name: 'Broken' },
        { type: 'sql', name: 'B' }
      ]
    }), handlers({
      sql: (tab) => {
        const created = { name: tab.name }
        tabs.push(created)
        return created
      },
      diagram: () => {
        throw new Error('could not reopen')
      }
    }))

    expect(restored).toBe(2)
    expect(tabs.map((tab) => tab.name)).toEqual(['A', 'B'])
  })

  it('does nothing without a stored session', async () => {
    expect(await service.restore(null, handlers({}))).toBe(0)
    expect(await service.restore(session({ tabs: [] }), handlers({}))).toBe(0)
    expect(selectedIndex).toBeNull()
  })
})
