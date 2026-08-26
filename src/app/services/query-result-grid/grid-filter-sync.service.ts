import { Injectable } from '@angular/core'

export interface GridFilterSyncState {
  isApplyingFilterModel: boolean
  isRebuildingColumns: boolean
}

@Injectable({
  providedIn: 'root'
})
export class GridFilterSyncService {
  private readonly userDrivenSources = ['columnFilter', 'quickFilter', 'advancedFilter']

  isUserFilterChange(event: any, state: GridFilterSyncState): boolean {
    if (state.isApplyingFilterModel || state.isRebuildingColumns) return false

    const source = event?.source
    if (!source) return true

    return this.userDrivenSources.includes(String(source))
  }

  sameFilterModel(left: any, right: any): boolean {
    return JSON.stringify(left || {}) === JSON.stringify(right || {})
  }

  keepsColumnDefs(currentFields: readonly string[], columns: readonly string[]): boolean {
    if (columns.length === 0 || currentFields.length === 0) return false

    return currentFields.length === columns.length &&
      currentFields.every((field, index) => field === columns[index])
  }
}
