import { selectSqlStatementAtCursor } from './sql-statement-selection'

describe('selectSqlStatementAtCursor', () => {
  it('selects the current multi-line statement after a blank line', () => {
    const sql = [
      'select * from oinv',
      'where 1=1',
      'and 2=3',
      '',
      'select * from obpl where 1=1',
      '  and 2=2'
    ].join('\n')

    expect(selectSqlStatementAtCursor(sql, 6, 9)).toBe([
      'select * from obpl where 1=1',
      '  and 2=2'
    ].join('\n'))
  })

  it('selects the current multi-line statement before a blank line', () => {
    const sql = [
      'select * from oinv',
      'where 1=1',
      'and 2=3',
      '',
      'select * from obpl where 1=1',
      'and 2=2'
    ].join('\n')

    expect(selectSqlStatementAtCursor(sql, 3, 7)).toBe([
      'select * from oinv',
      'where 1=1',
      'and 2=3'
    ].join('\n'))
  })

  it('selects the current statement when semicolons split the same block', () => {
    const sql = [
      'select * from oinv;',
      'select * from obpl',
      'where 1=1'
    ].join('\n')

    expect(selectSqlStatementAtCursor(sql, 3, 6)).toBe([
      'select * from obpl',
      'where 1=1'
    ].join('\n'))
  })

  it('does not split semicolons inside string literals', () => {
    const sql = [
      "select ';' as marker",
      'from dummy',
      'where 1=1'
    ].join('\n')

    expect(selectSqlStatementAtCursor(sql, 2, 6)).toBe(sql)
  })
})
