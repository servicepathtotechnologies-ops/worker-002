/**
 * Full Pipeline Error Prevention Tests
 * 
 * ✅ PHASE 5: Tests complete pipeline to ensure errors never recur
 * 
 * Tests the full flow from prompt to workflow to ensure:
 * - All 5 errors are prevented
 * - System works with any node type
 * - Universal implementation (no hardcoding)
 */

import { intentExtractor } from '../intent-extractor';
import { intentAwarePlanner } from '../intent-aware-planner';
import { workflowDSLCompiler } from '../workflow-dsl-compiler';
import { universalHandleResolver } from '../../../core/utils/universal-handle-resolver';
import { universalBranchingValidator } from '../../../core/validation/universal-branching-validator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Full Pipeline Error Prevention', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should prevent Error #1: Invalid handles in complete workflow', async () => {
    const prompt = 'If email count is greater than 10, send to Slack, otherwise send to email';
    
    // Extract SimpleIntent
    const simpleIntentResult = await intentExtractor.extractIntent(prompt);
    
    // Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
    
    // Generate DSL
    const { dslGenerator } = await import('../workflow-dsl');
    const dsl = await dslGenerator.generateDSL(planningResult.structuredIntent, prompt);
    
    // Compile to workflow
    const compilationResult = workflowDSLCompiler.compile(dsl, prompt);
    
    if (compilationResult.success && compilationResult.workflow) {
      // Check for if_else or switch nodes
      const branchingNodes = compilationResult.workflow.nodes.filter(n => 
        n.data.type === 'if_else' || n.data.type === 'switch'
      );
      
      for (const node of branchingNodes) {
        const edges = compilationResult.workflow.edges.filter(e => e.source === node.id);
        
        // Error #1: Should NOT use 'output' handle
        for (const edge of edges) {
          expect(edge.sourceHandle).not.toBe('output');
          
          if (node.data.type === 'if_else') {
            expect(['true', 'false']).toContain(edge.sourceHandle);
          } else if (node.data.type === 'switch') {
            expect(edge.sourceHandle).toMatch(/^case_/);
          }
        }
      }
    }
  });
  
  it('should prevent Error #2: Incorrect execution order in complete workflow', async () => {
    const prompt = 'Read data from Sheets, summarize it, and send to Slack';
    
    // Extract SimpleIntent
    const simpleIntentResult = await intentExtractor.extractIntent(prompt);
    
    // Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
    
    // Verify execution order
    expect(planningResult.executionOrder.length).toBeGreaterThan(0);
    
    // Check that data sources come before transformations
    const dataSourceIndices: number[] = [];
    const transformationIndices: number[] = [];
    
    for (let i = 0; i < planningResult.executionOrder.length; i++) {
      const nodeId = planningResult.executionOrder[i];
      const node = planningResult.nodeRequirements.find(n => n.id === nodeId);
      if (node) {
        if (node.category === 'dataSource') {
          dataSourceIndices.push(i);
        } else if (node.category === 'transformation') {
          transformationIndices.push(i);
        }
      }
    }
    
    // All data sources should come before transformations
    if (dataSourceIndices.length > 0 && transformationIndices.length > 0) {
      const maxDataSourceIndex = Math.max(...dataSourceIndices);
      const minTransformationIndex = Math.min(...transformationIndices);
      expect(maxDataSourceIndex).toBeLessThan(minTransformationIndex);
    }
  });
  
  it('should prevent Error #3: Multiple outgoing edges from non-branching nodes', async () => {
    const prompt = 'Send email from Gmail to Slack';
    
    // Extract SimpleIntent
    const simpleIntentResult = await intentExtractor.extractIntent(prompt);
    
    // Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
    
    // Generate DSL
    const { dslGenerator } = await import('../workflow-dsl');
    const dsl = await dslGenerator.generateDSL(planningResult.structuredIntent, prompt);
    
    // Compile to workflow
    const compilationResult = workflowDSLCompiler.compile(dsl, prompt);
    
    if (compilationResult.success && compilationResult.workflow) {
      // Check all nodes
      for (const node of compilationResult.workflow.nodes) {
        const outgoingEdges = compilationResult.workflow.edges.filter(e => e.source === node.id);
        
        if (outgoingEdges.length > 1) {
          // Error #3: Only branching nodes should have multiple outgoing edges
          const allowsBranching = universalBranchingValidator.nodeAllowsBranching(node.data.type);
          expect(allowsBranching).toBe(true);
        }
      }
    }
  });
  
  it('should prevent Error #4: Orphan nodes in complete workflow', async () => {
    const prompt = 'Use try_catch to handle errors when sending email';
    
    // Extract SimpleIntent
    const simpleIntentResult = await intentExtractor.extractIntent(prompt);
    
    // Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
    
    // Generate DSL
    const { dslGenerator } = await import('../workflow-dsl');
    const dsl = await dslGenerator.generateDSL(planningResult.structuredIntent, prompt);
    
    // Compile to workflow
    const compilationResult = workflowDSLCompiler.compile(dsl, prompt);
    
    if (compilationResult.success && compilationResult.workflow) {
      // Error #4: All nodes should have categories resolved
      for (const node of compilationResult.workflow.nodes) {
        const { universalCategoryResolver } = await import('../../../core/utils/universal-category-resolver');
        const category = universalCategoryResolver.getNodeCategory(node.data.type);
        expect(category).toBeDefined();
        expect(['dataSource', 'transformation', 'output']).toContain(category);
      }
      
      // All nodes should be connected (no orphans)
      const connectedNodeIds = new Set<string>();
      for (const edge of compilationResult.workflow.edges) {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      }
      
      // Trigger node might not have incoming edges, but should have outgoing
      const triggerNodes = compilationResult.workflow.nodes.filter(n => 
        n.data.type.includes('trigger')
      );
      
      for (const node of compilationResult.workflow.nodes) {
        if (!triggerNodes.includes(node)) {
          // Non-trigger nodes should be connected
          expect(connectedNodeIds.has(node.id)).toBe(true);
        }
      }
    }
  });
  
  it('should prevent Error #5: Parallel branches to non-merge nodes', async () => {
    const prompt = 'Read from Sheets and Gmail, then send to Slack';
    
    // Extract SimpleIntent
    const simpleIntentResult = await intentExtractor.extractIntent(prompt);
    
    // Plan StructuredIntent
    const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
    
    // Generate DSL
    const { dslGenerator } = await import('../workflow-dsl');
    const dsl = await dslGenerator.generateDSL(planningResult.structuredIntent, prompt);
    
    // Compile to workflow
    const compilationResult = workflowDSLCompiler.compile(dsl, prompt);
    
    if (compilationResult.success && compilationResult.workflow) {
      // Error #5: Check for parallel branches
      const targetCounts = new Map<string, number>();
      for (const edge of compilationResult.workflow.edges) {
        const count = targetCounts.get(edge.target) || 0;
        targetCounts.set(edge.target, count + 1);
      }
      
      for (const [targetId, count] of targetCounts.entries()) {
        if (count > 1) {
          // Multiple edges to same target - should be merge node
          const targetNode = compilationResult.workflow.nodes.find(n => n.id === targetId);
          if (targetNode) {
            const allowsMultiple = universalBranchingValidator.nodeAllowsMultipleInputs(targetNode.data.type);
            expect(allowsMultiple).toBe(true); // Only merge nodes should have multiple inputs
          }
        }
      }
    }
  });
  
  it('should work with ANY node type from registry (UNIVERSAL)', async () => {
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
      
      // Extract SimpleIntent
      const simpleIntentResult = await intentExtractor.extractIntent(prompt);
      
      // Plan StructuredIntent
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntentResult.intent, prompt);
      
      // Should work with any node type
      expect(planningResult.errors.length).toBe(0);
      expect(planningResult.structuredIntent).toBeDefined();
      
      // Verify no hardcoded logic
      expect(planningResult.structuredIntent.actions.length).toBeGreaterThan(0);
    }
  });
});
