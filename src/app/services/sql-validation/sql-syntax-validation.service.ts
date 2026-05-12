import { Injectable } from '@angular/core'

export interface SqlSyntaxDiagnostic {
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

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

type ParserDatabase = 'mysql' | 'postgresql' | 'sqlite' | 'transactsql'

interface SqlParser {
  astify: (sql: string, options?: any) => unknown
}

interface SqlParserModule {
  Parser?: new () => SqlParser
  default?: {
    Parser?: new () => SqlParser
  }
}

@Injectable({
  providedIn: 'root'
})
export class SqlSyntaxValidationService {
  private readonly parsers = new Map<ParserDatabase, Promise<SqlParser>>()

  async validate(sql: string, context?: any): Promise<SqlSyntaxDiagnostic[]> {
    if (!sql.trim()) {
      return []
    }

    if (this.shouldSkipParser(sql, context)) {
      return []
    }

    try {
      const database = this.resolveParserDatabase(context)
      const parser = await this.getParser(database)

      parser.astify(sql, {
        database,
        parseOptions: {
          includeLocations: true
        }
      })

      return []
    } catch (error) {
      return [this.toDiagnostic(error as SqlParserError, sql)]
    }
  }

  private resolveParserDatabase(context?: any): ParserDatabase {
    const database = String(context?.sgbd || context?.database || '').toLowerCase()

    if (database === 'postgres') return 'postgresql'
    if (database === 'sqlite') return 'sqlite'
    if (database === 'sqlserver') return 'transactsql'
    if (database === 'hana') return 'transactsql'
    if (database === 'mysql') return 'mysql'

    return 'transactsql'
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

  private getParser(database: ParserDatabase): Promise<SqlParser> {
    const cachedParser = this.parsers.get(database)
    if (cachedParser) return cachedParser

    const parserPromise = this.loadParser(database)
    this.parsers.set(database, parserPromise)

    return parserPromise
  }

  private async loadParser(database: ParserDatabase): Promise<SqlParser> {
    const parserModule = await this.importParserModule(database)
    const ParserConstructor = parserModule.Parser || parserModule.default?.Parser

    if (!ParserConstructor) {
      throw new Error('Could not load SQL parser.')
    }

    return new ParserConstructor()
  }

  private async importParserModule(database: ParserDatabase): Promise<SqlParserModule> {
    if (database === 'mysql') {
      return import('node-sql-parser/build/mysql')
    }

    if (database === 'postgresql') {
      return import('node-sql-parser/build/postgresql')
    }

    if (database === 'sqlite') {
      return import('node-sql-parser/build/sqlite')
    }

    return import('node-sql-parser/build/transactsql')
  }

  private toDiagnostic(error: SqlParserError, sql: string): SqlSyntaxDiagnostic {
    const location = error.location
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

    return {
      ...range,
      message: this.normalizeMessage(error)
    }
  }

  private normalizeMessage(error: SqlParserError): string {
    const found = typeof error.found === 'string' ? error.found : ''
    const message = String(error.message || '').trim()

    if (/end of input found/i.test(message) || error.found === null) {
      return 'Invalid SQL syntax: statement is incomplete.'
    }

    if (found) {
      return `Invalid SQL syntax near "${found}".`
    }

    return 'Invalid SQL syntax.'
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
    range: Omit<SqlSyntaxDiagnostic, 'message'>
  ): Omit<SqlSyntaxDiagnostic, 'message'> {
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
