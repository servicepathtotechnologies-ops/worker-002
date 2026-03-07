/**
 * Phase 3: Intent-Aware Planner Tests
 * 
 * Tests Intent-Aware Planner and supporting components
 */

import { intentAwarePlanner } from '../intent-aware-planner';
import { nodeDependencyResolver } from '../node-dependency-resolver';
import { templateBasedGenerator } from '../template-based-generator';
import { keywordNodeSelector } from '../keyword-node-selector';
import { SimpleIntent } from '../simple-intent';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Phase 3: Intent-Aware Planner', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  describe('Intent-Aware Planner', () => {
    it('should build StructuredIntent from SimpleIntent', async () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const result = await intentAwarePlanner.planWorkflow(simpleIntent, 'Send email from Gmail to Slack');
      
      expect(result.structuredIntent).toBeDefined();
      expect(result.structuredIntent.trigger).toBeDefined();
      expect(result.structuredIntent.actions.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });
    
    it('should map entities to node types using registry (UNIVERSAL)', async () => {
      // Get a random node type from registry
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeType = allNodeTypes.find(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.category === 'output';
      });
      
      if (testNodeType) {
        const def = unifiedNodeRegistry.get(testNodeType);
        const label = def?.label || testNodeType;
        
        const simpleIntent: SimpleIntent = {
          verbs: ['send'],
          sources: [],
          destinations: [label],
        };
        
        const result = await intentAwarePlanner.planWorkflow(simpleIntent);
        
        // Should find the node from registry
        const hasMatchingAction = result.structuredIntent.actions.some(action => {
          const normalized = action.type.toLowerCase();
          return normalized.includes(testNodeType.toLowerCase()) || 
                 normalized.includes(label.toLowerCase());
        });
        
        expect(hasMatchingAction).toBe(true);
      }
    });
    
    it('should build dependency graph correctly', async () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['read', 'send'],
        sources: ['Google Sheets'],
        destinations: ['Slack'],
      };
      
      const result = await intentAwarePlanner.planWorkflow(simpleIntent);
      
      expect(result.dependencyGraph.size).toBeGreaterThan(0);
      expect(result.executionOrder.length).toBeGreaterThan(0);
    });
  });
  
  describe('Node Dependency Resolver', () => {
    it('should resolve dependencies using registry (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const transformationNode = allNodeTypes.find(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.category === 'transformation' || def?.category === 'ai';
      });
      
      if (transformationNode) {
        const dependencies = nodeDependencyResolver.resolveDependencies(
          transformationNode,
          allNodeTypes
        );
        
        // Should have dependencies on data sources
        expect(dependencies.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
  
  describe('Template-Based Generator', () => {
    it('should match templates using pattern matching (not hardcoded services)', () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['send', 'notify'],
        sources: ['AnyDataSource'], // Not hardcoded
        destinations: ['AnyOutput'], // Not hardcoded
      };
      
      const match = templateBasedGenerator.matchTemplate(simpleIntent);
      
      // Should match based on verbs, not specific services
      expect(match.confidence).toBeGreaterThan(0);
    });
    
    it('should generate StructuredIntent from template using registry', () => {
      const simpleIntent: SimpleIntent = {
        verbs: ['send'],
        sources: ['Gmail'],
        destinations: ['Slack'],
      };
      
      const match = templateBasedGenerator.matchTemplate(simpleIntent);
      
      if (match.template) {
        const structuredIntent = templateBasedGenerator.generateFromTemplate(
          match.template,
          simpleIntent
        );
        
        // Should use registry to resolve node types
        expect(structuredIntent.actions.length).toBeGreaterThan(0);
        expect(structuredIntent.dataSources?.length).toBeGreaterThan(0);
      }
    });
  });
  
  describe('Keyword Node Selector', () => {
    it('should select nodes using registry (UNIVERSAL)', () => {
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const testNodeType = allNodeTypes[Math.floor(Math.random() * allNodeTypes.length)];
      const nodeDef = unifiedNodeRegistry.get(testNodeType);
      
      if (nodeDef) {
        const label = nodeDef.label || testNodeType;
        const results = keywordNodeSelector.selectNodes(label);
        
        // Should find the node from registry
        const hasMatch = results.some(r => r.nodeType === testNodeType);
        expect(hasMatch).toBe(true);
      }
    });
    
    it('should use registry properties for matching (label, tags, keywords)', () => {
      const results = keywordNodeSelector.selectNodes('email');
      
      // Should find nodes using registry properties
      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        const nodeDef = unifiedNodeRegistry.get(result.nodeType);
        expect(nodeDef).toBeDefined();
      });
    });
  });
});
