import { SqlTableReferenceValidationService } from './sql-table-reference-validation.service'

describe('SqlTableReferenceValidationService', () => {
  const context = {
    sgbd: 'SqlServer',
    database: 'app',
    schema: 'dbo',
    connectionKey: 'tab-1'
  }

  function createService(tableNames: string[] = ['users', 'orders']): SqlTableReferenceValidationService {
    const tableSource = {
      getTables: jasmine.createSpy('getTables').and.resolveTo(
        tableNames.map(name => ({ name, type: 'table' as const }))
      )
    }
    const language = {
      translate: (_key: string, params: Record<string, string>) => `Missing table: ${params['table']}`
    }

    return new SqlTableReferenceValidationService(tableSource as any, language as any)
  }

  it('marks a missing table at its exact editor position', async () => {
    const service = createService()
    const sql = 'SELECT *\nFROM missing_table mt\nJOIN orders o ON o.id = mt.id'

    await expectAsync(service.validate(sql, context)).toBeResolvedTo([{
      message: 'Missing table: missing_table',
      startLineNumber: 2,
      startColumn: 6,
      endLineNumber: 2,
      endColumn: 19
    }])
  })

  it('accepts existing tables and views without diagnostics', async () => {
    const service = createService(['users', 'vw_orders'])

    await expectAsync(service.validate(
      'SELECT * FROM users u JOIN vw_orders o ON o.user_id = u.id',
      context
    )).toBeResolvedTo([])
  })

  it('ignores CTEs, temporary tables, table variables and table-valued functions', async () => {
    const service = createService(['orders'])
    const sql = `
      WITH recent AS (SELECT * FROM orders)
      SELECT *
      FROM recent
      JOIN #temporary t ON 1 = 1
      JOIN @tableVariable v ON 1 = 1
      JOIN json_each('{}') j ON 1 = 1
    `

    await expectAsync(service.validate(sql, context)).toBeResolvedTo([])
  })

  it('does not flag objects qualified with a different schema', async () => {
    const service = createService()

    await expectAsync(service.validate(
      'SELECT * FROM audit.external_events',
      context
    )).toBeResolvedTo([])
  })

  it('does not interrupt editing when metadata cannot be loaded', async () => {
    const tableSource = {
      getTables: jasmine.createSpy('getTables').and.rejectWith(new Error('Disconnected'))
    }
    const language = { translate: jasmine.createSpy('translate') }
    const service = new SqlTableReferenceValidationService(tableSource as any, language as any)

    await expectAsync(service.validate('SELECT * FROM missing_table', context)).toBeResolvedTo([])
  })
})
