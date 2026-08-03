export interface QualifiedTableFragment {
  fragment: string
  rawFragment: string
  schema?: string
}

export function normalizeSqlIdentifier(value: string): string {
  return value
    .trim()
    .replace(/^[`"\[]+/, '')
    .replace(/[`"\]]+$/, '')
}

export function splitSqlIdentifierParts(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null

  for (let index = 0; index < value.length; index++) {
    const char = value[index]

    if (quote) {
      current += char

      if ((quote === ']' && char === ']') || char === quote) {
        const next = value[index + 1]
        if ((quote === ']' && next === ']') || (quote === '"' && next === '"') || (quote === '`' && next === '`')) {
          current += next
          index++
          continue
        }

        quote = null
      }
      continue
    }

    if (char === '"' || char === '`' || char === '[') {
      quote = char === '[' ? ']' : char
      current += char
      continue
    }

    if (char === '.') {
      parts.push(current)
      current = ''
      continue
    }

    current += char
  }

  parts.push(current)
  return parts
}

export function parseQualifiedTableFragment(value: string): QualifiedTableFragment {
  const parts = splitSqlIdentifierParts(value)
  const rawFragment = parts.pop() || ''
  const schema = parts.length > 0
    ? normalizeSqlIdentifier(parts.pop() || '')
    : undefined

  return {
    fragment: normalizeSqlIdentifier(rawFragment),
    rawFragment,
    schema: schema || undefined
  }
}

export function normalizeTableReferenceForMetadata(value: string): string {
  const parts = splitSqlIdentifierParts(value)
    .filter((part) => normalizeSqlIdentifier(part))

  return parts.slice(-2).join('.')
}

export function parseMetadataTableReference(value: string): { tableName: string, schema?: string } {
  const trimmed = value.trim()
  if (!trimmed) return { tableName: '' }

  const parts = splitSqlIdentifierParts(trimmed)
  const tableName = normalizeSqlIdentifier(parts.pop() || trimmed)
  const schema = parts.length > 0
    ? normalizeSqlIdentifier(parts.pop() || '')
    : undefined

  return { tableName, schema: schema || undefined }
}
