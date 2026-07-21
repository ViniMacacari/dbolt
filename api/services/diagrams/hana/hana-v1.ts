import HanaV1 from '../../../models/hana/hana-v1.js';
import SSchemaHanaV1 from '../../schemas/hana/hana-v1.js';
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

class DiagramHanaV1 {
  private readonly db = new HanaV1();

  async schemaDiagram(connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const selected = await SSchemaHanaV1.getSelectedSchema(connectionKey);
      if (!selected.success) {
        return { success: false, message: selected.message };
      }
      const countRows = await this.db.executeQuery(`
        SELECT COUNT(*) AS "object_count" FROM (
          SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA
          UNION ALL
          SELECT VIEW_NAME FROM SYS.VIEWS WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ) objects
      `, [], connectionKey) as QueryRow[];
      const objectCount = Number(readRowValue(countRows[0] || {}, ['object_count']) || 0);
      if (objectCount > MAX_DIAGRAM_OBJECTS) return limitedDiagram(selected.schema, objectCount);

      const [objects, columns, relations] = await Promise.all([
        this.loadObjects(connectionKey),
        this.loadColumns(connectionKey),
        this.loadRelations(connectionKey)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('schema', selected.schema, entities, relations.map(toDiagramRelation), objectCount);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the SAP HANA diagram.', error: getErrorMessage(error) };
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
      return { success: false, message: 'Could not load the SAP HANA object diagram.', error: getErrorMessage(error) };
    }
  }

  private loadObjects(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT "entity_name", "entity_kind" FROM (
        SELECT TABLE_NAME AS "entity_name", 'table' AS "entity_kind"
        FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA
        UNION ALL
        SELECT VIEW_NAME AS "entity_name", 'view' AS "entity_kind"
        FROM SYS.VIEWS WHERE SCHEMA_NAME = CURRENT_SCHEMA
      ) objects
      WHERE (? IS NULL OR "entity_name" = ? OR "entity_name" = UPPER(?))
      ORDER BY "entity_name"
    `, [objectName || null, objectName || null, objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private loadColumns(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT "entity_name", "column_name", "data_type", "is_nullable", "primary_key", "ordinal_position"
      FROM (
        SELECT tc.TABLE_NAME AS "entity_name", tc.COLUMN_NAME AS "column_name",
          CASE
            WHEN tc.LENGTH IS NOT NULL AND tc.DATA_TYPE_NAME IN ('VARCHAR','NVARCHAR','CHAR','NCHAR','VARBINARY')
              THEN tc.DATA_TYPE_NAME || '(' || tc.LENGTH || ')'
            WHEN tc.DATA_TYPE_NAME IN ('DECIMAL','SMALLDECIMAL')
              THEN tc.DATA_TYPE_NAME || '(' || tc.LENGTH || ',' || tc.SCALE || ')'
            ELSE tc.DATA_TYPE_NAME
          END AS "data_type",
          tc.IS_NULLABLE AS "is_nullable",
          CASE WHEN EXISTS (
            SELECT 1 FROM SYS.CONSTRAINTS c
            WHERE c.SCHEMA_NAME = tc.SCHEMA_NAME AND c.TABLE_NAME = tc.TABLE_NAME
              AND c.COLUMN_NAME = tc.COLUMN_NAME AND c.IS_PRIMARY_KEY = 'TRUE'
          ) THEN 1 ELSE 0 END AS "primary_key",
          tc.POSITION AS "ordinal_position"
        FROM SYS.TABLE_COLUMNS tc WHERE tc.SCHEMA_NAME = CURRENT_SCHEMA
        UNION ALL
        SELECT vc.VIEW_NAME AS "entity_name", vc.COLUMN_NAME AS "column_name",
          CASE
            WHEN vc.LENGTH IS NOT NULL AND vc.DATA_TYPE_NAME IN ('VARCHAR','NVARCHAR','CHAR','NCHAR','VARBINARY')
              THEN vc.DATA_TYPE_NAME || '(' || vc.LENGTH || ')'
            ELSE vc.DATA_TYPE_NAME
          END AS "data_type",
          vc.IS_NULLABLE AS "is_nullable", 0 AS "primary_key", vc.POSITION AS "ordinal_position"
        FROM SYS.VIEW_COLUMNS vc WHERE vc.SCHEMA_NAME = CURRENT_SCHEMA
      ) columns
      WHERE (? IS NULL OR "entity_name" = ? OR "entity_name" = UPPER(?))
      ORDER BY "entity_name", "ordinal_position"
    `, [objectName || null, objectName || null, objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private async loadRelations(connectionKey?: string): Promise<QueryRow[]> {
    try {
      return await this.db.executeQuery(`
        SELECT CONSTRAINT_NAME AS "relation_name",
          TABLE_NAME AS "source_entity", COLUMN_NAME AS "source_column",
          REFERENCED_TABLE_NAME AS "target_entity",
          REFERENCED_COLUMN_NAME AS "target_column"
        FROM SYS.REFERENTIAL_CONSTRAINTS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
          AND REFERENCED_SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY TABLE_NAME, CONSTRAINT_NAME, POSITION
      `, [], connectionKey) as QueryRow[];
    } catch (error: unknown) {
      console.warn('Could not load SAP HANA diagram relationships:', getErrorMessage(error));
      return [];
    }
  }
}

export default new DiagramHanaV1();
