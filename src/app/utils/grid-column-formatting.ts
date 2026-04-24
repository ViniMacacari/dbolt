import { ColDef, ValueFormatterParams } from 'ag-grid-community'

type GridColumnType = 'boolean' | 'integer' | 'decimal' | 'string'

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0
})

const decimalFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6
})

export function buildTypedColumnDefs(rows: any[], indexWidth: number): ColDef[] {
  if (!rows.length) return []

  return [
    {
      headerName: '#',
      valueGetter: 'node.rowIndex + 1',
      pinned: 'left',
      filter: false,
      width: indexWidth
    },
    ...Object.keys(rows[0]).map((key) => {
      const columnType = detectColumnType(rows, key)

      return {
        field: key,
        headerName: key.trim(),
        headerClass: ['dbolt-typed-header', `dbolt-type-${columnType}`],
        cellClass: [`dbolt-cell-${columnType}`],
        valueFormatter: (params: ValueFormatterParams) => formatGridValue(params.value, columnType)
      }
    })
  ]
}

function detectColumnType(rows: any[], key: string): GridColumnType {
  const values = rows
    .map((row) => row?.[key])
    .filter((value) => value !== null && value !== undefined && value !== '')

  if (!values.length) return 'string'

  if (values.every(isBooleanValue)) return 'boolean'
  if (!values.every(isNumericValue)) return 'string'

  return values.some(isDecimalValue) ? 'decimal' : 'integer'
}

function formatGridValue(value: any, columnType: GridColumnType): string {
  if (value === null || value === undefined) return '[NULL]'

  if (columnType === 'boolean') {
    return String(normalizeBoolean(value))
  }

  if (columnType === 'integer') {
    const parsed = parseNumericValue(value)
    return parsed === null ? String(value) : integerFormatter.format(parsed)
  }

  if (columnType === 'decimal') {
    const parsed = parseNumericValue(value)
    return parsed === null ? String(value) : decimalFormatter.format(parsed)
  }

  return String(value)
}

function isBooleanValue(value: any): boolean {
  if (typeof value === 'boolean') return true
  if (typeof value !== 'string') return false

  return ['true', 'false'].includes(value.trim().toLowerCase())
}

function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  return value.trim().toLowerCase() === 'true'
}

function isNumericValue(value: any): boolean {
  return parseNumericValue(value) !== null
}

function isDecimalValue(value: any): boolean {
  if (typeof value === 'number') return !Number.isInteger(value)
  if (typeof value !== 'string') return false

  const normalized = value.trim().replace(',', '.')
  return /^-?\d+\.\d+$/.test(normalized)
}

function parseNumericValue(value: any): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const normalized = trimmed.replace(',', '.')

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  if (hasLeadingZero(normalized)) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function hasLeadingZero(value: string): boolean {
  const unsignedValue = value.startsWith('-') ? value.slice(1) : value
  const integerPart = unsignedValue.split('.')[0]

  return integerPart.length > 1 && integerPart.startsWith('0')
}
