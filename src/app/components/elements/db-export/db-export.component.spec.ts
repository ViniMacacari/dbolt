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
  let component: DbExportComponent

  beforeEach(() => {
    connectionsService = {
      loadConnections: jasmine.createSpy().and.resolveTo([savedConnection])
    }
    databaseExport = {
      connectAndLoadTargets: jasmine.createSpy(),
      disconnect: jasmine.createSpy().and.resolveTo(undefined)
    }
    const language = {
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
