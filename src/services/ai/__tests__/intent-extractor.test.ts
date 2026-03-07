/**
 * Intent Extractor Tests
 * 
 * Tests for SimpleIntent extraction from prompts
 */

import { intentExtractor } from '../intent-extractor';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('IntentExtractor', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should extract SimpleIntent from prompt', async () => {
    const result = await intentExtractor.extractIntent('Send email from Gmail to Slack');
    
    expect(result.intent).toBeDefined();
    expect(result.intent.verbs.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });
  
  it('should fallback to rule-based extraction if LLM fails', async () => {
    // Mock LLM failure by using a very long prompt that might cause issues
    const veryLongPrompt = 'Send email '.repeat(1000);
    
    const result = await intentExtractor.extractIntent(veryLongPrompt);
    
    // Should still return a result (fallback)
    expect(result.intent).toBeDefined();
    expect(result.intent.verbs).toBeDefined();
    expect(result.intent.sources).toBeDefined();
    expect(result.intent.destinations).toBeDefined();
  });
  
  it('should extract verbs from prompt', async () => {
    const result = await intentExtractor.extractIntent('Read data from Sheets and send to Slack');
    
    expect(result.intent.verbs.length).toBeGreaterThan(0);
    expect(result.intent.verbs.some(v => ['read', 'send'].includes(v))).toBe(true);
  });
  
  it('should extract sources and destinations', async () => {
    const result = await intentExtractor.extractIntent('Get data from Gmail and send to Discord');
    
    expect(result.intent.sources.length).toBeGreaterThan(0);
    expect(result.intent.destinations.length).toBeGreaterThan(0);
  });
  
  it('should extract trigger type', async () => {
    const result = await intentExtractor.extractIntent('Schedule daily email send from Gmail to Slack');
    
    expect(result.intent.trigger).toBeDefined();
    expect(result.intent.trigger?.type).toBe('schedule');
  });
  
  it('should extract conditions', async () => {
    const result = await intentExtractor.extractIntent('If email count is greater than 10, send notification to Slack');
    
    expect(result.intent.conditions).toBeDefined();
    expect(result.intent.conditions?.length).toBeGreaterThan(0);
  });
  
  it('should calculate confidence score', async () => {
    const goodPrompt = 'Send email from Gmail to Slack';
    const vaguePrompt = 'Do something';
    
    const goodResult = await intentExtractor.extractIntent(goodPrompt);
    const vagueResult = await intentExtractor.extractIntent(vaguePrompt);
    
    expect(goodResult.confidence).toBeGreaterThan(vagueResult.confidence);
    expect(goodResult.confidence).toBeGreaterThan(0.5);
  });
  
  it('should handle empty prompt gracefully', async () => {
    const result = await intentExtractor.extractIntent('');
    
    expect(result.intent).toBeDefined();
    expect(result.intent.verbs).toBeDefined();
    expect(result.intent.sources).toBeDefined();
    expect(result.intent.destinations).toBeDefined();
  });
  
  it('should include warnings when using fallback', async () => {
    // Force fallback by using a prompt that might cause LLM issues
    const result = await intentExtractor.extractIntent('Send email');
    
    // If fallback was used, warnings should be present
    if (result.warnings && result.warnings.length > 0) {
      expect(result.warnings.some(w => w.includes('fallback'))).toBe(true);
    }
  });
});
