import {
  isTriggerNode,
  getTriggerNodes,
  removeDuplicateTriggers,
  validateTriggerCount,
  ensureSingleTrigger,
  getOrCreateSingleTrigger,
} from '../trigger-deduplicator';
import { WorkflowNode, WorkflowEdge } from '../../types/ai-types';

jest.mock('../universal-node-type-checker', () => ({
  isTriggerNode: (node: any) => node?.data?.category === 'triggers',
}));

function makeNode(id: string, category: string = 'action'): WorkflowNode {
  return {
    id,
    type: category === 'triggers' ? 'manual_trigger' : 'some_action',
    data: {
      label: id,
      type: category === 'triggers' ? 'manual_trigger' : 'some_action',
      category,
      config: {},
    },
  };
}

function makeEdge(id: string, source: string, target: string): WorkflowEdge {
  return { id, source, target };
}

describe('trigger-deduplicator', () => {
  describe('isTriggerNode', () => {
    test('returns true for a trigger node', () => {
      expect(isTriggerNode(makeNode('t1', 'triggers'))).toBe(true);
    });

    test('returns false for a non-trigger node', () => {
      expect(isTriggerNode(makeNode('a1', 'action'))).toBe(false);
    });
  });

  describe('getTriggerNodes', () => {
    test('returns only trigger nodes from a mixed list', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('a1', 'action'), makeNode('t2', 'triggers')];
      const result = getTriggerNodes(nodes);
      expect(result.map(n => n.id)).toEqual(['t1', 't2']);
    });

    test('returns empty array when no triggers exist', () => {
      expect(getTriggerNodes([makeNode('a1', 'action'), makeNode('a2', 'action')])).toEqual([]);
    });
  });

  describe('removeDuplicateTriggers', () => {
    test('single trigger passes through unchanged with empty removedTriggerIds', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('a1', 'action')];
      const edges = [makeEdge('e1', 't1', 'a1')];
      const result = removeDuplicateTriggers(nodes, edges);
      expect(result.removedTriggerIds).toEqual([]);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    test('removes duplicate trigger and drops edges originating from it', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('t2', 'triggers'), makeNode('a1', 'action')];
      const edges = [makeEdge('e1', 't1', 'a1'), makeEdge('e2', 't2', 'a1')];
      const result = removeDuplicateTriggers(nodes, edges);
      expect(result.removedTriggerIds).toEqual(['t2']);
      expect(result.nodes.map(n => n.id)).toEqual(['t1', 'a1']);
      expect(result.edges.map(e => e.id)).toEqual(['e1']);
    });

    test('redirects edge targeting removed trigger to the first trigger', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('t2', 'triggers'), makeNode('a1', 'action')];
      // e2 points TO t2 (duplicate) — should be redirected to t1
      const edges = [makeEdge('e1', 't1', 'a1'), makeEdge('e2', 'a1', 't2')];
      const result = removeDuplicateTriggers(nodes, edges);
      expect(result.removedTriggerIds).toEqual(['t2']);
      const redirected = result.edges.find(e => e.source === 'a1' && e.target === 't1');
      expect(redirected).toBeDefined();
    });
  });

  describe('validateTriggerCount', () => {
    test('valid=true with no error when exactly one trigger', () => {
      const result = validateTriggerCount([makeNode('t1', 'triggers'), makeNode('a1', 'action')]);
      expect(result.valid).toBe(true);
      expect(result.triggerCount).toBe(1);
      expect(result.error).toBeUndefined();
    });

    test('valid=false with error when zero triggers', () => {
      const result = validateTriggerCount([makeNode('a1', 'action')]);
      expect(result.valid).toBe(false);
      expect(result.triggerCount).toBe(0);
      expect(result.error).toContain('exactly one');
    });

    test('valid=false with count in error when two triggers', () => {
      const result = validateTriggerCount([makeNode('t1', 'triggers'), makeNode('t2', 'triggers')]);
      expect(result.valid).toBe(false);
      expect(result.triggerCount).toBe(2);
      expect(result.error).toContain('2');
    });
  });

  describe('ensureSingleTrigger', () => {
    test('inserts manual_trigger when no trigger exists', () => {
      const result = ensureSingleTrigger([makeNode('a1', 'action')], []);
      expect(result.added).toBe(true);
      expect(result.removed).toEqual([]);
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].type).toBe('manual_trigger');
    });

    test('returns unchanged when exactly one trigger exists', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('a1', 'action')];
      const edges = [makeEdge('e1', 't1', 'a1')];
      const result = ensureSingleTrigger(nodes, edges);
      expect(result.added).toBe(false);
      expect(result.removed).toEqual([]);
      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('getOrCreateSingleTrigger', () => {
    test('returns existing trigger with created=false when exactly one trigger', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('a1', 'action')];
      const result = getOrCreateSingleTrigger(nodes);
      expect(result.trigger.id).toBe('t1');
      expect(result.created).toBe(false);
      expect(result.removed).toEqual([]);
    });

    test('creates trigger with specified triggerType when none exist', () => {
      const nodes = [makeNode('a1', 'action')];
      const result = getOrCreateSingleTrigger(nodes, undefined, 'schedule_trigger');
      expect(result.created).toBe(true);
      expect(result.trigger.type).toBe('schedule_trigger');
      expect(result.nodes).toHaveLength(2);
    });

    test('performs node-only dedup when multiple triggers and no edges provided', () => {
      const nodes = [makeNode('t1', 'triggers'), makeNode('t2', 'triggers'), makeNode('a1', 'action')];
      const result = getOrCreateSingleTrigger(nodes);
      expect(result.created).toBe(false);
      expect(result.removed).toEqual(['t2']);
      expect(result.trigger.id).toBe('t1');
      expect(result.nodes.map((n: WorkflowNode) => n.id)).not.toContain('t2');
    });
  });
});
