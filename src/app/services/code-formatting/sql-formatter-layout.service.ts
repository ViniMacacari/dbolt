import { Injectable } from '@angular/core'
import type { SqlCodeFormatterOptions } from './sql-code-formatter.service'

type ResolvedSqlCodeFormatterOptions = Required<SqlCodeFormatterOptions>

interface SqlStatement {
  text: string
  terminated: boolean
}

@Injectable({
  providedIn: 'root'
})
export class SqlFormatterLayoutService {
  format(sql: string, options: ResolvedSqlCodeFormatterOptions): string {
    return this.splitStatements(sql)
      .map((statement) => this.formatStatement(statement, options))
      .join(options.blankLineBetweenStatements ? '\n\n' : '\n')
      .trim()
  }

  private formatStatement(statement: SqlStatement, options: ResolvedSqlCodeFormatterOptions): string {
    const text = statement.text.trim()
    if (!text) return ''

    const formatted = this.formatCreateOrAlterStatement(text, options) ||
      this.formatQueryStatement(text, options, 0)

    return statement.terminated ? `${formatted};` : formatted
  }

  private formatCreateOrAlterStatement(sql: string, options: ResolvedSqlCodeFormatterOptions): string | null {
    if (!/^(CREATE|ALTER)\b/i.test(sql)) return null
    if (!/\b(VIEW|PROCEDURE|PROC|FUNCTION)\b/i.test(sql)) return null

    const asIndex = this.findTopLevelWord(sql, 'as', 0)
    if (asIndex === -1) return null

    const header = sql.slice(0, asIndex).trim()
    const body = sql.slice(asIndex + 2).trim()
    if (!body) return `${header} AS`

    const bodyBaseLevel = options.indentCreateBody && !/^BEGIN\b/i.test(body)
      ? 1
      : 0

    return [
      `${header} AS`,
      this.formatQueryStatement(body, options, bodyBaseLevel)
    ].join('\n')
  }

  private formatQueryStatement(sql: string, options: ResolvedSqlCodeFormatterOptions, baseLevel: number): string {
    return this.normalizeLines(
      this.breakClauses(
        this.formatSelectLists(sql, options)
      ),
      options,
      baseLevel
    )
  }

  private formatSelectLists(sql: string, options: ResolvedSqlCodeFormatterOptions): string {
    let result = ''
    let cursor = 0

    while (cursor < sql.length) {
      const selectIndex = this.findNextWord(sql, 'select', cursor)
      if (selectIndex === -1) {
        result += sql.slice(cursor)
        break
      }

      const fromIndex = this.findTopLevelWord(sql, 'from', selectIndex + 6)
      if (fromIndex === -1) {
        result += sql.slice(cursor)
        break
      }

      result += sql.slice(cursor, selectIndex)

      const selectKeyword = sql.slice(selectIndex, selectIndex + 6)
      const columnText = sql.slice(selectIndex + 6, fromIndex).trim()
      const columns = this.splitTopLevel(columnText, ',')

      result += `${selectKeyword}\n${this.formatCommaList(columns, options).join('\n')}\n`
      cursor = fromIndex
    }

    return result
  }

  private formatCommaList(values: string[], options: ResolvedSqlCodeFormatterOptions): string[] {
    if (options.commaStyle === 'leading') {
      return values.map((value, index) => index === 0 ? value : `, ${value}`)
    }

    return values.map((value, index) => index < values.length - 1 ? `${value},` : value)
  }

