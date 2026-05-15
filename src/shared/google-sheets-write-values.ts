export type GoogleSheetsTemplateResolver = (value: string) => unknown;

export interface NormalizeGoogleSheetsWriteValuesParams {
  values?: unknown;
  data?: unknown;
  fallbackInput?: unknown;
  resolveTemplate?: GoogleSheetsTemplateResolver;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonLike(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function resolveMaybeString(value: unknown, resolveTemplate?: GoogleSheetsTemplateResolver): unknown {
  if (typeof value !== 'string') return value;

  let resolved: unknown = value;
  if (resolveTemplate) {
    try {
      resolved = resolveTemplate(value);
    } catch {
      resolved = value;
    }
  }

  if (typeof resolved === 'string') {
    return parseJsonLike(resolved);
  }

  return resolved;
}

function hasUsableRows(rows: unknown[][]): boolean {
  return rows.some((row) =>
    row.some((cell) => cell !== undefined && cell !== null && String(cell).length > 0)
  );
}

function objectToRow(value: Record<string, unknown>): unknown[] {
  const ignoredKeys = new Set(['_error', '_trigger']);
  return Object.entries(value)
    .filter(([key]) => !ignoredKeys.has(key))
    .map(([, cell]) => cell);
}

function toRows(value: unknown, resolveTemplate?: GoogleSheetsTemplateResolver): unknown[][] {
  const resolved = resolveMaybeString(value, resolveTemplate);

  if (resolved === undefined || resolved === null) {
    return [];
  }

  if (Array.isArray(resolved)) {
    if (resolved.length === 0) return [];

    if (resolved.every((row) => Array.isArray(row))) {
      return resolved as unknown[][];
    }

    if (resolved.every(isRecord)) {
      return (resolved as Record<string, unknown>[]).map(objectToRow);
    }

    return [resolved];
  }

  if (isRecord(resolved)) {
    const nestedCandidates = [
      resolved.values,
      resolved.data,
      resolved.rows,
      resolved.items,
      isRecord(resolved.google_sheets) ? resolved.google_sheets.values : undefined,
      isRecord(resolved.google_sheets) ? resolved.google_sheets.rows : undefined,
    ];

    for (const candidate of nestedCandidates) {
      const rows = toRows(candidate, resolveTemplate);
      if (hasUsableRows(rows)) return rows;
    }

    return [objectToRow(resolved)];
  }

  return [[resolved]];
}

export function normalizeGoogleSheetsWriteValues({
  values,
  data,
  fallbackInput,
  resolveTemplate,
}: NormalizeGoogleSheetsWriteValuesParams): unknown[][] {
  const candidates = [data, values, fallbackInput];

  for (const candidate of candidates) {
    const rows = toRows(candidate, resolveTemplate);
    if (hasUsableRows(rows)) return rows;
  }

  return [];
}
