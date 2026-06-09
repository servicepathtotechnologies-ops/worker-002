// Mock dependencies before import — inline jest.fn() to avoid TDZ
jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
  unifiedNormalizeNodeType: jest.fn((node: any) =>
    typeof node === 'string' ? node : node?.type || node?.data?.type || ''
  ),
}));

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../../../services/ai/node-capability-registry-dsl', () => ({
  nodeCapabilityRegistryDSL: {
    isDataSource: jest.fn(),
    canReadData: jest.fn(),
    isOutput: jest.fn(),
    canWriteData: jest.fn(),
    isTransformation: jest.fn(),
  },
}));

import {
  isTriggerNode,
  isDataSourceNode,
  isOutputNode,
  isTerminalSinkNode,
  hasPrimaryDataRole,
  isThroughputSendNode,
  isTransformationNode,
  isLogicNode,
  getNodeCategory,
  isAIChatNode,
} from '../universal-node-type-checker';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString, unifiedNormalizeNodeType } from '../unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from '../../../services/ai/node-capability-registry-dsl';

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockNormalizeStr = unifiedNormalizeNodeTypeString as jest.Mock;
const mockNormalizeNode = unifiedNormalizeNodeType as jest.Mock;
const mockDSL = nodeCapabilityRegistryDSL as jest.Mocked<typeof nodeCapabilityRegistryDSL>;

function nodeDef(overrides: Record<string, unknown> = {}) {
  return { category: 'utility', tags: [], workflowBehavior: {}, ...overrides };
}

