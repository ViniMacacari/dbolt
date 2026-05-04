import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { QueryDiffResult, QueryVersionDiffService } from '../../../services/query-version-diff/query-version-diff.service'
import { QuerySaveService, SavedQuery, SavedQueryVersion } from '../../../services/query-save/query-save.service'

@Component({
  selector: 'app-query-version-compare',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-version-compare.component.html',
  styleUrl: './query-version-compare.component.scss'
})
export class QueryVersionCompareComponent implements OnChanges {
  @Input() tabInfo: any
  @Output() editRequested = new EventEmitter<{ source: 'current' | 'version', query: SavedQuery, version: SavedQueryVersion }>()
  @Output() restoreRequested = new EventEmitter<{ query: SavedQuery, version: SavedQueryVersion }>()

  query!: SavedQuery
  version!: SavedQueryVersion
  diff: QueryDiffResult = {
    lines: [],
    added: 0,
    removed: 0,
    unchanged: 0
  }

  constructor(
    private diffService: QueryVersionDiffService,
    private querySave: QuerySaveService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['tabInfo']) return

    this.query = this.tabInfo?.info?.query
    this.version = this.tabInfo?.info?.version

    if (!this.query || !this.version) {
      this.diff = {
        lines: [],
        added: 0,
        removed: 0,
        unchanged: 0
      }
      return
    }

    this.diff = this.diffService.buildDiff(this.query.sql, this.version.sql)
  }

  formatDate(value?: string): string {
    return this.querySave.formatDate(value)
  }

  editCurrent(): void {
    this.editRequested.emit({ source: 'current', query: this.query, version: this.version })
  }

  editVersionCopy(): void {
    this.editRequested.emit({ source: 'version', query: this.query, version: this.version })
  }

  restoreVersion(): void {
    this.restoreRequested.emit({ query: this.query, version: this.version })
  }
}
