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
