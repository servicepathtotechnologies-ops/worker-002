import {
  intentAwarePropertySelect,
} from '../intent-aware-property-selector';

const records = [
  { name: 'Alice', email: 'alice@example.com', rollNumber: 'A001' },
  { name: 'Bob', email: 'bob@example.com', rollNumber: 'B002' },
];

describe('intentAwarePropertySelect — full-dataset mode', () => {
  it('returns full mode when prompt is empty', () => {
    const r = intentAwarePropertySelect('', { items: records });
    expect(r.mode).toBe('full');
    expect(r.matchedProperties).toHaveLength(0);
  });

  it('returns full mode when upstream JSON is null', () => {
    const r = intentAwarePropertySelect('summarize the name', null);
    expect(r.mode).toBe('full');
  });

  it('returns full mode when upstream JSON is a primitive', () => {
    const r = intentAwarePropertySelect('summarize the name', 42 as unknown as object);
    expect(r.mode).toBe('full');
  });

  it('returns full mode when no property matches intent terms', () => {
    const r = intentAwarePropertySelect('summarize the salary from records', { items: records });
    expect(r.mode).toBe('full');
    expect(r.matchedProperties).toHaveLength(0);
    expect(r.extractedProperties).toEqual(expect.arrayContaining(['name', 'email', 'rollNumber']));
  });

  it('excludes stop words from intent terms — "rows" causes full mode', () => {
    const r = intentAwarePropertySelect('summarize the rows', { items: records });
    expect(r.mode).toBe('full');
  });

  it('excludes stop words — "data" causes full mode', () => {
    const r = intentAwarePropertySelect('extract the data', { items: records });
    expect(r.mode).toBe('full');
  });

  it('returns full mode for primitive-element array (no extractable keys)', () => {
    const r = intentAwarePropertySelect('summarize the name', { items: ['a', 'b', 'c'] });
    expect(r.mode).toBe('full');
  });
});

describe('intentAwarePropertySelect — filtered mode', () => {
  it('returns filtered mode when property exactly matches intent term', () => {
    const r = intentAwarePropertySelect('summarize the name from the sheet', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('name');
  });

  it('normalizes camelCase property — "roll number" matches "rollNumber"', () => {
    const r = intentAwarePropertySelect('summarize roll number from data', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('rollNumber');
  });

  it('filteredData is an array of values for a single-property match', () => {
    const r = intentAwarePropertySelect('extract the email from records', { items: records });
    expect(r.mode).toBe('filtered');
    expect(Array.isArray(r.filteredData)).toBe(true);
    expect(r.filteredData).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('filteredData contains objects with only matched keys for multi-property match', () => {
    const r = intentAwarePropertySelect('list the name and email from the data', { items: records });
    expect(r.mode).toBe('filtered');
    const rows = r.filteredData as Record<string, unknown>[];
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(Object.keys(row)).toContain('name');
      expect(Object.keys(row)).toContain('email');
      expect(Object.keys(row)).not.toContain('rollNumber');
    }
  });
});

describe('intentAwarePropertySelect — intent-extraction patterns', () => {
  it('"summarize X from" pattern extracts term', () => {
    const r = intentAwarePropertySelect('summarize the email from the spreadsheet', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('email');
  });

  it('"extract X from" pattern extracts term', () => {
    const r = intentAwarePropertySelect('extract the name from the list', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('name');
  });

  it('"list X from" pattern extracts term', () => {
    const r = intentAwarePropertySelect('list the email from the table', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('email');
  });

  it('"show X from" pattern extracts term', () => {
    const r = intentAwarePropertySelect('show the name from results', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('name');
  });

  it('"only X" pattern extracts term', () => {
    const r = intentAwarePropertySelect('only email', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('email');
  });

  it('"just X" pattern extracts term', () => {
    const r = intentAwarePropertySelect('just name', { items: records });
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('name');
  });
});

describe('intentAwarePropertySelect — dataset root selection', () => {
  it('prefers "items" array over root object', () => {
    const src = { items: records, other: 'ignored' };
    const r = intentAwarePropertySelect('extract the name', src);
    expect(r.extractedProperties).toContain('name');
    expect(r.extractedProperties).toContain('email');
  });

  it('falls back to "rows" array', () => {
    const src = { rows: records };
    const r = intentAwarePropertySelect('extract the name', src);
    expect(r.extractedProperties).toContain('name');
    expect(r.extractedProperties).toContain('email');
  });

  it('falls back to "values" array', () => {
    const src = { values: records };
    const r = intentAwarePropertySelect('extract the name', src);
    expect(r.extractedProperties).toContain('name');
    expect(r.extractedProperties).toContain('email');
  });

  it('works on a plain object root with no items/rows/values', () => {
    const src = { name: 'Alice', email: 'alice@example.com' };
    const r = intentAwarePropertySelect('show the name', src);
    expect(r.extractedProperties).toContain('name');
    expect(r.extractedProperties).toContain('email');
  });

  it('filters plain object root to matched property', () => {
    const src = { name: 'Alice', email: 'alice@example.com' };
    const r = intentAwarePropertySelect('show the name', src);
    expect(r.mode).toBe('filtered');
    expect(r.filteredData).toEqual({ name: 'Alice' });
  });
});

describe('intentAwarePropertySelect — options', () => {
  it('respects custom minMatchScore of 1.0 (exact-only)', () => {
    const r = intentAwarePropertySelect(
      'summarize the name from records',
      { items: records },
      { minMatchScore: 1.0 },
    );
    expect(r.mode).toBe('filtered');
    expect(r.matchedProperties).toContain('name');
  });

  it('respects maxRecordsToScan option', () => {
    const large = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `User${i}` }));
    const r = intentAwarePropertySelect(
      'summarize the name from data',
      { items: large },
      { maxRecordsToScan: 3 },
    );
    expect(r.extractedProperties).toContain('name');
  });
});
