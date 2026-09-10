import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core'
import { ButtonComponent } from '../elements/button/button.component'
import { AppLanguageService } from '../../services/language/app-language.service'
import {
  QueryDataflowAnalysis,
  QueryDataflowFinding,
  QueryDataflowProgress,
  QueryDataflowStage,
  QueryDataflowUnsupportedError
} from '../../services/query-dataflow-debugger/query-dataflow-debugger.model'
import { QueryDataflowDebuggerService } from '../../services/query-dataflow-debugger/query-dataflow-debugger.service'

@Component({
  selector: 'app-query-dataflow-debugger',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './query-dataflow-debugger.component.html',
  styleUrl: './query-dataflow-debugger.component.scss'
})
export class QueryDataflowDebuggerComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() sql = ''
  @Input() dbContext: any
  @Input() queryName = ''
  @Output() closed = new EventEmitter<void>()
  @ViewChild('dialog') dialog!: ElementRef<HTMLElement>

  analysis: QueryDataflowAnalysis | null = null
  progress: QueryDataflowProgress | null = null
  loading = false
  errorMessage = ''
  closing = false
  expandedStages = new Set<string>()

  private abortController?: AbortController
  private closeTimer?: ReturnType<typeof setTimeout>
  private requestId = 0
  private destroyed = false
  private previousFocus = document.activeElement as HTMLElement | null

  constructor(
    private debuggerService: QueryDataflowDebuggerService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    void this.runAnalysis()
  }

  ngAfterViewInit(): void {
    this.dialog.nativeElement.focus()
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.abortController?.abort()
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.previousFocus?.focus()
  }

  async runAnalysis(): Promise<void> {
    this.abortController?.abort()
    const controller = new AbortController()
    const requestId = ++this.requestId
    this.abortController = controller
    this.loading = true
    this.analysis = null
    this.errorMessage = ''
    this.progress = null
    this.expandedStages.clear()

    try {
      const analysis = await this.debuggerService.analyze(
        this.sql,
        this.dbContext,
        controller.signal,
        (progress) => {
          if (requestId === this.requestId && !this.destroyed) this.progress = progress
        }
      )
      if (requestId !== this.requestId || this.destroyed) return

      this.analysis = analysis
      const firstRelevantJoin = analysis.stages.find((stage) =>
        stage.kind === 'join' && stage.findings.length > 0
      )
      if (firstRelevantJoin) this.expandedStages.add(firstRelevantJoin.id)
    } catch (error: unknown) {
      if (requestId !== this.requestId || this.destroyed) return
      this.errorMessage = this.resolveErrorMessage(error)
    } finally {
      if (requestId === this.requestId && !this.destroyed) this.loading = false
    }
  }

  cancel(): void {
    if (!this.loading) return
    this.abortController?.abort()
  }

  close(): void {
    if (this.closing || this.destroyed) return
    this.abortController?.abort()
    this.closing = true
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180
    this.closeTimer = setTimeout(() => this.closed.emit(), duration)
  }

  toggleStage(stage: QueryDataflowStage): void {
    if (stage.kind !== 'join') return
    if (this.expandedStages.has(stage.id)) {
      this.expandedStages.delete(stage.id)
      return
    }
    this.expandedStages.add(stage.id)
  }

  isExpanded(stage: QueryDataflowStage): boolean {
    return this.expandedStages.has(stage.id)
  }

  stageTitle(stage: QueryDataflowStage): string {
    if (stage.kind === 'join') {
      return this.t(stage.joinType === 'left' ? 'queryDataflow.leftJoin' : 'queryDataflow.innerJoin')
    }
    return stage.label
  }

  rowDelta(stage: QueryDataflowStage): number {
    return stage.rowsBefore === undefined ? 0 : stage.rowsAfter - stage.rowsBefore
  }

  removedRows(stage: QueryDataflowStage): number {
    if (stage.kind === 'join' && stage.joinType === 'inner') return stage.unmatched || 0
    if (stage.kind === 'where') return Math.max(0, (stage.rowsBefore || 0) - stage.rowsAfter)
    return 0
  }

  formatNumber(value: number | undefined): string {
    return new Intl.NumberFormat(this.language.getCurrentLanguage()).format(value || 0)
  }

  formatFanOut(value: number | undefined): string {
    return `${new Intl.NumberFormat(this.language.getCurrentLanguage(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0)}x`
  }

  formatDuration(durationMs: number): string {
    if (durationMs < 1000) return `${Math.round(durationMs)} ms`
    return `${(durationMs / 1000).toFixed(1)} s`
  }

  findingLabel(finding: QueryDataflowFinding): string {
    return this.t(`queryDataflow.finding.${finding}`)
  }

  onKeydown(event: KeyboardEvent): void {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], [tabindex="0"]'
    ))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.dialog.nativeElement)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof QueryDataflowUnsupportedError) {
      return this.t(`queryDataflow.unsupported.${error.reason}`)
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return this.t('queryDataflow.canceled')
    }
    if (error instanceof Error && error.message === 'query-dataflow-timeout') {
      return this.t('queryDataflow.timeout')
    }
    if (error && typeof error === 'object') {
      const detail = (error as Record<string, unknown>)['error'] || (error as Record<string, unknown>)['message']
      if (typeof detail === 'string' && detail.trim()) return detail
    }
    return this.t('queryDataflow.error')
  }
}
