import { Injectable } from '@angular/core'
import { SqlParserDatabase, SqlParserService } from '../sql-parser/sql-parser.service'

export interface SqlSyntaxDiagnostic {
  message: string
  code?: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

type SqlSyntaxDiagnosticRange = Omit<SqlSyntaxDiagnostic, 'message' | 'code'>

interface ParserLocation {
  start?: {
    line?: number
    column?: number
    offset?: number
  }
  end?: {
    line?: number
    column?: number
    offset?: number
  }
}

interface SqlParserError {
  message?: string
  found?: string | null
  location?: ParserLocation
}

@Injectable({
  providedIn: 'root'
})
export class SqlSyntaxValidationService {
  constructor(private sqlParser: SqlParserService = new SqlParserService()) { }

  async validate(sql: string, context?: any): Promise<SqlSyntaxDiagnostic[]> {
    if (!sql.trim()) {
      return []
    }

    if (this.shouldSkipParser(sql, context)) {
      return []
    }

    const database = this.sqlParser.resolveDatabase(context)

    try {
      await this.sqlParser.astify(sql, context)

      return []
    } catch (error) {
      return [this.toDiagnostic(error as SqlParserError, sql, database)]
    }
  }

  private shouldSkipParser(sql: string, context?: any): boolean {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()

    return database === 'hana' && this.isHanaRoutineDefinition(sql)
  }

  private isHanaRoutineDefinition(sql: string): boolean {
    const normalizedSql = this.stripLeadingSqlComments(sql).trimStart()

    return /^(create\s+(or\s+replace\s+)?|alter\s+)(procedure|function)\b/i.test(normalizedSql)
  }

  private stripLeadingSqlComments(sql: string): string {
    let remainingSql = sql

    while (true) {
      const nextSql = remainingSql.trimStart()

      if (nextSql.startsWith('--')) {
        const lineBreakIndex = nextSql.search(/\r\n|\r|\n/)
        if (lineBreakIndex === -1) return ''

        remainingSql = nextSql.slice(lineBreakIndex)
        continue
      }

      if (nextSql.startsWith('/*')) {
        const commentEndIndex = nextSql.indexOf('*/')
        if (commentEndIndex === -1) return ''

        remainingSql = nextSql.slice(commentEndIndex + 2)
        continue
      }

      return nextSql
    }
  }

  private toDiagnostic(
    error: SqlParserError,
    sql: string,
    database: SqlParserDatabase
  ): SqlSyntaxDiagnostic {
    const reservedWord = this.extractReservedWord(error)
    const reportedToken = reservedWord || this.extractReportedToken(error)

    if (this.hasParserLocation(error.location)) {
      return {
        ...this.rangeFromParserLocation(error, sql),
        message: reservedWord
          ? this.reservedWordMessage(reservedWord, database)
          : this.normalizeMessage(error, reportedToken),
        code: reservedWord ? 'reserved-word-alias' : 'sql-syntax'
      }
    }

    const reportedTokenOffset = reportedToken
      ? this.findReportedTokenOffset(sql, reportedToken)
      : -1

    if (reportedTokenOffset >= 0) {
      return {
        ...this.rangeFromOffsets(sql, reportedTokenOffset, reportedTokenOffset + reportedToken.length),
        message: reservedWord
          ? this.reservedWordMessage(reservedWord, database)
          : this.normalizeMessage(error, reportedToken),
        code: reservedWord ? 'reserved-word-alias' : 'sql-syntax'
      }
    }

    const range = this.rangeFromParserLocation(error, sql)

    return {
      ...range,
      message: this.normalizeMessage(error),
      code: 'sql-syntax'
    }
  }

  private hasParserLocation(location?: ParserLocation): boolean {
    return Number.isFinite(location?.start?.offset)
      || (Number.isFinite(location?.start?.line) && Number.isFinite(location?.start?.column))
  }

  private rangeFromParserLocation(error: SqlParserError, sql: string): SqlSyntaxDiagnosticRange {
    const location = error.location

    if (Number.isFinite(location?.start?.offset)) {
      const startOffset = Math.max(0, Math.floor(Number(location?.start?.offset)))
      const rawEndOffset = Number(location?.end?.offset)
      const endOffset = Number.isFinite(rawEndOffset) && rawEndOffset > startOffset
        ? Math.floor(rawEndOffset)
        : startOffset + Math.max(1, typeof error.found === 'string' ? error.found.length : 1)
      const tokenRange = this.expandIdentifierRange(sql, startOffset, endOffset)

      return this.rangeFromOffsets(sql, tokenRange.startOffset, tokenRange.endOffset)
    }

    const startLineNumber = this.normalizeLine(location?.start?.line)
    const startColumn = this.normalizeColumn(location?.start?.column)
    const endLineNumber = this.normalizeLine(location?.end?.line, startLineNumber)
    const endColumn = this.normalizeEndColumn(location?.end?.column, startColumn, startLineNumber, endLineNumber)
    const range = this.clampRange(sql, {
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn
    })

    return range
  }

  private normalizeMessage(error: SqlParserError, reportedToken?: string): string {
    const found = reportedToken || (typeof error.found === 'string' ? error.found : '')
    const message = String(error.message || '').trim()

    if (/end of input found/i.test(message) || error.found === null) {
      return 'Invalid SQL syntax: statement is incomplete.'
    }

    if (found) {
      return `Unexpected token "${found}". Check the SQL syntax near this token.`
    }

    const parserReason = message.replace(/^(?:error:\s*)+/i, '').trim()
    return parserReason
      ? `Invalid SQL syntax: ${parserReason}`
      : 'Invalid SQL syntax.'
  }

