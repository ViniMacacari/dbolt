type SqlToken = {
  value: string;
  index: number;
  end: number;
  depth: number;
};

const STATEMENT_KEYWORDS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'merge',
  'create',
  'alter',
  'drop',
  'truncate',
  'call',
  'exec',
  'execute',
  'set',
  'use'
]);

export function normalizeRowLimit(maxLines: number | null | undefined): number | null {
  if (maxLines === null || maxLines === undefined) return null;

  const parsed = Number(maxLines);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.floor(parsed);
}

export function isReadOnlySelectQuery(sql: string): boolean {
  return getMainStatementKeyword(sql) === 'select';
}

export function hasTopLevelClause(sql: string, clause: string): boolean {
  const target = clause.toLowerCase();
  return tokenizeSql(sql).some((token) => token.depth === 0 && token.value === target);
}

export function hasSqlServerTopClause(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  const selectIndex = findMainSelectTokenIndex(tokens);
  if (selectIndex === -1) return false;

  let index = selectIndex + 1;
  while (tokens[index] && ['all', 'distinct'].includes(tokens[index].value)) {
    index++;
  }

  return tokens[index]?.value === 'top';
}

export function trimStatementTerminator(sql: string): string {
  return sql.trim().replace(/;+\s*$/g, '').trim();
}

export function addLimitClause(sql: string, maxLines: number): string {
  return `${trimStatementTerminator(sql)} LIMIT ${Math.max(0, Math.floor(maxLines))}`;
}

export function removeTopLevelOrderBy(sql: string): string {
  const tokens = tokenizeSql(sql);

  for (let index = tokens.length - 2; index >= 0; index--) {
    if (
      tokens[index].depth === 0 &&
      tokens[index].value === 'order' &&
      tokens[index + 1]?.depth === 0 &&
      tokens[index + 1]?.value === 'by'
    ) {
      return trimStatementTerminator(sql.slice(0, tokens[index].index));
    }
  }

  return trimStatementTerminator(sql);
}

export function splitCtePrefix(sql: string): { prefix: string; mainSql: string } {
  const tokens = tokenizeSql(sql);
  const mainSelectIndex = findMainSelectTokenIndex(tokens);

  if (mainSelectIndex === -1) {
    return { prefix: '', mainSql: trimStatementTerminator(sql) };
  }

  const selectToken = tokens[mainSelectIndex];
  return {
    prefix: sql.slice(0, selectToken.index),
    mainSql: trimStatementTerminator(sql.slice(selectToken.index))
  };
}

export function addSqlServerTopClause(sql: string, maxLines: number): string {
  const tokens = tokenizeSql(sql);
  const selectIndex = findMainSelectTokenIndex(tokens);
  if (selectIndex === -1) return trimStatementTerminator(sql);

  let insertPosition = tokens[selectIndex].end;
  let nextTokenIndex = selectIndex + 1;

  while (tokens[nextTokenIndex] && ['all', 'distinct'].includes(tokens[nextTokenIndex].value)) {
    insertPosition = tokens[nextTokenIndex].end;
    nextTokenIndex++;
  }

  return `${sql.slice(0, insertPosition)} TOP (${Math.max(0, Math.floor(maxLines))})${sql.slice(insertPosition)}`;
}

export function getMainStatementKeyword(sql: string): string | null {
  const tokens = tokenizeSql(sql);
  if (tokens.length === 0) return null;

  const firstTopLevelToken = tokens.find((token) => token.depth === 0);
  if (!firstTopLevelToken) return null;

  if (firstTopLevelToken.value !== 'with') {
    return firstTopLevelToken.value;
  }

  return tokens.find((token) =>
    token.depth === 0 &&
    token.index > firstTopLevelToken.index &&
    STATEMENT_KEYWORDS.has(token.value)
  )?.value ?? null;
}

function findMainSelectTokenIndex(tokens: SqlToken[]): number {
  if (tokens.length === 0) return -1;

  const firstTopLevelToken = tokens.find((token) => token.depth === 0);
  if (!firstTopLevelToken) return -1;

  if (firstTopLevelToken.value === 'select') {
    return tokens.indexOf(firstTopLevelToken);
  }

  if (firstTopLevelToken.value !== 'with') {
    return -1;
  }

  return tokens.findIndex((token) =>
    token.depth === 0 &&
    token.index > firstTopLevelToken.index &&
    token.value === 'select'
  );
}

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let depth = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index++;
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index++;
      index += 2;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      index = skipQuoted(sql, index, char);
      continue;
    }

    if (char === '[') {
      index = skipBracketIdentifier(sql, index);
      continue;
    }

    if (char === '(') {
      depth++;
      index++;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      index++;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index++;

      while (index < sql.length && isIdentifierPart(sql[index])) {
        index++;
      }

      tokens.push({
        value: sql.slice(start, index).toLowerCase(),
        index: start,
        end: index,
        depth
      });
      continue;
    }

    index++;
  }

  return tokens;
}

function skipQuoted(sql: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index++;
  }

  return index;
}

function skipBracketIdentifier(sql: string, start: number): number {
  let index = start + 1;

  while (index < sql.length && sql[index] !== ']') {
    index++;
  }

  return index + 1;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$#@]/.test(char);
}
