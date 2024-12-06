import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class GetDbschemaService {
  constructor() { }

  dbAndSchemas: any

  setSelectedSchemaDB(data: any) {
    this.dbAndSchemas = data
  }

  getSelectedSchemaDB(): any {
    return this.dbAndSchemas
  }
}