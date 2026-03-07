/**
 * ✅ PHASE 4: Proactive Error Prevention
 * 
 * Prevents errors at source instead of fixing them downstream.
 * This fixes Root Cause #3: Reactive Error Fixing
 * 
 * Strategy: Fail-fast at source, prevent errors from propagating
 * 
 * COMPREHENSIVE PREVENTION:
 * - DSL-level prevention (before compilation)
 * - Compilation-level prevention (before edge creation)
 * - Workflow-level prevention (before validation)
 */

import { WorkflowDSL } from '../../services/ai/workflow-dsl';
import { Workflow, WorkflowNode } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface PreventionResult {
  prevented: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * ✅ PROACTIVE: Prevent missing trigger errors
 * Checks BEFORE compilation that trigger exists
 */
export function preventMissingTrigger(dsl: WorkflowDSL): PreventionResult {
  if (!dsl.trigger || !dsl.trigger.type) {
    return {
      prevented: true,
      error: 'Cannot compile DSL: Missing trigger. Trigger is required for workflow execution.',
    };
  }
  
  const triggerType = unifiedNormalizeNodeTypeString(dsl.trigger.type);
  const triggerDef = unifiedNodeRegistry.get(triggerType);
  
  if (!triggerDef) {
    return {
      prevented: true,
      error: `Cannot compile DSL: Trigger type "${dsl.trigger.type}" not found in registry.`,
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PROACTIVE: Prevent missing output errors
 * Checks BEFORE compilation that output exists
 */
export function preventMissingOutput(dsl: WorkflowDSL): PreventionResult {
  if (!dsl.outputs || dsl.outputs.length === 0) {
    return {
      prevented: true,
      error: 'Cannot compile DSL: Missing output nodes. At least one output is required for workflow execution.',
    };
  }
  
  // ✅ PHASE 4: Validate all output types exist in registry (immutable)
  let invalidOutputs: string[] = [];
  for (const output of dsl.outputs) {
    const outputType = unifiedNormalizeNodeTypeString(output.type);
    const outputDef = unifiedNodeRegistry.get(outputType);
    if (!outputDef) {
      invalidOutputs = [...invalidOutputs, output.type]; // ✅ PHASE 4: Immutable add
    }
  }
  
  if (invalidOutputs.length > 0) {
    return {
      prevented: true,
      error: `Cannot compile DSL: Invalid output node types: ${invalidOutputs.join(', ')}. These types are not registered.`,
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PROACTIVE: Prevent orphan node errors
 * Checks BEFORE edge creation that all nodes will be connected
 */
export function preventOrphanNodes(workflow: Workflow): PreventionResult {
  const nodeIds = new Set(workflow.nodes.map(n => n.id));
  const connectedNodeIds = new Set<string>();
  
  // Mark trigger as connected (triggers don't need inputs)
  const triggerNodes = workflow.nodes.filter(n => {
    const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
    return unifiedNodeRegistry.isTrigger(nodeType);
  });
  triggerNodes.forEach(n => connectedNodeIds.add(n.id));
  
  // Mark nodes connected by edges
  workflow.edges.forEach(edge => {
    connectedNodeIds.add(edge.target);
  });
  
  // Find orphan nodes
  const orphanNodes = workflow.nodes.filter(n => !connectedNodeIds.has(n.id));
  
  if (orphanNodes.length > 0) {
    const orphanTypes = orphanNodes.map(n => unifiedNormalizeNodeTypeString(n.type || n.data?.type || ''));
    return {
      prevented: true,
      error: `Cannot create workflow: Found ${orphanNodes.length} orphan node(s): ${orphanTypes.join(', ')}. All nodes must be connected.`,
      warnings: [`Orphan nodes: ${orphanNodes.map(n => n.id).join(', ')}`],
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PROACTIVE: Prevent invalid node type errors
 * Checks BEFORE compilation that all node types are valid
 */
export function preventInvalidNodeTypes(dsl: WorkflowDSL): PreventionResult {
  // ✅ PHASE 4: Build arrays immutably (use let for reassignment)
  let invalidTypes: string[] = [];
  let warnings: string[] = [];
  
  // Check data sources
  for (const ds of dsl.dataSources) {
    const nodeType = unifiedNormalizeNodeTypeString(ds.type);
    if (!unifiedNodeRegistry.has(nodeType)) {
      invalidTypes = [...invalidTypes, `dataSource: ${ds.type}`]; // ✅ PHASE 4: Immutable add
    }
  }
  
  // Check transformations
  for (const tf of dsl.transformations) {
    const nodeType = unifiedNormalizeNodeTypeString(tf.type);
    if (!unifiedNodeRegistry.has(nodeType)) {
      invalidTypes = [...invalidTypes, `transformation: ${tf.type}`]; // ✅ PHASE 4: Immutable add
    }
  }
  
  // Check outputs
  for (const out of dsl.outputs) {
    const nodeType = unifiedNormalizeNodeTypeString(out.type);
    if (!unifiedNodeRegistry.has(nodeType)) {
      invalidTypes = [...invalidTypes, `output: ${out.type}`]; // ✅ PHASE 4: Immutable add
    }
  }
  
  if (invalidTypes.length > 0) {
    return {
      prevented: true,
      error: `Cannot compile DSL: Invalid node types found: ${invalidTypes.join(', ')}. These types are not registered in the node registry.`,
      warnings,
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PROACTIVE: Prevent multiple trigger errors
 * Checks BEFORE compilation that only one trigger exists
 */
export function preventMultipleTriggers(dsl: WorkflowDSL): PreventionResult {
  // DSL should only have one trigger, but check dataSources for triggers too
  const triggerCount = dsl.dataSources.filter(ds => {
    const nodeType = unifiedNormalizeNodeTypeString(ds.type);
    return unifiedNodeRegistry.isTrigger(nodeType);
  }).length;
  
  if (triggerCount > 0) {
    return {
      prevented: true,
      error: `Cannot compile DSL: Found ${triggerCount} trigger(s) in dataSources. Triggers should be in trigger field, not dataSources.`,
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PHASE 4: Prevent edge/connection errors
 * Checks BEFORE edge creation that connections will be valid
 */
export function preventEdgeErrors(dsl: WorkflowDSL): PreventionResult {
  // ✅ PHASE 4: Build array immutably (use let for reassignment)
  let warnings: string[] = [];
  
  // Check that data sources can connect to transformations
  for (const ds of dsl.dataSources) {
    const dsType = unifiedNormalizeNodeTypeString(ds.type);
    const dsDef = unifiedNodeRegistry.get(dsType);
    if (!dsDef) continue;
    
    // Check if data source has outputs
    const hasOutputs = dsDef.outgoingPorts && dsDef.outgoingPorts.length > 0;
    if (!hasOutputs) {
      warnings = [...warnings, `Data source "${dsType}" has no output ports - may not be able to connect to transformations`]; // ✅ PHASE 4: Immutable add
    }
  }
  
  // Check that transformations can connect to outputs
  for (const tf of dsl.transformations) {
    const tfType = unifiedNormalizeNodeTypeString(tf.type);
    const tfDef = unifiedNodeRegistry.get(tfType);
    if (!tfDef) continue;
    
    // Check if transformation has outputs
    const hasOutputs = tfDef.outgoingPorts && tfDef.outgoingPorts.length > 0;
    if (!hasOutputs) {
      warnings = [...warnings, `Transformation "${tfType}" has no output ports - may not be able to connect to outputs`]; // ✅ PHASE 4: Immutable add
    }
  }
  
  // Check that outputs have inputs
  for (const out of dsl.outputs) {
    const outType = unifiedNormalizeNodeTypeString(out.type);
    const outDef = unifiedNodeRegistry.get(outType);
    if (!outDef) continue;
    
    // Check if output has inputs
    const hasInputs = outDef.incomingPorts && outDef.incomingPorts.length > 0;
    if (!hasInputs) {
      return {
        prevented: true,
        error: `Output "${outType}" has no input ports - cannot receive data from transformations or data sources`,
        warnings,
      };
    }
  }
  
  if (warnings.length > 0) {
    return {
      prevented: false,
      warnings,
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PHASE 4: Prevent cycle errors
 * Checks BEFORE edge creation that no cycles will be created
 */
export function preventCycles(dsl: WorkflowDSL): PreventionResult {
  // Build dependency graph from execution order
  const dependencies = new Map<string, string[]>();
  
  // Add trigger as root
  dependencies.set('trigger', []);
  
  // Add data sources (depend on trigger)
  for (const ds of dsl.dataSources) {
    dependencies.set(ds.id, ['trigger']);
  }
  
  // Add transformations (depend on their inputs)
  for (const tf of dsl.transformations) {
    if (tf.input?.sourceId) {
      dependencies.set(tf.id, [tf.input.sourceId]);
    } else {
      dependencies.set(tf.id, []);
    }
  }
  
  // Add outputs (depend on their inputs)
  for (const out of dsl.outputs) {
    if (out.input?.sourceId) {
      dependencies.set(out.id, [out.input.sourceId]);
    } else {
      dependencies.set(out.id, []);
    }
  }
  
  // Check for cycles using DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  const hasCycle = (nodeId: string): boolean => {
    visited.add(nodeId);
    recStack.add(nodeId);
    
    const deps = dependencies.get(nodeId) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (hasCycle(dep)) {
          return true;
        }
      } else if (recStack.has(dep)) {
        return true; // Cycle detected
      }
    }
    
    recStack.delete(nodeId);
    return false;
  };
  
  for (const nodeId of dependencies.keys()) {
    if (!visited.has(nodeId)) {
      if (hasCycle(nodeId)) {
        return {
          prevented: true,
          error: `Cannot compile DSL: Cycle detected in execution order. Workflow must be acyclic.`,
        };
      }
    }
  }
  
  return { prevented: false };
}

/**
 * ✅ PHASE 4: Prevent empty workflow errors
 * Checks BEFORE compilation that workflow has content
 */
export function preventEmptyWorkflow(dsl: WorkflowDSL): PreventionResult {
  const hasDataSources = dsl.dataSources && dsl.dataSources.length > 0;
  const hasTransformations = dsl.transformations && dsl.transformations.length > 0;
  const hasOutputs = dsl.outputs && dsl.outputs.length > 0;
  
  if (!hasDataSources && !hasTransformations && !hasOutputs) {
    return {
      prevented: true,
      error: 'Cannot compile DSL: Empty workflow. Workflow must have at least one data source, transformation, or output.',
    };
  }
  
  return { prevented: false };
}

/**
 * ✅ PHASE 4: Comprehensive prevention - Prevent all common errors at source
 * Runs all prevention checks before compilation
 */
export function preventAllErrors(dsl: WorkflowDSL): {
  prevented: boolean;
  errors: string[];
  warnings: string[];
} {
  // ✅ PHASE 4: Build arrays immutably
  let errors: string[] = [];
  let warnings: string[] = [];
  
  // Run all prevention checks
  const checks = [
    preventMissingTrigger(dsl),
    preventMissingOutput(dsl),
    preventInvalidNodeTypes(dsl),
    preventMultipleTriggers(dsl),
    preventEmptyWorkflow(dsl),
    preventEdgeErrors(dsl),
    preventCycles(dsl),
  ];
  
  for (const check of checks) {
    if (check.prevented) {
      if (check.error) {
        errors = [...errors, check.error]; // ✅ PHASE 4: Immutable add
      }
      if (check.warnings) {
        warnings = [...warnings, ...check.warnings]; // ✅ PHASE 4: Immutable add
      }
    } else if (check.warnings) {
      warnings = [...warnings, ...check.warnings]; // ✅ PHASE 4: Immutable add
    }
  }
  
  return {
    prevented: errors.length > 0,
    errors,
    warnings,
  };
}
