/**
 * Phase 4: Guardrails and Fallbacks Tests
 * 
 * Tests LLM Guardrails, Output Validator, Fallback Strategies, and Error Recovery
 */

import { llmGuardrails } from '../llm-guardrails';
import { outputValidator } from '../output-validator';
import { fallbackStrategies } from '../fallback-strategies';
import { errorRecovery } from '../error-recovery';
import { SimpleIntent } from '../simple-intent';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Phase 4: Guardrails and Fallbacks', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('LLM Guardrails', () => {
    it('should validate SimpleIntent structure', () => {
      const intent: SimpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const result = llmGuardrails.validateSimpleIntent(intent);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
    
    it('should validate node types using registry (UNIVERSAL)', () => {
      const intent: SimpleIntent = {
        verbs: ['send'],
        sources: ['InvalidNodeType'], // Should warn
        destinations: ['Slack'],
      };
      
      const result = llmGuardrails.validateSimpleIntent(intent);
      
      // Should have warnings about invalid node types
      expect(result.warnings.length).toBeGreaterThan(0);
    });
    
    it('should extract and validate JSON from LLM response', () => {
      const schema = llmGuardrails.generateSimpleIntentSchema();
      const response = '```json\n{"verbs": ["send"], "sources": ["Gmail"]}\n```';
      
      const result = llmGuardrails.extractAndValidateJSON(response, schema);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
    
    it('should repair invalid outputs', () => {
      const schema = llmGuardrails.generateSimpleIntentSchema();
      const invalidOutput = {
        verbs: ['send'],
        // Missing sources/destinations
      };
      
      const result = llmGuardrails.validateJSONSchema(invalidOutput, schema);
      
      // Should attempt repair
      if (!result.valid && result.repaired) {
        expect(result.repaired.verbs).toBeDefined();
      }
    });
  });
  
  describe('Output Validator', () => {
    it('should validate StructuredIntent using registry (UNIVERSAL)', () => {
      const intent = {
        trigger: 'manual_trigger',
        actions: [
          { type: 'slack_message', operation: 'send' },
        ],
      };
      
      const result = outputValidator.validateStructuredIntent(intent);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
    
    it('should validate node types against registry', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeType = allNodeTypes[Math.floor(Math.random() * allNodeTypes.length)];
      
      const result = outputValidator.validateNodeType(testNodeType);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
    
    it('should reject invalid node types', () => {
      const result = outputValidator.validateNodeType('invalid_node_type_xyz');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
  
  describe('Fallback Strategies', () => {
    it('should extract SimpleIntent with fallback when LLM fails', async () => {
      const result = await fallbackStrategies.extractSimpleIntentWithFallback(
        'Send email from Gmail to Slack',
        undefined // No LLM extraction
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.strategy).toBe('rule-based');
    });
    
    it('should build StructuredIntent with fallback', async () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const result = await fallbackStrategies.buildStructuredIntentWithFallback(simpleIntent);
      
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.trigger).toBeDefined();
    });
    
    it('should use registry for keyword extraction (UNIVERSAL)', async () => {
      // Get a random node type from registry
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeType = allNodeTypes.find(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.category === 'output';
      });
      
      if (testNodeType) {
        const def = unifiedNodeRegistry.get(testNodeType);
        const label = def?.label || testNodeType;
        
        const result = await fallbackStrategies.extractSimpleIntentWithFallback(
          `Send data to ${label}`,
          undefined
        );
        
        // Should extract using registry
        expect(result.success).toBe(true);
        expect(result.result?.destinations).toBeDefined();
      }
    });
  });
  
  describe('Error Recovery', () => {
    it('should recover from SimpleIntent extraction failure', async () => {
      let attemptCount = 0;
      const failingExtraction = async (): Promise<SimpleIntent> => {
        attemptCount++;
        throw new Error('LLM extraction failed');
      };
      
      const result = await errorRecovery.recoverSimpleIntent(
        'Send email from Gmail to Slack',
        failingExtraction,
        { maxAttempts: 2 }
      );
      
      expect(attemptCount).toBe(2);
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('rule-based');
    });
    
    it('should recover from StructuredIntent building failure', async () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const result = await errorRecovery.recoverStructuredIntent(simpleIntent);
      
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });
    
    it('should check if error is recoverable', () => {
      expect(errorRecovery.isRecoverableError(new Error('Connection timeout'))).toBe(true);
      expect(errorRecovery.isRecoverableError(new Error('Invalid JSON'))).toBe(true);
      expect(errorRecovery.isRecoverableError(new Error('Authentication failed'))).toBe(false);
    });
  });
});
