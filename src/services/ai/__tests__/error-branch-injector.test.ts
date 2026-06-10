import { injectErrorBranch } from '../error-branch-injector';
import type { Workflow, WorkflowNode } from '../../../core/types/ai-types';

jest.mock('../../nodes/node-library', () => ({
  nodeLibrary: { getSchema: jest.fn().mockReturnValue(null) },
}));

jest.mock('../../../core/utils/unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeType: jest.fn().mockImplementation((node: any) => node?.type ?? ''),
  unifiedNormalizeNodeTypeString: jest.fn().mockImplementation((t: string) => t),
}));

jest.mock('../schema-driven-connection-resolver', () => ({
  resolveCompatibleHandles: jest.fn().mockReturnValue({ success: false }),
}));

function emptyWorkflow(): Workflow {
  return { nodes: [], edges: [] };
}

function makeNode(type: string, configOverrides: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: `node-${type}`,
    type,
    position: { x: 0, y: 0 },
    data: { type, label: type, category: 'test', config: configOverrides },
  };
}

describe('injectErrorBranch', () => {
  afterEach(() => jest.clearAllMocks());

  describe('when intent does not include error logging keywords', () => {
    it('returns injected: false when intent is undefined', () => {
      const result = injectErrorBranch(emptyWorkflow());
      expect(result.injected).toBe(false);
    });

    it('returns injected: false when intent has no error keywords', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'send email to user');
      expect(result.injected).toBe(false);
    });

    it('returns the original workflow unchanged when skipping injection', () => {
      const wf = emptyWorkflow();
      const result = injectErrorBranch(wf);
      expect(result.workflow.nodes).toHaveLength(0);
      expect(result.workflow.edges).toHaveLength(0);
    });
  });

  describe('when intent includes error logging keywords', () => {
    it('injects for "error handling"', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'add error handling');
      expect(result.injected).toBe(true);
    });

    it('injects for "error log"', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'error log every failure');
      expect(result.injected).toBe(true);
    });

    it('injects for "log error"', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'log error to console');
      expect(result.injected).toBe(true);
    });

    it('injects for "catch error"', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'catch error and notify');
      expect(result.injected).toBe(true);
    });

    it('injects for "handle error"', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'handle error gracefully');
      expect(result.injected).toBe(true);
    });

    it('adds exactly one error_trigger node and one log_output node', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'add error handling');
      const errorTriggers = result.workflow.nodes.filter(n => n.type === 'error_trigger');
      const logOutputs = result.workflow.nodes.filter(n => n.type === 'log_output');
      expect(errorTriggers).toHaveLength(1);
      expect(logOutputs).toHaveLength(1);
    });

    it('marks the injected log_output node with _autoInjected: true', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'add error handling');
      const log = result.workflow.nodes.find(n => n.type === 'log_output');
      expect((log?.data.config as any)._autoInjected).toBe(true);
    });

    it('adds an edge from error_trigger to log_output', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'add error handling');
      const errNode = result.workflow.nodes.find(n => n.type === 'error_trigger')!;
      const logNode = result.workflow.nodes.find(n => n.type === 'log_output')!;
      expect(result.workflow.edges).toHaveLength(1);
      expect(result.workflow.edges[0].source).toBe(errNode.id);
      expect(result.workflow.edges[0].target).toBe(logNode.id);
    });

    it('returns an empty warnings array', () => {
      const result = injectErrorBranch(emptyWorkflow(), 'add error handling');
      expect(result.warnings).toEqual([]);
    });

    it('does not mutate the original workflow nodes array', () => {
      const originalNodes: WorkflowNode[] = [];
      const wf: Workflow = { nodes: originalNodes, edges: [] };
      injectErrorBranch(wf, 'add error handling');
      expect(wf.nodes).toBe(originalNodes);
      expect(wf.nodes).toHaveLength(0);
    });
  });

  describe('when both error_trigger and auto-injected log_output already exist', () => {
    it('returns injected: false without re-injecting', () => {
      const errNode = makeNode('error_trigger');
      const logNode = makeNode('log_output', { _autoInjected: true });
      const wf: Workflow = { nodes: [errNode, logNode], edges: [] };
      const result = injectErrorBranch(wf, 'add error handling');
      expect(result.injected).toBe(false);
    });
  });

  describe('when only error_trigger exists (no auto-injected log)', () => {
    it('reuses existing error_trigger and adds log_output', () => {
      const errNode = makeNode('error_trigger');
      const wf: Workflow = { nodes: [errNode], edges: [] };
      const result = injectErrorBranch(wf, 'add error handling');
      expect(result.injected).toBe(true);
      const errorTriggers = result.workflow.nodes.filter(n => n.type === 'error_trigger');
      expect(errorTriggers).toHaveLength(1);
      expect(errorTriggers[0].id).toBe(errNode.id);
    });

    it('creates an edge from the existing error_trigger to the new log_output', () => {
      const errNode = makeNode('error_trigger');
      const wf: Workflow = { nodes: [errNode], edges: [] };
      const result = injectErrorBranch(wf, 'add error handling');
      expect(result.workflow.edges).toHaveLength(1);
      expect(result.workflow.edges[0].source).toBe(errNode.id);
    });
  });
});
