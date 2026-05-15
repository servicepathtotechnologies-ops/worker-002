export type GoogleSheetsStringResolver = (value: string) => unknown;

const EXPLICIT_TEMPLATE_RE = /\{\{|\$json\.|json\.|input\./;
const A1_RANGE_RE =
  /^(?:[A-Za-z]+\d+(?::[A-Za-z]+\d+)?|[A-Za-z]+(?::[A-Za-z]+)?|\d+(?::\d+)?)$/;

export function resolveGoogleSheetsConfigString(
  value: string,
  resolveTemplate: GoogleSheetsStringResolver
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (!EXPLICIT_TEMPLATE_RE.test(trimmed)) {
    return trimmed;
  }

  const resolved = resolveTemplate(trimmed);
  return String(resolved ?? '').trim();
}

export function quoteGoogleSheetName(sheetName: string): string {
  const trimmed = sheetName.trim();
  if (!trimmed) return '';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

export function isValidA1Range(range: string): boolean {
  const trimmed = range.trim();
  if (!trimmed) return true;
  const rangePart = trimmed.includes('!') ? trimmed.split('!').pop() || '' : trimmed;
  return A1_RANGE_RE.test(rangePart.trim());
}

export function buildGoogleSheetsRange(params: {
  sheetName?: string;
  range?: string;
  operation?: string;
}): string {
  const sheetName = (params.sheetName || '').trim();
  const range = (params.range || '').trim();
  const operation = (params.operation || '').trim().toLowerCase();

  if ((operation === 'write' || operation === 'update') && !range) {
    throw new Error('Range is required for write/update operations');
  }

  if (range && !isValidA1Range(range)) {
    throw new Error(
      `Invalid range "${range}". Use A1 notation like A1:D100, A:C, or 2:10. Put the tab name in Sheet Name, not in Range.`
    );
  }

  if (range.includes('!')) return range;
  if (sheetName && range) return `${quoteGoogleSheetName(sheetName)}!${range}`;
  if (sheetName) return quoteGoogleSheetName(sheetName);
  return range;
}
