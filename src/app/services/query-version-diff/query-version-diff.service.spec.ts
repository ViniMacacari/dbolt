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
