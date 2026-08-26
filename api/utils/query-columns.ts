export function makeUniqueColumnNames(columnNames: readonly string[]): string[] {
  const reservedNames = new Set(columnNames);
  const usedNames = new Set<string>();
  const occurrences = new Map<string, number>();

  return columnNames.map((columnName) => {
    const occurrence = (occurrences.get(columnName) ?? 0) + 1;
    occurrences.set(columnName, occurrence);

    if (!usedNames.has(columnName)) {
      usedNames.add(columnName);
      return columnName;
    }

    let suffix = occurrence;
    let uniqueName = `${columnName} (${suffix})`;

    while (usedNames.has(uniqueName) || reservedNames.has(uniqueName)) {
      suffix += 1;
      uniqueName = `${columnName} (${suffix})`;
    }

    usedNames.add(uniqueName);
    return uniqueName;
  });
}

export function normalizeColumnNames(columnNames: readonly unknown[]): string[] {
  const names = columnNames.map((columnName, index) => {
    const name = String(columnName ?? '').trim();
    return name || `Column ${index + 1}`;
  });

  return makeUniqueColumnNames(names);
}

export function columnNamesFromRows(rows: readonly unknown[]): string[] {
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== 'object') return [];

  return normalizeColumnNames(Object.keys(firstRow as Record<string, unknown>));
}
