/**
 * Fallback Intent Generator Tests
 * 
 * Tests for rule-based SimpleIntent generation (no LLM)
 */

import { fallbackIntentGenerator } from '../fallback-intent-generator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('FallbackIntentGenerator', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should extract verbs from prompt', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Send email to Slack');
    
    expect(result.intent.verbs.length).toBeGreaterThan(0);
    expect(result.intent.verbs).toContain('send');
  });
  
  it('should extract sources using registry (UNIVERSAL)', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Read data from Gmail and Google Sheets');
    
    expect(result.intent.sources.length).toBeGreaterThan(0);
    // Should find sources from registry, not hardcoded
    expect(result.intent.sources.some(s => s.toLowerCase().includes('gmail') || s.toLowerCase().includes('sheets'))).toBe(true);
  });
  
  it('should extract destinations using registry (UNIVERSAL)', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Send data to Slack and Discord');
    
    expect(result.intent.destinations.length).toBeGreaterThan(0);
    // Should find destinations from registry, not hardcoded
    expect(result.intent.destinations.some(d => d.toLowerCase().includes('slack') || d.toLowerCase().includes('discord'))).toBe(true);
  });
  
  it('should extract trigger type', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Schedule daily email send');
    
    expect(result.intent.trigger).toBeDefined();
    expect(result.intent.trigger?.type).toBe('schedule');
  });
  
  it('should extract conditions', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('If value is greater than 10, send notification');
    
    expect(result.intent.conditions).toBeDefined();
    expect(result.intent.conditions?.length).toBeGreaterThan(0);
  });
  
  it('should extract transformations using registry (UNIVERSAL)', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Summarize and filter data from Sheets');
    
    expect(result.intent.transformations).toBeDefined();
    expect(result.intent.transformations?.length).toBeGreaterThan(0);
  });
  
  it('should work with any node type from registry', () => {
    // Get a random node type from registry
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const testNodeType = allTypes[Math.floor(Math.random() * allTypes.length)];
    const nodeDef = unifiedNodeRegistry.get(testNodeType);
    
    if (nodeDef) {
      const label = nodeDef.label || testNodeType;
      const result = fallbackIntentGenerator.generateFromPrompt(`Use ${label} to send data`);
      
      // Should extract the node from registry (not hardcoded)
      expect(result.intent.sources.length + result.intent.destinations.length).toBeGreaterThan(0);
    }
  });
  
  it('should calculate confidence score', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('Send email to Slack');
    
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.7); // Rule-based is capped at 0.7
  });
  
  it('should handle empty prompt gracefully', () => {
    const result = fallbackIntentGenerator.generateFromPrompt('');
    
    expect(result.intent.verbs).toBeDefined();
    expect(result.intent.sources).toBeDefined();
    expect(result.intent.destinations).toBeDefined();
  });
});
