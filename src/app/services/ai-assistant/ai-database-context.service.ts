import { Injectable } from '@angular/core'

import {
  AiDatabaseObjectSummary,
  AiReadonlyDatabaseContext,
  AiReadonlyDatabaseToolContext
} from './ai-assistant.model'

const MAX_OBJECTS_PER_TYPE = 120

@Injectable({
  providedIn: 'root'
})
export class AiDatabaseContextService {
  buildReadonlyContext(selectedSchemaDB: unknown, dbSchemasData: unknown, tabInfo: unknown): AiReadonlyDatabaseContext {
    const schemaData = this.asRecord(dbSchemasData)
    const selectedContext = this.asRecord(selectedSchemaDB)
    const connection = this.asRecord(schemaData['connection'])
    const activeTab = this.asRecord(tabInfo)

    const tables = this.getObjectList(schemaData['tables'])
    const views = this.getObjectList(schemaData['views'])
    const procedures = this.getObjectList(schemaData['procedures'])
    const indexes = this.getObjectList(schemaData['indexes'])

    return {
      readonly: true,
      connection: {
        name: this.readString(connection, selectedContext, 'name'),
        sgbd: this.readString(connection, selectedContext, 'sgbd'),
        version: this.readString(connection, selectedContext, 'version'),
        host: this.readString(connection, selectedContext, 'host'),
        port: this.readStringOrNumber(connection, selectedContext, 'port'),
        database: this.readString(connection, selectedContext, 'database'),
        schema: this.readString(connection, selectedContext, 'schema'),
        user: this.readString(connection, selectedContext, 'user')
      },
      activeTab: {
        name: typeof activeTab['name'] === 'string' ? activeTab['name'] : undefined,
        type: typeof activeTab['type'] === 'string' ? activeTab['type'] : undefined
      },
      objectCounts: {
        tables: tables.length,
        views: views.length,
        procedures: procedures.length,
        indexes: indexes.length
      },
      objects: {
        tables: tables.slice(0, MAX_OBJECTS_PER_TYPE),
        views: views.slice(0, MAX_OBJECTS_PER_TYPE),
        procedures: procedures.slice(0, MAX_OBJECTS_PER_TYPE),
        indexes: indexes.slice(0, MAX_OBJECTS_PER_TYPE)
      },
      truncated: [tables, views, procedures, indexes].some((items) => items.length > MAX_OBJECTS_PER_TYPE)
    }
  }

  hasDatabaseContext(selectedSchemaDB: unknown, dbSchemasData: unknown): boolean {
    const selectedContext = this.asRecord(selectedSchemaDB)
    const schemaData = this.asRecord(dbSchemasData)

    return Boolean(
      selectedContext['database'] ||
      selectedContext['schema'] ||
      schemaData['connection'] ||
      this.asArray(schemaData['tables']).length ||
      this.asArray(schemaData['views']).length ||
      this.asArray(schemaData['procedures']).length
    )
  }

  buildReadonlyToolContext(selectedSchemaDB: unknown, dbSchemasData: unknown): AiReadonlyDatabaseToolContext {
    const schemaData = this.asRecord(dbSchemasData)
    const selectedContext = this.asRecord(selectedSchemaDB)
    const connection = this.asRecord(schemaData['connection'])

    return {
      sgbd: this.readString(connection, selectedContext, 'sgbd'),
      version: this.readString(connection, selectedContext, 'version'),
      database: this.readString(connection, selectedContext, 'database'),
      schema: this.readString(connection, selectedContext, 'schema'),
      connectionKey: this.readString(connection, selectedContext, 'connectionKey')
    }
  }

  private getObjectList(value: unknown): AiDatabaseObjectSummary[] {
    return this.asArray(value)
      .map((item) => this.normalizeObject(item))
      .filter((item): item is AiDatabaseObjectSummary => Boolean(item))
  }

  private normalizeObject(item: unknown): AiDatabaseObjectSummary | null {
    const objectRecord = this.asRecord(item)
    const name = this.firstString(objectRecord, ['name', 'NAME', 'tableName', 'TABLE_NAME', 'objectName', 'OBJECT_NAME'])

    if (!name) {
      return null
    }

    return {
      name,
      type: this.firstString(objectRecord, ['type', 'TYPE', 'objectType', 'OBJECT_TYPE', 'index_type']),
      table: this.firstString(objectRecord, ['table', 'TABLE_NAME', 'tableName'])
    }
  }

  private readString(primary: Record<string, unknown>, fallback: Record<string, unknown>, key: string): string | undefined {
    return typeof primary[key] === 'string'
      ? primary[key] as string
      : typeof fallback[key] === 'string'
        ? fallback[key] as string
        : undefined
  }

  private readStringOrNumber(
    primary: Record<string, unknown>,
    fallback: Record<string, unknown>,
    key: string
  ): string | number | undefined {
    const primaryValue = primary[key]
    const fallbackValue = fallback[key]

    if (typeof primaryValue === 'string' || typeof primaryValue === 'number') return primaryValue
    if (typeof fallbackValue === 'string' || typeof fallbackValue === 'number') return fallbackValue

    return undefined
  }

  private firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }

    return undefined
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  }
}
