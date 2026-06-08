import textNormalization, { removeDiacritics } from '../text-normalization';

describe('removeDiacritics', () => {
  it('removes diacritic marks from composed accented latin text', () => {
    const input = 'Cr\u00E8me Br\u00FBl\u00E9e, S\u00E3o Paulo, Ni\u00F1o, \u00DCber';

    expect(removeDiacritics(input)).toBe('Creme Brulee, Sao Paulo, Nino, Uber');
  });

  it('preserves plain ascii text unchanged', () => {
    const input = 'Send CRM report @ 09:00 via Gmail';

    expect(removeDiacritics(input)).toBe(input);
  });

  it('strips combining marks from decomposed unicode input', () => {
    const input = 'Cafe\u0301 re\u0301sume\u0301 coo\u0308perate';

    expect(removeDiacritics(input)).toBe('Cafe resume cooperate');
  });

  it('returns an empty string for empty or non-string runtime values', () => {
    expect(removeDiacritics('')).toBe('');
    expect(removeDiacritics(null as unknown as string)).toBe('');
    expect(removeDiacritics(undefined as unknown as string)).toBe('');
    expect(removeDiacritics(42 as unknown as string)).toBe('');
  });

  it('exposes the same behavior through the default export', () => {
    const input = 'R\u00E9sum\u00E9';

    expect(textNormalization.removeDiacritics(input)).toBe(removeDiacritics(input));
    expect(textNormalization.removeDiacritics(input)).toBe('Resume');
  });
});
