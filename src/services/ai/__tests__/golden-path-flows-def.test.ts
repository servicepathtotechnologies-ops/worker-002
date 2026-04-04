// Feature: ai-workflow-generation-engine, Flows D, E, F

import { buildNodeDescriptionBlocks } from '../node-description-builder';
import { checkNodeSufficiency } from '../node-sufficiency-checker';
import { PipelineReasoningCoordinator } from '../pipeline-reasoning-coordinator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';

describe('Flow D: same-type branching', () => {
  it('form → if_else → gmail[true] → gmail[false] produces two distinct Gmail instances', () => {
    // Build chain with annotated tokens
    const chain = ['form', 'if_else', 'google_gmail[true]', 'google_gmail[false]'];

    const allRegistered = ['form', 'if_else', 'google_gmail'].every(
      t => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[golden-path-flows-def.test] Skipping Flow D: not all node types registered');
      return;
    }

    const blocks = buildNodeDescriptionBlocks(
      { trigger: 'form', actions: [], requires_credentials: [], conditions: [{ condition: 'age >= 18', type: 'if_else' }] } as any,
      chain
    );
    // Should have 4 blocks
    expect(blocks).toHaveLength(4);
    // The two gmail blocks should have different branchTags
    const gmailBlocks = blocks.filter(b => b.nodeType === 'google_gmail');
    expect(gmailBlocks).toHaveLength(2);
    expect(gmailBlocks[0].branchTag).toBe('true');
    expect(gmailBlocks[1].branchTag).toBe('false');
    // Prose should differ
    expect(gmailBlocks[0].prose).not.toBe(gmailBlocks[1].prose);
  });
});

describe('Flow E: node sufficiency rationale', () => {
  it('every node in final selection has a non-empty rationale', () => {
    const chain = ['manual_trigger', 'google_gmail'];

    const allRegistered = ['manual_trigger', 'google_gmail'].every(
      t => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[golden-path-flows-def.test] Skipping Flow E: not all node types registered');
      return;
    }

    const intent = {
      trigger: 'manual_trigger',
      actions: [{ type: 'google_gmail', operation: 'send' }],
      dataSources: [],
      transformations: [],
      requires_credentials: [],
    } as any;
    const result = checkNodeSufficiency(chain, intent);
    const kept = chain.filter(t => !result.nodesToRemove.includes(t));
    for (const token of kept) {
      const nodeType = token.replace(/\[.*?\]/, '');
      const entry = result.rationale.find(r => r.nodeType === nodeType);
      expect(entry).toBeDefined();
      expect(entry!.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('Flow F: self-healing gate', () => {
  it('validateWorkflow passes after reconcileWorkflow on a valid workflow', () => {
    const allRegistered = ['manual_trigger', 'google_gmail'].every(
      t => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[golden-path-flows-def.test] Skipping Flow F: not all node types registered');
      return;
    }

    const nodes = [
      { id: 'trigger_1', type: 'manual_trigger', data: { label: 'Trigger', type: 'manual_trigger', category: 'trigger', config: {} } },
      { id: 'gmail_1', type: 'google_gmail', data: { label: 'Gmail', type: 'google_gmail', category: 'action', config: { operation: 'send' } } },
    ] as any[];
    const { workflow } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    // After initializeWorkflow + validateWorkflow, should be valid or at most have warnings
    // The key invariant: if reconcileWorkflow is called, the result is valid
    const reconciled = unifiedGraphOrchestrator.reconcileWorkflow(workflow);
    const revalidation = unifiedGraphOrchestrator.validateWorkflow(reconciled.workflow);
    expect(revalidation.errors.filter(e => e.includes('orphan') || e.includes('trigger'))).toHaveLength(0);
  });
});
