jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

jest.mock('../property-population-stage-client', () => ({
  runPropertyPopulationJsonRemote: jest.fn(),
}));

jest.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getBuildValueContext: jest.fn(),
  },
}));

import { logger } from '../../../../core/logger';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import type { Workflow } from '../../../../core/types/ai-types';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { runPropertyPopulationJsonRemote } from '../property-population-stage-client';
import { runPropertyPopulationStage } from '../property-population-stage';

const mockLoggerWarn = logger.warn as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockGetBuildValueContext = unifiedNodeRegistry.getBuildValueContext as jest.Mock;
const mockRunPropertyPopulationJsonRemote = runPropertyPopulationJsonRemote as jest.Mock;

function makeWorkflow(): Workflow {
  return {
    nodes: [
      {
        id: 'form_1',
        type: 'form',
        data: {
          label: 'Lead Form',
          type: 'form',
          category: 'input',
          config: {
            fields: [
              { name: 'email', type: 'email' },
              { name: 'fullName', type: 'text' },
            ],
          },
        },
      },
      {
        id: 'gmail_1',
        type: 'gmail',
        data: {
          label: 'Send Email',
          type: 'gmail',
          category: 'communication',
          config: {},
        },
      },
    ],
    edges: [{ id: 'edge_1', source: 'form_1', target: 'gmail_1' }],
  };
}

function propertyPopulationSuccess(values: Record<string, unknown>) {
  return {
    ok: true,
    values,
    durationMs: 7,
    llmCall: { model: 'gemini-3.5-flash', temperature: 0.1, promptTokens: 1, completionTokens: 1 },
  };
}

function installRegistryMocks() {
  mockRegistryGet.mockImplementation((nodeType: string) => {
    if (nodeType === 'form') {
      return {
        inputSchema: {},
        outputSchema: {
          email: { type: 'string', description: 'Submitted email' },
          fullName: { type: 'string', description: 'Submitted full name' },
        },
        defaultConfig: () => ({}),
      };
    }

    if (nodeType === 'gmail') {
      return {
        inputSchema: {
          subject: {
            type: 'string',
            description: 'Email subject',
            role: 'title_like',
            fillMode: { default: 'buildtime_ai_once' },
            ownership: 'value',
          },
          body: {
            type: 'string',
            description: 'Email body generated at execution time',
            role: 'long_body',
            fillMode: { default: 'runtime_ai', supportsRuntimeAI: true },
            ownership: 'value',
          },
          internalNotes: {
            type: 'string',
            description: 'Execution-only notes',
            fillMode: { default: 'runtime_ai', supportsRuntimeAI: false },
            ownership: 'value',
          },
          apiKey: {
            type: 'string',
            description: 'Gmail API key',
            fillMode: { default: 'runtime_ai', supportsRuntimeAI: true },
            ownership: 'credential',
          },
        },
        defaultConfig: () => ({ subject: '', body: '', internalNotes: '', apiKey: '' }),
      };
    }

    return undefined;
  });

  mockGetBuildValueContext.mockReturnValue({
    upstreamFields: [
      { name: 'email', type: 'string', description: 'Submitted email' },
      { name: 'fullName', type: 'string', description: 'Submitted full name' },
    ],
    targetFields: [
      { name: 'subject', role: 'title_like', essentialForExecution: true },
      { name: 'body', role: 'long_body', essentialForExecution: true },
    ],
  });
}

