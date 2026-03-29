import { getInputControlMetadata } from '../schema-input-control';

describe('schema-input-control', () => {
  it('returns select for explicit non-user-provided options', () => {
    const meta = getInputControlMetadata('recipientSource', {
      type: 'string',
      description: 'Recipient source',
      required: true,
      ui: {
        options: [
          { label: 'Manual', value: 'manual_entry' },
          { label: 'Sheet', value: 'extract_from_sheet' },
        ],
      },
    });

    expect(meta.inputType).toBe('select');
    expect(meta.options?.length).toBe(2);
  });

  it('keeps spreadsheetId as text even when options are present', () => {
    const meta = getInputControlMetadata('spreadsheetId', {
      type: 'string',
      description: 'Spreadsheet ID',
      required: true,
      ui: {
        options: [{ label: 'A', value: 'a' }],
      },
    });

    expect(meta.inputType).toBe('text');
  });

  it('returns textarea for json widget', () => {
    const meta = getInputControlMetadata('filters', {
      type: 'object',
      description: 'JSON filters',
      required: false,
      ui: {
        widget: 'json',
      },
    });

    expect(meta.inputType).toBe('textarea');
    expect(meta.uiWidget).toBe('json');
  });
});
