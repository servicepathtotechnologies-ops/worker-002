/**
 * SimpleIntent Structure Tests
 * 
 * Tests for SimpleIntent type definitions and structure
 */

import { SimpleIntent } from '../simple-intent';

describe('SimpleIntent Structure', () => {
  it('should have required fields', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
    };
    
    expect(intent.verbs).toBeDefined();
    expect(intent.sources).toBeDefined();
    expect(intent.destinations).toBeDefined();
  });
  
  it('should support optional trigger', () => {
    const intent: SimpleIntent = {
      verbs: ['read'],
      sources: ['Google Sheets'],
      destinations: [],
      trigger: {
        type: 'schedule',
      },
    };
    
    expect(intent.trigger).toBeDefined();
    expect(intent.trigger?.type).toBe('schedule');
  });
  
  it('should support conditions', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
      conditions: [
        {
          description: 'if value > 10',
          type: 'if',
        },
      ],
    };
    
    expect(intent.conditions).toBeDefined();
    expect(intent.conditions?.length).toBe(1);
  });
  
  it('should support transformations', () => {
    const intent: SimpleIntent = {
      verbs: ['read'],
      sources: ['Google Sheets'],
      destinations: ['Slack'],
      transformations: ['summarize', 'filter'],
    };
    
    expect(intent.transformations).toBeDefined();
    expect(intent.transformations?.length).toBe(2);
  });
});
