import { Injectable } from '@angular/core'
import { RunQueryService } from '../db-query/run-query.service'
import { SqlParserService } from '../sql-parser/sql-parser.service'
import {
  QueryDataflowAnalysis,
  QueryDataflowDiagnosticQuery,
  QueryDataflowFinding,
  QueryDataflowJoinPlan,
  QueryDataflowJoinType,
  QueryDataflowPlan,
  QueryDataflowProgress,
  QueryDataflowStage,
  QueryDataflowUnsupportedError
} from './query-dataflow-debugger.model'

type SqlAst = Record<string, any>

const DIAGNOSTIC_TIMEOUT_MS = 25_000
const MANY_UNMATCHED_RATIO = .2
const COUNT_ALIAS = 'DBOLT_ROWS'
const MATCHED_ALIAS = 'DBOLT_MATCHED'
const UNMATCHED_ALIAS = 'DBOLT_UNMATCHED'
const MULTIPLE_KEYS_ALIAS = 'DBOLT_MULTIPLE_KEYS'
const KEY_ALIAS = 'DBOLT_KEY'
const MATCH_COUNT_ALIAS = 'DBOLT_MATCH_COUNT'

@Injectable({
  providedIn: 'root'
})
export class QueryDataflowDebuggerService {
  constructor(
    private sqlParser: SqlParserService,
    private runQuery: RunQueryService
  ) { }

