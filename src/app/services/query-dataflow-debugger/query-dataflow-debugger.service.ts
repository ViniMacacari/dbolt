import { Injectable } from '@angular/core'
import { RunQueryService } from '../db-query/run-query.service'
import { SqlParserService } from '../sql-parser/sql-parser.service'
import {
  QueryDataflowAnalysis,
  QueryDataflowBlock,
  QueryDataflowBlockKind,
  QueryDataflowCorrelation,
  QueryDataflowDiagnosticQuery,
  QueryDataflowDocumentPlan,
  QueryDataflowFinding,
  QueryDataflowJoinPlan,
  QueryDataflowJoinType,
  QueryDataflowNestedPlan,
  QueryDataflowPlan,
  QueryDataflowProgress,
  QueryDataflowStage,
  QueryDataflowSubqueryPlan,
  QueryDataflowSubqueryUsage,
  QueryDataflowUnionOperator,
  QueryDataflowUnsupportedError
} from './query-dataflow-debugger.model'

type SqlAst = Record<string, any>
type DiagnosticExecutor = (
  query: QueryDataflowDiagnosticQuery,
  stage: string
) => Promise<Array<Record<string, unknown>>>

interface CteDefinition {
  name: string
  ast: SqlAst
}

interface PlannerState {
  context: any
  ctes: Map<string, CteDefinition>
  blockCount: number
  nextBlockId: number
  optionalProbeCount: number
}

interface BlockOptions {
  kind: QueryDataflowBlockKind
  label: string
  alias?: string
  outerAliases: Set<string>
  depth: number
}

interface SubqueryDescriptor {
  wrapper: SqlAst
  usage: QueryDataflowSubqueryUsage
  operator?: 'IN' | 'NOT IN' | 'EXISTS' | 'NOT EXISTS'
}

const DIAGNOSTIC_TIMEOUT_MS = 25_000
const MANY_UNMATCHED_RATIO = .2
const MAX_BLOCKS = 30
const MAX_FLOW_DEPTH = 8
const MAX_DIAGNOSTIC_QUERIES = 80
const MAX_OPTIONAL_JOIN_DETAIL_PROBES = 16
const COUNT_ALIAS = 'DBOLT_ROWS'
const MATCHED_ALIAS = 'DBOLT_MATCHED'
const UNMATCHED_ALIAS = 'DBOLT_UNMATCHED'
const MULTIPLE_KEYS_ALIAS = 'DBOLT_MULTIPLE_KEYS'
const KEY_ALIAS = 'DBOLT_KEY'
const MATCH_COUNT_ALIAS = 'DBOLT_MATCH_COUNT'
const IN_VALUE_ALIAS = 'DBOLT_IN_VALUE'
const SAFE_SCALAR_FILTER_FUNCTIONS = new Set(['COALESCE', 'IFNULL', 'NVL'])

@Injectable({ providedIn: 'root' })
export class QueryDataflowDebuggerService {
  constructor(
    private sqlParser: SqlParserService,
    private runQuery: RunQueryService
  ) { }

  async createPlan(sql: string, context?: any): Promise<QueryDataflowDocumentPlan> {
    const sourceSql = sql.trim()
    if (!sourceSql) throw new QueryDataflowUnsupportedError('empty')

    const ast = await this.parseSingleSelect(sourceSql, context)
    const state: PlannerState = {
      context,
      ctes: new Map<string, CteDefinition>(),
      blockCount: 0,
      nextBlockId: 0,
      optionalProbeCount: 0
    }
    const cteEntries = Array.isArray(ast['with']) ? ast['with'] as SqlAst[] : []

    for (const entry of cteEntries) {
      if (entry['recursive']) throw new QueryDataflowUnsupportedError('recursiveCte')
      const name = this.identifierText(entry['name'])
      const cteAst = this.unwrapSelectAst(entry['stmt'])
      if (!name || !cteAst) throw new QueryDataflowUnsupportedError('invalidSql')
      state.ctes.set(this.normalizeIdentifier(name), { name, ast: cteAst })
    }

    const mainAst = this.clone(ast)
    mainAst['with'] = null
    const root = await this.createBlockPlan(mainAst, state, {
      kind: 'main',
      label: 'MAIN QUERY',
      outerAliases: new Set<string>(),
      depth: 0
    })

    const ctes: QueryDataflowNestedPlan[] = []
    for (const entry of cteEntries) {
      const name = this.identifierText(entry['name'])
      const definition = state.ctes.get(this.normalizeIdentifier(name))!
      ctes.push(await this.createBlockPlan(definition.ast, state, {
        kind: 'cte',
        label: name,
        alias: name,
        outerAliases: new Set<string>(),
        depth: 0
      }))
    }

    this.assignCteConsumers(ctes, root)
    const probeCount = ctes.reduce((total, cte) => total + this.countPlanProbes(cte), 0) +
      this.countPlanProbes(root)
    if (probeCount > MAX_DIAGNOSTIC_QUERIES) throw new QueryDataflowUnsupportedError('tooManyProbes')

    const legacyPlan = root.linear || await this.createLegacyPlanForComposite(root, mainAst, state)
    return { ...legacyPlan, root, ctes }
  }

  async analyze(
    sql: string,
    context?: any,
    signal?: AbortSignal,
    onProgress?: (progress: QueryDataflowProgress) => void
  ): Promise<QueryDataflowAnalysis> {
    const startedAt = performance.now()
    const plan = await this.createPlan(sql, context)
    const total = plan.ctes.reduce((count, cte) => count + this.countPlanProbes(cte), 0) +
      this.countPlanProbes(plan.root)
    let completed = 0
    const execute: DiagnosticExecutor = async (query, stage) => {
      this.throwIfCanceled(signal)
      const rows = await this.executeWithTimeout(query, context, signal)
      completed++
      onProgress?.({ completed, total, stage })
      return rows
    }

    onProgress?.({ completed, total, stage: plan.root.label })
    const ctes: QueryDataflowBlock[] = []
    for (const cte of plan.ctes) ctes.push(await this.analyzeBlock(cte, execute))
    const root = await this.analyzeBlock(plan.root, execute)

    return {
      stages: root.stages,
      root,
      ctes,
      analyzedSql: sql,
      durationMs: performance.now() - startedAt
    }
  }

