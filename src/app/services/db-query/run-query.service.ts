import { Injectable } from '@angular/core'
import { GetDbschemaService } from '../db-info/get-dbschema.service'
import { InternalApiService } from '../requests/internal-api.service'

@Injectable({
  providedIn: 'root'
})
export class RunQueryService {

  constructor(
    private dbSchemas: GetDbschemaService
  ) { }

  runSQL(sql: string) {
    const db = this.dbSchemas.getSelectedSchemaDB()

    console.log(sql, db)
  }
}