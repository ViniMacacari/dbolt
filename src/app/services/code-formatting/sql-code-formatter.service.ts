import { Injectable } from '@angular/core'

export interface SqlCodeFormatterOptions {
  indentSize?: number
  uppercaseKeywords?: boolean
}

interface ProtectedSql {
  sql: string
  values: string[]
}

@Injectable({
  providedIn: 'root'
})
export class SqlCodeFormatterService {
  private readonly fallbackOptions: Required<SqlCodeFormatterOptions> = {
    indentSize: 2,
    uppercaseKeywords: true
  }

  private readonly keywordMap = new Map([
    ['add', 'ADD'],
    ['all', 'ALL'],
    ['alter', 'ALTER'],
    ['and', 'AND'],
    ['as', 'AS'],
    ['asc', 'ASC'],
    ['between', 'BETWEEN'],
    ['by', 'BY'],
    ['case', 'CASE'],
    ['create', 'CREATE'],
    ['cross', 'CROSS'],
    ['delete', 'DELETE'],
    ['desc', 'DESC'],
    ['distinct', 'DISTINCT'],
    ['drop', 'DROP'],
    ['else', 'ELSE'],
    ['end', 'END'],
    ['except', 'EXCEPT'],
    ['exists', 'EXISTS'],
    ['from', 'FROM'],
    ['full', 'FULL'],
    ['group', 'GROUP'],
    ['having', 'HAVING'],
    ['in', 'IN'],
    ['inner', 'INNER'],
    ['insert', 'INSERT'],
    ['intersect', 'INTERSECT'],
    ['into', 'INTO'],
    ['is', 'IS'],
    ['join', 'JOIN'],
    ['left', 'LEFT'],
    ['like', 'LIKE'],
    ['limit', 'LIMIT'],
    ['not', 'NOT'],
    ['null', 'NULL'],
    ['offset', 'OFFSET'],
    ['on', 'ON'],
    ['or', 'OR'],
    ['order', 'ORDER'],
    ['outer', 'OUTER'],
    ['over', 'OVER'],
    ['partition', 'PARTITION'],
    ['procedure', 'PROCEDURE'],
    ['returning', 'RETURNING'],
    ['right', 'RIGHT'],
    ['select', 'SELECT'],
    ['set', 'SET'],
    ['table', 'TABLE'],
    ['then', 'THEN'],
    ['top', 'TOP'],
    ['truncate', 'TRUNCATE'],
    ['union', 'UNION'],
    ['update', 'UPDATE'],
    ['values', 'VALUES'],
    ['view', 'VIEW'],
    ['when', 'WHEN'],
    ['where', 'WHERE'],
    ['with', 'WITH']
  ])

  format(sql: string, options: SqlCodeFormatterOptions = {}): string {
    if (!sql.trim()) return sql

    const resolvedOptions = this.resolveOptions(options)
    const protectedSql = this.protectLiteralsAndComments(sql)
    let formatted = this.normalizeWhitespace(protectedSql.sql)

    if (resolvedOptions.uppercaseKeywords) {
      formatted = this.uppercaseKeywords(formatted)
    }

    formatted = this.formatSelectLists(formatted, resolvedOptions)
    formatted = this.breakClauses(formatted)
    formatted = this.normalizeLines(formatted, resolvedOptions)

    return this.restoreProtectedValues(formatted, protectedSql.values)
  }

  private resolveOptions(options: SqlCodeFormatterOptions): Required<SqlCodeFormatterOptions> {
    return {
      indentSize: this.normalizeIndentSize(options.indentSize),
      uppercaseKeywords: options.uppercaseKeywords ?? this.fallbackOptions.uppercaseKeywords
    }
  }

  private normalizeIndentSize(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.fallbackOptions.indentSize
    }

