import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'
import { parseMetadataTableReference } from './sql-identifier-reference'

export interface ColumnAutocompleteItem {
  name: string
  type?: string
}

@Injectable({
  providedIn: 'root'
})
export class ColumnAutocompleteSourceService {
  private readonly cache = new Map<string, Promise<ColumnAutocompleteItem[]>>()

  constructor(
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  async getColumns(context: any, tableName: string): Promise<ColumnAutocompleteItem[]> {
    if (!context?.sgbd || !context?.version) {
      return []
    }

    const tableReference = parseMetadataTableReference(tableName)
    const normalizedTable = tableReference.tableName
    if (!normalizedTable) {
      return []
    }

    const ensuredContext = await this.connectionContext.ensureContext(context)
    const cacheKey = this.buildCacheKey(ensuredContext, normalizedTable, tableReference.schema)

    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.fetchColumnsWithReconnect(
        ensuredContext,
        normalizedTable,
        tableReference.schema
      ).catch((error) => {
        this.cache.delete(cacheKey)
        throw error
      }))
    }

    return this.cache.get(cacheKey) || []
  }

  private async fetchColumnsWithReconnect(
    context: any,
    tableName: string,
    schema?: string
  ): Promise<ColumnAutocompleteItem[]> {
    try {
      return await this.fetchColumns(context, tableName, schema)
    } catch (error: any) {
      if (!this.connectionContext.isConnectionError(error)) {
        throw error
      }

      this.connectionContext.forgetContext(context.connectionKey)
      const reconnectedContext = await this.connectionContext.ensureContext(context, true)
      return await this.fetchColumns(reconnectedContext, tableName, schema)
    }
  }

  private async fetchColumns(context: any, tableName: string, schema?: string): Promise<ColumnAutocompleteItem[]> {
    const queryString = this.connectionContext.toQueryString(context, { schema })
    const response: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/table-columns/${encodeURIComponent(tableName)}${queryString}`)

    if (response?.success === false) {
      throw new Error(response.error || response.message || 'Could not load table columns.')
    }

    return (response?.data || [])
      .map((column: any) => ({
        name: String(column?.name || column?.NAME || '').trim(),
        type: String(column?.type || column?.TYPE || '').trim() || undefined
      }))
      .filter((column: ColumnAutocompleteItem) => column.name)
  }

  private buildCacheKey(context: any, tableName: string, schema?: string): string {
    return [
      context.sgbd,
      context.version,
      context.connId,
      context.name,
      context.host,
      context.port,
      context.database,
      context.schema,
      tableName,
      schema
    ].filter((part) => part !== undefined && part !== null).join(':')
  }
}
