import SQLiteV3 from '../../../models/sqlite/v3.js';
import SSSQLiteV3 from '../../schemas/sqlite/v3.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { quoteIdentifier } from '../../../utils/sql-identifiers.js';
import type {
  DatabaseDiagramResult,
  DiagramColumn,
  DiagramEntity,
  DiagramRelation,
  QueryRow
} from '../../../types.js';
import {
  MAX_DIAGRAM_OBJECTS,
  diagramSuccess,
  limitedDiagram,
  readRowValue,
  toDiagramEntity
} from '../diagram-utils.js';

class DiagramSQLiteV3 {
  private readonly db = new SQLiteV3();

  async schemaDiagram(connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const selected = await SSSQLiteV3.getSelectedDatabase(connectionKey);
      if (!selected.success) {
        return { success: false, message: selected.message };
      }
      const objects = await this.loadObjects(connectionKey);
      if (objects.length > MAX_DIAGRAM_OBJECTS) return limitedDiagram(selected.database, objects.length);

      const { entities, relations } = await this.loadObjectDetails(objects, connectionKey);
      return diagramSuccess('schema', selected.database, entities, relations, objects.length);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the SQLite diagram.', error: getErrorMessage(error) };
    }
  }

  async objectDiagram(objectName: string, connectionKey?: string): Promise<DatabaseDiagramResult> {
    try {
      const objects = await this.loadObjects(connectionKey, objectName);
      const { entities } = await this.loadObjectDetails(objects, connectionKey, false);
      return diagramSuccess('object', objectName, entities, []);
    } catch (error: unknown) {
      return { success: false, message: 'Could not load the SQLite object diagram.', error: getErrorMessage(error) };
    }
  }

  private loadObjects(connectionKey?: string, objectName?: string): Promise<QueryRow[]> {
    return this.db.executeQuery(`
      SELECT name AS entity_name, type AS entity_kind
      FROM sqlite_master
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
        AND (? IS NULL OR name = ?)
      ORDER BY name
    `, [objectName || null, objectName || null], connectionKey) as Promise<QueryRow[]>;
  }

  private async loadObjectDetails(
    objects: QueryRow[],
    connectionKey?: string,
    includeRelations = true
  ): Promise<{ entities: DiagramEntity[]; relations: DiagramRelation[] }> {
    const entities: DiagramEntity[] = [];
    const relations: DiagramRelation[] = [];

    for (const object of objects) {
      const name = String(readRowValue(object, ['entity_name']) || '');
      const columns = await this.db.executeQuery(
        `PRAGMA table_info(${quoteIdentifier(name)})`,
        [],
        connectionKey
      ) as QueryRow[];
      const diagramColumns: DiagramColumn[] = columns.map((column) => ({
        name: String(column['name'] || ''),
        dataType: String(column['type'] || 'TEXT'),
        nullable: Number(column['notnull'] || 0) === 0,
        primaryKey: Number(column['pk'] || 0) > 0,
        ordinal: Number(column['cid'] || 0)
      }));
      entities.push(toDiagramEntity(name, object['entity_kind'], diagramColumns));

      if (!includeRelations || String(object['entity_kind']) === 'view') continue;
      const foreignKeys = await this.db.executeQuery(
        `PRAGMA foreign_key_list(${quoteIdentifier(name)})`,
        [],
        connectionKey
      ) as QueryRow[];
      foreignKeys.forEach((foreignKey, index) => {
        const targetEntity = String(foreignKey['table'] || '');
        const sourceColumn = String(foreignKey['from'] || '');
        const targetColumn = String(foreignKey['to'] || '');
        relations.push({
          id: `${name}:${foreignKey['id'] ?? index}:${foreignKey['seq'] ?? 0}`,
          sourceEntity: name,
          sourceColumn,
          targetEntity,
          targetColumn
        });
      });
    }

    return { entities, relations };
  }
}

export default new DiagramSQLiteV3();