  private breakClauses(sql: string): string {
    return sql
      .replace(/\b(BEGIN)\b\s*/gi, '$1\n')
      .replace(/\s*\b(END)\b/gi, '\n$1')
      .replace(/\s+(FROM)\b/gi, '\n$1')
      .replace(/\s+(WHERE)\b/gi, '\n$1')
      .replace(/\s+(GROUP\s+BY)\b/gi, '\n$1')
      .replace(/\s+(ORDER\s+BY)\b/gi, '\n$1')
      .replace(/\s+(HAVING)\b/gi, '\n$1')
      .replace(/\s+(LIMIT)\b/gi, '\n$1')
      .replace(/\s+(OFFSET)\b/gi, '\n$1')
      .replace(/\s+(RETURNING)\b/gi, '\n$1')
      .replace(/\s+(VALUES)\b/gi, '\n$1')
      .replace(/\s+(SET)\b/gi, '\n$1')
      .replace(/\s+(UNION(?:\s+ALL)?)\b/gi, '\n$1')
      .replace(/\s+((?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN)\b/gi, '\n$1')
      .replace(/\s+(ON)\b/gi, '\n$1')
      .replace(/\s+(AND|OR)\b/gi, '\n$1')
      .replace(/\s+(WHEN|ELSE)\b/gi, '\n$1')
  }

  private normalizeLines(sql: string, options: ResolvedSqlCodeFormatterOptions, baseLevel: number): string {
    const indentUnit = ' '.repeat(options.indentSize)
    const lines = sql
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    let blockLevel = baseLevel
    let inSelectList = false

    return lines
      .map((line) => {
        if (/^END\b/i.test(line)) {
          blockLevel = Math.max(baseLevel, blockLevel - 1)
        }

        const isSelectLine = /^SELECT\b/i.test(line)
        const isClauseLine = this.isTopLevelClauseLine(line)
        const extraLevel = this.getLineExtraLevel(line, inSelectList, isClauseLine)
        const formattedLine = `${indentUnit.repeat(blockLevel + extraLevel)}${line}`

        if (isSelectLine) {
          inSelectList = true
        } else if (isClauseLine) {
          inSelectList = false
        }

        if (/^BEGIN\b/i.test(line)) {
          blockLevel++
          inSelectList = false
        }

        return formattedLine
      })
      .join('\n')
      .trimEnd()
  }

  private getLineExtraLevel(line: string, inSelectList: boolean, isClauseLine: boolean): number {
    if (inSelectList && !isClauseLine) return 1
    if (/^(AND|OR|ON|WHEN|ELSE)\b/i.test(line)) return 1

    return 0
  }

  private isTopLevelClauseLine(line: string): boolean {
    return /^(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|RETURNING|VALUES|SET|UNION|(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN)\b/i.test(line)
  }

  private splitStatements(sql: string): SqlStatement[] {
    const statements: SqlStatement[] = []
    let level = 0
    let current = ''

    for (const char of sql) {
      if (char === '(') {
        level++
      } else if (char === ')') {
        level = Math.max(0, level - 1)
      }

      if (char === ';' && level === 0) {
        if (current.trim()) {
          statements.push({ text: current.trim(), terminated: true })
        }
        current = ''
        continue
      }

      current += char
    }

    if (current.trim()) {
      statements.push({ text: current.trim(), terminated: false })
    }

    return statements
  }

  private splitTopLevel(value: string, delimiter: string): string[] {
    const parts: string[] = []
    let level = 0
    let current = ''

    for (const char of value) {
      if (char === '(') {
        level++
      } else if (char === ')') {
        level = Math.max(0, level - 1)
      }

      if (char === delimiter && level === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    if (current.trim()) {
      parts.push(current.trim())
    }

    return parts.length ? parts : [value.trim()]
  }

  private findNextWord(sql: string, word: string, startIndex: number): number {
    const pattern = new RegExp(`\\b${word}\\b`, 'ig')
    pattern.lastIndex = startIndex
    const match = pattern.exec(sql)

    return match?.index ?? -1
  }

  private findTopLevelWord(sql: string, word: string, startIndex: number): number {
    let level = 0
    const normalizedWord = word.toLowerCase()

    for (let index = startIndex; index < sql.length; index++) {
      const char = sql[index]

      if (char === '(') {
        level++
        continue
      }

      if (char === ')') {
        level = Math.max(0, level - 1)
        continue
      }

      if (level === 0 && this.isWordAt(sql, normalizedWord, index)) {
        return index
      }
    }

    return -1
  }

  private isWordAt(sql: string, word: string, index: number): boolean {
    const candidate = sql.slice(index, index + word.length).toLowerCase()
    if (candidate !== word) return false

    return !this.isWordCharacter(sql[index - 1]) && !this.isWordCharacter(sql[index + word.length])
  }

  private isWordCharacter(value?: string): boolean {
    return Boolean(value && /[A-Za-z0-9_$#]/.test(value))
  }
}
