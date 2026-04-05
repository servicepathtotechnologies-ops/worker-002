/**
 * Property-Based Tests: System Prompt Builder
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';
import { SystemPromptBuilder, PipelineStage, SelectedNode, ProposedEdge, ValidationIssue } from '../system-prompt-builder';
import { buildNodeCatalogText } from '../node-catalog-builder';

const builder = new SystemPromptBuilder();

// Shared arbitraries
const stageArb = fc.constantFrom<PipelineStage>(
  'intent',
  'node_selection',
  'edge_reasoning',
  'validation',
  'repair',
);

const intentArb = fc.string({ minLength: 5, maxLength: 200 });

const catalogArb = fc.constant(buildNodeCatalogText({ tokenBudget: 8000 }));

const selectedNodeArb: fc.Arbitrary<SelectedNode> = fc.record({
  type: fc.string({ minLength: 1, maxLength: 40 }),
  role: fc.constantFrom('trigger', 'action', 'logic', 'terminal') as fc.Arbitrary<SelectedNode['role']>,
  reason: fc.string({ minLength: 1, maxLength: 80 }),
  nodeId: fc.uuid(),
});

const edgeArb: fc.Arbitrary<ProposedEdge> = fc.record({
  source: fc.uuid(),
  target: fc.uuid(),
  type: fc.constantFrom('main', 'true', 'false', 'case_1', 'case_2'),
});

const issueArb: fc.Arbitrary<ValidationIssue> = fc.record({
  severity: fc.constantFrom('error', 'warning') as fc.Arbitrary<ValidationIssue['severity']>,
  description: fc.string({ minLength: 5, maxLength: 100 }),
  suggestedFix: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
});

// ─── Property 14: System_Prompt_Builder is deterministic ─────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 14: System_Prompt_Builder is deterministic
test('Property 14: SystemPromptBuilder produces identical non-empty output for identical inputs', () => {
  fc.assert(
    fc.property(
      stageArb,
      catalogArb,
      intentArb,
      fc.array(selectedNodeArb, { minLength: 0, maxLength: 4 }),
      fc.array(edgeArb, { minLength: 0, maxLength: 4 }),
      fc.array(issueArb, { minLength: 0, maxLength: 3 }),
      (stage, nodeCatalog, userIntent, selectedNodes, edgeList, validationIssues) => {
        const input = {
          stage,
          nodeCatalog,
          userIntent,
          stageContext: { selectedNodes, edgeList, validationIssues },
        };

        const result1 = builder.build(input);
        const result2 = builder.build(input);

        // Must be non-empty
        expect(result1.systemPrompt.length).toBeGreaterThan(0);
        expect(result2.systemPrompt.length).toBeGreaterThan(0);

        // Must be identical on repeated calls
        expect(result1.systemPrompt).toBe(result2.systemPrompt);
        expect(JSON.stringify(result1.outputSchema)).toBe(JSON.stringify(result2.outputSchema));
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 15: System prompts contain all four mandatory sections ──────────

// Feature: ai-first-workflow-generation-pipeline, Property 15: System prompts contain all four mandatory sections
test('Property 15: every stage prompt contains role/objective, catalog, output format, and hard constraints', () => {
  fc.assert(
    fc.property(
      stageArb,
      catalogArb,
      intentArb,
      (stage, nodeCatalog, userIntent) => {
        const result = builder.build({ stage, nodeCatalog, userIntent });
        const prompt = result.systemPrompt;

        // Section 1: Role and objective
        expect(prompt).toMatch(/ROLE AND OBJECTIVE/i);

        // Section 2: Node catalog is embedded
        // The catalog text itself is included in the prompt
        expect(prompt).toContain(nodeCatalog.slice(0, 20)); // first 20 chars of catalog must appear

        // Section 3: Output format / JSON schema
        expect(prompt).toMatch(/OUTPUT FORMAT/i);

        // Section 4: Hard constraints
        expect(prompt).toMatch(/HARD CONSTRAINTS|CONSTRAINT/i);

        // Output schema must be a non-empty object
        expect(typeof result.outputSchema).toBe('object');
        expect(Object.keys(result.outputSchema).length).toBeGreaterThan(0);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 6: Node_Selection prompt contains trigger and minimal-set constraints ──

// Feature: ai-first-workflow-generation-pipeline, Property 6: Node_Selection prompt contains trigger and minimal-set constraints
test('Property 6: node_selection prompt instructs LLM to include exactly one trigger and minimal nodes', () => {
  fc.assert(
    fc.property(
      catalogArb,
      intentArb,
      (nodeCatalog, userIntent) => {
        const result = builder.build({ stage: 'node_selection', nodeCatalog, userIntent });
        const prompt = result.systemPrompt;

        // Must mention trigger constraint
        expect(prompt).toMatch(/exactly ONE trigger|one trigger/i);

        // Must mention minimal set
        expect(prompt).toMatch(/minimal|minimum/i);

        // Must instruct not to invent node types
        expect(prompt).toMatch(/ONLY.*catalog|catalog.*ONLY|must exist in the NODE CATALOG/i);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 7: Edge_Reasoning prompt contains DAG constraints ───────────────

// Feature: ai-first-workflow-generation-pipeline, Property 7: Edge_Reasoning prompt contains DAG constraints
test('Property 7: edge_reasoning prompt contains all four DAG constraint rules', () => {
  fc.assert(
    fc.property(
      catalogArb,
      intentArb,
      fc.array(selectedNodeArb, { minLength: 1, maxLength: 5 }),
      (nodeCatalog, userIntent, selectedNodes) => {
        const result = builder.build({
          stage: 'edge_reasoning',
          nodeCatalog,
          userIntent,
          stageContext: { selectedNodes },
        });
        const prompt = result.systemPrompt;

        // Rule 1: No cycles
        expect(prompt).toMatch(/NO CYCLES|no cycle/i);

        // Rule 2: Exactly one trigger with in-degree zero
        expect(prompt).toMatch(/EXACTLY ONE TRIGGER|one trigger/i);

        // Rule 3: Non-terminal nodes must have outgoing edges
        expect(prompt).toMatch(/outgoing edge|non-terminal/i);

        // Rule 4: Branching nodes with labeled edges
        expect(prompt).toMatch(/if_else|switch|labeled edge|true.*false|case_/i);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 10: Validation prompt covers all four evaluation dimensions ─────

// Feature: ai-first-workflow-generation-pipeline, Property 10: Validation prompt covers all four evaluation dimensions
test('Property 10: validation prompt instructs LLM on all four evaluation dimensions', () => {
  fc.assert(
    fc.property(
      catalogArb,
      intentArb,
      fc.array(selectedNodeArb, { minLength: 1, maxLength: 5 }),
      fc.array(edgeArb, { minLength: 1, maxLength: 5 }),
      (nodeCatalog, userIntent, selectedNodes, edgeList) => {
        const result = builder.build({
          stage: 'validation',
          nodeCatalog,
          userIntent,
          stageContext: { selectedNodes, edgeList },
        });
        const prompt = result.systemPrompt;

        // Dimension 1: Structural validity
        expect(prompt).toMatch(/STRUCTURAL VALIDITY|structural/i);

        // Dimension 2: Semantic alignment
        expect(prompt).toMatch(/SEMANTIC ALIGNMENT|semantic/i);

        // Dimension 3: Completeness
        expect(prompt).toMatch(/COMPLETENESS|completeness/i);

        // Dimension 4: Data flow coherence
        expect(prompt).toMatch(/DATA FLOW|data flow/i);
      }
    ),
    { numRuns: 100 }
  );
});
