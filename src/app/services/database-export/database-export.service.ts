import { Injectable } from '@angular/core'

import { ConnectionContextService } from '../connection-context/connection-context.service'
import { InternalApiService } from '../requests/internal-api.service'
import { SavedConnection } from '../resolve-connections/connections.service'
import {
  DatabaseExportConnectionState,
  DatabaseExportContext,
  DatabaseExportEstimate,
  DatabaseExportObject,
  DatabaseExportOptions,
  DatabaseExportResult,
  DatabaseExportStreamEvent,
  DatabaseExportTarget
} from './database-export.model'

@Injectable({
  providedIn: 'root'
})
export class DatabaseExportService {
  constructor(
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  async connectAndLoadTargets(connection: SavedConnection): Promise<DatabaseExportConnectionState> {
    const candidateContext = this.connectionContext.createContext({
        connId: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        sgbd: connection.database,
        version: connection.version,
        connectionKey: this.createExportConnectionKey()
      }) as DatabaseExportContext
    let context: DatabaseExportContext | null = null

    try {
      context = await this.connectionContext.ensureContext(candidateContext) as DatabaseExportContext
      const response: any = await this.IAPI.get(
        `/api/${encodeURIComponent(connection.database)}/${encodeURIComponent(connection.version)}` +
        `/list-databases-and-schemas?connectionKey=${encodeURIComponent(context.connectionKey)}`
      )

      if (response?.success === false) {
        throw new Error(response.error || response.message || 'Could not load databases and schemas.')
      }

      return {
        connection,
        context,
        targets: this.normalizeTargets(response?.data)
      }
    } catch (error: unknown) {
      await this.disconnect(context || candidateContext).catch(() => undefined)
      throw error
    }
  }

  async disconnect(context: DatabaseExportContext): Promise<void> {
    try {
      const response: any = await this.IAPI.post('/api/database-export/disconnect', context)
      if (response?.success === false) {
        throw new Error(response.error || response.message || 'Could not close the database export connection.')
      }
    } finally {
      this.connectionContext.forgetContext(context.connectionKey)
    }
  }

  async loadObjects(
    state: DatabaseExportConnectionState,
    database: string,
    schema: string
  ): Promise<{ context: DatabaseExportContext; objects: DatabaseExportObject[] }> {
    const context: DatabaseExportContext = {
      ...state.context,
      database: database || undefined,
      schema: schema || undefined
    }
    const setSchemaResponse: any = await this.IAPI.post(
      `/api/${encodeURIComponent(state.connection.database)}/${encodeURIComponent(state.connection.version)}/set-schema`,
      {
        database: database || undefined,
        schema: schema || undefined,
        connectionKey: context.connectionKey
      }
    )

    if (setSchemaResponse?.success === false) {
      throw new Error(setSchemaResponse.error || setSchemaResponse.message || 'Could not select the database schema.')
    }

    const response: any = await this.IAPI.get(
      `/api/${encodeURIComponent(state.connection.database)}/${encodeURIComponent(state.connection.version)}` +
      `/list-objects?connectionKey=${encodeURIComponent(context.connectionKey)}`
    )

    if (response?.success === false) {
      throw new Error(response.error || response.message || 'Could not load database objects.')
    }

    return {
      context,
      objects: this.normalizeObjects(response?.data)
    }
  }

  async estimate(
    context: DatabaseExportContext,
    objects: DatabaseExportObject[],
    includeData: boolean
  ): Promise<DatabaseExportEstimate> {
    const response: any = await this.IAPI.post('/api/database-export/estimate', {
      context,
      objects: this.toSelection(objects),
      includeData
    })

    if (response?.success === false || !response?.data) {
      throw new Error(response?.error || response?.message || 'Could not estimate the database export.')
    }

    return response.data as DatabaseExportEstimate
  }

  async chooseDestination(suggestedFileName: string): Promise<string | null> {
    if (!window.dboltFileSystem) {
      throw new Error('Database export destination selection is only available in the desktop application.')
    }

    const result = await window.dboltFileSystem.chooseDatabaseExportPath(suggestedFileName)
    return result.canceled ? null : result.filePath
  }

  async run(
    context: DatabaseExportContext,
    objects: DatabaseExportObject[],
    options: DatabaseExportOptions,
    outputPath: string,
    onEvent: (event: DatabaseExportStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<DatabaseExportResult | null> {
    let result: DatabaseExportResult | null = null

    await this.IAPI.postStream<DatabaseExportStreamEvent>(
      '/api/database-export/stream',
      {
        context,
        objects: this.toSelection(objects),
        outputPath,
        ...options,
        batchSize: 250
      },
      (event) => {
        onEvent(event)
        if (event.type === 'result') result = event.data
        if (event.type === 'error') throw new Error(event.message)
      },
      signal
    )

    return result
  }

  private createExportConnectionKey(): string {
    return `db-export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }

  private normalizeTargets(value: unknown): DatabaseExportTarget[] {
    if (!Array.isArray(value)) return []

    return value
      .map((target) => ({
        database: String(target?.database || ''),
        schemas: Array.isArray(target?.schemas)
          ? target.schemas.map((schema: unknown) => String(schema || '')).filter(Boolean)
          : []
      }))
      .filter((target) => Boolean(target.database))
  }

  private normalizeObjects(value: unknown): DatabaseExportObject[] {
    if (!Array.isArray(value)) return []

    const validTypes = new Set([
      'table', 'view', 'materialized_view', 'procedure', 'function', 'trigger',
      'event', 'sequence', 'synonym', 'type', 'domain', 'index'
    ])

    return value.reduce<DatabaseExportObject[]>((objects, object) => {
      const name = String(object?.name || '')
      const type = String(object?.type || '').toLowerCase() as DatabaseExportObject['type']
      if (!name || !validTypes.has(type)) return objects

      objects.push({
        id: object?.id ? String(object.id) : undefined,
        name,
        type,
        table: object?.table ? String(object.table) : undefined,
        index_type: object?.index_type ? String(object.index_type) : undefined
      })
      return objects
    }, [])
  }

  private toSelection(objects: DatabaseExportObject[]): Array<{
    name: string
    type: string
    table?: string
  }> {
    return objects.map((object) => ({
      name: object.name,
      type: object.type,
      table: object.table
    }))
  }
}
