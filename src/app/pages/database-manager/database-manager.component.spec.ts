import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatabaseManagerComponent } from './database-manager.component';

describe('DatabaseManagerComponent', () => {
  let component: DatabaseManagerComponent;
  let fixture: ComponentFixture<DatabaseManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatabaseManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens a cross-schema SQL reference with an isolated schema context', () => {
    const sourceContext = {
      sgbd: 'Hana',
      version: 'v1',
      connectionKey: 'query-tab',
      schema: 'public'
    };
    const targetContext = {
      ...sourceContext,
      connectionKey: 'table-tab',
      schema: 'sales'
    };
    const connectionContext = (component as any).connectionContext;
    spyOn(connectionContext, 'createContext').and.returnValue(targetContext);
    const openedTab = {} as any;
    const tabs = {
      getActiveTab: jasmine.createSpy('getActiveTab'),
      newTab: jasmine.createSpy('newTab').and.returnValue(openedTab)
    };
    component.tabsComponent = tabs as any;

    component.onSqlObjectInfoRequested({
      name: 'orders',
      schema: 'sales',
      context: sourceContext
    });

    expect(connectionContext.createContext).toHaveBeenCalledWith({
      ...sourceContext,
      schema: 'sales'
    }, true);
    expect(tabs.newTab).toHaveBeenCalledWith('table', {
      name: 'orders',
      info: targetContext,
      context: targetContext,
      objectType: 'table'
    }, 'orders');
  });

  it('opens a cross-schema SQL reference in the quick summary without creating a tab', () => {
    const sourceContext = {
      sgbd: 'Hana',
      version: 'v1',
      connectionKey: 'query-tab',
      schema: 'public'
    };
    const targetContext = {
      ...sourceContext,
      connectionKey: 'summary-panel',
      schema: 'sales'
    };
    const connectionContext = (component as any).connectionContext;
    spyOn(connectionContext, 'createContext').and.returnValue(targetContext);
    const tabs = {
      getActiveTab: jasmine.createSpy('getActiveTab'),
      newTab: jasmine.createSpy('newTab')
    };
    component.tabsComponent = tabs as any;

    component.onSqlObjectSummaryRequested({
      name: 'orders',
      schema: 'sales',
      context: sourceContext
    });

    expect(component.sqlObjectSummaryRequest).toEqual({
      name: 'orders',
      schema: 'sales',
      context: targetContext,
      objectType: 'table'
    });
    expect(tabs.newTab).not.toHaveBeenCalled();
  });

  it('replaces the SQL tab used as AI context instead of opening another tab', () => {
    const targetTab = {
      id: 10,
      name: 'Example query',
      type: 'sql',
      info: { sql: 'SELECT column_a FROM table_a' },
      originalContent: 'SELECT column_a FROM table_a',
      icon: 'CODE'
    };
    const tabs = {
      tabs: [targetTab],
      getActiveTab: jasmine.createSpy('getActiveTab').and.returnValue(targetTab),
      newTab: jasmine.createSpy('newTab')
    };
    component.tabsComponent = tabs as any;

    component.onAiSqlRequested({
      sql: 'SELECT column_b FROM table_a',
      mode: 'replace-current',
      targetTab
    });

    expect(targetTab.info.sql).toBe('SELECT column_b FROM table_a');
    expect(targetTab.icon).toBe('CHANGE');
    expect(tabs.newTab).not.toHaveBeenCalled();
  });

  it('keeps whitespace-only edits marked as unsaved changes', () => {
    const targetTab = {
      type: 'sql',
      info: { sql: 'SELECT column_a FROM table_a' },
      originalContent: 'SELECT column_a FROM table_a',
      icon: 'CODE'
    };
    component.tabsComponent = {
      getActiveTab: jasmine.createSpy('getActiveTab').and.returnValue(targetTab)
    } as any;

    component.onSqlContentChange('  SELECT column_a FROM table_a', targetTab);

    expect(targetTab.icon).toBe('CHANGE');
  });
});
