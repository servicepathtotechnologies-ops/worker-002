import { describe, expect, it } from '@jest/globals';
import { applyInputAliasesFromSchema } from '../apply-input-aliases';

describe('applyInputAliasesFromSchema', () => {
  it('copies canonical field into empty alias field', () => {
    const resolved: Record<string, unknown> = { message: 'Hello from AI' };
    const schema = {
      message: {},
      text: { aliasOf: 'message' },
    };
    const filled = applyInputAliasesFromSchema(resolved, schema);
    expect(resolved.text).toBe('Hello from AI');
    expect(filled).toContain('text');
  });

  it('does not overwrite alias when already meaningful', () => {
    const resolved: Record<string, unknown> = { message: 'A', text: 'B' };
    const schema = {
      message: {},
      text: { aliasOf: 'message' },
    };
    applyInputAliasesFromSchema(resolved, schema);
    expect(resolved.text).toBe('B');
  });

  it('skips when canonical is empty', () => {
    const resolved: Record<string, unknown> = { message: '' };
    const schema = { text: { aliasOf: 'message' } };
    applyInputAliasesFromSchema(resolved, schema);
    expect(resolved.text).toBeUndefined();
  });

  it('copies alias into empty canonical field (reverse)', () => {
    const resolved: Record<string, unknown> = {
      text: 'Plain text landed on alias first',
    };
    const schema = {
      message: {},
      text: { aliasOf: 'message' },
    };
    const filled = applyInputAliasesFromSchema(resolved, schema);
    expect(resolved.message).toBe('Plain text landed on alias first');
    expect(filled).toContain('message');
  });
});
