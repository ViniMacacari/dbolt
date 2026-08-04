import { DatabaseExportService } from './database-export.service'

describe('DatabaseExportService', () => {
  const savedConnection = {
    id: 11,
    name: 'Mock Postgres',
    database: 'Postgres',
    version: 'v9',
    host: 'mock.invalid',
    port: 5432,
    user: 'mock',
    password: 'mock'
  }

  let internalApi: {
    get: jasmine.Spy
    post: jasmine.Spy
    postStream: jasmine.Spy
  }
  let connectionContext: {
    createContext: jasmine.Spy
    ensureContext: jasmine.Spy
    forgetContext: jasmine.Spy
  }
  let service: DatabaseExportService

  beforeEach(() => {
    internalApi = {
      get: jasmine.createSpy().and.resolveTo({
        success: true,
        data: [{ database: 'app', schemas: ['public'] }]
      }),
      post: jasmine.createSpy().and.resolveTo({ success: true }),
      postStream: jasmine.createSpy()
    }
    connectionContext = {
      createContext: jasmine.createSpy().and.callFake((value) => value),
      ensureContext: jasmine.createSpy().and.callFake(async (value) => value),
      forgetContext: jasmine.createSpy()
    }
    service = new DatabaseExportService(internalApi as any, connectionContext as any)
  })

  it('uses a dedicated connection key when databases are explicitly loaded', async () => {
    const state = await service.connectAndLoadTargets(savedConnection)

    expect(state.context.connectionKey).toMatch(/^db-export-/)
    expect(internalApi.get).toHaveBeenCalledWith(jasmine.stringMatching(
      /^\/api\/Postgres\/v9\/list-databases-and-schemas\?connectionKey=db-export-/
    ))
    expect(state.targets).toEqual([{ database: 'app', schemas: ['public'] }])
  })

  it('forgets the frontend context after disconnecting the isolated connection', async () => {
    const context = {
      sgbd: 'Postgres',
      version: 'v9',
      database: 'app',
      schema: 'public',
      connectionKey: 'db-export-mock',
      connId: 11,
      name: 'Mock Postgres'
    }

    await service.disconnect(context)

    expect(internalApi.post).toHaveBeenCalledWith('/api/database-export/disconnect', context)
    expect(connectionContext.forgetContext).toHaveBeenCalledWith('db-export-mock')
  })
})
