import { ComponentFixture, TestBed } from '@angular/core/testing'
import { AppLanguageService } from '../../services/language/app-language.service'
import { QueryDataflowAnalysis } from '../../services/query-dataflow-debugger/query-dataflow-debugger.model'
import { QueryDataflowDebuggerService } from '../../services/query-dataflow-debugger/query-dataflow-debugger.service'
import { QueryDataflowDebuggerComponent } from './query-dataflow-debugger.component'

describe('QueryDataflowDebuggerComponent', () => {
  let fixture: ComponentFixture<QueryDataflowDebuggerComponent>

  const analysis: QueryDataflowAnalysis = {
    analyzedSql: 'SELECT id FROM clientes UNION SELECT id FROM leads',
    durationMs: 42,
    stages: [],
    ctes: [{
      id: 'cte-0',
      kind: 'cte',
      label: 'clientes',
      stages: [{
        id: 'cte-from',
        kind: 'from',
        label: 'FROM',
        source: 'OCRD',
        rowsAfter: 80,
        findings: []
      }],
      dependencies: [],
      consumedBy: ['MAIN QUERY'],
      outputRows: 80
    }],
    root: {
      id: 'main-1',
      kind: 'main',
      label: 'MAIN QUERY',
      stages: [],
      dependencies: ['clientes'],
      consumedBy: [],
      outputRows: 95,
      branches: [{
        id: 'branch-2',
        kind: 'branch',
        label: 'BRANCH 1',
        stages: [],
        dependencies: ['clientes'],
        consumedBy: [],
        outputRows: 80
      }, {
        id: 'branch-3',
        kind: 'branch',
        label: 'BRANCH 2',
        stages: [],
        dependencies: [],
        consumedBy: [],
        outputRows: 30
      }],
      unionSteps: [{
        id: 'union-0',
        operator: 'union',
        leftRows: 80,
        rightRows: 30,
        rowsBeforeDistinct: 110,
        rowsAfter: 95,
        duplicatesRemoved: 15
      }]
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryDataflowDebuggerComponent],
      providers: [{
        provide: QueryDataflowDebuggerService,
        useValue: { analyze: jasmine.createSpy('analyze').and.resolveTo(analysis) }
      }, {
        provide: AppLanguageService,
        useValue: {
          translate: (key: string): string => key,
          getCurrentLanguage: (): string => 'pt-BR'
        }
      }]
    }).compileComponents()

    fixture = TestBed.createComponent(QueryDataflowDebuggerComponent)
    fixture.componentInstance.sql = analysis.analyzedSql
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })

  it('renders CTE dependencies and UNION branch metrics', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || ''
    expect(text).toContain('clientes')
    expect(text).toContain('queryDataflow.usedBy queryDataflow.mainQuery')
    expect(text).toContain('queryDataflow.branch 1')
    expect(text).toContain('UNION')
    expect(text).toContain('15')
  })

  it('expands a CTE block to reveal its internal linear flow', () => {
    const host = fixture.nativeElement as HTMLElement
    const cteButton = host.querySelector<HTMLButtonElement>(
      '.cte-section .block-summary'
    )!
    const cteBody = host.querySelector<HTMLElement>('.cte-section .block-body-collapse')!
    expect(cteBody.classList).not.toContain('expanded')
    expect(cteBody.getAttribute('aria-hidden')).toBe('true')

    cteButton.click()
    fixture.detectChanges()

    expect(cteBody.classList).toContain('expanded')
    expect(cteBody.getAttribute('aria-hidden')).toBe('false')
    expect(host.textContent).toContain('OCRD')

    cteButton.click()
    fixture.detectChanges()

    expect(cteBody.classList).not.toContain('expanded')
    expect(cteBody.getAttribute('aria-hidden')).toBe('true')
  })
})
