import { fakeAsync, tick } from '@angular/core/testing'
import { QueryHistoryComponent } from './query-history.component'
import { QueryVersionDiffService } from '../../../services/query-version-diff/query-version-diff.service'
import { QuerySaveService, SavedQueryVersion } from '../../../services/query-save/query-save.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

describe('QueryHistoryComponent', () => {
  let component: QueryHistoryComponent
  let storage: jasmine.SpyObj<QuerySaveService>
  const old: SavedQueryVersion = { id: 1, changedAt: '2026-09-01', name: 'Clientes', sql: 'SELECT 1' }
  const recent: SavedQueryVersion = { id: 2, changedAt: '2026-09-02', name: 'Clientes', sql: 'SELECT 2', dbSchema: { database: 'Hana', schema: 'TEST' } }

  beforeEach(() => {
    storage = jasmine.createSpyObj('QuerySaveService', ['loadVersions', 'formatDate'])
    component = new QueryHistoryComponent(storage, new QueryVersionDiffService(), {
      translate: (key: string) => key
    } as AppLanguageService)
    component.tabInfo = { id: 42, name: 'Clientes', persisted: true, dbInfo: { database: 'Hana' } }
    component.currentSql = 'SELECT 3'
    storage.loadVersions.and.resolveTo([old, recent])
  })

  it('loads newest first and compares saved SQL with unsaved editor contents', async () => {
    await component.load()
    expect(storage.loadVersions).toHaveBeenCalledWith(42)
    expect(component.selected).toBe(recent)
    expect(component.diff.removed).toBe(1)
    expect(component.diff.added).toBe(1)
    expect(component.diff.lines.find(line => line.type === 'added')?.text).toBe('SELECT 3')
    component.select(old)
    expect(component.diff.lines.find(line => line.type === 'removed')?.text).toBe('SELECT 1')
  })

  it('opens a detached version copy after closing, preserving SQL and context', fakeAsync(() => {
    component.select(recent)
    const emit = spyOn(component.newFile, 'emit')
    component.openCopy()
    expect(emit).not.toHaveBeenCalled()
    tick(180)
    expect(emit).toHaveBeenCalledWith({ sql: recent.sql, name: 'queryLibrary.versionName', context: recent.dbSchema })
    expect(component.currentSql).toBe('SELECT 3')
    expect(component.tabInfo.id).toBe(42)
  }))

  it('starts an empty file in the same context after closing', fakeAsync(() => {
    const emit = spyOn(component.newFile, 'emit')
    component.openBlank()
    expect(emit).not.toHaveBeenCalled()
    tick(180)
    expect(emit).toHaveBeenCalledWith({ sql: '', context: component.tabInfo.dbInfo })
  }))

  it('does not fetch history for unsaved files and can copy their content', fakeAsync(() => {
    component.tabInfo.persisted = false
    void component.load()
    expect(storage.loadVersions).not.toHaveBeenCalled()
    const emit = spyOn(component.newFile, 'emit')
    component.openCopy()
    tick(180)
    expect(emit.calls.mostRecent().args[0]?.sql).toBe('SELECT 3')
  }))

  it('animates closing once even with repeated requests', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList)
    const closed = spyOn(component.closed, 'emit')
    const newFile = spyOn(component.newFile, 'emit')
    component.close()
    component.close()
    component.openBlank()
    expect(component.closing).toBeTrue()
    tick(179)
    expect(closed).not.toHaveBeenCalled()
    tick(1)
    expect(closed).toHaveBeenCalledTimes(1)
    expect(newFile).not.toHaveBeenCalled()
  }))

  it('cancels pending actions on destruction', fakeAsync(() => {
    const emit = spyOn(component.newFile, 'emit')
    component.openBlank()
    component.ngOnDestroy()
    tick(180)
    expect(emit).not.toHaveBeenCalled()
  }))

  it('does not delay closing when reduced motion is requested', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList)
    const emit = spyOn(component.closed, 'emit')
    component.close()
    tick(0)
    expect(emit).toHaveBeenCalledTimes(1)
  }))

  it('handles empty history and identical contents', async () => {
    storage.loadVersions.and.resolveTo([])
    await component.load()
    expect(component.selected).toBeNull()
    expect(component.loading).toBeFalse()
    component.currentSql = old.sql
    component.select(old)
    expect(component.diff.added + component.diff.removed).toBe(0)
  })

  it('shows errors and allows retry', async () => {
    storage.loadVersions.and.rejectWith(new Error('offline'))
    await component.load()
    expect(component.error).toBeTrue()
    expect(component.loading).toBeFalse()
    storage.loadVersions.and.resolveTo([old])
    await component.load()
    expect(component.error).toBeFalse()
    expect(component.selected).toBe(old)
  })

  it('ignores responses after the dialog is destroyed', async () => {
    const pending = component.load()
    component.ngOnDestroy()
    await pending
    expect(component.versions).toEqual([])
  })
})
