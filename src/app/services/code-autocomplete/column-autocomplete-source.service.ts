import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'

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

    const normalizedTable = this.normalizeTableName(tableName)
    if (!normalizedTable) {
      return []
    }

    const ensuredContext = await this.connectionContext.ensureContext(context)
    const cacheKey = this.buildCacheKey(ensuredContext, normalizedTable)

    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.fetchColumns(ensuredContext, normalizedTable).catch((error) => {
        this.cache.delete(cacheKey)
        throw error
      }))
    }

    return this.cache.get(cacheKey) || []
  }

  private async fetchColumns(context: any, tableName: string): Promise<ColumnAutocompleteItem[]> {
    const queryString = this.connectionContext.toQueryString(context)
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

  private normalizeTableName(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ''

    const lastPart = this.splitIdentifierParts(trimmed).pop() || trimmed

    return this.normalizeIdentifier(lastPart)
  }

  private splitIdentifierParts(value: string): string[] {
    const parts: string[] = []
    let current = ''
    let quote: string | null = null

    for (let index = 0; index < value.length; index++) {
      const char = value[index]

      if (quote) {
        current += char

        if ((quote === ']' && char === ']') || char === quote) {
          quote = null
        }
        continue
      }

      if (char === '"' || char === '`' || char === '[') {
        quote = char === '[' ? ']' : char
        current += char
        continue
      }

      if (char === '.') {
        parts.push(current)
        current = ''
        continue
      }

      current += char
    }

    parts.push(current)
    return parts
  }

  private normalizeIdentifier(value: string): string {
    return value
      .trim()
      .replace(/^[`"\[]+/, '')
      .replace(/[`"\]]+$/, '')
  }

  private buildCacheKey(context: any, tableName: string): string {
    return [
      context.sgbd,
      context.version,
      context.connId,
      context.name,
      context.host,
      context.port,
      context.database,
      context.schema,
      tableName
    ].filter((part) => part !== undefined && part !== null).join(':')
  }
}
