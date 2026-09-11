import { RunQueryService } from './run-query.service';

describe('RunQueryService', () => {
  let service: RunQueryService;

  beforeEach(() => {
    service = new RunQueryService({} as any, {} as any, {} as any);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('executes debugger diagnostics through the shared read-only endpoint without changing grid state', async () => {
    const api = {
      postWithSignal: jasmine.createSpy('postWithSignal').and.resolveTo({
        success: true,
        data: { rows: [{ DBOLT_ROWS: 42 }] }
      })
    }
    const context = {
      ensureContext: jasmine.createSpy('ensureContext').and.resolveTo({
        name: 'Local',
        sgbd: 'postgres',
        version: 'v9',
        database: 'app',
        schema: 'public',
        connectionKey: 'tab-1'
      }),
      isConnectionError: () => false
    }
    const isolatedService = new RunQueryService({} as any, api as any, context as any)
    const signal = new AbortController().signal

    const rows = await isolatedService.runReadOnlySQL(
      'SELECT COUNT(*) AS DBOLT_ROWS FROM orders',
      1,
      { sgbd: 'postgres' },
      signal
    )

    expect(rows).toEqual([{ DBOLT_ROWS: 42 }])
    expect(api.postWithSignal).toHaveBeenCalledWith(
      '/api/ai-assistant/readonly/query',
      jasmine.objectContaining({
        sql: 'SELECT COUNT(*) AS DBOLT_ROWS FROM orders',
        maxRows: 1,
        context: jasmine.objectContaining({ connectionKey: 'tab-1', sgbd: 'postgres' })
      }),
      signal
    )
    expect(isolatedService.getQueryLines()).toBeNull()
    expect(isolatedService.getQueryColumns()).toEqual([])
  })

  it('sends the abort signal with the query so a stuck execution can be stopped', async () => {
    const api = {
      postWithSignal: jasmine.createSpy('postWithSignal').and.resolveTo({
        success: true,
        result: [{ id: 1 }],
        columns: ['id'],
        totalRows: 1
      }),
      post: jasmine.createSpy('post')
    }
    const context = {
      ensureContext: jasmine.createSpy('ensureContext').and.resolveTo({
        sgbd: 'postgres',
        version: 'v9',
        connectionKey: 'tab-1'
      }),
      isConnectionError: () => false
    }
    const isolatedService = new RunQueryService({} as any, api as any, context as any)
    const signal = new AbortController().signal

    const rows = await isolatedService.runSQL('SELECT 1', 50, { sgbd: 'postgres' }, signal)

    expect(rows).toEqual([{ id: 1 }])
    expect(api.post).not.toHaveBeenCalled()
    expect(api.postWithSignal).toHaveBeenCalledWith(
      '/api/postgres/v9/query',
      { sql: 'SELECT 1', maxLines: 50, connectionKey: 'tab-1' },
      signal
    )
  })

  it('does not reconnect and retry a query the user aborted', async () => {
    const abortController = new AbortController()
    const api = {
      postWithSignal: jasmine.createSpy('postWithSignal').and.callFake(() => {
        abortController.abort()
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }),
      post: jasmine.createSpy('post')
    }
    const context = {
      ensureContext: jasmine.createSpy('ensureContext').and.resolveTo({
        sgbd: 'postgres',
        version: 'v9',
        connectionKey: 'tab-1'
      }),
      isConnectionError: () => true,
      forgetContext: jasmine.createSpy('forgetContext')
    }
    const isolatedService = new RunQueryService({} as any, api as any, context as any)

    await expectAsync(
      isolatedService.runSQL('SELECT 1', 50, { sgbd: 'postgres' }, abortController.signal)
    ).toBeRejected()

    expect(api.postWithSignal).toHaveBeenCalledTimes(1)
    expect(context.forgetContext).not.toHaveBeenCalled()
  })
});
