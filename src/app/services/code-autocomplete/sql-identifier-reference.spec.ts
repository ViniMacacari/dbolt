import {
  normalizeTableReferenceForMetadata,
  parseMetadataTableReference,
  parseQualifiedTableFragment
} from './sql-identifier-reference'

describe('SQL identifier references', () => {
  it('should separate the schema from a partial table name', () => {
    expect(parseQualifiedTableFragment('meu_schema.tab')).toEqual({
      schema: 'meu_schema',
      fragment: 'tab',
      rawFragment: 'tab'
    })
  })

  it('should preserve a qualified table for alias metadata', () => {
    const reference = normalizeTableReferenceForMetadata('database.meu_schema.tabela')

    expect(reference).toBe('meu_schema.tabela')
    expect(parseMetadataTableReference(reference)).toEqual({
      schema: 'meu_schema',
      tableName: 'tabela'
    })
  })

  it('should preserve quoted schema names containing dots', () => {
    const reference = normalizeTableReferenceForMetadata('"meu.schema"."tabela"')

    expect(reference).toBe('"meu.schema"."tabela"')
    expect(parseMetadataTableReference(reference)).toEqual({
      schema: 'meu.schema',
      tableName: 'tabela'
    })
  })
})
