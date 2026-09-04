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
});
