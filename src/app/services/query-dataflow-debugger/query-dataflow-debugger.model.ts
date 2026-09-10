export type QueryDataflowStageKind = 'from' | 'join' | 'where'
export type QueryDataflowJoinType = 'inner' | 'left'
export type QueryDataflowFinding =
  | 'cardinality-increase'
  | 'rows-removed'
  | 'many-unmatched'
  | 'possible-one-to-many'

export interface QueryDataflowKeyExample {
  key: string
  matches: number
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
  findings: QueryDataflowFinding[]
}

export interface QueryDataflowAnalysis {
  stages: QueryDataflowStage[]
  analyzedSql: string
  durationMs: number
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
}

export interface QueryDataflowPlan {
  source: string
  countFrom: QueryDataflowDiagnosticQuery
  joins: QueryDataflowJoinPlan[]
  where?: {
    condition: string
    countAfter: QueryDataflowDiagnosticQuery
  }
}

export class QueryDataflowUnsupportedError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'QueryDataflowUnsupportedError'
  }
}
