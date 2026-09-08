import { SqlSyntaxValidationService } from './sql-syntax-validation.service'

describe('SqlSyntaxValidationService', () => {
  let service: SqlSyntaxValidationService

  beforeEach(() => {
    service = new SqlSyntaxValidationService()
  })

  it('does not report T-SQL parser errors for HANA SQLScript procedures', async () => {
    const sql = `
      CREATE PROCEDURE "process_orders"(run_date nvarchar(4000), order_id int, should_process int, entity_type NVARCHAR(20))
      LANGUAGE SQLSCRIPT AS
      BEGIN
        entity_id int;
        dynamic_sql nvarchar(4000);
      END;
    `

    await expectAsync(service.validate(sql, { sgbd: 'Hana' })).toBeResolvedTo([])
  })

  it('marks the exact reserved alias and explains the error', async () => {
    const sql = `SELECT
  GROUP_CONCAT(u.email SEPARATOR ', ') AS to
FROM users u`
    const diagnostics = await service.validate(sql, { sgbd: 'MySQL' })
    const diagnostic = diagnostics[0]
    const errorLine = sql.split('\n')[1]
    const expectedStartColumn = errorLine.indexOf('to') + 1

    expect(diagnostics.length).toBe(1)
    expect(diagnostic.startLineNumber).toBe(2)
    expect(diagnostic.startColumn).toBe(expectedStartColumn)
    expect(diagnostic.endLineNumber).toBe(2)
    expect(diagnostic.endColumn).toBe(expectedStartColumn + 2)
    expect(diagnostic.code).toBe('reserved-word-alias')
    expect(diagnostic.message).toContain('"to" is a reserved word in MySQL')
    expect(diagnostic.message).toContain('`to`')
  })

  it('accepts a reserved alias when it is quoted for the selected database', async () => {
    const sql = 'SELECT 1 AS `to`'

    await expectAsync(service.validate(sql, { sgbd: 'MySQL' })).toBeResolvedTo([])
  })
})
