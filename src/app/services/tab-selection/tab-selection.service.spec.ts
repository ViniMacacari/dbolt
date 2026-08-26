import { TestBed } from '@angular/core/testing'

import { TabSelectionService } from './tab-selection.service'

describe('TabSelectionService', () => {
  let service: TabSelectionService

  const tabA = { name: 'A' }
  const tabB = { name: 'B' }
  const tabC = { name: 'C' }
  const tabs = [tabA, tabB, tabC]

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TabSelectionService] })
    service = TestBed.inject(TabSelectionService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('brings the active tab into the selection on the first ctrl click', () => {
    const selection = service.toggle(new Set(), tabB, tabA)

    expect(service.resolve(tabs, selection)).toEqual([tabA, tabB])
  })

  it('keeps adding tabs on further ctrl clicks', () => {
    let selection = service.toggle(new Set(), tabB, tabA)
    selection = service.toggle(selection, tabC, tabA)

    expect(service.resolve(tabs, selection)).toEqual([tabA, tabB, tabC])
  })

  it('drops the whole selection when only the active tab would be left', () => {
    let selection = service.toggle(new Set(), tabB, tabA)
    selection = service.toggle(selection, tabB, tabA)

    expect(selection.size).toBe(0)
  })

  it('ctrl clicking the active tab alone selects and unselects it', () => {
    let selection = service.toggle(new Set(), tabA, tabA)
    expect(service.resolve(tabs, selection)).toEqual([tabA])

    selection = service.toggle(selection, tabA, tabA)
    expect(selection.size).toBe(0)
  })

  it('adds the right clicked tab to an existing selection', () => {
    const selection = service.includeForContextMenu(new Set([tabA, tabB]), tabC)

    expect(service.resolve(tabs, selection)).toEqual([tabA, tabB, tabC])
  })

  it('does not start a selection from a right click alone', () => {
    expect(service.includeForContextMenu(new Set(), tabA).size).toBe(0)
  })

  it('returns the selection in tab order and skips closing tabs', () => {
    const closing = { name: 'D', closing: true }
    const selection = new Set([tabC, closing, tabA])

    expect(service.resolve([tabA, tabB, tabC, closing], selection)).toEqual([tabA, tabC])
  })

  it('prunes tabs that no longer exist', () => {
    const removed = { name: 'gone' }
    const selection = service.prune(tabs, new Set([tabA, removed]))

    expect(service.resolve(tabs, selection)).toEqual([tabA])
    expect(selection.has(removed)).toBeFalse()
  })
})
