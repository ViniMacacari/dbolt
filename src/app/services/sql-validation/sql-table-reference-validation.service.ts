import { Injectable } from '@angular/core'

import { TableAutocompleteSourceService } from '../code-autocomplete/table-autocomplete-source.service'
import { AppLanguageService } from '../language/app-language.service'

export interface SqlTableReferenceDiagnostic {
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

interface SqlToken {
  value: string
  lower: string
  startOffset: number
  endOffset: number
  depth: number
  statement: number
  identifier: boolean
}

interface IdentifierReference {
  value: string
  parts: string[]
  startOffset: number
  endOffset: number
  nextIndex: number
  statement: number
}

@Injectable({
  providedIn: 'root'
})
export class SqlTableReferenceValidationService {
  private readonly reservedWords = new Set([
    'all', 'as', 'by', 'connect', 'cross', 'delete', 'except', 'from', 'full', 'group',
    'having', 'inner', 'insert', 'intersect', 'into', 'join', 'left', 'limit', 'merge',
    'minus', 'offset', 'on', 'only', 'order', 'outer', 'qualify', 'returning', 'right',
    'select', 'set', 'table', 'union', 'update', 'using', 'values', 'where', 'with'
  ])
  private readonly fromTerminators = new Set([
    'connect', 'except', 'group', 'having', 'intersect', 'limit', 'minus', 'offset', 'on',
    'order', 'qualify', 'returning', 'set', 'union', 'values', 'where'
  ])

  constructor(
    private tableSource: TableAutocompleteSourceService,
    private language: AppLanguageService
  ) { }

  async validate(sql: string, context?: any): Promise<SqlTableReferenceDiagnostic[]> {
    if (!sql.trim() || !this.hasDatabaseContext(context)) {
      return []
    }

    const tokens = this.tokenize(sql)
    const references = this.extractTableReferences(tokens, sql)
    if (references.length === 0) {
      return []
    }

    let databaseObjects
    try {
      databaseObjects = await this.tableSource.getTables(context)
    } catch {
      // Metadata validation is advisory. A disconnected database must not interrupt editing.
      return []
    }

    const knownObjects = new Set(databaseObjects.map(object => this.normalizeName(object.name)))
    const cteNames = this.collectCteNames(tokens)
    const localObjects = this.collectLocallyCreatedObjects(tokens)
    const aliases = this.collectTableAliases(tokens, sql)

    return references
      .filter(reference => this.shouldValidateReference(reference, context, cteNames, localObjects, aliases, sql))
      .filter(reference => !knownObjects.has(this.normalizeName(this.getLastPart(reference))))
      .map(reference => {
        const start = this.offsetToPosition(sql, reference.startOffset)
        const end = this.offsetToPosition(sql, reference.endOffset)

        return {
          message: this.language.translate('editor.tableDoesNotExist', { table: reference.value }),
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        }
      })
  }

  private extractTableReferences(tokens: SqlToken[], sql: string): IdentifierReference[] {
    const references: IdentifierReference[] = []

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      let referenceIndex: number | null = null

      if (token.lower === 'from' || token.lower === 'join' || token.lower === 'update') {
        referenceIndex = index + 1
      } else if (token.lower === 'into' && this.isInsertOrMergeInto(tokens, index)) {
        referenceIndex = index + 1
      } else if (token.value === ',' && this.isFromListComma(tokens, index)) {
        referenceIndex = index + 1
      }

      if (referenceIndex === null) continue

      while (['lateral', 'only'].includes(tokens[referenceIndex]?.lower)) {
        referenceIndex++
      }

      const reference = this.readIdentifierReference(tokens, referenceIndex)
      if (!reference || tokens[reference.nextIndex]?.value === '(') continue

      references.push(reference)
    }

    return this.uniqueReferences(references)
  }

