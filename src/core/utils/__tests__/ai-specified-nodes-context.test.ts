import {
  createAISpecifiedNodesContext,
  isNodeAISpecified,
  filterAISpecifiedNodes,
  hasAnyAISpecifiedNode,
  AISpecifiedNodesContext,
} from '../ai-specified-nodes-context';

jest.mock('../../../services/ai/intent-constraint-engine', () => ({
  IntentConstraintEngine: {
    getRequiredNodes: jest.fn(),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
}));

jest.mock('../node-type-resolver-util', () => ({
  resolveNodeType: jest.fn((s: string, _flag: boolean) => s),
}));

import { IntentConstraintEngine } from '../../../services/ai/intent-constraint-engine';
import { unifiedNormalizeNodeTypeString } from '../unified-node-type-normalizer';
import { resolveNodeType } from '../node-type-resolver-util';

const mockGetRequiredNodes = IntentConstraintEngine.getRequiredNodes as jest.Mock;
const mockNormalize = unifiedNormalizeNodeTypeString as jest.Mock;
const mockResolve = resolveNodeType as jest.Mock;

const makeIntent = () => ({
  trigger: 'manual',
  actions: [],
  requires_credentials: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default pass-through behaviour
  mockNormalize.mockImplementation((s: string) => s);
  mockResolve.mockImplementation((s: string) => s);
});

// ─── createAISpecifiedNodesContext ────────────────────────────────────────────

describe('createAISpecifiedNodesContext', () => {
  it('returns empty set when IntentConstraintEngine returns no nodes', () => {
    mockGetRequiredNodes.mockReturnValue([]);
    const ctx = createAISpecifiedNodesContext(makeIntent());
    expect(ctx.aiSpecifiedNodeTypes.size).toBe(0);
  });

  it('populates aiSpecifiedNodeTypes from engine result', () => {
    mockGetRequiredNodes.mockReturnValue(['google_gmail', 'slack']);
    const ctx = createAISpecifiedNodesContext(makeIntent());
    expect(ctx.aiSpecifiedNodeTypes.has('google_gmail')).toBe(true);
    expect(ctx.aiSpecifiedNodeTypes.has('slack')).toBe(true);
    expect(ctx.aiSpecifiedNodeTypes.size).toBe(2);
  });

  it('normalizes each node type via unifiedNormalizeNodeTypeString then resolveNodeType', () => {
    mockGetRequiredNodes.mockReturnValue(['Gmail']);
    mockNormalize.mockReturnValue('google_gmail');
    mockResolve.mockReturnValue('google_gmail_canonical');
    const ctx = createAISpecifiedNodesContext(makeIntent());
    expect(mockNormalize).toHaveBeenCalledWith('Gmail');
    expect(mockResolve).toHaveBeenCalledWith('google_gmail', false);
    expect(ctx.aiSpecifiedNodeTypes.has('google_gmail_canonical')).toBe(true);
  });

  it('stores originalPrompt when provided', () => {
    mockGetRequiredNodes.mockReturnValue([]);
    const ctx = createAISpecifiedNodesContext(makeIntent(), 'send email daily');
    expect(ctx.originalPrompt).toBe('send email daily');
  });

  it('leaves originalPrompt undefined when omitted', () => {
    mockGetRequiredNodes.mockReturnValue([]);
    const ctx = createAISpecifiedNodesContext(makeIntent());
    expect(ctx.originalPrompt).toBeUndefined();
  });

  it('passes originalPrompt to IntentConstraintEngine.getRequiredNodes', () => {
    mockGetRequiredNodes.mockReturnValue([]);
    const intent = makeIntent();
    createAISpecifiedNodesContext(intent, 'my prompt');
    expect(mockGetRequiredNodes).toHaveBeenCalledWith(intent, 'my prompt');
  });

  it('deduplicates node types that normalize to the same canonical form', () => {
    mockGetRequiredNodes.mockReturnValue(['Gmail', 'gmail']);
    mockNormalize.mockReturnValue('google_gmail');
    mockResolve.mockReturnValue('google_gmail');
    const ctx = createAISpecifiedNodesContext(makeIntent());
    expect(ctx.aiSpecifiedNodeTypes.size).toBe(1);
  });
});

// ─── isNodeAISpecified ────────────────────────────────────────────────────────

describe('isNodeAISpecified', () => {
  const makeCtx = (types: string[]): AISpecifiedNodesContext => ({
    aiSpecifiedNodeTypes: new Set(types),
  });

  it('returns true when node is present in context', () => {
    const ctx = makeCtx(['google_gmail']);
    expect(isNodeAISpecified(ctx, 'google_gmail')).toBe(true);
  });

  it('returns false when node is absent from context', () => {
    const ctx = makeCtx(['google_gmail']);
    expect(isNodeAISpecified(ctx, 'slack')).toBe(false);
  });

  it('normalizes nodeType before checking (normalize + resolve)', () => {
    mockNormalize.mockReturnValue('google_gmail');
    mockResolve.mockReturnValue('google_gmail_canonical');
    const ctx = makeCtx(['google_gmail_canonical']);
    expect(isNodeAISpecified(ctx, 'Gmail')).toBe(true);
    expect(mockNormalize).toHaveBeenCalledWith('Gmail');
    expect(mockResolve).toHaveBeenCalledWith('google_gmail', false);
  });

  it('returns false for empty context', () => {
    const ctx = makeCtx([]);
    expect(isNodeAISpecified(ctx, 'slack')).toBe(false);
  });
});

// ─── filterAISpecifiedNodes ───────────────────────────────────────────────────

describe('filterAISpecifiedNodes', () => {
  const makeCtx = (types: string[]): AISpecifiedNodesContext => ({
    aiSpecifiedNodeTypes: new Set(types),
  });

  it('filters out nodes already specified by AI', () => {
    const ctx = makeCtx(['google_gmail', 'slack']);
    const result = filterAISpecifiedNodes(ctx, ['google_gmail', 'slack', 'notion']);
    expect(result).toEqual(['notion']);
  });

  it('returns all nodes when none are AI-specified', () => {
    const ctx = makeCtx([]);
    const result = filterAISpecifiedNodes(ctx, ['slack', 'notion']);
    expect(result).toEqual(['slack', 'notion']);
  });

  it('returns empty array when all nodes are AI-specified', () => {
    const ctx = makeCtx(['slack', 'notion']);
    const result = filterAISpecifiedNodes(ctx, ['slack', 'notion']);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    const ctx = makeCtx(['slack']);
    expect(filterAISpecifiedNodes(ctx, [])).toEqual([]);
  });
});

// ─── hasAnyAISpecifiedNode ────────────────────────────────────────────────────

describe('hasAnyAISpecifiedNode', () => {
  const makeCtx = (types: string[]): AISpecifiedNodesContext => ({
    aiSpecifiedNodeTypes: new Set(types),
  });

  it('returns true when at least one node is AI-specified', () => {
    const ctx = makeCtx(['google_gmail']);
    expect(hasAnyAISpecifiedNode(ctx, ['slack', 'google_gmail'])).toBe(true);
  });

  it('returns false when no nodes are AI-specified', () => {
    const ctx = makeCtx(['google_gmail']);
    expect(hasAnyAISpecifiedNode(ctx, ['slack', 'notion'])).toBe(false);
  });

  it('returns false for empty node array', () => {
    const ctx = makeCtx(['google_gmail']);
    expect(hasAnyAISpecifiedNode(ctx, [])).toBe(false);
  });

  it('returns false for empty context', () => {
    const ctx = makeCtx([]);
    expect(hasAnyAISpecifiedNode(ctx, ['slack', 'notion'])).toBe(false);
  });
});
