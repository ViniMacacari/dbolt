import { Injectable } from '@angular/core'
import { SavedQuery, SavedQueryDbSchema, SavedQueryVersion } from '../query-save/query-save.service'
import { AppLanguageService } from '../language/app-language.service'

export type QueryCompareTargetKind = 'query' | 'version'

export interface QueryCompareTarget {
  id: string
  kind: QueryCompareTargetKind
  label: string
  subtitle: string
  sql: string
  query: SavedQuery
  version?: SavedQueryVersion
  dbSchema?: SavedQueryDbSchema
  folderPath?: string
  persisted: boolean
}

@Injectable({
  providedIn: 'root'
})
export class QueryCompareTargetService {
  constructor(private language: AppLanguageService) { }

  createQueryTarget(query: SavedQuery): QueryCompareTarget {
    return {
      id: `query-${query.id}`,
      kind: 'query',
      label: query.name,
      subtitle: query.folderPath || this.t('queryLibrary.root'),
      sql: query.sql || '',
      query,
      dbSchema: query.dbSchema,
      folderPath: query.folderPath || '',
      persisted: true
    }
  }

  createVersionTarget(query: SavedQuery, version: SavedQueryVersion): QueryCompareTarget {
    return {
      id: `query-${query.id}-version-${version.id}`,
      kind: 'version',
      label: this.t('queryLibrary.versionName', { name: query.name, version: version.id }),
      subtitle: query.folderPath || this.t('queryLibrary.root'),
      sql: version.sql || '',
      query,
      version,
      dbSchema: version.dbSchema || query.dbSchema,
      folderPath: version.folderPath || query.folderPath || '',
      persisted: false
    }
  }

  buildTabId(left: QueryCompareTarget, right: QueryCompareTarget): string {
    return `compare-${left.id}-with-${right.id}`
  }

  buildTabName(left: QueryCompareTarget, right: QueryCompareTarget): string {
    return `${this.shorten(left.label)} <> ${this.shorten(right.label)}`
  }

  private shorten(value: string): string {
    const normalizedValue = String(value || 'Query')
    return normalizedValue.length > 24 ? `${normalizedValue.slice(0, 21)}...` : normalizedValue
  }

  private t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
