import { ColumnAutocompleteSourceService } from './column-autocomplete-source.service'

describe('ColumnAutocompleteSourceService', () => {
  it('should request columns from the schema preserved in a qualified table reference', async () => {
    const api = {
      get: jasmine.createSpy('get').and.resolveTo({
        success: true,
        data: [{ name: 'order_id', type: 'integer' }]
      })
    }
    const context = {
      sgbd: 'postgres',
      version: 'v9',
      connectionKey: 'tab-1',
      schema: 'public'
    }
    const connectionContext = {
      ensureContext: jasmine.createSpy('ensureContext').and.resolveTo(context),
      toQueryString: jasmine.createSpy('toQueryString').and.callFake((_value: any, additional: any) =>
        `?connectionKey=tab-1&schema=${encodeURIComponent(additional.schema)}`
      ),
      forgetContext: jasmine.createSpy('forgetContext'),
      isConnectionError: jasmine.createSpy('isConnectionError').and.returnValue(false)
    }
    const service = new ColumnAutocompleteSourceService(api as any, connectionContext as any)

    await expectAsync(service.getColumns(context, 'sales.orders')).toBeResolvedTo([
      { name: 'order_id', type: 'integer' }
    ])

    expect(connectionContext.toQueryString).toHaveBeenCalledWith(context, { schema: 'sales' })
    expect(api.get).toHaveBeenCalledWith(
      '/api/postgres/v9/table-columns/orders?connectionKey=tab-1&schema=sales'
    )
  })
})
