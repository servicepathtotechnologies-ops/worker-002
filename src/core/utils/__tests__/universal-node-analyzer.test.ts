import {
  getNodeCategory,
  isBranchingNode,
  isOutputNode,
  isDataSourceNode,
  isTransformationNode,
  getNodeExecutionPriority,
  shouldFieldBeAIMode,
  isSpecialNodeType,
  getBranchingNodeTypes,
} from '../universal-node-analyzer';

// ── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    getAllTypes: jest.fn(),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeType: jest.fn(),
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
}));

import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import {
  unifiedNormalizeNodeType,
  unifiedNormalizeNodeTypeString,
} from '../unified-node-type-normalizer';

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockGetAllTypes = unifiedNodeRegistry.getAllTypes as jest.Mock;
const mockNormalizeStr = unifiedNormalizeNodeTypeString as jest.Mock;
const mockNormalize = unifiedNormalizeNodeType as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockNormalizeStr.mockImplementation((s: string) => s);
  mockNormalize.mockImplementation((node: any) =>
    typeof node === 'string' ? node : node.type ?? ''
  );
});

// ── getNodeCategory ───────────────────────────────────────────────────────────

describe('getNodeCategory', () => {
  it('returns the category when node exists in registry', () => {
    mockGet.mockReturnValue({ category: 'ai' });
    expect(getNodeCategory('google_gemini')).toBe('ai');
  });

  it('returns null when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(getNodeCategory('unknown_node')).toBeNull();
  });

  it('returns null when nodeDef has no category', () => {
    mockGet.mockReturnValue({});
    expect(getNodeCategory('bare_node')).toBeNull();
  });
});

// ── isBranchingNode ───────────────────────────────────────────────────────────

describe('isBranchingNode', () => {
  it('returns true for a branching node (string)', () => {
    mockGet.mockReturnValue({ isBranching: true });
    expect(isBranchingNode('if_else')).toBe(true);
  });

  it('returns false for a non-branching node (string)', () => {
    mockGet.mockReturnValue({ isBranching: false });
    expect(isBranchingNode('google_gemini')).toBe(false);
  });

  it('returns false when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(isBranchingNode('unknown')).toBe(false);
  });

  it('accepts a WorkflowNode object and resolves type via unifiedNormalizeNodeType', () => {
    mockNormalize.mockReturnValue('switch_case');
    mockGet.mockReturnValue({ isBranching: true });
    const node = { type: 'switch_case', id: 'n1', data: {}, position: { x: 0, y: 0 } } as any;
    expect(isBranchingNode(node)).toBe(true);
    expect(mockNormalize).toHaveBeenCalledWith(node);
  });
});

// ── isOutputNode ──────────────────────────────────────────────────────────────

describe('isOutputNode', () => {
  it('returns true when category is communication and tag includes output keyword', () => {
    mockGet.mockReturnValue({ category: 'communication', tags: ['send', 'email'] });
    expect(isOutputNode('gmail_send')).toBe(true);
  });

  it('returns true when type name includes "email"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isOutputNode('send_email')).toBe(true);
  });

  it('returns true when type name includes "slack"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isOutputNode('slack_message')).toBe(true);
  });

  it('returns true when type name includes "log"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isOutputNode('log_event')).toBe(true);
  });

  it('returns true when type name includes "output"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isOutputNode('output_node')).toBe(true);
  });

  it('returns false when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(isOutputNode('nonexistent')).toBe(false);
  });

  it('returns false when category and type name have no output indicators', () => {
    mockGet.mockReturnValue({ category: 'ai', tags: ['generate'] });
    mockNormalizeStr.mockReturnValue('google_gemini');
    expect(isOutputNode('google_gemini')).toBe(false);
  });
});

// ── isDataSourceNode ──────────────────────────────────────────────────────────

describe('isDataSourceNode', () => {
  it('returns true when category is data and tag includes fetch', () => {
    mockGet.mockReturnValue({ category: 'data', tags: ['fetch', 'records'] });
    expect(isDataSourceNode('airtable_list')).toBe(true);
  });

  it('returns true when type name includes "sheets"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isDataSourceNode('google_sheets')).toBe(true);
  });

  it('returns true when type name includes "http_request"', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    expect(isDataSourceNode('http_request')).toBe(true);
  });

  it('returns false when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(isDataSourceNode('nonexistent')).toBe(false);
  });
});

// ── isTransformationNode ──────────────────────────────────────────────────────

describe('isTransformationNode', () => {
  it('returns true when category is ai', () => {
    mockGet.mockReturnValue({ category: 'ai', tags: [] });
    expect(isTransformationNode('google_gemini')).toBe(true);
  });

  it('returns true when category is transformation', () => {
    mockGet.mockReturnValue({ category: 'transformation', tags: [] });
    expect(isTransformationNode('data_mapper')).toBe(true);
  });

  it('returns true when category is logic', () => {
    mockGet.mockReturnValue({ category: 'logic', tags: [] });
    expect(isTransformationNode('if_else')).toBe(true);
  });

  it('returns true when category is utility', () => {
    mockGet.mockReturnValue({ category: 'utility', tags: [] });
    expect(isTransformationNode('set_variable')).toBe(true);
  });

  it('returns true when tags include a transformation keyword', () => {
    mockGet.mockReturnValue({ category: 'other', tags: ['transform', 'json'] });
    expect(isTransformationNode('json_transformer')).toBe(true);
  });

  it('returns false when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(isTransformationNode('nonexistent')).toBe(false);
  });
});

