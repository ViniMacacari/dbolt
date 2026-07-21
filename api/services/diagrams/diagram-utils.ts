import type {
  DatabaseDiagramResult,
  DiagramColumn,
  DiagramEntity,
  DiagramObjectKind,
  DiagramRelation,
  DiagramScope,
  QueryRow,
  QueryRowValue
} from '../../types.js';

export const MAX_DIAGRAM_OBJECTS = 800;

export function diagramSuccess(
  scope: DiagramScope,
  title: string,
  entities: DiagramEntity[],
  relations: DiagramRelation[],
  objectCount: number = entities.length
): DatabaseDiagramResult {
  return {
    success: true,
    data: {
      scope,
      title,
      objectCount,
      maxObjects: MAX_DIAGRAM_OBJECTS,
      limited: false,
      entities,
      relations
    }
  };
}

export function limitedDiagram(title: string, objectCount: number): DatabaseDiagramResult {
  return {
    success: true,
    data: {
      scope: 'schema',
      title,
      objectCount,
      maxObjects: MAX_DIAGRAM_OBJECTS,
      limited: true,
      entities: [],
      relations: []
    }
  };
}

export function toDiagramEntity(
  name: QueryRowValue,
  kind: QueryRowValue,
  columns: DiagramColumn[]
): DiagramEntity {
  const normalizedName = String(name || '');
  const normalizedKind: DiagramObjectKind = String(kind || '').toLowerCase().includes('view')
    ? 'view'
    : 'table';

  return {
    id: normalizedName,
    name: normalizedName,
    kind: normalizedKind,
    columns: [...columns].sort((left, right) => left.ordinal - right.ordinal)
  };
}

export function toDiagramColumn(row: QueryRow): DiagramColumn {
  return {
    name: String(readRowValue(row, ['column_name', 'name']) || ''),
    dataType: String(readRowValue(row, ['data_type', 'column_type', 'type']) || ''),
    nullable: toBoolean(readRowValue(row, ['is_nullable', 'nullable']), true),
    primaryKey: toBoolean(readRowValue(row, ['primary_key', 'is_primary_key', 'pk']), false),
    ordinal: Number(readRowValue(row, ['ordinal_position', 'position', 'cid']) || 0)
  };
}

export function toDiagramRelation(row: QueryRow, index: number): DiagramRelation {
  const sourceEntity = String(readRowValue(row, ['source_entity', 'table_name']) || '');
  const sourceColumn = String(readRowValue(row, ['source_column', 'column_name']) || '');
  const targetEntity = String(readRowValue(row, ['target_entity', 'referenced_table']) || '');
  const targetColumn = String(readRowValue(row, ['target_column', 'referenced_column']) || '');
  const name = String(readRowValue(row, ['relation_name', 'constraint_name', 'name']) || '');

  return {
    id: `${name || 'relation'}:${sourceEntity}:${sourceColumn}:${targetEntity}:${targetColumn}:${index}`,
    ...(name ? { name } : {}),
    sourceEntity,
    sourceColumn,
    targetEntity,
    targetColumn
  };
}

export function groupColumns(rows: QueryRow[]): Map<string, DiagramColumn[]> {
  const grouped = new Map<string, DiagramColumn[]>();

  for (const row of rows) {
    const entityName = String(readRowValue(row, ['entity_name', 'table_name', 'object_name']) || '');
    if (!entityName) continue;

    const columns = grouped.get(entityName) || [];
    columns.push(toDiagramColumn(row));
    grouped.set(entityName, columns);
  }

  return grouped;
}

export function readRowValue(row: QueryRow, keys: string[]): QueryRowValue {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }

    const matchingKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (matchingKey && row[matchingKey] !== undefined && row[matchingKey] !== null) {
      return row[matchingKey];
    }
  }

  return undefined;
}

export function toBoolean(value: QueryRowValue, nullableDefault: boolean): boolean {
  if (value === undefined || value === null || value === '') return nullableDefault;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value) > 0;

  return ['true', 'yes', 'y', '1'].includes(String(value).trim().toLowerCase());
}
