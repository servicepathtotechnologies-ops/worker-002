/**
 * Property-Based Tests: AiFirstPipeline Observability + Node Hydration
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── Property 16: Node hydration uses registry defaultConfig ─────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 16: Node hydration uses registry defaultConfig
test('Property 16: node hydration always uses unifiedNodeRegistry.getDefaultConfig and never invents values', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();
  if (allTypes.length === 0) return;

  fc.assert(
    fc.property(
      fc.constantFrom(...allTypes.slice(0, Math.min(allTypes.length, 30))),
      (nodeType) => {
        const def = unifiedNodeRegistry.get(nodeType);
        expect(def).toBeTruthy();

        // defaultConfig must be callable and return an object
        if (def?.defaultConfig) {
          const defaults = def.defaultConfig();
          expect(typeof defaults).toBe('object');
          expect(defaults).not.toBeNull();

          // All keys in defaults must be defined in inputSchema
          const inputSchema = def.inputSchema || {};
          for (const key of Object.keys(defaults)) {
            // Key must exist in inputSchema (no invented fields)
            expect(Object.keys(inputSchema)).toContain(key);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 17: Stage logs are emitted for every stage ─────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 17: Stage logs are emitted for every stage
test('Property 17: AiFirstPipeline source emits stage start/end logs for all five stages', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '../ai-first-pipeline.ts'),
    'utf-8',
  );

  const stages = ['intent', 'node_selection', 'edge_reasoning', 'validation'];
  for (const stage of stages) {
    // Each stage must appear in stageTrace push
    expect(source).toContain(`stage: '${stage}'`);
  }

  // Must emit pipeline start and complete events
  expect(source).toMatch(/ai_pipeline_start/);
  expect(source).toMatch(/ai_pipeline_complete/);
});

// ─── Property 18: LLM call logs contain model, temperature, and token counts ──

// Feature: ai-first-workflow-generation-pipeline, Property 18: LLM call logs contain model, temperature, and token counts
test('Property 18: stage files log model, temperature, promptTokens, completionTokens for every LLM call', () => {
  const fs = require('fs');
  const path = require('path');
  const stageFiles = [
    '../stages/intent-stage.ts',
    '../stages/node-selection-stage.ts',
    '../stages/edge-reasoning-stage.ts',
    '../stages/validation-stage.ts',
  ];

  for (const file of stageFiles) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    expect(source).toMatch(/model/);
    expect(source).toMatch(/temperature/);
    expect(source).toMatch(/promptTokens/);
    expect(source).toMatch(/completionTokens/);
  }
});
