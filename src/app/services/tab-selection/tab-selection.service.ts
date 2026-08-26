import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class TabSelectionService {
  toggle(selection: Set<any>, tab: any, activeTab: any): Set<any> {
    if (!tab) return selection

    const updatedSelection = new Set(selection)

    if (updatedSelection.size === 0 && activeTab && activeTab !== tab) {
      updatedSelection.add(activeTab)
    }

    if (updatedSelection.has(tab)) {
      updatedSelection.delete(tab)
    } else {
      updatedSelection.add(tab)
    }

    if (updatedSelection.size === 1 && activeTab && updatedSelection.has(activeTab)) {
      updatedSelection.clear()
    }

    return updatedSelection
  }

  includeForContextMenu(selection: Set<any>, tab: any): Set<any> {
    if (!tab || selection.size === 0 || selection.has(tab)) return selection

    return new Set([...selection, tab])
  }

  resolve(tabs: any[], selection: Set<any>): any[] {
    return (tabs || []).filter((tab) => selection.has(tab) && !tab?.closing)
  }

  prune(tabs: any[], selection: Set<any>): Set<any> {
    return new Set((tabs || []).filter((tab) => selection.has(tab)))
  }
}
