/**
 * Unit tests for Schema-Aware Template Generator
 * Tests exact match, semantic fallback, and no-invention scenarios
 */

import { generateTemplates } from '../schema-aware-template-generator';
import { WorkflowNode } from '../../../core/types/ai-types';
import { LLMAdapter } from '../../../../shared/llm-adapter';

// Mock LLM adapter
class MockLLMAdapter implements LLMAdapter {
  async generateResponse(systemPrompt: string, userPrompt: string, options?: any): Promise<string> {
    // Simulate LLM response based on test scenario
    const scenario = (global as any).__TEST_SCENARIO__ || 'exactMatch';
    
    switch (scenario) {
      case 'exactMatch':
        return JSON.stringify({
          mappings: [
            {
              targetField: 'body',
              sourceField: 'body',
              template: '{{$json.body}}',
              confidence: 0.95,
              reason: 'exact match',
              needsReview: false,
            },
          ],
        });
      
      case 'semanticFallback':
        return JSON.stringify({
          mappings: [
            {
              targetField: 'body',
              sourceField: 'content', // Semantic match: body → content
              template: '{{$json.content}}',
              confidence: 0.85,
              reason: 'semantic match: body maps to content',
              needsReview: false,
            },
          ],
        });
      
      case 'noMatch':
        return JSON.stringify({
          mappings: [
            {
              targetField: 'body',
              sourceField: 'unknown_field', // Field doesn't exist
              template: '{{$json.unknown_field}}',
              confidence: 0.3,
              reason: 'no match found',
              needsReview: true,
            },
          ],
        });
      
      default:
        return JSON.stringify({ mappings: [] });
    }
  }
}

describe('Schema-Aware Template Generator', () => {
  const mockLLMAdapter = new MockLLMAdapter();
  
  const createMockNode = (type: string, outputFields: string[]): WorkflowNode => ({
    id: `node-${type}`,
    type: type,
    data: {
      type: type,
      config: {
        outputFields,
      },
    },
    position: { x: 0, y: 0 },
  });

  describe('Exact Match Scenario', () => {
    it('should generate template for exact field match', async () => {
      (global as any).__TEST_SCENARIO__ = 'exactMatch';
      
      const upstreamNode = createMockNode('http_request', ['body', 'status', 'headers']);
      const targetNode = createMockNode('google_gmail', ['to', 'subject', 'body']);
      
      const result = await generateTemplates({
        upstreamNode,
        targetNode,
        structuredIntent: 'Send email with body from HTTP response',
        llmAdapter: mockLLMAdapter,
      });
      
      expect(result.mappings.length).toBeGreaterThan(0);
      expect(result.mappings[0].targetField).toBe('body');
      expect(result.mappings[0].sourceField).toBe('body');
      expect(result.mappings[0].template).toBe('{{$json.body}}');
      expect(result.mappings[0].confidence).toBeGreaterThan(0.8);
      expect(result.mappings[0].needsReview).toBe(false);
      expect(result.overallConfidence).toBeGreaterThan(0.8);
    });
  });

  describe('Semantic Fallback Scenario', () => {
    it('should use semantic matching when exact match not available', async () => {
      (global as any).__TEST_SCENARIO__ = 'semanticFallback';
      
      const upstreamNode = createMockNode('http_request', ['content', 'status', 'headers']);
      const targetNode = createMockNode('google_gmail', ['to', 'subject', 'body']);
      
      const result = await generateTemplates({
        upstreamNode,
        targetNode,
        structuredIntent: 'Send email with body from HTTP response',
        llmAdapter: mockLLMAdapter,
      });
      
      expect(result.mappings.length).toBeGreaterThan(0);
      expect(result.mappings[0].targetField).toBe('body');
      expect(result.mappings[0].sourceField).toBe('content'); // Semantic match
      expect(result.mappings[0].template).toBe('{{$json.content}}');
      expect(result.mappings[0].confidence).toBeGreaterThan(0.7);
      expect(result.overallConfidence).toBeGreaterThan(0.7);
    });
  });

  describe('No Invention Scenario', () => {
    it('should NOT invent fields that do not exist', async () => {
      (global as any).__TEST_SCENARIO__ = 'noMatch';
      
      const upstreamNode = createMockNode('http_request', ['status', 'headers']); // No 'body' field
      const targetNode = createMockNode('google_gmail', ['to', 'subject', 'body']);
      
      const result = await generateTemplates({
        upstreamNode,
        targetNode,
        structuredIntent: 'Send email with body from HTTP response',
        llmAdapter: mockLLMAdapter,
      });
      
      // Should mark as needsReview if field doesn't exist
      const invalidMapping = result.mappings.find(m => m.sourceField === 'unknown_field');
      if (invalidMapping) {
        expect(invalidMapping.needsReview).toBe(true);
        expect(invalidMapping.confidence).toBeLessThan(0.5);
      }
      
      // Should have notes about the issue
      expect(result.notes.length).toBeGreaterThan(0);
    });
  });

  describe('Validation', () => {
    it('should validate that source fields exist in upstream schema', async () => {
      (global as any).__TEST_SCENARIO__ = 'noMatch';
      
      const upstreamNode = createMockNode('http_request', ['status', 'headers']);
      const targetNode = createMockNode('google_gmail', ['body']);
      
      const result = await generateTemplates({
        upstreamNode,
        targetNode,
        llmAdapter: mockLLMAdapter,
      });
      
      // All mappings should reference valid upstream fields
      for (const mapping of result.mappings) {
        if (!mapping.needsReview) {
          expect(result.upstreamSchema.outputFields).toContain(mapping.sourceField);
        }
      }
    });
  });
});
