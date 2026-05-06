/**
 * Unit Tests — `_fillMode` / no-`_fieldModes` contract
 * Task 1.2: intelligent-config-filler.ts writes _fillMode, not _fieldModes
 *
 * Validates: Requirements 1.2, 1.6
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

jest.mock('../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getEffectiveOutputSchema: jest.fn().mockReturnValue({ properties: {} }),
  },
}));

jest.mock('../../nodes/node-library', () => ({
  nodeLibrary: {
    getSchema: jest.fn().mockReturnValue({
      type: 'test_node',
      configSchema: { required: [], optional: {} },
    }),
  },
}));

jest.mock('../../../shared/llm-adapter', () => ({
  LLMAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue({ content: '{}' }),
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { IntelligentConfigFiller } from '../intelligent-config-filler';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockRegistryGet = unifiedNodeRegistry.get as jest.MockedFunction<typeof unifiedNodeRegistry.get>;

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/**
 * A minimal node definition with two fields:
 *   - `prompt`   → fillMode.default = 'buildtime_ai_once'
 *   - `apiKey`   → fillMode.default = 'manual_static'
 */
const MOCK_NODE_DEF = {
  inputSchema: {
    prompt: {
      type: 'string',
      required: false,
      description: 'The prompt text',
      fillMode: { default: 'buildtime_ai_once' },
      ownership: 'value',
    },
    apiKey: {
      type: 'string',
      required: false,
      description: 'API key',
      fillMode: { default: 'manual_static' },
      ownership: 'credential',
    },
  },
  requiredInputs: [],
  defaultConfig: () => ({ prompt: '', apiKey: '' }),
};

/**
 * A node definition with three fields covering all three fill modes.
 */
const MOCK_NODE_DEF_ALL_MODES = {
  inputSchema: {
    subject: {
      type: 'string',
      required: false,
      description: 'Email subject',
      fillMode: { default: 'buildtime_ai_once' },
      ownership: 'value',
    },
    body: {
      type: 'string',
      required: false,
      description: 'Email body',
      fillMode: { default: 'runtime_ai' },
      ownership: 'value',
    },
    recipient: {
      type: 'string',
      required: false,
      description: 'Recipient email',
      fillMode: { default: 'manual_static' },
      ownership: 'value',
    },
  },
  requiredInputs: [],
  defaultConfig: () => ({ subject: '', body: '', recipient: '' }),
};

// ─── Workflow factory ─────────────────────────────────────────────────────────

