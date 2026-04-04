/**
 * Property-Based Tests: Node Sufficiency Checker
 * Feature: ai-workflow-generation-engine
 */

// Feature: ai-workflow-generation-engine, Property 47: Every node in final selection has a rationale entry
// Feature: ai-workflow-generation-engine, Property 48: log_output absent from selection when intent has no observability signal
// Feature: ai-workflow-generation-engine, Property 49: Single linear intent produces minimum node count

import * as fc from 'fast-check';
import { checkNodeSufficiency } from '../node-sufficiency-checker';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { StructuredIntent } from '../intent-structurer';

// ─── Property 47: Every node in final selection has a rationale entry ─────────

describe('Property 47: Every node in final selection has a rationale entry', () => {
  it('every kept node has a non-empty rationale reason', () => {
    const chain = ['manual_trigger', 'google_gmail'];
    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [{ type: 'google_gmail', operation: 'send' }],
      dataSources: [],
      transformations: [],
      requires_credentials: [],
    };

    const result = checkNodeSufficiency(chain, intent);
    const kept = chain.filter(t => !result.nodesToRemove.includes(t));

    for (const token of kept) {
      const nodeType = token.replace(/\[.*?\]/, '').replace(/#.*$/, '').trim();
      const entry = result.rationale.find(r => r.nodeType === nodeType);
      expect(entry).toBeDefined();
      expect(entry!.reason.length).toBeGreaterThan(0);
    }
  });

  it('property: for any valid chain, every kept node has a rationale entry', () => {
    const allTypes = unifiedNodeRegistry.getAllTypes().filter(t => unifiedNodeRegistry.get(t) != null);
    if (allTypes.length === 0) return;

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...allTypes.slice(0, 20)), { minLength: 1, maxLength: 5 }),
        (chain) => {
          const intent: StructuredIntent = {
            trigger: chain[0] || 'manual_trigger',
            actions: chain.map(t => ({ type: t, operation: 'send' })),
            dataSources: [],
            transformations: [],
            requires_credentials: [],
          };

          const result = checkNodeSufficiency(chain, intent);
          const kept = chain.filter(t => !result.nodesToRemove.includes(t));

          for (const token of kept) {
            const nodeType = token.replace(/\[.*?\]/, '').replace(/#.*$/, '').trim();
            const entry = result.rationale.find(r => r.nodeType === nodeType);
            expect(entry).toBeDefined();
            expect(entry!.reason.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 48: log_output absent when no observability signal ──────────────

describe('Property 48: log_output absent from selection when intent has no observability signal', () => {
  it('log_output is in nodesToRemove when intent has no observability keywords', () => {
    // Only run if log_output is registered
    if (!unifiedNodeRegistry.get('log_output')) {
      console.warn('[node-sufficiency-checker.test] Skipping: log_output not registered');
      return;
    }

    const chain = ['manual_trigger', 'google_gmail', 'log_output'];
    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [{ type: 'google_gmail', operation: 'send' }],
      dataSources: [],
      transformations: [],
      requires_credentials: [],
    };

    const result = checkNodeSufficiency(chain, intent);

    // log_output should be removed since there's no observability signal
    // UNLESS log_output has alwaysTerminal=true in registry
    const logDef = unifiedNodeRegistry.get('log_output');
    if (logDef?.workflowBehavior?.alwaysTerminal === true) {
      // Registry says always terminal — it should be kept
      expect(result.nodesToRemove).not.toContain('log_output');
    } else {
      expect(result.nodesToRemove).toContain('log_output');
    }
  });

  it('log_output is kept when intent has observability keywords', () => {
    if (!unifiedNodeRegistry.get('log_output')) {
      console.warn('[node-sufficiency-checker.test] Skipping: log_output not registered');
      return;
    }

    const chain = ['manual_trigger', 'log_output'];
    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [{ type: 'log_output', operation: 'log' }],
      dataSources: [],
      transformations: [],
      requires_credentials: [],
    };

    const result = checkNodeSufficiency(chain, intent);
    expect(result.nodesToRemove).not.toContain('log_output');
  });
});

// ─── Property 49: Single linear intent produces minimum node count ────────────

describe('Property 49: Single linear intent produces minimum node count', () => {
  it('chain of [manual_trigger, google_gmail] with email intent produces exactly 2 nodes', () => {
    const allRegistered = ['manual_trigger', 'google_gmail'].every(
      t => unifiedNodeRegistry.get(t) != null
    );
    if (!allRegistered) {
      console.warn('[node-sufficiency-checker.test] Skipping: not all node types registered');
      return;
    }

    const chain = ['manual_trigger', 'google_gmail'];
    const intent: StructuredIntent = {
      trigger: 'manual_trigger',
      actions: [{ type: 'google_gmail', operation: 'send' }],
      dataSources: [],
      transformations: [],
      requires_credentials: [],
    };

    const result = checkNodeSufficiency(chain, intent);
    const kept = chain.filter(t => !result.nodesToRemove.includes(t));

    // Both nodes should be kept — trigger + gmail match the intent
    expect(kept).toHaveLength(2);
    expect(result.sufficient).toBe(true);
  });
});
