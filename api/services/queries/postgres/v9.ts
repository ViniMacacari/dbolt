import PgV1 from '../../../models/postgres/v9.js';
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

type CountRow = QueryRow & { total_rows: number };

class SQueryPgV1 {
  private readonly db = new PgV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    const isSelectQuery = isReadOnlySelectQuery(sql);
    const rowLimit = normalizeRowLimit(maxLines);

    if (!isSelectQuery) {
      await this.db.executeQuery(sql, [], connectionKey);
      return { success: true };
    }

    let totalRows: number | null = null;
    const countSql = this.getCountQuery(sql);
    const countResult = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
    totalRows = countResult[0]?.total_rows ?? 0;

    let executableSql = trimStatementTerminator(sql);

    if (rowLimit && !this.hasLimitClause(executableSql)) {
      executableSql = this.addLimitToQuery(executableSql, rowLimit);
    }

    const result = await this.db.executeQuery(executableSql, [], connectionKey);

    if (result.length === 0) {
      try {
        const columnSql = `SELECT * FROM (${executableSql}) AS temp_table WHERE FALSE`;
        const columnsResult = await this.db.executeQuery(columnSql, [], connectionKey);
        const columns = Object.keys(columnsResult[0] ?? {});

        return {
          success: true,
          database: 'PostgreSQL',
          result: [],
          columns,
          totalRows
        };
      } catch (error: unknown) {
        throw new Error(`Error fetching columns: ${getErrorMessage(error)}`);
      }
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
    return `SELECT COUNT(*) AS total_rows FROM (${withoutOrderBy}) AS count_query_alias`;
  }
}

export default new SQueryPgV1();
