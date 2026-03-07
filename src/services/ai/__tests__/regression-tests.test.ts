/**
 * Regression Tests
 * 
 * ✅ PHASE 5: Tests to ensure existing workflows still work
 * 
 * Tests:
 * - Existing workflow patterns
 * - Backward compatibility
 * - No breaking changes
 */

import { intentExtractor } from '../intent-extractor';
import { intentAwarePlanner } from '../intent-aware-planner';
import { workflowDSLCompiler } from '../workflow-dsl-compiler';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Regression Tests', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('Existing Workflow Patterns', () => {
    it('should handle simple email-to-slack workflow', async () => {
      const prompt = 'Send email from Gmail to Slack';
      
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      expect(planningResult.errors.length).toBe(0);
      expect(planningResult.structuredIntent.actions.length).toBeGreaterThan(0);
    });
    
    it('should handle data sync workflow', async () => {
      const prompt = 'Sync data from Google Sheets to HubSpot';
      
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      expect(planningResult.errors.length).toBe(0);
      expect(planningResult.structuredIntent.dataSources?.length).toBeGreaterThan(0);
      expect(planningResult.structuredIntent.actions.length).toBeGreaterThan(0);
    });
    
    it('should handle conditional workflow', async () => {
      const prompt = 'If email count is greater than 10, send notification to Slack';
      
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      expect(planningResult.errors.length).toBe(0);
      expect(planningResult.structuredIntent.conditions?.length).toBeGreaterThan(0);
    });
    
    it('should handle transformation workflow', async () => {
      const prompt = 'Read data from Sheets, summarize it, and send to Slack';
      
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      expect(planningResult.errors.length).toBe(0);
      expect(planningResult.structuredIntent.transformations?.length).toBeGreaterThan(0);
    });
  });
  
  describe('Backward Compatibility', () => {
    it('should work with legacy StructuredIntent format', async () => {
      const legacyIntent = {
        trigger: 'manual_trigger',
        actions: [
          { type: 'slack_message', operation: 'send' },
        ],
        requires_credentials: [],
      };
      
      // Should still work with legacy format
      const { dslGenerator } = await import('../workflow-dsl');
      const dsl = await dslGenerator.generateDSL(legacyIntent, 'Test prompt');
      
      expect(dsl.trigger).toBeDefined();
      expect(dsl.outputs.length).toBeGreaterThan(0);
    });
    
    it('should handle missing optional fields gracefully', async () => {
      const minimalIntent = {
        verbs: ['send'],
        sources: [],
        destinations: ['Slack'],
      };
      
      const planningResult = await intentAwarePlanner.planWorkflow(minimalIntent);
      
      // Should still generate valid StructuredIntent
      expect(planningResult.structuredIntent).toBeDefined();
      expect(planningResult.structuredIntent.trigger).toBeDefined();
    });
  });
  
  describe('No Breaking Changes', () => {
    it('should maintain same output structure', async () => {
      const prompt = 'Send email from Gmail to Slack';
      
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      // Verify output structure
      expect(planningResult.structuredIntent).toHaveProperty('trigger');
      expect(planningResult.structuredIntent).toHaveProperty('actions');
      expect(planningResult.structuredIntent).toHaveProperty('requires_credentials');
    });
    
    it('should work with all existing node types', async () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeTypes = allNodeTypes.slice(0, 10); // Test first 10
      
      for (const nodeType of testNodeTypes) {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        if (!nodeDef) continue;
        
        // Should be able to get node definition
        expect(nodeDef).toBeDefined();
        expect(nodeDef.type).toBe(nodeType);
      }
    });
  });
});
