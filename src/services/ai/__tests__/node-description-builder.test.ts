/**
 * Property-Based Tests: Node Description Builder
 * Feature: ai-workflow-generation-engine
 */

import * as fc from 'fast-check';
import { buildNodeDescriptionBlocks } from '../node-description-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { StructuredIntent } from '../intent-structurer';
import type { CaseNodeMapping } from '../summarize-layer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    trigger: 'manual_trigger',
    actions: [],
    requires_credentials: [],
    ...overrides,
  };
}

/** Return all node types registered in the unified registry. */
function getAllRegistryTypes(): string[] {
  return unifiedNodeRegistry.getAllTypes();
}

/** Return node types that are form-like (have 'form' tag or inputSchema.fields). */
function getFormLikeTypes(): string[] {
  return getAllRegistryTypes().filter(type => {
    const def = unifiedNodeRegistry.get(type);
    if (!def) return false;
    if (def.tags?.includes('form')) return true;
    return (def.inputSchema as any)?.fields !== undefined;
  });
}

/** Return node types that are if_else branching nodes. */
function getIfElseTypes(): string[] {
  return getAllRegistryTypes().filter(type => {
    const def = unifiedNodeRegistry.get(type);
    if (!def) return false;
    return (
      def.isBranching === true &&
      Array.isArray(def.outgoingPorts) &&
      def.outgoingPorts.includes('true') &&
      def.outgoingPorts.includes('false')
    );
  });
}

// ─── Property 35: per-node description blocks match chain length ──────────────

// Feature: ai-workflow-generation-engine, Property 35: structuredSummary contains per-node description for every chain node
test('Property 35: buildNodeDescriptionBlocks returns array with same length as chain', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length === 0) {
    // Registry empty — skip
    return;
  }

  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...allTypes), { minLength: 1, maxLength: 6 }),
      (chain) => {
        const intent = makeIntent();
        const blocks = buildNodeDescriptionBlocks(intent, chain);
        expect(blocks).toHaveLength(chain.length);
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 35 (unit): single-node chain produces one block', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length === 0) return;
  const nodeType = allTypes[0];
  const blocks = buildNodeDescriptionBlocks(makeIntent(), [nodeType]);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].nodeType).toBe(nodeType);
  expect(blocks[0].nodeIndex).toBe(0);
});

test('Property 35 (unit): each block has correct nodeIndex and nodeType', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length < 2) return;
  const chain = allTypes.slice(0, 3);
  const blocks = buildNodeDescriptionBlocks(makeIntent(), chain);
  blocks.forEach((block, i) => {
    expect(block.nodeIndex).toBe(i);
    expect(block.nodeType).toBe(chain[i]);
  });
});

test('Property 35 (unit): first block receivesFrom is "user input"', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length === 0) return;
  const chain = allTypes.slice(0, 2);
  const blocks = buildNodeDescriptionBlocks(makeIntent(), chain);
  expect(blocks[0].receivesFrom).toBe('user input');
});

test('Property 35 (unit): last block passesTo is "end of workflow"', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length === 0) return;
  const chain = allTypes.slice(0, 2);
  const blocks = buildNodeDescriptionBlocks(makeIntent(), chain);
  expect(blocks[blocks.length - 1].passesTo).toBe('end of workflow');
});

test('Property 35 (unit): every block has non-empty prose', () => {
  const allTypes = getAllRegistryTypes();
  if (allTypes.length === 0) return;
  const chain = allTypes.slice(0, 4);
  const blocks = buildNodeDescriptionBlocks(makeIntent(), chain);
  for (const block of blocks) {
    expect(typeof block.prose).toBe('string');
    expect(block.prose.length).toBeGreaterThan(0);
  }
});

// ─── Property 36: form node description lists all non-credential fields ───────

