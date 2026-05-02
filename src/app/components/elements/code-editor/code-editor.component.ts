import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy, OnChanges, SimpleChanges, HostListener } from '@angular/core'
import { CommonModule } from '@angular/common'
import * as monaco from 'monaco-editor'
import { Subscription } from 'rxjs'
import { GetDbschemaService } from '../../../services/db-info/get-dbschema.service'
import { RunQueryService } from '../../../services/db-query/run-query.service'
import { ToastComponent } from '../../toast/toast.component'
import { TableQueryComponent } from "../table-query/table-query.component"
import { SaveQueryComponent } from "../../modal/save-query/save-query.component"
import { InternalApiService } from '../../../services/requests/internal-api.service'
import { ConnectionContextService } from '../../../services/connection-context/connection-context.service'
import { AppSettingsService, SqlHighlightColors } from '../../../services/app-settings/app-settings.service'
import { SqlTableAutocompleteService } from '../../../services/code-autocomplete/sql-table-autocomplete.service'
import { SqlCodeFormatterService } from '../../../services/code-formatting/sql-code-formatter.service'

let sqlTokenizerConfigured = false

@Component({
  selector: 'app-code-editor',
  standalone: true,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss'],
  imports: [TableQueryComponent, CommonModule, ToastComponent, SaveQueryComponent],
})
export class CodeEditorComponent implements AfterViewChecked, OnDestroy, OnChanges {
  @Input() sqlContent: string = ''
  @Output() sqlContentChange = new EventEmitter<string>()
  @Output() savedName = new EventEmitter<string>()
  @Output() savedQuery = new EventEmitter<any>()
  @Input() widthTable: number = 300
  @Input() tabInfo: any
  @Input() active: boolean = false

  @ViewChild('editorContainer') editorContainer!: ElementRef
  @ViewChild('codeEditorPanel') codeEditorPanel!: ElementRef<HTMLDivElement>
  @ViewChild(ToastComponent) toast!: ToastComponent
  @ViewChild(TableQueryComponent) tableQuery?: TableQueryComponent
  @ViewChild(SaveQueryComponent) saveConnection!: SaveQueryComponent

  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private initialized = false
  private autocompleteDisposable?: monaco.IDisposable
  private settingsSubscription?: Subscription
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

  dataSave: any = {}

  constructor(
    private dbSchemas: GetDbschemaService,
    private runQuery: RunQueryService,
    private IAPI: InternalApiService,
    private connectionContext: ConnectionContextService,
    private appSettings: AppSettingsService,
    private tableAutocomplete: SqlTableAutocompleteService,
    private sqlFormatter: SqlCodeFormatterService
  ) {
    this.settingsSubscription = this.appSettings.settingsChanges$.subscribe((settings) => {
      this.applySqlHighlightTheme(settings.sqlHighlightColors)
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
      this.refreshVisibleLayout()
    }

    if (this.editor && this.sqlContent !== this.editor.getValue()) {
      this.editor.setValue(this.sqlContent || '')
    }
  }

  ngOnDestroy(): void {
    if (this.tabInfo?.closing) {
      this.releaseQueryMemory()
    } else {
      this.persistQueryState()
    }

    this.autocompleteDisposable?.dispose()
    this.settingsSubscription?.unsubscribe()

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
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      renderWhitespace: 'none',
      stickyScroll: { enabled: false },
      folding: false,
      fontFamily: 'Nunito',
      selectionHighlight: false,
      quickSuggestions: { other: true, comments: false, strings: false },
      quickSuggestionsDelay: 250,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      contextmenu: false
    })

    this.autocompleteDisposable = this.tableAutocomplete.registerEditor(
      this.editor,
      () => this.tabInfo?.dbInfo,
      () => this.active
    )

