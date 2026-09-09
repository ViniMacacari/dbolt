import { Injectable } from '@angular/core'

import { InternalApiService } from '../requests/internal-api.service'
import { AppLanguageService } from '../language/app-language.service'
import {
  ApiResponse,
  DatabaseMemoryInterviewResult,
  DatabaseMemoryNoteInput,
  DatabaseMemoryRecord,
  DatabaseMemoryScope,
  DatabaseMemoryTurn
} from './database-memory.model'

@Injectable({
  providedIn: 'root'
})
export class DatabaseMemoryService {
  constructor(
    private internalApi: InternalApiService,
    private language: AppLanguageService
  ) { }

  buildScope(context: unknown): DatabaseMemoryScope {
    const record = context && typeof context === 'object' ? context as Record<string, unknown> : {}

    return {
      sgbd: this.readString(record['sgbd']),
      connectionName: this.readString(record['connectionName']),
      database: this.readString(record['database']),
      schema: this.readString(record['schema'])
    }
  }

  isIdentifiedScope(scope: DatabaseMemoryScope | undefined): boolean {
    if (!scope) return false

    return Boolean(
      (scope.sgbd || '').trim() ||
      (scope.connectionName || '').trim() ||
      (scope.database || '').trim() ||
      (scope.schema || '').trim()
    )
  }

  describeScope(scope: DatabaseMemoryScope | undefined): string {
    if (!scope) return ''

    return [scope.connectionName, scope.database, scope.schema]
      .map((part) => (part || '').trim())
      .filter((part) => part.length > 0)
      .join(' / ')
  }

  async getStorageFolder(): Promise<string> {
    const response = await this.internalApi.get<ApiResponse<{ path: string }>>('/api/database-memory/storage-folder')
    return response.data?.path || ''
  }

  async load(scope: DatabaseMemoryScope): Promise<DatabaseMemoryRecord> {
    return this.unwrap(await this.internalApi.post<ApiResponse<DatabaseMemoryRecord>>(
      '/api/database-memory/notes',
      { scope }
    ))
  }

  async addNotes(
    scope: DatabaseMemoryScope,
    notes: DatabaseMemoryNoteInput[],
    source: 'ai' | 'user'
  ): Promise<DatabaseMemoryRecord> {
    return this.unwrap(await this.internalApi.post<ApiResponse<DatabaseMemoryRecord>>(
      '/api/database-memory/notes/add',
      { scope, notes, source }
    ))
  }

  async updateNote(
    scope: DatabaseMemoryScope,
    noteId: string,
    update: DatabaseMemoryNoteInput
  ): Promise<DatabaseMemoryRecord> {
    return this.unwrap(await this.internalApi.put<ApiResponse<DatabaseMemoryRecord>>(
      `/api/database-memory/notes/${encodeURIComponent(noteId)}`,
      { scope, ...update }
    ))
  }

  async deleteNote(scope: DatabaseMemoryScope, noteId: string): Promise<DatabaseMemoryRecord> {
    return this.unwrap(await this.internalApi.post<ApiResponse<DatabaseMemoryRecord>>(
      `/api/database-memory/notes/${encodeURIComponent(noteId)}/delete`,
      { scope }
    ))
  }

  async clear(scope: DatabaseMemoryScope): Promise<DatabaseMemoryRecord> {
    return this.unwrap(await this.internalApi.post<ApiResponse<DatabaseMemoryRecord>>(
      '/api/database-memory/clear',
      { scope }
    ))
  }

  async runInterview(
    scope: DatabaseMemoryScope,
    messages: DatabaseMemoryTurn[],
    readonlyContext?: unknown
  ): Promise<DatabaseMemoryInterviewResult> {
    return this.unwrap(await this.internalApi.post<ApiResponse<DatabaseMemoryInterviewResult>>(
      '/api/database-memory/interview',
      {
        scope,
        messages,
        readonlyContext,
        appLanguage: this.language.getCurrentLanguage()
      }
    ))
  }

  private unwrap<T>(response: ApiResponse<T>): T {
    if (!response?.success || !response.data) {
      throw new Error(response?.message || response?.error || 'The database memory request failed.')
    }

    return response.data
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }
}
