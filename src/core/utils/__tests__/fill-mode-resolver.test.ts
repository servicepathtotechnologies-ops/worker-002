import { describe, expect, it } from '@jest/globals';
import {
  buildEffectiveFillModes,
  coerceFieldFillModeByPolicy,
  isMeaningfulStaticValue,
  resolveEffectiveFieldFillMode,
} from '../fill-mode-resolver';

describe('fill-mode-resolver', () => {
  const inputSchema: any = {
    text: {
      type: 'string',
      required: true,
      description: 'Text',
      fillMode: { default: 'runtime_ai' },
    },
    subject: {
      type: 'string',
      required: true,
      description: 'Subject',
      fillMode: { default: 'manual_static' },
    },
  };

  it('prefers explicit _fillMode over schema defaults', () => {
    const mode = resolveEffectiveFieldFillMode('text', inputSchema, {
      _fillMode: { text: 'manual_static' },
    });
    expect(mode).toBe('manual_static');
  });

  it('builds effective modes for all schema fields', () => {
    const modes = buildEffectiveFillModes(inputSchema, { _fillMode: { subject: 'runtime_ai' } });
    expect(modes.text).toBe('runtime_ai');
    expect(modes.subject).toBe('runtime_ai');
  });

  it('uses schema default when _fillMode omits a field (wizard partial keys)', () => {
    const modes = buildEffectiveFillModes(inputSchema, {
      _fillMode: { subject: 'manual_static' },
    });
    expect(modes.subject).toBe('manual_static');
    expect(modes.text).toBe('runtime_ai');
  });

  it('falls back to manual_static when field has no fillMode metadata', () => {
    const schema: any = {
      foo: { type: 'string' },
    };
    expect(resolveEffectiveFieldFillMode('foo', schema, {})).toBe('manual_static');
  });

  it('treats empty static values as non-meaningful', () => {
    expect(isMeaningfulStaticValue('')).toBe(false);
    expect(isMeaningfulStaticValue('   ')).toBe(false);
    expect(isMeaningfulStaticValue([])).toBe(false);
    expect(isMeaningfulStaticValue({})).toBe(false);
    expect(isMeaningfulStaticValue('hello')).toBe(true);
  });

  it('coerces runtime_ai when field does not support runtime ownership', () => {
    const schema: any = {
      fields: {
        type: 'array',
        fillMode: {
          default: 'buildtime_ai_once',
          supportsRuntimeAI: false,
          supportsBuildtimeAI: true,
        },
      },
    };
    const result = coerceFieldFillModeByPolicy('fields', 'runtime_ai', schema);
    expect(result.coerced).toBe(true);
    expect(result.mode).toBe('buildtime_ai_once');
    expect(result.reason).toBe('runtime_not_supported');
  });

  it('resolves explicit unsupported runtime_ai to policy-safe mode', () => {
    const schema: any = {
      conditions: {
        type: 'array',
        fillMode: {
          default: 'buildtime_ai_once',
          supportsRuntimeAI: false,
          supportsBuildtimeAI: true,
        },
      },
    };
    const mode = resolveEffectiveFieldFillMode('conditions', schema, {
      _fillMode: { conditions: 'runtime_ai' },
    });
    expect(mode).toBe('buildtime_ai_once');
  });
});
