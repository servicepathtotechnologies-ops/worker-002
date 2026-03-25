import { describe, it, expect } from '@jest/globals';
import { guaranteeInputForSchema } from '../input-guarantee';

describe('input guarantee fill mode behavior', () => {
  it('does not auto-fill manual_static fields from previous output', () => {
    const out = guaranteeInputForSchema({
      resolved: { subject: '' },
      previousOutput: { subject: 'FROM_UPSTREAM' },
      inputSchema: {
        subject: {
          type: 'string',
          description: 'Email subject',
          required: true,
        },
      },
      requiredInputs: ['subject'],
      fieldFillModes: {
        subject: 'manual_static',
      },
    });

    expect(out.subject).toBe('');
  });

  it('does not synthesize fallback for structural fields', () => {
    const out = guaranteeInputForSchema({
      resolved: {},
      previousOutput: {},
      inputSchema: {
        conditions: {
          type: 'array',
          description: 'Branch conditions',
          required: true,
          role: 'raw_json',
          fillMode: { default: 'buildtime_ai_once', supportsRuntimeAI: false, supportsBuildtimeAI: true },
        },
      },
      requiredInputs: ['conditions'],
    });

    expect(out.conditions).toBeUndefined();
  });
});

