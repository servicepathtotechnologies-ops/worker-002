import {
  isEmptyConfigValue,
  computeFieldRequiredBeforeExecution,
  isFieldInRegistryRequiredList,
} from '../registry-field-contract';

describe('registry-field-contract', () => {
  it('isEmptyConfigValue treats empty object as missing', () => {
    expect(isEmptyConfigValue({})).toBe(true);
    expect(isEmptyConfigValue({ a: 1 })).toBe(false);
  });

  it('marks ai_agent userInput and chat_model as required before execution', () => {
    expect(isFieldInRegistryRequiredList('ai_agent', 'userInput')).toBe(true);
    expect(isFieldInRegistryRequiredList('ai_agent', 'chat_model')).toBe(true);
  });

  it('computeFieldRequiredBeforeExecution defers runtime_ai fields', () => {
    const req = computeFieldRequiredBeforeExecution(
      'linkedin',
      'text',
      {
        type: 'string',
        role: 'content',
        fillMode: { default: 'runtime_ai', supportsRuntimeAI: true },
      } as any,
      { _fillMode: { text: 'runtime_ai' } } as Record<string, unknown>
    );
    expect(req).toBe(false);
  });

  it('computeFieldRequiredBeforeExecution blocks essential runtime_ai fields', () => {
    const req = computeFieldRequiredBeforeExecution(
      'linkedin',
      'text',
      {
        type: 'string',
        role: 'content',
        essentialForExecution: true,
        fillMode: { default: 'runtime_ai', supportsRuntimeAI: true },
      } as any,
      { _fillMode: { text: 'runtime_ai' } } as Record<string, unknown>
    );
    expect(req).toBe(true);
  });
});
