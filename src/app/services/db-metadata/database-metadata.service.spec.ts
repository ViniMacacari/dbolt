import { TestBed } from '@angular/core/testing';

import { DatabaseMetadataService } from './database-metadata.service';
import { InternalApiService } from '../requests/internal-api.service';
import { ConnectionContextService } from '../connection-context/connection-context.service';

describe('DatabaseMetadataService', () => {
  let service: DatabaseMetadataService;
  let responses: Map<string, any>;
  let requestedUrls: string[];
  let ensureCalls: any[];

  const context = {
    sgbd: 'Postgres',
    version: 'v9',
    connectionKey: 'tab-1',
    database: 'app',
    schema: 'public'
  };

  const internalApiStub = {
    get: (url: string) => {
      requestedUrls.push(url);
      const response = responses.get(url);

      return typeof response === 'function'
        ? response()
        : Promise.resolve(response);
    }
  };

  const connectionContextStub = {
    ensureContext: (schemaDb: any, forceReconnect = false) => {
      ensureCalls.push({ schemaDb, forceReconnect });
      return Promise.resolve(schemaDb);
    },
    forgetContext: () => undefined,
    isConnectionError: (error: any) =>
      [error?.message, error?.error]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes('not connected'),
    toQueryString: (schemaDb: any) => `?connectionKey=${schemaDb.connectionKey}`
  };

  beforeEach(() => {
    responses = new Map<string, any>();
    requestedUrls = [];
    ensureCalls = [];

    TestBed.configureTestingModule({
      providers: [
        DatabaseMetadataService,
        { provide: InternalApiService, useValue: internalApiStub },
        { provide: ConnectionContextService, useValue: connectionContextStub }
      ]
    });
    service = TestBed.inject(DatabaseMetadataService);
  });

  function setTableResponses(ddl: string): void {
    responses.set('/api/Postgres/v9/table-columns/users?connectionKey=tab-1', { success: true, data: [{ name: 'id' }] });
    responses.set('/api/Postgres/v9/table-keys/users?connectionKey=tab-1', { success: true, data: [] });
    responses.set('/api/Postgres/v9/table-indexes/users?connectionKey=tab-1', { success: true, data: [] });
    responses.set('/api/Postgres/v9/table-ddl/users?connectionKey=tab-1', { success: true, ddl });
  }

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('returns table metadata without retrying when the DDL is available', async () => {
    setTableResponses('CREATE TABLE users ();');

    const metadata = await service.loadTableMetadata(context, 'users');

    expect(metadata.ddl).toBe('CREATE TABLE users ();');
    expect(metadata.columns.length).toBe(1);
    expect(ensureCalls.length).toBe(1);
    expect(requestedUrls.filter((url) => url.includes('table-ddl')).length).toBe(1);
  });

  it('reconnects and retries when the DDL keeps coming back empty', async () => {
    setTableResponses('');

    const metadata = await service.loadTableMetadata(context, 'users');

    expect(metadata.ddl).toBe('');
    expect(requestedUrls.filter((url) => url.includes('table-ddl')).length).toBe(3);
    expect(ensureCalls.some((call) => call.forceReconnect)).toBeTrue();
  });

  it('recovers the DDL on the retry that follows a lost connection', async () => {
    setTableResponses('CREATE TABLE users ();');
    let ddlAttempts = 0;
    responses.set('/api/Postgres/v9/table-ddl/users?connectionKey=tab-1', () => {
      ddlAttempts += 1;
      return ddlAttempts === 1
        ? Promise.reject({ success: false, message: 'Error', error: 'Not connected to PostgreSQL.' })
        : Promise.resolve({ success: true, ddl: 'CREATE TABLE users ();' });
    });

    const metadata = await service.loadTableMetadata(context, 'users');

    expect(metadata.ddl).toBe('CREATE TABLE users ();');
    expect(ddlAttempts).toBe(2);
    expect(ensureCalls.some((call) => call.forceReconnect)).toBeTrue();
  });

  it('propagates failures that are not connection related', async () => {
    setTableResponses('');
    responses.set('/api/Postgres/v9/table-columns/users?connectionKey=tab-1', {
      success: false,
      message: 'Error occurred while listing table columns.',
      error: 'relation "users" does not exist'
    });

    await expectAsync(service.loadTableMetadata(context, 'users'))
      .toBeRejectedWithError('relation "users" does not exist');
  });

  it('serializes metadata requests that share a connection key', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const trackedResponse = () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve({ success: true, ddl: 'CREATE TABLE users ();', data: [] });
        }, 5);
      });
    };

    responses.set('/api/Postgres/v9/table-columns/users?connectionKey=tab-1', trackedResponse);
    responses.set('/api/Postgres/v9/table-keys/users?connectionKey=tab-1', trackedResponse);
    responses.set('/api/Postgres/v9/table-indexes/users?connectionKey=tab-1', trackedResponse);
    responses.set('/api/Postgres/v9/table-ddl/users?connectionKey=tab-1', trackedResponse);
    responses.set('/api/Postgres/v9/procedure-ddl/sync_users?connectionKey=tab-1', trackedResponse);

    await Promise.all([
      service.loadTableMetadata(context, 'users'),
      service.loadProcedureDDL(context, 'sync_users')
    ]);

    expect(maxInFlight).toBe(1);
  });

  it('loads the procedure DDL through the ensured context', async () => {
    responses.set('/api/Postgres/v9/procedure-ddl/sync_users?connectionKey=tab-1', {
      success: true,
      ddl: 'CREATE PROCEDURE sync_users()'
    });

    const ddl = await service.loadProcedureDDL(context, 'sync_users');

    expect(ddl).toBe('CREATE PROCEDURE sync_users()');
    expect(ensureCalls.length).toBe(1);
  });
});