    return Math.min(Math.floor(parsed), 8)
  }

  private protectLiteralsAndComments(sql: string): ProtectedSql {
    const values: string[] = []
    let result = ''

    for (let index = 0; index < sql.length; index++) {
      const current = sql[index]
      const next = sql[index + 1]

      if (current === '-' && next === '-') {
        const endIndex = this.findLineEnd(sql, index + 2)
        result += this.createPlaceholder(values, sql.slice(index, endIndex))
        index = endIndex - 1
        continue
      }

      if (current === '/' && next === '*') {
        const endIndex = sql.indexOf('*/', index + 2)
        const sliceEnd = endIndex === -1 ? sql.length : endIndex + 2
        result += this.createPlaceholder(values, sql.slice(index, sliceEnd))
        index = sliceEnd - 1
        continue
      }

      if (current === '\'') {
        const endIndex = this.findQuotedEnd(sql, index, '\'')
        result += this.createPlaceholder(values, sql.slice(index, endIndex))
        index = endIndex - 1
        continue
      }

      if (current === '"' || current === '`') {
        const endIndex = this.findQuotedEnd(sql, index, current)
        result += this.createPlaceholder(values, sql.slice(index, endIndex))
        index = endIndex - 1
        continue
      }

      if (current === '[') {
        const endIndex = this.findBracketEnd(sql, index)
        result += this.createPlaceholder(values, sql.slice(index, endIndex))
        index = endIndex - 1
        continue
      }

      result += current
    }

    return { sql: result, values }
  }

  private createPlaceholder(values: string[], value: string): string {
    const index = values.push(value) - 1

    return `__DBOLT_SQL_FMT_${index}__`
  }

  private findLineEnd(sql: string, startIndex: number): number {
    const newlineIndex = sql.indexOf('\n', startIndex)

    return newlineIndex === -1 ? sql.length : newlineIndex
  }

  private findQuotedEnd(sql: string, startIndex: number, quote: string): number {
    for (let index = startIndex + 1; index < sql.length; index++) {
      if (sql[index] !== quote) continue

      if (sql[index + 1] === quote) {
        index++
        continue
      }

      return index + 1
    }

    return sql.length
  }

  private findBracketEnd(sql: string, startIndex: number): number {
    for (let index = startIndex + 1; index < sql.length; index++) {
      if (sql[index] !== ']') continue

      if (sql[index + 1] === ']') {
        index++
        continue
      }

      return index + 1
    }

    return sql.length
  }

  private normalizeWhitespace(sql: string): string {
    return sql
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\s*([,;])\s*/g, '$1 ')
      .replace(/\s*\(\s*/g, '(')
      .replace(/\s*\)\s*/g, ')')
      .replace(/\s*([=<>!]+)\s*/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private uppercaseKeywords(sql: string): string {
    return sql.replace(/\b[A-Za-z_][A-Za-z0-9_$#]*\b/g, (word) => (
      this.keywordMap.get(word.toLowerCase()) || word
    ))
  }

  private formatSelectLists(sql: string, options: Required<SqlCodeFormatterOptions>): string {
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
      const indent = ' '.repeat(options.indentSize)

      result += `${selectKeyword}\n${indent}${columns.join(`,\n${indent}`)}\n`
      cursor = fromIndex
    }

    return result
  }

  private breakClauses(sql: string): string {
    return sql
      .replace(/\s*;\s*/g, ';\n')
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
  }

  private normalizeLines(sql: string, options: Required<SqlCodeFormatterOptions>): string {
    const indent = ' '.repeat(options.indentSize)
    const lines = sql
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    let inSelectList = false

    return lines
      .map((line) => {
        if (/^SELECT\b/i.test(line)) {
          inSelectList = true
          return line
        }

        if (this.isTopLevelClauseLine(line)) {
          inSelectList = false
        }

        return `${inSelectList ? indent : this.getLineIndent(line, indent)}${line}`
      })
      .join('\n')
      .trim()
  }

  private getLineIndent(line: string, indent: string): string {
    if (/^(AND|OR|ON)\b/i.test(line)) {
      return indent
    }

    if (/^WHEN\b/i.test(line)) {
      return indent
    }

    return ''
  }

  private isTopLevelClauseLine(line: string): boolean {
    return /^(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|RETURNING|VALUES|SET|UNION|(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN)\b/i.test(line)
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

  private restoreProtectedValues(sql: string, values: string[]): string {
    return sql.replace(/__DBOLT_SQL_FMT_(\d+)__/g, (_, index) => values[Number(index)] || '')
  }
}
