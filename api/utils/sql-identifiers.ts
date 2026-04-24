export function quoteIdentifier(identifier: string, quote = '"'): string {
  const escapedQuote = quote + quote;
  return `${quote}${identifier.replaceAll(quote, escapedQuote)}${quote}`;
}

export function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
