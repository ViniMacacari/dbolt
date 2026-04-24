import type { DatabaseObject, DatabaseObjectType, GroupedDatabaseObjects, QueryRow } from '../types.js';

type ObjectRow = QueryRow & Record<string, unknown>;

function readString(row: ObjectRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }

  return '';
}

function buildObjectId(type: DatabaseObjectType, name: string, index: number, parentName = ''): string {
  return [type, parentName, name || index].filter(Boolean).join(':');
}

export function toNamedDatabaseObject(
  row: ObjectRow,
  type: Exclude<DatabaseObjectType, 'index'>,
  index: number
): DatabaseObject {
  const name = readString(row, ['name', 'NAME', 'table_name', 'TABLE_NAME', 'view_name', 'VIEW_NAME', 'routine_name', 'ROUTINE_NAME', 'procedure_name', 'PROCEDURE_NAME']);

  return {
    id: buildObjectId(type, name, index),
    name,
    type
  };
}

export function toIndexDatabaseObject(row: ObjectRow, index: number): DatabaseObject {
  const name = readString(row, ['index_name', 'INDEX_NAME', 'name', 'NAME']);
  const table = readString(row, ['table_name', 'TABLE_NAME', 'table', 'TABLE']);
  const indexType = readString(row, ['index_type', 'INDEX_TYPE', 'type_desc', 'TYPE_DESC']);

  return {
    id: buildObjectId('index', name, index, table),
    name,
    table,
    type: 'index',
    ...(indexType ? { index_type: indexType } : {})
  };
}

export function groupDatabaseObjects(data: DatabaseObject[]): GroupedDatabaseObjects {
  return {
    tables: data.filter((object) => object.type === 'table'),
    views: data.filter((object) => object.type === 'view'),
    procedures: data.filter((object) => object.type === 'procedure' || object.type === 'function'),
    indexes: data.filter((object) => object.type === 'index')
  };
}
