import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { QueryDiffResult, QueryVersionDiffService } from '../../../services/query-version-diff/query-version-diff.service'
import { QuerySaveService } from '../../../services/query-save/query-save.service'
import { QueryCompareTarget } from '../../../services/query-compare-target/query-compare-target.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-query-version-compare',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-version-compare.component.html',
  styleUrl: './query-version-compare.component.scss'
})
export class QueryVersionCompareComponent implements OnChanges {
  @Input() tabInfo: any
  @Output() editRequested = new EventEmitter<{ target: QueryCompareTarget }>()
  @Output() restoreRequested = new EventEmitter<{ target: QueryCompareTarget }>()

  left!: QueryCompareTarget
  right!: QueryCompareTarget
  diff: QueryDiffResult = {
    lines: [],
    added: 0,
    removed: 0,
    unchanged: 0
  }

  constructor(
    private diffService: QueryVersionDiffService,
    private querySave: QuerySaveService,
    private language: AppLanguageService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['tabInfo']) return

    this.left = this.tabInfo?.info?.left
    this.right = this.tabInfo?.info?.right

    if (!this.left || !this.right) {
      this.diff = {
        lines: [],
        added: 0,
        removed: 0,
        unchanged: 0
      }
      return
    }

    this.diff = this.diffService.buildDiff(this.left.sql, this.right.sql)
  }

  formatDate(value?: string): string {
    return this.querySave.formatDate(value)
  }

  editTarget(target: QueryCompareTarget): void {
    this.editRequested.emit({ target })
  }

  restoreTarget(target: QueryCompareTarget): void {
    if (!target.version) return
    this.restoreRequested.emit({ target })
  }

  targetLabel(target: QueryCompareTarget): string {
    if (target.version) {
      return this.t('queryLibrary.versionName', {
        name: target.query.name,
        version: target.version.id
      })
    }

    return target.label
  }

  targetSubtitle(target: QueryCompareTarget): string {
    return target.subtitle === 'Queries'
      ? this.t('queryLibrary.root')
      : target.subtitle
  }

  savedLabel(target: QueryCompareTarget): string {
    return this.t('queryCompare.saved', {
      date: this.formatDate(target.version?.changedAt)
    })
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
