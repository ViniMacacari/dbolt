import HanaV1 from '../../../models/hana/hana-v1.js';

import type {
  QueryExecutionResult,
  QueryRow
} from '../../../types.js';

type CountRow = QueryRow & { TOTAL_ROWS: number | null };

class SQuerysHana {
  private readonly db = new HanaV1();

  async query(sql: string, maxLines: number | null = null): Promise<QueryExecutionResult> {
    let totalRows: number | null = null;

    if (this.isSelectQuery(sql)) {
      const countSql = this.getCountQuery(sql);
      const countResult = (await this.db.executeQuery(countSql)) as CountRow[];
      totalRows = countResult[0]?.TOTAL_ROWS ?? null;
    }

    let executableSql = sql;

    if (maxLines && !this.hasLimitClause(executableSql) && this.isSelectQuery(executableSql)) {
      executableSql = this.addLimitToQuery(executableSql, maxLines);
    }

    const result = await this.db.executeQuery(executableSql);

    if (result.length === 0) {
      const withoutLimit = executableSql
        .replace(/limit\s+\d+(\s+offset\s+\d+)?/i, '')
        .trim();
      const columnsResult = await this.db.executeQuery(
        this.addLimitToQuery(withoutLimit, 0)
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
    const lowerSql = sql.toLowerCase();
    return lowerSql.includes(' limit ') || lowerSql.includes(' offset ');
  }

  isSelectQuery(sql: string): boolean {
    const cleanedSql = this.removeComments(sql).trim().toLowerCase();
    const nonSelectKeywords =
      /^(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|exec|set|use|describe|explain|show|call|backup|restore|analyze|optimize|begin|commit|rollback)\b/;

    return !nonSelectKeywords.test(cleanedSql) && cleanedSql.startsWith('select ');
  }

  addLimitToQuery(sql: string, maxLines: number): string {
    const trimmedSql = sql.trim();
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
    const cleanedSql = this.removeComments(sql).trim().toLowerCase();
    if (!cleanedSql.startsWith('select')) {
      throw new Error('Not a SELECT query for count calculation');
    }

    const withoutOrderBy = sql.replace(/order\s+by\s+[^)]+$/gi, '');
    return `SELECT COUNT(*) AS TOTAL_ROWS FROM (${withoutOrderBy}) AS count_query`;
  }

  removeComments(sql: string): string {
    return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  }
}

export default new SQuerysHana();
