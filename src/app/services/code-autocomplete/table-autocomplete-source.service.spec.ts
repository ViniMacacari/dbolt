import { TableAutocompleteSourceService } from './table-autocomplete-source.service'

describe('TableAutocompleteSourceService', () => {
  const context = {
    sgbd: 'SqlServer',
    version: 'v2008',
    connId: 1,
    name: 'Local',
    host: 'localhost',
    port: 1433,
    database: 'app',
    schema: 'dbo',
    connectionKey: 'tab-1'
  }

  function createService(response: any): {
    service: TableAutocompleteSourceService,
    api: { get: jasmine.Spy },
    connectionContext: {
      ensureContext: jasmine.Spy,
      toQueryString: jasmine.Spy,
      forgetContext: jasmine.Spy,
      isConnectionError: jasmine.Spy
    }
  } {
    const api = {
      get: jasmine.createSpy('get')
    }

    if (Array.isArray(response)) {
      api.get.and.returnValues(...response.map((item) => Promise.resolve(item)))
    } else {
      api.get.and.resolveTo(response)
    }

    const connectionContext = {
      ensureContext: jasmine.createSpy('ensureContext').and.callFake((value: any) => Promise.resolve(value)),
      toQueryString: jasmine.createSpy('toQueryString').and.callFake((value: any) => `?connectionKey=${value.connectionKey}`),
      forgetContext: jasmine.createSpy('forgetContext'),
      isConnectionError: jasmine.createSpy('isConnectionError').and.callFake((error: any) =>
        String(error?.message || error?.error || '').toLowerCase().includes('no active connection')
      )
    }

    return {
      service: new TableAutocompleteSourceService(api as any, connectionContext as any),
      api,
      connectionContext
    }
  }

  it('should include tables and views in autocomplete objects', async () => {
    const { service } = createService({
      success: true,
      tables: [{ name: 'orders' }],
      views: [{ name: 'vw_orders' }]
    })

    await expectAsync(service.getTables(context)).toBeResolvedTo([
      { name: 'orders', type: 'table' },
      { name: 'vw_orders', type: 'view' }
    ])
  })

  it('should reconnect once when table metadata uses a stale connection', async () => {
    const { service, api, connectionContext } = createService([
      {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      },
      {
        success: true,
        data: [{ name: 'customers', type: 'table' }]
      }
    ])

    await expectAsync(service.getTables(context)).toBeResolvedTo([
      { name: 'customers', type: 'table' }
    ])
    expect(connectionContext.forgetContext).toHaveBeenCalledOnceWith('tab-1')
    expect(connectionContext.ensureContext).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
