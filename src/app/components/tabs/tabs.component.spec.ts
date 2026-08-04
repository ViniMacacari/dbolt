import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabsComponent } from './tabs.component';
import { GetDbschemaService } from '../../services/db-info/get-dbschema.service';
import { ConnectionContextService } from '../../services/connection-context/connection-context.service';
import { QueryCompareTargetService } from '../../services/query-compare-target/query-compare-target.service';
import { AppLanguageService } from '../../services/language/app-language.service';
import { ApplicationCloseGuardService } from '../../services/application-close/application-close-guard.service';

describe('TabsComponent', () => {
  let component: TabsComponent;
  let fixture: ComponentFixture<TabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsComponent],
      providers: [
        { provide: GetDbschemaService, useValue: { getSelectedSchemaDB: () => null } },
        { provide: ConnectionContextService, useValue: { createContext: (context: any) => context } },
        { provide: QueryCompareTargetService, useValue: {} },
        { provide: AppLanguageService, useValue: { translate: (key: string) => key } },
        {
          provide: ApplicationCloseGuardService,
          useValue: { registerUnsavedSqlQueryCheck: () => () => undefined }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens a single reusable database export tab', () => {
    component.openDatabaseExportTab();
    component.openDatabaseExportTab();

    const exportTabs = component.tabs.filter(tab => tab.type === 'database-export');
    expect(exportTabs.length).toBe(1);
    expect(component.getActiveTab()).toBe(exportTabs[0]);
  });
});
