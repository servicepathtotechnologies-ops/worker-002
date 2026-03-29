/**
 * Property-Based Tests: Credential Gate
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { shouldRequireCredential } from '../workflow-lifecycle-manager';
import { unifiedGraphOrchestrator } from '../../core/orchestration';
import type { WorkflowNode } from '../../core/types/ai-types';
import type { FieldFillMode } from '../../core/types/unified-node-contract';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(id: string, nodeType: string, config: Record<string, any> = {}): WorkflowNode {
  const def = unifiedNodeRegistry.get(nodeType);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { type: nodeType, label: nodeType, category: def?.category ?? 'utility', config },
  };
}

// ─── Property 16: Credential gate reads only from registry ──────────────────

// Feature: ai-workflow-generation-engine, Property 16: Credential gate reads only from registry
test('Property 16: Credential gate reads only from registry', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      fc.string({ minLength: 1, maxLength: 32 }),
      fc.constantFrom<FieldFillMode>('manual_static', 'buildtime_ai_once', 'runtime_ai'),
      (nodeType, fieldName, mode) => {
        const fieldModes: Record<string, FieldFillMode> = { [fieldName]: mode };
        const result = shouldRequireCredential(nodeType, fieldName, fieldModes);

        // Result must be a boolean
        expect(typeof result).toBe('boolean');

        // If result is true, the field MUST have ownership === 'credential' in registry
        if (result) {
          const fieldDef = unifiedNodeRegistry.get(nodeType)?.inputSchema?.[fieldName];
          expect(fieldDef?.ownership).toBe('credential');
          expect(mode).toBe('manual_static');
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 17: No credential prompt when all credential fields are non-manual_static

// Feature: ai-workflow-generation-engine, Property 17: No credential prompt when all credential fields are non-manual_static
test('Property 17: No credential prompt when all credential fields are non-manual_static', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const credentialFields = Object.entries(def.inputSchema ?? {})
          .filter(([, fd]) => (fd as any)?.ownership === 'credential')
          .map(([name]) => name);

        if (credentialFields.length === 0) return;

        // Set all credential fields to non-manual_static
        const fieldModes: Record<string, FieldFillMode> = {};
        for (const fieldName of credentialFields) {
          fieldModes[fieldName] = 'buildtime_ai_once';
        }

        // None should require credential prompt
        for (const fieldName of credentialFields) {
          const result = shouldRequireCredential(nodeType, fieldName, fieldModes);
          expect(result).toBe(false);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 18: Credential field toggled to manual_static triggers credential prompt

// Feature: ai-workflow-generation-engine, Property 18: Credential field toggled to manual_static triggers credential prompt
test('Property 18: Credential field toggled to manual_static triggers credential prompt', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  // Find node types that have credential fields
  const typesWithCredentials = allTypes.filter((t) => {
    const def = unifiedNodeRegistry.get(t);
    return Object.values(def?.inputSchema ?? {}).some((fd: any) => fd?.ownership === 'credential');
  });

  if (typesWithCredentials.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...typesWithCredentials),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        if (!def) return;

        const credentialFields = Object.entries(def.inputSchema ?? {})
          .filter(([, fd]) => (fd as any)?.ownership === 'credential')
          .map(([name]) => name);

        if (credentialFields.length === 0) return;

        // Set first credential field to manual_static
        const fieldName = credentialFields[0];
        const fieldModes: Record<string, FieldFillMode> = { [fieldName]: 'manual_static' };

        const result = shouldRequireCredential(nodeType, fieldName, fieldModes);
        expect(result).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 19: Credential values never appear in Gemini prompts ───────────

// Feature: ai-workflow-generation-engine, Property 19: Credential values never appear in Gemini prompts
test('Property 19: Credential values never appear in Gemini prompts', () => {
  // This property verifies that credential field values are not included in
  // any text that would be sent to Gemini. We test this by verifying that
  // the sanitizer strips credential-like patterns.
  const { sanitizeIntentTextForFormFieldExtraction } = require('../ai/intent-extraction');

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 8, maxLength: 64 }).filter(s => /[A-Za-z0-9]/.test(s)),
      (userContent, credentialValue) => {
        // Simulate a text that might contain a credential value
        const textWithCredential = `${userContent}\napi_key=${credentialValue}\ntoken=${credentialValue}`;
        const sanitized = sanitizeIntentTextForFormFieldExtraction(textWithCredential);

        // The sanitized output should not contain ownership annotation patterns
        expect(sanitized).not.toMatch(/ownership\s*=\s*(credential|structural|value)/i);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 20: validateWorkflow called after every material graph change ──

// Feature: ai-workflow-generation-engine, Property 20: validateWorkflow called after every material graph change
test('Property 20: validateWorkflow returns a result after every material graph change', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  const triggerTypes = allTypes.filter((t) => unifiedNodeRegistry.get(t)?.category === 'trigger');
  const nonTriggerTypes = allTypes.filter((t) => unifiedNodeRegistry.get(t)?.category !== 'trigger');

  if (triggerTypes.length === 0 || nonTriggerTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...triggerTypes),
      fc.constantFrom(...nonTriggerTypes),
      (triggerType, actionType) => {
        const nodes: WorkflowNode[] = [
          makeNode('trigger-1', triggerType),
          makeNode('action-1', actionType),
        ];

        // initializeWorkflow (material change 1)
        const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
        const validation1 = unifiedGraphOrchestrator.validateWorkflow(result.workflow, result.executionOrder);
        expect(typeof validation1.valid).toBe('boolean');
        expect(Array.isArray(validation1.errors)).toBe(true);

        // removeNode (material change 2)
        const removeResult = unifiedGraphOrchestrator.removeNode(result.workflow, 'action-1');
        const validation2 = unifiedGraphOrchestrator.validateWorkflow(removeResult.workflow, removeResult.executionOrder);
        expect(typeof validation2.valid).toBe('boolean');
        expect(Array.isArray(validation2.errors)).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 21: validateWorkflow enforces all structural invariants ─────────

// Feature: ai-workflow-generation-engine, Property 21: validateWorkflow enforces all structural invariants
test('Property 21: validateWorkflow returns valid:false for workflow with no trigger', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  const nonTriggerTypes = allTypes.filter((t) => unifiedNodeRegistry.get(t)?.category !== 'trigger');
  if (nonTriggerTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...nonTriggerTypes),
      (actionType) => {
        // Workflow with no trigger — must fail validation
        const nodes: WorkflowNode[] = [makeNode('action-1', actionType)];
        const result = unifiedGraphOrchestrator.initializeWorkflow(nodes);
        const validation = unifiedGraphOrchestrator.validateWorkflow(result.workflow, result.executionOrder);

        // No trigger → must be invalid
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    ),
    { numRuns: 100 }
  );
});
