import { AIInputResolver, compactForAiPrompt } from '../ai-input-resolver';

describe('AI input resolver prompt compaction', () => {
  it('summarizes large sheet-like arrays instead of serializing every row', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      customer: `Customer ${index}`,
      email: `customer${index}@example.com`,
      amount: index * 10,
      notes: 'x'.repeat(100),
    }));

    const compacted = compactForAiPrompt({ rows }, 1200);

    expect(compacted).toContain('"count": 100');
    expect(compacted).toContain('"fieldNames"');
    expect(compacted).toContain('"truncated": true');
    expect(compacted).not.toContain('Customer 99');
    expect(compacted.length).toBeLessThanOrEqual(1215);
  });

  it('extracts JSON from markdown-fenced AI responses', () => {
    const resolver = new AIInputResolver() as any;
    expect(resolver.extractJsonPayload('```json\n{"values":[["A"]]}\n```')).toBe(
      '{"values":[["A"]]}'
    );
  });

  it('requires requested runtime fields in JSON mode', () => {
    const resolver = new AIInputResolver() as any;
    expect(() =>
      resolver.assertRequestedFieldsPresent({ recipientEmails: 'v' }, ['recipientEmails'], 'json')
    ).toThrow(/missing or empty/);
  });
});
