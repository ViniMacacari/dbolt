import { ValueFormatterParams } from 'ag-grid-community'
import { buildTypedColumnDefs } from './grid-column-formatting'

describe('grid-column-formatting', () => {
  function formatValue(rows: any[], field: string, value: any): string {
    const column = buildTypedColumnDefs(rows, 40).find((definition) => definition.field === field)
    const formatter = column?.valueFormatter

    if (typeof formatter !== 'function') throw new Error(`Missing formatter for ${field}`)

    return formatter({ value } as ValueFormatterParams)
  }

  it('does not add thousands separators to integer values', () => {
    expect(formatValue([{ Number: 1597050 }], 'Number', 1597050)).toBe('1597050')
  })

  it('uses a dot only as the decimal separator', () => {
    expect(formatValue([{ Amount: 1260.4 }], 'Amount', 1260.4)).toBe('1260.40')
  })
})
