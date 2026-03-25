import { describe, it, expect, jest } from '@jest/globals';
import { generateComprehensiveNodeQuestions } from '../comprehensive-node-questions-generator';

jest.mock('../../nodes/node-library', () => ({
  nodeLibrary: {
    getSchema: jest.fn(() => ({
      configSchema: {
        required: ['text'],
        optional: {
          text: { type: 'string', description: 'Text to process' },
          maxLength: { type: 'number', description: 'Max length' },
          apiKey: { type: 'string', description: 'API key label-like field' },
        },
      },
    })),
  },
}));

const mockRegistry = {
  category: 'ai',
  inputSchema: {
    text: {
      type: 'string',
      description: 'Text to process',
      required: true,
      ownership: 'value',
      fillMode: { default: 'runtime_ai', supportsRuntimeAI: true, supportsBuildtimeAI: true },
      essentialForExecution: true,
    },
    maxLength: {
      type: 'number',
      description: 'Max length',
      required: false,
      ownership: 'value',
      fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
      essentialForExecution: true,
    },
    apiKey: {
      type: 'string',
      description: 'API key label-like field',
      required: false,
      ownership: 'value',
      fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: false },
      essentialForExecution: true,
    },
    conditions: {
      type: 'array',
      description: 'Structural conditions',
      required: true,
      ownership: 'structural',
      fillMode: { default: 'buildtime_ai_once', supportsRuntimeAI: false, supportsBuildtimeAI: true },
      essentialForExecution: true,
    },
  },
};

jest.mock('../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(() => mockRegistry),
  },
}));

describe('comprehensive questions full-configuration mode', () => {
  it('omits configuration questions for runtime_ai fields (filled at execution)', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'n1',
          type: 'text_summarizer',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: {
              text: 'prefilled',
            },
          },
        },
      ],
      edges: [],
    };

    const result = generateComprehensiveNodeQuestions(workflow, {}, { mode: 'full_configuration' });
    const hasTextQuestion = result.questions.some((q) => q.fieldName === 'text' && q.category === 'configuration');
    expect(hasTextQuestion).toBe(false);
  });

  it('includes configuration questions when user locks field to manual_static via _fillMode', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'n1',
          type: 'text_summarizer',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: {
              text: 'prefilled',
              _fillMode: { text: 'manual_static' },
            },
          },
        },
      ],
      edges: [],
    };

    const result = generateComprehensiveNodeQuestions(workflow, {}, { mode: 'full_configuration' });
    const hasTextQuestion = result.questions.some((q) => q.fieldName === 'text' && q.category === 'configuration');
    expect(hasTextQuestion).toBe(true);
  });

  it('does not infer credential category from name when ownership is value', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'n1',
          type: 'text_summarizer',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: {
              apiKey: '',
              _fillMode: { apiKey: 'manual_static' },
            },
          },
        },
      ],
      edges: [],
    };
    const result = generateComprehensiveNodeQuestions(workflow, {}, { mode: 'full_configuration' });
    const hasCredentialApiKey = result.questions.some((q) => q.fieldName === 'apiKey' && q.category === 'credential');
    expect(hasCredentialApiKey).toBe(false);
  });

  it('never emits structural ownership fields as questions', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'n1',
          type: 'text_summarizer',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: {
              conditions: [],
            },
          },
        },
      ],
      edges: [],
    };
    const result = generateComprehensiveNodeQuestions(workflow, {}, { mode: 'full_configuration' });
    const hasStructuralQuestion = result.questions.some((q) => q.fieldName === 'conditions');
    expect(hasStructuralQuestion).toBe(false);
  });
});

