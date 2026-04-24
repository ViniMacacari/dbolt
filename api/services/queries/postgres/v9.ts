import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { total_rows: number };

class SQueryPgV1 {
  private readonly db = new PgV1();

  async query(sql: string, maxLines: number | null = null, connectionKey?: string): Promise<QueryExecutionResult> {
    if (!this.isSelectQuery(sql)) {
      await this.db.executeQuery(sql, [], connectionKey);
      return { success: true };
    }

    let totalRows: number | null = null;
    const countSql = this.getCountQuery(sql);
    const countResult = (await this.db.executeQuery(countSql, [], connectionKey)) as CountRow[];
    totalRows = countResult[0]?.total_rows ?? 0;

    let executableSql = sql;

    if (maxLines && !this.hasLimitClause(executableSql)) {
      executableSql = this.addLimitToQuery(executableSql, maxLines);
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
    const lowerSql = sql.toLowerCase();
    return lowerSql.includes(' limit ') || lowerSql.includes(' offset ');
  }

  isSelectQuery(sql: string): boolean {
    const trimmedSql = sql.trim().toLowerCase();
    const sqlWithoutComments = trimmedSql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('--'))
      .join(' ');
    const nonSelectKeywords =
      /^(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|exec|set|use|describe|explain|show|call|backup|restore|analyze|optimize|begin|commit|rollback)\b/;

    return (
      !nonSelectKeywords.test(sqlWithoutComments) &&
      sqlWithoutComments.startsWith('select ')
    );
  }

  addLimitToQuery(sql: string, maxLines: number): string {
    const trimmedSql = sql.trim();
    if (this.hasLimitClause(trimmedSql)) {
      return trimmedSql;
    }

    if (trimmedSql.toLowerCase().startsWith('with ')) {
      const lastSelectIndex = trimmedSql.lastIndexOf('select ');
      if (lastSelectIndex !== -1) {
        const beforeSelect = trimmedSql.slice(0, lastSelectIndex);
        const afterSelect = trimmedSql.slice(lastSelectIndex);
        return `${beforeSelect}${afterSelect.trim()} LIMIT ${maxLines}`;
      }
    }

    return `${trimmedSql} LIMIT ${maxLines}`;
  }

  getCountQuery(sql: string): string {
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith('select')) {
      throw new Error('Not a SELECT query for count calculation');
    }

    const withoutOrderBy = sql.replace(/order\s+by\s+[^)]+$/gi, '');
    return `SELECT COUNT(*) AS total_rows FROM (${withoutOrderBy}) AS count_query_alias`;
  }
}

export default new SQueryPgV1();
