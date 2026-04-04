import { describe, expect, it } from '@jest/globals';
import { pickPrimaryMessageLikeField } from '../dynamic-node-executor';

describe('pickPrimaryMessageLikeField', () => {
  it('prefers canonical field when another field aliases it (Slack message/text)', () => {
    const schema = {
      webhookUrl: { type: 'string' },
      channel: { type: 'string' },
      message: { role: 'long_body', essentialForExecution: true },
      text: { aliasOf: 'message' },
    };
    expect(pickPrimaryMessageLikeField(schema)).toBe('message');
  });

  it('prefers long_body role when no alias metadata', () => {
    const schema = {
      title: { role: 'title_like' },
      content: { role: 'long_body' },
    };
    expect(pickPrimaryMessageLikeField(schema)).toBe('content');
  });

  it('prefers essentialForExecution messaging field', () => {
    const schema = {
      note: { type: 'string' },
      body: { essentialForExecution: true },
    };
    expect(pickPrimaryMessageLikeField(schema)).toBe('body');
  });

  it('returns first candidate when only generic names exist', () => {
    const schema = { text: { type: 'string' } };
    expect(pickPrimaryMessageLikeField(schema)).toBe('text');
  });
});
