import { Injectable } from '@angular/core'
import type { SqlCodeFormatterOptions } from './sql-code-formatter.service'

type ResolvedSqlCodeFormatterOptions = Required<SqlCodeFormatterOptions>
type SqlBlockType = 'begin' | 'case' | 'if' | 'loop'
type SqlSection = 'select' | 'from' | 'order-by' | 'set' | 'predicate' | 'join' | null

interface SqlStatement {
  text: string
  terminated: boolean
  trailingComment?: string
}

interface CommaListEntry {
  value: string
  leadingComments: string[]
  trailingComment?: string
}

@Injectable({
  providedIn: 'root'
})
export class SqlFormatterLayoutService {
  private readonly lineCommentPattern = /^__DBOLT_SQL_LINE_COMMENT_\d+__$/

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

    const terminator = statement.terminated ? ';' : ''
    const trailingComment = statement.trailingComment ? ` ${statement.trailingComment}` : ''

    return `${formatted}${terminator}${trailingComment}`
  }

  private formatCreateOrAlterStatement(sql: string, options: ResolvedSqlCodeFormatterOptions): string | null {
    if (!/^(CREATE|ALTER)\b/i.test(sql)) return null
    if (!/\b(VIEW|PROCEDURE|PROC|FUNCTION)\b/i.test(sql)) return null

    const asIndex = this.findCreateBodyAsIndex(sql)
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

  private findCreateBodyAsIndex(sql: string): number {
    const asIndexes = this.findTopLevelWordIndexes(sql, 'as', 0)
    const bodyStartPattern = /^(BEGIN|RETURN|SELECT|WITH|DECLARE|SET|INSERT|UPDATE|DELETE|IF|EXEC|EXECUTE|CALL)\b/i

    for (const asIndex of asIndexes) {
      const afterAs = sql.slice(asIndex + 2).trim()
      if (bodyStartPattern.test(afterAs)) {
        return asIndex
      }
    }

    return asIndexes[asIndexes.length - 1] ?? -1
  }

  private formatQueryStatement(sql: string, options: ResolvedSqlCodeFormatterOptions, baseLevel: number): string {
    let formatted = this.formatParenthesizedLists(sql, options)
    formatted = this.formatDmlLists(formatted, options)
    formatted = this.formatSelectLists(formatted, options)
    formatted = this.formatOrderByLists(formatted, options)
    formatted = this.breakClauses(formatted)

    return this.normalizeLines(formatted, options, baseLevel)
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
        .map((column) => this.breakLongArithmeticExpression(column))

      result += `${selectKeyword}\n${this.formatCommaList(columns, options).join('\n')}\n`
      cursor = fromIndex
    }

    return result
  }

  private formatOrderByLists(sql: string, options: ResolvedSqlCodeFormatterOptions): string {
    let result = ''
    let cursor = 0

    while (cursor < sql.length) {
      const clause = this.findTopLevelOrderBy(sql, cursor)
      if (!clause) {
        result += sql.slice(cursor)
        break
      }

      const boundary = this.findFirstTopLevelBoundary(
        sql,
        ['limit', 'offset', 'fetch', 'for', 'union', 'returning'],
        clause.contentStart
      )
      const semicolon = this.findTopLevelCharacter(sql, ';', clause.contentStart)
      const contentEnd = semicolon === -1 ? boundary : Math.min(boundary, semicolon)
      const values = this.splitTopLevel(sql.slice(clause.contentStart, contentEnd).trim(), ',')

      result += sql.slice(cursor, clause.index)
      result += `${sql.slice(clause.index, clause.contentStart).trim()}\n`
      result += this.formatCommaList(values, options).join('\n')
      cursor = contentEnd
    }

    return result
  }

  private findTopLevelOrderBy(
    sql: string,
    startIndex: number
  ): { index: number; contentStart: number } | null {
    for (const index of this.findTopLevelWordIndexes(sql, 'order', startIndex)) {
      const match = sql.slice(index).match(/^ORDER\s+BY\b/i)
      if (match) {
        return { index, contentStart: index + match[0].length }
      }
    }

    return null
  }

  private formatDmlLists(sql: string, options: ResolvedSqlCodeFormatterOptions): string {
    return this.formatStatementSegments(sql, /\bUPDATE\b[^;]*(?:;|$)/gi, (segment) => {
      const setIndex = this.findTopLevelWord(segment, 'set', 0)
      if (setIndex === -1) return segment

      const assignmentStart = setIndex + 3
      const assignmentEnd = this.findFirstTopLevelBoundary(
        segment,
        ['from', 'where', 'returning'],
        assignmentStart
      )
      const assignments = this.splitTopLevel(
        segment.slice(assignmentStart, assignmentEnd).trim(),
        ','
      )

      if (assignments.length < 2) return segment

      return [
        segment.slice(0, setIndex).trimEnd(),
        'SET',
        this.formatCommaList(assignments, options).join('\n'),
        segment.slice(assignmentEnd).trimStart()
      ].filter(Boolean).join('\n')
    }, options)
  }

  private formatStatementSegments(
    sql: string,
    pattern: RegExp,
    formatter: (segment: string) => string,
    options: ResolvedSqlCodeFormatterOptions
  ): string {
    const updated = sql.replace(pattern, (segment) => formatter(segment))

    return updated.replace(/\bVALUES\b[\s\S]*?(?=;|\bRETURNING\b|$)/gi, (valuesClause) => {
      const valuesIndex = this.findTopLevelWord(valuesClause, 'values', 0)
      if (valuesIndex === -1) return valuesClause

      const values = this.splitTopLevel(valuesClause.slice(valuesIndex + 6).trim(), ',')
      if (values.length < 2 || !values.every((value) => value.trim().startsWith('('))) {
        return valuesClause
      }

      return `${valuesClause.slice(0, valuesIndex + 6)}\n${this.formatCommaList(values, options).join('\n')}`
    })
  }

  private formatParenthesizedLists(sql: string, options: ResolvedSqlCodeFormatterOptions): string {
    let result = ''

    for (let index = 0; index < sql.length; index++) {
      if (sql[index] !== '(') {
        result += sql[index]
        continue
      }

      const closingIndex = this.findMatchingParenthesis(sql, index)
      if (closingIndex === -1) {
        result += sql.slice(index)
        break
      }

      const rawContent = sql.slice(index + 1, closingIndex)
      const content = this.formatParenthesizedLists(rawContent, options)
      const values = this.splitTopLevel(content, ',')
      const previousWord = this.getPreviousWord(result)
      const insertColumnList = /\bINSERT\s+INTO\s+\S+\s*$/i.test(result)
      const keywordList = ['IN', 'VALUES'].includes(previousWord)
      const containsLineComment = /__DBOLT_SQL_LINE_COMMENT_\d+__/.test(content)
      const complexGrouping = content.length > 48 && (
        this.hasTopLevelLogicalOperator(content) ||
        this.hasTopLevelArithmeticOperator(content)
      )
      const shouldBreak = values.length >= 3 ||
        ((keywordList || insertColumnList) && values.length > 1) ||
        containsLineComment ||
        complexGrouping
      const needsLeadingSpace = keywordList || insertColumnList

      if (shouldBreak) {
        const formattedContent = values.length > 1
          ? this.formatCommaList(values, options).join('\n')
          : this.breakLongArithmeticExpression(content)
        result += `${needsLeadingSpace ? ' ' : ''}(\n${formattedContent}\n)`
      } else {
        result += `${needsLeadingSpace ? ' ' : ''}(${content.trim()})`
      }

      index = closingIndex
    }

    return result
  }

  private findMatchingParenthesis(sql: string, openingIndex: number): number {
    let level = 0

    for (let index = openingIndex; index < sql.length; index++) {
      if (sql[index] === '(') {
        level++
      } else if (sql[index] === ')') {
        level--
        if (level === 0) return index
      }
    }

    return -1
  }

  private getPreviousWord(value: string): string {
    return value.trimEnd().match(/([A-Za-z_][A-Za-z0-9_$#]*)$/)?.[1]?.toUpperCase() || ''
  }

  private formatCommaList(values: string[], options: ResolvedSqlCodeFormatterOptions): string[] {
    const entries = this.toCommaListEntries(values)

    return entries.map((entry, index) => {
      const needsComma = index < entries.length - 1
      const comma = needsComma ? ',' : ''
      const trailingComment = entry.trailingComment ? ` ${entry.trailingComment}` : ''
      let value = entry.value

      if (options.commaStyle === 'leading' && needsComma) {
        value = entry.trailingComment
          ? this.appendToLastLine(value, trailingComment)
          : value
      } else {
        value = this.appendToLastLine(value, `${comma}${trailingComment}`)
      }

      if (options.commaStyle === 'leading' && index > 0) {
        value = `, ${value}`
      }

      return entry.leadingComments.length
        ? `${entry.leadingComments.join('\n')}\n${value}`
        : value
    })
  }

  private toCommaListEntries(values: string[]): CommaListEntry[] {
    const entries = values.map((value): CommaListEntry => ({
      value: value.trim(),
      leadingComments: []
    }))

    for (let index = 1; index < entries.length; index++) {
      const lines = entries[index].value.split('\n').map((line) => line.trim()).filter(Boolean)
      const comments: string[] = []

      while (lines.length && this.lineCommentPattern.test(lines[0])) {
        comments.push(lines.shift() || '')
      }

      if (!comments.length) continue

      entries[index - 1].trailingComment = comments.shift()
      entries[index].leadingComments = comments
      entries[index].value = lines.join('\n')
    }

    return entries.filter((entry) => entry.value || entry.leadingComments.length)
  }

  private appendToLastLine(value: string, suffix: string): string {
    if (!suffix) return value

    const lines = value.split('\n')
    const lastIndex = lines.length - 1
    lines[lastIndex] = `${lines[lastIndex]}${suffix}`

    return lines.join('\n')
  }

  private breakLongArithmeticExpression(value: string): string {
    if (value.includes('\n') || value.length < 48 || !this.hasTopLevelArithmeticOperator(value)) {
      return value.trim()
    }

    let level = 0

    for (let index = 0; index < value.length; index++) {
      const char = value[index]
      if (char === '(') {
        level++
        continue
      }
      if (char === ')') {
        level = Math.max(0, level - 1)
        continue
      }

      if (
        level === 0 &&
        ['+', '-'].includes(char) &&
        /\s/.test(value[index - 1] || '') &&
        /\s/.test(value[index + 1] || '')
      ) {
        return `${value.slice(0, index).trimEnd()}\n${value.slice(index).trimStart()}`
      }
    }

    return value.trim()
  }

  private hasTopLevelArithmeticOperator(value: string): boolean {
    let level = 0

    for (let index = 0; index < value.length; index++) {
      const char = value[index]
      if (char === '(') level++
      if (char === ')') level = Math.max(0, level - 1)
      if (
        level === 0 &&
        ['+', '-'].includes(char) &&
        /\s/.test(value[index - 1] || '') &&
        /\s/.test(value[index + 1] || '')
      ) {
        return true
      }
    }

    return false
  }

  private hasTopLevelLogicalOperator(value: string): boolean {
    return this.findTopLevelWord(value, 'and', 0) !== -1 ||
      this.findTopLevelWord(value, 'or', 0) !== -1
  }

  private breakClauses(sql: string): string {
    const clauses = sql
      .replace(/\s*\b(BEGIN)\b\s*/gi, '\n$1\n')
      .replace(/\s*\b(END)\b/gi, '\n$1')
      .replace(/(?<!\bDELETE)\s+(FROM)\b\s*/gi, '\n$1\n')
      .replace(/\s+(WHERE)\b\s*/gi, '\n$1\n')
      .replace(/\s+(GROUP\s+BY)\b/gi, '\n$1')
      .replace(/\s+(ORDER\s+BY)\b/gi, '\n$1')
      .replace(/\s+(HAVING)\b\s*/gi, '\n$1\n')
      .replace(/\s+(LIMIT)\b/gi, '\n$1')
      .replace(/\s+(OFFSET)\b/gi, '\n$1')
      .replace(/\s+(RETURNING)\b/gi, '\n$1')
      .replace(/\s+(VALUES)\b/gi, '\n$1')
      .replace(/\s+(SET)\b\s*/gi, '\n$1\n')
      .replace(/\s+(UNION(?:\s+ALL)?)\b/gi, '\n$1')
      .replace(/\s+((?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN)\b/gi, '\n$1')
      .replace(/\s+(WHEN|ELSE|ELSEIF)\b/gi, '\n$1')
      .replace(/\b(THEN)\s+(?=(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|SET|CALL|RETURN)\b)/gi, '$1\n')
      .replace(/\b(ELSE)\s+(?=(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|SET|CALL|RETURN)\b)/gi, '$1\n')
      .replace(/;/g, ';\n')
      .replace(/\b(AND|OR|IN|WHEN|IF|WHILE|VALUES)\(/gi, '$1 (')

    return this.breakCaseThen(this.breakLogicalOperators(clauses))
  }

  private breakCaseThen(sql: string): string {
    let result = ''
    let caseLevel = 0

    for (let index = 0; index < sql.length;) {
      const wordMatch = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$#]*/)
      if (!wordMatch) {
        result += sql[index]
        index++
        continue
      }

      const word = wordMatch[0]
      const upperWord = word.toUpperCase()
      if (upperWord === 'CASE') {
        caseLevel++
      } else if (upperWord === 'END' && caseLevel > 0) {
        caseLevel--
      } else if (upperWord === 'THEN' && caseLevel > 0) {
        result = `${result.trimEnd()}\n${word}`
        index += word.length
        continue
      }

      result += word
      index += word.length
    }

    return result
  }

  private breakLogicalOperators(sql: string): string {
    let result = ''
    let level = 0
    const betweenLevels = new Set<number>()

    for (let index = 0; index < sql.length;) {
      const char = sql[index]
      if (char === '(') {
        level++
        result += char
        index++
        continue
      }
      if (char === ')') {
        betweenLevels.delete(level)
        level = Math.max(0, level - 1)
        result += char
        index++
        continue
      }

      const wordMatch = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$#]*/)
      if (!wordMatch) {
        result += char
        index++
        continue
      }

      const word = wordMatch[0]
      const upperWord = word.toUpperCase()
      if (upperWord === 'BETWEEN') {
        betweenLevels.add(level)
      } else if (upperWord === 'AND' && betweenLevels.has(level)) {
        betweenLevels.delete(level)
      } else if (upperWord === 'AND' || upperWord === 'OR') {
        result = `${result.trimEnd()}\n${word}`
        index += word.length
        continue
      }

      result += word
      index += word.length
    }

    return result
  }

  private normalizeLines(sql: string, options: ResolvedSqlCodeFormatterOptions, baseLevel: number): string {
    const indentUnit = ' '.repeat(options.indentSize)
    const lines = sql
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const blocks: SqlBlockType[] = []
    let section: SqlSection = null
    let parenthesisLevel = 0
    let inCaseCondition = false
    let inIfCondition = false

    return lines
      .map((rawLine) => {
        const line = this.normalizeLineSpacing(rawLine)
        const closedBlock = this.closeBlockForLine(line, blocks)
        const isElseLine = /^(ELSE|ELSEIF)\b/i.test(line)
        const leadingClosingParentheses = line.match(/^\)+/)?.[0].length || 0
        const effectiveParenthesisLevel = Math.max(0, parenthesisLevel - leadingClosingParentheses)
        const blockLevel = Math.max(0, blocks.length - (isElseLine && blocks.at(-1) === 'if' ? 1 : 0))
        const extraLevel = this.getLineExtraLevel(
          line,
          section,
          blocks,
          closedBlock,
          inCaseCondition,
          inIfCondition
        )
        const formattedLine = `${indentUnit.repeat(baseLevel + blockLevel + effectiveParenthesisLevel + extraLevel)}${line}`

        parenthesisLevel = Math.max(
          0,
          parenthesisLevel + this.countCharacter(line, '(') - this.countCharacter(line, ')')
        )
        section = this.resolveNextSection(line, section)
        this.openBlocksForLine(line, blocks)

        if (/^WHEN\b/i.test(line)) {
          inCaseCondition = true
        } else if (/^(THEN|ELSE|END)\b/i.test(line)) {
          inCaseCondition = false
        }

        if (/^IF\b/i.test(line) && !/\bTHEN\s*$/i.test(line)) {
          inIfCondition = true
        } else if (/\bTHEN\s*$/i.test(line)) {
          inIfCondition = false
        }

        if (line.endsWith(';')) {
          section = null
        }

        return formattedLine
      })
      .join('\n')
      .trimEnd()
  }

  private normalizeLineSpacing(line: string): string {
    return line
      .replace(/\b(AND|OR|IN|WHEN|IF|WHILE|VALUES)\(/gi, '$1 (')
      .replace(/\s+,/g, ',')
      .replace(/\s+;/g, ';')
  }

  private closeBlockForLine(line: string, blocks: SqlBlockType[]): SqlBlockType | null {
    if (!/^END\b/i.test(line)) return null

    const requestedType: SqlBlockType | null = /^END\s+IF\b/i.test(line)
      ? 'if'
      : /^END\s+(LOOP|WHILE|FOR)\b/i.test(line)
        ? 'loop'
        : null

    if (!blocks.length) return null
    if (!requestedType) return blocks.pop() || null

    for (let index = blocks.length - 1; index >= 0; index--) {
      if (blocks[index] !== requestedType) continue

      blocks.splice(index, 1)
      return requestedType
    }

    return blocks.pop() || null
  }

  private openBlocksForLine(line: string, blocks: SqlBlockType[]): void {
    if (/^BEGIN\b/i.test(line)) {
      blocks.push('begin')
      return
    }

    if (/\bCASE\s*$/i.test(line)) {
      blocks.push('case')
      return
    }

    if (
      /\bTHEN\s*$/i.test(line) &&
      !/^ELSEIF\b/i.test(line) &&
      blocks.at(-1) !== 'case'
    ) {
      blocks.push('if')
      return
    }

    if (/^(LOOP|WHILE|FOR)\b/i.test(line)) {
      blocks.push('loop')
    }
  }

  private getLineExtraLevel(
    line: string,
    section: SqlSection,
    blocks: SqlBlockType[],
    closedBlock: SqlBlockType | null,
    inCaseCondition: boolean,
    inIfCondition: boolean
  ): number {
    if (closedBlock && closedBlock !== 'case') return 0
    if (/^(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN\b/i.test(line)) {
      return section === 'from' || section === 'join' ? 1 : 0
    }
    if (this.isTopLevelClauseLine(line) || /^SELECT\b/i.test(line) || /^SET$/i.test(line)) return 0

    let level = section ? 1 : 0
    if (/^(ON)\b/i.test(line)) level = Math.max(level, 1)

    if (section === 'join' && /^(AND|OR)\b/i.test(line)) {
      level++
    }

    if (
      inCaseCondition &&
      blocks.at(-1) === 'case' &&
      !/^WHEN\b/i.test(line)
    ) {
      level++
    }

    if (inIfCondition && /^(AND|OR)\b/i.test(line)) {
      level++
    }

    if (/^[+\-*/]\s+/.test(line) && section) {
      level++
    }

    return level
  }

  private resolveNextSection(line: string, current: SqlSection): SqlSection {
    if (/^SELECT\b/i.test(line)) return 'select'
    if (/^FROM$/i.test(line)) return 'from'
    if (/^ORDER\s+BY$/i.test(line)) return 'order-by'
    if (/^SET$/i.test(line)) return 'set'
    if (/^(WHERE|HAVING)$/i.test(line)) return 'predicate'
    if (/^ON\b/i.test(line)) return 'join'
    if (/^(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN\b/i.test(line)) return 'join'

    if (/^(GROUP\s+BY|LIMIT|OFFSET|RETURNING|VALUES|UNION)\b/i.test(line)) {
      return null
    }

    return current
  }

  private isTopLevelClauseLine(line: string): boolean {
    return /^(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|RETURNING|VALUES|SET|UNION|(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|FULL(?:\s+OUTER)?|CROSS)?\s*JOIN)\b/i.test(line)
  }

  private countCharacter(value: string, character: string): number {
    return Array.from(value).filter((item) => item === character).length
  }

  private splitStatements(sql: string): SqlStatement[] {
    if (this.isRoutineDefinition(sql)) {
      return [this.toSingleStatement(sql)]
    }

    const statements: SqlStatement[] = []
    let level = 0
    let current = ''

    for (let index = 0; index < sql.length; index++) {
      const char = sql[index]
      if (char === '(') {
        level++
      } else if (char === ')') {
        level = Math.max(0, level - 1)
      }

      if (char === ';' && level === 0) {
        if (current.trim()) {
          const trailingCommentMatch = sql.slice(index + 1).match(
            /^[ \t]*(__DBOLT_SQL_LINE_COMMENT_\d+__)(?=\n|$)/
          )
          statements.push({
            text: current.trim(),
            terminated: true,
            trailingComment: trailingCommentMatch?.[1]
          })
          if (trailingCommentMatch) {
            index += trailingCommentMatch[0].length
          }
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

  private findTopLevelCharacter(sql: string, character: string, startIndex: number): number {
    let level = 0

    for (let index = startIndex; index < sql.length; index++) {
      if (sql[index] === '(') {
        level++
      } else if (sql[index] === ')') {
        level = Math.max(0, level - 1)
      } else if (sql[index] === character && level === 0) {
        return index
      }
    }

    return -1
  }

  private isRoutineDefinition(sql: string): boolean {
    return /^(CREATE|ALTER)\b[\s\S]*\b(PROCEDURE|PROC|FUNCTION)\b/i.test(sql.trim())
  }

  private toSingleStatement(sql: string): SqlStatement {
    const trimmed = sql.trim()
    const terminated = trimmed.endsWith(';')

    return {
      text: terminated ? trimmed.slice(0, -1).trim() : trimmed,
      terminated
    }
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
    return this.findTopLevelWordIndexes(sql, word, startIndex)[0] ?? -1
  }

  private findTopLevelWordIndexes(sql: string, word: string, startIndex: number): number[] {
    const indexes: number[] = []
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
        indexes.push(index)
      }
    }

    return indexes
  }

  private findFirstTopLevelBoundary(sql: string, words: string[], startIndex: number): number {
    const indexes = words
      .map((word) => this.findTopLevelWord(sql, word, startIndex))
      .filter((index) => index !== -1)

    return indexes.length ? Math.min(...indexes) : sql.length
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
