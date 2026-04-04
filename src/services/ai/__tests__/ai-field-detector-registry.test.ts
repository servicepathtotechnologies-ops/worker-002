import { describe, expect, it } from '@jest/globals';
import { aiFieldDetector } from '../ai-field-detector';

describe('aiFieldDetector registry-first', () => {
  it('detects slack_message message and text from unified registry fillMode', () => {
    const node = {
      id: 's1',
      type: 'custom',
      data: { type: 'slack_message', label: 'Slack', config: {} },
    } as any;
    const fields = aiFieldDetector.detectAIFields(node).map((f) => f.fieldName);
    expect(fields).toContain('message');
    expect(fields).toContain('text');
  });

  it('does not mark webhookUrl for early AI when credential locked in registry', () => {
    const node = {
      id: 's1',
      type: 'custom',
      data: { type: 'slack_message', config: {} },
    } as any;
    const fields = aiFieldDetector.detectAIFields(node).map((f) => f.fieldName);
    expect(fields).not.toContain('webhookUrl');
  });

  it('detects google_gmail subject/body from registry', () => {
    const node = {
      id: 'g1',
      type: 'custom',
      data: { type: 'google_gmail', config: { operation: 'send' } },
    } as any;
    const fields = aiFieldDetector.detectAIFields(node).map((f) => f.fieldName);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f === 'subject' || f === 'body')).toBe(true);
  });
});
