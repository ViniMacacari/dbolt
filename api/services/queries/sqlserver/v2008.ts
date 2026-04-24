import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { total_rows: number };

class SQuerySQLServerV1 {
  private readonly db = new SQLServerV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    let totalRows: number | null = null;
    let executableSql = await this.adjustSchemaInQuery(sql, connectionKey);
    const cleanedSql = this.removeComments(executableSql);

    if (this.isSelectQuery(cleanedSql)) {
      const countSql = this.addTotalRowCountQuery(executableSql);
      const resultWithCount = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
      totalRows = resultWithCount[0]?.total_rows ?? 0;
    }

    if (maxLines && this.isSelectQuery(cleanedSql) && !this.hasLimitClause(cleanedSql)) {
      executableSql = this.addPaginationToQuery(executableSql, maxLines);
    }

    const result = await this.db.executeQuery(executableSql, [], connectionKey);

    if (result.length === 0) {
      const columnSql = this.addPaginationToQuery(executableSql, 0);
      const columnsResult = await this.db.executeQuery(columnSql, [], connectionKey);
      const columns = Object.keys(columnsResult[0] ?? {});

      return {
        success: true,
        result: [],
        columns,
        totalRows
      };
    }

    return {
      success: true,
      result,
      totalRows
    };
  }

  hasLimitClause(sql: string): boolean {
    const cleanedSql = this.removeComments(sql);
    const lowerSql = cleanedSql.toLowerCase();
    return lowerSql.includes(' fetch next ') || lowerSql.includes(' offset ');
  }

  hasOrderByClause(sql: string): boolean {
    const cleanedSql = this.removeComments(sql);
    const lowerSql = cleanedSql.toLowerCase();
    return lowerSql.includes(' order by ');
  }

  isSelectQuery(sql: string): boolean {
    const cleanedSql = this.removeComments(sql).trim().toLowerCase();
    const nonSelectKeywords =
      /^(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|exec|set|use|describe|explain|show|call|backup|restore|analyze|optimize|begin|commit|rollback)\b/;

    return !nonSelectKeywords.test(cleanedSql) && cleanedSql.startsWith('select ');
  }

  removeComments(sql: string): string {
    return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  }

  addPaginationToQuery(sql: string, maxLines: number): string {
    const trimmedSql = sql.trim();
    const orderByClause = this.hasOrderByClause(trimmedSql)
      ? this.extractOrderByClause(trimmedSql)
      : 'ORDER BY (SELECT NULL)';

    return `
      SELECT TOP ${maxLines} *
      FROM (${trimmedSql.replace(/order\s+by\s+.+$/i, '')}) AS PaginatedQuery
      ${orderByClause}
    `;
  }

  extractOrderByClause(sql: string): string {
    const match = sql.match(/order\s+by\s+.+$/i);
    if (!match) {
      throw new Error('ORDER BY clause is required for pagination.');
    }

    return match[0];
  }

  addTotalRowCountQuery(sql: string): string {
    const trimmedSql = this.removeComments(sql).trim();
    return `SELECT COUNT(*) OVER() AS total_rows, * FROM (${trimmedSql}) AS query_with_count`;
  }

  async adjustSchemaInQuery(sql: string, connectionKey?: string): Promise<string> {
    const currentSchemaResult = await SSSQLServerV1.getSelectedSchema(connectionKey);
    const currentSchema = currentSchemaResult.success
      ? currentSchemaResult.schema
      : null;

    if (!currentSchema) {
      throw new Error('No schema selected');
    }

    const regex = /(?:from|join)\s+([\w\d]+(?:\.[\w\d]+)?)(\s+[as]?\s+\w+)?/gi;

    return sql.replace(regex, (match, table: string) => {
      if (table.includes('.')) {
        return match;
      }

      return match.replace(table, `${currentSchema}.${table}`);
    });
  }
}

export default new SQuerySQLServerV1();