// ── getNodeExecutionPriority ──────────────────────────────────────────────────

describe('getNodeExecutionPriority', () => {
  it('returns 1 for a data source node', () => {
    // trigger category + read tag → isDataSourceNode=true
    mockGet.mockReturnValue({ category: 'trigger', tags: ['read'] });
    mockNormalizeStr.mockReturnValue('webhook');
    expect(getNodeExecutionPriority('webhook')).toBe(1);
  });

  it('returns 2 for a transformation node', () => {
    mockGet.mockReturnValue({ category: 'ai', tags: [] });
    expect(getNodeExecutionPriority('google_gemini')).toBe(2);
  });

  it('returns 3 for an output node', () => {
    mockGet.mockReturnValue({ category: 'other', tags: [] });
    mockNormalizeStr.mockReturnValue('log_output');
    expect(getNodeExecutionPriority('log_output')).toBe(3);
  });

  it('returns 2 (default) when node matches none of the categories', () => {
    mockGet.mockReturnValue({ category: 'unknown_cat', tags: [] });
    mockNormalizeStr.mockReturnValue('mystery_node');
    expect(getNodeExecutionPriority('mystery_node')).toBe(2);
  });
});

// ── shouldFieldBeAIMode ───────────────────────────────────────────────────────

describe('shouldFieldBeAIMode', () => {
  it('returns true for an AI-mode field with string type', () => {
    mockGet.mockReturnValue({ inputSchema: { message: { type: 'string' } } });
    expect(shouldFieldBeAIMode('slack_send', 'message')).toBe(true);
  });

  it('returns true for an AI-mode field with json type', () => {
    mockGet.mockReturnValue({ inputSchema: { body: { type: 'json' } } });
    expect(shouldFieldBeAIMode('http_request', 'body')).toBe(true);
  });

  it('returns false when field is not in the AI-mode list', () => {
    mockGet.mockReturnValue({ inputSchema: { limit: { type: 'number' } } });
    expect(shouldFieldBeAIMode('some_node', 'limit')).toBe(false);
  });

  it('returns false when node is not in registry', () => {
    mockGet.mockReturnValue(undefined);
    expect(shouldFieldBeAIMode('unknown_node', 'message')).toBe(false);
  });

  it('returns false when field schema is missing', () => {
    mockGet.mockReturnValue({ inputSchema: {} });
    expect(shouldFieldBeAIMode('some_node', 'headers')).toBe(false);
  });
});

// ── isSpecialNodeType ─────────────────────────────────────────────────────────

describe('isSpecialNodeType', () => {
  it('returns isCategory=true for a known category name', () => {
    const result = isSpecialNodeType('website');
    expect(result.isInvalid).toBe(true);
    expect(result.isCategory).toBe(true);
    expect(result.reason).toMatch(/category/i);
  });

  it('returns isCategory=true for "database" category name', () => {
    const result = isSpecialNodeType('database');
    expect(result.isInvalid).toBe(true);
    expect(result.isCategory).toBe(true);
  });

  it('returns isInvalid=true when type not found in registry', () => {
    mockGet.mockReturnValue(undefined);
    const result = isSpecialNodeType('totally_unknown');
    expect(result.isInvalid).toBe(true);
    expect(result.isCategory).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('returns isInvalid=false for a valid registered node', () => {
    mockGet.mockReturnValue({ category: 'ai' });
    const result = isSpecialNodeType('google_gemini');
    expect(result.isInvalid).toBe(false);
    expect(result.isCategory).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

// ── getBranchingNodeTypes ─────────────────────────────────────────────────────

describe('getBranchingNodeTypes', () => {
  it('returns only the branching node types', () => {
    mockGetAllTypes.mockReturnValue(['google_gemini', 'if_else', 'switch_case']);
    mockGet.mockImplementation((type: string) => {
      if (type === 'if_else') return { isBranching: true };
      if (type === 'switch_case') return { isBranching: true };
      return { isBranching: false };
    });
    const result = getBranchingNodeTypes();
    expect(result).toEqual(['if_else', 'switch_case']);
  });

  it('returns an empty array when no nodes are branching', () => {
    mockGetAllTypes.mockReturnValue(['google_gemini', 'slack_send']);
    mockGet.mockReturnValue({ isBranching: false });
    expect(getBranchingNodeTypes()).toEqual([]);
  });

  it('returns empty array when registry has no types', () => {
    mockGetAllTypes.mockReturnValue([]);
    expect(getBranchingNodeTypes()).toEqual([]);
  });
});
