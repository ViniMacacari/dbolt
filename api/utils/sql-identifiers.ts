export function quoteIdentifier(identifier: string, quote = '"'): string {
  const escapedQuote = quote + quote;
  return `${quote}${identifier.replaceAll(quote, escapedQuote)}${quote}`;
}

export function normalizeIdentifier(identifier: string, label = 'Identifier'): string {
  const value = String(identifier || '').trim();

  if (!value) {
    throw new Error(`${label} is required`);
  }

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`${label} contains invalid control characters`);
  }

  return value;
}

export function quoteSafeIdentifier(identifier: string, quote = '"', label = 'Identifier'): string {
  return quoteIdentifier(normalizeIdentifier(identifier, label), quote);
}

export function quoteSqlServerIdentifier(identifier: string, label = 'Identifier'): string {
  return `[${normalizeIdentifier(identifier, label).replaceAll(']', ']]')}]`;
}

export function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
