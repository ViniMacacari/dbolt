import { Injectable } from '@angular/core'

export type QueryDiffLineType = 'unchanged' | 'added' | 'removed'

export interface QueryDiffLine {
  type: QueryDiffLineType
  oldLine?: number
  newLine?: number
  text: string
}

export interface QueryDiffResult {
  lines: QueryDiffLine[]
  added: number
  removed: number
  unchanged: number
}

export type QueryChangeMarkerType = 'added' | 'modified' | 'deleted'

export interface QueryChangeMarker {
  lineNumber: number
  type: QueryChangeMarkerType
}

@Injectable({
  providedIn: 'root'
})
export class QueryVersionDiffService {
  buildDiff(currentSql: string, comparedSql: string): QueryDiffResult {
    const currentLines = this.toLines(currentSql)
    const comparedLines = this.toLines(comparedSql)
    const matrix = this.buildLcsMatrix(currentLines, comparedLines)
    const lines = this.walkDiff(currentLines, comparedLines, matrix)

    return {
      lines,
      added: lines.filter(line => line.type === 'added').length,
      removed: lines.filter(line => line.type === 'removed').length,
      unchanged: lines.filter(line => line.type === 'unchanged').length
    }
  }

  buildChangeMarkers(savedSql: string, currentSql: string): QueryChangeMarker[] {
    const normalizedSavedSql = String(savedSql || '').replace(/\r\n/g, '\n')
    const normalizedCurrentSql = String(currentSql || '').replace(/\r\n/g, '\n')
    if (normalizedSavedSql === normalizedCurrentSql) return []

    const diffLines = this.buildDiff(normalizedSavedSql, normalizedCurrentSql).lines
    const currentLineCount = this.toLines(normalizedCurrentSql).length
    const markers: QueryChangeMarker[] = []
    const seen = new Set<string>()
    let index = 0
    let previousCurrentLine = 1

    const addMarker = (lineNumber: number, type: QueryChangeMarkerType): void => {
      const safeLineNumber = Math.min(Math.max(1, lineNumber), Math.max(1, currentLineCount))
      const key = `${type}:${safeLineNumber}`
      if (seen.has(key)) return

      seen.add(key)
      markers.push({ lineNumber: safeLineNumber, type })
    }

    while (index < diffLines.length) {
      const line = diffLines[index]
      if (line.type === 'unchanged') {
        previousCurrentLine = line.newLine || previousCurrentLine
        index += 1
        continue
      }

      const removedLines: QueryDiffLine[] = []
      const addedLines: QueryDiffLine[] = []
      while (index < diffLines.length && diffLines[index].type !== 'unchanged') {
        const changedLine = diffLines[index]
        const syntheticSavedEmptyLine = !normalizedSavedSql && changedLine.type === 'removed' && !changedLine.text
        const syntheticCurrentEmptyLine = !normalizedCurrentSql && changedLine.type === 'added' && !changedLine.text
        if (changedLine.type === 'removed' && !syntheticSavedEmptyLine) removedLines.push(changedLine)
        if (changedLine.type === 'added' && !syntheticCurrentEmptyLine) addedLines.push(changedLine)
        index += 1
      }

      const modifiedLineCount = Math.min(removedLines.length, addedLines.length)
      addedLines.forEach((addedLine, addedIndex) => {
        const lineNumber = addedLine.newLine || previousCurrentLine
        addMarker(lineNumber, addedIndex < modifiedLineCount ? 'modified' : 'added')
        previousCurrentLine = lineNumber
      })

      if (removedLines.length > modifiedLineCount) {
        const nextCurrentLine = diffLines[index]?.newLine
          || addedLines[addedLines.length - 1]?.newLine
          || previousCurrentLine
        addMarker(nextCurrentLine, 'deleted')
      }
    }

    return markers
  }

  private toLines(sql: string): string[] {
    const normalizedSql = String(sql || '').replace(/\r\n/g, '\n')
    return normalizedSql.length ? normalizedSql.split('\n') : ['']
  }

  private buildLcsMatrix(left: string[], right: string[]): number[][] {
    const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0))

    for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex--) {
      for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) {
        matrix[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
          ? matrix[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1])
      }
    }

    return matrix
  }

  private walkDiff(left: string[], right: string[], matrix: number[][]): QueryDiffLine[] {
    const lines: QueryDiffLine[] = []
    let leftIndex = 0
    let rightIndex = 0

    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] === right[rightIndex]) {
        lines.push({
          type: 'unchanged',
          oldLine: leftIndex + 1,
          newLine: rightIndex + 1,
          text: left[leftIndex]
        })
        leftIndex++
        rightIndex++
      } else if (matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1]) {
        lines.push({
          type: 'removed',
          oldLine: leftIndex + 1,
          text: left[leftIndex]
        })
        leftIndex++
      } else {
        lines.push({
          type: 'added',
          newLine: rightIndex + 1,
          text: right[rightIndex]
        })
        rightIndex++
      }
    }

    while (leftIndex < left.length) {
      lines.push({
        type: 'removed',
        oldLine: leftIndex + 1,
        text: left[leftIndex]
      })
      leftIndex++
    }

    while (rightIndex < right.length) {
      lines.push({
        type: 'added',
        newLine: rightIndex + 1,
        text: right[rightIndex]
      })
      rightIndex++
    }

    return lines
  }
}
