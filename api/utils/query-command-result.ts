import { getMainStatementKeyword } from './sql-query.js';

import type { QueryRows } from '../types.js';

export function buildCommandResult(sql: string): QueryRows {
  const statement = (getMainStatementKeyword(sql) || 'command').toUpperCase();

  return [{
    Status: 'Success',
    Message: 'Command executed successfully.',
    Statement: statement
  }];
}
