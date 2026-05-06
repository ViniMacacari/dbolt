import { Injectable } from '@angular/core'
import * as monaco from 'monaco-editor'
import { AppSettingsService } from '../app-settings/app-settings.service'
import { type TableAutocompleteItem, TableAutocompleteSourceService } from './table-autocomplete-source.service'
import { ColumnAutocompleteItem, ColumnAutocompleteSourceService } from './column-autocomplete-source.service'

interface RegisteredEditor {
  getContext: () => any
  isActive: () => boolean
}

interface TableCompletionRequest {
  type: 'table'
  fragment: string
  rawFragment: string
  range: monaco.IRange
}

interface ColumnCompletionRequest {
  type: 'column'
  tableName: string
  qualifier: string
  fragment: string
  range: monaco.IRange
}

type SqlCompletionRequest = TableCompletionRequest | ColumnCompletionRequest
type IdentifierQuote = '"' | '`' | '['

interface SqlToken {
  value: string
  lower: string
}

interface TableSuggestRefreshState {
  lastTriggeredFragment: string
  pauseTimer: ReturnType<typeof setTimeout> | null
}

@Injectable({
  providedIn: 'root'
})
export class SqlTableAutocompleteService {
  private providerDisposable?: monaco.IDisposable
  private readonly editors = new Map<string, RegisteredEditor>()
  private readonly minimumFragmentLength = 3
  private readonly maxSuggestions = 50
  private readonly tableSuggestSequentialCharacters = 2
  private readonly tableSuggestPauseDelayMs = 220
  private readonly sqlReservedWords = new Set([
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
    'insert',
    'into',
    'join',
    'left',
    'limit',
    'not',
    'offset',
    'on',
    'or',
    'order',
    'outer',
    'right',
    'select',
    'set',
    'then',
    'top',
    'union',
    'update',
    'values',
    'when',
    'with',
    'where'
  ])

  constructor(
    private settings: AppSettingsService,
    private tableSource: TableAutocompleteSourceService,
    private columnSource: ColumnAutocompleteSourceService
  ) { }

  registerEditor(
    editor: monaco.editor.IStandaloneCodeEditor,
    getContext: () => any,
    isActive: () => boolean
  ): monaco.IDisposable {
    this.ensureProviderRegistered()

    const model = editor.getModel()
    if (!model) {
      return { dispose: () => undefined }
    }

    const modelKey = this.getModelKey(model)
    this.editors.set(modelKey, { getContext, isActive })
    const autoQuoteDisposable = editor.onDidChangeModelContent((event) => {
      this.autoQuoteTypedColumn(editor, getContext, isActive, event)
    })
    const tableSuggestRefreshDisposable = this.registerControlledTableSuggestRefresh(editor, isActive)

    return {
      dispose: () => {
        this.editors.delete(modelKey)
        autoQuoteDisposable.dispose()
        tableSuggestRefreshDisposable.dispose()
      }
    }
  }

  private registerControlledTableSuggestRefresh(
    editor: monaco.editor.IStandaloneCodeEditor,
    isActive: () => boolean
  ): monaco.IDisposable {
    const state: TableSuggestRefreshState = {
      lastTriggeredFragment: '',
      pauseTimer: null
    }

    const clearPauseTimer = () => {
      if (!state.pauseTimer) return

      clearTimeout(state.pauseTimer)
      state.pauseTimer = null
    }

    const resetState = () => {
      clearPauseTimer()
      state.lastTriggeredFragment = ''
    }

    const changeDisposable = editor.onDidChangeModelContent((event) => {
      clearPauseTimer()

      if (
        !isActive() ||
        !this.settings.isTableAutocompleteEnabled() ||
        this.settings.getTableAutocompleteMatchMode() !== 'contains'
      ) {
        resetState()
        return
      }

      const fragment = this.getCurrentTableSuggestFragment(editor)
      if (!fragment) {
        resetState()
        return
      }

      if (this.isDeletingTableFragment(event, fragment, state.lastTriggeredFragment)) {
        this.schedulePausedTableSuggestRefresh(editor, isActive, state)
        return
      }

      if (fragment === state.lastTriggeredFragment) {
        return
      }

      if (this.shouldRefreshTableSuggestions(fragment, state.lastTriggeredFragment)) {
        this.triggerTableSuggest(editor, state, fragment)
        return
      }

      this.schedulePausedTableSuggestRefresh(editor, isActive, state)
    })

    return {
      dispose: () => {
        clearPauseTimer()
        changeDisposable.dispose()
      }
    }
  }

