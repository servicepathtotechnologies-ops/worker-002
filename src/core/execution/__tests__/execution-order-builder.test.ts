import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { WorkflowNode, WorkflowEdge } from '../../types/ai-types';

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../../utils/unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((t: string) => t),
}));

jest.mock('../../../services/ai/node-capability-registry-dsl', () => ({
  nodeCapabilityRegistryDSL: {
    isTransformation: jest.fn(() => false),
    isDataSource: jest.fn(() => false),
    isOutput: jest.fn(() => false),
  },
}));

import { executionOrderBuilder } from '../execution-order-builder';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../../services/ai/node-capability-registry-dsl';

const mockRegistry = unifiedNodeRegistry as jest.Mocked<typeof unifiedNodeRegistry>;
const mockDSL = nodeCapabilityRegistryDSL as jest.Mocked<typeof nodeCapabilityRegistryDSL>;

function makeNode(id: string, type: string): WorkflowNode {
  return { id, data: { type } } as WorkflowNode;
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target } as WorkflowEdge;
}

describe('ExecutionOrderBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistry.get.mockReturnValue({ category: 'action' } as any);
    mockDSL.isTransformation.mockReturnValue(false);
    mockDSL.isDataSource.mockReturnValue(false);
    mockDSL.isOutput.mockReturnValue(false);
  });

  describe('buildExecutionOrder', () => {
    it('returns error when no trigger node present', () => {
      const nodes = [makeNode('n1', 'google_gmail')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, []);
      expect(result.errors).toContain('No trigger node found in workflow');
      expect(result.orderedNodeIds).toEqual([]);
    });

    it('returns only trigger when workflow has one node', () => {
      const nodes = [makeNode('t1', 'manual_trigger')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, []);
      expect(result.errors).toHaveLength(0);
      expect(result.orderedNodeIds).toEqual(['t1']);
    });

    it('places trigger first for simple linear chain via edges', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'google_gmail')];
      const edges = [makeEdge('t1', 'a1')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.errors).toHaveLength(0);
      expect(result.orderedNodeIds[0]).toBe('t1');
      expect(result.orderedNodeIds).toContain('a1');
    });

    it('respects multi-node dependency order (trigger → A → B)', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'javascript'), makeNode('b1', 'google_gmail')];
      const edges = [makeEdge('t1', 'a1'), makeEdge('a1', 'b1')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.errors).toHaveLength(0);
      const order = result.orderedNodeIds;
      expect(order.indexOf('t1')).toBeLessThan(order.indexOf('a1'));
      expect(order.indexOf('a1')).toBeLessThan(order.indexOf('b1'));
    });

    it('builds dependency graph from edges (target depends on source)', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'slack_message')];
      const edges = [makeEdge('t1', 'a1')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.dependencyGraph.get('a1')).toContain('t1');
    });

    it('includes all nodes even when some have no edges', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('orphan', 'google_gmail')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, []);
      expect(result.orderedNodeIds).toContain('t1');
      expect(result.orderedNodeIds).toContain('orphan');
    });

    it('handles webhook as trigger', () => {
      const nodes = [makeNode('w1', 'webhook'), makeNode('a1', 'javascript')];
      const edges = [makeEdge('w1', 'a1')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.orderedNodeIds[0]).toBe('w1');
    });

    it('handles schedule as trigger', () => {
      const nodes = [makeNode('s1', 'schedule'), makeNode('a1', 'google_gmail')];
      const edges = [makeEdge('s1', 'a1')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.orderedNodeIds[0]).toBe('s1');
    });

    it('adds implicit dependency for transformation nodes on data sources', () => {
      mockDSL.isTransformation.mockImplementation((t) => t === 'javascript');
      mockDSL.isDataSource.mockImplementation((t) => t === 'google_sheets');
      const nodes = [
        makeNode('t1', 'manual_trigger'),
        makeNode('ds', 'google_sheets'),
        makeNode('tr', 'javascript'),
      ];
      const edges = [makeEdge('t1', 'ds'), makeEdge('t1', 'tr')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      // Transformation should depend on the data source
      const trDeps = result.dependencyGraph.get('tr') ?? [];
      expect(trDeps).toContain('ds');
    });

    it('adds implicit dependency for output nodes on transformations and data sources', () => {
      mockDSL.isTransformation.mockImplementation((t) => t === 'javascript');
      mockDSL.isOutput.mockImplementation((t) => t === 'google_gmail');
      const nodes = [
        makeNode('t1', 'manual_trigger'),
        makeNode('tr', 'javascript'),
        makeNode('out', 'google_gmail'),
      ];
      const edges = [makeEdge('t1', 'tr'), makeEdge('t1', 'out')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      const outDeps = result.dependencyGraph.get('out') ?? [];
      expect(outDeps).toContain('tr');
    });

    it('detects circular dependency and records an error', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a', 'javascript'), makeNode('b', 'google_gmail')];
      // a → b and b → a creates a cycle
      const edges = [makeEdge('t1', 'a'), makeEdge('a', 'b'), makeEdge('b', 'a')];
      const result = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      expect(result.errors.some((e) => e.includes('Circular dependency'))).toBe(true);
    });

    it('returns no errors for empty nodes list (no trigger → error)', () => {
      const result = executionOrderBuilder.buildExecutionOrder([], []);
      expect(result.errors).toContain('No trigger node found in workflow');
    });
  });

  describe('validateExecutionOrder', () => {
    it('returns valid for a correct linear order', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'google_gmail')];
      const edges = [makeEdge('t1', 'a1')];
      const order = executionOrderBuilder.buildExecutionOrder(nodes, edges);
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, edges);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('flags missing node in execution order', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'google_gmail')];
      const order = {
        orderedNodeIds: ['t1'], // a1 is missing
        dependencyGraph: new Map<string, string[]>(),
        errors: [],
        warnings: [],
      };
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, []);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('a1'))).toBe(true);
    });

    it('flags duplicate node IDs in execution order', () => {
      const nodes = [makeNode('t1', 'manual_trigger')];
      const order = {
        orderedNodeIds: ['t1', 't1'],
        dependencyGraph: new Map<string, string[]>(),
        errors: [],
        warnings: [],
      };
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, []);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('duplicate'))).toBe(true);
    });

    it('flags dependency violation when dependent executes before dependency', () => {
      const nodes = [makeNode('t1', 'manual_trigger'), makeNode('a1', 'google_gmail')];
      const depGraph = new Map<string, string[]>([['t1', ['a1']]]); // t1 depends on a1 but t1 is first
      const order = {
        orderedNodeIds: ['t1', 'a1'],
        dependencyGraph: depGraph,
        errors: [],
        warnings: [],
      };
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, []);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Dependency violation'))).toBe(true);
    });

    it('returns valid for single-node workflow (trigger only)', () => {
      const nodes = [makeNode('t1', 'manual_trigger')];
      const order = executionOrderBuilder.buildExecutionOrder(nodes, []);
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, []);
      expect(validation.valid).toBe(true);
    });

    it('merges order.errors into validation.errors', () => {
      const nodes = [makeNode('t1', 'manual_trigger')];
      const order = {
        orderedNodeIds: ['t1'],
        dependencyGraph: new Map<string, string[]>(),
        errors: ['pre-existing error'],
        warnings: [],
      };
      const validation = executionOrderBuilder.validateExecutionOrder(order, nodes, []);
      expect(validation.errors).toContain('pre-existing error');
    });
  });

  describe('singleton', () => {
    it('getInstance returns the same instance', () => {
      const { ExecutionOrderBuilder } = jest.requireActual('../execution-order-builder') as typeof import('../execution-order-builder');
      const a = ExecutionOrderBuilder.getInstance();
      const b = ExecutionOrderBuilder.getInstance();
      expect(a).toBe(b);
    });
  });
});
