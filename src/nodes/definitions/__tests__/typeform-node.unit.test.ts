/**
 * Property-Based Tests: Typeform Node
 * Feature: typeform-node-integration
 *
 * Task: 9.2
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3, 7.4, 8.5
 */

import * as fc from 'fast-check';
import { typeformNodeDefinition } from '../typeform-node';

// ─── Shared helpers ───────────────────────────────────────────────────────────

let executeNodeLegacy: Function;

beforeAll(async () => {
  const mod = await import('../../../api/execute-workflow');
  executeNodeLegacy = mod.executeNodeLegacy;
});

function makeNode(config: Record<string, unknown>) {
  return {
    id: 'test',
    type: 'typeform',
    data: {
      label: 'Typeform',
      type: 'typeform',
      category: 'productivity',
      config,
    },
  };
}

function makeMockNodeOutputs() {
  return {
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    getAll: jest.fn().mockReturnValue({}),
  };
}

function mockFetchSuccess(body: unknown) {
  const mock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  global.fetch = mock as any;
  return mock;
}

function mockFetchError(status: number) {
  const mock = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: `HTTP ${status}` }),
    text: async () => `HTTP ${status}`,
  });
  global.fetch = mock as any;
  return mock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Property 1 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 1: get_responses sends correct HTTP request
// Validates: Requirements 3.1

describe('Property 1 — get_responses sends correct HTTP request', () => {
  test('Property 1: GET called with correct URL and Authorization: Bearer header', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        async (apiKey, formId) => {
          const mockFetch = mockFetchSuccess({ items: [] });
          const node = makeNode({ operation: 'get_responses', apiKey, formId });
          await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test');

          expect(mockFetch).toHaveBeenCalledTimes(1);
          const [url, opts] = mockFetch.mock.calls[0];
          expect(url).toBe(`https://api.typeform.com/forms/${formId}/responses`);
          expect(opts.method).toBe('GET');
          expect(opts.headers['Authorization']).toBe(`Bearer ${apiKey}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 2: create_form sends correct HTTP request
// Validates: Requirements 3.2

describe('Property 2 — create_form sends correct HTTP request', () => {
  test('Property 2: POST called with correct URL, header, and body containing title', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        async (apiKey, title) => {
          const mockFetch = mockFetchSuccess({ id: 'new-form', title });
          const node = makeNode({ operation: 'create_form', apiKey, title });
          await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test');

          expect(mockFetch).toHaveBeenCalledTimes(1);
          const [url, opts] = mockFetch.mock.calls[0];
          expect(url).toBe('https://api.typeform.com/forms');
          expect(opts.method).toBe('POST');
          expect(opts.headers['Authorization']).toBe(`Bearer ${apiKey}`);
          expect(JSON.parse(opts.body)).toMatchObject({ title });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 3: get_form sends correct HTTP request
// Validates: Requirements 3.3

describe('Property 3 — get_form sends correct HTTP request', () => {
  test('Property 3: GET called with correct URL and Authorization: Bearer header', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        async (apiKey, formId) => {
          const mockFetch = mockFetchSuccess({ id: formId, title: 'Form' });
          const node = makeNode({ operation: 'get_form', apiKey, formId });
          await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test');

          expect(mockFetch).toHaveBeenCalledTimes(1);
          const [url, opts] = mockFetch.mock.calls[0];
          expect(url).toBe(`https://api.typeform.com/forms/${formId}`);
          expect(opts.method).toBe('GET');
          expect(opts.headers['Authorization']).toBe(`Bearer ${apiKey}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 4: Successful API response is returned as-is
// Validates: Requirements 3.4

describe('Property 4 — Successful API response is returned as-is', () => {
  test('Property 4: node output equals parsed JSON from 200 response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.jsonValue(),
        async (apiKey, formId, responseBody) => {
          mockFetchSuccess(responseBody);
          const node = makeNode({ operation: 'get_responses', apiKey, formId });
          const result = await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test');
          expect(result).toEqual(responseBody);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 5: Non-2xx API response produces error output
// Validates: Requirements 3.5

describe('Property 5 — Non-2xx API response produces error output', () => {
  test('Property 5: output contains success: false and error includes the status code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 400, max: 599 }),
        async (apiKey, formId, status) => {
          mockFetchError(status);
          const node = makeNode({ operation: 'get_responses', apiKey, formId });
          const result = await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test') as any;
          expect(result.success).toBe(false);
          expect(result.error).toContain(String(status));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 6: Missing formId produces validation error
// Validates: Requirements 3.6, 4.5

describe('Property 6 — Missing formId produces validation error', () => {
  test('Property 6: whitespace-only formId for get_responses/get_form returns error from executor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.stringMatching(/^[ \t\n\r]+$/),
        fc.constantFrom('get_responses', 'get_form'),
        async (apiKey, formId, operation) => {
          const node = makeNode({ operation, apiKey, formId });
          const result = await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test') as any;
          expect(result).toEqual({ success: false, error: 'formId is required for this operation' });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 7: Missing apiKey produces validation error
// Validates: Requirements 3.7

describe('Property 7 — Missing apiKey produces validation error', () => {
  test('Property 7: whitespace-only apiKey returns { success: false, error: "apiKey is required" }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[ \t\n\r]+$/),
        fc.constantFrom('get_responses', 'create_form', 'get_form'),
        fc.string(),
        async (apiKey, operation, formIdOrTitle) => {
          const config: Record<string, unknown> = { operation, apiKey, formId: formIdOrTitle, title: formIdOrTitle };
          const node = makeNode(config);
          const result = await executeNodeLegacy(node, {}, makeMockNodeOutputs(), {}, 'wf-test') as any;
          expect(result).toEqual({ success: false, error: 'apiKey is required' });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 8: validateInputs rejects all invalid input combinations
// Validates: Requirements 4.4, 4.6

describe('Property 8 — validateInputs rejects all invalid input combinations', () => {
  test('Property 8a: arbitrary non-operation strings return { valid: false } with non-empty errors', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !['get_responses', 'create_form', 'get_form'].includes(s)),
        (operation) => {
          const result = typeformNodeDefinition.validateInputs({ operation, apiKey: 'key' });
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 8b: create_form with whitespace-only title returns { valid: false }', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ \t\n\r]+$/),
        (title) => {
          const result = typeformNodeDefinition.validateInputs({
            operation: 'create_form',
            apiKey: 'key',
            title,
          });
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 9 ───────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 9: defaultInputs provides all required fields
// Validates: Requirements 4.7, 8.5

describe('Property 9 — defaultInputs provides all required fields', () => {
  test('Property 9: defaultInputs() returns all four fields with operation === "get_responses" (100 calls)', () => {
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

// ─── Property 10 ──────────────────────────────────────────────────────────────
// Feature: typeform-node-integration, Property 10: All Typeform aliases resolve to canonical type
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6

describe('Property 10 — All Typeform aliases resolve to canonical type', () => {
  const TYPEFORM_ALIASES = ['typeform', 'forms', 'survey', 'form builder'] as const;

  test('Property 10: each alias resolves to "typeform"', () => {
    const { unifiedNodeRegistry } = require('../../../core/registry/unified-node-registry');
    for (const alias of TYPEFORM_ALIASES) {
      expect(unifiedNodeRegistry.resolveAlias(alias)).toBe('typeform');
    }
  });
});
