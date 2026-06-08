import { isEmptyValue } from '../is-empty-value';

describe('isEmptyValue', () => {
  it('treats nullish and blank strings as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
  });

  it('preserves meaningful primitive values', () => {
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue('Send weekly report')).toBe(false);
  });

  it('treats unresolved placeholder templates as empty', () => {
    expect(isEmptyValue('{{$json.timestamp}}')).toBe(true);
    expect(isEmptyValue('{{$json.record}}')).toBe(true);
    expect(isEmptyValue('{{$json.output}}')).toBe(true);
    expect(isEmptyValue('{{ENV.API_KEY}}')).toBe(true);
    expect(isEmptyValue('{{$json}}')).toBe(true);
  });

  it('keeps concrete json path templates as meaningful', () => {
    expect(isEmptyValue('{{$json.customer.email}}')).toBe(false);
    expect(isEmptyValue('Please email {{$json.customer.email}}')).toBe(false);
  });

  it('treats arrays as empty only when every item is empty', () => {
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(['', null, ['   ', '{{ENV.TOKEN}}']])).toBe(true);
    expect(isEmptyValue(['', 0])).toBe(false);
  });

  it('treats objects as empty only when every value is empty', () => {
    expect(isEmptyValue({})).toBe(true);
    expect(
      isEmptyValue({
        email: ' ',
        nested: {
          token: '{{ENV.API_TOKEN}}',
          rows: [],
        },
      })
    ).toBe(true);
    expect(isEmptyValue({ email: 'admin@example.com', nested: { note: '' } })).toBe(false);
  });
});
