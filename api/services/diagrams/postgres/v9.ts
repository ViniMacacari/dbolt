import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';
import type { DatabaseDiagramResult, DiagramEntity, QueryRow } from '../../../types.js';
import {
  MAX_DIAGRAM_OBJECTS,
  diagramSuccess,
  groupColumns,
  limitedDiagram,
  readRowValue,
  toDiagramEntity,
  toDiagramRelation
} from '../diagram-utils.js';

class DiagramPostgresV1 {
  private readonly db = new PgV1();

  async schemaDiagram(connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const summary = await this.db.executeQuery(`
        SELECT current_schema() AS schema_name, COUNT(*) AS object_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p', 'v', 'm')
      `, [], connectionKey) as QueryRow[];
      const title = String(readRowValue(summary[0] || {}, ['schema_name']) || 'PostgreSQL');
      const objectCount = Number(readRowValue(summary[0] || {}, ['object_count']) || 0);

      if (objectCount > MAX_DIAGRAM_OBJECTS) return limitedDiagram(title, objectCount);

      const [objects, columns, relations] = await Promise.all([
        this.loadObjects(connectionKey),
        this.loadColumns(connectionKey),
        this.loadRelations(connectionKey)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('schema', title, entities, relations.map(toDiagramRelation), objectCount);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the PostgreSQL diagram.', error: getErrorMessage(error) };
    }
  }

  async objectDiagram(objectName: string, connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const [objects, columns] = await Promise.all([
        this.loadObjects(connectionKey, objectName),
        this.loadColumns(connectionKey, objectName)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities: DiagramEntity[] = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('object', objectName, entities, []);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the PostgreSQL object diagram.', error: getErrorMessage(error) };
    }
  }

  private loadObjects(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT c.relname AS entity_name,
        CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END AS entity_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND ($1::text IS NULL OR c.relname = $1)
      ORDER BY c.relname
    `, [objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private loadColumns(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT c.relname AS entity_name, a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        NOT a.attnotnull AS is_nullable,
        CASE WHEN pk.attnum IS NULL THEN 0 ELSE 1 END AS primary_key,
        a.attnum AS ordinal_position
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      LEFT JOIN (
        SELECT i.indrelid, unnest(i.indkey) AS attnum
        FROM pg_index i WHERE i.indisprimary
      ) pk ON pk.indrelid = c.oid AND pk.attnum = a.attnum
      WHERE n.nspname = current_schema()
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND ($1::text IS NULL OR c.relname = $1)
      ORDER BY c.relname, a.attnum
    `, [objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private loadRelations(connectionKey?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT con.conname AS relation_name,
        source_table.relname AS source_entity, source_column.attname AS source_column,
        target_table.relname AS target_entity, target_column.attname AS target_column
      FROM pg_constraint con
      JOIN pg_class source_table ON source_table.oid = con.conrelid
      JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
      JOIN pg_class target_table ON target_table.oid = con.confrelid
      JOIN pg_namespace target_schema ON target_schema.oid = target_table.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY source_key(attnum, ord) ON true
      JOIN LATERAL unnest(con.confkey) WITH ORDINALITY target_key(attnum, ord)
        ON target_key.ord = source_key.ord
      JOIN pg_attribute source_column
        ON source_column.attrelid = source_table.oid AND source_column.attnum = source_key.attnum
      JOIN pg_attribute target_column
        ON target_column.attrelid = target_table.oid AND target_column.attnum = target_key.attnum
      WHERE con.contype = 'f'
        AND source_schema.nspname = current_schema()
        AND target_schema.nspname = current_schema()
      ORDER BY source_table.relname, con.conname, source_key.ord
    `, [], connectionKey) as Promise<QueryRow[]>;
  }
}

export default new DiagramPostgresV1();
