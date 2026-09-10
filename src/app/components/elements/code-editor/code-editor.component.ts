import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy, OnChanges, SimpleChanges, HostListener } from '@angular/core'
import { CommonModule } from '@angular/common'
import * as monaco from 'monaco-editor'
import { Subscription } from 'rxjs'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { ToastComponent } from '../../toast/toast.component'
import { TableQueryComponent } from "../table-query/table-query.component"
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { ConnectionContextService } from '../../../services/connection-context/connection-context.service'
import { AppSettingsService, SqlHighlightColors, SqlHighlightMode } from '../../../services/app-settings/app-settings.service'
import { SqlTableAutocompleteService } from '../../../services/code-autocomplete/sql-table-autocomplete.service'
import { SqlCodeFormatterService } from '../../../services/code-formatting/sql-code-formatter.service'
import { SqlSyntaxMonacoMarkersService } from '../../../services/sql-validation/sql-syntax-monaco-markers.service'
import { QuerySaveService, SavedQuery, SavedQueryInput } from '../../../services/query-save/query-save.service'
import { KeyboardShortcutService } from '../../../services/keyboard-shortcuts/keyboard-shortcut.service'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { AppPlatformService } from '../../../services/platform/app-platform.service'
import { AppThemeService } from '../../../services/theme/app-theme.service'
import { AppThemePaletteService } from '../../../services/theme/app-theme-palette.service'
import { QueryVersionDiffService, QueryChangeHunk } from '../../../services/query-version-diff/query-version-diff.service'
import { SaveVersionMessageComponent } from '../../modal/save-version-message/save-version-message.component'
import { QueryHistoryComponent } from '../../modal/query-history/query-history.component'
import { selectSqlStatementAtCursor } from '../../../utils/sql-statement-selection'
import {
  normalizeTableReferenceForMetadata,
  parseMetadataTableReference
} from '../../../services/code-autocomplete/sql-identifier-reference'

let sqlTokenizerConfigured = false

interface SqlNavigationToken {
  value: string
  lower: string
  start: number
  end: number
}

interface SqlNavigationLink {
  target: {
    name: string
    schema?: string
    initialView?: 'columns'
  }
  range: monaco.IRange
}

const CHANGE_PEEK_PADDING = 8
const CHANGE_PEEK_CLOSE_MS = 170
const CHANGE_PEEK_OPEN_MS = 190

@Component({
  selector: 'app-code-editor',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss'],
  imports: [TableQueryComponent, CommonModule, ToastComponent, SaveQueryComponent, SaveVersionMessageComponent, QueryHistoryComponent],
})
export class CodeEditorComponent implements AfterViewChecked, OnDestroy, OnChanges {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<SavedQuery>()
  @Output() savedQuery = new EventEmitter<any>()
  @Output() objectInfoRequested = new EventEmitter<any>()
  @Output() objectSummaryRequested = new EventEmitter<any>()
  @Output() newFileRequested = new EventEmitter<{ sql: string, name?: string, context?: any }>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any
  @Input() active: boolean = false

  @ViewChild('editorContainer') editorContainer!: ElementRef
  @ViewChild('editorShell') editorShell!: ElementRef<HTMLElement>
  @ViewChild('codeEditorPanel') codeEditorPanel!: ElementRef<HTMLDivElement>
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(TableQueryComponent) tableQuery?: TableQueryComponent
  @ViewChild(SaveQueryComponent) saveConnection!: SaveQueryComponent

  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private initialized = false
  private autocompleteDisposable?: monaco.IDisposable
  private syntaxValidationDisposable?: monaco.IDisposable
  private settingsSubscription?: Subscription
  private themeSubscription?: Subscription
  private languageSubscription?: Subscription
  private shortcutDisposers: Array<() => void> = []
  private editorActionDisposables: monaco.IDisposable[] = []
  private editorMouseDisposables: monaco.IDisposable[] = []
  private sqlNavigationDecorationIds: string[] = []
  private sqlChangeDecorationIds: string[] = []
  private sqlChangeHunks: QueryChangeHunk[] = []
  private changePeekZoneId: string | null = null
  private changePeekLine: number | null = null
  private changePeekZone: monaco.editor.IViewZone | null = null
  private changePeekNode: HTMLElement | null = null
  private changePeekFrame: number | null = null
  private changePeekClosing: boolean = false
  isVersionMessageOpen: boolean = false
  isHistoryOpen = false
  historySql = ''

  openHistory(): void {
    this.historySql = this.editor?.getValue() ?? this.sqlContent
    this.isHistoryOpen = true
  }
  private sqlChangeDecorationTimer: ReturnType<typeof setTimeout> | null = null
  private sqlNavigationModifierPressed = false
  private sqlSummaryModifierPressed = false
  private lastMousePosition: monaco.Position | null = null
  private readonly sqlNavigationReservedWords = new Set([
    'as',
    'by',
    'case',
    'cross',
    'delete',
    'distinct',
    'else',
    'end',
    'from',
    'full',
    'group',
    'having',
    'inner',
    'join',
    'left',
    'limit',
    'not',
    'offset',
    'on',
    'order',
    'outer',
    'right',
    'select',
    'union',
    'where'
  ])
  private readonly defaultResultHeight = 300
  private readonly minimumResultHeight = 120
  private readonly minimumEditorHeight = 120

  isSaveAsOpen: boolean = false
  cacheSql: string = ''
  queryReponse: any[] = []
  queryColumns: string[] = []
  queryResultOpen: boolean = false
  isLoadingQuery: boolean = false
  queryError: string = ''
  queryLines: number = 50
  queryFetchSize: number = 50
  queryResultHeight: number = 300
  previousQueryResultHeight: number = 300
  queryResultExpanded: boolean = false
  queryResultIsSelect: boolean = false
  isLoadingMore: boolean = false
  maxResultLines: number | null = 0
  queryExecutionTimeMs: number | null = null
  queryResultPanelOpening: boolean = false
  queryResultContentEntering: boolean = false

  private resultPanelAnimationTimer: ReturnType<typeof setTimeout> | null = null
  private resultContentAnimationTimer: ReturnType<typeof setTimeout> | null = null
  private resultContentAnimationFrame: number | null = null

