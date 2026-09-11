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
    expect(join.fanOut).toBeCloseTo(110 / 90, 8)
    expect(join.multipleKeyCount).toBe(2)
    expect(join.multipleKeyExamples?.[0]).toEqual({ key: 'C019283', matches: 14 })
    expect(join.findings).toContain('cardinality-increase')
    expect(join.findings).toContain('possible-one-to-many')
    expect(where.rowsAfter).toBe(80)
    expect(where.findings).toContain('rows-removed')
    expect(progress.at(-1)).toBe(6)
    expect(runQuery.runReadOnlySQL).toHaveBeenCalledTimes(6)
  })

  it('does not classify unmatched LEFT JOIN rows as one-to-many without fan-out', async () => {
    const responses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_MATCHED: 75, DBOLT_UNMATCHED: 25 }],
      [{ DBOLT_MULTIPLE_KEYS: 0 }],
      []
    ]
    const runQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => responses.shift() || [])
    }
    const service = new QueryDataflowDebuggerService(new SqlParserService(), runQuery as any)
    const result = await service.analyze(`
      SELECT PN."CardCode"
      FROM "OCRD" PN
      LEFT JOIN "OSLP" V ON PN."SlpCode" = V."SlpCode"
    `, context)

    const join = result.stages[1]
    expect(join.fanOut).toBe(1)
    expect(join.findings).toContain('many-unmatched')
    expect(join.findings).not.toContain('possible-one-to-many')
  })

  it('calculates INNER JOIN fan-out from matched input rows rather than retention', async () => {
    const responses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 367_720 }],
      [{ DBOLT_ROWS: 103_724 }],
      [{ DBOLT_MATCHED: 103_724, DBOLT_UNMATCHED: 263_996 }],
      [{ DBOLT_MULTIPLE_KEYS: 0 }],
      []
    ]
    const runQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => responses.shift() || [])
    }
    const service = new QueryDataflowDebuggerService(new SqlParserService(), runQuery as any)
    const result = await service.analyze(`
      SELECT PN."CardCode"
      FROM "OCRD" PN
      INNER JOIN "OSLP" V ON PN."SlpCode" = V."SlpCode"
    `, context)

    const join = result.stages[1]
    expect(join.rowsAfter / (join.rowsBefore || 1)).toBeCloseTo(.28, 2)
    expect(join.fanOut).toBe(1)
    expect(join.findings).toContain('rows-removed')
    expect(join.findings).not.toContain('possible-one-to-many')
  })

  it('plans simple, chained and joined CTEs as independent scoped blocks', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      WITH A AS (
        SELECT C."CardCode" FROM "OCRD" C WHERE C."CardType" = 'C'
      ),
      B AS (
        SELECT A."CardCode" FROM A
      ),
      vendas AS (
        SELECT I."CardCode", SUM(I."DocTotal") total
        FROM "OINV" I GROUP BY I."CardCode"
      )
      SELECT B."CardCode"
      FROM B
      LEFT JOIN vendas V ON B."CardCode" = V."CardCode"
    `, context)

    expect(plan.ctes.map((cte) => cte.label)).toEqual(['A', 'B', 'vendas'])
    expect(plan.ctes[0].linear?.where).toBeDefined()
    expect(plan.ctes[1].dependencies).toEqual(['A'])
    expect(plan.ctes[0].consumedBy).toEqual(['B'])
    expect(plan.ctes[2].linear?.group?.kind).toBe('group')
    expect(plan.root.dependencies).toEqual(['B', 'vendas'])
    expect(plan.root.linear?.joins[0].joinType).toBe('left')
    expect(plan.ctes[1].consumedBy).toEqual(['MAIN QUERY'])
  })

  it('plans derived tables in FROM and JOIN as child inputs', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const fromPlan = await service.createPlan(`
      SELECT V."CardCode" FROM (
        SELECT I."CardCode", SUM(I."DocTotal") total
        FROM "OINV" I GROUP BY I."CardCode"
      ) V
    `, context)
    const joinPlan = await service.createPlan(`
      SELECT C."CardCode" FROM "OCRD" C
      JOIN (SELECT I."CardCode" FROM "OINV" I) V
        ON C."CardCode" = V."CardCode"
    `, context)

    expect(fromPlan.root.linear?.sourceBlock?.alias).toBe('V')
    expect(fromPlan.root.linear?.sourceBlock?.linear?.group?.kind).toBe('group')
    expect(joinPlan.root.linear?.joins[0].inputBlock?.alias).toBe('V')
    expect(joinPlan.root.linear?.joins[0].inputBlock?.linear?.source).toContain('OINV')
  })

  it('plans IN, EXISTS, NOT EXISTS and scalar subqueries with scope-aware correlation', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const inPlan = await service.createPlan(`
      SELECT * FROM "OCRD" C WHERE C."CardCode" IN (
        SELECT I."CardCode" FROM "OINV" I WHERE I."DocDate" >= '2026-01-01'
      )
    `, context)
    const existsPlan = await service.createPlan(`
      SELECT * FROM "OCRD" C WHERE EXISTS (
        SELECT 1 FROM "OINV" I WHERE I."CardCode" = C."CardCode"
      )
    `, context)
    const notExistsPlan = await service.createPlan(`
      SELECT * FROM "OCRD" C WHERE NOT EXISTS (
        SELECT 1 FROM "OINV" I WHERE I."CardCode" = C."CardCode"
      )
    `, context)
    const scalarPlan = await service.createPlan(`
      SELECT C."CardCode", (SELECT MAX(I."DocDate") FROM "OINV" I) latest
      FROM "OCRD" C
    `, context)
    const correlatedPlan = await service.createPlan(`
      SELECT C."CardCode", (
        SELECT MAX(I."DocDate") FROM "OINV" I WHERE I."CardCode" = C."CardCode"
      ) latest FROM "OCRD" C
    `, context)

    expect(inPlan.root.linear?.where?.subqueries[0].distinctCount).toBeDefined()
    expect(inPlan.root.linear?.where?.subqueries[0].block.correlation).toBeUndefined()
    expect(existsPlan.root.linear?.where?.existsOperator).toBe('EXISTS')
    expect(existsPlan.root.linear?.where?.subqueries[0].block.correlation?.conditions[0]).toContain('"I"."CardCode" = "C"."CardCode"')
    expect(notExistsPlan.root.linear?.where?.existsOperator).toBe('NOT EXISTS')
    expect(scalarPlan.root.linear?.projections[0].block.linear?.group?.kind).toBe('aggregation')
    expect(correlatedPlan.root.linear?.projections[0].block.correlation?.detailedAnalysisAvailable).toBeFalse()
  })

  it('keeps repeated aliases isolated in nested scopes', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      SELECT C."id", (SELECT MAX(C."value") FROM "inner_table" C) value
      FROM "outer_table" C
    `, context)

    expect(plan.root.linear?.projections[0].block.correlation).toBeUndefined()
    expect(plan.root.linear?.projections[0].block.linear).toBeDefined()
  })

  it('preserves UNION, UNION ALL and mixed three-branch order', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const unionPlan = await service.createPlan('SELECT id FROM A UNION SELECT id FROM B', context)
    const allPlan = await service.createPlan('SELECT id FROM A UNION ALL SELECT id FROM B', context)
    const mixedPlan = await service.createPlan(`
      SELECT id FROM A
      UNION SELECT id FROM B
      UNION ALL SELECT id FROM C
    `, context)

    expect(unionPlan.root.union?.operations.map((item) => item.operator)).toEqual(['union'])
    expect(unionPlan.root.union?.operations[0].countAfter).toBeDefined()
    expect(allPlan.root.union?.operations.map((item) => item.operator)).toEqual(['union-all'])
    expect(allPlan.root.union?.operations[0].countAfter).toBeUndefined()
    expect(mixedPlan.root.union?.branches.length).toBe(3)
    expect(mixedPlan.root.union?.operations.map((item) => item.operator)).toEqual(['union', 'union-all'])
  })

  it('supports UNION inside a CTE and a CTE containing a derived subquery', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      WITH combined AS (
        SELECT "CardCode" FROM "OCRD"
        UNION ALL
        SELECT "CardCode" FROM "LEADS"
      ), wrapped AS (
        SELECT X."CardCode" FROM (SELECT C."CardCode" FROM combined C) X
      )
      SELECT * FROM wrapped
    `, context)
    expect(plan.ctes[0].union?.branches.length).toBe(2)
    expect(plan.ctes[1].linear?.sourceBlock).toBeDefined()
    expect(plan.ctes[1].dependencies).toEqual([])
    expect(plan.ctes[1].linear?.sourceBlock?.dependencies).toEqual(['combined'])
  })

  it('executes CTE and derived-table metrics as bounded aggregate blocks', async () => {
    const responses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_ROWS: 80 }],
      [{ DBOLT_ROWS: 80 }]
    ]
    const runQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => responses.shift() || [])
    }
    const service = new QueryDataflowDebuggerService(new SqlParserService(), runQuery as any)
    const result = await service.analyze(`
      WITH clientes AS (
        SELECT * FROM "OCRD" WHERE "CardType" = 'C'
      )
      SELECT * FROM clientes
    `, context)

    expect(result.ctes[0].stages.map((stage) => stage.kind)).toEqual(['from', 'where'])
    expect(result.ctes[0].outputRows).toBe(80)
    expect(result.root.outputRows).toBe(80)
    expect(runQuery.runReadOnlySQL).toHaveBeenCalledTimes(3)
    runQuery.runReadOnlySQL.calls.allArgs().forEach(([sql, maxRows]) => {
      expect(sql.trim().toUpperCase().startsWith('SELECT ')).toBeTrue()
      expect(maxRows).toBe(1)
    })
  })

  it('adds semantically distinct IN output and safe EXISTS outer metrics', async () => {
    const inResponses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_ROWS: 12 }],
      [{ DBOLT_ROWS: 80 }],
      [{ DBOLT_ROWS: 30 }],
      [{ DBOLT_ROWS: 20 }]
    ]
    const inRunQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => inResponses.shift() || [])
    }
    const inService = new QueryDataflowDebuggerService(new SqlParserService(), inRunQuery as any)
    const inResult = await inService.analyze(`
      SELECT * FROM "OCRD" C WHERE C."CardCode" IN (
        SELECT I."CardCode" FROM "OINV" I WHERE I."DocDate" >= '2026-01-01'
      )
    `, context)
    const inBlock = inResult.root.stages[1].inputs?.[0]
    expect(inBlock?.stages.map((stage) => stage.kind)).toEqual(['from', 'where', 'distinct'])
    expect(inBlock?.outputRows).toBe(20)

    const existsResponses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 100 }],
      [{ DBOLT_ROWS: 12 }]
    ]
    const existsRunQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => existsResponses.shift() || [])
    }
    const existsService = new QueryDataflowDebuggerService(new SqlParserService(), existsRunQuery as any)
    const existsResult = await existsService.analyze(`
      SELECT * FROM "OCRD" C WHERE EXISTS (
        SELECT 1 FROM "OINV" I WHERE I."CardCode" = C."CardCode"
      )
    `, context)
    const where = existsResult.root.stages[1]
    expect(where.matched).toBe(12)
    expect(where.unmatched).toBe(88)
    expect(where.inputs?.[0].correlation?.outerRows).toBe(100)
    expect(existsRunQuery.runReadOnlySQL).toHaveBeenCalledTimes(2)
  })

  it('measures UNION deduplication and sums UNION ALL branches exactly', async () => {
    const unionResponses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 80 }],
      [{ DBOLT_ROWS: 30 }],
      [{ DBOLT_ROWS: 95 }]
    ]
    const unionRunQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => unionResponses.shift() || [])
    }
    const unionService = new QueryDataflowDebuggerService(new SqlParserService(), unionRunQuery as any)
    const unionResult = await unionService.analyze(
      'SELECT id FROM A UNION SELECT id FROM B',
      context
    )
    expect(unionResult.root.unionSteps?.[0]).toEqual(jasmine.objectContaining({
      operator: 'union',
      rowsBeforeDistinct: 110,
      rowsAfter: 95,
      duplicatesRemoved: 15
    }))

    const allResponses: Array<Array<Record<string, unknown>>> = [
      [{ DBOLT_ROWS: 80 }],
      [{ DBOLT_ROWS: 30 }]
    ]
    const allRunQuery = {
      runReadOnlySQL: jasmine.createSpy('runReadOnlySQL').and.callFake(async () => allResponses.shift() || [])
    }
    const allService = new QueryDataflowDebuggerService(new SqlParserService(), allRunQuery as any)
    const allResult = await allService.analyze(
      'SELECT id FROM A UNION ALL SELECT id FROM B',
      context
    )
    expect(allResult.root.unionSteps?.[0].rowsAfter).toBe(110)
    expect(allResult.root.unionSteps?.[0].duplicatesRemoved).toBe(0)
    expect(allRunQuery.runReadOnlySQL).toHaveBeenCalledTimes(2)
  })

  it('marks unsupported blocks and rejects recursive CTEs and writes without fabricating metrics', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const unsupported = await service.createPlan(
      `SELECT * FROM OCRD WHERE CardType = 'C' OR validFor = 'Y'`,
      context
    )
    expect(unsupported.root.unsupportedReason).toBe('where')

    const rejected = [
      { sql: 'WITH RECURSIVE n AS (SELECT id FROM nodes UNION ALL SELECT n.id FROM n) SELECT * FROM n', reason: 'recursiveCte' },
      { sql: 'UPDATE OCRD SET validFor = 0', reason: 'selectOnly' }
    ]
    for (const item of rejected) {
      await expectAsync(service.createPlan(item.sql, context)).toBeRejectedWithError(
        QueryDataflowUnsupportedError,
        item.reason
      )
    }
  })

  it('supports HANA JOIN filters, scalar fallbacks and negated filter groups', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      WITH "Info" AS (
        SELECT MAX(D."Code") AS "Code", J."Id"
        FROM "Documents" D
        INNER JOIN "Journal" J
          ON J."SourceId" = D."Id" AND J."SourceType" = 13
        GROUP BY J."Id"
      )
      SELECT J."Id"
      FROM "Journal" J
      LEFT JOIN "Lines" L ON J."Id" = L."Id"
      LEFT JOIN "Users" U ON U."Code" = IFNULL(L."UserCode", J."UserCode")
      LEFT JOIN "Info" I ON I."Id" = J."Id"
      WHERE J."Type" IN (13, 14)
        AND NOT (
          COALESCE(L."Usage", J."Usage") IN (33, 53)
          AND J."TaxDate" >= '2026-01-01'
          AND COALESCE(L."Account", J."Account") = '4.6.1.03.05.01'
        )
    `, { sgbd: 'hana' })

    expect(plan.ctes[0].unsupportedReason).toBeUndefined()
    expect(plan.ctes[0].linear?.joins[0].condition).toContain('"J"."SourceType" = 13')
    expect(plan.root.unsupportedReason).toBeUndefined()
    expect(plan.root.linear?.joins[1].condition).toContain('IFNULL')
    expect(plan.root.linear?.where).toBeDefined()
  })

  it('keeps large JOIN flows analyzable by bounding optional key-detail probes', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const joins = Array.from({ length: 20 }, (_, index) => `
      LEFT JOIN "Detail${index}" D${index} ON B."Id" = D${index}."BaseId"
    `).join('')
    const plan = await service.createPlan(`SELECT B."Id" FROM "Base" B ${joins}`, { sgbd: 'hana' })

    expect(plan.root.unsupportedReason).toBeUndefined()
    expect(plan.root.linear?.joins.length).toBe(20)
    expect(plan.root.linear?.joins.filter((join) => join.multipleKeyCount).length).toBe(8)
    expect(plan.root.linear?.joins.slice(8).every((join) => !join.multipleKeyCount)).toBeTrue()
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

  it('keeps HANA quoting while expanding a CTE used by UNION ALL', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      WITH clientes AS (
        SELECT C."CardCode" FROM "OCRD" C WHERE C."CardType" = 'C'
      )
      SELECT C."CardCode" FROM clientes C
      UNION ALL
      SELECT L."CardCode" FROM "LEADS" L
    `, { sgbd: 'hana' })

    expect(plan.ctes.length).toBe(1)
    expect(plan.root.union?.operations[0].operator).toBe('union-all')
    expect(plan.root.union?.branches[0].linear?.countFrom.sql).toContain('FROM (SELECT')
    expect(plan.root.union?.branches[0].linear?.countFrom.sql).toContain('"OCRD"')
    expect(plan.root.union?.branches[0].linear?.countFrom.sql).not.toContain('[OCRD]')
  })

  it('keeps advanced CTE and UNION diagnostics HANA-compatible', async () => {
    const service = new QueryDataflowDebuggerService(new SqlParserService(), {} as any)
    const plan = await service.createPlan(`
      WITH "clientes" AS (
        SELECT C."CardCode" FROM "OCRD" C
      )
      SELECT X."CardCode" FROM "clientes" X
      UNION ALL
      SELECT L."CardCode" FROM "LEADS" L
    `, { sgbd: 'hana' })

    expect(plan.ctes[0].linear?.countFrom.sql).toContain('FROM "OCRD" AS "C"')
    expect(plan.root.union?.branches.length).toBe(2)
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
