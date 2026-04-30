import { Injectable } from '@angular/core'
import { IDatasource, IGetRowsParams } from 'ag-grid-community'

@Injectable({
  providedIn: 'root'
})
export class QueryResultGridDataSourceService {
  create(rows: any[]): IDatasource {
    const sourceRows = rows || []

    return {
      rowCount: sourceRows.length,
      getRows: (params: IGetRowsParams) => {
        const startRow = Math.max(0, params.startRow)
        const endRow = Math.min(sourceRows.length, params.endRow)
        const rowsThisBlock = sourceRows.slice(startRow, endRow)

        params.successCallback(rowsThisBlock, sourceRows.length)
      }
    }
  }
}
