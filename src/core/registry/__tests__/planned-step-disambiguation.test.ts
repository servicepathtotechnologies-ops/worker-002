import { unifiedNodeRegistry } from '../unified-node-registry';

describe('resolvePlannedStepCanonicalType (registry-driven communication disambiguation)', () => {
  it('keeps ollama when config is LLM-shaped only', () => {
    expect(unifiedNodeRegistry.resolvePlannedStepCanonicalType('ollama', 'output', { prompt: 'Say hello' })).toBe(
      'ollama'
    );
  });

  it('rewrites ollama to google_gmail when config matches Gmail inputSchema', () => {
    const resolved = unifiedNodeRegistry.resolvePlannedStepCanonicalType('ollama', 'output', {
      subject: 'Hello',
      body: 'Body text',
      recipientEmails: 'a@example.com',
    });
    expect(resolved).toBe('google_gmail');
  });

  it('rewrites using config overlap without output role when enough communication keys match', () => {
    const resolved = unifiedNodeRegistry.resolvePlannedStepCanonicalType(
      'ollama',
      undefined,
      {
        recipientSource: 'manual_entry',
        recipientEmails: 'x@y.com',
        subject: 'S',
        body: 'B',
      }
    );
    expect(resolved).toBe('google_gmail');
  });

  it('routes output ollama to google_gmail when workflow text matches email-channel registry keywords (no Ollama for email)', () => {
    const resolved = unifiedNodeRegistry.resolvePlannedStepCanonicalType(
      'ollama',
      'output',
      {},
      { workflowIntentText: 'Workflow sends notifications via Gmail to the team' }
    );
    expect(resolved).toBe('google_gmail');
  });
});
