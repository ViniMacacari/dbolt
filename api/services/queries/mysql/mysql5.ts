import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';
import {
  addLimitClause,
  hasTopLevelClause,
  isReadOnlySelectQuery,
  normalizeRowLimit,
  removeTopLevelOrderBy,
  trimStatementTerminator
} from '../../../utils/sql-query.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { TOTAL_ROWS: number | null };

class SQueryMySQLV1 {
  private readonly db = new MySQLV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    let totalRows: number | null = null;
    const isSelectQuery = isReadOnlySelectQuery(sql);
    const rowLimit = normalizeRowLimit(maxLines);

    if (isSelectQuery) {
      const countSql = this.getCountQuery(sql);
      const countResult = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
      totalRows = countResult[0]?.TOTAL_ROWS ?? null;
    }

    let executableSql = trimStatementTerminator(sql);

    if (rowLimit && !this.hasLimitClause(executableSql) && isSelectQuery) {
      executableSql = this.addLimitToQuery(executableSql, rowLimit);
    }

    const result = await this.db.executeQuery(executableSql, [], connectionKey);

    if (result.length === 0 && isSelectQuery) {
      const columnsResult = await this.db.executeQuery(
        `SELECT * FROM (${trimStatementTerminator(executableSql)}) AS empty_columns WHERE 1 = 0`,
        [],
        connectionKey
      );
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
    return hasTopLevelClause(sql, 'limit') || hasTopLevelClause(sql, 'offset');
  }

  addLimitToQuery(sql: string, maxLines: number): string {
    return addLimitClause(sql, maxLines);
  }

  getCountQuery(sql: string): string {
    if (!isReadOnlySelectQuery(sql)) {
      throw new Error('Not a SELECT query for count calculation');
    }

    const withoutOrderBy = removeTopLevelOrderBy(sql);
    return `SELECT COUNT(*) AS TOTAL_ROWS FROM (${withoutOrderBy}) AS count_query`;
  }
}

export default new SQueryMySQLV1();
