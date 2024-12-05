import { Injectable } from '@angular/core'
import { GetDbschemaService } from '../db-info/get-dbschema.service'

@Injectable({
  providedIn: 'root'
})
export class RunQueryService {

  constructor(
    private dbSchemas: GetDbschemaService
  ) { }

  runSQL(sql: string) {

  }
}
