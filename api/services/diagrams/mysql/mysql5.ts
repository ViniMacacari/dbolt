import MySQLV1 from '../../../models/mysql/mysql5.js';
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

class DiagramMySQLV1 {
  private readonly db = new MySQLV1();

  async schemaDiagram(connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const countRows = await this.db.executeQuery(`
        SELECT COUNT(*) AS object_count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      `, [], connectionKey) as QueryRow[];
      const objectCount = Number(readRowValue(countRows[0] || {}, ['object_count']) || 0);
      const databaseRows = await this.db.executeQuery('SELECT DATABASE() AS database_name', [], connectionKey) as QueryRow[];
      const title = String(readRowValue(databaseRows[0] || {}, ['database_name']) || 'MySQL');

      if (objectCount > MAX_DIAGRAM_OBJECTS) {
        return limitedDiagram(title, objectCount);
      }

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
      return { success: false, message: 'Could not load the MySQL diagram.', error: getErrorMessage(error) };
    }
  }

  async objectDiagram(objectName: string, connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const [objects, columns] = await Promise.all([
        this.db.executeQuery(`
          SELECT TABLE_NAME AS entity_name,
            CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS entity_kind
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          LIMIT 1
        `, [objectName], connectionKey) as Promise<QueryRow[]>,
        this.loadColumns(connectionKey, objectName)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities: DiagramEntity[] = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('object', objectName, entities, []);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the MySQL object diagram.', error: getErrorMessage(error) };
    }
  }

  private loadObjects(connectionKey?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT TABLE_NAME AS entity_name,
        CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS entity_kind
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_NAME
    `, [], connectionKey) as Promise<QueryRow[]>;
  }

  private loadColumns(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT c.TABLE_NAME AS entity_name, c.COLUMN_NAME AS column_name,
        c.COLUMN_TYPE AS data_type, c.IS_NULLABLE AS is_nullable,
        CASE WHEN c.COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END AS primary_key,
        c.ORDINAL_POSITION AS ordinal_position
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND (? IS NULL OR c.TABLE_NAME = ?)
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
    `, [objectName || null, objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private loadRelations(connectionKey?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT kcu.CONSTRAINT_NAME AS relation_name,
        kcu.TABLE_NAME AS source_entity, kcu.COLUMN_NAME AS source_column,
        kcu.REFERENCED_TABLE_NAME AS target_entity,
        kcu.REFERENCED_COLUMN_NAME AS target_column
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `, [], connectionKey) as Promise<QueryRow[]>;
  }
}

export default new DiagramMySQLV1();
