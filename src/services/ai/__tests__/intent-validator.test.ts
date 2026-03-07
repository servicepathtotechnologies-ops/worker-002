/**
 * Intent Validator Tests
 * 
 * Tests for SimpleIntent validation
 */

import { intentValidator } from '../intent-validator';
import { SimpleIntent } from '../simple-intent';

describe('IntentValidator', () => {
  it('should validate complete intent', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
    };
    
    const result = intentValidator.validate(intent);
    
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  
  it('should reject intent without verbs', () => {
    const intent: SimpleIntent = {
      verbs: [],
      sources: ['Gmail'],
      destinations: ['Slack'],
    };
    
    const result = intentValidator.validate(intent);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No actions'))).toBe(true);
    expect(result.suggestions).toBeDefined();
  });
  
  it('should reject intent without sources or destinations', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: [],
      destinations: [],
    };
    
    const result = intentValidator.validate(intent);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No data sources or destinations'))).toBe(true);
  });
  
  it('should validate trigger types using registry (UNIVERSAL)', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
      trigger: {
        type: 'schedule',
      },
    };
    
    const result = intentValidator.validate(intent);
    
    // Should validate using registry, not hardcoded list
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  
  it('should warn about invalid trigger type', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
      trigger: {
        type: 'invalid_trigger' as any,
      },
    };
    
    const result = intentValidator.validate(intent);
    
    expect(result.errors.some(e => e.includes('Invalid trigger type'))).toBe(true);
  });
  
  it('should validate transformations using registry (UNIVERSAL)', () => {
    const intent: SimpleIntent = {
      verbs: ['read'],
      sources: ['Google Sheets'],
      destinations: ['Slack'],
      transformations: ['summarize'],
    };
    
    const result = intentValidator.validate(intent);
    
    // Should validate using registry, not hardcoded list
    expect(result.valid).toBe(true);
  });
  
  it('should check minimum entities', () => {
    const validIntent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: [],
    };
    
    const invalidIntent: SimpleIntent = {
      verbs: [],
      sources: [],
      destinations: [],
    };
    
    expect(intentValidator.hasMinimumEntities(validIntent)).toBe(true);
    expect(intentValidator.hasMinimumEntities(invalidIntent)).toBe(false);
  });
  
  it('should calculate completeness score', () => {
    const completeIntent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
      trigger: {
        type: 'schedule',
      },
      transformations: ['summarize'],
    };
    
    const incompleteIntent: SimpleIntent = {
      verbs: ['send'],
      sources: [],
      destinations: [],
    };
    
    const completeScore = intentValidator.getCompletenessScore(completeIntent);
    const incompleteScore = intentValidator.getCompletenessScore(incompleteIntent);
    
    expect(completeScore).toBeGreaterThan(incompleteScore);
    expect(completeScore).toBeGreaterThan(0.5);
  });
  
  it('should detect source/destination overlap', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Gmail'], // Same as source
    };
    
    const result = intentValidator.validate(intent);
    
    expect(result.warnings.some(w => w.includes('overlap'))).toBe(true);
  });
});
