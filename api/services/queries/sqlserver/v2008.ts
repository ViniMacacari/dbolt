import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js';
import {
  addSqlServerTopClause,
  hasSqlServerTopClause,
  hasTopLevelClause,
  isReadOnlySelectQuery,
  normalizeRowLimit,
  removeTopLevelOrderBy,
  splitCtePrefix,
  trimStatementTerminator
} from '../../../utils/sql-query.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { total_rows: number };

class SQuerySQLServerV1 {
  private readonly db = new SQLServerV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    const isSelectQuery = isReadOnlySelectQuery(sql);
    const rowLimit = normalizeRowLimit(maxLines);

    if (!isSelectQuery) {
      await this.db.executeQuery(sql, [], connectionKey);
      return { success: true };
    }

    let totalRows: number | null = null;
    let executableSql = await this.adjustSchemaInQuery(sql, connectionKey);

    const countSql = this.addTotalRowCountQuery(executableSql);
    const resultWithCount = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
    totalRows = resultWithCount[0]?.total_rows ?? 0;

    if (rowLimit && !this.hasLimitClause(executableSql)) {
      executableSql = this.addPaginationToQuery(executableSql, rowLimit);
    }

    const result = await this.db.executeQuery(executableSql, [], connectionKey);

    if (result.length === 0) {
      const columnSql = this.getEmptyColumnsQuery(executableSql);
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
    return hasSqlServerTopClause(sql) ||
      hasTopLevelClause(sql, 'offset') ||
      hasTopLevelClause(sql, 'fetch');
  }

  addPaginationToQuery(sql: string, maxLines: number): string {
    return addSqlServerTopClause(trimStatementTerminator(sql), maxLines);
  }

  addTotalRowCountQuery(sql: string): string {
    const { prefix, mainSql } = splitCtePrefix(sql);
    const countableSql = removeTopLevelOrderBy(mainSql);

    return `${prefix} SELECT COUNT(*) AS total_rows FROM (${countableSql}) AS query_with_count`;
  }

  getEmptyColumnsQuery(sql: string): string {
    const { prefix, mainSql } = splitCtePrefix(sql);
    const countableSql = removeTopLevelOrderBy(mainSql);

    return `${prefix} SELECT TOP (0) * FROM (${countableSql}) AS empty_columns`;
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
    const cteNames = this.getCteNames(sql);

    return sql.replace(regex, (match, table: string) => {
      if (table.includes('.') || cteNames.has(table.toLowerCase())) {
        return match;
      }

      return match.replace(table, `${currentSchema}.${table}`);
    });
  }

  private getCteNames(sql: string): Set<string> {
    const { prefix } = splitCtePrefix(sql);
    const cteNames = new Set<string>();
    const regex = /(?:with|,)\s*([\w\d_]+)(?:\s*\([^)]*\))?\s+as\s*\(/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(prefix)) !== null) {
      cteNames.add(match[1].toLowerCase());
    }

    return cteNames;
  }
}

export default new SQuerySQLServerV1();
