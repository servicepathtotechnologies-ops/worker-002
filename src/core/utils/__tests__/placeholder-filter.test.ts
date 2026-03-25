import { describe, expect, it } from '@jest/globals';
import { filterPlaceholderValues, isPlaceholderValue } from '../placeholder-filter';

describe('placeholder-filter', () => {
  describe('isPlaceholderValue', () => {
    it('treats empty and whitespace as placeholder', () => {
      expect(isPlaceholderValue('')).toBe(true);
      expect(isPlaceholderValue('   ')).toBe(true);
      expect(isPlaceholderValue(undefined)).toBe(true);
      expect(isPlaceholderValue(null)).toBe(true);
    });

    it('detects classic instructional placeholders at line start', () => {
      expect(isPlaceholderValue('Enter your email')).toBe(true);
      expect(isPlaceholderValue('Paste your API key here')).toBe(true);
      expect(isPlaceholderValue('Fill this in')).toBe(true);
      expect(isPlaceholderValue('YOUR_SPREADSHEET_ID')).toBe(true);
      expect(isPlaceholderValue('enter_your_token')).toBe(true);
    });

    it('does NOT false-positive on normal prose containing "your" or "enter"', () => {
      expect(isPlaceholderValue('Your weekly summary')).toBe(false);
      expect(isPlaceholderValue('Summary of your data')).toBe(false);
      expect(isPlaceholderValue('Re-enter data when needed')).toBe(false);
      expect(isPlaceholderValue('The carpenter fixed the door')).toBe(false);
      expect(
        isPlaceholderValue(
          'The workflow data contains 10 entries, each specifying a business segment and a country.'
        )
      ).toBe(false);
    });

    it('does NOT false-positive on todo inside a sentence', () => {
      expect(isPlaceholderValue('We have a todo item for later')).toBe(false);
      expect(isPlaceholderValue('todo')).toBe(true);
    });

    it('non-strings are never placeholders', () => {
      expect(isPlaceholderValue(0)).toBe(false);
      expect(isPlaceholderValue({ a: 1 })).toBe(false);
      expect(isPlaceholderValue(['x'])).toBe(false);
    });
  });

  describe('filterPlaceholderValues', () => {
    it('keeps legitimate subject lines', () => {
      const out = filterPlaceholderValues({
        subject: 'Your Q4 report is ready',
        body: 'Hello',
      });
      expect(out.subject).toBe('Your Q4 report is ready');
      expect(out.body).toBe('Hello');
    });

    it('strips instructional subject but keeps _fillMode', () => {
      const out = filterPlaceholderValues({
        _fillMode: { subject: 'runtime_ai' },
        subject: 'Enter your subject',
        spreadsheetId: 'abc',
      });
      expect(out._fillMode).toEqual({ subject: 'runtime_ai' });
      expect(out.subject).toBeUndefined();
      expect(out.spreadsheetId).toBe('abc');
    });
  });
});
