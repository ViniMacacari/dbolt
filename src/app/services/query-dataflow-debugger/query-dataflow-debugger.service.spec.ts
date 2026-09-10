import { QueryDataflowUnsupportedError } from './query-dataflow-debugger.model'
import { QueryDataflowDebuggerService } from './query-dataflow-debugger.service'
import { SqlParserService } from '../sql-parser/sql-parser.service'

describe('QueryDataflowDebuggerService', () => {
  const context = { sgbd: 'postgres' }

  it('builds read-only aggregate diagnostics from quoted aliases and each logical stage', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      SELECT PN."CardCode"
      FROM "OCRD" PN
      LEFT JOIN "OSLP" V ON PN."SlpCode" = V."SlpCode"
      INNER JOIN "EndPn" EP ON PN."CardCode" = EP."CardCode"
      WHERE PN."CardType" = 'C' AND PN."validFor" = 'Y'
    `, context)

    expect(plan.joins.length).toBe(2)
    expect(plan.joins[0].joinType).toBe('left')
    expect(plan.joins[1].joinType).toBe('inner')
    expect(plan.joins[0].condition).toBe('"PN"."SlpCode" = "V"."SlpCode"')
    expect(plan.where?.condition).toContain(' AND ')

    const diagnostics = [
      plan.countFrom,
      ...plan.joins.flatMap((join) => [
        join.countAfter,
        join.matchState,
        join.multipleKeyCount,
        join.multipleKeyExamples
      ].filter((query) => query !== undefined)),
      plan.where?.countAfter
    ].filter((query) => query !== undefined)

    diagnostics.forEach((query) => {
      expect(query.sql.trim().toUpperCase().startsWith('SELECT ')).toBeTrue()
      expect(query.sql).not.toContain('PN."CardName"')
    })
  })

  it('calculates cardinality, unmatched rows, fan-out and key examples', async () => {
    const responses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_ROWS: 120 }],
      [{ DBOLT_MATCHED: 90, DBOLT_UNMATCHED: 10 }],
      [{ DBOLT_MULTIPLE_KEYS: 2 }],
      [
        { DBOLT_KEY: 'C019283', DBOLT_MATCH_COUNT: 14 },
        { DBOLT_KEY: 'C028182', DBOLT_MATCH_COUNT: 11 }
      ],
      [{ DBOLT_ROWS: 80 }]
    ]
    const runQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => responses.shift() || [])
    }
    const service = new QueryDataflowDebuggerService(new SqlParserService(), runQuery as any)
    const progress: number[] = []
    const result = await service.analyze(`
      SELECT PN."CardCode"
      FROM "OCRD" PN
      LEFT JOIN "EndPn" EP ON PN."CardCode" = EP."CardCode"
      WHERE PN."validFor" = 'Y'
    `, context, undefined, (value) => progress.push(value.completed))

    const join = result.stages[1]
    const where = result.stages[2]
    expect(join.rowsBefore).toBe(100)
    expect(join.rowsAfter).toBe(120)
    expect(join.matched).toBe(90)
    expect(join.unmatched).toBe(10)
    expect(join.fanOut).toBe(1.2)
    expect(join.multipleKeyCount).toBe(2)
    expect(join.multipleKeyExamples?.[0]).toEqual({ key: 'C019283', matches: 14 })
    expect(join.findings).toContain('cardinality-increase')
    expect(join.findings).toContain('possible-one-to-many')
    expect(where.rowsAfter).toBe(80)
    expect(where.findings).toContain('rows-removed')
    expect(progress.at(-1)).toBe(6)
    expect(runQuery.runReadOnlySQL).toHaveBeenCalledTimes(6)
  })

  it('rejects unsupported SQL explicitly instead of approximating it', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const cases = [
      { sql: 'WITH base AS (SELECT * FROM OCRD) SELECT * FROM base', reason: 'cte' },
      { sql: 'SELECT CardType, COUNT(*) FROM OCRD GROUP BY CardType', reason: 'groupBy' },
      { sql: `SELECT * FROM OCRD WHERE CardType = 'C' OR validFor = 'Y'`, reason: 'where' },
      { sql: 'UPDATE OCRD SET validFor = 0', reason: 'selectOnly' }
    ]

    for (const item of cases) {
      try {
        await service.createPlan(item.sql, context)
        fail(`Expected ${item.reason} to be rejected`)
      } catch (error: unknown) {
        expect(error instanceof QueryDataflowUnsupportedError).toBeTrue()
        expect((error as QueryDataflowUnsupportedError).reason).toBe(item.reason)
      }
    }
  })

  it('keeps HANA identifiers double quoted in generated diagnostics', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(
      'SELECT PN."CardCode" FROM "OCRD" PN LEFT JOIN "OSLP" V ON PN."SlpCode" = V."SlpCode"',
      { sgbd: 'hana' }
    )

    expect(plan.countFrom.sql).toContain('FROM "OCRD" AS "PN"')
    expect(plan.countFrom.sql).not.toContain('[OCRD]')
  })

  it('serializes diagnostics with the selected database dialect', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const cases = [
      { sgbd: 'mysql', expected: 'FROM `orders` AS `o`' },
      { sgbd: 'sqlite', expected: 'FROM "orders" AS "o"' },
      { sgbd: 'sqlserver', expected: 'FROM [orders] AS [o]' }
    ]

    for (const item of cases) {
      const plan = await service.createPlan(
        'SELECT o.id FROM orders o LEFT JOIN items i ON o.id = i.order_id',
        { sgbd: item.sgbd }
      )
      expect(plan.countFrom.sql).toContain(item.expected)
      expect(plan.joins[0].countAfter.sql.trim().toUpperCase().startsWith('SELECT ')).toBeTrue()
    }
  })
})
