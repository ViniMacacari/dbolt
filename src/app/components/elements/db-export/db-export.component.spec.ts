import { TestBed } from '@angular/core/testing'

import { AppLanguageService } from '../../../services/language/app-language.service'
import { ConnectionsService } from '../../../services/resolve-connections/connections.service'
import { DatabaseExportService } from '../../../services/database-export/database-export.service'
import { DbExportComponent } from './db-export.component'

describe('DbExportComponent', () => {
  const savedConnection = {
    id: 7,
    name: 'Mock connection',
    database: 'MySQL',
    version: 'v5',
    host: 'mock.invalid',
    port: 3306,
    user: 'mock',
    password: 'mock'
  }

  let connectionsService: { loadConnections: jasmine.Spy }
  let databaseExport: {
    connectAndLoadTargets: jasmine.Spy
    disconnect: jasmine.Spy
  }
  let language: {
    translate: (key: string) => string
    getCurrentLanguage: () => string
  }
  let component: DbExportComponent

  beforeEach(() => {
    connectionsService = {
      loadConnections: jasmine.createSpy().and.resolveTo([savedConnection])
    }
    databaseExport = {
      connectAndLoadTargets: jasmine.createSpy(),
      disconnect: jasmine.createSpy().and.resolveTo(undefined)
    }
    language = {
      translate: (key: string) => key,
      getCurrentLanguage: () => 'pt-BR'
    }

    component = new DbExportComponent(
      connectionsService as any,
      databaseExport as any,
      language as any
    )
  })

  it('loads saved connection metadata without connecting to a database', async () => {
    await component.ngOnInit()

    expect(connectionsService.loadConnections).toHaveBeenCalled()
    expect(component.connections).toEqual([savedConnection])
    expect(databaseExport.connectAndLoadTargets).not.toHaveBeenCalled()
  })

  it('requires a table when only table data is selected', () => {
    component.context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    component.objects = [{ name: 'customers_view', type: 'view' }]
    component.selectedObjectKeys.add('view::customers_view')
    component.includeStructure = false
    component.includeData = true

    expect(component.canEstimate).toBeFalse()
  })

  it('blocks a large export until the warning is acknowledged', () => {
    component.context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    component.objects = [{ name: 'events', type: 'table' }]
    component.selectedObjectKeys.add('table::events')
    component.includeData = true
    component.outputPath = 'C:\\mock\\events.sql'
    component.estimate = {
      risk: 'extreme',
      acknowledgementRequired: true,
      estimatedRows: 75_000_000,
      estimatedBytes: 80 * (1024 ** 3),
      unknownTableCount: 0,
      selectedObjectCount: 1,
      selectedTableCount: 1,
      tables: [],
      warnings: ['extreme', 'database-load', 'hours-or-days']
    }

    expect(component.canStartExport).toBeFalse()
    component.acknowledgedLargeExport = true
    expect(component.canStartExport).toBeTrue()
  })

  it('advances through the wizard only after each step is complete', () => {
    expect(component.currentStep).toBe(1)
    expect(component.canOpenStep(2)).toBeFalse()

    component.context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    component.nextStep()
    expect(component.currentStep).toBe(2)

    component.objects = [{ name: 'customers', type: 'table' }]
    component.selectedObjectKeys.add('table::customers')
    component.nextStep()
    expect(component.currentStep).toBe(3)
    expect(component.canOpenStep(4)).toBeFalse()

    component.estimate = {
      risk: 'low',
      acknowledgementRequired: false,
      estimatedRows: 10,
      estimatedBytes: 1024,
      unknownTableCount: 0,
      selectedObjectCount: 1,
      selectedTableCount: 1,
      tables: [],
      warnings: []
    }
    component.nextStep()
    expect(component.currentStep).toBe(4)
  })

  it('keeps the destination step locked until a large-export warning is acknowledged', () => {
    component.context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    component.objects = [{ name: 'events', type: 'table' }]
    component.selectedObjectKeys.add('table::events')
    component.currentStep = 3
    component.estimate = {
      risk: 'extreme',
      acknowledgementRequired: true,
      estimatedRows: 75_000_000,
      estimatedBytes: 80 * (1024 ** 3),
      unknownTableCount: 0,
      selectedObjectCount: 1,
      selectedTableCount: 1,
      tables: [],
      warnings: ['extreme']
    }

    component.nextStep()
    expect(component.currentStep).toBe(3)

    component.acknowledgedLargeExport = true
    component.nextStep()
    expect(Number(component.currentStep)).toBe(4)
  })

  it('renders every loaded object name in the object-selection step', () => {
    TestBed.configureTestingModule({
      imports: [DbExportComponent],
      providers: [
        { provide: ConnectionsService, useValue: connectionsService },
        { provide: DatabaseExportService, useValue: databaseExport },
        { provide: AppLanguageService, useValue: language }
      ]
    })
    const fixture = TestBed.createComponent(DbExportComponent)
    const renderedComponent = fixture.componentInstance
    renderedComponent.currentStep = 2
    renderedComponent.context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    renderedComponent.objects = [
      { name: 'customers', type: 'table' },
      { name: 'orders', type: 'table' }
    ]
    renderedComponent.updateObjectSearch('')

    fixture.detectChanges()

    const rows = Array.from(fixture.nativeElement.querySelectorAll('.object-row')) as HTMLElement[]
    const typeSummary = fixture.nativeElement.querySelector('.object-kind-summary') as HTMLElement
    expect(rows.length).toBe(2)
    expect(rows.map((row) => row.textContent).join(' ')).toContain('customers')
    expect(rows.map((row) => row.textContent).join(' ')).toContain('orders')
    expect(typeSummary.textContent).toContain('dbExport.objects.routines')
    expect(typeSummary.textContent).toContain('dbExport.objects.automation')
  })

  it('uses compact shared checkboxes for export content options', () => {
    TestBed.configureTestingModule({
      imports: [DbExportComponent],
      providers: [
        { provide: ConnectionsService, useValue: connectionsService },
        { provide: DatabaseExportService, useValue: databaseExport },
        { provide: AppLanguageService, useValue: language }
      ]
    })
    const fixture = TestBed.createComponent(DbExportComponent)
    fixture.componentInstance.currentStep = 3
    fixture.detectChanges()

    const sharedCheckboxes = fixture.nativeElement.querySelectorAll('app-checkbox.box-variant-host')
    const switches = fixture.nativeElement.querySelectorAll('app-checkbox:not(.box-variant-host)')
    expect(sharedCheckboxes.length).toBe(3)
    expect(switches.length).toBe(0)
  })

  it('closes the isolated export connection when destroyed', async () => {
    const context = {
      sgbd: 'MySQL',
      version: 'v5',
      connectionKey: 'db-export-mock',
      connId: 7,
      name: 'Mock connection'
    }
    component.connectionState = {
      connection: savedConnection,
      context,
      targets: []
    }

    component.ngOnDestroy()
    await Promise.resolve()

    expect(databaseExport.disconnect).toHaveBeenCalledWith(context)
  })
})
