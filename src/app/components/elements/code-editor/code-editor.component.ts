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
import { AppSettingsService, SqlHighlightColors } from '../../../services/app-settings/app-settings.service'
import { SqlTableAutocompleteService } from '../../../services/code-autocomplete/sql-table-autocomplete.service'
import { SqlCodeFormatterService } from '../../../services/code-formatting/sql-code-formatter.service'
import { SqlSyntaxMonacoMarkersService } from '../../../services/sql-validation/sql-syntax-monaco-markers.service'
import { QuerySaveService, SavedQuery, SavedQueryInput } from '../../../services/query-save/query-save.service'
import { KeyboardShortcutService } from '../../../services/keyboard-shortcuts/keyboard-shortcut.service'
import { AppLanguageService } from '../../../services/language/app-language.service'
import { AppPlatformService } from '../../../services/platform/app-platform.service'

let sqlTokenizerConfigured = false

interface SqlNavigationToken {
  value: string
  lower: string
  start: number
  end: number
}

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
  @Output() savedName = new EventEmitter<SavedQuery>()
  @Output() savedQuery = new EventEmitter<any>()
  @Output() objectInfoRequested = new EventEmitter<any>()
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
  private languageSubscription?: Subscription
  private shortcutDisposers: Array<() => void> = []
  private editorActionDisposables: monaco.IDisposable[] = []
  private editorMouseDisposables: monaco.IDisposable[] = []
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
    private platform: AppPlatformService
  ) {
    this.settingsSubscription = this.appSettings.settingsChanges$.subscribe((settings) => {
      this.applySqlHighlightTheme(settings.sqlHighlightColors)
    })
    this.languageSubscription = this.language.languageChanges$.subscribe(() => {
      this.registerEditorContextMenuActions()
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
    this.syntaxValidationDisposable?.dispose()
    this.settingsSubscription?.unsubscribe()
    this.languageSubscription?.unsubscribe()
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
      quickSuggestions: { other: 'on', comments: 'off', strings: 'on' },
      quickSuggestionsDelay: 250,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
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
      inherit: false,
      rules: this.buildSqlTokenRules(normalizedColors),
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

  private buildSqlTokenRules(colors: SqlHighlightColors): monaco.editor.ITokenThemeRule[] {
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
      if (value !== this.sqlContent) {
        this.sqlContent = value
        this.sqlContentChange.emit(value)
      }
    })

    const mouseDownDisposable = this.editor?.onMouseDown((event) => {
      void this.handleEditorMouseDown(event)
    })

    if (mouseDownDisposable) {
      this.editorMouseDisposables.push(mouseDownDisposable)
    }
  }

  private disposeEditorMouseActions(): void {
    this.editorMouseDisposables.forEach((disposable) => disposable.dispose())
    this.editorMouseDisposables = []
  }

  private registerEditorContextMenuActions(): void {
    this.disposeEditorContextMenuActions()

    const indentAction = this.editor?.addAction({
      id: 'dbolt.indentSql',
      label: this.t('editor.indentCode'),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
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
    if (!event.event.ctrlKey && !event.event.metaKey) return

    const browserEvent = event.event.browserEvent
    if (browserEvent instanceof MouseEvent && browserEvent.button !== 0) return

    const navigationTarget = this.resolveSqlNavigationTarget(event.target.position)
    if (!navigationTarget) return

    event.event.preventDefault()
    browserEvent?.preventDefault()

    this.objectInfoRequested.emit({
      ...navigationTarget,
      context: this.tabInfo?.dbInfo,
      info: this.tabInfo?.dbInfo
    })
  }

  private resolveSqlNavigationTarget(position: monaco.Position): { name: string, initialView?: 'columns' } | null {
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
        name: aliases.get(clickedKey) || clickedName
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
          name: tableName,
          initialView: 'columns'
        }
      }
    }

    if (this.isTableReferenceToken(tokens, clickedIdentifier.statementOffset)) {
      return {
        name: clickedName
      }
    }

    const uniqueTableName = this.getUniqueStatementTableName(aliases)
    if (uniqueTableName) {
      return {
        name: uniqueTableName,
        initialView: 'columns'
      }
    }

    return null
  }

  private getIdentifierAtPosition(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): { value: string, offset: number, statementOffset: number } | null {
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
      statementOffset: offset - statementStart
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

    const tableName = this.normalizeIdentifier(this.getIdentifierLastPart(tableReference.value))
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

  private registerKeyboardShortcuts(): void {
    this.unregisterKeyboardShortcuts()

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
      })
    )
  }

  private unregisterKeyboardShortcuts(): void {
    this.shortcutDisposers.forEach((dispose) => dispose())
    this.shortcutDisposers = []
  }

  private isEditorShortcutContext(event: KeyboardEvent): boolean {
    if (this.isSaveAsOpen) return false

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

    this.isLoadingMore = false
    this.isLoadingQuery = true
    this.queryResultOpen = true
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

  async saveQuery(): Promise<void> {
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
      const payload = this.buildSavedQueryPayload(sql, dbSchemas)

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

  private buildSavedQueryPayload(sql: string, dbSchemas: any): SavedQueryInput {
    return {
      name: this.tabInfo?.name || this.t('editor.untitledQuery'),
      type: 'sql',
      sql,
      dbSchema: this.connectionContext.withoutRuntimeFields(dbSchemas),
      folderPath: this.tabInfo?.folderPath || '',
      versioningEnabled: Boolean(this.tabInfo?.versioningEnabled)
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
