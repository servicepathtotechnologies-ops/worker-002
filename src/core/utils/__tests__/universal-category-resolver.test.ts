import { UniversalCategoryResolver, universalCategoryResolver, type DSLCategory } from '../universal-category-resolver';

// Mock registry — inline jest.fn() to avoid TDZ
jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
}));

jest.mock('../../../services/ai/node-capability-registry-dsl', () => ({
  nodeCapabilityRegistryDSL: {
    isOutput: jest.fn(),
    isTransformation: jest.fn(),
    isDataSource: jest.fn(),
  },
}));

import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../../services/ai/node-capability-registry-dsl';

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockIsOutput = nodeCapabilityRegistryDSL.isOutput as jest.Mock;
const mockIsTransformation = nodeCapabilityRegistryDSL.isTransformation as jest.Mock;
const mockIsDataSource = nodeCapabilityRegistryDSL.isDataSource as jest.Mock;

function allCapFalse() {
  mockIsOutput.mockReturnValue(false);
  mockIsTransformation.mockReturnValue(false);
  mockIsDataSource.mockReturnValue(false);
}

function makeNode(type: string, metadata: Record<string, unknown> = {}, config: Record<string, unknown> = {}) {
  return { type, data: { type, metadata, config } };
}

describe('UniversalCategoryResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allCapFalse();
    mockGet.mockReturnValue(null);
  });

  // 1. Singleton
  it('getInstance returns the same instance each call', () => {
    const a = UniversalCategoryResolver.getInstance();
    const b = UniversalCategoryResolver.getInstance();
    expect(a).toBe(b);
  });

  it('exported universalCategoryResolver is the singleton', () => {
    expect(universalCategoryResolver).toBe(UniversalCategoryResolver.getInstance());
  });

  // 2. getNodeCategoryWithContext — Priority 1: aiDeterminedCategory
  it('Priority 1: respects aiDeterminedCategory from node metadata', () => {
    const node = makeNode('gmail', { aiDeterminedCategory: 'output' });
    const result = universalCategoryResolver.getNodeCategoryWithContext(node as any);
    expect(result).toBe('output');
    // capability registry should not be consulted
    expect(mockIsOutput).not.toHaveBeenCalled();
  });

  it('Priority 1: aiDeterminedCategory dataSource is returned directly', () => {
    const node = makeNode('some_node', { aiDeterminedCategory: 'dataSource' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('dataSource');
  });

  // 3–4. Priority 2: intendedCapability
  it('Priority 2: intendedCapability=data_source → dataSource', () => {
    const node = makeNode('my_node', { intendedCapability: 'data_source' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('dataSource');
  });

  it('Priority 2: intendedCapability=datasource (alias) → dataSource', () => {
    const node = makeNode('my_node', { intendedCapability: 'datasource' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('dataSource');
  });

  it('Priority 2: intendedCapability=transformation → transformation', () => {
    const node = makeNode('my_node', { intendedCapability: 'transformation' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('transformation');
  });

  it('Priority 2: intendedCapability=output → output', () => {
    const node = makeNode('my_node', { intendedCapability: 'output' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('output');
  });

  // 5–6. Priority 3: operation-aware (requires nodeDef to exist)
  it('Priority 3: operation=read + nodeDef exists → dataSource', () => {
    mockGet.mockReturnValue({ category: 'data', name: 'gmail' });
    const node = makeNode('gmail', {}, { operation: 'read' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('dataSource');
  });

  it('Priority 3: operation=list + nodeDef exists → dataSource', () => {
    mockGet.mockReturnValue({ category: 'data', name: 'sheets' });
    const node = makeNode('sheets', {}, { operation: 'list' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('dataSource');
  });

  it('Priority 3: operation=send + nodeDef exists → output', () => {
    mockGet.mockReturnValue({ category: 'communication', name: 'gmail' });
    const node = makeNode('gmail', {}, { operation: 'send' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('output');
  });

  it('Priority 3: operation=create + nodeDef exists → output', () => {
    mockGet.mockReturnValue({ category: 'data', name: 'sheets' });
    const node = makeNode('sheets', {}, { operation: 'create' });
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('output');
  });

  // 7. Falls through to getNodeCategory when no metadata/operation hints
  it('falls through to getNodeCategory when no metadata hints', () => {
    // capability DSL says isOutput → should return output via getNodeCategory
    mockIsOutput.mockReturnValue(true);
    const node = makeNode('slack');
    expect(universalCategoryResolver.getNodeCategoryWithContext(node as any)).toBe('output');
  });

  // 8–9. getNodeCategory: Step 1 — capability registry
  it('Step 1: capability registry isOutput → output', () => {
    mockIsOutput.mockReturnValue(true);
    expect(universalCategoryResolver.getNodeCategory('slack')).toBe('output');
  });

  it('Step 1: capability registry isTransformation → transformation (isOutput false)', () => {
    mockIsOutput.mockReturnValue(false);
    mockIsTransformation.mockReturnValue(true);
    expect(universalCategoryResolver.getNodeCategory('ai_transform')).toBe('transformation');
  });

  it('Step 1: capability registry isDataSource → dataSource (others false)', () => {
    mockIsOutput.mockReturnValue(false);
    mockIsTransformation.mockReturnValue(false);
    mockIsDataSource.mockReturnValue(true);
    expect(universalCategoryResolver.getNodeCategory('google_sheets')).toBe('dataSource');
  });

  // 10–11. Step 2: registry category property
  it('Step 2: registry category=communication → output', () => {
    mockGet.mockReturnValue({ category: 'communication', tags: [] });
    expect(universalCategoryResolver.getNodeCategory('some_node')).toBe('output');
  });

  it('Step 2: registry category=trigger → dataSource', () => {
    mockGet.mockReturnValue({ category: 'trigger', tags: [] });
    expect(universalCategoryResolver.getNodeCategory('some_node')).toBe('dataSource');
  });

  it('Step 2: registry category=ai → transformation', () => {
    mockGet.mockReturnValue({ category: 'ai', tags: [] });
    expect(universalCategoryResolver.getNodeCategory('some_node')).toBe('transformation');
  });

  // 12–13. Step 3: semantic analysis
  it('Step 3: node type containing _trigger → dataSource', () => {
    expect(universalCategoryResolver.getNodeCategory('schedule_trigger')).toBe('dataSource');
  });

  it('Step 3: node type containing _output → output', () => {
    expect(universalCategoryResolver.getNodeCategory('log_output')).toBe('output');
  });

  it('Step 3: node type containing _transform → transformation', () => {
    expect(universalCategoryResolver.getNodeCategory('data_transform')).toBe('transformation');
  });

  it('Step 3: node type containing gmail → output (output pattern)', () => {
    expect(universalCategoryResolver.getNodeCategory('gmail')).toBe('output');
  });

  // 14. Step 5: default fallback
  it('Step 5: unknown node type defaults to transformation', () => {
    expect(universalCategoryResolver.getNodeCategory('totally_unknown_xyz_node')).toBe('transformation');
  });

  // 15. Boolean helpers
  it('isDataSource returns true when category resolves to dataSource', () => {
    mockGet.mockReturnValue({ category: 'trigger', tags: [] });
    expect(universalCategoryResolver.isDataSource('webhook_trigger')).toBe(true);
    expect(universalCategoryResolver.isTransformation('webhook_trigger')).toBe(false);
    expect(universalCategoryResolver.isOutput('webhook_trigger')).toBe(false);
  });

  it('isOutput returns true when category resolves to output', () => {
    mockIsOutput.mockReturnValue(true);
    expect(universalCategoryResolver.isOutput('slack')).toBe(true);
    expect(universalCategoryResolver.isDataSource('slack')).toBe(false);
    expect(universalCategoryResolver.isTransformation('slack')).toBe(false);
  });
});