  dataSave: any = {}

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private connectionContext: ConnectionContextService,
    private appSettings: AppSettingsService,
    private tableAutocomplete: SqlTableAutocompleteService,
    private sqlFormatter: SqlCodeFormatterService,
    private sqlSyntaxMarkers: SqlSyntaxMonacoMarkersService,
    private querySave: QuerySaveService,
    private keyboardShortcuts: KeyboardShortcutService,
    private language: AppLanguageService,
    private platform: AppPlatformService,
    private appTheme: AppThemeService,
    private themePalette: AppThemePaletteService,
    private queryVersionDiff: QueryVersionDiffService
  ) {
    this.settingsSubscription = this.appSettings.settingsChanges$.subscribe((settings) => {
      this.applySqlHighlightTheme(settings.sqlHighlightColors)
      this.updateSqlChangeDecorations()
    })
    this.languageSubscription = this.language.languageChanges$.subscribe(() => {
      this.registerEditorContextMenuActions()
    })
    this.themeSubscription = this.appTheme.themeChanges$.subscribe(() => {
      this.applySqlHighlightTheme(this.appSettings.getSqlHighlightColors())
    })
  }

  ngAfterViewChecked(): void {
    if (!this.initialized && this.editorContainer?.nativeElement) {
      this.initialized = true
      this.initializeEditor()
    }

    (window as any).MonacoEnvironment = {
      getWorker: () => {
        return new Worker(URL.createObjectURL(new Blob([''])))
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabInfo']) {
      this.restoreQueryState()
    }

    if (changes['active'] && changes['active'].currentValue) {
      this.refreshVisibleLayout(true)
    }

    if (this.editor && this.sqlContent !== this.editor.getValue()) {
      this.replaceEditorSql(this.sqlContent || '')
    }

    if (this.editor && (changes['sqlContent'] || changes['tabInfo'])) {
      this.scheduleSqlChangeDecorations()
    }
  }

  ngOnDestroy(): void {
    this.clearResultAnimations()
    this.clearSqlChangeDecorationTimer()

    if (this.tabInfo?.closing) {
      this.releaseQueryMemory()
    } else {
      this.persistQueryState()
    }

    this.autocompleteDisposable?.dispose()
    this.syntaxValidationDisposable?.dispose()
    this.settingsSubscription?.unsubscribe()
    this.themeSubscription?.unsubscribe()
    this.languageSubscription?.unsubscribe()
    this.closeChangePeek(false)
    this.unregisterKeyboardShortcuts()
    this.disposeEditorContextMenuActions()
    this.disposeEditorMouseActions()

    if (this.editor) {
      this.editor.dispose()
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.queryResultOpen) {
      this.layoutEditor()
      return
    }

    if (this.queryResultExpanded) {
      this.queryResultHeight = this.getExpandedResultHeight()
    } else {
      this.queryResultHeight = this.normalizeResultHeight(this.queryResultHeight)
    }

    this.persistQueryState()
    this.layoutEditor()
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'CapsLock') {
      this.sqlSummaryModifierPressed = true
      this.sqlNavigationModifierPressed = true
      this.updateSqlNavigationHover()
      return
    }

    if (event.key !== 'Control' && event.key !== 'Meta') return

    this.sqlNavigationModifierPressed = true
    this.updateSqlNavigationHover()
  }

  @HostListener('window:keyup', ['$event'])
  onWindowKeyUp(event: KeyboardEvent): void {
    if (event.key === 'CapsLock') {
      this.sqlSummaryModifierPressed = false
      this.sqlNavigationModifierPressed = event.ctrlKey || event.metaKey

      if (this.sqlNavigationModifierPressed) {
        this.updateSqlNavigationHover()
      } else {
        this.clearSqlNavigationHover()
      }
      return
    }

    if (event.key !== 'Control' && event.key !== 'Meta') return
    if (event.ctrlKey || event.metaKey) return

    this.sqlNavigationModifierPressed = this.sqlSummaryModifierPressed
    if (this.sqlNavigationModifierPressed) {
      this.updateSqlNavigationHover()
    } else {
      this.clearSqlNavigationHover()
    }
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.sqlSummaryModifierPressed = false
    this.sqlNavigationModifierPressed = false
    this.clearSqlNavigationHover()
  }

  private initializeEditor(): void {
    this.configureSqlLanguage()
    this.defineSqlHighlightTheme(this.appSettings.getSqlHighlightColors())

    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.sqlContent || '',
      language: 'sql',
      theme: 'dbolt-sql-configurable',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      glyphMargin: false,
      lineDecorationsWidth: 30,
      lineNumbersMinChars: 2,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto'
      },
      renderLineHighlight: 'line',
      renderLineHighlightOnlyWhenFocus: true,
      overviewRulerLanes: 0,
      renderWhitespace: 'none',
      stickyScroll: { enabled: false },
      folding: false,
      fontFamily: 'Nunito',
      roundedSelection: false,
      selectionHighlight: false,
      quickSuggestions: { other: 'on', comments: 'off', strings: 'on' },
      quickSuggestionsDelay: 250,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      hover: {
        enabled: true,
        delay: 150,
        sticky: true
      },
      contextmenu: true
    })

    this.autocompleteDisposable = this.tableAutocomplete.registerEditor(
      this.editor,
      () => this.tabInfo?.dbInfo,
      () => this.active
    )
    this.syntaxValidationDisposable = this.sqlSyntaxMarkers.registerEditor(
      this.editor,
      () => this.tabInfo?.dbInfo
    )

    this.initializeEditorEvents()
    this.updateSqlChangeDecorations()
  }

  private configureSqlLanguage(): void {
    if (sqlTokenizerConfigured) return

    monaco.languages.setMonarchTokensProvider('sql', {
      ignoreCase: true,
      defaultToken: 'identifier.column',
      keywords: [
        'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'authorization', 'backup', 'begin',
        'between', 'break', 'by', 'cascade', 'case', 'check', 'close', 'clustered',
        'collate', 'column', 'commit', 'constraint', 'continue', 'create', 'cross', 'current',
        'current_date', 'current_time', 'current_timestamp', 'cursor', 'database', 'declare',
        'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except',
        'exec', 'execute', 'exists', 'fetch', 'for', 'foreign', 'from', 'full', 'go', 'grant',
        'group', 'having', 'if', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is',
        'join', 'key', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'open', 'or',
        'order', 'outer', 'over', 'primary', 'procedure', 'references', 'right', 'rollback',
        'rownum', 'schema', 'select', 'set', 'table', 'then', 'to', 'top', 'transaction',
        'truncate', 'union', 'unique', 'update', 'use', 'values', 'view', 'when', 'where',
        'while', 'with', 'true', 'false'
      ],
      types: [
        'bigint', 'binary', 'bit', 'blob', 'boolean', 'char', 'clob', 'date', 'datetime',
        'datetime2', 'decimal', 'double', 'float', 'image', 'int', 'integer', 'json',
        'longtext', 'money', 'nchar', 'ntext', 'numeric', 'nvarchar', 'real', 'serial',
        'smallint', 'smallmoney', 'text', 'time', 'timestamp', 'tinyint', 'uniqueidentifier',
        'uuid', 'varbinary', 'varchar', 'xml'
      ],
      sqlIdentifier: /(?:[A-Za-z_$#][A-Za-z0-9_$#]*|`(?:``|[^`])*`|"(?:""|[^"])*"|\[(?:\]\]|[^\]])*\])/,
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/'(?:''|[^'])*'/, 'string'],
          [/(@sqlIdentifier)(\.)(@sqlIdentifier)(\.)(@sqlIdentifier)/, [
            'identifier.qualifier', 'delimiter', 'identifier.qualifier', 'delimiter', 'identifier.column'
          ]],
          [/(@sqlIdentifier)(\.)(@sqlIdentifier)(?=\s*\()/, [
            'identifier.qualifier', 'delimiter', 'function'
          ]],
          [/(@sqlIdentifier)(\.)(@sqlIdentifier)/, [
            'identifier.qualifier', 'delimiter', 'identifier.column'
          ]],
          [/"(?:""|[^"])*"/, 'identifier.column'],
          [/`(?:``|[^`])*`/, 'identifier.column'],
          [/\[(?:\]\]|[^\]])*\]/, 'identifier.column'],
          [/\b\d+(?:\.\d+)?\b/, 'number'],
          [/@[a-zA-Z_][\w$#]*/, 'variable'],
          [/(with)(\s+)([a-zA-Z_][\w$#]*)/, ['keyword', 'white', 'identifier.cte']],
          [/(from|join|update|into)\b/, { token: 'keyword', next: '@tableReference' }],
          [/(as)(\s+)([a-zA-Z_][\w$#]*)/, ['keyword', 'white', {
            cases: {
              '@types': 'type',
              '@default': 'identifier.columnAlias'
            }
          }]],
          [/[a-zA-Z_][\w$#]*(?=\s*\()/, {
            cases: {
              '@keywords': 'keyword',
              '@types': 'type',
              '@default': 'function'
            }
          }],
          [/[a-zA-Z_][\w$#]*/, {
            cases: {
              '@keywords': 'keyword',
              '@types': 'type',
              '@default': 'identifier.column'
            }
          }],
          [/[<>!~?:&|+\-*\/%^=]+/, 'operator'],
          [/[;,.]/, 'delimiter'],
          [/[()]/, 'delimiter']
        ],
        tableReference: [
          [/[ \t]+/, 'white'],
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/\(/, { token: 'delimiter', switchTo: '@derivedTable' }],
          [/@sqlIdentifier/, { token: 'identifier.table', switchTo: '@tableReferenceSuffix' }],
          [/./, { token: '@rematch', next: '@pop' }]
        ],
        tableReferenceSuffix: [
          [/[ \t]+/, 'white'],
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/\./, { token: 'delimiter', switchTo: '@tableReference' }],
          [/,/, { token: 'delimiter', switchTo: '@tableReference' }],
          [/@sqlIdentifier/, {
            cases: {
              'as': { token: 'keyword', switchTo: '@tableAlias' },
              '@keywords': { token: '@rematch', next: '@pop' },
              '@types': { token: '@rematch', next: '@pop' },
              '@default': { token: 'identifier.tableAlias', switchTo: '@tableReferenceEnd' }
            }
          }],
          [/./, { token: '@rematch', next: '@pop' }]
        ],
        derivedTable: [
          [/\(/, { token: 'delimiter', next: '@derivedTableNested' }],
          [/\)/, { token: 'delimiter', switchTo: '@tableAlias' }],
          { include: '@root' }
        ],
        derivedTableNested: [
          [/\(/, { token: 'delimiter', next: '@push' }],
          [/\)/, { token: 'delimiter', next: '@pop' }],
          { include: '@root' }
        ],
        tableAlias: [
          [/[ \t]+/, 'white'],
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/(as)\b/, 'keyword'],
          [/@sqlIdentifier/, { token: 'identifier.tableAlias', switchTo: '@tableReferenceEnd' }],
          [/./, { token: '@rematch', next: '@pop' }]
        ],
        tableReferenceEnd: [
          [/[ \t]+/, 'white'],
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/,/, { token: 'delimiter', switchTo: '@tableReference' }],
          [/./, { token: '@rematch', next: '@pop' }]
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment']
        ]
      }
    })

    sqlTokenizerConfigured = true
  }

  private defineSqlHighlightTheme(colors: SqlHighlightColors): void {
    const normalizedColors = this.appSettings.normalizeSqlHighlightColors(colors)
    const theme = this.appTheme.getTheme()
    const themeColors = this.themePalette.resolveHighlightColors(theme, normalizedColors)
    const palette = this.themePalette.getEditorPalette(theme)

    monaco.editor.defineTheme('dbolt-sql-configurable', {
      base: palette.monacoBase,
      inherit: false,
      rules: this.buildSqlTokenRules(themeColors, this.appSettings.getSqlHighlightMode()),
      colors: {
        ...palette.surfaceColors,
        ...this.themePalette.getEditorChromeColors(theme),
        'editor.foreground': themeColors.identifier,
        'editorError.foreground': '#f14c4c',
        'editorError.border': '#00000000'
      }
    })
  }

  private buildSqlTokenRules(
    colors: SqlHighlightColors,
    mode: SqlHighlightMode
  ): monaco.editor.ITokenThemeRule[] {
    const rules: monaco.editor.ITokenThemeRule[] = []
    const addRule = (token: string, color: string, fontStyle?: string) => {
      rules.push(
        { token, foreground: this.toMonacoColor(color), fontStyle },
        { token: `${token}.sql`, foreground: this.toMonacoColor(color), fontStyle }
      )
    }

    addRule('keyword', colors.keyword, 'bold')
    addRule('function', colors.function, 'bold')
    addRule('identifier', colors.identifier)
    addRule('string', colors.string)
    addRule('number', colors.number)
    addRule('comment', colors.comment, 'italic')
    addRule('operator', colors.operator, 'bold')
    addRule('type', colors.type)
    addRule('variable', colors.variable)
    addRule('delimiter', colors.delimiter)

    if (mode === 'vibrant') {
      addRule('identifier.cte', colors.variable)
      addRule('identifier.table', colors.variable)
      addRule('identifier.tableAlias', colors.variable, 'italic')
      addRule('identifier.qualifier', colors.variable, 'italic')
      addRule('identifier.column', colors.identifier)
      addRule('identifier.columnAlias', colors.identifier, 'italic')
    }

    return rules
  }

  private applySqlHighlightTheme(colors: SqlHighlightColors): void {
    if (!this.editor) return

    this.defineSqlHighlightTheme(colors)
    monaco.editor.setTheme('dbolt-sql-configurable')
  }

  private toMonacoColor(color: string): string {
    return color.replace('#', '')
  }

  private initializeEditorEvents(): void {
    this.registerKeyboardShortcuts()
    this.registerEditorContextMenuActions()

    this.editor?.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      this.scheduleSqlChangeDecorations(value)
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })

    const mouseDownDisposable = this.editor?.onMouseDown((event) => {
      void this.handleEditorMouseDown(event)
    })
    const peekLayoutDisposable = this.editor?.onDidLayoutChange(() => this.layoutChangePeek())
    const peekScrollDisposable = this.editor?.onDidScrollChange(() => this.layoutChangePeek())
    if (peekLayoutDisposable) this.editorMouseDisposables.push(peekLayoutDisposable)
    if (peekScrollDisposable) this.editorMouseDisposables.push(peekScrollDisposable)
    const mouseMoveDisposable = this.editor?.onMouseMove((event) => {
      this.lastMousePosition = event.target.position || null
      this.sqlNavigationModifierPressed = event.event.ctrlKey
        || event.event.metaKey
        || this.sqlSummaryModifierPressed
      this.updateSqlNavigationHover()
    })
    const mouseLeaveDisposable = this.editor?.onMouseLeave(() => {
      this.lastMousePosition = null
      this.clearSqlNavigationHover()
    })

    if (mouseDownDisposable) {
      this.editorMouseDisposables.push(mouseDownDisposable)
    }
    if (mouseMoveDisposable) {
      this.editorMouseDisposables.push(mouseMoveDisposable)
    }
    if (mouseLeaveDisposable) {
      this.editorMouseDisposables.push(mouseLeaveDisposable)
    }
  }

  private disposeEditorMouseActions(): void {
    this.editorMouseDisposables.forEach((disposable) => disposable.dispose())
    this.editorMouseDisposables = []
    this.clearSqlNavigationHover()
  }

  private registerEditorContextMenuActions(): void {
    this.disposeEditorContextMenuActions()

    const indentAction = this.editor?.addAction({
      id: 'dbolt.indentSql',
      label: this.t('editor.indentCode'),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
      keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: () => {
        this.formatCode()
      }
    })

    if (indentAction) {
      this.editorActionDisposables.push(indentAction)
    }
  }

  private disposeEditorContextMenuActions(): void {
    this.editorActionDisposables.forEach((disposable) => disposable.dispose())
    this.editorActionDisposables = []
  }

  private async handleEditorMouseDown(event: monaco.editor.IEditorMouseEvent): Promise<void> {
    if (!this.active || !this.editor || !event.target.position) return

    if (
      this.canUseVersionMessage &&
      event.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS
    ) {
      event.event.preventDefault()
      this.toggleChangePeek(event.target.position.lineNumber)
      return
    }

    const summaryRequested = this.sqlSummaryModifierPressed
    const detailRequested = event.event.ctrlKey || event.event.metaKey
    if (!summaryRequested && !detailRequested) return

    const browserEvent = event.event.browserEvent
    if (browserEvent instanceof MouseEvent && browserEvent.button !== 0) return

    const navigationLink = this.resolveSqlNavigationLink(event.target.position)
    if (!navigationLink) return

    event.event.preventDefault()
    browserEvent?.preventDefault()

    const request = {
      ...navigationLink.target,
      context: this.tabInfo?.dbInfo,
      info: this.tabInfo?.dbInfo
    }

    if (summaryRequested) {
      this.objectSummaryRequested.emit(request)
      return
    }

    this.objectInfoRequested.emit(request)
  }

  private updateSqlNavigationHover(): void {
    if (!this.sqlNavigationModifierPressed || !this.active || !this.lastMousePosition) {
      this.clearSqlNavigationHover()
      return
    }

    const navigationLink = this.resolveSqlNavigationLink(this.lastMousePosition)
    if (!navigationLink) {
      this.clearSqlNavigationHover()
      return
    }

    this.sqlNavigationDecorationIds = this.editor?.deltaDecorations(this.sqlNavigationDecorationIds, [{
      range: navigationLink.range,
      options: {
        inlineClassName: 'dbolt-sql-navigation-link'
      }
    }]) || []

    this.editor?.getDomNode()?.classList.add('dbolt-sql-navigation-pointer')
  }

  private clearSqlNavigationHover(): void {
    this.sqlNavigationDecorationIds = this.editor?.deltaDecorations(this.sqlNavigationDecorationIds, []) || []
    this.editor?.getDomNode()?.classList.remove('dbolt-sql-navigation-pointer')
  }

  private scheduleSqlChangeDecorations(currentSql?: string): void {
    this.clearSqlChangeDecorationTimer()
    this.sqlChangeDecorationTimer = setTimeout(() => {
      this.sqlChangeDecorationTimer = null
      this.updateSqlChangeDecorations(currentSql)
    }, 80)
  }

  private replaceEditorSql(sql: string): void {
    const editor = this.editor
    const model = editor?.getModel()
    if (!editor || !model) return

    editor.pushUndoStop()
    editor.executeEdits('dbolt.external-sql-update', [{
      range: model.getFullModelRange(),
      text: sql,
      forceMoveMarkers: true
    }])
    editor.pushUndoStop()
  }

  get canUseVersionMessage(): boolean {
    return Boolean(this.tabInfo?.persisted) && Boolean(this.tabInfo?.versioningEnabled)
  }

  openVersionMessage(): void {
    if (!this.canUseVersionMessage) {
      void this.saveQuery()
      return
    }

    this.isVersionMessageOpen = true
  }

  closeVersionMessage(): void {
    this.isVersionMessageOpen = false
  }

  async confirmVersionMessage(message: string): Promise<void> {
    this.isVersionMessageOpen = false
    await this.saveQuery(message)
  }

  private toggleChangePeek(lineNumber: number): void {
    const hunk = this.queryVersionDiff.findHunkForLine(this.sqlChangeHunks, lineNumber)

    if (!hunk) {
      this.closeChangePeek(false)
      return
    }

    if (this.changePeekLine === hunk.currentStartLine) {
      this.closeChangePeek()
      return
    }

    this.closeChangePeek(false)
    this.openChangePeek(hunk)
  }

  private openChangePeek(hunk: QueryChangeHunk): void {
    const editor = this.editor
    if (!editor) return

    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
    const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo)
    const bodyLineCount = Math.max(1, hunk.originalLines.length + hunk.currentLines.length)
    const headerHeight = Math.max(30, Math.round(lineHeight * 1.25))
    const totalHeight = headerHeight + (bodyLineCount * lineHeight) + CHANGE_PEEK_PADDING + 2

    // Monaco overwrites width, height and display on the zone node. Keep our
    // flex layout inside a separate child that Monaco never mutates.
    const zoneNode = document.createElement('div')
    zoneNode.className = 'dbolt-change-peek-zone'
    const container = document.createElement('div')
    container.className = `dbolt-change-peek dbolt-change-peek-${hunk.type}`
    container.style.height = `calc(100% - ${CHANGE_PEEK_PADDING}px)`
    zoneNode.appendChild(container)

    const header = document.createElement('div')
    header.className = 'dbolt-change-peek-header'
    header.style.height = `${headerHeight}px`

    const title = document.createElement('span')
    title.className = 'dbolt-change-peek-title'
    title.textContent = this.t(`editor.changePeek.${hunk.type}`)
    header.appendChild(title)

    const stats = document.createElement('div')
    stats.className = 'dbolt-change-peek-stats'

    if (hunk.originalLines.length > 0) {
      const removed = document.createElement('span')
      removed.className = 'removed'
      removed.textContent = `−${hunk.originalLines.length}`
      stats.appendChild(removed)
    }

    if (hunk.currentLines.length > 0) {
      const added = document.createElement('span')
      added.className = 'added'
      added.textContent = `+${hunk.currentLines.length}`
      stats.appendChild(added)
    }

    header.appendChild(stats)

    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'dbolt-change-peek-close'
    close.setAttribute('aria-label', this.t('generic.close'))
    close.title = this.t('editor.changePeekClose')
    close.textContent = '×'
    close.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.closeChangePeek()
    })
    close.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (!this.changePeekClosing) {
        this.closeChangePeek()
      }
    })
    header.appendChild(close)

    container.appendChild(header)

    const body = document.createElement('div')
    body.className = 'dbolt-change-peek-body'
    body.style.fontFamily = fontInfo.fontFamily
    body.style.fontSize = `${fontInfo.fontSize}px`
    body.style.height = `${bodyLineCount * lineHeight}px`

    const appendDiffLine = (
      text: string,
      type: 'removed' | 'added',
      oldLineNumber: number | null,
      newLineNumber: number | null
    ): void => {
      const row = document.createElement('div')
      row.className = `dbolt-change-peek-line dbolt-change-peek-line-${type}`
      row.style.height = `${lineHeight}px`
      row.style.lineHeight = `${lineHeight}px`

      const oldNumber = document.createElement('span')
      oldNumber.className = 'dbolt-change-peek-line-number'
      oldNumber.textContent = oldLineNumber ? String(oldLineNumber) : ''
      row.appendChild(oldNumber)

      const newNumber = document.createElement('span')
      newNumber.className = 'dbolt-change-peek-line-number'
      newNumber.textContent = newLineNumber ? String(newLineNumber) : ''
      row.appendChild(newNumber)

      const marker = document.createElement('span')
      marker.className = 'dbolt-change-peek-line-marker'
      marker.textContent = type === 'removed' ? '−' : '+'
      row.appendChild(marker)

      const code = document.createElement('span')
      code.className = 'dbolt-change-peek-code'
      code.textContent = text.length > 0 ? text : ' '
      row.appendChild(code)

      body.appendChild(row)
    }

    hunk.originalLines.forEach((line, index) => {
      appendDiffLine(line, 'removed', (hunk.originalStartLine || 1) + index, null)
    })

    hunk.currentLines.forEach((line, index) => {
      appendDiffLine(line, 'added', null, hunk.currentStartLine + index)
    })

    container.appendChild(body)

    const zone: monaco.editor.IViewZone = {
      afterLineNumber: hunk.type === 'deleted'
        ? Math.max(0, hunk.currentStartLine - 1)
        : hunk.currentEndLine,
      heightInPx: 0,
      domNode: zoneNode,
      suppressMouseDown: false
    }

    editor.changeViewZones((accessor) => {
      this.changePeekZoneId = accessor.addZone(zone)
    })

    this.changePeekZone = zone
    this.changePeekNode = container
    this.changePeekLine = hunk.currentStartLine
    this.changePeekClosing = false
    this.layoutChangePeek()

    this.animateChangePeekHeight(0, totalHeight, CHANGE_PEEK_OPEN_MS)
  }

  private layoutChangePeek(): void {
    if (!this.editor || !this.changePeekNode) return
    const layout = this.editor.getLayoutInfo()
    this.changePeekNode.style.width = `${Math.max(0, layout.width - layout.contentLeft - layout.verticalScrollbarWidth - 12)}px`
    this.changePeekNode.style.marginLeft = `${this.editor.getScrollLeft()}px`
  }

  private animateChangePeekHeight(
    from: number,
    to: number,
    duration: number,
    onDone?: () => void
  ): void {
    const editor = this.editor
    const zone = this.changePeekZone
    const zoneId = this.changePeekZoneId

    this.cancelChangePeekFrame()

    if (!editor || !zone || !zoneId) {
      onDone?.()
      return
    }

    const startedAt = performance.now()

    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)

      zone.heightInPx = Math.max(0, Math.round(from + ((to - from) * eased)))
      editor.changeViewZones((accessor) => accessor.layoutZone(zoneId))

      if (progress < 1) {
        this.changePeekFrame = requestAnimationFrame(step)
        return
      }

      this.changePeekFrame = null
      onDone?.()
    }

    this.changePeekFrame = requestAnimationFrame(step)
  }

  private closeChangePeek(animate: boolean = true): void {
    if (animate && this.changePeekClosing) return
    const editor = this.editor
    const zoneId = this.changePeekZoneId
    const zone = this.changePeekZone
    const node = this.changePeekNode

    this.cancelChangePeekFrame()

    if (!editor || !zoneId) {
      this.resetChangePeekState()
      return
    }

    if (!animate || !zone || !node || typeof zone.heightInPx !== 'number') {
      editor.changeViewZones((accessor) => accessor.removeZone(zoneId))
      this.resetChangePeekState()
      return
    }

    this.changePeekClosing = true
    this.changePeekLine = null
    node.classList.add('closing')

    this.animateChangePeekHeight(zone.heightInPx, 0, CHANGE_PEEK_CLOSE_MS, () => {
      editor.changeViewZones((accessor) => accessor.removeZone(zoneId))
      this.resetChangePeekState()
    })
  }

  private cancelChangePeekFrame(): void {
    if (this.changePeekFrame !== null) {
      cancelAnimationFrame(this.changePeekFrame)
      this.changePeekFrame = null
    }
  }

  private resetChangePeekState(): void {
    this.changePeekZoneId = null
    this.changePeekZone = null
    this.changePeekNode = null
    this.changePeekLine = null
    this.changePeekClosing = false
  }

  private updateSqlChangeDecorations(currentSql?: string): void {
    this.clearSqlChangeDecorationTimer()

    const editor = this.editor
    const model = editor?.getModel()
    if (!editor || !model) return

    if (!this.canUseVersionMessage || !this.appSettings.shouldShowSqlChangeHighlights()) {
      this.sqlChangeDecorationIds = editor.deltaDecorations(this.sqlChangeDecorationIds, [])
      this.sqlChangeHunks = []
      this.closeChangePeek(false)
      return
    }

    const savedSql = typeof this.tabInfo?.originalContent === 'string'
      ? this.tabInfo.originalContent
      : ''
    const editorSql = currentSql ?? model.getValue()
    const normalizedSavedSql = savedSql.replace(/\r\n/g, '\n')
    const normalizedEditorSql = editorSql.replace(/\r\n/g, '\n')

    if (normalizedSavedSql === normalizedEditorSql) {
      this.sqlChangeDecorationIds = editor.deltaDecorations(this.sqlChangeDecorationIds, [])
      this.sqlChangeHunks = []
      this.closeChangePeek(false)
      return
    }

    this.sqlChangeHunks = this.queryVersionDiff.buildChangeHunks(normalizedSavedSql, normalizedEditorSql)

    const decorations = this.queryVersionDiff
      .buildChangeMarkers(normalizedSavedSql, normalizedEditorSql)
      .map((marker): monaco.editor.IModelDeltaDecoration => ({
        range: new monaco.Range(marker.lineNumber, 1, marker.lineNumber, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: `dbolt-sql-change-${marker.type}`,
          className: marker.type === 'deleted' ? undefined : `dbolt-sql-change-line-${marker.type}`
        }
      }))
    this.sqlChangeDecorationIds = editor.deltaDecorations(this.sqlChangeDecorationIds, decorations)
  }

  private clearSqlChangeDecorationTimer(): void {
    if (!this.sqlChangeDecorationTimer) return

    clearTimeout(this.sqlChangeDecorationTimer)
    this.sqlChangeDecorationTimer = null
  }

  private resolveSqlNavigationLink(position: monaco.Position): SqlNavigationLink | null {
    const model = this.editor?.getModel()
    if (!model) return null

    const clickedIdentifier = this.getIdentifierAtPosition(model, position)
    if (!clickedIdentifier) return null

    const sql = model.getValue()
    const sanitizedSql = this.replaceStringsAndComments(sql)
    const statementSql = this.extractCurrentStatement(sanitizedSql, clickedIdentifier.offset)
    const tokens = this.tokenizeSql(statementSql)
    const aliases = this.resolveStatementTableAliases(tokens)
    const clickedName = this.normalizeIdentifier(clickedIdentifier.value)
    const clickedKey = clickedName.toLowerCase()
    const previousToken = this.findPreviousToken(tokens, clickedIdentifier.statementOffset)
    const currentToken = tokens.find((token) => token.start <= clickedIdentifier.statementOffset && clickedIdentifier.statementOffset < token.end)
    const nextToken = currentToken ? tokens[tokens.indexOf(currentToken) + 1] : null

    if (aliases.has(clickedKey)) {
      return {
        target: this.toSqlNavigationTarget(aliases.get(clickedKey) || clickedName),
        range: clickedIdentifier.range
      }
    }

    if (this.sqlNavigationReservedWords.has(clickedKey)) {
      return null
    }

    if (nextToken?.value === '(' && previousToken?.value !== '.') {
      return null
    }

    if (previousToken?.value === '.') {
      const qualifier = this.findTokenBefore(tokens, previousToken.start)
      const tableName = qualifier ? aliases.get(this.normalizeIdentifier(qualifier.value).toLowerCase()) : ''

      if (tableName) {
        return {
          target: this.toSqlNavigationTarget(tableName, 'columns'),
          range: clickedIdentifier.range
        }
      }
    }

    if (this.isTableReferenceToken(tokens, clickedIdentifier.statementOffset)) {
      return {
        target: {
          name: clickedName
        },
        range: clickedIdentifier.range
      }
    }

    const uniqueTableName = this.getUniqueStatementTableName(aliases)
    if (uniqueTableName) {
      return {
        target: this.toSqlNavigationTarget(uniqueTableName, 'columns'),
        range: clickedIdentifier.range
      }
    }

    return null
  }

  private getIdentifierAtPosition(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): { value: string, offset: number, statementOffset: number, range: monaco.IRange } | null {
    const word = model.getWordAtPosition(position)
    if (!word?.word) return null

    const offset = model.getOffsetAt({
      lineNumber: position.lineNumber,
      column: word.startColumn
    })
    const statementStart = this.getCurrentStatementStartOffset(model.getValue(), offset)

    return {
      value: word.word,
      offset,
      statementOffset: offset - statementStart,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
    }
  }

  private resolveStatementTableAliases(tokens: SqlNavigationToken[]): Map<string, string> {
    const aliases = new Map<string, string>()

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]

      if (token.lower === 'from') {
        index = this.collectFromNavigationAliases(tokens, index + 1, aliases)
      } else if (token.lower === 'join') {
        this.collectSingleNavigationAlias(tokens, index + 1, aliases)
      }
    }

    return aliases
  }

  private collectFromNavigationAliases(
    tokens: SqlNavigationToken[],
    startIndex: number,
    aliases: Map<string, string>
  ): number {
    let index = startIndex

    while (index < tokens.length) {
      const token = tokens[index]
      if (!token || this.isFromNavigationTerminator(token.lower)) {
        return Math.max(index - 1, startIndex)
      }

      const result = this.collectSingleNavigationAlias(tokens, index, aliases)
      if (!result) {
        index++
        continue
      }

      index = result.nextIndex
      if (tokens[index]?.value === ',') {
        index++
        continue
      }

      return Math.max(index - 1, startIndex)
    }

    return index
  }

  private collectSingleNavigationAlias(
    tokens: SqlNavigationToken[],
    startIndex: number,
    aliases: Map<string, string>
  ): { nextIndex: number } | null {
    const tableReference = this.readIdentifierChain(tokens, startIndex)
    if (!tableReference) return null

    let nextIndex = tableReference.nextIndex
    if (tokens[nextIndex]?.lower === 'as') {
      nextIndex++
    }

    const tableName = normalizeTableReferenceForMetadata(tableReference.value)
    const implicitAlias = this.normalizeIdentifier(this.getIdentifierLastPart(tableReference.value))
    this.addNavigationAlias(aliases, implicitAlias, tableName)

    const aliasToken = tokens[nextIndex]
    if (aliasToken && this.isAliasNavigationToken(aliasToken)) {
      this.addNavigationAlias(aliases, this.normalizeIdentifier(aliasToken.value), tableName)
      nextIndex++
    }

    return { nextIndex }
  }

  private addNavigationAlias(aliases: Map<string, string>, alias: string, tableName: string): void {
    const normalizedAlias = alias.trim().toLowerCase()
    const normalizedTableName = tableName.trim()
    if (!normalizedAlias || !normalizedTableName) return

    aliases.set(normalizedAlias, normalizedTableName)
  }

  private toSqlNavigationTarget(
    tableReference: string,
    initialView?: 'columns'
  ): SqlNavigationLink['target'] {
    const reference = parseMetadataTableReference(tableReference)

    return {
      name: reference.tableName || this.normalizeIdentifier(tableReference),
      schema: reference.schema,
      initialView
    }
  }

  private isTableReferenceToken(tokens: SqlNavigationToken[], statementOffset: number): boolean {
    const clickedToken = tokens.find((token) => token.start <= statementOffset && statementOffset < token.end)
    if (!clickedToken) return false

    for (let index = tokens.indexOf(clickedToken) - 1; index >= 0; index--) {
      const token = tokens[index].lower

      if (token === 'from' || token === 'join') {
        return true
      }

      if (this.isFromNavigationTerminator(token) || token === ',' || token === 'on') {
        return false
      }
    }

    return false
  }

  private getUniqueStatementTableName(aliases: Map<string, string>): string {
    const tableNames = new Set(Array.from(aliases.values()).map((name) => name.toLowerCase()))
    if (tableNames.size !== 1) return ''

    return aliases.values().next().value || ''
  }

  private readIdentifierChain(
    tokens: SqlNavigationToken[],
    startIndex: number
  ): { value: string, nextIndex: number } | null {
    const firstToken = tokens[startIndex]
    if (!this.isIdentifierNavigationToken(firstToken)) return null

    const parts = [firstToken.value]
    let index = startIndex + 1

    while (tokens[index]?.value === '.' && this.isIdentifierNavigationToken(tokens[index + 1])) {
      parts.push(tokens[index].value, tokens[index + 1].value)
      index += 2
    }

    return { value: parts.join(''), nextIndex: index }
  }

  private findPreviousToken(tokens: SqlNavigationToken[], statementOffset: number): SqlNavigationToken | null {
    const previousTokens = tokens.filter((token) => token.end <= statementOffset)
    return previousTokens[previousTokens.length - 1] || null
  }

  private findTokenBefore(tokens: SqlNavigationToken[], statementOffset: number): SqlNavigationToken | null {
    const previousTokens = tokens.filter((token) => token.end <= statementOffset)
    return previousTokens[previousTokens.length - 1] || null
  }

  private isIdentifierNavigationToken(token?: SqlNavigationToken): boolean {
    if (!token) return false

    return (
      /^[A-Za-z_$#][A-Za-z0-9_$#]*$/.test(token.value) ||
      /^`[^`]*`$/.test(token.value) ||
      /^"[^"]*"$/.test(token.value) ||
      /^\[[^\]]*\]$/.test(token.value)
    )
  }

  private isAliasNavigationToken(token: SqlNavigationToken): boolean {
    return this.isIdentifierNavigationToken(token) && !this.sqlNavigationReservedWords.has(token.lower)
  }

  private isFromNavigationTerminator(token: string): boolean {
    return [
      'where',
      'join',
      'inner',
      'left',
      'right',
      'full',
      'cross',
      'on',
      'group',
      'order',
      'having',
      'limit',
      'offset',
      'with',
      'union'
    ].includes(token)
  }

  private tokenizeSql(sql: string): SqlNavigationToken[] {
    const tokens: SqlNavigationToken[] = []
    const pattern = /`[^`]*`|"[^"]*"|\[[^\]]*\]|[A-Za-z_$#][A-Za-z0-9_$#]*|[.,;()]/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(sql)) !== null) {
      const value = match[0]
      tokens.push({
        value,
        lower: this.normalizeIdentifier(value).toLowerCase(),
        start: match.index,
        end: match.index + value.length
      })
    }

    return tokens
  }

  private extractCurrentStatement(sql: string, offset: number): string {
    const start = this.getCurrentStatementStartOffset(sql, offset)
    const end = sql.indexOf(';', offset)

    return sql.slice(start, end === -1 ? sql.length : end)
  }

  private getCurrentStatementStartOffset(sql: string, offset: number): number {
    return sql.lastIndexOf(';', Math.max(0, offset - 1)) + 1
  }

  private replaceStringsAndComments(sql: string): string {
    let result = ''
    let quote: string | null = null
    let identifierQuote: string | null = null
    let lineComment = false
    let blockComment = false

    for (let index = 0; index < sql.length; index++) {
      const current = sql[index]
      const next = sql[index + 1]

      if (lineComment) {
        if (current === '\n' || current === '\r') {
          result += current
          lineComment = false
        } else {
          result += ' '
        }
        continue
      }

      if (blockComment) {
        if (current === '*' && next === '/') {
          result += '  '
          index++
          blockComment = false
        } else {
          result += ' '
        }
        continue
      }

      if (identifierQuote) {
        result += current

        if (current === identifierQuote) {
          if (
            (identifierQuote === ']' && next === ']') ||
            (identifierQuote === '"' && next === '"') ||
            (identifierQuote === '`' && next === '`')
          ) {
            result += next
            index++
          } else {
            identifierQuote = null
          }
        }
        continue
      }

      if (quote) {
        result += ' '

        if (current === quote) {
          if (next === quote) {
            result += ' '
            index++
          } else {
            quote = null
          }
        }
        continue
      }

      if (current === '-' && next === '-') {
        result += '  '
        index++
        lineComment = true
        continue
      }

      if (current === '/' && next === '*') {
        result += '  '
        index++
        blockComment = true
        continue
      }

      if (current === '\'') {
        result += ' '
        quote = current
        continue
      }

      if (current === '"' || current === '`' || current === '[') {
        result += current
        identifierQuote = current === '[' ? ']' : current
        continue
      }

      result += current
    }

    return result
  }

  private normalizeIdentifier(value: string): string {
    return value
      .trim()
      .replace(/^[`"\[]+/, '')
      .replace(/[`"\]]+$/, '')
  }

  private getIdentifierLastPart(value: string): string {
    const parts = value.split('.')
    return parts.pop() || value
  }

  private registerChangePeekEscape(): void {
    this.shortcutDisposers.push(
      this.keyboardShortcuts.register({
        key: 'Escape',
        priority: 99,
        stopPropagation: true,
        isEnabled: () => this.active && this.changePeekZoneId !== null,
        isInContext: (event) => this.isEditorShortcutContext(event),
        handler: () => {
          this.closeChangePeek()
          return true
        }
      })
    )
  }

  private registerKeyboardShortcuts(): void {
    this.unregisterKeyboardShortcuts()

    this.registerChangePeekEscape()

    this.shortcutDisposers.push(
      this.keyboardShortcuts.register({
        key: 'Enter',
        ctrlOrMeta: true,
        priority: 90,
        stopPropagation: true,
        isEnabled: () => this.active && !this.isLoadingQuery && !!this.editor,
        isInContext: (event) => this.isEditorShortcutContext(event),
        handler: () => {
          this.runSelected()
          return true
        }
      }),
      this.keyboardShortcuts.register({
        key: 's',
        ctrlOrMeta: true,
        priority: 90,
        stopPropagation: true,
        isEnabled: () => this.active && !!this.editor,
        isInContext: (event) => this.isEditorShortcutContext(event),
        handler: () => {
          void this.saveQuery()
          return true
        }
      }),
      this.keyboardShortcuts.register({
        key: 's',
        ctrlOrMeta: true,
        shiftKey: true,
        priority: 95,
        stopPropagation: true,
        isEnabled: () => this.active && !!this.editor,
        isInContext: (event) => this.isEditorShortcutContext(event),
        handler: () => {
          this.openVersionMessage()
          return true
        }
      }),
      this.keyboardShortcuts.register({
        key: 'f',
        altKey: true,
        shiftKey: true,
        priority: 90,
        stopPropagation: true,
        isEnabled: () => this.active && !!this.editor,
        isInContext: (event) => this.isEditorShortcutContext(event),
        handler: () => {
          this.formatCode()
          return true
        }
      }),
      this.keyboardShortcuts.register({
        key: 'Escape',
        priority: 60,
        stopPropagation: true,
        isEnabled: () => this.active && this.queryResultOpen,
        handler: () => {
          if (this.hasOpenEditorWidget()) return false

          this.closeQueryResult()
          return true
        }
      })
    )
  }

  private unregisterKeyboardShortcuts(): void {
    this.shortcutDisposers.forEach((dispose) => dispose())
    this.shortcutDisposers = []
  }

  private hasOpenEditorWidget(): boolean {
    const container = this.editorContainer?.nativeElement as HTMLElement | undefined
    if (!container) return false

    return Boolean(container.querySelector([
      '.suggest-widget.visible',
      '.parameter-hints-widget.visible',
      '.find-widget.visible',
      '.monaco-hover:not(.hidden)',
      '.rename-box'
    ].join(', ')))
  }

  private isEditorShortcutContext(event: KeyboardEvent): boolean {
    if (this.isSaveAsOpen || this.isHistoryOpen) return false

    const target = event.target as HTMLElement | null

    if (this.keyboardShortcuts.isEventInside(event, this.editorContainer?.nativeElement)) {
      return true
    }

    if (
      this.platform.isLinuxElectron() &&
      this.keyboardShortcuts.isEventInside(event, this.editorShell?.nativeElement)
    ) {
      return true
    }

    if (this.isTextInputTarget(target)) {
      return false
    }

    return this.keyboardShortcuts.isEventInside(event, this.codeEditorPanel?.nativeElement) ||
      target === document.body ||
      target === document.documentElement
  }

  private isTextInputTarget(target: HTMLElement | null): boolean {
    if (!target) return false

    return target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
  }

  runSelected(): void {
    const model = this.editor?.getModel()
    const selection = this.editor?.getSelection()

    if (model && selection) {
      const selectedText = model.getValueInRange(selection).trim()

      if (selectedText) {
        this.runSql(selectedText)
        return
      }

      const content = model.getValue()
      const cursorLine = selection.positionLineNumber || selection.startLineNumber
      const cursorColumn = selection.positionColumn || selection.startColumn
      const currentStatement = selectSqlStatementAtCursor(content, cursorLine, cursorColumn)

      if (currentStatement) {
        this.runSql(currentStatement)
        return
      }

      if (selection.startLineNumber === selection.endLineNumber && content.trim()) {
        const currentLineContent = model.getLineContent(cursorLine).trim()
        this.runSql(currentLineContent)
      }
    }
  }

  runAll(): void {
    this.runSql(this.editor?.getValue() || '')
  }

  formatCode(): void {
    const model = this.editor?.getModel()
    const selection = this.editor?.getSelection()
    if (!model || !selection) return

    const hasSelection = !selection.isEmpty()
    const range = hasSelection ? selection : model.getFullModelRange()
    const source = model.getValueInRange(range)
    if (!source.trim()) return

    const formatted = this.sqlFormatter.format(source, {
      indentSize: this.appSettings.getSqlFormatterIndentSize(),
      uppercaseKeywords: this.appSettings.shouldUppercaseSqlFormatterKeywords(),
      commaStyle: this.appSettings.getSqlFormatterCommaStyle(),
      blankLineBetweenStatements: this.appSettings.shouldAddBlankLineBetweenSqlStatements(),
      indentCreateBody: this.appSettings.shouldIndentSqlCreateBody()
    })

    if (formatted === source) return

    this.editor?.pushUndoStop()
    this.editor?.executeEdits('format-sql', [{
      range,
      text: formatted,
      forceMoveMarkers: true
    }])
    this.editor?.pushUndoStop()

  }

  async runSql(sql: string): Promise<void> {
    if (this.isLoadingQuery) return

    const shouldAnimateResultPanel = !this.queryResultOpen
    this.isLoadingMore = false
    this.isLoadingQuery = true
    this.queryResultOpen = true
    this.queryResultContentEntering = false
    if (shouldAnimateResultPanel) this.startResultPanelAnimation()
    this.queryError = ''
    this.queryReponse = []
    this.queryColumns = []
    this.maxResultLines = null
    this.queryExecutionTimeMs = null
    this.prepareResultLayout()
    this.persistQueryState()
    this.layoutEditor()

    try {
      this.queryFetchSize = this.normalizeQueryLimit(this.queryFetchSize)
      this.queryLines = this.queryFetchSize
      this.cacheSql = sql
      this.queryResultIsSelect = this.isReadOnlySelectSql(sql)

      const queryStart = performance.now()
      const result: any = await this.runQuery.runSQL(sql, this.queryLines, this.tabInfo?.dbInfo)
      this.queryExecutionTimeMs = performance.now() - queryStart
      this.queryReponse = result
      this.queryColumns = this.runQuery.getQueryColumns()
      this.maxResultLines = this.runQuery.getQueryLines()
      this.prepareResultLayout()
      this.persistQueryState()
      this.layoutEditor()
    } catch (error: any) {
      console.error(error)
      this.queryError = this.getQueryErrorMessage(error)
      this.queryReponse = []
      this.queryColumns = []
      this.maxResultLines = null
      this.queryExecutionTimeMs = null
      this.persistQueryState()
      this.layoutEditor()
    } finally {
      this.isLoadingQuery = false
      this.startResultContentAnimation()
      this.persistQueryState()
    }
  }

  async newValues(): Promise<void> {
    if (this.isLoadingMore) return
    if (this.maxResultLines === null || this.maxResultLines === undefined) return
    if (this.queryReponse.length >= this.maxResultLines) return

    this.isLoadingMore = true
    this.queryError = ''

    try {
      this.queryLines += this.queryFetchSize
      const queryStart = performance.now()
      const result: any = await this.runQuery.runSQL(this.cacheSql, this.queryLines, this.tabInfo?.dbInfo)
      this.queryExecutionTimeMs = performance.now() - queryStart
      this.queryReponse = result
      this.queryColumns = this.runQuery.getQueryColumns()
      this.persistQueryState()
    } catch (error: any) {
      console.error(error)
      this.queryError = this.getQueryErrorMessage(error)
      this.persistQueryState()
    } finally {
      this.isLoadingMore = false
    }
  }

  async saveAs(): Promise<void> {
    this.isSaveAsOpen = true

    const dbSchemas = this.tabInfo?.dbInfo || await this.dbSchemas.getSelectedSchemaDB()

    this.dataSave = {
      sql: this.editor?.getValue() || '',
      dataDbSchema: this.connectionContext.withoutRuntimeFields(dbSchemas),
      name: this.tabInfo?.persisted ? this.getCopyQueryName(this.tabInfo?.name) : '',
      folderPath: this.tabInfo?.folderPath || '',
      versioningEnabled: Boolean(this.tabInfo?.versioningEnabled)
    }
  }

  async savedSaveAs(savedQuery: SavedQuery): Promise<void> {
    this.applySavedQueryToTab(savedQuery)
    this.savedName.emit(savedQuery)
    this.savedQuery.emit(savedQuery)
  }

  async saveQuery(versionMessage?: string): Promise<void> {
    if (!this.tabInfo?.persisted) {
      const recoveredPersistedQuery = await this.recoverLinuxPersistedQueryIdentity()
      if (!recoveredPersistedQuery) {
        await this.saveAs()
        return
      }
    }

    try {
      const dbSchemas = this.tabInfo?.dbInfo || await this.dbSchemas.getSelectedSchemaDB()
      const sql = this.editor?.getValue() || ''
      const payload = this.buildSavedQueryPayload(sql, dbSchemas, versionMessage)

      const updatedQuery = await this.querySave.updateQuery(Number(this.tabInfo.id), payload)

      this.applySavedQueryToTab(updatedQuery)
      this.savedQuery.emit(updatedQuery)
      this.toast.showToast(this.t('editor.savedSuccessfully'), 'green')
    } catch (error: any) {
      console.error(error)

      if (this.isQueryNotFoundError(error)) {
        await this.saveAs()
        return
      }

      this.toast.showToast(error?.error || error?.message || this.t('editor.saveError'), 'red')
    }
  }

  async closeSaveAs(): Promise<void> {
    this.isSaveAsOpen = false
  }

  onQueryFetchSizeChange(size: number): void {
    this.queryFetchSize = this.normalizeQueryLimit(size)
    this.persistQueryState()
  }

  async refreshQueryWithFetchSize(): Promise<void> {
    if (!this.cacheSql) return

    await this.runSql(this.cacheSql)
  }

  closeQueryResult(): void {
    this.releaseQueryMemory()
    this.persistQueryState()
    this.layoutEditor()
  }

  private releaseQueryMemory(): void {
    this.clearResultAnimations()
    this.tableQuery?.releaseData()
    this.queryReponse = []
    this.queryColumns = []
    this.queryResultOpen = false
    this.isLoadingQuery = false
    this.isLoadingMore = false
    this.queryError = ''
    this.maxResultLines = 0
    this.queryExecutionTimeMs = null
    this.queryResultExpanded = false
    this.queryResultIsSelect = false

    if (this.tabInfo?.queryState) {
      this.tabInfo.queryState.queryResponse = []
      this.tabInfo.queryState.queryColumns = []
      this.tabInfo.queryState.queryResultOpen = false
      this.tabInfo.queryState.queryError = ''
      this.tabInfo.queryState.maxResultLines = 0
      this.tabInfo.queryState.queryExecutionTimeMs = null
    }
  }

  onQueryResultHeightChange(height: number): void {
    this.queryResultExpanded = false
    this.queryResultHeight = this.normalizeResultHeight(height)
    this.previousQueryResultHeight = this.queryResultHeight
    this.persistQueryState()
    this.layoutEditor()
  }

  toggleQueryResultExpanded(): void {
    if (this.queryResultExpanded) {
      this.queryResultExpanded = false
      this.queryResultHeight = this.normalizeResultHeight(this.previousQueryResultHeight)
    } else {
      this.previousQueryResultHeight = this.queryResultHeight
      this.queryResultExpanded = true
      this.queryResultHeight = this.getExpandedResultHeight()
    }

    this.persistQueryState()
    this.layoutEditor()
  }

  private restoreQueryState(): void {
    const queryState = this.tabInfo?.queryState
    const defaultQueryRows = this.appSettings.getDefaultQueryRows()

    this.cacheSql = queryState?.cacheSql || ''
    this.queryReponse = queryState?.queryResponse || []
    this.queryColumns = queryState?.queryColumns || []
    this.queryError = queryState?.queryError || ''
    this.queryResultOpen = queryState?.queryResultOpen ?? (this.queryReponse.length > 0 || !!this.queryError)
    this.isLoadingQuery = false
    this.queryLines = queryState?.queryLines ?? defaultQueryRows
    this.queryFetchSize = queryState?.queryFetchSize ?? defaultQueryRows
    this.previousQueryResultHeight = this.normalizeResultHeight(queryState?.previousQueryResultHeight ?? this.defaultResultHeight)
    this.queryResultExpanded = queryState?.queryResultExpanded ?? false
    this.queryResultIsSelect = queryState?.queryResultIsSelect ?? this.isReadOnlySelectSql(this.cacheSql)
    this.queryResultHeight = this.queryResultExpanded
      ? this.getExpandedResultHeight()
      : this.normalizeResultHeight(queryState?.queryResultHeight ?? this.defaultResultHeight)
    this.maxResultLines = queryState?.maxResultLines ?? 0
    this.queryExecutionTimeMs = queryState?.queryExecutionTimeMs ?? null
    this.layoutEditor()
  }

  private persistQueryState(): void {
    if (!this.tabInfo) return

    this.tabInfo.queryState = {
      cacheSql: this.cacheSql,
      queryResponse: this.queryReponse,
      queryColumns: this.queryColumns,
      queryResultOpen: this.queryResultOpen,
      queryError: this.queryError,
      queryLines: this.queryLines,
      queryFetchSize: this.queryFetchSize,
      queryResultHeight: this.queryResultHeight,
      previousQueryResultHeight: this.previousQueryResultHeight,
      queryResultExpanded: this.queryResultExpanded,
      queryResultIsSelect: this.queryResultIsSelect,
      maxResultLines: this.maxResultLines,
      queryExecutionTimeMs: this.queryExecutionTimeMs
    }
  }

  private isReadOnlySelectSql(sql: string): boolean {
    return /^\s*(?:\/\*[\s\S]*?\*\/\s*|--[^\n]*\n\s*)*(?:with\b[\s\S]+?\bselect\b|select\b)/i.test(sql || '')
  }

  private normalizeQueryLimit(size: number): number {
    const parsed = Number(size)
    if (!Number.isFinite(parsed) || parsed < 1) return this.appSettings.getDefaultQueryRows()

    return Math.floor(parsed)
  }

  private normalizeResultHeight(height: number): number {
    const parsed = Number(height)
    const maxHeight = this.getMaxResultHeight()

    if (!Number.isFinite(parsed)) return this.defaultResultHeight

    return Math.min(Math.max(Math.floor(parsed), this.minimumResultHeight), maxHeight)
  }

  private getExpandedResultHeight(): number {
    return this.getPanelHeight()
  }

  private getMaxResultHeight(): number {
    const panelHeight = this.getPanelHeight()

    return Math.max(this.minimumResultHeight, Math.floor(panelHeight - this.minimumEditorHeight))
  }

  private getPanelHeight(): number {
    return this.codeEditorPanel?.nativeElement?.clientHeight || Math.max(420, window.innerHeight - 180)
  }

  private prepareResultLayout(): void {
    if (this.queryResultExpanded) {
      this.queryResultHeight = this.getExpandedResultHeight()
      return
    }

    this.queryResultHeight = this.normalizeResultHeight(this.queryResultHeight || this.defaultResultHeight)
  }

  private layoutEditor(): void {
    setTimeout(() => this.editor?.layout(), 0)
  }

  private startResultPanelAnimation(): void {
    if (this.resultPanelAnimationTimer) clearTimeout(this.resultPanelAnimationTimer)

    this.queryResultPanelOpening = true
    this.resultPanelAnimationTimer = setTimeout(() => {
      this.queryResultPanelOpening = false
      this.resultPanelAnimationTimer = null
    }, 260)
  }

  private startResultContentAnimation(): void {
    this.queryResultContentEntering = false

    if (this.resultContentAnimationFrame !== null) {
      window.cancelAnimationFrame(this.resultContentAnimationFrame)
    }
    if (this.resultContentAnimationTimer) clearTimeout(this.resultContentAnimationTimer)

    this.resultContentAnimationFrame = window.requestAnimationFrame(() => {
      this.resultContentAnimationFrame = null
      this.queryResultContentEntering = true
      this.resultContentAnimationTimer = setTimeout(() => {
        this.queryResultContentEntering = false
        this.resultContentAnimationTimer = null
      }, 380)
    })
  }

  private clearResultAnimations(): void {
    if (this.resultPanelAnimationTimer) clearTimeout(this.resultPanelAnimationTimer)
    if (this.resultContentAnimationTimer) clearTimeout(this.resultContentAnimationTimer)
    if (this.resultContentAnimationFrame !== null) window.cancelAnimationFrame(this.resultContentAnimationFrame)

    this.resultPanelAnimationTimer = null
    this.resultContentAnimationTimer = null
    this.resultContentAnimationFrame = null
    this.queryResultPanelOpening = false
    this.queryResultContentEntering = false
  }

  private refreshVisibleLayout(focusEditor: boolean = false): void {
    setTimeout(() => {
      this.editor?.layout()
      this.tableQuery?.refreshVisibleGrid()
      if (focusEditor && !this.queryResultExpanded) {
        this.editor?.focus()
      }

      window.requestAnimationFrame(() => {
        this.editor?.layout()
        this.tableQuery?.refreshVisibleGrid()
        if (focusEditor && !this.queryResultExpanded) {
          this.editor?.focus()
        }
      })
    }, 0)
  }

  private getQueryErrorMessage(error: any): string {
    return error?.error || error?.message || this.t('editor.executeError')
  }

  private buildSavedQueryPayload(sql: string, dbSchemas: any, versionMessage?: string): SavedQueryInput {
    return {
      name: this.tabInfo?.name || this.t('editor.untitledQuery'),
      type: 'sql',
      sql,
      dbSchema: this.connectionContext.withoutRuntimeFields(dbSchemas),
      folderPath: this.tabInfo?.folderPath || '',
      versioningEnabled: Boolean(this.tabInfo?.versioningEnabled),
      versionMessage: this.canUseVersionMessage ? versionMessage : undefined
    }
  }

  private applySavedQueryToTab(savedQuery: SavedQuery): void {
    if (!this.tabInfo) return

    this.tabInfo.id = savedQuery.id
    this.tabInfo.name = savedQuery.name
    this.tabInfo.info = {
      ...this.tabInfo.info,
      sql: savedQuery.sql
    }
    this.tabInfo.originalContent = savedQuery.sql
    this.tabInfo.dbInfo = savedQuery.dbSchema || this.tabInfo.dbInfo
    this.tabInfo.folderPath = savedQuery.folderPath || ''
    this.tabInfo.versioningEnabled = Boolean(savedQuery.versioningEnabled)
    this.tabInfo.updatedAt = savedQuery.updatedAt
    this.tabInfo.createdAt = savedQuery.createdAt
    this.tabInfo.versions = savedQuery.versions || []
    this.tabInfo.persisted = true
    this.tabInfo.icon = 'CODE'
    this.updateSqlChangeDecorations(savedQuery.sql)
  }

  private async recoverLinuxPersistedQueryIdentity(): Promise<boolean> {
    if (!this.platform.isLinuxElectron() || !this.tabInfo) return false

    try {
      const savedQueries = await this.querySave.loadQueries()
      const recoveredQuery = this.findMatchingSavedQuery(savedQueries)
      if (!recoveredQuery) return false

      this.tabInfo.id = recoveredQuery.id
      this.tabInfo.name = recoveredQuery.name
      this.tabInfo.dbInfo = recoveredQuery.dbSchema || this.tabInfo.dbInfo
      this.tabInfo.folderPath = recoveredQuery.folderPath || ''
      this.tabInfo.versioningEnabled = Boolean(recoveredQuery.versioningEnabled)
      this.tabInfo.updatedAt = recoveredQuery.updatedAt
      this.tabInfo.createdAt = recoveredQuery.createdAt
      this.tabInfo.versions = recoveredQuery.versions || []
      this.tabInfo.persisted = true

      return true
    } catch (error) {
      console.warn('Could not recover saved query identity on Linux:', error)
      return false
    }
  }

  private findMatchingSavedQuery(savedQueries: SavedQuery[]): SavedQuery | null {
    const tabId = Number(this.tabInfo?.id)

    if (Number.isFinite(tabId)) {
      const queryById = savedQueries.find((query) => Number(query.id) === tabId)
      if (queryById) return queryById
    }

    const tabName = String(this.tabInfo?.name || '').trim().toLowerCase()
    if (!tabName) return null

    const hasSavedQueryMetadata = Boolean(
      this.tabInfo?.createdAt ||
      this.tabInfo?.updatedAt ||
      this.tabInfo?.folderPath ||
      this.tabInfo?.versions?.length
    )
    if (!hasSavedQueryMetadata) return null

    const tabFolderPath = this.querySave.normalizeFolderPath(this.tabInfo?.folderPath || '').toLowerCase()
    const queriesByPath = savedQueries.filter((query) =>
      query.name.trim().toLowerCase() === tabName &&
      this.querySave.normalizeFolderPath(query.folderPath || '').toLowerCase() === tabFolderPath
    )

    return queriesByPath.length === 1 ? queriesByPath[0] : null
  }

  private isQueryNotFoundError(error: any): boolean {
    const message = String(error?.error || error?.message || '').toLowerCase()
    return message.includes('not found')
  }

  private getCopyQueryName(name: string): string {
    const baseName = String(name || this.t('editor.untitledQuery')).trim()
    const suffix = this.t('editor.copySuffix')
    const maxBaseLength = this.querySave.maxQueryNameLength - suffix.length

    return `${baseName.substring(0, maxBaseLength)}${suffix}`
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}
