import { Injectable } from '@angular/core'
import { GetDbschemaService } from '../db-info/get-dbschema.service'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionContextService } from '../connection-context/connection-context.service'

@Injectable({
  providedIn: 'root'
})
export class RunQueryService {

  constructor(
    private dbSchemas: GetDbschemaService,
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  queryLines: number | null = null
  queryColumns: string[] = []

  async runSQL(sql: string, lines: number | null = null, dbContext: any = null): Promise<any> {
    const selectedContext = dbContext || this.dbSchemas.getSelectedSchemaDB()
    const db = await this.connectionContext.ensureContext(selectedContext)

    try {
      return await this.executeSQL(db, sql, lines)
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        throw error
      }

      this.connectionContext.forgetContext(db.connectionKey)
      const reconnectedDb = await this.connectionContext.ensureContext(db, true)
      return await this.executeSQL(reconnectedDb, sql, lines)
    }
  }

  private async executeSQL(db: any, sql: string, lines: number | null): Promise<any> {
    const response: any = await this.IAPI.post(`/api/${db.sgbd}/${db.version}/query`, {
      sql,
      maxLines: lines,
      connectionKey: db.connectionKey
    })

    this.queryLines = response.totalRows
    this.queryColumns = response.columns || []

    if (response?.result && Array.isArray(response.result)) {
      return response.result
    } else if (response.success) {
      return [{
        Status: 'Success',
        Message: response.message || 'Command executed successfully.'
      }]
    } else {
      throw new Error('Invalid data response.')
    }
  }

  private isConnectionError(error: any): boolean {
    const errorText = [
      error?.message,
      error?.error,
      error?.code,
      error?.sqlState
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return [
      'not connected',
      'connection is closed',
      'connection closed',
      'connection terminated',
      'connection lost',
      'server closed the connection',
      'client has encountered a connection error',
      'protocol_connection_lost',
      'econnreset',
      'econnrefused'
    ].some((connectionError) => errorText.includes(connectionError))
  }

  getQueryLines(): number | null {
    return this.queryLines
  }

  getQueryColumns(): string[] {
    return this.queryColumns
  }
}