  private extractReservedWord(error: SqlParserError): string {
    const message = String(error.message || '')
    return message.match(/["'`]([^"'`]+)["'`]\s+is\s+a\s+reserved\s+word/i)?.[1] || ''
  }

  private extractReportedToken(error: SqlParserError): string {
    if (typeof error.found === 'string' && error.found) {
      return error.found
    }

    const message = String(error.message || '')
    return message.match(/but\s+["'`]([^"'`]+)["'`]\s+found/i)?.[1] || ''
  }

  private findReportedTokenOffset(sql: string, token: string): number {
    const escapedToken = this.escapeRegExp(token)
    const aliasPattern = new RegExp(`\\bAS\\s+(${escapedToken})(?![\\w$])`, 'gi')
    let aliasMatch: RegExpExecArray | null
    let aliasOffset = -1

    while ((aliasMatch = aliasPattern.exec(sql)) !== null) {
      const matchedToken = aliasMatch[1]
      if (!matchedToken) continue

      aliasOffset = aliasMatch.index + aliasMatch[0].length - matchedToken.length
    }

    if (aliasOffset >= 0) return aliasOffset

    const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(token)
    const tokenPattern = isIdentifier
      ? new RegExp(`(?<![\\w$])${escapedToken}(?![\\w$])`, 'gi')
      : new RegExp(escapedToken, 'g')
    let tokenMatch: RegExpExecArray | null
    let tokenOffset = -1

    while ((tokenMatch = tokenPattern.exec(sql)) !== null) {
      tokenOffset = tokenMatch.index
    }

    return tokenOffset
  }

  private reservedWordMessage(word: string, database: SqlParserDatabase): string {
    const databaseName = database === 'postgresql'
      ? 'PostgreSQL'
      : database === 'transactsql'
        ? 'SQL Server'
        : database === 'sqlite'
          ? 'SQLite'
          : 'MySQL'
    const quotedWord = database === 'mysql'
      ? `\`${word}\``
      : database === 'transactsql'
        ? `[${word}]`
        : `"${word}"`

    return `"${word}" is a reserved word in ${databaseName} and cannot be used as an unquoted alias. Rename the alias or use ${quotedWord}.`
  }

  private rangeFromOffsets(sql: string, startOffset: number, endOffset: number): SqlSyntaxDiagnosticRange {
    const safeStartOffset = Math.min(Math.max(0, startOffset), sql.length)
    const safeEndOffset = Math.min(Math.max(safeStartOffset + 1, endOffset), sql.length)
    const start = this.positionFromOffset(sql, safeStartOffset)
    const end = this.positionFromOffset(sql, safeEndOffset)

    return this.clampRange(sql, {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column
    })
  }

  private positionFromOffset(sql: string, offset: number): { lineNumber: number; column: number } {
    const beforeOffset = sql.slice(0, offset)
    const lines = beforeOffset.split(/\r\n|\r|\n/)

    return {
      lineNumber: lines.length,
      column: (lines[lines.length - 1] || '').length + 1
    }
  }

  private expandIdentifierRange(
    sql: string,
    startOffset: number,
    endOffset: number
  ): { startOffset: number; endOffset: number } {
    let expandedStart = Math.min(Math.max(0, startOffset), sql.length)
    let expandedEnd = Math.min(Math.max(expandedStart + 1, endOffset), sql.length)
    const isIdentifierCharacter = (character: string): boolean => /[A-Za-z0-9_$]/.test(character)

    while (expandedStart > 0 && isIdentifierCharacter(sql[expandedStart - 1])) {
      expandedStart--
    }

    while (expandedEnd < sql.length && isIdentifierCharacter(sql[expandedEnd])) {
      expandedEnd++
    }

    return { startOffset: expandedStart, endOffset: expandedEnd }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private normalizeLine(value: unknown, fallback: number = 1): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) return fallback

    return Math.floor(parsed)
  }

  private normalizeColumn(value: unknown, fallback: number = 1): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) return fallback

    return Math.floor(parsed)
  }

  private normalizeEndColumn(
    value: unknown,
    startColumn: number,
    startLineNumber: number,
    endLineNumber: number
  ): number {
    const fallback = startLineNumber === endLineNumber ? startColumn + 1 : 1
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) return fallback

    return Math.floor(parsed)
  }

  private clampRange(
    sql: string,
    range: SqlSyntaxDiagnosticRange
  ): SqlSyntaxDiagnosticRange {
    const lines = sql.split(/\r\n|\r|\n/)
    const maxLine = Math.max(1, lines.length)
    const startLineNumber = Math.min(range.startLineNumber, maxLine)
    const endLineNumber = Math.min(Math.max(range.endLineNumber, startLineNumber), maxLine)
    const startLineMaxColumn = this.getLineMaxColumn(lines, startLineNumber)
    const endLineMaxColumn = this.getLineMaxColumn(lines, endLineNumber)
    const startColumn = Math.min(range.startColumn, startLineMaxColumn)
    let endColumn = Math.min(range.endColumn, endLineMaxColumn)

    if (startLineNumber === endLineNumber && endColumn <= startColumn) {
      endColumn = Math.min(startColumn + 1, startLineMaxColumn)
    }

    return {
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn
    }
  }

  private getLineMaxColumn(lines: string[], lineNumber: number): number {
    return (lines[lineNumber - 1] || '').length + 1
  }
}
