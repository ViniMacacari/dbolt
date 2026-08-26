import { TestBed } from '@angular/core/testing'

import { GridFilterSyncService } from './grid-filter-sync.service'

describe('GridFilterSyncService', () => {
  let service: GridFilterSyncService

  const idle = { isApplyingFilterModel: false, isRebuildingColumns: false }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GridFilterSyncService] })
    service = TestBed.inject(GridFilterSyncService)
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('accepts the filter the user typed in a column', () => {
    expect(service.isUserFilterChange({ source: 'columnFilter' }, idle)).toBeTrue()
    expect(service.isUserFilterChange({ source: 'quickFilter' }, idle)).toBeTrue()
    expect(service.isUserFilterChange({ source: 'advancedFilter' }, idle)).toBeTrue()
  })

  it('ignores the reset that the grid itself triggers', () => {
    expect(service.isUserFilterChange({ source: 'api' }, idle)).toBeFalse()
    expect(service.isUserFilterChange({ source: 'columnChanged' }, idle)).toBeFalse()
  })

  it('ignores every change while the grid is rebuilding its columns', () => {
    expect(service.isUserFilterChange(
      { source: 'columnFilter' },
      { isApplyingFilterModel: false, isRebuildingColumns: true }
    )).toBeFalse()
  })

  it('ignores the change caused by reapplying a filter model', () => {
    expect(service.isUserFilterChange(
      { source: 'columnFilter' },
      { isApplyingFilterModel: true, isRebuildingColumns: false }
    )).toBeFalse()
  })

  it('treats an event without a source as user driven', () => {
    expect(service.isUserFilterChange(undefined, idle)).toBeTrue()
    expect(service.isUserFilterChange({}, idle)).toBeTrue()
  })

  it('compares filter models regardless of missing values', () => {
    expect(service.sameFilterModel({}, undefined)).toBeTrue()
    expect(service.sameFilterModel(null, {})).toBeTrue()
    expect(service.sameFilterModel({ city: { filter: 'x' } }, { city: { filter: 'x' } })).toBeTrue()
    expect(service.sameFilterModel({ city: { filter: 'x' } }, {})).toBeFalse()
  })

  it('keeps the current columns when an empty result has the same fields', () => {
    expect(service.keepsColumnDefs(['id', 'name'], ['id', 'name'])).toBeTrue()
  })

  it('rebuilds the columns when the fields change', () => {
    expect(service.keepsColumnDefs(['id', 'name'], ['id', 'name', 'city'])).toBeFalse()
    expect(service.keepsColumnDefs(['id', 'name'], ['name', 'id'])).toBeFalse()
  })

  it('rebuilds the columns when there is nothing to compare', () => {
    expect(service.keepsColumnDefs([], ['id'])).toBeFalse()
    expect(service.keepsColumnDefs(['id'], [])).toBeFalse()
  })
})
