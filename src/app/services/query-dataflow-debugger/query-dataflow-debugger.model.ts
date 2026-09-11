export type QueryDataflowStageKind =
  | 'from'
  | 'join'
  | 'where'
  | 'group'
  | 'aggregation'
  | 'distinct'
  | 'projection'

export type QueryDataflowJoinType = 'inner' | 'left'
export type QueryDataflowBlockKind = 'main' | 'cte' | 'subquery' | 'union' | 'branch'
export type QueryDataflowSubqueryUsage = 'from' | 'join' | 'where-in' | 'where-exists' | 'select-scalar'
export type QueryDataflowUnionOperator = 'union' | 'union-all'
export type QueryDataflowFinding =
  | 'cardinality-increase'
  | 'rows-removed'
  | 'many-unmatched'
  | 'possible-one-to-many'

export interface QueryDataflowKeyExample {
  key: string
  matches: number
}

export interface QueryDataflowCorrelation {
  correlated: true
  conditions: string[]
  outerRows?: number
  detailedAnalysisAvailable: false
}

export interface QueryDataflowStage {
  id: string
  kind: QueryDataflowStageKind
  label: string
  source?: string
  joinType?: QueryDataflowJoinType
  condition?: string
  rowsBefore?: number
  rowsAfter: number
  matched?: number
  unmatched?: number
  fanOut?: number
  multipleKeyCount?: number
  multipleKeyExamples?: QueryDataflowKeyExample[]
  inputs?: QueryDataflowBlock[]
  findings: QueryDataflowFinding[]
}

export interface QueryDataflowUnionStep {
  id: string
  operator: QueryDataflowUnionOperator
  leftRows: number
  rightRows: number
  rowsBeforeDistinct: number
  rowsAfter: number
  duplicatesRemoved: number
}

export interface QueryDataflowBlock {
  id: string
  kind: QueryDataflowBlockKind
  label: string
  alias?: string
  sql?: string
  stages: QueryDataflowStage[]
  branches?: QueryDataflowBlock[]
  unionSteps?: QueryDataflowUnionStep[]
  dependencies: string[]
  consumedBy: string[]
  outputRows?: number
  correlation?: QueryDataflowCorrelation
  unsupportedReason?: string
}

export interface QueryDataflowAnalysis {
  /** Main-query stages retained for callers that consume the original linear API. */
  stages: QueryDataflowStage[]
  root: QueryDataflowBlock
  ctes: QueryDataflowBlock[]
  analyzedSql: string
  durationMs: number
}

export interface QueryDataflowNestedPlan {
  id: string
  kind: QueryDataflowBlockKind
  label: string
  alias?: string
  sql?: string
  linear?: QueryDataflowPlan
  union?: QueryDataflowUnionPlan
  dependencies: string[]
  consumedBy: string[]
  correlation?: QueryDataflowCorrelation
  unsupportedReason?: string
}

export interface QueryDataflowSubqueryPlan {
  usage: QueryDataflowSubqueryUsage
  operator?: 'IN' | 'NOT IN' | 'EXISTS' | 'NOT EXISTS'
  block: QueryDataflowNestedPlan
  distinctCount?: QueryDataflowDiagnosticQuery
}

export interface QueryDataflowProgress {
  completed: number
  total: number
  stage: string
}

export interface QueryDataflowDiagnosticQuery {
  sql: string
  maxRows: number
}

export interface QueryDataflowJoinPlan {
  label: string
  source: string
  joinType: QueryDataflowJoinType
  condition: string
  countAfter: QueryDataflowDiagnosticQuery
  matchState: QueryDataflowDiagnosticQuery
  multipleKeyCount?: QueryDataflowDiagnosticQuery
  multipleKeyExamples?: QueryDataflowDiagnosticQuery
  inputBlock?: QueryDataflowNestedPlan
}

export interface QueryDataflowPlan {
  source: string
  countFrom: QueryDataflowDiagnosticQuery
  joins: QueryDataflowJoinPlan[]
  sourceBlock?: QueryDataflowNestedPlan
  dependencies: string[]
  where?: {
    condition: string
    countAfter: QueryDataflowDiagnosticQuery
    subqueries: QueryDataflowSubqueryPlan[]
    existsOperator?: 'EXISTS' | 'NOT EXISTS'
  }
  group?: {
    condition: string
    countAfter: QueryDataflowDiagnosticQuery
    kind: 'group' | 'aggregation'
  }
  projections: QueryDataflowSubqueryPlan[]
}

export interface QueryDataflowUnionOperationPlan {
  operator: QueryDataflowUnionOperator
  countAfter?: QueryDataflowDiagnosticQuery
}

export interface QueryDataflowUnionPlan {
  branches: QueryDataflowNestedPlan[]
  operations: QueryDataflowUnionOperationPlan[]
}

export interface QueryDataflowDocumentPlan extends QueryDataflowPlan {
  root: QueryDataflowNestedPlan
  ctes: QueryDataflowNestedPlan[]
}

export class QueryDataflowUnsupportedError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'QueryDataflowUnsupportedError'
  }
}
