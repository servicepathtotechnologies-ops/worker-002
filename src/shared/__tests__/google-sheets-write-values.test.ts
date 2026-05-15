import { normalizeGoogleSheetsWriteValues } from '../google-sheets-write-values';

describe('normalizeGoogleSheetsWriteValues', () => {
  it('prefers visible data config over stale hidden values config', () => {
    expect(
      normalizeGoogleSheetsWriteValues({
        values: [['Charlie', 'charlie@example.com', 91]],
        data: [['Name', 'Email'], ['John', 'john@example.com']],
      })
    ).toEqual([
      ['Name', 'Email'],
      ['John', 'john@example.com'],
    ]);
  });

  it('parses JSON strings after template resolution', () => {
    expect(
      normalizeGoogleSheetsWriteValues({
        data: '{{rows}}',
        resolveTemplate: () => '[["A","B"],["C","D"]]',
      })
    ).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('converts object rows into sheet rows', () => {
    expect(
      normalizeGoogleSheetsWriteValues({
        data: [
          { name: 'Alice', email: 'alice@example.com', score: 95 },
          { name: 'Bob', email: 'bob@example.com', score: 87 },
        ],
      })
    ).toEqual([
      ['Alice', 'alice@example.com', 95],
      ['Bob', 'bob@example.com', 87],
    ]);
  });

  it('falls back to upstream values when config is empty', () => {
    expect(
      normalizeGoogleSheetsWriteValues({
        values: '[]',
        data: undefined,
        fallbackInput: { values: [['From input', 'ok']] },
      })
    ).toEqual([['From input', 'ok']]);
  });

  it('falls back to values when data is not present', () => {
    expect(
      normalizeGoogleSheetsWriteValues({
        values: [['From values', 'ok']],
      })
    ).toEqual([['From values', 'ok']]);
  });
});
