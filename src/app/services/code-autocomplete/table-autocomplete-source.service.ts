import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'
import { type TableAutocompleteMatchMode } from '../app-settings/app-settings.service'

export interface TableAutocompleteItem {
  name: string
  type: 'table' | 'view'
}

interface TableAutocompleteSuggestionOptions {
  shouldCancel?: () => boolean
}

@Injectable({
  providedIn: 'root'
})
export class TableAutocompleteSourceService {
  private readonly cache = new Map<string, Promise<TableAutocompleteItem[]>>()
  private readonly chunks = new Map<string, TableAutocompleteItem[][]>()
  private readonly chunkSize = 2000

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
        this.chunks.delete(cacheKey)
        throw error
      }))
    }

    const tables = await (this.cache.get(cacheKey) || Promise.resolve([]))
    this.ensureChunks(cacheKey, tables)

    return tables
  }

  async getTableSuggestions(
    context: any,
    fragment: string,
    matchMode: TableAutocompleteMatchMode,
    limit: number,
    options: TableAutocompleteSuggestionOptions = {}
  ): Promise<TableAutocompleteItem[]> {
    const tables = await this.getTables(context)
    if (options.shouldCancel?.()) return []

    const normalizedFragment = fragment.toLowerCase()
    const tableChunks = this.getChunks(context, tables)
    const candidates: TableAutocompleteItem[] = []
    const candidateLimit = Math.max(limit * 4, limit)

    for (let index = 0; index < tableChunks.length; index++) {
      if (options.shouldCancel?.()) return []

      const chunk = tableChunks[index]
      for (const table of chunk) {
        if (this.matchesTableName(table.name, normalizedFragment, matchMode)) {
          candidates.push(table)
        }
      }

      if (candidates.length > candidateLimit) {
        this.trimCandidates(candidates, normalizedFragment, candidateLimit)
      }

      if (index < tableChunks.length - 1) {
        await this.yieldToMainThread()
      }
    }

    if (options.shouldCancel?.()) return []

    this.trimCandidates(candidates, normalizedFragment, limit)
    return candidates
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
        this.chunks.delete(ensuredCacheKey)
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

  private getChunks(context: any, tables: TableAutocompleteItem[]): TableAutocompleteItem[][] {
    const cacheKey = this.buildCacheKey(context)
    const cachedChunks = this.chunks.get(cacheKey)
    if (cachedChunks) return cachedChunks

    return this.ensureChunks(cacheKey, tables)
  }

  private ensureChunks(cacheKey: string, tables: TableAutocompleteItem[]): TableAutocompleteItem[][] {
    const cachedChunks = this.chunks.get(cacheKey)
    if (cachedChunks) return cachedChunks

    const chunks = this.chunkTables(tables)
    this.chunks.set(cacheKey, chunks)

    return chunks
  }

  private chunkTables(tables: TableAutocompleteItem[]): TableAutocompleteItem[][] {
    const chunks: TableAutocompleteItem[][] = []

    for (let index = 0; index < tables.length; index += this.chunkSize) {
      chunks.push(tables.slice(index, index + this.chunkSize))
    }

    return chunks
  }

  private matchesTableName(
    tableName: string,
    fragment: string,
    matchMode: TableAutocompleteMatchMode
  ): boolean {
    if (!fragment) return true

    const normalizedTableName = tableName.toLowerCase()
    return matchMode === 'fuzzy'
      ? this.fuzzyMatches(normalizedTableName, fragment)
      : normalizedTableName.includes(fragment)
  }

  private fuzzyMatches(tableName: string, fragment: string): boolean {
    let tableIndex = 0

    for (const char of fragment) {
      tableIndex = tableName.indexOf(char, tableIndex)
      if (tableIndex === -1) {
        return false
      }

      tableIndex++
    }

    return true
  }

  private trimCandidates(
    candidates: TableAutocompleteItem[],
    fragment: string,
    limit: number
  ): void {
    candidates.sort((left, right) => this.compareTables(left.name, right.name, fragment))

    if (candidates.length > limit) {
      candidates.length = limit
    }
  }

  private compareTables(left: string, right: string, fragment: string): number {
    const leftRank = this.getMatchRank(left, fragment)
    const rightRank = this.getMatchRank(right, fragment)

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return left.localeCompare(right)
  }

  private getMatchRank(tableName: string, fragment: string): number {
    if (!fragment) return 0

    const normalizedTableName = tableName.toLowerCase()
    const matchIndex = normalizedTableName.indexOf(fragment)

    if (matchIndex === 0) return 0
    if (this.hasIdentifierPartStartingWith(normalizedTableName, fragment)) return 1
    if (matchIndex > 0) return 2
    return 3
  }

  private hasIdentifierPartStartingWith(tableName: string, fragment: string): boolean {
    if (!fragment || fragment.includes('_') || fragment.includes('.')) {
      return false
    }

    return tableName
      .split(/[^a-z0-9]+/)
      .some((part) => part.startsWith(fragment))
  }

  private async yieldToMainThread(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
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
