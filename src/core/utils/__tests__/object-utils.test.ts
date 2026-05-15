import { getNestedValue } from '../object-utils';

describe('getNestedValue', () => {
  it('resolves root paths from single-object array outputs', () => {
    expect(getNestedValue([{ updatedRange: 'Test!A4', updatedRows: 1 }], 'updatedRange')).toBe('Test!A4');
    expect(getNestedValue([{ updatedRange: 'Test!A4', updatedRows: 1 }], '$json.updatedRows')).toBe(1);
  });

  it('keeps explicit array index access unchanged', () => {
    expect(getNestedValue([{ updatedRange: 'Test!A4' }], '0.updatedRange')).toBe('Test!A4');
  });
});
