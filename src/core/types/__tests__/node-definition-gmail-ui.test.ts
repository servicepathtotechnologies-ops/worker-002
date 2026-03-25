import { describe, expect, it } from '@jest/globals';
import { nodeDefinitionRegistry } from '../node-definition';

describe('nodeDefinitionRegistry google_gmail ui metadata (API / Properties panel)', () => {
  it('exposes recipientSource.ui.options and recipientEmails.ui for schema-driven UI', () => {
    const def = nodeDefinitionRegistry.get('google_gmail');
    expect(def).toBeDefined();

    const recipientSource = def!.inputSchema.recipientSource;
    expect(recipientSource?.ui?.options?.length).toBeGreaterThanOrEqual(2);
    expect(recipientSource?.ui?.options?.some((o) => o.value === 'manual_entry')).toBe(true);
    expect(recipientSource?.ui?.options?.some((o) => o.value === 'extract_from_sheet')).toBe(true);
    expect(recipientSource?.ui?.contextHints?.length).toBeGreaterThanOrEqual(2);
    expect(recipientSource?.ui?.contextHints?.some((h) => h.whenValue === 'extract_from_sheet')).toBe(true);

    const recipientEmails = def!.inputSchema.recipientEmails;
    expect(recipientEmails?.ui?.requiredIf).toEqual({
      field: 'recipientSource',
      equals: 'manual_entry',
    });
    expect(recipientEmails?.ui?.widget).toBe('multi_email');
    expect(recipientSource?.description || '').toMatch(/spreadsheet|Google Sheets|upstream/i);
    expect(recipientEmails?.description || '').toMatch(/manual|Recipient source|hidden/i);

    const spreadsheetId = def!.inputSchema.spreadsheetId;
    expect(spreadsheetId?.ui?.visibleIf).toEqual({
      field: 'recipientSource',
      equals: 'extract_from_sheet',
    });
    const useAi = def!.inputSchema.useAiRecipientMapping;
    expect(useAi?.type).toBe('boolean');
    expect(useAi?.ui?.visibleIf).toEqual({
      field: 'recipientSource',
      equals: 'extract_from_sheet',
    });
  });
});
