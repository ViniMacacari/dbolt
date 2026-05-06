import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'

export interface TableAutocompleteItem {
  name: string
  type: 'table' | 'view'
}

@Injectable({
  providedIn: 'root'
})
export class TableAutocompleteSourceService {
  private readonly cache = new Map<string, Promise<TableAutocompleteItem[]>>()

  constructor(
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  async getTables(context: any): Promise<TableAutocompleteItem[]> {
    if (!context?.sgbd && !context?.connId && !context?.connectionId) {
      return []
    }

    const cacheKey = this.buildCacheKey(context)
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.fetchTablesForContext(context, cacheKey).catch((error) => {
        this.cache.delete(cacheKey)
        throw error
      }))
    }

    return this.cache.get(cacheKey) || []
  }

  private async fetchTablesForContext(context: any, originalCacheKey: string): Promise<TableAutocompleteItem[]> {
    const ensuredContext = await this.connectionContext.ensureContext(context)
    const ensuredCacheKey = this.buildCacheKey(ensuredContext)

    if (ensuredCacheKey !== originalCacheKey) {
      const cachedTables = this.cache.get(ensuredCacheKey)
      if (cachedTables) {
        return cachedTables
      }

      const fetchPromise = this.fetchTablesWithReconnect(ensuredContext)
      this.cache.set(ensuredCacheKey, fetchPromise)

      try {
        return await fetchPromise
      } catch (error) {
        this.cache.delete(ensuredCacheKey)
        throw error
      }
    }

    return this.fetchTablesWithReconnect(ensuredContext)
  }

  private async fetchTablesWithReconnect(context: any): Promise<TableAutocompleteItem[]> {
    try {
      return await this.fetchTables(context)
    } catch (error: any) {
      if (!this.connectionContext.isConnectionError(error)) {
        throw error
      }

      this.connectionContext.forgetContext(context.connectionKey)
      const reconnectedContext = await this.connectionContext.ensureContext(context, true)
      return await this.fetchTables(reconnectedContext)
    }
  }

  private async fetchTables(context: any): Promise<TableAutocompleteItem[]> {
    const queryString = this.connectionContext.toQueryString(context)
    const response: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/list-table-objects${queryString}`)

    if (response?.success === false) {
      throw new Error(response.error || response.message || 'Could not load table names.')
    }

    const tableRows = this.rowsToAutocompleteItems(response?.tables, 'table')
    const viewRows = this.rowsToAutocompleteItems(response?.views, 'view')
    const dataRows = this.rowsToAutocompleteItems(
      (response?.data || []).filter((item: any) => item?.type === 'table' || item?.type === 'view')
    )

    return this.uniqueObjects([...tableRows, ...viewRows, ...dataRows])
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  private rowsToAutocompleteItems(rows: any, fallbackType?: 'table' | 'view'): TableAutocompleteItem[] {
    if (!Array.isArray(rows)) return []

    return rows
      .map((row): TableAutocompleteItem => {
        const name = String(row?.name || row?.NAME || '').trim()
        const rowType = String(row?.type || row?.TYPE || fallbackType || 'table').toLowerCase()
        const type: TableAutocompleteItem['type'] = rowType === 'view' ? 'view' : 'table'

        return { name, type }
      })
      .filter((item) => item.name)
  }

  private uniqueObjects(rows: TableAutocompleteItem[]): TableAutocompleteItem[] {
    const objects = new Map<string, TableAutocompleteItem>()

    rows.forEach((row) => {
      const key = row.name.toLowerCase()
      if (!objects.has(key)) {
        objects.set(key, row)
      }
    })

    return Array.from(objects.values())
  }

  private buildCacheKey(context: any): string {
    return [
      context.sgbd,
      context.version,
      context.connId,
      context.name,
      context.host,
      context.port,
      context.database,
      context.schema
    ].filter((part) => part !== undefined && part !== null).join(':')
  }
}
