/**
 * Shared Google Sheets read (values) — used by execute-workflow google_sheets and Gmail inline fallback.
 * Keeps normalization aligned with the legacy google_sheets read path.
 */

export type GoogleSheetReadSuccess = {
  items: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  headers: string[];
  values: unknown[][];
  range?: string;
};

export type GoogleSheetReadFailure = { error: string };

const toHeaderStrings = (row: unknown[]): string[] =>
  row.map((c, idx) => {
    const raw = typeof c === 'string' ? c : String(c ?? '').trim();
    const base = raw.trim() || `col_${idx + 1}`;
    return base;
  });

const isProbablyHeaderRow = (row: unknown[]): boolean => {
  if (!Array.isArray(row) || row.length === 0) return false;
  if (!row.every((c) => typeof c === 'string' && c.trim().length > 0)) return false;
  const normalized = row.map((c) => (c as string).trim().toLowerCase());
  const uniq = new Set(normalized);
  return uniq.size / normalized.length >= 0.6;
};

/**
 * Normalize Sheets API `values` (array-of-arrays) into row objects (aligned with execute-workflow google_sheets read).
 */
export function normalizeSheetsValuesToRowObjects(values: unknown[][]): GoogleSheetReadSuccess {
  const safeValues = Array.isArray(values) ? values : [];

  let headers: string[] = [];
  let dataRows: unknown[][] = safeValues;
  if (safeValues.length > 0 && isProbablyHeaderRow(safeValues[0] as unknown[])) {
    headers = toHeaderStrings(safeValues[0] as unknown[]);
    dataRows = safeValues.slice(1);
  } else if (safeValues.length > 0) {
    const width = Math.max(...safeValues.map((r) => (Array.isArray(r) ? r.length : 0)), 0);
    headers = Array.from({ length: width }, (_, i) => `col_${i + 1}`);
    dataRows = safeValues;
  }

  const itemsObjects = dataRows.map((row, idx) => {
    const r = Array.isArray(row) ? row : [];
    const obj: Record<string, unknown> = {
      row_number:
        headers.length > 0 && safeValues.length > 0 && isProbablyHeaderRow(safeValues[0] as unknown[])
          ? idx + 2
          : idx + 1,
    };
    headers.forEach((h, i) => {
      obj[h] = i < r.length ? r[i] : null;
    });
    return obj;
  });

  return {
    items: itemsObjects,
    rows: itemsObjects,
    headers,
    values: safeValues,
  };
}

/**
 * Read a range from a spreadsheet using an OAuth access token (must include spreadsheets.readonly or drive scope as needed).
 */
export async function fetchGoogleSheetReadRange(params: {
  spreadsheetId: string;
  sheetName: string;
  range?: string;
  accessToken: string;
}): Promise<GoogleSheetReadSuccess | GoogleSheetReadFailure> {
  const { spreadsheetId, sheetName, range: rangeOpt, accessToken } = params;
  const resolvedSpreadsheetId = spreadsheetId.trim();
  if (!resolvedSpreadsheetId) {
    return { error: 'Spreadsheet ID is required' };
  }
  const resolvedSheetName = (sheetName || 'Sheet1').trim() || 'Sheet1';

  let rangeParam: string;
  if (rangeOpt && String(rangeOpt).trim()) {
    rangeParam = `${resolvedSheetName}!${String(rangeOpt).trim()}`;
  } else {
    rangeParam = resolvedSheetName;
  }

  const encodedRange = encodeURIComponent(rangeParam);
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/${encodedRange}`;

  try {
    const response = await fetch(`${apiUrl}?valueRenderOption=UNFORMATTED_VALUE`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Google Sheets API error: ${errorText}`;
      try {
        const errorJson = JSON.parse(errorText) as { error?: { message?: string } };
        if (errorJson.error?.message?.includes('Unable to parse range')) {
          errorMessage =
            `Google Sheets: Sheet "${resolvedSheetName}" not found or range invalid. ` +
            `Verify the sheet name (case-sensitive). Original: ${errorJson.error.message}`;
        }
      } catch {
        // keep errorMessage
      }
      return { error: errorMessage };
    }

    const result = (await response.json()) as { values?: unknown[][]; range?: string };
    const values = Array.isArray(result.values) ? result.values : [];
    const normalized = normalizeSheetsValuesToRowObjects(values);
    return { ...normalized, range: result.range };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Google Sheets read failed: ${msg}` };
  }
}
