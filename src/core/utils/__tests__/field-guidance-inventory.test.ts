import { buildFieldGuidanceInventoryPayload } from '../field-guidance-inventory';

describe('buildFieldGuidanceInventoryPayload', () => {
  it('returns unified rows joined with credential question flags', () => {
    const p = buildFieldGuidanceInventoryPayload();
    expect(p.nodeCount).toBeGreaterThan(0);
    expect(p.fieldRowCount).toBeGreaterThan(0);
    expect(p.unifiedFields.length).toBe(p.fieldRowCount);
    const sheet = p.unifiedFields.find((r) => r.nodeType === 'google_sheets' && r.fieldName === 'spreadsheetId');
    expect(sheet).toBeDefined();
    expect(sheet!.helpCategory).toBe('spreadsheet_id');
    expect(typeof sheet!.willAskCredentialQuestion).toBe('boolean');
  });

  it('includes credential questions array aligned to node types', () => {
    const p = buildFieldGuidanceInventoryPayload();
    const slackQs = p.credentialQuestions.filter((q) => q.nodeType === 'slack_message');
    expect(Array.isArray(slackQs)).toBe(true);
  });
});
