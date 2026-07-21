import sql from 'mssql';
import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';
import type { DatabaseDiagramResult, DiagramEntity, QueryRow, SqlServerQueryParameter } from '../../../types.js';
import {
  MAX_DIAGRAM_OBJECTS,
  diagramSuccess,
  groupColumns,
  limitedDiagram,
  readRowValue,
  toDiagramEntity,
  toDiagramRelation
} from '../diagram-utils.js';

class DiagramSQLServerV1 {
  private readonly db = new SQLServerV1();

  async schemaDiagram(connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const selected = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selected.success) {
        return { success: false, message: selected.message };
      }
      const parameters = this.schemaParameters(selected.schema);
      const summary = await this.db.executeQuery(`
        SELECT COUNT(*) AS object_count FROM sys.objects o
        JOIN sys.schemas s ON s.schema_id = o.schema_id
        WHERE s.name = @schemaName AND o.type IN ('U', 'V') AND o.is_ms_shipped = 0
      `, parameters, connectionKey) as QueryRow[];
      const objectCount = Number(readRowValue(summary[0] || {}, ['object_count']) || 0);
      if (objectCount > MAX_DIAGRAM_OBJECTS) return limitedDiagram(selected.schema, objectCount);

      const [objects, columns, relations] = await Promise.all([
        this.loadObjects(parameters, connectionKey),
        this.loadColumns(parameters, connectionKey),
        this.loadRelations(parameters, connectionKey)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('schema', selected.schema, entities, relations.map(toDiagramRelation), objectCount);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the SQL Server diagram.', error: getErrorMessage(error) };
    }
  }

  async objectDiagram(objectName: string, connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const selected = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selected.success) {
        return { success: false, message: selected.message };
      }
      const parameters = this.schemaParameters(selected.schema, objectName);
      const [objects, columns] = await Promise.all([
        this.loadObjects(parameters, connectionKey, true),
        this.loadColumns(parameters, connectionKey, true)
      ]);
      const groupedColumns = groupColumns(columns);
      const entities: DiagramEntity[] = objects.map((object) =>
        toDiagramEntity(object['entity_name'], object['entity_kind'], groupedColumns.get(String(object['entity_name'])) || [])
      );

      return diagramSuccess('object', objectName, entities, []);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the SQL Server object diagram.', error: getErrorMessage(error) };
    }
  }

  private schemaParameters(schemaName: string, objectName?: string): SqlServerQueryParameter[] {
    const parameters: SqlServerQueryParameter[] = [{ name: 'schemaName', type: sql.NVarChar, value: schemaName }];
    if (objectName) parameters.push({ name: 'objectName', type: sql.NVarChar, value: objectName });
    return parameters;
  }

  private loadObjects(parameters: SqlServerQueryParameter[], connectionKey?: string, single = false): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT o.name AS entity_name, CASE WHEN o.type = 'V' THEN 'view' ELSE 'table' END AS entity_kind
      FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE s.name = @schemaName AND o.type IN ('U', 'V') AND o.is_ms_shipped = 0
        ${single ? 'AND o.name = @objectName' : ''}
      ORDER BY o.name
    `, parameters, connectionKey) as Promise<QueryRow[]>;
  }

  private loadColumns(parameters: SqlServerQueryParameter[], connectionKey?: string, single = false): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT o.name AS entity_name, c.name AS column_name,
        CASE
          WHEN t.name IN ('varchar','char','varbinary','binary') AND c.max_length > 0 THEN t.name + '(' + CAST(c.max_length AS varchar(10)) + ')'
          WHEN t.name IN ('nvarchar','nchar') AND c.max_length > 0 THEN t.name + '(' + CAST(c.max_length / 2 AS varchar(10)) + ')'
          WHEN t.name IN ('decimal','numeric') THEN t.name + '(' + CAST(c.precision AS varchar(10)) + ',' + CAST(c.scale AS varchar(10)) + ')'
          ELSE t.name
        END AS data_type,
        c.is_nullable, CASE WHEN pk.column_id IS NULL THEN 0 ELSE 1 END AS primary_key,
        c.column_id AS ordinal_position
      FROM sys.objects o
      JOIN sys.schemas s ON s.schema_id = o.schema_id
      JOIN sys.columns c ON c.object_id = o.object_id
      JOIN sys.types t ON t.user_type_id = c.user_type_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON pk.object_id = o.object_id AND pk.column_id = c.column_id
      WHERE s.name = @schemaName AND o.type IN ('U', 'V') AND o.is_ms_shipped = 0
        ${single ? 'AND o.name = @objectName' : ''}
      ORDER BY o.name, c.column_id
    `, parameters, connectionKey) as Promise<QueryRow[]>;
  }

  private loadRelations(parameters: SqlServerQueryParameter[], connectionKey?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT fk.name AS relation_name,
        source_table.name AS source_entity, source_column.name AS source_column,
        target_table.name AS target_entity, target_column.name AS target_column
      FROM sys.foreign_key_columns fkc
      JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
      JOIN sys.tables source_table ON source_table.object_id = fkc.parent_object_id
      JOIN sys.schemas source_schema ON source_schema.schema_id = source_table.schema_id
      JOIN sys.columns source_column ON source_column.object_id = source_table.object_id AND source_column.column_id = fkc.parent_column_id
      JOIN sys.tables target_table ON target_table.object_id = fkc.referenced_object_id
      JOIN sys.schemas target_schema ON target_schema.schema_id = target_table.schema_id
      JOIN sys.columns target_column ON target_column.object_id = target_table.object_id AND target_column.column_id = fkc.referenced_column_id
      WHERE source_schema.name = @schemaName AND target_schema.name = @schemaName
      ORDER BY source_table.name, fk.name, fkc.constraint_column_id
    `, parameters, connectionKey) as Promise<QueryRow[]>;
  }
}

export default new DiagramSQLServerV1();
