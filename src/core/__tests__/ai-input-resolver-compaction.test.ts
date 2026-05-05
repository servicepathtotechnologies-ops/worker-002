import { compactForAiPrompt } from '../ai-input-resolver';

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
});
