import {
  buildGoogleSheetsRange,
  quoteGoogleSheetName,
  resolveGoogleSheetsConfigString,
} from '../google-sheets-range';

describe('google sheets range helpers', () => {
  it('does not resolve plain static A1 ranges as runtime fields', () => {
    expect(resolveGoogleSheetsConfigString('A1:D100', () => 'WRONG')).toBe('A1:D100');
    expect(resolveGoogleSheetsConfigString('Test', () => 'WRONG')).toBe('Test');
  });

  it('resolves explicit template strings only', () => {
    expect(resolveGoogleSheetsConfigString('{{$json.range}}', () => 'A2:C5')).toBe('A2:C5');
  });

  it('builds valid tab-qualified ranges', () => {
    expect(buildGoogleSheetsRange({ sheetName: 'Test', range: 'A1:D100', operation: 'append' })).toBe('Test!A1:D100');
    expect(buildGoogleSheetsRange({ sheetName: 'Sales Data', range: 'A:C', operation: 'read' })).toBe("'Sales Data'!A:C");
  });

  it('rejects workflow titles and prose in the range field', () => {
    expect(() =>
      buildGoogleSheetsRange({
        sheetName: 'Test',
        range: 'Test Google Sheets - Read + Append',
        operation: 'append',
      })
    ).toThrow(/Invalid range/);
  });

  it('requires a target range for overwrite/update operations', () => {
    expect(() => buildGoogleSheetsRange({ sheetName: 'Test', operation: 'write' })).toThrow(/Range is required/);
  });

  it('quotes sheet names safely', () => {
    expect(quoteGoogleSheetName("May's Sales")).toBe("'May''s Sales'");
  });
});
