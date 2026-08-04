import { AiDatabaseContextService } from './ai-database-context.service'

describe('AiDatabaseContextService', () => {
  const service = new AiDatabaseContextService()

  it('prioritizes the connected selected context over stale schema metadata', () => {
    const result = service.buildReadonlyToolContext(
      {
        connectionKey: 'current-key',
        sgbd: 'mysql',
        version: 'v5',
        database: 'sales'
      },
      {
        connection: {
          connectionKey: 'stale-key',
          sgbd: 'mysql',
          version: 'v5',
          database: 'sales'
        }
      }
    )

    expect(result.connectionKey).toBe('current-key')
  })

  it('recovers the runtime connection identity from the active tab', () => {
    const result = service.buildRuntimeConnectionContext(
      { database: 'sales', schema: 'public' },
      {},
      {
        dbInfo: {
          connectionKey: 'tab-key',
          connId: 12,
          sgbd: 'postgres',
          version: 'v9'
        }
      }
    )

    expect(result).toEqual(jasmine.objectContaining({
      connectionKey: 'tab-key',
      connId: 12,
      sgbd: 'postgres',
      version: 'v9',
      database: 'sales',
      schema: 'public'
    }))
  })
})
