import {
  isFieldUserProvidedText,
  shouldUseSelectForExplicitOptions,
} from '../schema-field-control';

describe('schema-field-control', () => {
  it('treats spreadsheetId as user-provided text even if options exist', () => {
    expect(isFieldUserProvidedText('spreadsheetId')).toBe(true);
    expect(
      shouldUseSelectForExplicitOptions('spreadsheetId', {
        options: [{ label: 'a', value: 'a' }],
      })
    ).toBe(false);
  });

  it('uses select for explicit options on non-ID fields like recipientSource (Gmail)', () => {
    expect(isFieldUserProvidedText('recipientSource')).toBe(false);
    expect(
      shouldUseSelectForExplicitOptions('recipientSource', {
        options: [
          { label: 'Manual', value: 'manual_entry' },
          { label: 'Sheet', value: 'extract_from_sheet' },
        ],
      })
    ).toBe(true);
  });

  it('matches determineInputType rule: explicit options imply select unless user-provided text', () => {
    const gmailRecipientSource = {
      type: 'string',
      options: [
        { label: 'Manually enter recipient email(s)', value: 'manual_entry' },
        { label: 'Extract from sheet', value: 'extract_from_sheet' },
      ],
    };
    expect(shouldUseSelectForExplicitOptions('recipientSource', gmailRecipientSource)).toBe(true);
  });

  it('does not treat message body fields as schema selects even if options exist', () => {
    expect(
      shouldUseSelectForExplicitOptions('body', {
        options: [{ label: 'a', value: 'a' }],
      })
    ).toBe(false);
  });
});