describe('universal-node-type-checker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeStr.mockImplementation((s: string) => s);
    mockNormalizeNode.mockImplementation((node: any) =>
      typeof node === 'string' ? node : node?.type || node?.data?.type || ''
    );
    mockGet.mockReturnValue(null);
    mockDSL.isDataSource.mockReturnValue(false);
    mockDSL.canReadData.mockReturnValue(false);
    mockDSL.isOutput.mockReturnValue(false);
    mockDSL.canWriteData.mockReturnValue(false);
    mockDSL.isTransformation.mockReturnValue(false);
  });

  // ─── isTriggerNode ────────────────────────────────────────────────────────

  describe('isTriggerNode', () => {
    it('returns true when registry category is trigger', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'trigger' }));
      expect(isTriggerNode('some_trigger')).toBe(true);
    });

    it('returns true via node.data.category fallback when registry misses', () => {
      mockGet.mockReturnValue(null);
      const node = { type: 'custom_trigger', data: { category: 'trigger' } } as any;
      expect(isTriggerNode(node)).toBe(true);
    });

    it('returns true for hardcoded trigger types when registry misses', () => {
      mockGet.mockReturnValue(null);
      expect(isTriggerNode('manual_trigger')).toBe(true);
      expect(isTriggerNode('webhook')).toBe(true);
      expect(isTriggerNode('schedule')).toBe(true);
    });

    it('returns false when registry misses and type not in hardcoded list', () => {
      mockGet.mockReturnValue(null);
      expect(isTriggerNode('gmail')).toBe(false);
    });
  });

  // ─── isDataSourceNode ─────────────────────────────────────────────────────

  describe('isDataSourceNode', () => {
    it('returns false for trigger types regardless of registry', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'data' }));
      expect(isDataSourceNode('webhook')).toBe(false);
      expect(isDataSourceNode('schedule')).toBe(false);
    });

    it('returns true when capability DSL marks node as data source', () => {
      mockDSL.isDataSource.mockReturnValue(true);
      expect(isDataSourceNode('google_sheets')).toBe(true);
    });

    it('returns true when capability DSL marks node as canReadData', () => {
      mockDSL.canReadData.mockReturnValue(true);
      expect(isDataSourceNode('postgres')).toBe(true);
    });

    it('returns true when registry category is data', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'data' }));
      expect(isDataSourceNode('airtable')).toBe(true);
    });

    it('returns false when nothing matches', () => {
      expect(isDataSourceNode('unknown_node')).toBe(false);
    });
  });

  // ─── isOutputNode ─────────────────────────────────────────────────────────

  describe('isOutputNode', () => {
    it('returns true when capability DSL marks node as output', () => {
      mockDSL.isOutput.mockReturnValue(true);
      expect(isOutputNode('gmail')).toBe(true);
    });

    it('returns true when capability DSL marks node as canWriteData', () => {
      mockDSL.canWriteData.mockReturnValue(true);
      expect(isOutputNode('google_sheets')).toBe(true);
    });

    it('returns true when registry workflowBehavior.alwaysTerminal is true', () => {
      mockGet.mockReturnValue(nodeDef({ workflowBehavior: { alwaysTerminal: true } }));
      expect(isOutputNode('log_output')).toBe(true);
    });

    it('returns true when registry category is communication', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'communication' }));
      expect(isOutputNode('slack')).toBe(true);
    });

    it('returns false when nothing matches', () => {
      expect(isOutputNode('unknown_node')).toBe(false);
    });
  });

  // ─── isTerminalSinkNode ───────────────────────────────────────────────────

  describe('isTerminalSinkNode', () => {
    it('returns true when workflowBehavior.alwaysTerminal is true', () => {
      mockGet.mockReturnValue(nodeDef({ workflowBehavior: { alwaysTerminal: true } }));
      expect(isTerminalSinkNode('log_output')).toBe(true);
    });

    it('returns true when node tags include terminal', () => {
      mockGet.mockReturnValue(nodeDef({ tags: ['terminal'] }));
      expect(isTerminalSinkNode('terminal_sink')).toBe(true);
    });

    it('returns false when neither alwaysTerminal nor terminal tag present', () => {
      mockGet.mockReturnValue(nodeDef({ tags: ['utility'], workflowBehavior: { alwaysTerminal: false } }));
      expect(isTerminalSinkNode('gmail')).toBe(false);
    });
  });

  // ─── hasPrimaryDataRole ───────────────────────────────────────────────────

  describe('hasPrimaryDataRole', () => {
    it('returns false when node is a terminal sink', () => {
      mockGet.mockReturnValue(nodeDef({ workflowBehavior: { alwaysTerminal: true } }));
      expect(hasPrimaryDataRole('log_output')).toBe(false);
    });

    it('returns true when registry category is data', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'data' }));
      expect(hasPrimaryDataRole('google_sheets')).toBe(true);
    });

    it('returns true via isDataSourceNode when DSL marks node as data source', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'utility' }));
      mockDSL.isDataSource.mockReturnValue(true);
      expect(hasPrimaryDataRole('custom_data')).toBe(true);
    });
  });

  // ─── isThroughputSendNode ─────────────────────────────────────────────────

  describe('isThroughputSendNode', () => {
    it('returns false when node is terminal sink', () => {
      mockGet.mockReturnValue(nodeDef({ workflowBehavior: { alwaysTerminal: true } }));
      expect(isThroughputSendNode('log_output')).toBe(false);
    });

    it('returns false when node has primary data role', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'data' }));
      expect(isThroughputSendNode('google_sheets')).toBe(false);
    });

    it('returns true when registry category is communication', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'communication' }));
      expect(isThroughputSendNode('slack')).toBe(true);
    });
  });

  // ─── isTransformationNode ─────────────────────────────────────────────────

  describe('isTransformationNode', () => {
    it('returns true when capability DSL marks node as transformation', () => {
      mockDSL.isTransformation.mockReturnValue(true);
      expect(isTransformationNode('data_mapper')).toBe(true);
    });

    it('returns true when registry category is transformation', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'transformation' }));
      expect(isTransformationNode('json_transform')).toBe(true);
    });

    it('returns true when registry category is ai', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'ai' }));
      expect(isTransformationNode('openai_gpt')).toBe(true);
    });

    it('returns true via node.data.category fallback', () => {
      mockGet.mockReturnValue(null);
      const node = { type: 'custom', data: { category: 'logic' } } as any;
      expect(isTransformationNode(node)).toBe(true);
    });

    it('returns false when nothing matches', () => {
      expect(isTransformationNode('unknown')).toBe(false);
    });
  });

  // ─── isLogicNode ──────────────────────────────────────────────────────────

  describe('isLogicNode', () => {
    it('returns true when registry category is logic', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'logic' }));
      expect(isLogicNode('custom_logic')).toBe(true);
    });

    it('returns true for hardcoded logic types when registry misses', () => {
      mockGet.mockReturnValue(null);
      expect(isLogicNode('if_else')).toBe(true);
      expect(isLogicNode('switch')).toBe(true);
      expect(isLogicNode('merge')).toBe(true);
    });

    it('returns false when registry misses and type not in hardcoded list', () => {
      mockGet.mockReturnValue(null);
      expect(isLogicNode('gmail')).toBe(false);
    });
  });

  // ─── getNodeCategory ──────────────────────────────────────────────────────

  describe('getNodeCategory', () => {
    it('returns category from registry when present', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'data' }));
      expect(getNodeCategory('google_sheets')).toBe('data');
    });

    it('returns node.data.category when registry has no entry', () => {
      mockGet.mockReturnValue(null);
      const node = { type: 'custom', data: { category: 'communication' } } as any;
      expect(getNodeCategory(node)).toBe('communication');
    });

    it('returns null when neither registry nor node.data has a category', () => {
      mockGet.mockReturnValue(null);
      expect(getNodeCategory('unknown')).toBeNull();
    });
  });

  // ─── isAIChatNode ─────────────────────────────────────────────────────────

  describe('isAIChatNode', () => {
    it('returns true when registry category is ai', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'ai' }));
      expect(isAIChatNode('openai_gpt')).toBe(true);
    });

    it('returns true via node.data.category fallback when registry misses', () => {
      mockGet.mockReturnValue(null);
      const node = { type: 'custom_ai', data: { category: 'ai' } } as any;
      expect(isAIChatNode(node)).toBe(true);
    });

    it('returns false when category is not ai', () => {
      mockGet.mockReturnValue(nodeDef({ category: 'communication' }));
      expect(isAIChatNode('slack')).toBe(false);
    });
  });
});
