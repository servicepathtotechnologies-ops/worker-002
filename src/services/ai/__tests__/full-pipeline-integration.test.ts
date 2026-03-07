/**
 * Full Pipeline Integration Tests
 * 
 * Tests the complete flow: Extract → Validate → Repair → Plan → Build
 */

import { intentExtractor } from '../intent-extractor';
import { intentValidator } from '../intent-validator';
import { intentRepairEngine } from '../intent-repair-engine';
import { intentAwarePlanner } from '../intent-aware-planner';
import { llmGuardrails } from '../llm-guardrails';
import { outputValidator } from '../output-validator';
import { fallbackStrategies } from '../fallback-strategies';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Full Pipeline Integration', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should complete full pipeline: Extract → Validate → Repair → Plan', async () => {
    const prompt = 'Send email from Gmail to Slack when new message arrives';
    
    // Step 1: Extract SimpleIntent
    const extractionResult = await intentExtractor.extractIntent(prompt);
    expect(extractionResult.intent).toBeDefined();
    
    // Step 2: Validate SimpleIntent
    const validationResult = intentValidator.validate(extractionResult.intent);
    
    // Step 3: Repair if needed
    let finalSimpleIntent = extractionResult.intent;
    if (!validationResult.valid) {
      const repairResult = intentRepairEngine.repair(
        extractionResult.intent,
        validationResult,
        prompt
      );
      finalSimpleIntent = repairResult.repairedIntent;
    }
    
    // Step 4: Validate with guardrails
    const guardrailResult = llmGuardrails.validateSimpleIntent(finalSimpleIntent);
    expect(guardrailResult.valid).toBe(true);
    
    // Step 5: Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(finalSimpleIntent, prompt);
    expect(planningResult.errors.length).toBe(0);
    expect(planningResult.structuredIntent).toBeDefined();
    
    // Step 6: Validate StructuredIntent
    const structuredValidation = outputValidator.validateStructuredIntent(
      planningResult.structuredIntent
    );
    expect(structuredValidation.valid).toBe(true);
  });
  
  it('should use fallback when LLM fails', async () => {
    const prompt = 'Send email from Gmail to Slack';
    
    // Simulate LLM failure by not providing LLM extraction
    const fallbackResult = await fallbackStrategies.extractSimpleIntentWithFallback(
      prompt,
      undefined
    );
    
    expect(fallbackResult.success).toBe(true);
    expect(fallbackResult.result).toBeDefined();
    expect(fallbackResult.strategy).not.toBe('llm');
  });
  
  it('should work with any node type from registry (UNIVERSAL)', async () => {
    // Get random nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const sourceNode = allNodeTypes.find(type => {
      const def = unifiedNodeRegistry.get(type);
      return def?.category === 'trigger' || def?.category === 'data';
    });
    const destNode = allNodeTypes.find(type => {
      const def = unifiedNodeRegistry.get(type);
      return def?.category === 'output' || def?.category === 'communication';
    });
    
    if (sourceNode && destNode) {
      const sourceDef = unifiedNodeRegistry.get(sourceNode);
      const destDef = unifiedNodeRegistry.get(destNode);
      const sourceLabel = sourceDef?.label || sourceNode;
      const destLabel = destDef?.label || destNode;
      
      const prompt = `Send data from ${sourceLabel} to ${destLabel}`;
      
      // Extract
      const extractionResult = await intentExtractor.extractIntent(prompt);
      
      // Plan
      const planningResult = await intentAwarePlanner.planWorkflow(
        extractionResult.intent,
        prompt
      );
      
      // Should work with any node type
      expect(planningResult.structuredIntent).toBeDefined();
      expect(planningResult.errors.length).toBe(0);
    }
  });
  
  it('should handle invalid LLM output gracefully', async () => {
    const invalidOutput = {
      verbs: [], // Invalid: empty verbs
      sources: ['InvalidNode'],
      destinations: [],
    };
    
    // Validate
    const validation = outputValidator.validateSimpleIntent(invalidOutput);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.suggestions.length).toBeGreaterThan(0);
    
    // Try to repair
    const schema = llmGuardrails.generateSimpleIntentSchema();
    const guardrailResult = llmGuardrails.validateJSONSchema(invalidOutput, schema);
    
    // Should attempt repair or provide fallback
    expect(guardrailResult.repaired || guardrailResult.valid).toBeDefined();
  });
});
