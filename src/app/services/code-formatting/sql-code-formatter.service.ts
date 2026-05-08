import { Injectable } from '@angular/core'
import type { SqlFormatterCommaStyle } from '../app-settings/app-settings.service'
import { SqlFormatterLayoutService } from './sql-formatter-layout.service'

export interface SqlCodeFormatterOptions {
  indentSize?: number
  uppercaseKeywords?: boolean
  commaStyle?: SqlFormatterCommaStyle
  blankLineBetweenStatements?: boolean
  indentCreateBody?: boolean
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
    uppercaseKeywords: true,
    commaStyle: 'trailing',
    blankLineBetweenStatements: true,
    indentCreateBody: true
  }

  private readonly keywordMap = new Map([
    ['add', 'ADD'],
    ['all', 'ALL'],
    ['alter', 'ALTER'],
    ['and', 'AND'],
    ['as', 'AS'],
    ['asc', 'ASC'],
    ['begin', 'BEGIN'],
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
    ['function', 'FUNCTION'],
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
    ['proc', 'PROC'],
    ['procedure', 'PROCEDURE'],
    ['replace', 'REPLACE'],
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

  constructor(private layout: SqlFormatterLayoutService) { }

  format(sql: string, options: SqlCodeFormatterOptions = {}): string {
    if (!sql.trim()) return sql

    const resolvedOptions = this.resolveOptions(options)
    const protectedSql = this.protectLiteralsAndComments(sql)
    let formatted = this.normalizeWhitespace(protectedSql.sql)

    if (resolvedOptions.uppercaseKeywords) {
      formatted = this.uppercaseKeywords(formatted)
    }

    formatted = this.layout.format(formatted, resolvedOptions)

    return this.restoreProtectedValues(formatted, protectedSql.values)
  }

  private resolveOptions(options: SqlCodeFormatterOptions): Required<SqlCodeFormatterOptions> {
    return {
      indentSize: this.normalizeIndentSize(options.indentSize),
      uppercaseKeywords: options.uppercaseKeywords ?? this.fallbackOptions.uppercaseKeywords,
      commaStyle: options.commaStyle === 'leading' ? 'leading' : this.fallbackOptions.commaStyle,
      blankLineBetweenStatements: options.blankLineBetweenStatements ?? this.fallbackOptions.blankLineBetweenStatements,
      indentCreateBody: options.indentCreateBody ?? this.fallbackOptions.indentCreateBody
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
      .replace(/\s*\)/g, ')')
      .replace(/\s*([=<>!]+)\s*/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private uppercaseKeywords(sql: string): string {
    return sql.replace(/\b[A-Za-z_][A-Za-z0-9_$#]*\b/g, (word) => (
      this.keywordMap.get(word.toLowerCase()) || word
    ))
  }

  private restoreProtectedValues(sql: string, values: string[]): string {
    return sql.replace(/__DBOLT_SQL_FMT_(\d+)__/g, (_, index) => values[Number(index)] || '')
  }
}