  async createPlan(sql: string, context?: any): Promise<QueryDataflowPlan> {
    const sourceSql = sql.trim()
    if (!sourceSql) throw new QueryDataflowUnsupportedError('empty')

    let parsed: unknown
    try {
      parsed = await this.sqlParser.astify(sourceSql, context, true)
    } catch {
      throw new QueryDataflowUnsupportedError('invalidSql')
    }

    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) throw new QueryDataflowUnsupportedError('multipleStatements')
      parsed = parsed[0]
    }

    if (!this.isRecord(parsed) || parsed['type'] !== 'select') {
      throw new QueryDataflowUnsupportedError('selectOnly')
    }

    const ast = parsed as SqlAst
    this.validateSelect(ast)

    const from = ast['from'] as SqlAst[]
    const firstSource = from[0]
    this.validateTableSource(firstSource)

    const cumulativeFrom: SqlAst[] = [firstSource]
    const initialFromSql = await this.buildFromClause(ast, cumulativeFrom, context)
    const plan: QueryDataflowPlan = {
      source: await this.buildTableSource(ast, firstSource, context),
      countFrom: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${initialFromSql}`, 1),
      joins: []
    }

    for (let index = 1; index < from.length; index++) {
      const joinSource = from[index]
      this.validateTableSource(joinSource)
      const joinType = this.resolveJoinType(joinSource['join'])
      const on = joinSource['on']
      this.validateJoinCondition(on)

      const beforeFromSql = await this.buildFromClause(ast, cumulativeFrom, context)
      cumulativeFrom.push(joinSource)
      const afterFromSql = await this.buildFromClause(ast, cumulativeFrom, context)
      const rightFromSql = await this.buildFromClause(ast, [this.withoutJoin(joinSource)], context)
      const conditionSql = await this.sqlParser.expressionToSql(on, context, true)
      const rightKey = this.findSingleRightJoinKey(on, joinSource)

      plan.joins.push({
        label: this.tableLabel(joinSource),
        source: await this.buildTableSource(ast, joinSource, context),
        joinType,
        condition: conditionSql,
        countAfter: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${afterFromSql}`, 1),
        matchState: this.diagnostic(this.buildMatchStateQuery(beforeFromSql, rightFromSql, conditionSql), 1),
        ...(rightKey
          ? await this.buildMultipleKeyQueries(rightKey, beforeFromSql, rightFromSql, conditionSql, context)
          : {})
      })
    }

    if (ast['where']) {
      this.validateWhere(ast['where'])
      const completeFromSql = await this.buildFromClause(ast, cumulativeFrom, context)
      const whereSql = await this.sqlParser.expressionToSql(ast['where'], context, true)
      plan.where = {
        condition: whereSql,
        countAfter: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${completeFromSql} WHERE ${whereSql}`, 1)
      }
    }

    return plan
  }

  async analyze(
    sql: string,
    context?: any,
    signal?: AbortSignal,
    onProgress?: (progress: QueryDataflowProgress) => void
  ): Promise<QueryDataflowAnalysis> {
    const startedAt = performance.now()
    const plan = await this.createPlan(sql, context)
    const total = 1 + plan.joins.reduce((count, join) =>
      count + 2 + (join.multipleKeyCount ? 2 : 0), 0) + (plan.where ? 1 : 0)
    let completed = 0

    const execute = async (query: QueryDataflowDiagnosticQuery, stage: string): Promise<Array<Record<string, unknown>>> => {
      this.throwIfCanceled(signal)
      const rows = await this.executeWithTimeout(query, context, signal)
      completed++
      onProgress?.({ completed, total, stage })
      return rows
    }

    onProgress?.({ completed, total, stage: plan.source })
    const fromRows = this.readNumber(
      (await execute(plan.countFrom, plan.source))[0],
      COUNT_ALIAS
    )
    const stages: QueryDataflowStage[] = [{
      id: 'from',
      kind: 'from',
      label: 'FROM',
      source: plan.source,
      rowsAfter: fromRows,
      findings: []
    }]
    let previousRows = fromRows

    for (let index = 0; index < plan.joins.length; index++) {
      const join = plan.joins[index]
      const afterRows = this.readNumber(
        (await execute(join.countAfter, join.label))[0],
        COUNT_ALIAS
      )
      const matchState = (await execute(join.matchState, join.label))[0]
      const matched = this.readNumber(matchState, MATCHED_ALIAS)
      const unmatched = this.readNumber(matchState, UNMATCHED_ALIAS)
      let multipleKeyCount: number | undefined
      let multipleKeyExamples: Array<{ key: string; matches: number }> | undefined

      if (join.multipleKeyCount && join.multipleKeyExamples) {
        multipleKeyCount = this.readNumber(
          (await execute(join.multipleKeyCount, join.label))[0],
          MULTIPLE_KEYS_ALIAS
        )
        const examples = await execute(join.multipleKeyExamples, join.label)
        multipleKeyExamples = examples.map((row) => ({
          key: this.readText(row, KEY_ALIAS),
          matches: this.readNumber(row, MATCH_COUNT_ALIAS)
        }))
      }

      const findings = this.resolveJoinFindings(
        join,
        previousRows,
        afterRows,
        matched,
        unmatched,
        multipleKeyCount
      )
      stages.push({
        id: `join-${index}`,
        kind: 'join',
        label: join.label,
        source: join.source,
        joinType: join.joinType,
        condition: join.condition,
        rowsBefore: previousRows,
        rowsAfter: afterRows,
        matched,
        unmatched,
        fanOut: this.calculateFanOut(join.joinType, afterRows, matched, unmatched),
        multipleKeyCount,
        multipleKeyExamples,
        findings
      })
      previousRows = afterRows
    }

    if (plan.where) {
      const afterRows = this.readNumber(
        (await execute(plan.where.countAfter, 'WHERE'))[0],
        COUNT_ALIAS
      )
      stages.push({
        id: 'where',
        kind: 'where',
        label: 'WHERE',
        condition: plan.where.condition,
        rowsBefore: previousRows,
        rowsAfter: afterRows,
        findings: afterRows < previousRows ? ['rows-removed'] : []
      })
    }

    return {
      stages,
      analyzedSql: sql,
      durationMs: performance.now() - startedAt
    }
  }

  private validateSelect(ast: SqlAst): void {
    if (this.hasValue(ast['with'])) throw new QueryDataflowUnsupportedError('cte')
    if (this.hasValue(ast['_next']) || this.hasValue(ast['set_op']) || this.hasValue(ast['union'])) {
      throw new QueryDataflowUnsupportedError('union')
    }
    if (this.hasValue(ast['groupby']) || this.hasValue(ast['having'])) {
      throw new QueryDataflowUnsupportedError('groupBy')
    }
    if (this.hasDistinct(ast['distinct'])) throw new QueryDataflowUnsupportedError('distinct')
    if (this.hasLimit(ast['limit']) || this.hasValue(ast['top'])) {
      throw new QueryDataflowUnsupportedError('limit')
    }
    if (this.hasMeaningfulInto(ast['into'])) throw new QueryDataflowUnsupportedError('selectInto')
    if (this.containsNodeType(ast['columns'], 'select')) {
      throw new QueryDataflowUnsupportedError('subquery')
    }
    if (this.containsNodeType(ast['columns'], 'aggr_func') || this.hasValue(ast['window'])) {
      throw new QueryDataflowUnsupportedError('aggregate')
    }
    if (!Array.isArray(ast['from']) || ast['from'].length === 0) {
      throw new QueryDataflowUnsupportedError('noFrom')
    }

    for (let index = 1; index < ast['from'].length; index++) {
      if (!ast['from'][index]?.['join']) throw new QueryDataflowUnsupportedError('implicitJoin')
    }
  }

  private validateTableSource(source: SqlAst): void {
    if (!this.isRecord(source) || typeof source['table'] !== 'string' || source['expr']) {
      throw new QueryDataflowUnsupportedError('subquery')
    }
  }

  private resolveJoinType(value: unknown): QueryDataflowJoinType {
    const join = String(value || '').trim().toUpperCase()
    if (join === 'JOIN' || join === 'INNER JOIN') return 'inner'
    if (join === 'LEFT JOIN' || join === 'LEFT OUTER JOIN') return 'left'
    throw new QueryDataflowUnsupportedError('joinType')
  }

  private validateJoinCondition(expression: unknown): void {
    const comparisons = this.flattenAnd(expression)
    if (!comparisons.length || comparisons.some((comparison) =>
      comparison?.['type'] !== 'binary_expr' ||
      comparison?.['operator'] !== '=' ||
      comparison?.['left']?.['type'] !== 'column_ref' ||
      comparison?.['right']?.['type'] !== 'column_ref'
    )) {
      throw new QueryDataflowUnsupportedError('joinCondition')
    }
  }

  private validateWhere(expression: unknown): void {
    if (!this.isSimpleWhereExpression(expression)) {
      throw new QueryDataflowUnsupportedError('where')
    }
  }

  private isSimpleWhereExpression(expression: unknown): boolean {
    if (!this.isRecord(expression)) return false
    if (expression['type'] !== 'binary_expr') return false

    const operator = String(expression['operator'] || '').toUpperCase()
    if (operator === 'AND') {
      return this.isSimpleWhereExpression(expression['left']) && this.isSimpleWhereExpression(expression['right'])
    }

    const supported = new Set(['=', '!=', '<>', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'IN', 'NOT IN'])
    return supported.has(operator) &&
      this.isSimpleWhereOperand(expression['left']) &&
      this.isSimpleWhereOperand(expression['right'])
  }

  private isSimpleWhereOperand(operand: unknown): boolean {
    if (!this.isRecord(operand)) return false
    const type = String(operand['type'] || '')
    if (type === 'column_ref' || type.endsWith('_string') || type === 'number' || type === 'bool' || type === 'null') {
      return true
    }
    if (type === 'expr_list' && Array.isArray(operand['value'])) {
      return operand['value'].every((value: unknown) => this.isSimpleWhereOperand(value))
    }
    if (type === 'unary_expr') return this.isSimpleWhereOperand(operand['expr'])
    return false
  }

  private async buildFromClause(ast: SqlAst, from: SqlAst[], context?: any): Promise<string> {
    const database = this.sqlParser.resolveDatabase(context, true)
    const probeAst = {
      ...this.clone(ast),
      with: null,
      options: null,
      distinct: null,
      columns: [{
        ...(database === 'postgresql' ? { type: 'expr' } : {}),
        expr: { type: 'number', value: 1 },
        as: 'DBOLT_ROW'
      }],
      from: this.clone(from),
      where: null,
      groupby: null,
      having: null,
      orderby: null,
      limit: null,
      top: null,
      window: null,
      locking_read: null,
      for_update: null,
      for: null
    }
    const probeSql = await this.sqlParser.sqlify(probeAst, context, true)
    const fromIndex = probeSql.toUpperCase().indexOf(' FROM ')
    if (fromIndex < 0) throw new QueryDataflowUnsupportedError('invalidSql')
    return probeSql.slice(fromIndex + 1)
  }

  private async buildTableSource(ast: SqlAst, source: SqlAst, context?: any): Promise<string> {
    const fromSql = await this.buildFromClause(ast, [this.withoutJoin(source)], context)
    return fromSql.slice('FROM '.length)
  }

  private buildMatchStateQuery(beforeFromSql: string, rightFromSql: string, conditionSql: string): string {
    return [
      `SELECT COALESCE(SUM(DBOLT_HAS_MATCH), 0) AS ${MATCHED_ALIAS},`,
      `COUNT(*) - COALESCE(SUM(DBOLT_HAS_MATCH), 0) AS ${UNMATCHED_ALIAS}`,
      'FROM (',
      `SELECT CASE WHEN EXISTS (SELECT 1 ${rightFromSql} WHERE ${conditionSql}) THEN 1 ELSE 0 END AS DBOLT_HAS_MATCH`,
      beforeFromSql,
      ') AS DBOLT_MATCH_STATE'
    ].join('\n')
  }

  private async buildMultipleKeyQueries(
    rightKey: SqlAst,
    beforeFromSql: string,
    rightFromSql: string,
    conditionSql: string,
    context?: any
  ): Promise<Pick<QueryDataflowJoinPlan, 'multipleKeyCount' | 'multipleKeyExamples'>> {
    const rightKeySql = await this.sqlParser.expressionToSql(rightKey, context, true)
    const matchingKeys = [
      `SELECT ${rightKeySql} AS ${KEY_ALIAS}`,
      rightFromSql,
      `WHERE ${rightKeySql} IS NOT NULL`,
      `AND EXISTS (SELECT 1 ${beforeFromSql} WHERE ${conditionSql})`,
      `GROUP BY ${rightKeySql}`,
      'HAVING COUNT(*) > 1'
    ].join('\n')

    return {
      multipleKeyCount: this.diagnostic([
        `SELECT COUNT(*) AS ${MULTIPLE_KEYS_ALIAS}`,
        'FROM (',
        matchingKeys,
        ') AS DBOLT_MULTIPLE_KEY_GROUPS'
      ].join('\n'), 1),
      multipleKeyExamples: this.diagnostic([
        `SELECT ${rightKeySql} AS ${KEY_ALIAS}, COUNT(*) AS ${MATCH_COUNT_ALIAS}`,
        rightFromSql,
        `WHERE ${rightKeySql} IS NOT NULL`,
        `AND EXISTS (SELECT 1 ${beforeFromSql} WHERE ${conditionSql})`,
        `GROUP BY ${rightKeySql}`,
        'HAVING COUNT(*) > 1',
        'ORDER BY COUNT(*) DESC'
      ].join('\n'), 5)
    }
  }

  private findSingleRightJoinKey(expression: unknown, source: SqlAst): SqlAst | null {
    const comparisons = this.flattenAnd(expression)
    if (comparisons.length !== 1) return null

    const comparison = comparisons[0]
    const rightNames = new Set([
      this.normalizeIdentifier(source['as']),
      this.normalizeIdentifier(source['table'])
    ].filter(Boolean))
    const left = comparison['left'] as SqlAst
    const right = comparison['right'] as SqlAst
    const leftBelongsToJoin = rightNames.has(this.normalizeIdentifier(left['table']))
    const rightBelongsToJoin = rightNames.has(this.normalizeIdentifier(right['table']))

    if (leftBelongsToJoin === rightBelongsToJoin) return null
    return leftBelongsToJoin ? left : right
  }

  private resolveJoinFindings(
    join: QueryDataflowJoinPlan,
    before: number,
    after: number,
    matched: number,
    unmatched: number,
    multipleKeyCount?: number
  ): QueryDataflowFinding[] {
    const findings: QueryDataflowFinding[] = []
    if (after > before) findings.push('cardinality-increase')
    if (join.joinType === 'inner' && unmatched > 0) findings.push('rows-removed')
    if (join.joinType === 'left' && before > 0 && unmatched / before >= MANY_UNMATCHED_RATIO) {
      findings.push('many-unmatched')
    }
    const outputExceedsMatchedInput = join.joinType === 'inner' && after > matched
    const leftJoinIncreasedCardinality = join.joinType === 'left' && after > before
    if ((multipleKeyCount || 0) > 0 || outputExceedsMatchedInput || leftJoinIncreasedCardinality) {
      findings.push('possible-one-to-many')
    }
    return findings
  }

  private calculateFanOut(
    joinType: QueryDataflowJoinType,
    after: number,
    matched: number,
    unmatched: number
  ): number | undefined {
    if (matched <= 0) return undefined

    // A LEFT JOIN keeps every unmatched input row once. Those preserved rows are
    // not products of a match and therefore must not participate in fan-out.
    const rowsProducedByMatches = joinType === 'left'
      ? Math.max(0, after - unmatched)
      : after
    return rowsProducedByMatches / matched
  }

  private async executeWithTimeout(
    query: QueryDataflowDiagnosticQuery,
    context: any,
    parentSignal?: AbortSignal
  ): Promise<Array<Record<string, unknown>>> {
    const controller = new AbortController()
    let timedOut = false
    const abortFromParent = (): void => controller.abort()
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DIAGNOSTIC_TIMEOUT_MS)

    try {
      return await this.runQuery.runReadOnlySQL(query.sql, query.maxRows, context, controller.signal)
    } catch (error: unknown) {
      if (timedOut) throw new Error('query-dataflow-timeout')
      if (parentSignal?.aborted || this.isAbortError(error)) {
        throw new DOMException('Query dataflow analysis canceled.', 'AbortError')
      }
      throw error
    } finally {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    }
  }

  private throwIfCanceled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Query dataflow analysis canceled.', 'AbortError')
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private diagnostic(sql: string, maxRows: number): QueryDataflowDiagnosticQuery {
    return { sql, maxRows }
  }

  private flattenAnd(expression: unknown): SqlAst[] {
    if (!this.isRecord(expression)) return []
    if (expression['type'] === 'binary_expr' && String(expression['operator']).toUpperCase() === 'AND') {
      return [...this.flattenAnd(expression['left']), ...this.flattenAnd(expression['right'])]
    }
    return [expression]
  }

  private withoutJoin(source: SqlAst): SqlAst {
    const standalone = this.clone(source)
    delete standalone['join']
    delete standalone['on']
    return standalone
  }

  private tableLabel(source: SqlAst): string {
    const table = this.identifierText(source['table'])
    const alias = this.identifierText(source['as'])
    return alias && alias.toLowerCase() !== table.toLowerCase() ? `${table} · ${alias}` : table
  }

  private normalizeIdentifier(value: unknown): string {
    return this.identifierText(value).toLowerCase()
  }

  private identifierText(value: unknown): string {
    if (typeof value === 'string') return value
    if (this.isRecord(value)) {
      return this.identifierText(value['value'] ?? value['expr'] ?? value['column'])
    }
    return ''
  }

  private readNumber(row: Record<string, unknown> | undefined, key: string): number {
    const value = this.readValue(row, key)
    const number = Number(value ?? 0)
    return Number.isFinite(number) ? number : 0
  }

  private readText(row: Record<string, unknown> | undefined, key: string): string {
    const value = this.readValue(row, key)
    return value === null || value === undefined ? 'NULL' : String(value)
  }

  private readValue(row: Record<string, unknown> | undefined, key: string): unknown {
    if (!row) return undefined
    const actualKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
    return actualKey ? row[actualKey] : undefined
  }

  private hasDistinct(value: unknown): boolean {
    if (!this.isRecord(value)) return Boolean(value)
    return Object.values(value).some((entry) => this.hasValue(entry))
  }

  private hasLimit(value: unknown): boolean {
    if (!this.isRecord(value)) return Boolean(value)
    const limitValues = value['value']
    return Array.isArray(limitValues) ? limitValues.length > 0 : this.hasValue(limitValues)
  }

  private hasMeaningfulInto(value: unknown): boolean {
    if (!this.isRecord(value)) return Boolean(value)
    return Object.entries(value).some(([key, entry]) => key !== 'position' && this.hasValue(entry))
  }

  private containsNodeType(value: unknown, type: string): boolean {
    if (Array.isArray(value)) return value.some((entry) => this.containsNodeType(entry, type))
    if (!this.isRecord(value)) return false
    if (value['type'] === type) return true
    return Object.values(value).some((entry) => this.containsNodeType(entry, type))
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value)) return value.length > 0
    if (this.isRecord(value)) return Object.values(value).some((entry) => this.hasValue(entry))
    return Boolean(value)
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  private isRecord(value: unknown): value is SqlAst {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