// Feature: ai-workflow-generation-engine, Property 36: form node description lists all non-credential inputSchema fields
test('Property 36: form node block has formFields containing all non-credential inputSchema fields', () => {
  const formTypes = getFormLikeTypes();
  if (formTypes.length === 0) {
    // No form-like nodes in registry — skip
    return;
  }

  fc.assert(
    fc.property(
      fc.constantFrom(...formTypes),
      fc.array(fc.constantFrom(...getAllRegistryTypes()), { minLength: 0, maxLength: 3 }),
      (formType, extraNodes) => {
        // Build a chain that includes the form node
        const chain = [formType, ...extraNodes];
        const intent = makeIntent();
        const blocks = buildNodeDescriptionBlocks(intent, chain);

        // Find the block for the form node (first occurrence)
        const formBlock = blocks.find(b => b.nodeType === formType);
        expect(formBlock).toBeDefined();
        if (!formBlock) return;

        // formFields must be defined
        expect(formBlock.formFields).toBeDefined();

        // Get expected fields from registry (non-credential)
        const def = unifiedNodeRegistry.get(formType);
        if (!def) return;
        const inputSchema = def.inputSchema || {};
        const expectedFields = Object.entries(inputSchema)
          .filter(([, fieldDef]) => (fieldDef as any).ownership !== 'credential')
          .map(([name]) => name);

        // Every expected field must appear in formFields
        const actualFieldNames = (formBlock.formFields || []).map(f => f.name);
        for (const expectedField of expectedFields) {
          expect(actualFieldNames).toContain(expectedField);
        }

        // No credential fields should appear
        const credentialFields = Object.entries(inputSchema)
          .filter(([, fieldDef]) => (fieldDef as any).ownership === 'credential')
          .map(([name]) => name);
        for (const credField of credentialFields) {
          expect(actualFieldNames).not.toContain(credField);
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 36 (unit): form node formFields have name, type, required fields', () => {
  const formTypes = getFormLikeTypes();
  if (formTypes.length === 0) return;
  const formType = formTypes[0];
  const blocks = buildNodeDescriptionBlocks(makeIntent(), [formType]);
  const block = blocks[0];
  expect(block.formFields).toBeDefined();
  for (const field of block.formFields || []) {
    expect(typeof field.name).toBe('string');
    expect(typeof field.type).toBe('string');
    expect(typeof field.required).toBe('boolean');
  }
});

// ─── Property 37: if_else description completeness ────────────────────────────

// Feature: ai-workflow-generation-engine, Property 37: if_else description states condition, source field, and both branch targets
test('Property 37: if_else block has non-empty conditionExpression, conditionSourceField, trueBranchTarget, falseBranchTarget', () => {
  const ifElseTypes = getIfElseTypes();
  if (ifElseTypes.length === 0) {
    // No if_else nodes in registry — skip
    return;
  }

  const allTypes = getAllRegistryTypes();
  if (allTypes.length < 2) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...ifElseTypes),
      fc.constantFrom(...allTypes),
      fc.constantFrom(...allTypes),
      (ifElseType, trueTarget, falseTarget) => {
        // Build a chain: [ifElseNode, trueTarget, falseTarget]
        const chain = [ifElseType, trueTarget, falseTarget];
        const intent = makeIntent({
          conditions: [
            {
              type: 'if_else',
              condition: 'value is greater than 10',
            },
          ],
        });
        const blocks = buildNodeDescriptionBlocks(intent, chain);

        const ifElseBlock = blocks.find(b => b.nodeType === ifElseType);
        expect(ifElseBlock).toBeDefined();
        if (!ifElseBlock) return;

        // All four fields must be non-empty strings
        expect(typeof ifElseBlock.conditionExpression).toBe('string');
        expect((ifElseBlock.conditionExpression || '').length).toBeGreaterThan(0);

        expect(typeof ifElseBlock.conditionSourceField).toBe('string');
        expect((ifElseBlock.conditionSourceField || '').length).toBeGreaterThan(0);

        expect(typeof ifElseBlock.trueBranchTarget).toBe('string');
        expect((ifElseBlock.trueBranchTarget || '').length).toBeGreaterThan(0);

        expect(typeof ifElseBlock.falseBranchTarget).toBe('string');
        expect((ifElseBlock.falseBranchTarget || '').length).toBeGreaterThan(0);

        // Prose must mention the condition
        expect(ifElseBlock.prose).toContain('value is greater than 10');
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 37 (unit): if_else block prose contains "Checks if"', () => {
  const ifElseTypes = getIfElseTypes();
  if (ifElseTypes.length === 0) return;
  const allTypes = getAllRegistryTypes();
  if (allTypes.length < 2) return;

  const chain = [ifElseTypes[0], allTypes[0], allTypes[1]];
  const intent = makeIntent({
    conditions: [{ type: 'if_else', condition: 'score is above threshold' }],
  });
  const blocks = buildNodeDescriptionBlocks(intent, chain);
  const ifElseBlock = blocks[0];
  expect(ifElseBlock.prose).toMatch(/checks if/i);
});

test('Property 37 (unit): if_else block without intent conditions uses fallback condition text', () => {
  const ifElseTypes = getIfElseTypes();
  if (ifElseTypes.length === 0) return;
  const allTypes = getAllRegistryTypes();
  if (allTypes.length < 2) return;

  const chain = [ifElseTypes[0], allTypes[0], allTypes[1]];
  const intent = makeIntent(); // no conditions
  const blocks = buildNodeDescriptionBlocks(intent, chain);
  const ifElseBlock = blocks[0];
  expect(typeof ifElseBlock.conditionExpression).toBe('string');
  expect((ifElseBlock.conditionExpression || '').length).toBeGreaterThan(0);
});

// ─── Additional unit tests ────────────────────────────────────────────────────

test('switch node block has switchCases populated from caseNodeMapping', () => {
  const allTypes = getAllRegistryTypes();
  // Find a switch node
  const switchType = allTypes.find(type => {
    const def = unifiedNodeRegistry.get(type);
    return (
      def?.isBranching === true &&
      Array.isArray(def.outgoingPorts) &&
      def.outgoingPorts.length > 0 &&
      def.outgoingPorts[0].startsWith('case_')
    );
  });
  if (!switchType) return; // No switch node in registry

  const caseNodeMapping: CaseNodeMapping = {
    sales: 'slack_message',
    support: 'google_gmail',
  };

  const chain = [switchType];
  const blocks = buildNodeDescriptionBlocks(makeIntent(), chain, caseNodeMapping);
  const switchBlock = blocks[0];

  expect(switchBlock.switchCases).toBeDefined();
  expect(switchBlock.switchCases?.length).toBe(2);
  expect(switchBlock.switchCases?.map(c => c.value)).toContain('sales');
  expect(switchBlock.switchCases?.map(c => c.value)).toContain('support');
});

test('empty chain returns empty array', () => {
  const blocks = buildNodeDescriptionBlocks(makeIntent(), []);
  expect(blocks).toHaveLength(0);
});

test('integration node block has prose that does not contain registry boilerplate', () => {
  const allTypes = getAllRegistryTypes();
  // Find a non-trigger, non-branching, non-form node
  const integrationType = allTypes.find(type => {
    const def = unifiedNodeRegistry.get(type);
    if (!def) return false;
    return (
      def.category !== 'trigger' &&
      !def.isBranching &&
      !def.tags?.includes('form') &&
      !(def.inputSchema as any)?.fields
    );
  });
  if (!integrationType) return;

  const blocks = buildNodeDescriptionBlocks(makeIntent(), [integrationType]);
  const block = blocks[0];

  // Prose must not contain registry boilerplate
  expect(block.prose).not.toMatch(/fillMode/i);
  expect(block.prose).not.toMatch(/ownership/i);
  expect(block.prose).not.toMatch(/buildtime_ai_once/i);
  expect(block.prose).not.toMatch(/manual_static/i);
  expect(block.prose).not.toMatch(/runtime_ai/i);
});
