import { validateWorkflowConfig } from '../pre-execution-validator';

// Mock the heavy registry and intelligence module
jest.mock('../../types/node-definition', () => ({
  nodeDefinitionRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../node-field-intelligence', () => ({
  validateWorkflowNodeIntelligence: jest.fn(() => []),
}));

import { nodeDefinitionRegistry } from '../../types/node-definition';
import { validateWorkflowNodeIntelligence } from '../node-field-intelligence';

const mockGet = nodeDefinitionRegistry.get as jest.Mock;
const mockIntelligence = validateWorkflowNodeIntelligence as jest.Mock;

function makeDef(overrides: { validateInputs?: (c: any) => { valid: boolean; errors: string[] }; label?: string; inputSchema?: Record<string, any> } = {}) {
  return {
    label: overrides.label ?? 'Test Node',
    inputSchema: overrides.inputSchema ?? {
      prompt: { description: 'Prompt — the text to send', required: true },
    },
    validateInputs: overrides.validateInputs ?? jest.fn(() => ({ valid: true, errors: [] })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIntelligence.mockReturnValue([]);
});

describe('validateWorkflowConfig', () => {
  test('empty node list returns valid with no issues', () => {
    const result = validateWorkflowConfig([]);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.missingInputs).toHaveLength(0);
  });

  test('all SKIP_TYPES nodes are ignored and result is valid', () => {
    const nodes = [
      { id: 'n1', type: 'trigger', data: {} },
      { id: 'n2', type: 'webhook_trigger', data: {} },
      { id: 'n3', type: 'schedule_trigger', data: {} },
      { id: 'n4', type: 'manual_trigger', data: {} },
      { id: 'n5', type: 'log_output', data: {} },
      { id: 'n6', type: 'terminal', data: {} },
      { id: 'n7', type: 'no_op', data: {} },
    ];
    const result = validateWorkflowConfig(nodes);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('unknown node type (not in registry) is skipped gracefully', () => {
    mockGet.mockReturnValue(undefined);
    const result = validateWorkflowConfig([{ id: 'n1', type: 'alien_node', data: { config: {} } }]);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('node that passes validateInputs is not added to issues', () => {
    mockGet.mockReturnValue(makeDef());
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { config: { prompt: 'hello' } } },
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.missingInputs).toHaveLength(0);
  });

  test('node that fails validateInputs produces an issue entry', () => {
    mockGet.mockReturnValue(
      makeDef({ validateInputs: () => ({ valid: false, errors: ['prompt is required'] }) }),
    );
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { label: 'Sheets', config: {} } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].nodeId).toBe('n1');
    expect(result.issues[0].nodeLabel).toBe('Sheets');
    expect(result.issues[0].nodeType).toBe('google_sheets');
    expect(result.issues[0].missingFields).toHaveLength(1);
  });

  test('failed node error is flattened into missingInputs', () => {
    mockGet.mockReturnValue(
      makeDef({ validateInputs: () => ({ valid: false, errors: ['prompt is required'] }) }),
    );
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { label: 'Sheets', config: {} } },
    ]);
    expect(result.missingInputs).toHaveLength(1);
    expect(result.missingInputs[0].nodeLabel).toBe('Sheets');
    expect(result.missingInputs[0].fieldName).toBeDefined();
    expect(result.missingInputs[0].description).toBe('prompt is required');
  });

  test('multiple invalid nodes all appear in issues', () => {
    mockGet.mockReturnValue(
      makeDef({ validateInputs: () => ({ valid: false, errors: ['field is required'] }) }),
    );
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { config: {} } },
      { id: 'n2', type: 'slack_message', data: { config: {} } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.missingInputs).toHaveLength(2);
  });

  test('node with no data.config defaults to empty object without throwing', () => {
    const validateInputs = jest.fn(() => ({ valid: true, errors: [] }));
    mockGet.mockReturnValue(makeDef({ validateInputs }));
    expect(() =>
      validateWorkflowConfig([{ id: 'n1', type: 'google_sheets' }]),
    ).not.toThrow();
    expect(validateInputs).toHaveBeenCalledWith({});
  });

  test('node with no data.label falls back to def.label', () => {
    mockGet.mockReturnValue(
      makeDef({
        label: 'Registry Label',
        validateInputs: () => ({ valid: false, errors: ['x is required'] }),
      }),
    );
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { config: {} } },
    ]);
    expect(result.issues[0].nodeLabel).toBe('Registry Label');
  });

  test('node with no data at all falls back to nodeType as label', () => {
    mockGet.mockReturnValue({
      label: undefined,
      inputSchema: {},
      validateInputs: () => ({ valid: false, errors: ['x is required'] }),
    });
    const result = validateWorkflowConfig([{ id: 'n1', type: 'mystery_node' }]);
    expect(result.issues[0].nodeLabel).toBe('mystery_node');
  });

  test('blocking intelligence error (severity=error) makes result invalid', () => {
    mockGet.mockReturnValue(makeDef());
    mockIntelligence.mockReturnValue([
      {
        nodeId: 'n1',
        nodeType: 'google_sheets',
        fieldName: 'spreadsheetId',
        severity: 'error',
        reason: 'required credential missing',
        source: 'node_intelligence',
      },
    ]);
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { config: { prompt: 'ok' } } },
    ]);
    expect(result.valid).toBe(false);
    expect(result.validationIssues).toHaveLength(1);
    expect(result.issues).toHaveLength(0); // config itself was fine
  });

  test('non-blocking intelligence warning (severity=warning) does not affect valid', () => {
    mockGet.mockReturnValue(makeDef());
    mockIntelligence.mockReturnValue([
      {
        nodeId: 'n1',
        nodeType: 'google_sheets',
        fieldName: 'spreadsheetId',
        severity: 'warning',
        reason: 'field might be empty at runtime',
        source: 'node_intelligence',
      },
    ]);
    const result = validateWorkflowConfig([
      { id: 'n1', type: 'google_sheets', data: { config: { prompt: 'ok' } } },
    ]);
    expect(result.valid).toBe(true);
    expect(result.validationIssues).toHaveLength(1);
  });
});
