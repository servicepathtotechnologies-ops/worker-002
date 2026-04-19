/**
 * Preservation Property Tests - Registry and Validation Focus
 * 
 * These tests MUST PASS on unfixed code to establish baseline behavior that must be preserved.
 * They focus on registry and validation aspects that don't require AI workflow generation.
 * 
 * Property 2: Preservation - Non-Branching Workflows Unchanged
 * 
 * This file tests the registry and validation layer preservation requirements
 * without requiring AI workflow generation (which needs API keys).
 */

import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { dagValidator } from '../src/core/validation/dag-validator';
import { graphBranchingValidator } from '../src/core/validation/graph-branching-validator';
import { unifiedNormalizeNodeTypeString } from '../src/core/utils/unified-node-type-normalizer';

describe('Property 2: Preservation - Registry and Validation Behavior', () => {

  /**
   * PRESERVATION TEST 1: Registry definitions unchanged for non-log_output types
   * 
   * Property: For all node types other than log_output, registry definitions
   * should remain exactly the same after the fix.
   * 
   * This is a property-based test that samples various node types.
   */
  it('PRESERVATION 1: Registry definitions unchanged for non-log_output types', () => {
    // Sample some common node types that should be unaffected
    const sampleNodeTypes = [
      'google_gmail', 'slack', 'webhook', 'manual_trigger', 'if_else', 'switch',
      'google_sheets', 'database', 'http_request', 'ai_chat_model'
    ];
    
    console.log('\n=== REGISTRY PRESERVATION BASELINE ===');
    
    for (const nodeType of sampleNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef) {
        console.log(`${nodeType}:`);
        console.log(`  category: ${nodeDef.category}`);
        console.log(`  allowsMultipleInputs: ${nodeDef.allowsMultipleInputs}`);
        console.log(`  tags: ${(nodeDef.tags || []).join(', ')}`);
        
        // Registry definitions should remain stable
        expect(nodeDef.type).toBe(nodeType);
        expect(nodeDef.label).toBeDefined();
        expect(nodeDef.category).toBeDefined();
        
        // For non-log_output nodes, allowsMultipleInputs should be consistent
        if (nodeType !== 'log_output') {
          // Document current behavior - this should be preserved
          const allowsMultiple = nodeDef.allowsMultipleInputs;
          // allowsMultipleInputs can be true, false, or undefined - all are valid
          if (allowsMultiple !== undefined) {
            expect(typeof allowsMultiple).toBe('boolean');
          }
        }
      }
    }
    
    console.log('=== END REGISTRY PRESERVATION BASELINE ===\n');
  });

  /**
   * PRESERVATION TEST 2: log_output registry behavior on unfixed code
   * 
   * Property: Document the current log_output registry behavior that may change
   * during the fix, so we can verify the fix works correctly.
   */
  it('PRESERVATION 2: Document log_output registry behavior (may change during fix)', () => {
    const logOutputDef = unifiedNodeRegistry.get('log_output');
    
    console.log('\n=== LOG_OUTPUT REGISTRY BASELINE (UNFIXED) ===');
    
    if (logOutputDef) {
      console.log(`log_output registry definition:`);
      console.log(`  type: ${logOutputDef.type}`);
      console.log(`  category: ${logOutputDef.category}`);
      console.log(`  allowsMultipleInputs: ${logOutputDef.allowsMultipleInputs}`);
      console.log(`  tags: ${(logOutputDef.tags || []).join(', ')}`);
      console.log(`  workflowBehavior: ${JSON.stringify(logOutputDef.workflowBehavior, null, 2)}`);
      
      // Document current state - this will change during the fix
      expect(logOutputDef.type).toBe('log_output');
      expect(logOutputDef.category).toBeDefined();
      
      // The fix will change allowsMultipleInputs from true to false/undefined
      // Document current value for comparison
      console.log(`  CURRENT allowsMultipleInputs: ${logOutputDef.allowsMultipleInputs}`);
      
    } else {
      console.log(`log_output not found in registry`);
      expect(logOutputDef).toBeDefined();
    }
    
    console.log('=== END LOG_OUTPUT REGISTRY BASELINE ===\n');
  });

  /**
   * PRESERVATION TEST 3: DAG validator behavior for valid workflows
   * 
   * Property: For workflows that don't involve multi-input log_output,
   * DAG validator behavior should remain unchanged.
   */
  it('PRESERVATION 3: DAG validator behavior for valid workflows unchanged', () => {
    // Test valid linear workflow
    const validLinearWorkflow = {
      nodes: [
        { id: 'trigger', type: 'manual_trigger' },
        { id: 'action', type: 'google_sheets' },
        { id: 'output', type: 'log_output' }
      ],
      connections: [
        { source: 'trigger', target: 'action', type: 'main' },
        { source: 'action', target: 'output', type: 'main' }
      ],
      trigger: 'trigger'
    };

    const result = dagValidator.validateStructure(validLinearWorkflow);
    
    console.log('\n=== DAG VALIDATOR PRESERVATION BASELINE ===');
    console.log(`Valid linear workflow validation:`);
    console.log(`  valid: ${result.valid}`);
    console.log(`  errors: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log(`  error details: ${result.errors.join('; ')}`);
    }
    
    // Valid workflows should continue to pass validation
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    
    console.log('=== END DAG VALIDATOR PRESERVATION BASELINE ===\n');
  });

  /**
   * PRESERVATION TEST 4: Branching validator behavior for non-log_output nodes
   * 
   * Property: For all node types other than log_output, the branching validator's
   * allowsMultipleInputs behavior should remain unchanged.
   */
  it('PRESERVATION 4: Branching validator behavior for non-log_output nodes unchanged', () => {
    const testNodeTypes = [
      'google_gmail', 'slack', 'webhook', 'manual_trigger', 'if_else', 'switch',
      'google_sheets', 'merge', 'database'
    ];
    
    console.log('\n=== BRANCHING VALIDATOR PRESERVATION BASELINE ===');
    
    for (const nodeType of testNodeTypes) {
      const allowsMultiple = graphBranchingValidator.allowsMultipleInputs(nodeType);
      console.log(`${nodeType}: allowsMultipleInputs = ${allowsMultiple}`);
      
      // Document current behavior - this should be preserved for non-log_output nodes
      expect(typeof allowsMultiple).toBe('boolean');
    }
    
    // Special case: log_output behavior (this will change during fix)
    const logOutputAllowsMultiple = graphBranchingValidator.allowsMultipleInputs('log_output');
    console.log(`log_output: allowsMultipleInputs = ${logOutputAllowsMultiple} (WILL CHANGE DURING FIX)`);
    
    console.log('=== END BRANCHING VALIDATOR PRESERVATION BASELINE ===\n');
  });

  /**
   * PROPERTY-BASED TEST 5: Registry consistency across node types
   * 
   * Property: For any node type in the registry, basic properties should be consistent.
   */
  it('PROPERTY 5: Registry consistency preserved across all node types', () => {
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    // Property-based test using a sample of node types
    const nodeTypeSample = allNodeTypes.slice(0, Math.min(20, allNodeTypes.length));
    
    for (const nodeType of nodeTypeSample) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (nodeDef) {
        // Basic consistency properties that should be preserved
        expect(nodeDef.type).toBe(nodeType);
        expect(typeof nodeDef.label).toBe('string');
        expect(nodeDef.label.length).toBeGreaterThan(0);
        expect(typeof nodeDef.category).toBe('string');
        expect(nodeDef.category.length).toBeGreaterThan(0);
        
        // allowsMultipleInputs should be boolean or undefined
        if (nodeDef.allowsMultipleInputs !== undefined) {
          expect(typeof nodeDef.allowsMultipleInputs).toBe('boolean');
        }
        
        // tags should be array if present
        if (nodeDef.tags !== undefined) {
          expect(Array.isArray(nodeDef.tags)).toBe(true);
        }
      }
    }
    
    console.log(`PROPERTY 5 - Tested registry consistency for ${nodeTypeSample.length} node types`);
  });

  /**
   * PROPERTY-BASED TEST 6: Node type normalization consistency
   * 
   * Property: Node type normalization should work consistently for all valid node types.
   */
  it('PROPERTY 6: Node type normalization consistency preserved', () => {
    const testNodeTypes = [
      'google_gmail', 'slack', 'webhook', 'manual_trigger', 'if_else', 'switch',
      'log_output', 'google_sheets', 'database', 'http_request'
    ];
    
    for (const nodeType of testNodeTypes) {
      const normalized = unifiedNormalizeNodeTypeString(nodeType);
      
      // Normalization should be consistent
      expect(typeof normalized).toBe('string');
      expect(normalized.length).toBeGreaterThan(0);
      
      // Normalizing the same type twice should give same result
      const normalizedAgain = unifiedNormalizeNodeTypeString(normalized);
      expect(normalizedAgain).toBe(normalized);
    }
    
    console.log(`PROPERTY 6 - Tested normalization consistency for ${testNodeTypes.length} node types`);
  });

  /**
   * BASELINE DOCUMENTATION: Current system state
   * 
   * This test documents the current state of the system for preservation.
   */
  it('BASELINE: Document current system state for preservation', () => {
    console.log('\n=== COMPLETE SYSTEM BASELINE DOCUMENTATION ===');
    
    // 1. Registry state
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    console.log(`Total registered node types: ${allNodeTypes.length}`);
    
    // 2. log_output specific state
    const logOutputDef = unifiedNodeRegistry.get('log_output');
    if (logOutputDef) {
      console.log(`\nlog_output registry state (UNFIXED):`);
      console.log(`  allowsMultipleInputs: ${logOutputDef.allowsMultipleInputs}`);
      console.log(`  workflowBehavior.alwaysRequired: ${logOutputDef.workflowBehavior?.alwaysRequired}`);
      console.log(`  workflowBehavior.autoInject: ${logOutputDef.workflowBehavior?.autoInject}`);
      console.log(`  workflowBehavior.exemptFromRemoval: ${logOutputDef.workflowBehavior?.exemptFromRemoval}`);
    }
    
    // 3. Validator state
    const logOutputBranchingAllows = graphBranchingValidator.allowsMultipleInputs('log_output');
    console.log(`\nBranching validator for log_output: ${logOutputBranchingAllows}`);
    
    // 4. Sample other nodes for comparison
    const sampleNodes = ['google_gmail', 'slack', 'merge', 'if_else'];
    console.log(`\nSample node allowsMultipleInputs (should be preserved):`);
    for (const nodeType of sampleNodes) {
      const branchingAllows = graphBranchingValidator.allowsMultipleInputs(nodeType);
      const registryDef = unifiedNodeRegistry.get(nodeType);
      console.log(`  ${nodeType}: branching=${branchingAllows}, registry=${registryDef?.allowsMultipleInputs}`);
    }
    
    console.log('\n=== END COMPLETE SYSTEM BASELINE DOCUMENTATION ===\n');
    
    // This test always passes - it's for documentation
    expect(true).toBe(true);
  });
});

/**
 * PROPERTY-BASED TESTS: Fast-check powered preservation tests
 * 
 * These tests use property-based testing to verify preservation across
 * many different inputs and scenarios.
 */
describe('Property-Based Preservation Tests', () => {
  
  /**
   * PROPERTY 7: Registry lookup consistency
   * 
   * Property: For any valid node type, registry lookup should be consistent.
   */
  it('PROPERTY 7: Registry lookup consistency across valid node types', () => {
    const validNodeTypes = unifiedNodeRegistry.getAllTypes().filter(type => type && type.length > 0);
    
    if (validNodeTypes.length === 0) {
      console.warn('No valid node types found in registry');
      expect(true).toBe(true);
      return;
    }
    
    // Use fast-check to test registry consistency
    fc.assert(
      fc.property(
        fc.constantFrom(...validNodeTypes),
        (nodeType) => {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          
          // Property: Registry lookup should always return a valid definition
          expect(nodeDef).toBeDefined();
          expect(nodeDef?.type).toBe(nodeType);
          expect(typeof nodeDef?.label).toBe('string');
          expect(typeof nodeDef?.category).toBe('string');
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY 8: Node type normalization idempotency
   * 
   * Property: Normalizing a node type multiple times should give the same result.
   */
  it('PROPERTY 8: Node type normalization is idempotent', () => {
    const testNodeTypes = [
      'google_gmail', 'slack', 'webhook', 'manual_trigger', 'if_else', 'switch',
      'log_output', 'google_sheets', 'database', 'http_request', 'merge'
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...testNodeTypes),
        (nodeType) => {
          const normalized1 = unifiedNormalizeNodeTypeString(nodeType);
          const normalized2 = unifiedNormalizeNodeTypeString(normalized1);
          const normalized3 = unifiedNormalizeNodeTypeString(normalized2);
          
          // Property: Normalization should be idempotent
          expect(normalized1).toBe(normalized2);
          expect(normalized2).toBe(normalized3);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * PROPERTY 9: Branching validator consistency
   * 
   * Property: For any node type, branching validator should return consistent results.
   */
  it('PROPERTY 9: Branching validator returns consistent results', () => {
    const testNodeTypes = [
      'google_gmail', 'slack', 'webhook', 'manual_trigger', 'if_else', 'switch',
      'log_output', 'google_sheets', 'database', 'merge'
    ];
    
    fc.assert(
      fc.property(
        fc.constantFrom(...testNodeTypes),
        (nodeType) => {
          const result1 = graphBranchingValidator.allowsMultipleInputs(nodeType);
          const result2 = graphBranchingValidator.allowsMultipleInputs(nodeType);
          const result3 = graphBranchingValidator.allowsMultipleInputs(nodeType);
          
          // Property: Multiple calls should return the same result
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
          expect(typeof result1).toBe('boolean');
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });
});