import { TestBed } from '@angular/core/testing'

import { ClosedTabsHistoryService } from './closed-tabs-history.service'
import { PersistedWorkspaceTab } from '../workspace-session/workspace-session.model'

describe('ClosedTabsHistoryService', () => {
  let service: ClosedTabsHistoryService

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ClosedTabsHistoryService] })
    service = TestBed.inject(ClosedTabsHistoryService)
  })

  function tab(name: string): PersistedWorkspaceTab {
    return { type: 'sql', name, sql: `select '${name}'` }
  }

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('reopens the most recently closed tab first', () => {
    service.push('connection-1', tab('A'))
    service.push('connection-1', tab('B'))

    expect(service.pop('connection-1')?.name).toBe('B')
    expect(service.pop('connection-1')?.name).toBe('A')
    expect(service.pop('connection-1')).toBeNull()
  })

  it('keeps a separate history per workspace', () => {
    service.push('connection-1', tab('A'))
    service.push('connection-2', tab('B'))

    expect(service.pop('connection-2')?.name).toBe('B')
    expect(service.hasClosedTabs('connection-2')).toBeFalse()
    expect(service.hasClosedTabs('connection-1')).toBeTrue()
  })

  it('reports what would be reopened without consuming it', () => {
    service.push('connection-1', tab('A'))

    expect(service.peek('connection-1')?.name).toBe('A')
    expect(service.hasClosedTabs('connection-1')).toBeTrue()
    expect(service.pop('connection-1')?.name).toBe('A')
  })

  it('ignores entries without a tab type', () => {
    service.push('connection-1', null)
    service.push('connection-1', { type: '', name: 'broken' } as PersistedWorkspaceTab)

    expect(service.hasClosedTabs('connection-1')).toBeFalse()
  })

  it('forgets the oldest tabs beyond the history limit', () => {
    for (let index = 1; index <= 20; index += 1) {
      service.push('connection-1', tab(`tab-${index}`))
    }

    const reopened: string[] = []
    while (service.hasClosedTabs('connection-1')) {
      reopened.push(String(service.pop('connection-1')?.name))
    }

    expect(reopened.length).toBe(15)
    expect(reopened[0]).toBe('tab-20')
    expect(reopened[reopened.length - 1]).toBe('tab-6')
  })

  it('clears the history of a workspace', () => {
    service.push('connection-1', tab('A'))
    service.clear('connection-1')

    expect(service.hasClosedTabs('connection-1')).toBeFalse()
    expect(service.peek('connection-1')).toBeNull()
  })
})
