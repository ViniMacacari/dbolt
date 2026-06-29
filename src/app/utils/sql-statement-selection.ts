interface SqlStatementSegment {
  start: number
  end: number
  cursorEnd: number
}

export function selectSqlStatementAtCursor(sql: string, cursorLine: number, cursorColumn: number): string {
  const lines = splitSqlLines(sql)
  const lineIndex = cursorLine - 1

  if (lineIndex < 0 || lineIndex >= lines.length || !lines[lineIndex].trim()) {
    return ''
  }

  let startLine = lineIndex
  while (startLine > 0 && lines[startLine - 1].trim()) {
    startLine--
  }

  let endLine = lineIndex
  while (endLine < lines.length - 1 && lines[endLine + 1].trim()) {
    endLine++
  }

  const blockLines = lines.slice(startLine, endLine + 1)
  const blockSql = blockLines.join('\n')
  const offset = getBlockCursorOffset(blockLines, lineIndex - startLine, cursorColumn)

  return extractStatementAtOffset(blockSql, offset).trim()
}

function splitSqlLines(sql: string): string[] {
  return String(sql || '').split(/\r\n|\r|\n/)
}

function getBlockCursorOffset(lines: string[], lineIndex: number, column: number): number {
  const previousLinesLength = lines
    .slice(0, lineIndex)
    .reduce((length, line) => length + line.length + 1, 0)
  const currentLine = lines[lineIndex] || ''
  const columnOffset = Math.min(Math.max(Math.floor(column || 1) - 1, 0), currentLine.length)

  return previousLinesLength + columnOffset
}

function extractStatementAtOffset(sql: string, offset: number): string {
  const segments = getStatementSegments(sql)

  const currentSegment = segments.find((segment) =>
    offset >= segment.start &&
    offset <= segment.cursorEnd &&
    sql.slice(segment.start, segment.end).trim().length > 0
  )

  return currentSegment ? sql.slice(currentSegment.start, currentSegment.end) : ''
}

function getStatementSegments(sql: string): SqlStatementSegment[] {
  const segments: SqlStatementSegment[] = []
  let start = 0
  let quote: '\'' | '"' | '`' | null = null
  let bracketIdentifier = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index++) {
    const current = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (current === '\n') {
        lineComment = false
      }
      continue
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false
        index++
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

    if (bracketIdentifier) {
      if (current === ']') {
        if (next === ']') {
          index++
        } else {
          bracketIdentifier = false
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
      continue
    }

    if (current === '[') {
      bracketIdentifier = true
      continue
    }

    if (current === ';') {
      segments.push({
        start,
        end: index,
        cursorEnd: index + 1
      })
      start = index + 1
    }
  }

  segments.push({
    start,
    end: sql.length,
    cursorEnd: sql.length
  })

  return segments
}
