/**
 * Intent Repair Engine Tests
 * 
 * Tests for SimpleIntent repair functionality
 */

import { intentRepairEngine } from '../intent-repair-engine';
import { intentValidator } from '../intent-validator';
import { SimpleIntent } from '../simple-intent';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('IntentRepairEngine', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should add missing verbs', () => {
    const intent: SimpleIntent = {
      verbs: [],
      sources: [],
      destinations: ['Slack'],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation, 'Send data to Slack');
    
    expect(result.repairedIntent.verbs.length).toBeGreaterThan(0);
    expect(result.repairs.some(r => r.includes('verb'))).toBe(true);
  });
  
  it('should normalize entity names using registry (UNIVERSAL)', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['google gmail', 'google sheets'], // Variations
      destinations: ['slack'],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation);
    
    // Should normalize using registry labels, not hardcoded mappings
    expect(result.repairs.some(r => r.includes('Normalized'))).toBe(true);
    // Normalized names should match registry labels
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const hasValidSource = result.repairedIntent.sources?.some(s => {
      return allTypes.some(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.label === s;
      });
    });
    expect(hasValidSource).toBe(true);
  });
  
  it('should add missing sources/destinations using registry (UNIVERSAL)', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: [],
      destinations: [],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation, 'Send Gmail to Slack');
    
    // Should infer from prompt using registry
    expect(result.repairedIntent.sources?.length || result.repairedIntent.destinations?.length).toBeGreaterThan(0);
    expect(result.repairs.some(r => r.includes('inferred'))).toBe(true);
  });
  
  it('should add default trigger if missing', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation);
    
    expect(result.repairedIntent.trigger).toBeDefined();
    expect(result.repairedIntent.trigger?.type).toBe('manual');
    expect(result.repairs.some(r => r.includes('trigger'))).toBe(true);
  });
  
  it('should remove duplicate entities', () => {
    const intent: SimpleIntent = {
      verbs: ['send', 'send', 'read'],
      sources: ['Gmail', 'Gmail'],
      destinations: ['Slack'],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation);
    
    expect(result.repairs.some(r => r.includes('duplicate'))).toBe(true);
    expect(result.repairedIntent.verbs.length).toBeLessThan(intent.verbs.length);
  });
  
  it('should validate and fix conditions', () => {
    const intent: SimpleIntent = {
      verbs: ['send'],
      sources: ['Gmail'],
      destinations: ['Slack'],
      conditions: [
        {
          description: 'if value > 10',
          type: 'if',
        },
        {
          description: '', // Invalid empty condition
          type: 'if',
        },
      ],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation);
    
    // Should remove invalid conditions
    const validConditions = result.repairedIntent.conditions?.filter(c => c.description.trim().length > 0);
    expect(validConditions?.length).toBe(1);
  });
  
  it('should work with any node type from registry', () => {
    // Get a random node type from registry
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const testNodeType = allTypes[Math.floor(Math.random() * allTypes.length)];
    const nodeDef = unifiedNodeRegistry.get(testNodeType);
    
    if (nodeDef) {
      const label = nodeDef.label || testNodeType;
      const intent: SimpleIntent = {
        verbs: ['send'],
        sources: [label.toLowerCase()], // Use lowercase variation
        destinations: [],
      };
      
      const validation = intentValidator.validate(intent);
      const result = intentRepairEngine.repair(intent, validation);
      
      // Should normalize using registry (not hardcoded)
      expect(result.repairedIntent.sources).toBeDefined();
      // Normalized name should match registry label
      const normalizedSource = result.repairedIntent.sources?.[0];
      if (normalizedSource) {
        const matchesRegistry = allTypes.some(type => {
          const def = unifiedNodeRegistry.get(type);
          return def?.label === normalizedSource;
        });
        expect(matchesRegistry).toBe(true);
      }
    }
  });
  
  it('should return list of repairs made', () => {
    const intent: SimpleIntent = {
      verbs: [],
      sources: [],
      destinations: [],
    };
    
    const validation = intentValidator.validate(intent);
    const result = intentRepairEngine.repair(intent, validation, 'Send Gmail to Slack');
    
    expect(result.repairs.length).toBeGreaterThan(0);
    expect(result.repairs.every(r => typeof r === 'string')).toBe(true);
  });
});
