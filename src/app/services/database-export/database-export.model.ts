import { SavedConnection } from '../resolve-connections/connections.service'

export type DatabaseExportObjectType =
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'event'
  | 'sequence'
  | 'synonym'
  | 'type'
  | 'domain'
  | 'index'
export type DatabaseExportRisk = 'low' | 'medium' | 'high' | 'extreme'

export interface DatabaseExportTarget {
  database: string
  schemas: string[]
}

export interface DatabaseExportContext {
  sgbd: string
  version: string
  database?: string
  schema?: string
  connectionKey: string
  connId: number
  name: string
}

export interface DatabaseExportObject {
  id?: string
  name: string
  type: DatabaseExportObjectType
  table?: string
  index_type?: string
}

export interface DatabaseExportTableEstimate {
  name: string
  estimatedRows: number | null
  estimatedBytes: number | null
}

export interface DatabaseExportEstimate {
  risk: DatabaseExportRisk
  acknowledgementRequired: boolean
  estimatedRows: number
  estimatedBytes: number
  unknownTableCount: number
  selectedObjectCount: number
  selectedTableCount: number
  tables: DatabaseExportTableEstimate[]
  warnings: string[]
}

export interface DatabaseExportOptions {
  includeStructure: boolean
  includeData: boolean
  addDropStatements: boolean
  acknowledgedLargeExport: boolean
}

export interface DatabaseExportProgress {
  stage: 'preparing' | 'structure' | 'data' | 'finalizing'
  completedObjects: number
  totalObjects: number
  currentObject?: string
  rowsWritten: number
  estimatedRows: number
  bytesWritten: number
}

export interface DatabaseExportResult {
  filePath: string
  rowsWritten: number
  objectsWritten: number
  bytesWritten: number
  completedAt: string
}

export type DatabaseExportStreamEvent =
  | { type: 'progress', data: DatabaseExportProgress }
  | { type: 'result', data: DatabaseExportResult }
  | { type: 'cancelled', message: string }
  | { type: 'error', message: string }

export interface DatabaseExportConnectionState {
  connection: SavedConnection
  context: DatabaseExportContext
  targets: DatabaseExportTarget[]
}
