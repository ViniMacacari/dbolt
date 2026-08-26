import PgV1 from '../../../models/postgres/v9.js';
import {
  addLimitClause,
  hasTopLevelClause,
  isReadOnlySelectQuery,
  normalizeRowLimit,
  removeTopLevelOrderBy,
  splitCtePrefix,
  trimStatementTerminator
} from '../../../utils/sql-query.js';
import { buildCommandResult } from '../../../utils/query-command-result.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { total_rows: number };

class SQueryPgV1 {
  private readonly db = new PgV1();

  async query(
    sql: string,
    maxLines: number | null = null,
    connectionKey?: string,
    includeTotalRows: boolean = true
  ): Promise<QueryExecutionResult> {
    const isSelectQuery = isReadOnlySelectQuery(sql);
    const rowLimit = normalizeRowLimit(maxLines);

    if (!isSelectQuery) {
      const result = await this.db.executeQuery(trimStatementTerminator(sql), [], connectionKey);
      return {
        success: true,
        database: 'PostgreSQL',
        result: result.length > 0 ? result : buildCommandResult(sql),
        totalRows: null
      };
    }

    let totalRows: number | null = null;
    if (includeTotalRows) {
      try {
        const countSql = this.getCountQuery(sql);
        const countResult = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
        totalRows = countResult[0]?.total_rows ?? 0;
      } catch (error: unknown) {
        console.warn('Unable to count PostgreSQL query rows. Running main query without total row count.', error);
      }
    }

    let executableSql = trimStatementTerminator(sql);

    if (rowLimit) {
      executableSql = this.limitQueryResult(executableSql, rowLimit);
    }

    const { rows: result, columns } = await this.db.executeQueryWithColumns(executableSql, [], connectionKey);

    return {
      success: true,
      database: 'PostgreSQL',
      result,
      columns,
      totalRows
    };
  }

  hasLimitClause(sql: string): boolean {
    return hasTopLevelClause(sql, 'limit') || hasTopLevelClause(sql, 'offset');
  }

  addLimitToQuery(sql: string, maxLines: number): string {
    return addLimitClause(sql, maxLines);
  }

  limitQueryResult(sql: string, maxLines: number): string {
    const trimmedSql = trimStatementTerminator(sql);

    if (!this.hasLimitClause(trimmedSql)) {
      return this.addLimitToQuery(trimmedSql, maxLines);
    }

    const { prefix, mainSql } = splitCtePrefix(trimmedSql);
    return `${prefix} SELECT * FROM (\n${trimStatementTerminator(mainSql)}\n) AS limited_query_result\nLIMIT ${Math.max(0, Math.floor(maxLines))}`;
  }

  getCountQuery(sql: string): string {
    if (!isReadOnlySelectQuery(sql)) {
      throw new Error('Not a SELECT query for count calculation');
    }

    const withoutOrderBy = removeTopLevelOrderBy(sql);
    const { prefix, mainSql } = splitCtePrefix(withoutOrderBy);

    return `${prefix} SELECT COUNT(*) AS total_rows FROM (\n${mainSql}\n) AS count_query_alias`;
  }

}

export default new SQueryPgV1();
