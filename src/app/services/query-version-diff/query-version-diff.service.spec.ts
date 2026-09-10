import { QueryVersionDiffService } from './query-version-diff.service'

describe('QueryVersionDiffService change markers', () => {
  const service = new QueryVersionDiffService()

  it('distinguishes modified and added lines from the saved SQL', () => {
    const savedSql = 'SELECT\n  column_a\nFROM table_a'
    const currentSql = 'SELECT\n  column_b\nFROM table_a\nWHERE enabled = 1'

    expect(service.buildChangeMarkers(savedSql, currentSql)).toEqual([
      { lineNumber: 2, type: 'modified' },
      { lineNumber: 4, type: 'added' }
    ])
  })

  it('places a deleted-line marker next to the deletion point', () => {
    const savedSql = 'SELECT\n  column_a\n  column_b\nFROM table_a'
    const currentSql = 'SELECT\n  column_a\nFROM table_a'

    expect(service.buildChangeMarkers(savedSql, currentSql)).toEqual([
      { lineNumber: 3, type: 'deleted' }
    ])
  })

  it('returns no markers after the current SQL matches the saved SQL', () => {
    const sql = 'SELECT column_a FROM table_a'

    expect(service.buildChangeMarkers(sql, sql)).toEqual([])
  })

  it('marks the first content in an empty editor as added', () => {
    expect(service.buildChangeMarkers('', 'SELECT column_a FROM table_a')).toEqual([
      { lineNumber: 1, type: 'added' }
    ])
  })
})

describe('QueryVersionDiffService change hunks', () => {
  const service = new QueryVersionDiffService()
  const savedSql = 'SELECT a\nFROM t\nWHERE x = 1'

  it('describes a modified line with the original content', () => {
    const hunks = service.buildChangeHunks(savedSql, 'SELECT a\nFROM t\nWHERE x = 2')

    expect(hunks.length).toBe(1)
    expect(hunks[0].type).toBe('modified')
    expect(hunks[0].currentStartLine).toBe(3)
    expect(hunks[0].originalLines).toEqual(['WHERE x = 1'])
  })

  it('reports an added line with no original content', () => {
    const hunks = service.buildChangeHunks(savedSql, 'SELECT a\nFROM t\nWHERE x = 1\nORDER BY a')

    expect(hunks[0].type).toBe('added')
    expect(hunks[0].originalLines).toEqual([])
  })

  it('keeps the removed content of a deleted line', () => {
    const hunks = service.buildChangeHunks(savedSql, 'SELECT a\nFROM t')

    expect(hunks[0].type).toBe('deleted')
    expect(hunks[0].originalLines).toEqual(['WHERE x = 1'])
  })

  it('returns no hunks when nothing changed', () => {
    expect(service.buildChangeHunks(savedSql, savedSql)).toEqual([])
  })

  it('treats CRLF and LF as the same content', () => {
    expect(service.buildChangeHunks('SELECT 1\r\nFROM t', 'SELECT 1\nFROM t')).toEqual([])
  })

  it('finds the hunk that owns a clicked line and ignores unchanged lines', () => {
    const hunks = service.buildChangeHunks(savedSql, 'SELECT b\nFROM t\nWHERE x = 2')

    expect(hunks.length).toBe(2)
    expect(service.findHunkForLine(hunks, 1)?.originalLines).toEqual(['SELECT a'])
    expect(service.findHunkForLine(hunks, 3)?.originalLines).toEqual(['WHERE x = 1'])
    expect(service.findHunkForLine(hunks, 2)).toBeNull()
  })
})