  private collectCteNames(tokens: SqlToken[]): Set<string> {
    const cteNames = new Set<string>()

    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].lower !== 'with') continue

      let cursor = index + 1
      if (tokens[cursor]?.lower === 'recursive') cursor++

      while (cursor < tokens.length) {
        const cteToken = tokens[cursor]
        if (!cteToken?.identifier) break

        let afterName = cursor + 1
        if (tokens[afterName]?.value === '(') {
          afterName = this.findAfterClosingParenthesis(tokens, afterName)
        }

        if (tokens[afterName]?.lower !== 'as') break
        afterName++

        if (tokens[afterName]?.lower === 'not') afterName++
        if (tokens[afterName]?.lower === 'materialized') afterName++
        if (tokens[afterName]?.value !== '(') break

        cteNames.add(this.scopedName(cteToken.statement, this.normalizeIdentifier(cteToken.value)))
        cursor = this.findAfterClosingParenthesis(tokens, afterName)

        if (tokens[cursor]?.value !== ',') break
        cursor++
      }
    }

    return cteNames
  }

  private collectLocallyCreatedObjects(tokens: SqlToken[]): Set<string> {
    const names = new Set<string>()

    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].lower !== 'create') continue

      let cursor = index + 1
      if (tokens[cursor]?.lower === 'or' && tokens[cursor + 1]?.lower === 'replace') cursor += 2
      while (['global', 'local', 'temporary', 'temp'].includes(tokens[cursor]?.lower)) cursor++
      if (!['table', 'view'].includes(tokens[cursor]?.lower)) continue

      const reference = this.readIdentifierReference(tokens, cursor + 1)
      if (reference) {
        names.add(this.normalizeName(this.getLastPart(reference)))
      }
    }

    return names
  }

  private collectTableAliases(tokens: SqlToken[], sql: string): Set<string> {
    const aliases = new Set<string>()

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      if (
        token.lower !== 'from' &&
        token.lower !== 'join' &&
        !(token.value === ',' && this.isFromListComma(tokens, index))
      ) {
        continue
      }

      let cursor = index + 1
      while (['lateral', 'only'].includes(tokens[cursor]?.lower)) cursor++

      const reference = this.readIdentifierReference(tokens, cursor)
      if (!reference || tokens[reference.nextIndex]?.value === '(') continue

      cursor = reference.nextIndex
      if (tokens[cursor]?.lower === 'as') cursor++

      const alias = tokens[cursor]
      if (alias?.identifier && !this.reservedWords.has(alias.lower) && !this.isTableHint(alias, sql)) {
        aliases.add(this.scopedName(alias.statement, this.normalizeIdentifier(alias.value)))
      }
    }

    return aliases
  }

  private shouldValidateReference(
    reference: IdentifierReference,
    context: any,
    cteNames: Set<string>,
    localObjects: Set<string>,
    aliases: Set<string>,
    sql: string
  ): boolean {
    const tableName = this.normalizeName(this.getLastPart(reference))
    if (!tableName || tableName.startsWith('#') || tableName.startsWith('@')) return false
    if (this.previousNonWhitespaceCharacter(sql, reference.startOffset) === ':') return false
    if (cteNames.has(this.scopedName(reference.statement, tableName))) return false
    if (localObjects.has(tableName)) return false
    if (aliases.has(this.scopedName(reference.statement, tableName))) return false

    return this.isReferenceInCurrentContext(reference, context)
  }

  private isReferenceInCurrentContext(reference: IdentifierReference, context: any): boolean {
    if (reference.parts.length <= 1) return true

    const qualifiers = reference.parts.slice(0, -1).map(part => this.normalizeName(part))
    const currentNames = new Set([
      this.normalizeName(context?.database),
      this.normalizeName(context?.schema)
    ].filter(Boolean))

    if (qualifiers.length === 1 && qualifiers[0] === 'main') return true
    if (qualifiers.some(qualifier => qualifier === 'temp')) return false

    return qualifiers.length > 0 && qualifiers.every(qualifier => currentNames.has(qualifier))
  }

  private isInsertOrMergeInto(tokens: SqlToken[], intoIndex: number): boolean {
    const intoToken = tokens[intoIndex]

    for (let index = intoIndex - 1; index >= 0; index--) {
      const token = tokens[index]
      if (token.statement !== intoToken.statement || token.depth !== intoToken.depth) continue
      if (token.lower === 'insert' || token.lower === 'merge') return true
      if (token.lower === 'select') return false
    }

    return false
  }

  private isFromListComma(tokens: SqlToken[], commaIndex: number): boolean {
    const comma = tokens[commaIndex]

    for (let index = commaIndex - 1; index >= 0; index--) {
      const token = tokens[index]
      if (token.statement !== comma.statement || token.depth !== comma.depth) continue
      if (token.lower === 'from') return true
      if (this.fromTerminators.has(token.lower) || token.lower === 'select') return false
    }

    return false
  }

  private readIdentifierReference(tokens: SqlToken[], startIndex: number): IdentifierReference | null {
    const first = tokens[startIndex]
    if (!first?.identifier || this.reservedWords.has(first.lower)) return null

    const parts = [this.normalizeIdentifier(first.value)]
    let endOffset = first.endOffset
    let cursor = startIndex + 1

    while (
      tokens[cursor]?.value === '.' &&
      tokens[cursor + 1]?.identifier &&
      !this.reservedWords.has(tokens[cursor + 1].lower)
    ) {
      parts.push(this.normalizeIdentifier(tokens[cursor + 1].value))
      endOffset = tokens[cursor + 1].endOffset
      cursor += 2
    }

    return {
      value: parts.join('.'),
      parts,
      startOffset: first.startOffset,
      endOffset,
      nextIndex: cursor,
      statement: first.statement
    }
  }

  private tokenize(sql: string): SqlToken[] {
    const tokens: SqlToken[] = []
    let index = 0
    let depth = 0
    let statement = 0

    while (index < sql.length) {
      const current = sql[index]
      const next = sql[index + 1]

      if (/\s/.test(current)) {
        index++
        continue
      }

      if (current === '-' && next === '-') {
        index = this.skipLineComment(sql, index + 2)
        continue
      }

      if (current === '/' && next === '*') {
        index = this.skipBlockComment(sql, index + 2)
        continue
      }

      if (current === '\'') {
        index = this.skipQuotedValue(sql, index, '\'')
        continue
      }

      if (current === '"' || current === '`' || current === '[') {
        const endOffset = this.skipQuotedValue(sql, index, current === '[' ? ']' : current)
        const value = sql.slice(index, endOffset)
        tokens.push(this.createToken(value, index, endOffset, depth, statement, true))
        index = endOffset
        continue
      }

      if (/[A-Za-z_@$#]/.test(current)) {
        const startOffset = index
        index++
        while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index])) index++
        const value = sql.slice(startOffset, index)
        tokens.push(this.createToken(value, startOffset, index, depth, statement, true))
        continue
      }

      if ('(),.;'.includes(current)) {
        if (current === ')') depth = Math.max(0, depth - 1)
        tokens.push(this.createToken(current, index, index + 1, depth, statement, false))
        if (current === '(') depth++
        if (current === ';' && depth === 0) statement++
      }

      index++
    }

    return tokens
  }

  private createToken(
    value: string,
    startOffset: number,
    endOffset: number,
    depth: number,
    statement: number,
    identifier: boolean
  ): SqlToken {
    return {
      value,
      lower: this.normalizeIdentifier(value).toLowerCase(),
      startOffset,
      endOffset,
      depth,
      statement,
      identifier
    }
  }

  private skipLineComment(sql: string, startIndex: number): number {
    const lineEnd = sql.slice(startIndex).search(/[\r\n]/)
    return lineEnd === -1 ? sql.length : startIndex + lineEnd
  }

  private skipBlockComment(sql: string, startIndex: number): number {
    const commentEnd = sql.indexOf('*/', startIndex)
    return commentEnd === -1 ? sql.length : commentEnd + 2
  }

  private skipQuotedValue(sql: string, startIndex: number, closingQuote: string): number {
    let index = startIndex + 1

    while (index < sql.length) {
      if (sql[index] !== closingQuote) {
        index++
        continue
      }

      if (sql[index + 1] === closingQuote) {
        index += 2
        continue
      }

      return index + 1
    }

    return sql.length
  }

  private findAfterClosingParenthesis(tokens: SqlToken[], openIndex: number): number {
    const openToken = tokens[openIndex]
    if (openToken?.value !== '(') return openIndex

    for (let index = openIndex + 1; index < tokens.length; index++) {
      if (tokens[index].value === ')' && tokens[index].depth === openToken.depth) {
        return index + 1
      }
    }

    return tokens.length
  }

  private isTableHint(token: SqlToken, sql: string): boolean {
    const previousCharacter = this.previousNonWhitespaceCharacter(sql, token.startOffset)
    return previousCharacter === '('
  }

  private previousNonWhitespaceCharacter(sql: string, offset: number): string {
    for (let index = offset - 1; index >= 0; index--) {
      if (!/\s/.test(sql[index])) return sql[index]
    }

    return ''
  }

  private uniqueReferences(references: IdentifierReference[]): IdentifierReference[] {
    const seen = new Set<string>()

    return references.filter(reference => {
      const key = `${reference.startOffset}:${reference.endOffset}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private offsetToPosition(sql: string, offset: number): { lineNumber: number, column: number } {
    const beforeOffset = sql.slice(0, offset)
    const lines = beforeOffset.split(/\r\n|\r|\n/)

    return {
      lineNumber: lines.length,
      column: (lines[lines.length - 1] || '').length + 1
    }
  }

  private getLastPart(reference: IdentifierReference): string {
    return reference.parts[reference.parts.length - 1] || reference.value
  }

  private normalizeIdentifier(value: string): string {
    const trimmed = String(value || '').trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).replace(/]]/g, ']')
    }
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"')
    }
    if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
      return trimmed.slice(1, -1).replace(/``/g, '`')
    }

    return trimmed
  }

  private normalizeName(value: unknown): string {
    return this.normalizeIdentifier(String(value || '')).toLowerCase()
  }

  private scopedName(statement: number, name: string): string {
    return `${statement}:${this.normalizeName(name)}`
  }

  private hasDatabaseContext(context: any): boolean {
    return Boolean(context?.sgbd || context?.connId || context?.connectionId)
  }
}