  private schedulePausedTableSuggestRefresh(
    editor: monaco.editor.IStandaloneCodeEditor,
    isActive: () => boolean,
    state: TableSuggestRefreshState
  ): void {
    state.pauseTimer = setTimeout(() => {
      state.pauseTimer = null

      if (!isActive() || !this.settings.isTableAutocompleteEnabled()) {
        state.lastTriggeredFragment = ''
        return
      }

      const currentFragment = this.getCurrentTableSuggestFragment(editor)
      if (!currentFragment) {
        state.lastTriggeredFragment = ''
        return
      }

      this.triggerTableSuggest(editor, state, currentFragment)
    }, this.tableSuggestPauseDelayMs)
  }

  private isDeletingTableFragment(
    event: monaco.editor.IModelContentChangedEvent,
    fragment: string,
    lastTriggeredFragment: string
  ): boolean {
    if (lastTriggeredFragment.startsWith(fragment) && fragment.length < lastTriggeredFragment.length) {
      return true
    }

    return event.changes.some((change) => change.rangeLength > change.text.length)
  }

  private getCurrentTableSuggestFragment(editor: monaco.editor.IStandaloneCodeEditor): string {
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) return ''

    const beforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
    if (this.isInsideStringOrComment(beforeCursor)) {
      return ''
    }

