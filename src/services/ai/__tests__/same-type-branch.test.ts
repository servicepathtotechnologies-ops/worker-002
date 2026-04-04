/**
 * Property-Based Tests: Same-type branch node handling
 * Feature: ai-workflow-generation-engine
 */

// Feature: ai-workflow-generation-engine, Property 38: Same-type branch nodes produce distinct node IDs

import { buildWorkflowFromPlanChain } from '../plan-driven-workflow-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Property 38: Same-type branch nodes produce distinct node IDs', () => {
  it('chain with google_gmail[true] and google_gmail[false] produces two distinct Gmail node instances', () => {
    const chain = ['form', 'if_else', 'google_gmail[true]', 'google_gmail[false]'];

    // Only run if all types are registered
    const baseTypes = ['form', 'if_else', 'google_gmail'];
    const allRegistered = baseTypes.every((t) => unifiedNodeRegistry.get(t) != null);
    if (!allRegistered) {
      console.warn('[same-type-branch.test] Skipping: not all node types registered');
      return;
    }

    const result = buildWorkflowFromPlanChain(chain);
    expect(result.success).toBe(true);
    expect(result.workflow).toBeDefined();

    const nodes = result.workflow!.nodes;

    // Should have 4 nodes total
    expect(nodes).toHaveLength(4);

    // Find Gmail nodes
    const gmailNodes = nodes.filter((n) => n.type === 'google_gmail');
    expect(gmailNodes).toHaveLength(2);

    // IDs must be distinct
    const ids = gmailNodes.map((n) => n.id);
    expect(ids[0]).not.toBe(ids[1]);

    // Each should have a branchTag in meta
    const tags = gmailNodes.map((n) => (n.data as any)?.meta?.branchTag);
    expect(tags).toContain('true');
    expect(tags).toContain('false');
  });

  it('chain without branch annotations produces nodes with standard IDs', () => {
    const chain = ['manual_trigger', 'google_gmail'];

    const allRegistered = ['manual_trigger', 'google_gmail'].every(
      (t) => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[same-type-branch.test] Skipping: not all node types registered');
      return;
    }

    const result = buildWorkflowFromPlanChain(chain);
    expect(result.success).toBe(true);

    const gmailNodes = result.workflow!.nodes.filter((n) => n.type === 'google_gmail');
    expect(gmailNodes).toHaveLength(1);

    // No branchTag in meta
    const branchTag = (gmailNodes[0].data as any)?.meta?.branchTag;
    expect(branchTag).toBeUndefined();
  });

  it('annotated tokens resolve to the correct canonical type for registry lookup', () => {
    // google_gmail[true] should resolve to google_gmail in the registry
    const chain = ['manual_trigger', 'google_gmail[true]'];

    const allRegistered = ['manual_trigger', 'google_gmail'].every(
      (t) => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[same-type-branch.test] Skipping: not all node types registered');
      return;
    }

    const result = buildWorkflowFromPlanChain(chain);
    expect(result.success).toBe(true);

    const gmailNode = result.workflow!.nodes.find((n) => n.type === 'google_gmail');
    expect(gmailNode).toBeDefined();
    expect(gmailNode!.id).toContain('true');
  });
});
