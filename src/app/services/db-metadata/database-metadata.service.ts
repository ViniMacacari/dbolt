import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'

export interface TableMetadataResult {
  columns: any[]
  keys: any[]
  indexes: any[]
  ddl: string
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseMetadataService {
  private requestQueues = new Map<string, Promise<void>>()

  constructor(
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  async loadTableMetadata(schemaDb: any, elementName: string): Promise<TableMetadataResult> {
    return this.request(
      schemaDb,
      (context) => this.fetchTableMetadata(context, elementName),
      (result) => !result.ddl
    )
  }

  async loadProcedureDDL(schemaDb: any, procedureName: string): Promise<string> {
    return this.request(
      schemaDb,
      (context) => this.fetchProcedureDDL(context, procedureName),
      (result) => !result
    )
  }

  private async request<T>(
    schemaDb: any,
    fetch: (context: any) => Promise<T>,
    shouldRetry: (result: T) => boolean
  ): Promise<T> {
    const context = await this.connectionContext.ensureContext(schemaDb)

    try {
      const result = await this.runQueued(context, () => fetch(context))
      if (!shouldRetry(result)) return result

      const retriedResult = await this.runQueued(context, () => fetch(context))
      if (!shouldRetry(retriedResult)) return retriedResult

      return await this.reconnectAndFetch(context, fetch)
    } catch (error: any) {
      if (!this.connectionContext.isConnectionError(error)) {
        throw this.toError(error)
      }

      return this.reconnectAndFetch(context, fetch)
    }
  }

  private async reconnectAndFetch<T>(context: any, fetch: (context: any) => Promise<T>): Promise<T> {
    try {
      this.connectionContext.forgetContext(context?.connectionKey)
      const reconnectedContext = await this.connectionContext.ensureContext(context, true)

      return await this.runQueued(reconnectedContext, () => fetch(reconnectedContext))
    } catch (error: any) {
      throw this.toError(error)
    }
  }

  private async fetchTableMetadata(context: any, elementName: string): Promise<TableMetadataResult> {
    const baseUrl = this.getBaseUrl(context)
    const objectName = encodeURIComponent(elementName)
    const queryString = this.connectionContext.toQueryString(context)

    const columns = await this.get(`${baseUrl}/table-columns/${objectName}${queryString}`)
    const keys = await this.get(`${baseUrl}/table-keys/${objectName}${queryString}`)
    const indexes = await this.get(`${baseUrl}/table-indexes/${objectName}${queryString}`)
    const ddl = await this.get(`${baseUrl}/table-ddl/${objectName}${queryString}`)

    return {
      columns: columns?.data || [],
      keys: keys?.data || [],
      indexes: indexes?.data || [],
      ddl: ddl?.ddl || ''
    }
  }

  private async fetchProcedureDDL(context: any, procedureName: string): Promise<string> {
    const baseUrl = this.getBaseUrl(context)
    const objectName = encodeURIComponent(procedureName)
    const queryString = this.connectionContext.toQueryString(context)

    const response = await this.get(`${baseUrl}/procedure-ddl/${objectName}${queryString}`)

    return response?.ddl || ''
  }

  private async get(url: string): Promise<any> {
    let response: any

    try {
      response = await this.IAPI.get<any>(url)
    } catch (error: any) {
      throw this.toError(error)
    }

    if (response?.success === false) {
      throw this.toError(response)
    }

    return response
  }

  private getBaseUrl(context: any): string {
    if (!context?.sgbd || !context?.version) {
      throw new Error('No database connection selected for this tab.')
    }

    return `/api/${context.sgbd}/${context.version}`
  }

  private runQueued<T>(context: any, task: () => Promise<T>): Promise<T> {
    const connectionKey = context?.connectionKey || 'default'
    const previous = this.requestQueues.get(connectionKey) || Promise.resolve()
    const current = previous.then(task, task)
    const tail: Promise<void> = current
      .then(() => undefined, () => undefined)
      .then(() => {
        if (this.requestQueues.get(connectionKey) === tail) {
          this.requestQueues.delete(connectionKey)
        }
      })

    this.requestQueues.set(connectionKey, tail)

    return current
  }

  private toError(error: any): Error {
    if (error instanceof Error) return error

    const detail = error?.error || error?.message

    return new Error(
      typeof detail === 'string' && detail.trim()
        ? detail
        : 'The metadata request could not be completed.'
    )
  }
}