    const fragmentMatch = beforeCursor.match(/([A-Za-z0-9_$#.`"\[\]]*)$/)
    const rawFragment = fragmentMatch?.[1] || ''
    const fragment = this.normalizeIdentifier(rawFragment).toLowerCase()

    if (fragment.length < this.minimumFragmentLength) {
      return ''
    }

    const beforeFragment = beforeCursor.slice(0, beforeCursor.length - rawFragment.length)
    return this.isTableNameContext(beforeFragment)
      ? fragment
      : ''
  }

  private shouldRefreshTableSuggestions(fragment: string, lastTriggeredFragment: string): boolean {
    if (!lastTriggeredFragment) {
      return true
    }

    if (!fragment.startsWith(lastTriggeredFragment)) {
      return true
    }

    return fragment.length - lastTriggeredFragment.length >= this.tableSuggestSequentialCharacters
  }

  private triggerTableSuggest(
    editor: monaco.editor.IStandaloneCodeEditor,
    state: TableSuggestRefreshState,
    fragment: string
  ): void {
    state.lastTriggeredFragment = fragment

    const suggestController = editor.getContribution('editor.contrib.suggestController') as {
      triggerSuggest?: (onlyFrom?: unknown, auto?: boolean, noFilter?: boolean) => void
    } | null

    if (suggestController?.triggerSuggest) {
      suggestController.triggerSuggest(undefined, true)
      return
    }

    void editor.getAction('editor.action.triggerSuggest')?.run()
  }

  private ensureProviderRegistered(): void {
    if (this.providerDisposable) return

    this.providerDisposable = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '_', '.', '"', '`', '['],
      provideCompletionItems: async (model, position, _context, token) => {
        const editorInfo = this.editors.get(this.getModelKey(model))
        if (!editorInfo?.isActive()) {
          return { suggestions: [] }
        }

        const request = this.resolveCompletionRequest(model, position)
        if (!request) {
          return { suggestions: [] }
        }

        if (request.type === 'column') {
          return this.provideColumnSuggestions(editorInfo, request)
        }

        if (!this.settings.isTableAutocompleteEnabled()) {
          return { suggestions: [] }
        }

        try {
          const context = editorInfo.getContext()
          const tables = await this.tableSource.getTableSuggestions(
            context,
            request.fragment,
            this.settings.getTableAutocompleteMatchMode(),
            this.maxSuggestions,
            { shouldCancel: () => token.isCancellationRequested }
          )
          if (token.isCancellationRequested) {
            return { suggestions: [] }
          }

          const suggestions = tables
            .map((table) => this.toSuggestion(table, request, context))

          return {
            suggestions
          }
        } catch (error) {
          console.warn('Could not load table autocomplete suggestions:', error)
          return { suggestions: [] }
        }
      }
    })
  }

  private resolveCompletionRequest(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): SqlCompletionRequest | null {
    const lineText = model.getLineContent(position.lineNumber)
    const beforeCursor = lineText.slice(0, position.column - 1)
    const textBeforePosition = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    })

    if (this.isInsideStringOrComment(textBeforePosition)) {
      return null
    }

    const columnRequest = this.resolveColumnCompletionRequest(model, position, beforeCursor)
    if (columnRequest) {
      return columnRequest
    }

    const fragmentMatch = beforeCursor.match(/([A-Za-z0-9_$#.`"\[\]]*)$/)
    const rawFragment = fragmentMatch?.[1] || ''
    const fragment = this.normalizeIdentifier(rawFragment)

    if (fragment.length < this.minimumFragmentLength) {
      return null
    }

    const beforeFragment = beforeCursor.slice(0, beforeCursor.length - rawFragment.length)
    if (!this.isTableNameContext(beforeFragment)) {
      return null
    }

    return {
      type: 'table',
      fragment,
      rawFragment,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - rawFragment.length,
        endColumn: position.column
      }
    }
  }

  private resolveColumnCompletionRequest(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    beforeCursor: string
  ): ColumnCompletionRequest | null {
    const columnMatch = beforeCursor.match(/((?:[A-Za-z_$#][A-Za-z0-9_$#]*|`[^`]*`|"[^"]*"|\[[^\]]*\])\.)(([A-Za-z0-9_$#]*)?)$/)
    if (!columnMatch) {
      return null
    }

    const rawQualifier = columnMatch[1].slice(0, -1)
    const rawFragment = columnMatch[2] || ''
    const qualifier = this.normalizeIdentifier(rawQualifier)
    if (!qualifier) {
      return null
    }

    const aliases = this.resolveTableAliases(model, position)
    const tableName = aliases.get(qualifier.toLowerCase())
    if (!tableName) {
      return null
    }

    return {
      type: 'column',
      tableName,
      qualifier,
      fragment: this.normalizeIdentifier(rawFragment),
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - rawFragment.length,
        endColumn: position.column
      }
    }
  }

  private async provideColumnSuggestions(
    editorInfo: RegisteredEditor,
    request: ColumnCompletionRequest
  ): Promise<monaco.languages.CompletionList> {
    if (!this.settings.isColumnAutocompleteEnabled()) {
      return { suggestions: [] }
    }

    try {
      const context = editorInfo.getContext()
      const columns = await this.columnSource.getColumns(context, request.tableName)
      const fragment = request.fragment.toLowerCase()
      const suggestions = columns
        .filter((column) => !fragment || column.name.toLowerCase().includes(fragment))
        .slice(0, this.maxSuggestions)
        .map((column, index) => this.toColumnSuggestion(column, request, index, context))

      return { suggestions }
    } catch (error) {
      console.warn('Could not load column autocomplete suggestions:', error)
      return { suggestions: [] }
    }
  }

  private isTableNameContext(sqlBeforeFragment: string): boolean {
    const sanitizedSql = this.replaceStringsAndComments(sqlBeforeFragment)
    const tokens = sanitizedSql.match(/[A-Za-z_][A-Za-z0-9_$#]*|[,()]/g) || []
    const lastToken = tokens[tokens.length - 1]?.toLowerCase()

    return lastToken === 'from' || lastToken === 'join'
  }

  private toSuggestion(
    table: TableAutocompleteItem,
    request: TableCompletionRequest,
    context: any
  ): monaco.languages.CompletionItem {
    const tableName = table.name
    const alias = this.generateAlias(tableName)
    const detail = table.type === 'view' ? 'View' : 'Table'
    const insertTableName = this.getTableInsertText(tableName, request, context)
    const filterText = this.getTableFilterText(tableName, insertTableName, request)
    const sortText = this.getTableSortText(tableName, request.fragment)

    return {
      label: tableName,
      kind: monaco.languages.CompletionItemKind.Struct,
      detail,
      documentation: alias ? `Alias: ${alias}` : undefined,
      insertText: alias ? `${insertTableName} ${alias}` : insertTableName,
      filterText,
      range: request.range,
      sortText
    }
  }

  private getTableFilterText(tableName: string, insertTableName: string, request: TableCompletionRequest): string {
    if (!this.getRequestedIdentifierQuote(request.rawFragment)) {
      return tableName
    }

    return this.hasClosingIdentifierQuote(request.rawFragment)
      ? request.rawFragment
      : insertTableName
  }

  private getTableSortText(tableName: string, fragment: string): string {
    const normalizedTableName = this.normalizeIdentifier(tableName).toLowerCase()
    const normalizedFragment = fragment.toLowerCase()
    const matchIndex = normalizedTableName.indexOf(normalizedFragment)
    const matchRank = matchIndex === 0
      ? 0
      : this.hasIdentifierPartStartingWith(normalizedTableName, normalizedFragment)
        ? 1
        : 2

    return [
      matchRank.toString(),
      Math.max(matchIndex, 0).toString().padStart(4, '0'),
      normalizedTableName
    ].join(':')
  }

  private hasIdentifierPartStartingWith(tableName: string, fragment: string): boolean {
    if (!fragment || fragment.includes('_') || fragment.includes('.')) {
      return false
    }

    return tableName
      .split(/[^a-z0-9]+/)
      .some((part) => part.startsWith(fragment))
  }

  private getTableInsertText(tableName: string, request: TableCompletionRequest, context: any): string {
    const quote = this.resolveIdentifierQuote(tableName, request.rawFragment, context)

    return quote
      ? this.quoteIdentifierReference(tableName, quote)
      : tableName
  }

  private resolveIdentifierQuote(tableName: string, rawFragment: string, context: any): IdentifierQuote | null {
    const requestedQuote = this.getRequestedIdentifierQuote(rawFragment)
    if (requestedQuote) return requestedQuote

    return this.shouldQuoteTableIdentifier(tableName, context)
      ? this.getDefaultIdentifierQuote(context)
      : null
  }

  private getRequestedIdentifierQuote(rawFragment: string): IdentifierQuote | null {
    const firstChar = rawFragment.trimStart()[0]
    if (firstChar === '"' || firstChar === '`' || firstChar === '[') {
      return firstChar
    }

    return null
  }

  private hasClosingIdentifierQuote(rawFragment: string): boolean {
    const trimmedFragment = rawFragment.trim()

    return (
      trimmedFragment.length > 1 &&
      (
        (trimmedFragment.startsWith('"') && trimmedFragment.endsWith('"')) ||
        (trimmedFragment.startsWith('`') && trimmedFragment.endsWith('`')) ||
        (trimmedFragment.startsWith('[') && trimmedFragment.endsWith(']'))
      )
    )
  }

  private shouldQuoteTableIdentifier(tableName: string, context: any): boolean {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()
    const normalizedTableName = this.normalizeIdentifier(tableName)

    if (!this.isSimpleIdentifier(normalizedTableName)) {
      return true
    }

    if (database === 'hana') {
      return !/^[A-Z_$#][A-Z0-9_$#]*$/.test(normalizedTableName)
    }

    return false
  }

  private getDefaultIdentifierQuote(context: any): IdentifierQuote {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()

    if (database === 'mysql') return '`'
    if (database === 'sqlserver') return '['

    return '"'
  }

  private quoteIdentifierReference(value: string, quote: IdentifierQuote): string {
    return this.splitIdentifierParts(value)
      .map((part) => this.quoteIdentifierPart(part, quote))
      .join('.')
  }

  private quoteIdentifierPart(value: string, quote: IdentifierQuote): string {
    const normalizedValue = this.normalizeIdentifier(value)

    if (quote === '`') {
      return `\`${normalizedValue.replace(/`/g, '``')}\``
    }

    if (quote === '[') {
      return `[${normalizedValue.replace(/]/g, ']]')}]`
    }

    return `"${normalizedValue.replace(/"/g, '""')}"`
  }

  private toColumnSuggestion(
    column: ColumnAutocompleteItem,
    request: ColumnCompletionRequest,
    index: number,
    context: any
  ): monaco.languages.CompletionItem {
    return {
      label: column.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: column.type ? `Column - ${column.type}` : 'Column',
      documentation: `${request.qualifier}.${column.name}`,
      insertText: this.getColumnInsertText(column.name, context),
      range: request.range,
      sortText: index.toString().padStart(4, '0')
    }
  }

  private autoQuoteTypedColumn(
    editor: monaco.editor.IStandaloneCodeEditor,
    getContext: () => any,
    isActive: () => boolean,
    event: monaco.editor.IModelContentChangedEvent
  ): void {
    const commitChange = this.getAutoQuoteCommitChange(event)

    if (!isActive() || !commitChange) return

    const context = getContext()
    if (!this.settings.shouldAutoQuoteCapitalizedColumns() || !this.supportsDoubleQuotedIdentifiers(context)) {
      return
    }

    const model = editor.getModel()
    if (!model) return

    const identifier = this.resolveIdentifierBeforeCommit(
      model,
      commitChange.range.startLineNumber,
      commitChange.range.startColumn
    )
    if (!identifier) return

    if (
      !this.shouldQuoteCapitalizedIdentifier(identifier.value, context) ||
      this.sqlReservedWords.has(identifier.value.toLowerCase())
    ) {
      return
    }

    const sqlBeforeIdentifier = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: identifier.lineNumber,
      endColumn: identifier.startColumn
    })

    if (
      this.isInsideStringOrComment(sqlBeforeIdentifier) ||
      this.isTableReferenceContext(sqlBeforeIdentifier)
    ) {
      return
    }

    const quotedIdentifier = this.quoteDoubleIdentifier(identifier.value)
    const columnDelta = quotedIdentifier.length - identifier.value.length
    const cursorPosition = new monaco.Position(
      commitChange.range.startLineNumber,
      commitChange.range.startColumn + commitChange.text.length + columnDelta
    )

    editor.executeEdits('auto-quote-column', [{
      range: {
        startLineNumber: identifier.lineNumber,
        endLineNumber: identifier.lineNumber,
        startColumn: identifier.startColumn,
        endColumn: identifier.endColumn
      },
      text: quotedIdentifier,
      forceMoveMarkers: true
    }], [
      new monaco.Selection(
        cursorPosition.lineNumber,
        cursorPosition.column,
        cursorPosition.lineNumber,
        cursorPosition.column
      )
    ])
  }

  private isAutoQuoteCommitText(text: string): boolean {
    return text.length === 1 && /^[ \t,;)=+\-*\/<>]$/.test(text)
  }

  private getAutoQuoteCommitChange(
    event: monaco.editor.IModelContentChangedEvent
  ): monaco.editor.IModelContentChange | null {
    for (let index = event.changes.length - 1; index >= 0; index--) {
      const change = event.changes[index]
      if (change.rangeLength === 0 && this.isAutoQuoteCommitText(change.text)) {
        return change
      }
    }

    return null
  }

  private resolveIdentifierBeforeCommit(
    model: monaco.editor.ITextModel,
    lineNumber: number,
    endColumn: number
  ): { value: string, lineNumber: number, startColumn: number, endColumn: number } | null {
    if (endColumn <= 1) return null

    const lineText = model.getLineContent(lineNumber)
    const beforeCommit = lineText.slice(0, endColumn - 1)
    const match = beforeCommit.match(/([A-Za-z_$#][A-Za-z0-9_$#]*)$/)
    const value = match?.[1] || ''
    if (!value) return null

    const startColumn = endColumn - value.length
    const beforeIdentifier = beforeCommit[beforeCommit.length - value.length - 1]
    if (beforeIdentifier === '"' || beforeIdentifier === '`' || beforeIdentifier === '[') {
      return null
    }

    return {
      value,
      lineNumber,
      startColumn,
      endColumn
    }
  }

  private getColumnInsertText(columnName: string, context: any): string {
    return this.shouldQuoteCapitalizedIdentifier(columnName, context)
      ? this.quoteDoubleIdentifier(columnName)
      : columnName
  }

  private shouldQuoteCapitalizedIdentifier(identifier: string, context: any): boolean {
    const normalizedIdentifier = this.normalizeIdentifier(identifier)

    return (
      this.settings.shouldAutoQuoteCapitalizedColumns() &&
      this.supportsDoubleQuotedIdentifiers(context) &&
      /^[A-Z]/.test(normalizedIdentifier) &&
      /[a-z]/.test(normalizedIdentifier)
    )
  }

  private quoteDoubleIdentifier(identifier: string): string {
    return `"${this.normalizeIdentifier(identifier).replace(/"/g, '""')}"`
  }

  private supportsDoubleQuotedIdentifiers(context: any): boolean {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()

    return database !== 'mysql'
  }

  private isTableReferenceContext(sqlBeforeIdentifier: string): boolean {
    if (/\(\s*$/.test(sqlBeforeIdentifier)) return false

    const sanitizedSql = this.replaceStringsAndComments(sqlBeforeIdentifier)
    const statementSql = this.extractCurrentStatement(sanitizedSql, sanitizedSql.length)
    const tokens = this.tokenizeSql(statementSql)

    for (let index = tokens.length - 1; index >= 0; index--) {
      const token = tokens[index].lower

      if (this.isTableReferenceBreakToken(token)) {
        return false
      }

      if (this.isTableReferenceStartToken(token)) {
        return true
      }
    }

    return false
  }

  private isTableReferenceStartToken(token: string): boolean {
    return ['from', 'join', 'update', 'into', 'table', 'view'].includes(token)
  }

  private isTableReferenceBreakToken(token: string): boolean {
    return [
      'select',
      'where',
      'on',
      'set',
      'values',
      'group',
      'order',
      'having',
      'limit',
      'offset',
      'union',
      'with',
      'by',
      'as'
    ].includes(token)
  }

  private generateAlias(tableName: string): string {
    const normalizedName = this.normalizeIdentifier(tableName).split('.').pop() || tableName
    const parts = normalizedName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)

    if (parts.length === 0) return ''

    const alias = parts.length === 1
      ? parts[0].charAt(0)
      : parts.map((part) => part.charAt(0)).join('')

    return alias.toLowerCase() || 't'
  }

  private normalizeIdentifier(value: string): string {
    return value
      .trim()
      .replace(/^[`"\[]+/, '')
      .replace(/[`"\]]+$/, '')
  }

  private isSimpleIdentifier(value: string): boolean {
    return /^[A-Za-z_$#][A-Za-z0-9_$#]*$/.test(value)
  }

  private resolveTableAliases(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Map<string, string> {
    const offset = model.getOffsetAt(position)
    const sanitizedSql = this.replaceStringsAndComments(model.getValue())
    const statementSql = this.extractCurrentStatement(sanitizedSql, offset)
    const tokens = this.tokenizeSql(statementSql)
    const aliases = new Map<string, string>()

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]

      if (token.lower === 'from') {
        this.collectFromAliases(tokens, index + 1, aliases)
      }

      if (token.lower === 'join') {
        this.collectSingleTableAlias(tokens, index + 1, aliases)
      }
    }

    return aliases
  }

  private collectFromAliases(tokens: SqlToken[], startIndex: number, aliases: Map<string, string>): void {
    let index = startIndex

    while (index < tokens.length) {
      const token = tokens[index]
      if (!token || this.isFromTerminator(token.lower)) {
        return
      }

      const result = this.collectSingleTableAlias(tokens, index, aliases)
      if (!result) {
        index++
        continue
      }

      index = result.nextIndex
      if (tokens[index]?.value === ',') {
        index++
        continue
      }

      return
    }
  }

  private collectSingleTableAlias(
    tokens: SqlToken[],
    startIndex: number,
    aliases: Map<string, string>
  ): { nextIndex: number } | null {
    const tableReference = this.readIdentifierChain(tokens, startIndex)
    if (!tableReference) {
      return null
    }

    let nextIndex = tableReference.nextIndex
    if (tokens[nextIndex]?.lower === 'as') {
      nextIndex++
    }

    const tableName = this.normalizeTableNameForMetadata(tableReference.value)
    const tableAlias = this.normalizeIdentifier(this.getIdentifierLastPart(tableReference.value))
    this.addAlias(aliases, tableAlias, tableName)

    const aliasToken = tokens[nextIndex]
    if (aliasToken && this.isAliasToken(aliasToken)) {
      this.addAlias(aliases, this.normalizeIdentifier(aliasToken.value), tableName)
      nextIndex++
    }

    return { nextIndex }
  }

  private addAlias(aliases: Map<string, string>, alias: string, tableName: string): void {
    const normalizedAlias = alias.trim().toLowerCase()
    const normalizedTable = tableName.trim()
    if (!normalizedAlias || !normalizedTable) return

    aliases.set(normalizedAlias, normalizedTable)
  }

  private readIdentifierChain(tokens: SqlToken[], startIndex: number): { value: string, nextIndex: number } | null {
    const firstToken = tokens[startIndex]
    if (!this.isIdentifierToken(firstToken)) {
      return null
    }

    const parts = [firstToken.value]
    let index = startIndex + 1

    while (tokens[index]?.value === '.' && this.isIdentifierToken(tokens[index + 1])) {
      parts.push(tokens[index].value, tokens[index + 1].value)
      index += 2
    }

    return { value: parts.join(''), nextIndex: index }
  }

  private isIdentifierToken(token?: SqlToken): boolean {
    if (!token) return false

    return (
      /^[A-Za-z_$#][A-Za-z0-9_$#]*$/.test(token.value) ||
      /^`[^`]*`$/.test(token.value) ||
      /^"[^"]*"$/.test(token.value) ||
      /^\[[^\]]*\]$/.test(token.value)
    )
  }

  private isAliasToken(token: SqlToken): boolean {
    return this.isIdentifierToken(token) && !this.sqlReservedWords.has(token.lower)
  }

  private isFromTerminator(token: string): boolean {
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

  private extractCurrentStatement(sql: string, offset: number): string {
    const start = sql.lastIndexOf(';', Math.max(0, offset - 1)) + 1
    const end = sql.indexOf(';', offset)

    return sql.slice(start, end === -1 ? sql.length : end)
  }

  private tokenizeSql(sql: string): SqlToken[] {
    const matches = sql.match(/`[^`]*`|"[^"]*"|\[[^\]]*\]|[A-Za-z_$#][A-Za-z0-9_$#]*|[.,;]/g) || []

    return matches.map((value) => ({
      value,
      lower: this.normalizeIdentifier(value).toLowerCase()
    }))
  }

  private normalizeTableNameForMetadata(value: string): string {
    return this.normalizeIdentifier(this.getIdentifierLastPart(value))
  }

  private splitIdentifierParts(value: string): string[] {
    const parts: string[] = []
    let current = ''
    let quote: string | null = null

    for (let index = 0; index < value.length; index++) {
      const char = value[index]

      if (quote) {
        current += char

        if ((quote === ']' && char === ']') || char === quote) {
          const next = value[index + 1]
          if ((quote === ']' && next === ']') || (quote === '"' && next === '"') || (quote === '`' && next === '`')) {
            current += next
            index++
            continue
          }

          quote = null
        }
        continue
      }

      if (char === '"' || char === '`' || char === '[') {
        quote = char === '[' ? ']' : char
        current += char
        continue
      }

      if (char === '.') {
        parts.push(current)
        current = ''
        continue
      }

      current += char
    }

    parts.push(current)
    return parts
  }

  private getIdentifierLastPart(value: string): string {
    const parts = this.splitIdentifierParts(value)

    return parts.pop() || value
  }

  private getModelKey(model: monaco.editor.ITextModel): string {
    return model.uri.toString()
  }

  private isInsideStringOrComment(sql: string): boolean {
    const state = this.scanSqlState(sql)

    return Boolean(state.quote || state.lineComment || state.blockComment)
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

  private scanSqlState(sql: string): { quote: string | null, lineComment: boolean, blockComment: boolean } {
    let quote: string | null = null
    let identifierQuote: string | null = null
    let lineComment = false
    let blockComment = false

    for (let index = 0; index < sql.length; index++) {
      const current = sql[index]
      const next = sql[index + 1]

      if (lineComment) {
        if (current === '\n' || current === '\r') {
          lineComment = false
        }
        continue
      }

      if (blockComment) {
        if (current === '*' && next === '/') {
          index++
          blockComment = false
        }
        continue
      }

      if (identifierQuote) {
        if (current === identifierQuote) {
          if (
            (identifierQuote === ']' && next === ']') ||
            (identifierQuote === '"' && next === '"') ||
            (identifierQuote === '`' && next === '`')
          ) {
            index++
          } else {
            identifierQuote = null
          }
        }
        continue
      }

      if (quote) {
        if (current === quote) {
          if (next === quote) {
            index++
          } else {
            quote = null
          }
        }
        continue
      }

      if (current === '-' && next === '-') {
        lineComment = true
        index++
        continue
      }

      if (current === '/' && next === '*') {
        blockComment = true
        index++
        continue
      }

      if (current === '\'') {
        quote = current
        continue
      }

      if (current === '"' || current === '`' || current === '[') {
        identifierQuote = current === '[' ? ']' : current
      }
    }

    return { quote, lineComment, blockComment }
  }
}
