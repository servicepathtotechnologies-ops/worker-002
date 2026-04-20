/**
 * Integration Tests: Typeform Node Integration Verification
 * Feature: typeform-node-integration
 *
 * Tasks: 10.1
 * Validates: Requirements 5.2, 8.1, 8.3, 8.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import * as fc from 'fast-check';
import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { typeformNodeDefinition } from '../typeform-node';

// ─── Task 10.1 ────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'typeform' after registerAllNodeDefinitions()
// Validates: Requirements 5.2, 8.1

describe('Task 10.1 — nodeDefinitionRegistry contains typeform after registration', () => {
  beforeAll(() => {
    // index.ts auto-registers on import, but call explicitly to be explicit
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("typeform") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('typeform');
    expect(def).toBeDefined();
  });

  test('the typeform definition has type "typeform"', () => {
    const def = nodeDefinitionRegistry.get('typeform');
    expect(def?.type).toBe('typeform');
  });

  test('the typeform definition has label "Typeform"', () => {
    const def = nodeDefinitionRegistry.get('typeform');
    expect(def?.label).toBe('Typeform');
  });

  test('the typeform definition has a non-empty category', () => {
    const def = nodeDefinitionRegistry.get('typeform');
    expect(def?.category).toBeTruthy();
  });
});

// ─── Unit Tests: typeformNodeDefinition exported fields ───────────────────────
// Validates: Requirements 8.3, 8.4

describe('typeformNodeDefinition exported fields', () => {
  test('type is "typeform"', () => {
    expect(typeformNodeDefinition.type).toBe('typeform');
  });

  test('label is "Typeform"', () => {
    expect(typeformNodeDefinition.label).toBe('Typeform');
  });

  test('category is "productivity"', () => {
    expect(typeformNodeDefinition.category).toBe('productivity');
  });

  test('icon is "FileText"', () => {
    expect(typeformNodeDefinition.icon).toBe('FileText');
  });

  test('version is 1', () => {
    expect(typeformNodeDefinition.version).toBe(1);
  });

  test('outgoingPorts is ["default"]', () => {
    expect(typeformNodeDefinition.outgoingPorts).toEqual(['default']);
  });

  test('isBranching is false', () => {
    expect(typeformNodeDefinition.isBranching).toBe(false);
  });

  test('requiredInputs includes "operation" and "apiKey"', () => {
    expect(typeformNodeDefinition.requiredInputs).toContain('operation');
    expect(typeformNodeDefinition.requiredInputs).toContain('apiKey');
  });
});

// ─── Unit Tests: defaultInputs() ─────────────────────────────────────────────
// Validates: Requirements 8.4

describe('defaultInputs()', () => {
  test('operation defaults to "get_responses"', () => {
    const defaults = typeformNodeDefinition.defaultInputs();
    expect(defaults.operation).toBe('get_responses');
  });

  test('returns all fields populated with defaults', () => {
    const defaults = typeformNodeDefinition.defaultInputs();
    const expectedKeys = ['operation', 'apiKey', 'formId', 'title'];
    for (const key of expectedKeys) {
      expect(defaults).toHaveProperty(key);
    }
  });

  test('returns { operation: "get_responses", apiKey: "", formId: "", title: "" }', () => {
    const defaults = typeformNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      operation: 'get_responses',
      apiKey: '',
      formId: '',
      title: '',
    });
  });
});

// ─── Unit Tests: validateInputs() ────────────────────────────────────────────
// Validates: Requirements 3.6, 3.7

describe('validateInputs()', () => {
  test('valid get_responses input returns { valid: true }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'get_responses',
      apiKey: 'test-key',
      formId: 'form-123',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('valid create_form input returns { valid: true }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'create_form',
      apiKey: 'test-key',
      title: 'My Form',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('valid get_form input returns { valid: true }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'get_form',
      apiKey: 'test-key',
      formId: 'form-123',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('invalid operation returns { valid: false }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'invalid_op',
      apiKey: 'test-key',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('get_responses with empty formId returns { valid: false }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'get_responses',
      apiKey: 'test-key',
      formId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('get_form with empty formId returns { valid: false }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'get_form',
      apiKey: 'test-key',
      formId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('create_form with empty title returns { valid: false }', () => {
    const result = typeformNodeDefinition.validateInputs({
      operation: 'create_form',
      apiKey: 'test-key',
      title: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Execution Tests: HTTP calls via executeNodeLegacy ────────────────────────
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

describe('Typeform execution via executeNodeLegacy', () => {
  let executeNodeLegacy: Function;
  let mockFetch: jest.Mock;
  let mockSupabase: any;
  let mockNodeOutputs: any;

  beforeAll(async () => {
    const mod = await import('../../../api/execute-workflow');
    executeNodeLegacy = mod.executeNodeLegacy;
  });

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    mockSupabase = {} as any;
    mockNodeOutputs = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
      getAll: jest.fn().mockReturnValue({}),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeNode(config: Record<string, unknown>) {
    return {
      id: 'typeform-node-1',
      type: 'typeform',
      data: {
        label: 'Typeform',
        type: 'typeform',
        category: 'productivity',
        config,
      },
    };
  }

  function mockSuccessResponse(body: unknown) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  function mockErrorResponse(status: number, body: string = 'Error') {
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: body }),
      text: async () => body,
    });
  }

  // Validates: Requirements 3.1, 3.4
  test('get_responses returns the responses object on HTTP 200', async () => {
    const fixture = {
      page_count: 1,
      total_items: 2,
      items: [{ response_id: 'r1' }, { response_id: 'r2' }],
    };
    mockSuccessResponse(fixture);

    const node = makeNode({ operation: 'get_responses', apiKey: 'my-key', formId: 'form-abc' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject(fixture);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.typeform.com/forms/form-abc/responses');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer my-key');
  });

  // Validates: Requirements 3.2, 3.4
  test('create_form returns the created form object on HTTP 200', async () => {
    const fixture = { id: 'new-form-id', title: 'My Form', type: 'form' };
    mockSuccessResponse(fixture);

    const node = makeNode({ operation: 'create_form', apiKey: 'my-key', title: 'My Form' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject(fixture);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.typeform.com/forms');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer my-key');
    expect(JSON.parse(opts.body)).toMatchObject({ title: 'My Form' });
  });

  // Validates: Requirements 3.3, 3.4
  test('get_form returns the form definition object on HTTP 200', async () => {
    const fixture = { id: 'form-abc', title: 'My Form', fields: [] };
    mockSuccessResponse(fixture);

    const node = makeNode({ operation: 'get_form', apiKey: 'my-key', formId: 'form-abc' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject(fixture);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.typeform.com/forms/form-abc');
    expect(opts.method).toBe('GET');
    expect(opts.headers['Authorization']).toBe('Bearer my-key');
  });

  // Validates: Requirements 3.7
  test('empty apiKey returns { success: false, error: "apiKey is required" } without calling fetch', async () => {
    const node = makeNode({ operation: 'get_responses', apiKey: '', formId: 'form-abc' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject({ success: false, error: 'apiKey is required' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Validates: Requirements 3.6
  test('empty formId for get_responses returns { success: false, error: "formId is required for this operation" }', async () => {
    const node = makeNode({ operation: 'get_responses', apiKey: 'my-key', formId: '' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject({ success: false, error: 'formId is required for this operation' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Validates: Requirements 3.6
  test('empty formId for get_form returns { success: false, error: "formId is required for this operation" }', async () => {
    const node = makeNode({ operation: 'get_form', apiKey: 'my-key', formId: '' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject({ success: false, error: 'formId is required for this operation' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Validates: Requirements 3.6 (create_form title validation)
  test('empty title for create_form returns { success: false, error: "title is required for create_form" }', async () => {
    const node = makeNode({ operation: 'create_form', apiKey: 'my-key', title: '' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject({ success: false, error: 'title is required for create_form' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Validates: Requirements 3.5
  test('non-2xx response returns { success: false, error: "HTTP 422: ..." }', async () => {
    mockErrorResponse(422, 'Unprocessable Entity');

    const node = makeNode({ operation: 'get_responses', apiKey: 'my-key', formId: 'form-abc' });
    const result = await executeNodeLegacy(node, {}, mockNodeOutputs, mockSupabase, 'wf-1');

    expect(result).toMatchObject({ success: false });
    expect((result as any).error).toMatch(/HTTP 422/);
  });
});

// Feature: typeform-node-integration, Property 8: validateInputs rejects all invalid input combinations
// **Validates: Requirements 2.3, 4.4**
describe('Property 8 — validateInputs rejects all invalid input combinations', () => {
  test('Property 8: arbitrary non-operation strings return { valid: false }', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !['get_responses', 'create_form', 'get_form'].includes(s)),
        (s) => {
          const result = typeformNodeDefinition.validateInputs({ operation: s, apiKey: 'key' });
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: typeform-node-integration, Property 9: defaultInputs provides all required fields
// Validates: Requirements 4.7, 8.5
describe('Property 9 — defaultInputs provides all required fields', () => {
  test('Property 9: defaultInputs() returns all four fields with correct defaults (100 calls)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const defaults = typeformNodeDefinition.defaultInputs();
          expect(defaults).toHaveProperty('operation');
          expect(defaults).toHaveProperty('apiKey');
          expect(defaults).toHaveProperty('formId');
          expect(defaults).toHaveProperty('title');
          expect(defaults.operation).toBe('get_responses');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: typeform-node-integration, Property 6: Missing formId produces validation error
// Validates: Requirements 3.6, 4.5
describe('Property 6 — Missing formId produces validation error', () => {
  test('Property 6: whitespace-only formId for get_responses returns { valid: false }', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ \t\n\r]+$/),
        (whitespaceFormId) => {
          const result = typeformNodeDefinition.validateInputs({
            operation: 'get_responses',
            apiKey: 'test-key',
            formId: whitespaceFormId,
          });
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 6: whitespace-only formId for get_form returns { valid: false }', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ \t\n\r]+$/),
        (whitespaceFormId) => {
          const result = typeformNodeDefinition.validateInputs({
            operation: 'get_form',
            apiKey: 'test-key',
            formId: whitespaceFormId,
          });
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: typeform-node-integration, Property 10 (override tags): overrideTypeform always includes required tags
// Validates: Requirements 6.1
describe('Property 10 (override tags) — overrideTypeform tags superset', () => {
  test('Property 10: overrideTypeform result tags always include all required Typeform tags', async () => {
    const { overrideTypeform } = await import('../../../core/registry/overrides/typeform');
    const REQUIRED_TAGS = ['typeform', 'forms', 'survey', 'productivity', 'api'];

    fc.assert(
      fc.property(
        fc.array(fc.string()),
        (randomTags) => {
          const mockDef: any = {
            type: 'typeform',
            label: 'Typeform',
            tags: randomTags,
          };
          const mockSchema: any = { type: 'typeform' };
          const result = overrideTypeform(mockDef, mockSchema);
          for (const tag of REQUIRED_TAGS) {
            expect(result.tags).toContain(tag);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 10: overrideTypeform with empty tags still includes all required tags', () => {
    // Synchronous version for the empty-tags edge case
    const { overrideTypeform } = require('../../../core/registry/overrides/typeform');
    const REQUIRED_TAGS = ['typeform', 'forms', 'survey', 'productivity', 'api'];
    const mockDef: any = { type: 'typeform', label: 'Typeform', tags: [] };
    const mockSchema: any = { type: 'typeform' };
    const result = overrideTypeform(mockDef, mockSchema);
    for (const tag of REQUIRED_TAGS) {
      expect(result.tags).toContain(tag);
    }
  });
});

// ─── Task 7.1 ─────────────────────────────────────────────────────────────────
// Unit tests for overrides map registration
// Validates: Requirements 6.3
describe('Task 7.1 — overrides map registration for typeform', () => {
  test('hasRegistryExecuteOverride("typeform") returns true', async () => {
    const { hasRegistryExecuteOverride } = await import('../../../core/registry/unified-node-registry-overrides');
    expect(hasRegistryExecuteOverride('typeform')).toBe(true);
  });

  test('getNodeTypesWithExecuteOverrides() includes "typeform"', async () => {
    const { getNodeTypesWithExecuteOverrides } = await import('../../../core/registry/unified-node-registry-overrides');
    expect(getNodeTypesWithExecuteOverrides()).toContain('typeform');
  });
});

// ─── Task 8.1 ─────────────────────────────────────────────────────────────────
// Property 10: All Typeform aliases resolve to canonical type
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
describe('Task 8.1 — Property 10: All Typeform aliases resolve to canonical type', () => {
  const TYPEFORM_ALIASES = ['typeform', 'forms', 'survey', 'form builder'] as const;

  for (const alias of TYPEFORM_ALIASES) {
    test(`resolveAlias("${alias}") returns "typeform"`, () => {
      const { unifiedNodeRegistry } = require('../../../core/registry/unified-node-registry');
      expect(unifiedNodeRegistry.resolveAlias(alias)).toBe('typeform');
    });
  }
});

// ─── Task 10.3 ────────────────────────────────────────────────────────────────
// Unit test for NodeLibrary schema registration
// Validates: Requirements 8.1, 8.2, 8.3, 8.4
describe('Task 10.3 — NodeLibrary schema registration for typeform', () => {
  test('nodeLibrary.getSchema("typeform") returns a non-undefined schema object', () => {
    const { nodeLibrary } = require('../../../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('typeform');
    expect(schema).toBeDefined();
    expect(schema).not.toBeNull();
  });

  test('nodeLibrary.getSchema("typeform") has type "typeform"', () => {
    const { nodeLibrary } = require('../../../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('typeform');
    expect(schema?.type).toBe('typeform');
  });

  test('unifiedNodeRegistry.get("typeform") returns a non-undefined UnifiedNodeDefinition', () => {
    const { unifiedNodeRegistry } = require('../../../core/registry/unified-node-registry');
    const def = unifiedNodeRegistry.get('typeform');
    expect(def).toBeDefined();
    expect(def).not.toBeNull();
  });

  test('unifiedNodeRegistry.get("typeform") has type "typeform"', () => {
    const { unifiedNodeRegistry } = require('../../../core/registry/unified-node-registry');
    const def = unifiedNodeRegistry.get('typeform');
    expect(def?.type).toBe('typeform');
  });
});
