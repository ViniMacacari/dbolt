import { Injectable } from '@angular/core'
import { GetDbschemaService } from '../db-info/get-dbschema.service'
import { InternalApiService } from '../requests/internal-api.service'

@Injectable({
  providedIn: 'root'
})
export class RunQueryService {

  constructor(
    private dbSchemas: GetDbschemaService,
    private IAPI: InternalApiService
  ) { }

  async runSQL(sql: string, lines: number | null = null): Promise<any> {
    const db = this.dbSchemas.getSelectedSchemaDB()

    const response: any = await this.IAPI.post(`/api/${db.sgbd}/${db.version}/query`, {
      sql,
      maxLines: lines
    })

    if (response?.result && Array.isArray(response.result)) {
      return response.result
    } else if (response.success) {
      return [{
        sucess: true
      }]
    } else {
      throw new Error('Invalid data response.')
    }
  }
}