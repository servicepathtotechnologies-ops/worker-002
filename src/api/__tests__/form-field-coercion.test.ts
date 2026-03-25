import { coerceFormFields } from '../form-field-coercion';

describe('coerceFormFields', () => {
  it('coerces number fields from strings to numbers', () => {
    const fields = [{ name: 'age', type: 'number' }];
    const out = coerceFormFields({ age: '17', name: 'Ada' }, fields);
    expect(out.age).toBe(17);
    expect(out.name).toBe('Ada');
  });

  it('coerces checkbox to boolean (on / missing)', () => {
    const fields = [
      { name: 'agree', type: 'checkbox' },
      { name: 'optout', type: 'checkbox' },
    ];
    const out = coerceFormFields({ agree: 'on' }, fields);
    expect(out.agree).toBe(true);
    expect(out.optout).toBe(false);
  });

  it('parses date fields to ISO strings', () => {
    const fields = [{ name: 'dob', type: 'date' }];
    const out = coerceFormFields({ dob: '2020-01-15' }, fields);
    expect(typeof out.dob).toBe('string');
    expect(out.dob).toMatch(/2020-01-15/);
  });

  it('leaves text fields unchanged', () => {
    const fields = [{ name: 'title', type: 'text' }];
    const out = coerceFormFields({ title: '  hello  ' }, fields);
    expect(out.title).toBe('  hello  ');
  });
});
