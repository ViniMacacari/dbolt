import { Injectable } from '@angular/core'
import * as monaco from 'monaco-editor'
import { AppSettingsService } from '../app-settings/app-settings.service'
import { TableAutocompleteSourceService } from './table-autocomplete-source.service'

interface RegisteredEditor {
  getContext: () => any
  isActive: () => boolean
}

interface TableCompletionRequest {
  fragment: string
  range: monaco.IRange
}

@Injectable({
  providedIn: 'root'
})
export class SqlTableAutocompleteService {
  private providerDisposable?: monaco.IDisposable
  private readonly editors = new Map<string, RegisteredEditor>()
  private readonly minimumFragmentLength = 3

  constructor(
    private settings: AppSettingsService,
    private tableSource: TableAutocompleteSourceService
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
        if (!editorInfo?.isActive() || !this.settings.isTableAutocompleteEnabled()) {
          return { suggestions: [] }
        }

        const request = this.resolveCompletionRequest(model, position)
        if (!request) {
          return { suggestions: [] }
        }

        try {
          const tables = await this.tableSource.getTables(editorInfo.getContext())
          const fragment = request.fragment.toLowerCase()
          const suggestions = tables
            .filter((table) => table.name.toLowerCase().includes(fragment))
            .slice(0, 50)
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
  ): TableCompletionRequest | null {
    const lineText = model.getLineContent(position.lineNumber)
    const beforeCursor = lineText.slice(0, position.column - 1)

    if (this.isInsideStringOrComment(beforeCursor)) {
      return null
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
      fragment,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - rawFragment.length,
        endColumn: position.column
      }
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
        result += ' '
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
