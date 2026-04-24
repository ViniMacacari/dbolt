import HanaV1 from '../../../models/hana/hana-v1.js';
import {
  addLimitClause,
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

type CountRow = QueryRow & { TOTAL_ROWS: number | null };

class SQuerysHana {
  private readonly db = new HanaV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    let totalRows: number | null = null;
    const isSelectQuery = isReadOnlySelectQuery(sql);
    const rowLimit = normalizeRowLimit(maxLines);

    if (isSelectQuery) {
      try {
        const countSql = this.getCountQuery(sql);
        const countResult = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
        totalRows = countResult[0]?.TOTAL_ROWS ?? null;
      } catch (error: unknown) {
        console.warn('Unable to count HANA query rows. Running main query without total row count.', error);
      }
    }

    let executableSql = trimStatementTerminator(sql);

    if (rowLimit && !this.hasLimitClause(executableSql) && isSelectQuery) {
      executableSql = this.addLimitToQuery(executableSql, rowLimit);
    }

    const result = await this.db.executeQuery(executableSql, [], connectionKey);

    if (result.length === 0 && isSelectQuery) {
      const columnsResult = await this.db.executeQuery(
        this.getEmptyColumnsQuery(executableSql),
        [],
        connectionKey
      );
      const columns = Object.keys(columnsResult[0] ?? {}).map((column) =>
        column.trim()
      );

      return {
        success: true,
        database: 'Hana',
        result: [],
        columns,
        totalRows
      };
    }

    return {
      success: true,
      database: 'Hana',
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
    const { prefix, mainSql } = splitCtePrefix(withoutOrderBy);

    return `${prefix} SELECT COUNT(*) AS TOTAL_ROWS FROM (\n${mainSql}\n) AS count_query`;
  }

  getEmptyColumnsQuery(sql: string): string {
    const { prefix, mainSql } = splitCtePrefix(sql);

    return `${prefix} SELECT * FROM (\n${trimStatementTerminator(mainSql)}\n) AS empty_columns WHERE 1 = 0`;
  }
}

export default new SQuerysHana();
