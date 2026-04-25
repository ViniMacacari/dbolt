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

  async runSQL(sql: string, lines: number | null = null, dbContext: any = null): Promise<any> {
    const db = await this.connectionContext.ensureContext(
      dbContext || this.dbSchemas.getSelectedSchemaDB()
    )

    const response: any = await this.IAPI.post(`/api/${db.sgbd}/${db.version}/query`, {
      sql,
      maxLines: lines,
      connectionKey: db.connectionKey
    })

    this.queryLines = response.totalRows

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

  getQueryLines(): number | null {
    return this.queryLines
  }
}