function makeWorkflow(nodeType: string, config: Record<string, any> = {}) {
  return {
    nodes: [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { type: nodeType, label: nodeType, config },
      },
    ],
    edges: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IntelligentConfigFiller — _fillMode / no-_fieldModes contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistryGet.mockReturnValue(MOCK_NODE_DEF as any);
  });

  // ── Test 1: _fillMode is defined and is a non-null object ─────────────────

  describe('_fillMode presence', () => {
    it('every node config has _fillMode defined after fillConfigurationsFromPrompt()', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fillMode).toBeDefined();
    });

    it('_fillMode is a non-null object (not a string, number, or null)', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fillMode).not.toBeNull();
      expect(typeof config._fillMode).toBe('object');
      expect(Array.isArray(config._fillMode)).toBe(false);
    });

    it('_fillMode is defined even when the node has no upstream edges', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        '',
        '',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fillMode).toBeDefined();
      expect(typeof config._fillMode).toBe('object');
    });

    it('_fillMode is defined for all nodes in a multi-node workflow', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = {
        nodes: [
          {
            id: 'node-1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'test_node', label: 'Node 1', config: {} },
          },
          {
            id: 'node-2',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: { type: 'test_node', label: 'Node 2', config: {} },
          },
        ],
        edges: [{ id: 'e1', source: 'node-1', target: 'node-2', type: 'main' }],
      };

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      for (const node of result.nodes) {
        const config = (node as any).data?.config ?? {};
        expect(config._fillMode).toBeDefined();
        expect(typeof config._fillMode).toBe('object');
        expect(config._fillMode).not.toBeNull();
      }
    });
  });

  // ── Test 2: no _fieldModes key in any node config ─────────────────────────

  describe('_fieldModes absence', () => {
    it('no node config contains a _fieldModes key after fillConfigurationsFromPrompt()', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fieldModes).toBeUndefined();
    });

    it('_fieldModes is absent even when the node has a rich inputSchema', async () => {
      mockRegistryGet.mockReturnValue(MOCK_NODE_DEF_ALL_MODES as any);
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('email_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'send an email',
        'send an email',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fieldModes).toBeUndefined();
    });

    it('_fieldModes is absent for all nodes in a multi-node workflow', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = {
        nodes: [
          {
            id: 'node-1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { type: 'test_node', label: 'Node 1', config: {} },
          },
          {
            id: 'node-2',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: { type: 'test_node', label: 'Node 2', config: {} },
          },
        ],
        edges: [{ id: 'e1', source: 'node-1', target: 'node-2', type: 'main' }],
      };

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      for (const node of result.nodes) {
        const config = (node as any).data?.config ?? {};
        expect(config._fieldModes).toBeUndefined();
      }
    });

    it('_fieldModes is absent even when the node config already had _fieldModes before processing', async () => {
      // Simulate a node that somehow had _fieldModes in its config before the filler ran
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node', {
        _fieldModes: { prompt: 'buildtime_ai_once' }, // legacy key pre-existing
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      // The filler must delete _fieldModes
      expect(config._fieldModes).toBeUndefined();
    });
  });

  // ── Test 3: _fillMode entries match registry fillMode.default ─────────────

  describe('_fillMode values match registry defaults', () => {
    it('_fillMode[fieldName] matches fillMode.default for each field in inputSchema', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // prompt → buildtime_ai_once (from MOCK_NODE_DEF)
      expect(fillMode.prompt).toBe('buildtime_ai_once');
      // apiKey → manual_static (from MOCK_NODE_DEF)
      expect(fillMode.apiKey).toBe('manual_static');
    });

    it('_fillMode entries match registry defaults for all three fill modes', async () => {
      mockRegistryGet.mockReturnValue(MOCK_NODE_DEF_ALL_MODES as any);
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('email_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'send an email',
        'send an email',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      expect(fillMode.subject).toBe('buildtime_ai_once');
      expect(fillMode.body).toBe('runtime_ai');
      expect(fillMode.recipient).toBe('manual_static');
    });

    it('_fillMode defaults to manual_static for fields with no fillMode.default in schema', async () => {
      mockRegistryGet.mockReturnValue({
        inputSchema: {
          someField: {
            type: 'string',
            required: false,
            description: 'A field with no fillMode',
            // No fillMode property at all
          },
        },
        requiredInputs: [],
        defaultConfig: () => ({ someField: '' }),
      } as any);

      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('bare_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test',
        'test',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // No fillMode.default → falls back to 'manual_static'
      expect(fillMode.someField).toBe('manual_static');
    });

    it('every field in inputSchema has a corresponding entry in _fillMode', async () => {
      mockRegistryGet.mockReturnValue(MOCK_NODE_DEF_ALL_MODES as any);
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('email_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'send an email',
        'send an email',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      const expectedFields = Object.keys(MOCK_NODE_DEF_ALL_MODES.inputSchema);
      for (const fieldName of expectedFields) {
        expect(fillMode[fieldName]).toBeDefined();
      }
    });
  });

  // ── Test 4: existing _fillMode entries from prior stages are preserved ─────

  describe('_fillMode preservation from prior stages', () => {
    it('existing _fillMode entries written by a prior stage are not overwritten', async () => {
      const filler = new IntelligentConfigFiller();

      // Simulate a prior stage (e.g. property-population-stage) that already stamped
      // _fillMode.prompt = 'buildtime_ai_once'
      const workflow = makeWorkflow('test_node', {
        prompt: 'AI-generated prompt text',
        _fillMode: { prompt: 'buildtime_ai_once' },
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // Prior stage's entry must be preserved
      expect(fillMode.prompt).toBe('buildtime_ai_once');
    });

    it('a prior manual_static stamp is preserved (not overwritten by registry default)', async () => {
      // The user explicitly set prompt to manual_static via the UI toggle.
      // The filler must not overwrite this with the registry default (buildtime_ai_once).
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node', {
        prompt: 'User-typed prompt',
        _fillMode: { prompt: 'manual_static' },
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // User's manual_static must be preserved
      expect(fillMode.prompt).toBe('manual_static');
    });

    it('a prior runtime_ai stamp is preserved (not overwritten by registry default)', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node', {
        prompt: '',
        _fillMode: { prompt: 'runtime_ai' },
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // runtime_ai stamp from prior stage must be preserved
      expect(fillMode.prompt).toBe('runtime_ai');
    });

    it('only unstamped fields get the registry default; already-stamped fields are untouched', async () => {
      mockRegistryGet.mockReturnValue(MOCK_NODE_DEF_ALL_MODES as any);
      const filler = new IntelligentConfigFiller();

      // Prior stage stamped subject as buildtime_ai_once; body and recipient are unstamped
      const workflow = makeWorkflow('email_node', {
        subject: 'AI subject',
        _fillMode: { subject: 'buildtime_ai_once' },
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'send an email',
        'send an email',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // Prior stamp preserved
      expect(fillMode.subject).toBe('buildtime_ai_once');
      // Unstamped fields get registry defaults
      expect(fillMode.body).toBe('runtime_ai');
      expect(fillMode.recipient).toBe('manual_static');
    });

    it('_fillMode from prior stage is merged with new registry defaults (not replaced)', async () => {
      const filler = new IntelligentConfigFiller();

      // Prior stage only stamped 'prompt'; 'apiKey' is unstamped
      const workflow = makeWorkflow('test_node', {
        _fillMode: { prompt: 'buildtime_ai_once' },
      });

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;

      // Prior stamp preserved
      expect(fillMode.prompt).toBe('buildtime_ai_once');
      // New registry default added for unstamped field
      expect(fillMode.apiKey).toBe('manual_static');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('nodes with no registry definition are passed through unchanged (no _fieldModes added)', async () => {
      // When unifiedNodeRegistry.get returns null/undefined, the filler skips the node
      mockRegistryGet.mockReturnValue(undefined as any);

      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('unknown_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      // No registry def → node is passed through; _fieldModes must never be present
      expect(config._fieldModes).toBeUndefined();
    });

    it('nodes with type "custom" are skipped and have no _fieldModes', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = {
        nodes: [
          {
            id: 'node-1',
            type: 'custom',
            position: { x: 0, y: 0 },
            // data.type is also 'custom' — triggers the skip path
            data: { type: 'custom', label: 'Custom', config: {} },
          },
        ],
        edges: [],
      };

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      expect(config._fieldModes).toBeUndefined();
    });

    it('_fillMode is a plain object (not a class instance)', async () => {
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('test_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'test prompt',
        'test prompt',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      // Must be a plain object, not a Map, Set, or class instance
      expect(Object.getPrototypeOf(config._fillMode)).toBe(Object.prototype);
    });

    it('_fillMode values are valid FieldFillMode strings', async () => {
      mockRegistryGet.mockReturnValue(MOCK_NODE_DEF_ALL_MODES as any);
      const filler = new IntelligentConfigFiller();
      const workflow = makeWorkflow('email_node');

      const result = await filler.fillConfigurationsFromPrompt(
        workflow as any,
        'send an email',
        'send an email',
      );

      const config = (result.nodes[0] as any).data?.config ?? {};
      const fillMode = config._fillMode as Record<string, string>;
      const validModes = new Set(['manual_static', 'buildtime_ai_once', 'runtime_ai']);

      for (const [fieldName, mode] of Object.entries(fillMode)) {
        expect(validModes.has(mode)).toBe(true); // _fillMode.${fieldName} must be a valid FieldFillMode
      }
    });
  });
});