    this.initializeEditorEvents()
  }

  private configureSqlLanguage(): void {
    if (sqlTokenizerConfigured) return

    monaco.languages.setMonarchTokensProvider('sql', {
      ignoreCase: true,
      defaultToken: 'identifier',
      keywords: [
        'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'authorization', 'backup', 'begin',
        'between', 'break', 'by', 'cascade', 'case', 'check', 'close', 'clustered', 'coalesce',
        'collate', 'column', 'commit', 'constraint', 'continue', 'create', 'cross', 'current',
        'current_date', 'current_time', 'current_timestamp', 'cursor', 'database', 'declare',
        'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'escape', 'except',
        'exec', 'execute', 'exists', 'fetch', 'for', 'foreign', 'from', 'full', 'go', 'grant',
        'group', 'having', 'if', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is',
        'join', 'key', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'open', 'or',
        'order', 'outer', 'over', 'primary', 'procedure', 'references', 'right', 'rollback',
        'rownum', 'schema', 'select', 'set', 'table', 'then', 'to', 'top', 'transaction',
        'truncate', 'union', 'unique', 'update', 'use', 'values', 'view', 'when', 'where',
        'while', 'with'
      ],
      types: [
        'bigint', 'binary', 'bit', 'blob', 'boolean', 'char', 'clob', 'date', 'datetime',
        'datetime2', 'decimal', 'double', 'float', 'image', 'int', 'integer', 'json',
        'longtext', 'money', 'nchar', 'ntext', 'numeric', 'nvarchar', 'real', 'serial',
        'smallint', 'smallmoney', 'text', 'time', 'timestamp', 'tinyint', 'uniqueidentifier',
        'uuid', 'varbinary', 'varchar', 'xml'
      ],
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/'(?:''|[^'])*'/, 'string'],
          [/"(?:""|[^"])*"/, 'identifier'],
          [/`(?:``|[^`])*`/, 'identifier'],
          [/\[(?:\]\]|[^\]])*\]/, 'identifier'],
          [/\b\d+(?:\.\d+)?\b/, 'number'],
          [/@[a-zA-Z_][\w$#]*/, 'variable'],
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
              '@default': 'identifier'
            }
          }],
          [/[<>!~?:&|+\-*\/%^=]+/, 'operator'],
          [/[;,.]/, 'delimiter'],
          [/[()]/, 'delimiter']
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

    const transparentEditorColors = {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'editorLineHighlightBorder': '#00000000',
      'editorLineHighlightBackground': '#00000000',
      'editorWidget.border': '#00000000',
      'focusBorder': '#00000000'
    }

    monaco.editor.defineTheme('dbolt-sql-configurable', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: this.toMonacoColor(normalizedColors.keyword), fontStyle: 'bold' },
        { token: 'function', foreground: this.toMonacoColor(normalizedColors.function), fontStyle: 'bold' },
        { token: 'identifier', foreground: this.toMonacoColor(normalizedColors.identifier) },
        { token: 'string', foreground: this.toMonacoColor(normalizedColors.string) },
        { token: 'number', foreground: this.toMonacoColor(normalizedColors.number) },
        { token: 'comment', foreground: this.toMonacoColor(normalizedColors.comment), fontStyle: 'italic' },
        { token: 'operator', foreground: this.toMonacoColor(normalizedColors.operator), fontStyle: 'bold' },
        { token: 'type', foreground: this.toMonacoColor(normalizedColors.type) },
        { token: 'variable', foreground: this.toMonacoColor(normalizedColors.variable) },
        { token: 'delimiter', foreground: this.toMonacoColor(normalizedColors.delimiter) }
      ],
      colors: {
        ...transparentEditorColors,
        'editor.foreground': normalizedColors.identifier,
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editorCursor.foreground': '#ffffff',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41'
      }
    })
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
    this.editor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      this.runSelected()
    })

    this.editor?.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.saveQuery()
    })

    this.editor?.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() || ''
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })
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
      const cursorLine = selection.startLineNumber

      const blocks = content
        .split(/(?:\n\s*\n|;)/gm)
        .map(block => block.trim())
        .filter(block => block.length > 0)

      let currentLine = 1

      for (const block of blocks) {
        const blockLines = block.split('\n').filter(line => line.trim().length > 0)
        const blockStartLine = currentLine
        const blockEndLine = currentLine + blockLines.length - 1

        if (cursorLine >= blockStartLine && cursorLine <= blockEndLine) {
          this.runSql(block)
          return
        }

        currentLine = blockEndLine + 1
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
      uppercaseKeywords: this.appSettings.shouldUppercaseSqlFormatterKeywords()
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
    this.isLoadingMore = false
    this.isLoadingQuery = true
    this.queryResultOpen = true
    this.queryError = ''
    this.queryReponse = []
    this.queryColumns = []
    this.maxResultLines = null
    this.prepareResultLayout()
    this.persistQueryState()
    this.layoutEditor()

    try {
      this.queryFetchSize = this.normalizeQueryLimit(this.queryFetchSize)
      this.queryLines = this.queryFetchSize
      this.cacheSql = sql
      this.queryResultIsSelect = this.isReadOnlySelectSql(sql)

      const result: any = await this.runQuery.runSQL(sql, this.queryLines, this.tabInfo?.dbInfo)
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
      this.persistQueryState()
      this.layoutEditor()
    } finally {
      this.isLoadingQuery = false
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
      const result: any = await this.runQuery.runSQL(this.cacheSql, this.queryLines, this.tabInfo?.dbInfo)
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
      dataDbSchema: this.connectionContext.withoutRuntimeFields(dbSchemas)
    }
  }

  async savedSaveAs(name: any): Promise<void> {
    this.savedName.emit(name)
  }

  async saveQuery(): Promise<void> {
    try {
      const dbSchemas = this.tabInfo?.dbInfo || await this.dbSchemas.getSelectedSchemaDB()

      this.dataSave = {
        id: this.tabInfo?.id,
        name: this.tabInfo?.name,
        type: 'sql',
        sql: this.editor?.getValue() || '',
        originalContent: this.editor?.getValue() || '',
        icon: 'CODE',
        dbSchema: this.connectionContext.withoutRuntimeFields(dbSchemas)
      }

      await this.IAPI.put('/api/query/' + this.tabInfo.id, this.dataSave)

      this.savedQuery.emit(this.dataSave)
      this.toast.showToast('Saved successfully ', 'green')
    } catch (error: any) {
      this.saveAs()
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
    this.tableQuery?.releaseData()
    this.queryReponse = []
    this.queryColumns = []
    this.queryResultOpen = false
    this.isLoadingQuery = false
    this.isLoadingMore = false
    this.queryError = ''
    this.maxResultLines = 0
    this.queryResultExpanded = false
    this.queryResultIsSelect = false

    if (this.tabInfo?.queryState) {
      this.tabInfo.queryState.queryResponse = []
      this.tabInfo.queryState.queryColumns = []
      this.tabInfo.queryState.queryResultOpen = false
      this.tabInfo.queryState.queryError = ''
      this.tabInfo.queryState.maxResultLines = 0
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
      maxResultLines: this.maxResultLines
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

  private refreshVisibleLayout(): void {
    setTimeout(() => {
      this.editor?.layout()
      this.tableQuery?.refreshVisibleGrid()

      window.requestAnimationFrame(() => {
        this.editor?.layout()
        this.tableQuery?.refreshVisibleGrid()
      })
    }, 0)
  }

  private getQueryErrorMessage(error: any): string {
    return error?.error || error?.message || 'Could not execute query.'
  }
}
