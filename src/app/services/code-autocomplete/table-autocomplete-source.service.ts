import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'

export interface TableAutocompleteItem {
  name: string
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
    if (!context?.sgbd || !context?.version) {
      return []
    }

    const ensuredContext = await this.connectionContext.ensureContext(context)
    const cacheKey = this.buildCacheKey(ensuredContext)

    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.fetchTables(ensuredContext).catch((error) => {
        this.cache.delete(cacheKey)
        throw error
      }))
    }

    return this.cache.get(cacheKey) || []
  }

  private async fetchTables(context: any): Promise<TableAutocompleteItem[]> {
    const queryString = this.connectionContext.toQueryString(context)
    const response: any = await this.IAPI.get(`/api/${context.sgbd}/${context.version}/list-table-objects${queryString}`)

    if (response?.success === false) {
      throw new Error(response.error || response.message || 'Could not load table names.')
    }

    const tableRows = response?.tables?.length
      ? response.tables
      : (response?.data || []).filter((item: any) => item?.type === 'table')

    return this.uniqueNames(tableRows)
      .map((name) => ({ name }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  private uniqueNames(rows: any[]): string[] {
    const names = new Set<string>()

    rows.forEach((row) => {
      const name = String(row?.name || row?.NAME || '').trim()
      if (name) {
        names.add(name)
      }
    })

    return Array.from(names)
  }

  private buildCacheKey(context: any): string {
    return [
      context.sgbd,
      context.version,
      context.host,
      context.port,
      context.database,
      context.schema
    ].filter((part) => part !== undefined && part !== null).join(':')
  }
}
