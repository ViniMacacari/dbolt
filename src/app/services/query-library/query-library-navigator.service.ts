import { Injectable } from '@angular/core'
import type { SavedQuery } from '../query-save/query-save.service'

export interface QueryLibraryFilters {
  database: string
  queryName: string
}

export interface QueryLibraryBreadcrumbPart {
  label: string
  path: string
}

export interface QueryLibraryView {
  folders: string[]
  queries: SavedQuery[]
  breadcrumbParts: QueryLibraryBreadcrumbPart[]
  currentFolderLabel: string
  hasVisibleItems: boolean
}

export interface QueryLibraryViewOptions {
  searchAcrossFolders?: boolean
}

@Injectable({
  providedIn: 'root'
})
export class QueryLibraryNavigatorService {
  buildView(
    queries: SavedQuery[],
    folders: string[],
    currentFolderPath: string,
    filters: QueryLibraryFilters,
    options: QueryLibraryViewOptions = {}
  ): QueryLibraryView {
    const normalizedCurrentFolder = this.normalizeFolderPath(currentFolderPath)
    const searchAcrossFolders = Boolean(options.searchAcrossFolders && String(filters.queryName || '').trim())
    const visibleFolders = searchAcrossFolders ? [] : this.getVisibleFolders(queries, folders, normalizedCurrentFolder)
    const visibleQueries = this.getVisibleQueries(queries, normalizedCurrentFolder, filters, searchAcrossFolders)

    return {
      folders: visibleFolders,
      queries: visibleQueries,
      breadcrumbParts: this.getBreadcrumbParts(normalizedCurrentFolder),
      currentFolderLabel: normalizedCurrentFolder || 'Queries',
      hasVisibleItems: visibleFolders.length > 0 || visibleQueries.length > 0
    }
  }

  enterFolder(currentFolderPath: string, folderName: string): string {
    return this.normalizeFolderPath([currentFolderPath, folderName].filter(Boolean).join('/'))
  }

  parentFolder(currentFolderPath: string): string {
    const parts = this.normalizeFolderPath(currentFolderPath).split('/').filter(Boolean)
    parts.pop()

    return parts.join('/')
  }

  normalizeFolderPath(folderPath: string): string {
    return String(folderPath || '')
      .replace(/\\/g, '/')
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .join('/')
  }

  private getVisibleQueries(
    queries: SavedQuery[],
    currentFolderPath: string,
    filters: QueryLibraryFilters,
    searchAcrossFolders: boolean
  ): SavedQuery[] {
    const database = String(filters.database || '').toLowerCase()
    const queryName = String(filters.queryName || '').toLowerCase()

    return queries.filter(query => {
      const queryDatabase = String(query.dbSchema?.sgbd || '').toLowerCase()
      const queryFolderPath = this.normalizeFolderPath(query.folderPath || '')
      const normalizedQueryFolderPath = queryFolderPath.toLowerCase()
      const queryPath = [queryFolderPath, query.name].filter(Boolean).join('/').toLowerCase()

      return (searchAcrossFolders || normalizedQueryFolderPath === currentFolderPath.toLowerCase()) &&
        (!database || queryDatabase.includes(database)) &&
        (!queryName || query.name.toLowerCase().includes(queryName) || queryPath.includes(queryName))
    })
  }

  private getVisibleFolders(
    queries: SavedQuery[],
    folders: string[],
    currentFolderPath: string
  ): string[] {
    const allFolders = new Set([
      ...folders,
      ...queries
        .map(query => query.folderPath || '')
        .filter(Boolean)
    ])
    const folderNames = new Set<string>()

    for (const folderPath of allFolders) {
      const normalizedPath = this.normalizeFolderPath(folderPath)
      if (!normalizedPath) continue

      const relativePath = currentFolderPath
        ? normalizedPath.startsWith(`${currentFolderPath}/`)
          ? normalizedPath.slice(currentFolderPath.length + 1)
          : ''
        : normalizedPath

      const folderName = relativePath.split('/')[0]
      if (folderName) {
        folderNames.add(folderName)
      }
    }

    return [...folderNames].sort((left, right) => left.localeCompare(right))
  }

  private getBreadcrumbParts(currentFolderPath: string): QueryLibraryBreadcrumbPart[] {
    if (!currentFolderPath) return []

    const parts = currentFolderPath.split('/')
    return parts.map((label, index) => ({
      label,
      path: parts.slice(0, index + 1).join('/')
    }))
  }
}
