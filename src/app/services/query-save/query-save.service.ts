import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'

export interface SavedQueryDbSchema {
  database: string
  schema: string
  sgbd?: string
  version?: string
  name?: string
  host?: string
  port?: string | number
  connId?: number
}

export interface SavedQueryVersion {
  id: number
  changedAt: string
  name: string
  sql: string
  folderPath?: string
  dbSchema?: SavedQueryDbSchema
}

export interface SavedQuery {
  id: number
  name: string
  type: string
  sql: string
  dbSchema?: SavedQueryDbSchema
  folderPath?: string
  versioningEnabled?: boolean
  createdAt?: string
  updatedAt?: string
  versions?: SavedQueryVersion[]
}

export type SavedQueryInput = Omit<SavedQuery, 'id' | 'createdAt' | 'updatedAt' | 'versions'>

interface SavedQueryResponse {
  success: boolean
  message?: string
  data?: SavedQuery
}

interface ListResponse<T> {
  success: boolean
  data: T
}

@Injectable({
  providedIn: 'root'
})
export class QuerySaveService {
  readonly maxQueryNameLength = 120

  constructor(private IAPI: InternalApiService) { }

  async loadQueries(): Promise<SavedQuery[]> {
    return await this.IAPI.get<SavedQuery[]>('/api/query/load')
  }

  async loadFolders(): Promise<string[]> {
    const response = await this.IAPI.get<ListResponse<string[]>>('/api/query/folders')
    return response.data || []
  }

  async createQuery(query: SavedQueryInput): Promise<SavedQuery> {
    const response = await this.IAPI.post<SavedQueryResponse>('/api/query/new', query)
    return this.resolveSavedQueryResponse(response)
  }

  async updateQuery(id: number, query: SavedQueryInput): Promise<SavedQuery> {
    const response = await this.IAPI.put<SavedQueryResponse>(`/api/query/${id}`, query)
    return this.resolveSavedQueryResponse(response)
  }

  async deleteQuery(id: number): Promise<void> {
    await this.IAPI.delete(`/api/query/${id}`)
  }

  async loadVersions(queryId: number): Promise<SavedQueryVersion[]> {
    const response = await this.IAPI.get<ListResponse<SavedQueryVersion[]>>(`/api/query/${queryId}/versions`)
    return response.data || []
  }

  async restoreVersion(queryId: number, versionId: number): Promise<SavedQuery> {
    const response = await this.IAPI.post<SavedQueryResponse>(`/api/query/${queryId}/versions/${versionId}/restore`, {})
    return this.resolveSavedQueryResponse(response)
  }

  formatQueryPath(query: Pick<SavedQuery, 'name' | 'folderPath'>): string {
    return [query.folderPath, query.name].filter(Boolean).join('/')
  }

  formatDate(value?: string): string {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return date.toLocaleString()
  }

  normalizeFolderPath(folderPath: string): string {
    return String(folderPath || '')
      .replace(/\\/g, '/')
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .join('/')
  }

  private resolveSavedQueryResponse(response: SavedQueryResponse): SavedQuery {
    if (response?.data) {
      return response.data
    }

    throw new Error(response?.message || 'Query was not saved')
  }
}
