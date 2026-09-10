import { TestBed } from '@angular/core/testing';

import { RunQueryService } from './run-query.service';

describe('RunQueryService', () => {
  let service: RunQueryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RunQueryService);
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
});