describe('runPropertyPopulationStage runtime field directives', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installRegistryMocks();
  });

  it('stores only valid runtime_ai field directives returned by ai-generator', async () => {
    mockRunPropertyPopulationJsonRemote.mockImplementation(async (params: { purpose: string }) => {
      if (params.purpose === 'property_population') {
        return propertyPopulationSuccess({ subject: 'Follow up with new lead' });
      }

      return propertyPopulationSuccess({
        body: 'Write a concise note using {{$json.email}} and {{$json.fullName}}.',
        subject: 'not a runtime field',
        internalNotes: 'runtime AI is disabled for this field',
        apiKey: 'credential directive must not be stored',
        extra: 'unknown directive must not be stored',
      });
    });

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Send a friendly follow-up email to each submitted lead.',
      structuralPrompt: 'form -> gmail',
      correlationId: 'runtime-directives-remote',
    });

    const config = result.workflow.nodes[1].data.config as Record<string, unknown>;
    const directiveCall = mockRunPropertyPopulationJsonRemote.mock.calls.find(
      ([params]: [{ purpose: string }]) => params.purpose === 'field_directive_generation',
    )?.[0];

    expect(result.propertyPopulationSummary.gmail_1).toEqual(['subject']);
    expect(config._fieldDirectives).toEqual({
      body: 'Write a concise note using {{$json.email}} and {{$json.fullName}}.',
    });
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(directiveCall).toEqual(
      expect.objectContaining({
        purpose: 'field_directive_generation',
        allowedKeys: ['body'],
        correlationId: 'runtime-directives-remote',
        nodeId: 'gmail_1',
        nodeType: 'gmail',
        message: expect.stringContaining('UPSTREAM_FIELDS'),
      }),
    );
    expect(directiveCall.message).toContain('email');
    expect(directiveCall.message).toContain('fullName');
  });

  it('falls back to local Gemini and retries malformed JSON for directive generation', async () => {
    mockRunPropertyPopulationJsonRemote.mockImplementation(async (params: { purpose: string }) => {
      if (params.purpose === 'property_population') {
        return propertyPopulationSuccess({ subject: 'Follow up with new lead' });
      }

      return {
        ok: false,
        code: 'INVALID_LLM_RESPONSE',
        rawResponse: 'not-json',
        durationMs: 3,
      };
    });
    mockProcessRequest
      .mockResolvedValueOnce('this is not json')
      .mockResolvedValueOnce('```json\n{"body":"Use {{$json.email}} to personalize the email body."}\n```');

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Email every lead from the form.',
      structuralPrompt: 'form -> gmail',
      correlationId: 'runtime-directives-local',
    });

    const config = result.workflow.nodes[1].data.config as Record<string, unknown>;

    expect(config._fieldDirectives).toEqual({
      body: 'Use {{$json.email}} to personalize the email body.',
    });
    expect(mockProcessRequest).toHaveBeenCalledTimes(2);
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      1,
      'field-directive-generation',
      expect.objectContaining({ message: expect.stringContaining('FIELDS NEEDING DIRECTIVES') }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockProcessRequest).toHaveBeenNthCalledWith(
      2,
      'field-directive-generation',
      expect.objectContaining({ message: expect.stringContaining('previous response was not valid JSON') }),
      expect.objectContaining({ model: 'gemini-3.5-flash', temperature: 0.1, cache: false }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai_pipeline_stage_warn',
        reason: expect.stringContaining('ai-generator returned INVALID_LLM_RESPONSE'),
      }),
    );
  });

  it('soft-fails directive generation without discarding populated properties', async () => {
    mockRunPropertyPopulationJsonRemote.mockImplementation(async (params: { purpose: string }) => {
      if (params.purpose === 'property_population') {
        return propertyPopulationSuccess({ subject: 'Follow up with new lead' });
      }

      return null;
    });
    mockProcessRequest.mockRejectedValue(new Error('directive generation down'));

    const result = await runPropertyPopulationStage({
      workflow: makeWorkflow(),
      userIntent: 'Email every lead from the form.',
      structuralPrompt: 'form -> gmail',
      correlationId: 'runtime-directives-soft-fail',
    });

    const config = result.workflow.nodes[1].data.config as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.propertyPopulationSummary.gmail_1).toEqual(['subject']);
    expect(config.subject).toBe('Follow up with new lead');
    expect(config).not.toHaveProperty('_fieldDirectives');
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'field_directives_skipped',
        reason: 'directive generation down',
        nodeId: 'gmail_1',
        nodeType: 'gmail',
      }),
    );
  });
});
