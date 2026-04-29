import { Injectable } from '@angular/core'
import * as monaco from 'monaco-editor'
import { AppSettingsService } from '../app-settings/app-settings.service'
import { TableAutocompleteSourceService } from './table-autocomplete-source.service'
import { ColumnAutocompleteItem, ColumnAutocompleteSourceService } from './column-autocomplete-source.service'

interface RegisteredEditor {
  getContext: () => any
  isActive: () => boolean
}

interface TableCompletionRequest {
  type: 'table'
  fragment: string
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

interface SqlToken {
  value: string
  lower: string
}

@Injectable({
  providedIn: 'root'
})
export class SqlTableAutocompleteService {
  private providerDisposable?: monaco.IDisposable
  private readonly editors = new Map<string, RegisteredEditor>()
  private readonly minimumFragmentLength = 3
  private readonly maxSuggestions = 50
  private readonly sqlReservedWords = new Set([
    'as',
    'cross',
    'full',
    'group',
    'having',
    'inner',
    'join',
    'left',
    'limit',
    'offset',
    'on',
    'order',
    'outer',
    'right',
    'select',
    'union',
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

    return {
      dispose: () => {
        this.editors.delete(modelKey)
      }
    }
  }

  private ensureProviderRegistered(): void {
    if (this.providerDisposable) return

    this.providerDisposable = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '_', '.'],
      provideCompletionItems: async (model, position) => {
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
          const tables = await this.tableSource.getTables(editorInfo.getContext())
          const fragment = request.fragment.toLowerCase()
          const suggestions = tables
            .filter((table) => table.name.toLowerCase().includes(fragment))
            .slice(0, this.maxSuggestions)
            .map((table) => this.toSuggestion(table.name, request.range))

          return { suggestions }
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
      const columns = await this.columnSource.getColumns(editorInfo.getContext(), request.tableName)
      const fragment = request.fragment.toLowerCase()
      const suggestions = columns
        .filter((column) => !fragment || column.name.toLowerCase().includes(fragment))
        .slice(0, this.maxSuggestions)
        .map((column, index) => this.toColumnSuggestion(column, request, index))

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

  private toSuggestion(tableName: string, range: monaco.IRange): monaco.languages.CompletionItem {
    const alias = this.generateAlias(tableName)

    return {
      label: tableName,
      kind: monaco.languages.CompletionItemKind.Struct,
      detail: 'Table',
      documentation: alias ? `Alias: ${alias}` : undefined,
      insertText: alias ? `${tableName} ${alias}` : tableName,
      range,
      sortText: tableName.toLowerCase()
    }
  }

  private toColumnSuggestion(
    column: ColumnAutocompleteItem,
    request: ColumnCompletionRequest,
    index: number
  ): monaco.languages.CompletionItem {
    return {
      label: column.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: column.type ? `Column - ${column.type}` : 'Column',
      documentation: `${request.qualifier}.${column.name}`,
      insertText: column.name,
      range: request.range,
      sortText: index.toString().padStart(4, '0')
    }
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

  private getIdentifierLastPart(value: string): string {
    const parts: string[] = []
    let current = ''
    let quote: string | null = null

    for (let index = 0; index < value.length; index++) {
      const char = value[index]

      if (quote) {
        current += char

        if ((quote === ']' && char === ']') || char === quote) {
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

      if (current === '\'' || current === '"' || current === '`') {
        result += ' '
        quote = current
        continue
      }

      result += current
    }

    return result
  }

  private scanSqlState(sql: string): { quote: string | null, lineComment: boolean, blockComment: boolean } {
    let quote: string | null = null
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

      if (current === '\'' || current === '"' || current === '`') {
        quote = current
      }
    }

    return { quote, lineComment, blockComment }
  }
}