  private async parseSingleSelect(sql: string, context?: any): Promise<SqlAst> {
    let parsed: unknown
    try {
      parsed = await this.sqlParser.astify(sql, context, true)
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
    return parsed
  }

  private async createBlockPlan(
    inputAst: SqlAst,
    state: PlannerState,
    options: BlockOptions
  ): Promise<QueryDataflowNestedPlan> {
    const id = `${options.kind}-${state.nextBlockId++}`
    state.blockCount++
    if (state.blockCount > MAX_BLOCKS || options.depth > MAX_FLOW_DEPTH) {
      return this.unsupportedBlock(id, options, 'tooComplex')
    }

    if (this.hasValue(inputAst['with'])) {
      return this.unsupportedBlock(id, options, 'nestedCte')
    }

    const ast = this.clone(inputAst)
    ast['with'] = null
    const sql = await this.safeSqlify(ast, state.context)
    const correlation = await this.detectCorrelation(ast, options.outerAliases, state.context)
    const dependencies = this.collectCteDependencies(ast, state.ctes)
    if (correlation) {
      return {
        id,
        kind: options.kind,
        label: options.label,
        alias: options.alias,
        sql,
        dependencies,
        consumedBy: [],
        correlation
      }
    }

    try {
      if (this.hasValue(ast['_next'])) {
        const union = await this.createUnionPlan(ast, state, options)
        return {
          id,
          kind: options.kind,
          label: options.label,
          alias: options.alias,
          sql,
          union,
          dependencies: this.unique([
            ...dependencies,
            ...union.branches.flatMap((branch) => branch.dependencies)
          ]),
          consumedBy: []
        }
      }

      const linear = await this.createLinearPlan(ast, state, options)
      return {
        id,
        kind: options.kind,
        label: options.label,
        alias: options.alias,
        sql,
        linear,
        dependencies: linear.dependencies,
        consumedBy: []
      }
    } catch (error: unknown) {
      if (error instanceof QueryDataflowUnsupportedError) {
        return {
          id,
          kind: options.kind,
          label: options.label,
          alias: options.alias,
          sql,
          dependencies,
          consumedBy: [],
          unsupportedReason: error.reason
        }
      }
      throw error
    }
  }

  private async createLinearPlan(
    ast: SqlAst,
    state: PlannerState,
    options: BlockOptions
  ): Promise<QueryDataflowPlan> {
    this.validateLinearSelect(ast)
    const originalFrom = ast['from'] as SqlAst[]
    const resolvedAst = this.resolveCteReferences(ast, state)
    const resolvedFrom = resolvedAst['from'] as SqlAst[]
    const localAliases = this.collectLocalAliases(ast)
    const childOuterAliases = new Set([...options.outerAliases, ...localAliases])
    const firstSource = originalFrom[0]
    const firstResolvedSource = resolvedFrom[0]
    this.validateTableSource(firstResolvedSource)

    const cumulativeFrom: SqlAst[] = [firstResolvedSource]
    const initialFromSql = await this.buildFromClause(resolvedAst, cumulativeFrom, state.context)
    const sourceBlock = await this.planSourceSubquery(firstSource, 'from', state, childOuterAliases, options.depth)
    const plan: QueryDataflowPlan = {
      source: this.displaySource(firstSource),
      countFrom: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${initialFromSql}`, 1),
      joins: [],
      sourceBlock,
      dependencies: this.collectCteDependencies(ast, state.ctes),
      projections: []
    }

    for (let index = 1; index < originalFrom.length; index++) {
      const joinSource = originalFrom[index]
      const resolvedJoinSource = resolvedFrom[index]
      this.validateTableSource(resolvedJoinSource)
      const joinType = this.resolveJoinType(joinSource['join'])
      const on = resolvedJoinSource['on']
      this.validateJoinCondition(on)
      const beforeFromSql = await this.buildFromClause(resolvedAst, cumulativeFrom, state.context)
      cumulativeFrom.push(resolvedJoinSource)
      const afterFromSql = await this.buildFromClause(resolvedAst, cumulativeFrom, state.context)
      const rightFromSql = await this.buildFromClause(
        resolvedAst,
        [this.withoutJoin(resolvedJoinSource)],
        state.context
      )
      const conditionSql = await this.sqlParser.expressionToSql(on, state.context, true)
      const rightKey = this.findSingleRightJoinKey(on, joinSource)
      const multipleKeyQueries = rightKey &&
        state.optionalProbeCount + 2 <= MAX_OPTIONAL_JOIN_DETAIL_PROBES
        ? await this.buildMultipleKeyQueries(rightKey, beforeFromSql, rightFromSql, conditionSql, state.context)
        : undefined
      if (multipleKeyQueries) state.optionalProbeCount += 2
      const inputBlock = await this.planSourceSubquery(
        joinSource,
        'join',
        state,
        childOuterAliases,
        options.depth
      )

      plan.joins.push({
        label: this.tableLabel(joinSource),
        source: this.displaySource(joinSource),
        joinType,
        condition: conditionSql,
        countAfter: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${afterFromSql}`, 1),
        matchState: this.diagnostic(this.buildMatchStateQuery(beforeFromSql, rightFromSql, conditionSql), 1),
        inputBlock,
        ...multipleKeyQueries
      })
    }

    if (resolvedAst['where']) {
      this.validateWhere(resolvedAst['where'])
      const completeFromSql = await this.buildFromClause(resolvedAst, cumulativeFrom, state.context)
      const whereSql = await this.sqlParser.expressionToSql(resolvedAst['where'], state.context, true)
      const descriptors = this.findWhereSubqueries(ast['where'])
      const subqueries: QueryDataflowSubqueryPlan[] = []
      for (const descriptor of descriptors) {
        subqueries.push(await this.createSubqueryLink(
          descriptor,
          state,
          childOuterAliases,
          options.depth
        ))
      }
      plan.where = {
        condition: whereSql,
        countAfter: this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS} ${completeFromSql} WHERE ${whereSql}`, 1),
        subqueries,
        existsOperator: this.resolveStandaloneExistsOperator(ast['where'])
      }
    }

    if (this.hasValue(resolvedAst['groupby'])) {
      if (this.hasValue(resolvedAst['having'])) throw new QueryDataflowUnsupportedError('having')
      const conditions: string[] = []
      for (const column of this.groupByColumns(resolvedAst['groupby'])) {
        conditions.push(await this.sqlParser.expressionToSql(column, state.context, true))
      }
      plan.group = {
        condition: conditions.join(', '),
        countAfter: await this.buildOutputCountQuery(resolvedAst, state.context),
        kind: 'group'
      }
    } else if (this.containsImmediateNodeType(resolvedAst['columns'], 'aggr_func')) {
      plan.group = {
        condition: '',
        countAfter: await this.buildOutputCountQuery(resolvedAst, state.context),
        kind: 'aggregation'
      }
    }

    for (const wrapper of this.findImmediateSubqueryWrappers(ast['columns'])) {
      plan.projections.push(await this.createSubqueryLink({
        wrapper,
        usage: 'select-scalar'
      }, state, childOuterAliases, options.depth))
    }
    return plan
  }

  private async createUnionPlan(
    ast: SqlAst,
    state: PlannerState,
    options: BlockOptions
  ): Promise<NonNullable<QueryDataflowNestedPlan['union']>> {
    const branchAsts: SqlAst[] = []
    const operators: QueryDataflowUnionOperator[] = []
    let cursor: SqlAst | null = ast
    while (cursor) {
      const branch = this.clone(cursor)
      const next: SqlAst | null = this.isRecord(cursor['_next']) ? cursor['_next'] as SqlAst : null
      const operator = next ? this.resolveUnionOperator(cursor['set_op']) : null
      branch['_next'] = null
      branch['set_op'] = null
      branchAsts.push(branch)
      if (operator) operators.push(operator)
      cursor = next
    }

    const branches: QueryDataflowNestedPlan[] = []
    for (let index = 0; index < branchAsts.length; index++) {
      branches.push(await this.createBlockPlan(branchAsts[index], state, {
        kind: 'branch',
        label: `BRANCH ${index + 1}`,
        outerAliases: options.outerAliases,
        depth: options.depth + 1
      }))
    }

    const operations: NonNullable<QueryDataflowNestedPlan['union']>['operations'] = []
    for (let index = 0; index < operators.length; index++) {
      const operator = operators[index]
      operations.push({
        operator,
        ...(operator === 'union'
          ? { countAfter: await this.buildOutputCountQuery(
            this.resolveCteReferences(this.buildUnionPrefix(branchAsts, operators, index + 2), state),
            state.context
          ) }
          : {})
      })
    }
    return { branches, operations }
  }

  private async analyzeBlock(
    plan: QueryDataflowNestedPlan,
    execute: DiagnosticExecutor,
    outerRows?: number
  ): Promise<QueryDataflowBlock> {
    const base: QueryDataflowBlock = {
      id: plan.id,
      kind: plan.kind,
      label: plan.label,
      alias: plan.alias,
      sql: plan.sql,
      stages: [],
      dependencies: plan.dependencies,
      consumedBy: plan.consumedBy,
      unsupportedReason: plan.unsupportedReason,
      correlation: plan.correlation ? { ...plan.correlation, outerRows } : undefined
    }
    if (plan.unsupportedReason || plan.correlation) return base
    if (plan.union) return this.analyzeUnionBlock(base, plan, execute)
    if (!plan.linear) return { ...base, unsupportedReason: 'unknown' }
    return this.analyzeLinearBlock(base, plan.linear, execute)
  }

  private async analyzeLinearBlock(
    block: QueryDataflowBlock,
    plan: QueryDataflowPlan,
    execute: DiagnosticExecutor
  ): Promise<QueryDataflowBlock> {
    const fromRows = this.readNumber((await execute(plan.countFrom, plan.source))[0], COUNT_ALIAS)
    const stages: QueryDataflowStage[] = [{
      id: `${block.id}-from`,
      kind: 'from',
      label: 'FROM',
      source: plan.source,
      rowsAfter: fromRows,
      findings: []
    }]
    let previousRows = fromRows
    if (plan.sourceBlock) stages[0].inputs = [await this.analyzeBlock(plan.sourceBlock, execute)]

    for (let index = 0; index < plan.joins.length; index++) {
      const join = plan.joins[index]
      const afterRows = this.readNumber((await execute(join.countAfter, join.label))[0], COUNT_ALIAS)
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
        multipleKeyExamples = (await execute(join.multipleKeyExamples, join.label)).map((row) => ({
          key: this.readText(row, KEY_ALIAS),
          matches: this.readNumber(row, MATCH_COUNT_ALIAS)
        }))
      }

      const stage: QueryDataflowStage = {
        id: `${block.id}-join-${index}`,
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
        findings: this.resolveJoinFindings(join, previousRows, afterRows, matched, unmatched, multipleKeyCount)
      }
      if (join.inputBlock) stage.inputs = [await this.analyzeBlock(join.inputBlock, execute, previousRows)]
      stages.push(stage)
      previousRows = afterRows
    }

    if (plan.where) {
      const beforeWhere = previousRows
      const afterRows = this.readNumber((await execute(plan.where.countAfter, 'WHERE'))[0], COUNT_ALIAS)
      const stage: QueryDataflowStage = {
        id: `${block.id}-where`,
        kind: 'where',
        label: 'WHERE',
        condition: plan.where.condition,
        rowsBefore: beforeWhere,
        rowsAfter: afterRows,
        findings: afterRows < beforeWhere ? ['rows-removed'] : []
      }
      if (plan.where.existsOperator === 'EXISTS') {
        stage.matched = afterRows
        stage.unmatched = Math.max(0, beforeWhere - afterRows)
      } else if (plan.where.existsOperator === 'NOT EXISTS') {
        stage.matched = Math.max(0, beforeWhere - afterRows)
        stage.unmatched = afterRows
      }
      const inputs: QueryDataflowBlock[] = []
      for (const subquery of plan.where.subqueries) {
        inputs.push(await this.analyzeSubqueryLink(subquery, execute, beforeWhere))
      }
      if (inputs.length) stage.inputs = inputs
      stages.push(stage)
      previousRows = afterRows
    }

    if (plan.group) {
      const afterRows = this.readNumber((await execute(plan.group.countAfter, plan.group.kind))[0], COUNT_ALIAS)
      stages.push({
        id: `${block.id}-${plan.group.kind}`,
        kind: plan.group.kind,
        label: plan.group.kind === 'group' ? 'GROUP BY' : 'AGGREGATE',
        condition: plan.group.condition,
        rowsBefore: previousRows,
        rowsAfter: afterRows,
        findings: afterRows < previousRows ? ['rows-removed'] : []
      })
      previousRows = afterRows
    }

    if (plan.projections.length) {
      const inputs: QueryDataflowBlock[] = []
      for (const projection of plan.projections) {
        inputs.push(await this.analyzeSubqueryLink(projection, execute, previousRows))
      }
      stages.push({
        id: `${block.id}-projection`,
        kind: 'projection',
        label: 'SELECT',
        rowsBefore: previousRows,
        rowsAfter: previousRows,
        inputs,
        findings: []
      })
    }
    return { ...block, stages, outputRows: previousRows }
  }

  private async analyzeSubqueryLink(
    link: QueryDataflowSubqueryPlan,
    execute: DiagnosticExecutor,
    outerRows: number
  ): Promise<QueryDataflowBlock> {
    const input = await this.analyzeBlock(link.block, execute, outerRows)
    if (!link.distinctCount || input.correlation || input.unsupportedReason || input.outputRows === undefined) {
      return input
    }
    const distinctRows = this.readNumber((await execute(link.distinctCount, 'DISTINCT'))[0], COUNT_ALIAS)
    input.stages.push({
      id: `${input.id}-distinct`,
      kind: 'distinct',
      label: 'DISTINCT',
      rowsBefore: input.outputRows,
      rowsAfter: distinctRows,
      findings: distinctRows < input.outputRows ? ['rows-removed'] : []
    })
    input.outputRows = distinctRows
    return input
  }

  private async analyzeUnionBlock(
    block: QueryDataflowBlock,
    plan: QueryDataflowNestedPlan,
    execute: DiagnosticExecutor
  ): Promise<QueryDataflowBlock> {
    const union = plan.union!
    const branches: QueryDataflowBlock[] = []
    for (const branch of union.branches) branches.push(await this.analyzeBlock(branch, execute))
    const steps = []
    let combinedRows = branches[0]?.outputRows
    for (let index = 0; index < union.operations.length; index++) {
      const operation = union.operations[index]
      const rightRows = branches[index + 1]?.outputRows
      if (combinedRows === undefined || rightRows === undefined) break
      const beforeDistinct = combinedRows + rightRows
      const afterRows = operation.operator === 'union-all'
        ? beforeDistinct
        : this.readNumber((await execute(operation.countAfter!, 'UNION'))[0], COUNT_ALIAS)
      steps.push({
        id: `${block.id}-union-${index}`,
        operator: operation.operator,
        leftRows: combinedRows,
        rightRows,
        rowsBeforeDistinct: beforeDistinct,
        rowsAfter: afterRows,
        duplicatesRemoved: operation.operator === 'union' ? Math.max(0, beforeDistinct - afterRows) : 0
      })
      combinedRows = afterRows
    }
    return {
      ...block,
      branches,
      unionSteps: steps,
      outputRows: combinedRows,
      unsupportedReason: steps.length === union.operations.length ? undefined : 'dependentBlock'
    }
  }

  private async createSubqueryLink(
    descriptor: SubqueryDescriptor,
    state: PlannerState,
    outerAliases: Set<string>,
    parentDepth: number
  ): Promise<QueryDataflowSubqueryPlan> {
    const ast = this.unwrapSelectAst(descriptor.wrapper)
    if (!ast) throw new QueryDataflowUnsupportedError('subquery')
    const alias = this.identifierText(descriptor.wrapper['as'])
    const block = await this.createBlockPlan(ast, state, {
      kind: 'subquery',
      label: alias || this.subqueryLabel(descriptor.usage),
      alias: alias || undefined,
      outerAliases,
      depth: parentDepth + 1
    })
    return {
      usage: descriptor.usage,
      operator: descriptor.operator,
      block,
      ...(descriptor.usage === 'where-in' && !block.correlation && !block.unsupportedReason
        ? { distinctCount: await this.buildInDistinctCount(ast, state) }
        : {})
    }
  }

  private async planSourceSubquery(
    source: SqlAst,
    usage: 'from' | 'join',
    state: PlannerState,
    outerAliases: Set<string>,
    parentDepth: number
  ): Promise<QueryDataflowNestedPlan | undefined> {
    if (!this.unwrapSelectAst(source['expr'])) return undefined
    return (await this.createSubqueryLink({
      wrapper: { ...source['expr'], as: source['as'] },
      usage
    }, state, outerAliases, parentDepth)).block
  }

  private validateLinearSelect(ast: SqlAst): void {
    if (this.hasValue(ast['with'])) throw new QueryDataflowUnsupportedError('nestedCte')
    if (this.hasValue(ast['_next'])) throw new QueryDataflowUnsupportedError('union')
    if (this.hasDistinct(ast['distinct'])) throw new QueryDataflowUnsupportedError('distinct')
    if (this.hasLimit(ast['limit']) || this.hasValue(ast['top'])) throw new QueryDataflowUnsupportedError('limit')
    if (this.hasMeaningfulInto(ast['into'])) throw new QueryDataflowUnsupportedError('selectInto')
    if (this.hasValue(ast['window'])) throw new QueryDataflowUnsupportedError('window')
    if (!Array.isArray(ast['from']) || ast['from'].length === 0) {
      throw new QueryDataflowUnsupportedError('noFrom')
    }
    for (let index = 1; index < ast['from'].length; index++) {
      if (!ast['from'][index]?.['join']) throw new QueryDataflowUnsupportedError('implicitJoin')
    }
  }

  private validateTableSource(source: SqlAst): void {
    if (!this.isRecord(source)) throw new QueryDataflowUnsupportedError('subquery')
    if (typeof source['table'] === 'string' || this.unwrapSelectAst(source['expr'])) return
    throw new QueryDataflowUnsupportedError('subquery')
  }

  private resolveJoinType(value: unknown): QueryDataflowJoinType {
    const join = String(value || '').trim().toUpperCase()
    if (join === 'JOIN' || join === 'INNER JOIN') return 'inner'
    if (join === 'LEFT JOIN' || join === 'LEFT OUTER JOIN') return 'left'
    throw new QueryDataflowUnsupportedError('joinType')
  }

  private resolveUnionOperator(value: unknown): QueryDataflowUnionOperator {
    const operator = String(value || '').trim().toLowerCase()
    if (operator === 'union') return 'union'
    if (operator === 'union all') return 'union-all'
    throw new QueryDataflowUnsupportedError('unionOperator')
  }

  private validateJoinCondition(expression: unknown): void {
    const comparisons = this.flattenAnd(expression)
    if (!comparisons.length || comparisons.some((comparison) =>
      comparison?.['type'] !== 'binary_expr' ||
      comparison?.['operator'] !== '=' ||
      !this.containsImmediateNodeType(comparison, 'column_ref') ||
      !this.isSimpleWhereOperand(comparison?.['left']) ||
      !this.isSimpleWhereOperand(comparison?.['right'])
    )) throw new QueryDataflowUnsupportedError('joinCondition')
  }

  private validateWhere(expression: unknown): void {
    if (!this.isSimpleWhereExpression(expression)) throw new QueryDataflowUnsupportedError('where')
  }

  private isSimpleWhereExpression(expression: unknown): boolean {
    if (!this.isRecord(expression)) return false
    if (expression['type'] === 'binary_expr' && String(expression['operator']).toUpperCase() === 'AND') {
      return this.isSimpleWhereExpression(expression['left']) && this.isSimpleWhereExpression(expression['right'])
    }
    if (expression['type'] === 'function' && this.functionName(expression['name']) === 'NOT') {
      const values = this.expressionListValues(expression['args'])
      return values.length === 1 && this.isSimpleWhereExpression(values[0])
    }
    if (this.isExistsExpression(expression)) return true
    if (expression['type'] !== 'binary_expr') return false
    const operator = String(expression['operator'] || '').toUpperCase()
    if ((operator === 'IN' || operator === 'NOT IN') &&
      this.findImmediateSubqueryWrappers(expression['right']).length === 1) {
      return this.isSimpleWhereOperand(expression['left'])
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
    if (type === 'function' && SAFE_SCALAR_FILTER_FUNCTIONS.has(this.functionName(operand['name']))) {
      const values = this.expressionListValues(operand['args'])
      return values.length > 0 && values.every((value) => this.isSimpleWhereOperand(value))
    }
    if (type === 'unary_expr') return this.isSimpleWhereOperand(operand['expr'])
    return false
  }

  private expressionListValues(value: unknown): unknown[] {
    if (!this.isRecord(value) || value['type'] !== 'expr_list' || !Array.isArray(value['value'])) return []
    return value['value']
  }

  private isExistsExpression(expression: SqlAst): boolean {
    if (expression['type'] === 'unary_expr' && String(expression['operator']).toUpperCase() === 'NOT EXISTS') {
      return Boolean(this.unwrapSelectAst(expression['expr']))
    }
    return expression['type'] === 'function' && this.functionName(expression['name']) === 'EXISTS' &&
      this.findImmediateSubqueryWrappers(expression['args']).length === 1
  }

  private findWhereSubqueries(expression: unknown): SubqueryDescriptor[] {
    if (!this.isRecord(expression)) return []
    if (expression['type'] === 'binary_expr' && String(expression['operator']).toUpperCase() === 'AND') {
      return [...this.findWhereSubqueries(expression['left']), ...this.findWhereSubqueries(expression['right'])]
    }
    if (expression['type'] === 'binary_expr') {
      const operator = String(expression['operator']).toUpperCase()
      if (operator === 'IN' || operator === 'NOT IN') {
        return this.findImmediateSubqueryWrappers(expression['right']).map((wrapper) => ({
          wrapper,
          usage: 'where-in',
          operator
        }))
      }
    }
    if (expression['type'] === 'unary_expr' && String(expression['operator']).toUpperCase() === 'NOT EXISTS') {
      const wrapper = this.findImmediateSubqueryWrappers(expression['expr'])[0] || expression['expr']
      return this.unwrapSelectAst(wrapper) ? [{ wrapper, usage: 'where-exists', operator: 'NOT EXISTS' }] : []
    }
    if (expression['type'] === 'function' && this.functionName(expression['name']) === 'EXISTS') {
      return this.findImmediateSubqueryWrappers(expression['args']).map((wrapper) => ({
        wrapper,
        usage: 'where-exists',
        operator: 'EXISTS'
      }))
    }
    return []
  }

  private resolveStandaloneExistsOperator(expression: unknown): 'EXISTS' | 'NOT EXISTS' | undefined {
    if (!this.isRecord(expression)) return undefined
    if (expression['type'] === 'unary_expr' && String(expression['operator']).toUpperCase() === 'NOT EXISTS') {
      return 'NOT EXISTS'
    }
    if (expression['type'] === 'function' && this.functionName(expression['name']) === 'EXISTS') return 'EXISTS'
    return undefined
  }

  private findImmediateSubqueryWrappers(value: unknown): SqlAst[] {
    const wrappers: SqlAst[] = []
    const visit = (current: unknown): void => {
      if (Array.isArray(current)) {
        current.forEach(visit)
        return
      }
      if (!this.isRecord(current)) return
      if (this.unwrapSelectAst(current)) {
        wrappers.push(current)
        return
      }
      Object.values(current).forEach(visit)
    }
    visit(value)
    return wrappers
  }

  private async detectCorrelation(
    ast: SqlAst,
    outerAliases: Set<string>,
    context?: any
  ): Promise<QueryDataflowCorrelation | undefined> {
    if (!outerAliases.size) return undefined
    const localAliases = this.collectLocalAliases(ast)
    const outerReferences = this.collectImmediateColumnReferences(ast).filter((reference) => {
      const table = this.normalizeIdentifier(reference['table'])
      return Boolean(table) && outerAliases.has(table) && !localAliases.has(table)
    })
    if (!outerReferences.length) return undefined

    const conditions: string[] = []
    const candidates = [
      ...this.flattenAnd(ast['where']),
      ...((ast['from'] as SqlAst[] | undefined) || []).flatMap((source) => this.flattenAnd(source['on']))
    ]
    for (const candidate of candidates) {
      if (!this.containsOuterReference(candidate, outerAliases, localAliases)) continue
      try {
        conditions.push(await this.sqlParser.expressionToSql(candidate, context, true))
      } catch {
        // Correlation remains known even if this dialect cannot serialize its predicate.
      }
    }
    if (!conditions.length) conditions.push(...outerReferences.map((reference) => this.columnReferenceLabel(reference)))
    return {
      correlated: true,
      conditions: this.unique(conditions),
      detailedAnalysisAvailable: false
    }
  }

  private containsOuterReference(value: unknown, outer: Set<string>, local: Set<string>): boolean {
    return this.collectImmediateColumnReferences(value).some((reference) => {
      const table = this.normalizeIdentifier(reference['table'])
      return Boolean(table) && outer.has(table) && !local.has(table)
    })
  }

  private collectImmediateColumnReferences(value: unknown): SqlAst[] {
    const references: SqlAst[] = []
    const visit = (current: unknown, root = false): void => {
      if (Array.isArray(current)) {
        current.forEach((entry) => visit(entry))
        return
      }
      if (!this.isRecord(current)) return
      if (!root && this.unwrapSelectAst(current)) return
      if (current['type'] === 'column_ref') references.push(current)
      Object.entries(current).forEach(([key, entry]) => {
        if (key !== 'with' && key !== '_next') visit(entry)
      })
    }
    visit(value, true)
    return references
  }

  private containsImmediateNodeType(value: unknown, type: string): boolean {
    const visit = (current: unknown): boolean => {
      if (Array.isArray(current)) return current.some(visit)
      if (!this.isRecord(current)) return false
      if (this.unwrapSelectAst(current)) return false
      if (current['type'] === type) return true
      return Object.values(current).some(visit)
    }
    return visit(value)
  }

  private collectLocalAliases(ast: SqlAst): Set<string> {
    const aliases = new Set<string>()
    const from = Array.isArray(ast['from']) ? ast['from'] as SqlAst[] : []
    from.forEach((source) => {
      const visibleName = this.identifierText(source['as']) || this.identifierText(source['table'])
      if (visibleName) aliases.add(this.normalizeIdentifier(visibleName))
    })
    return aliases
  }

  private collectCteDependencies(ast: SqlAst, ctes: Map<string, CteDefinition>): string[] {
    const dependencies: string[] = []
    const from = Array.isArray(ast['from']) ? ast['from'] as SqlAst[] : []
    from.forEach((source) => {
      if (source['expr']) return
      const definition = ctes.get(this.normalizeIdentifier(source['table']))
      if (definition) dependencies.push(definition.name)
    })
    if (this.isRecord(ast['_next'])) dependencies.push(...this.collectCteDependencies(ast['_next'], ctes))
    return this.unique(dependencies)
  }

  private resolveCteReferences(ast: SqlAst, state: PlannerState, resolving: string[] = []): SqlAst {
    const result = this.clone(ast)
    result['with'] = null
    if (Array.isArray(result['from'])) {
      result['from'] = (result['from'] as SqlAst[]).map((source) => {
        const resolvedSource = this.clone(source)
        const nestedAst = this.unwrapSelectAst(resolvedSource['expr'])
        if (nestedAst) {
          resolvedSource['expr']['ast'] = this.resolveCteReferences(nestedAst, state, resolving)
          return resolvedSource
        }
        const tableName = this.identifierText(resolvedSource['table'])
        const definition = !resolvedSource['db'] ? state.ctes.get(this.normalizeIdentifier(tableName)) : undefined
        if (!definition) return resolvedSource
        const normalizedName = this.normalizeIdentifier(definition.name)
        if (resolving.includes(normalizedName)) throw new QueryDataflowUnsupportedError('recursiveCte')
        const definitionAst = this.resolveCteReferences(definition.ast, state, [...resolving, normalizedName])
        const { join, on } = resolvedSource
        return {
          prefix: null,
          expr: { ast: definitionAst, parentheses: true },
          as: resolvedSource['as'] || definition.name,
          ...(join ? { join } : {}),
          ...(on ? { on: this.resolveNestedCteReferences(on, state, resolving) } : {})
        }
      })
    }
    ;['columns', 'where', 'groupby', 'having', 'orderby'].forEach((key) => {
      result[key] = this.resolveNestedCteReferences(result[key], state, resolving)
    })
    if (this.isRecord(result['_next'])) result['_next'] = this.resolveCteReferences(result['_next'], state, resolving)
    return result
  }

  private resolveNestedCteReferences(value: unknown, state: PlannerState, resolving: string[]): unknown {
    if (Array.isArray(value)) return value.map((entry) => this.resolveNestedCteReferences(entry, state, resolving))
    if (!this.isRecord(value)) return value
    const result = this.clone(value)
    if (this.isRecord(result['ast']) && result['ast']['type'] === 'select') {
      result['ast'] = this.resolveCteReferences(result['ast'], state, resolving)
      return result
    }
    Object.keys(result).forEach((key) => {
      result[key] = this.resolveNestedCteReferences(result[key], state, resolving)
    })
    return result
  }

  private buildUnionPrefix(branches: SqlAst[], operators: QueryDataflowUnionOperator[], count: number): SqlAst {
    const root = this.clone(branches[0])
    let cursor = root
    for (let index = 1; index < count; index++) {
      cursor['set_op'] = operators[index - 1] === 'union-all' ? 'union all' : 'union'
      cursor['_next'] = this.clone(branches[index])
      cursor = cursor['_next']
    }
    return root
  }

  private async buildInDistinctCount(
    ast: SqlAst,
    state: PlannerState
  ): Promise<QueryDataflowDiagnosticQuery | undefined> {
    const columns = Array.isArray(ast['columns']) ? ast['columns'] as SqlAst[] : []
    if (columns.length !== 1 || this.isStarColumn(columns[0])) return undefined
    const aliased = this.resolveCteReferences(ast, state)
    ;(aliased['columns'] as SqlAst[])[0]['as'] = IN_VALUE_ALIAS
    const subquerySql = this.trimSqlTerminator(await this.sqlParser.sqlify(aliased, state.context, true))
    return this.diagnostic([
      `SELECT COUNT(*) AS ${COUNT_ALIAS}`,
      'FROM (',
      `SELECT DISTINCT ${IN_VALUE_ALIAS}`,
      `FROM (${subquerySql}) AS DBOLT_IN_SOURCE`,
      ') AS DBOLT_DISTINCT_VALUES'
    ].join('\n'), 1)
  }

  private async buildOutputCountQuery(ast: SqlAst, context?: any): Promise<QueryDataflowDiagnosticQuery> {
    const outputAst = this.clone(ast)
    outputAst['orderby'] = null
    outputAst['limit'] = null
    outputAst['top'] = null
    const outputSql = this.trimSqlTerminator(await this.sqlParser.sqlify(outputAst, context, true))
    return this.diagnostic(`SELECT COUNT(*) AS ${COUNT_ALIAS}\nFROM (${outputSql}) AS DBOLT_BLOCK_OUTPUT`, 1)
  }

  private async createLegacyPlanForComposite(
    root: QueryDataflowNestedPlan,
    ast: SqlAst,
    state: PlannerState
  ): Promise<QueryDataflowPlan> {
    return {
      source: root.label,
      countFrom: await this.buildOutputCountQuery(this.resolveCteReferences(ast, state), state.context),
      joins: [],
      dependencies: root.dependencies,
      projections: []
    }
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
      for: null,
      _next: null,
      set_op: null
    }
    const probeSql = await this.sqlParser.sqlify(probeAst, context, true)
    const fromIndex = probeSql.toUpperCase().indexOf(' FROM ')
    if (fromIndex < 0) throw new QueryDataflowUnsupportedError('invalidSql')
    return probeSql.slice(fromIndex + 1)
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
      multipleKeyCount: this.diagnostic(
        `SELECT COUNT(*) AS ${MULTIPLE_KEYS_ALIAS}\nFROM (\n${matchingKeys}\n) AS DBOLT_MULTIPLE_KEY_GROUPS`,
        1
      ),
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
    const rightNames = new Set([
      this.normalizeIdentifier(source['as']),
      this.normalizeIdentifier(source['table'])
    ].filter(Boolean))
    const left = comparisons[0]['left'] as SqlAst
    const right = comparisons[0]['right'] as SqlAst
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
    const rowsProducedByMatches = joinType === 'left' ? Math.max(0, after - unmatched) : after
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

  private countPlanProbes(plan: QueryDataflowNestedPlan): number {
    if (plan.correlation || plan.unsupportedReason) return 0
    if (plan.union) {
      return plan.union.branches.reduce((count, branch) => count + this.countPlanProbes(branch), 0) +
        plan.union.operations.filter((operation) => Boolean(operation.countAfter)).length
    }
    if (!plan.linear) return 0
    const linear = plan.linear
    let count = 1 + linear.joins.reduce((total, join) => total + 2 + (join.multipleKeyCount ? 2 : 0), 0)
    if (linear.where) count++
    if (linear.group) count++
    if (linear.sourceBlock) count += this.countPlanProbes(linear.sourceBlock)
    linear.joins.forEach((join) => {
      if (join.inputBlock) count += this.countPlanProbes(join.inputBlock)
    })
    linear.where?.subqueries.forEach((subquery) => {
      count += this.countPlanProbes(subquery.block) + (subquery.distinctCount ? 1 : 0)
    })
    linear.projections.forEach((subquery) => count += this.countPlanProbes(subquery.block))
    return count
  }

  private assignCteConsumers(ctes: QueryDataflowNestedPlan[], root: QueryDataflowNestedPlan): void {
    const blocks = [...ctes.flatMap((cte) => this.flattenPlans(cte)), ...this.flattenPlans(root)]
    ctes.forEach((cte) => {
      const name = this.normalizeIdentifier(cte.label)
      cte.consumedBy = this.unique(blocks
        .filter((block) => block.id !== cte.id && block.dependencies.some((dependency) =>
          this.normalizeIdentifier(dependency) === name
        ))
        .map((block) => block.kind === 'main' ? 'MAIN QUERY' : block.label))
    })
  }

  private flattenPlans(plan: QueryDataflowNestedPlan): QueryDataflowNestedPlan[] {
    const plans = [plan]
    if (plan.union) plan.union.branches.forEach((branch) => plans.push(...this.flattenPlans(branch)))
    if (plan.linear?.sourceBlock) plans.push(...this.flattenPlans(plan.linear.sourceBlock))
    plan.linear?.joins.forEach((join) => {
      if (join.inputBlock) plans.push(...this.flattenPlans(join.inputBlock))
    })
    plan.linear?.where?.subqueries.forEach((subquery) => plans.push(...this.flattenPlans(subquery.block)))
    plan.linear?.projections.forEach((subquery) => plans.push(...this.flattenPlans(subquery.block)))
    return plans
  }

  private unsupportedBlock(id: string, options: BlockOptions, reason: string): QueryDataflowNestedPlan {
    return {
      id,
      kind: options.kind,
      label: options.label,
      alias: options.alias,
      dependencies: [],
      consumedBy: [],
      unsupportedReason: reason
    }
  }

  private displaySource(source: SqlAst): string {
    if (this.unwrapSelectAst(source['expr'])) {
      const alias = this.identifierText(source['as'])
      return alias ? `SUBQUERY · ${alias}` : 'SUBQUERY'
    }
    return this.tableLabel(source)
  }

  private tableLabel(source: SqlAst): string {
    const table = this.identifierText(source['table'])
    const alias = this.identifierText(source['as'])
    return alias && alias.toLowerCase() !== table.toLowerCase() ? `${table} · ${alias}` : table
  }

  private subqueryLabel(usage: QueryDataflowSubqueryUsage): string {
    if (usage === 'where-in') return 'IN SUBQUERY'
    if (usage === 'where-exists') return 'EXISTS SUBQUERY'
    if (usage === 'select-scalar') return 'SCALAR SUBQUERY'
    return 'SUBQUERY'
  }

  private groupByColumns(groupBy: unknown): SqlAst[] {
    if (!this.isRecord(groupBy)) return []
    return Array.isArray(groupBy['columns']) ? groupBy['columns'] as SqlAst[] : []
  }

  private isStarColumn(column: SqlAst): boolean {
    return this.identifierText(column?.['expr']?.['column']) === '*'
  }

  private functionName(value: unknown): string {
    if (typeof value === 'string') return value.toUpperCase()
    if (!this.isRecord(value)) return ''
    const names = value['name']
    if (Array.isArray(names)) return names.map((name) => this.identifierText(name)).join('.').toUpperCase()
    return this.identifierText(value).toUpperCase()
  }

  private columnReferenceLabel(reference: SqlAst): string {
    const table = this.identifierText(reference['table'])
    const column = this.identifierText(reference['column'])
    return [table, column].filter(Boolean).join('.')
  }

  private unwrapSelectAst(value: unknown): SqlAst | null {
    if (!this.isRecord(value)) return null
    if (value['type'] === 'select') return value
    if (this.isRecord(value['ast']) && value['ast']['type'] === 'select') return value['ast']
    if (this.isRecord(value['stmt'])) return this.unwrapSelectAst(value['stmt'])
    return null
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

  private throwIfCanceled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Query dataflow analysis canceled.', 'AbortError')
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private diagnostic(sql: string, maxRows: number): QueryDataflowDiagnosticQuery {
    return { sql, maxRows }
  }

  private normalizeIdentifier(value: unknown): string {
    return this.identifierText(value).toLowerCase()
  }

  private identifierText(value: unknown): string {
    if (typeof value === 'string') return value
    if (this.isRecord(value)) return this.identifierText(value['value'] ?? value['expr'] ?? value['column'])
    return ''
  }

  private readNumber(row: Record<string, unknown> | undefined, key: string): number {
    const number = Number(this.readValue(row, key) ?? 0)
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

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value)) return value.length > 0
    if (this.isRecord(value)) return Object.values(value).some((entry) => this.hasValue(entry))
    return Boolean(value)
  }

  private async safeSqlify(ast: SqlAst, context?: any): Promise<string> {
    try {
      return this.trimSqlTerminator(await this.sqlParser.sqlify(ast, context, true))
    } catch {
      return ''
    }
  }

  private trimSqlTerminator(sql: string): string {
    return sql.trim().replace(/;+$/, '')
  }

  private unique<T>(values: T[]): T[] {
    return [...new Set(values)]
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  private isRecord(value: unknown): value is SqlAst {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
