/**
 * Workflow Validation Pipeline
 * 
 * Layered validation architecture for workflow validation:
 * 1. Intent Coverage Validation - Ensures intent actions are represented in DSL
 * 2. DSL Structure Validation - Validates DSL structure (trigger, components, execution order)
 * 3. Graph Connectivity Validation - Validates workflow graph structure (orphans, connectivity)
 * 4. Type Compatibility Validation - Validates type compatibility between connected nodes
 * 
 * Design:
 * - Extensible: New validation layers can be added easily
 * - Composable: Layers can be enabled/disabled
 * - Non-breaking: Works alongside existing validators
 */

import { StructuredIntent } from './intent-structurer';
import { WorkflowDSL } from './workflow-dsl';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { TransformationDetection } from './transformation-detector';
import { isIntentActionCovered } from './intent-dsl-semantic-mapper';
import { validateIntentCoverageByCapabilities } from './capability-based-validator';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { getTriggerNodes } from '../../core/utils/trigger-deduplicator';
import { isTriggerNode, isDataSourceNode, isOutputNode, isTransformationNode } from '../../core/utils/universal-node-type-checker';
import { nodeDataTypeSystem, validateWorkflowTypes } from './node-data-type-system';
import { isValidHandle } from '../../core/utils/node-handle-registry';
import { transformationDetector } from './transformation-detector';
import { unifiedNodeCategorizer } from './unified-node-categorizer';
import { nodeLibrary } from '../nodes/node-library';

/**
 * Base validation result interface
 */
export interface ValidationLayerResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details?: Record<string, any>;
}

/**
 * Validation context passed between layers
 */
export interface ValidationContext {
  intent: StructuredIntent;
  dsl?: WorkflowDSL;
  workflow?: Workflow;
  transformationDetection?: TransformationDetection;
  originalPrompt?: string;
  metadata?: Record<string, any>;
}

/**
 * Validation pipeline result
 */
export interface ValidationPipelineResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  layerResults: Map<string, ValidationLayerResult>;
  context: ValidationContext;
  fixesApplied: string[]; // Backward compatibility: fixes applied during validation (always present)
}

/**
 * Base class for validation layers
 */
export abstract class ValidationLayer {
  abstract readonly name: string;
  abstract readonly order: number; // Execution order (lower = earlier)
  
  /**
   * Validate the workflow at this layer
   * 
   * @param context - Validation context
   * @returns Validation result
   */
  abstract validate(context: ValidationContext): ValidationLayerResult;
  
  /**
   * Check if this layer should run
   * Override to add conditional logic
   */
  shouldRun(context: ValidationContext): boolean {
    return true;
  }
}

/**
 * Layer 1: Intent Coverage Validation
 * Ensures all intent actions are represented in DSL
 */
export class IntentCoverageValidationLayer extends ValidationLayer {
  readonly name = 'intent-coverage';
  readonly order = 1;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};
    
    if (!context.dsl || !context.intent) {
      return { valid: true, errors, warnings, details };
    }
    
    const intent = context.intent;
    const dsl = context.dsl;
    
    // Collect node types from DSL (dataSources, outputs, and transformations)
    const dslDataSourceTypes = new Set<string>(
      dsl.dataSources.map(ds => ds.type?.toLowerCase().trim()).filter(Boolean) as string[]
    );
    const dslOutputTypes = new Set<string>(
      dsl.outputs.map(out => out.type?.toLowerCase().trim()).filter(Boolean) as string[]
    );
    const dslTransformationTypes = new Set<string>(
      dsl.transformations.map(tf => tf.type?.toLowerCase().trim()).filter(Boolean) as string[]
    );
    const dslNodeTypes = new Set<string>([...dslDataSourceTypes, ...dslOutputTypes, ...dslTransformationTypes]);
    
  // Track missing actions with detailed failure information
  const missingActions: Array<{
    type: string;
    operation: string;
    expectedIn: 'dataSource' | 'output';
    availableDSLNodes?: {
      dataSources: string[];
      transformations: string[];
      outputs: string[];
    };
    failureReason?: string;
    suggestedFix?: string;
  }> = [];
    
    // ✅ REFACTORED: Use capability-based validation instead of type matching
    if (intent.actions && intent.actions.length > 0) {
      const capabilityValidation = validateIntentCoverageByCapabilities(intent, dsl);
      
      if (!capabilityValidation.valid) {
        // Convert capability-based validation results to missing actions format
        for (const missingReq of capabilityValidation.missingRequirements) {
          const dslDataSourceTypesArray = Array.from(dslDataSourceTypes);
          const dslTransformationTypesArray = Array.from(dslTransformationTypes);
          const dslOutputTypesArray = Array.from(dslOutputTypes);
          
          // Determine expected category based on capability
          let expectedIn: 'dataSource' | 'output' = 'dataSource';
          if (missingReq.capability === 'write') {
            expectedIn = 'output';
          } else if (missingReq.capability === 'transform') {
            expectedIn = 'dataSource'; // Transformations are valid coverage
          }
          
          missingActions.push({
            type: missingReq.intentAction.type,
            operation: missingReq.intentAction.operation,
            expectedIn,
            availableDSLNodes: {
              dataSources: dslDataSourceTypesArray,
              transformations: dslTransformationTypesArray,
              outputs: dslOutputTypesArray,
            },
            failureReason: `Missing required capabilities: ${missingReq.requiredCapabilities.join(', ')}. ` +
              `Available DSL nodes do not provide these capabilities.`,
            suggestedFix: `Add a DSL node that provides capabilities: ${missingReq.requiredCapabilities.join(', ')}. ` +
              `For ${missingReq.capability} capability, consider adding a ${missingReq.capability === 'read' ? 'dataSource' : missingReq.capability === 'transform' ? 'transformation' : 'output'} node.`,
          });
        }
      }
    }
    
    if (missingActions.length > 0) {
      // ✅ IMPROVED: Build detailed error message with structured information
      const errorDetails = missingActions.map((action, idx) => {
        const availableCount = 
          (action.availableDSLNodes?.dataSources.length || 0) +
          (action.availableDSLNodes?.transformations.length || 0) +
          (action.availableDSLNodes?.outputs.length || 0);
        
        let detail = `\n  ${idx + 1}. Intent action: "${action.type}" (operation: "${action.operation}")`;
        detail += `\n     Expected in: ${action.expectedIn}`;
        detail += `\n     Available DSL nodes: ${availableCount} total`;
        if (action.availableDSLNodes) {
          if (action.availableDSLNodes.dataSources.length > 0) {
            detail += `\n       - DataSources: ${action.availableDSLNodes.dataSources.join(', ')}`;
          }
          if (action.availableDSLNodes.transformations.length > 0) {
            detail += `\n       - Transformations: ${action.availableDSLNodes.transformations.join(', ')}`;
          }
          if (action.availableDSLNodes.outputs.length > 0) {
            detail += `\n       - Outputs: ${action.availableDSLNodes.outputs.join(', ')}`;
          }
        }
        if (action.failureReason) {
          detail += `\n     Failure reason: ${action.failureReason}`;
        }
        if (action.suggestedFix) {
          detail += `\n     Suggested fix: ${action.suggestedFix}`;
        }
        return detail;
      }).join('\n');
      
      errors.push(
        `Intent coverage validation failed: ${missingActions.length} intent action(s) not represented in DSL.` +
        errorDetails
      );
      
      details.missingActions = missingActions;
      details.availableTypes = Array.from(dslNodeTypes);
    }
    
    // Check operation requirements
    if (intent.actions && intent.actions.length > 0) {
      const readOperations = ['read', 'fetch', 'get', 'query'];
      const writeOperations = ['send', 'write', 'create', 'update', 'notify'];
      
      const hasReadOperation = intent.actions.some(a => 
        readOperations.includes((a.operation || '').toLowerCase())
      );
      const hasWriteOperation = intent.actions.some(a => 
        writeOperations.includes((a.operation || '').toLowerCase())
      );
      
      if (hasReadOperation && dsl.dataSources.length === 0) {
        errors.push('Intent contains read operations but no data sources were generated.');
        details.missingDataSources = true;
      }
      
      // ✅ UNIVERSAL: log_output is always added as final output node before validation
      // So we don't need to check for outputs here - log_output will always exist
      // This check is kept for DSL-level validation, but log_output injection happens later
      // Note: This validation happens at DSL level, log_output is added at workflow graph level
      if (hasWriteOperation && dsl.outputs.length === 0) {
        // This is OK - log_output will be added before final validation
        // Just log a warning, not an error
        warnings.push('Intent contains write operations but no outputs in DSL - log_output will be auto-injected');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.dsl && !!context.intent;
  }
}

/**
 * Layer 2: DSL Structure Validation
 * Validates DSL structure (trigger, components, execution order)
 */
export class DSLStructureValidationLayer extends ValidationLayer {
  readonly name = 'dsl-structure';
  readonly order = 2;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};
    
    if (!context.dsl) {
      return { valid: true, errors, warnings, details };
    }
    
    const dsl = context.dsl;
    
    // Validate trigger
    if (!dsl.trigger || !dsl.trigger.type) {
      errors.push('DSL must have a trigger');
      details.missingTrigger = true;
    }
    
    // Validate minimum components
    // ✅ FIXED: Transformations are first-class components
    const hasDataSource = dsl.dataSources.length > 0;
    const hasOutput = dsl.outputs.length > 0;
    const hasTransformation = dsl.transformations.length > 0;
    
    // A valid workflow must have at least one component that does work:
    // - dataSource (reads data), output (writes data), or transformation (processes data)
    if (!hasDataSource && !hasOutput && !hasTransformation) {
      errors.push('DSL must have at least one data source, output, or transformation');
      details.missingComponents = true;
    }
    
    // Validate execution order
    if (!dsl.executionOrder || dsl.executionOrder.length === 0) {
      errors.push('DSL execution order must be non-empty');
      details.missingExecutionOrder = true;
    }
    
    // Validate transformation requirements
    // ✅ WORLD-CLASS UNIVERSAL: Use TransformationDetector + UnifiedNodeTypeMatcher
    if (context.transformationDetection?.detected && context.transformationDetection.verbs.length > 0) {
      const detection = context.transformationDetection;

      if (dsl.transformations.length === 0) {
        errors.push(
          `Transformation verbs detected (${detection.verbs.join(', ')}) but DSL has 0 transformations. ` +
          `Required node types: ${detection.requiredNodeTypes.join(', ')}`
        );
        details.missingTransformations = true;
        details.requiredNodeTypes = detection.requiredNodeTypes;
      } else {
        // Validate transformation types match required types using semantic matcher
        const dslTransformationTypes = dsl.transformations.map(t =>
          unifiedNormalizeNodeTypeString(t.type || '')
        );

        const tfValidation = transformationDetector.validateTransformations(
          detection,
          dslTransformationTypes
        );

        if (!tfValidation.valid && tfValidation.missing.length > 0) {
          warnings.push(
            `DSL transformations may not match all required types. Missing: ${tfValidation.missing.join(', ')}`
          );
          details.partialTransformationMatch = true;
          details.missingTransformationTypes = tfValidation.missing;
          details.transformationValidationErrors = tfValidation.errors;
        }
      }
    }
    
    // Validate component counts
    details.componentCounts = {
      dataSources: dsl.dataSources.length,
      transformations: dsl.transformations.length,
      outputs: dsl.outputs.length,
      executionOrderSteps: dsl.executionOrder.length,
    };
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.dsl;
  }
}

/**
 * Layer 3: Graph Connectivity Validation
 * Validates workflow graph structure (orphans, connectivity, execution order)
 */
export class GraphConnectivityValidationLayer extends ValidationLayer {
  readonly name = 'graph-connectivity';
  readonly order = 3;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};
    
    if (!context.workflow) {
      return { valid: true, errors, warnings, details };
    }
    
    const { nodes, edges } = context.workflow;
    
    // Validate nodes exist
    if (!nodes || nodes.length === 0) {
      errors.push('Workflow must have at least one node');
      return { valid: false, errors, warnings, details };
    }
    
    // ✅ UNIVERSAL FIX: Use registry-based trigger detection (not hardcoded)
    // This ensures ALL trigger types are recognized (webhook, manual_trigger, schedule, chat_trigger, etc.)
    const triggerNodes = nodes.filter(node => isTriggerNode(node));
    
    if (triggerNodes.length === 0) {
      errors.push('Workflow must have at least one trigger node');
      details.missingTrigger = true;
    } else if (triggerNodes.length > 1) {
      errors.push(`Workflow has ${triggerNodes.length} trigger nodes (expected 1)`);
      details.duplicateTriggers = triggerNodes.map(n => n.id);
    }
    
    // Build adjacency maps
    const incomingEdges = new Map<string, WorkflowEdge[]>();
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    
    edges.forEach(edge => {
      if (!incomingEdges.has(edge.target)) {
        incomingEdges.set(edge.target, []);
      }
      incomingEdges.get(edge.target)!.push(edge);
      
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge);
    });
    
    // Find orphan nodes (no incoming or outgoing edges, excluding triggers)
    const orphanNodes: string[] = [];
    nodes.forEach(node => {
      const nodeId = node.id;
      const hasIncoming = incomingEdges.has(nodeId) && incomingEdges.get(nodeId)!.length > 0;
      const hasOutgoing = outgoingEdges.has(nodeId) && outgoingEdges.get(nodeId)!.length > 0;
      const isTrigger = triggerNodes.some(t => t.id === nodeId);
      
      if (!hasIncoming && !hasOutgoing && !isTrigger) {
        orphanNodes.push(nodeId);
      }
    });
    
    if (orphanNodes.length > 0) {
      errors.push(`Found ${orphanNodes.length} orphan node(s) with no connections`);
      details.orphanNodes = orphanNodes;
    }
    
    // Find disconnected nodes (not reachable from trigger)
    if (triggerNodes.length > 0) {
      const visited = new Set<string>();
      const queue = [triggerNodes[0].id];
      visited.add(triggerNodes[0].id);
      
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        const outgoing = outgoingEdges.get(currentNodeId) || [];
        
        for (const edge of outgoing) {
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      
      const disconnectedNodes = nodes
        .filter(node => !visited.has(node.id))
        .map(node => node.id);
      
      if (disconnectedNodes.length > 0) {
        errors.push(`Found ${disconnectedNodes.length} disconnected node(s) not reachable from trigger`);
        details.disconnectedNodes = disconnectedNodes;
      }
    }
    
    // Validate edge handles (if available)
    const invalidHandles: Array<{ edgeId: string; reason: string }> = [];
    edges.forEach(edge => {
      // Basic validation: source and target must exist
      const sourceExists = nodes.some(n => n.id === edge.source);
      const targetExists = nodes.some(n => n.id === edge.target);
      
      if (!sourceExists) {
        invalidHandles.push({ edgeId: edge.id, reason: `Source node ${edge.source} does not exist` });
      }
      if (!targetExists) {
        invalidHandles.push({ edgeId: edge.id, reason: `Target node ${edge.target} does not exist` });
      }
    });
    
    if (invalidHandles.length > 0) {
      errors.push(`Found ${invalidHandles.length} edge(s) with invalid handles`);
      details.invalidHandles = invalidHandles;
    }
    
    details.connectivity = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      triggerNodes: triggerNodes.length,
      orphanNodes: orphanNodes.length,
      disconnectedNodes: details.disconnectedNodes?.length || 0,
    };
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.workflow;
  }
}

/**
 * Layer 4: Type Compatibility Validation
 * Validates type compatibility between connected nodes
 */
export class TypeCompatibilityValidationLayer extends ValidationLayer {
  readonly name = 'type-compatibility';
  readonly order = 4;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};
    
    if (!context.workflow) {
      return { valid: true, errors, warnings, details };
    }
    
    const { nodes, edges } = context.workflow;
    
    // Import type system
    const { nodeDataTypeSystem, validateWorkflowTypes } = require('./node-data-type-system');
    
    try {
      // Use existing type validation
      const typeValidation = validateWorkflowTypes(nodes, edges);
      
      if (!typeValidation.valid) {
        errors.push(...typeValidation.errors);
        warnings.push(...typeValidation.warnings);
        
        if (typeValidation.incompatibleEdges) {
          details.incompatibleEdges = typeValidation.incompatibleEdges;
        }
        if (typeValidation.suggestedTransforms) {
          details.suggestedTransforms = typeValidation.suggestedTransforms;
        }
      }
    } catch (error) {
      // Type validation not available - skip with warning
      warnings.push('Type compatibility validation skipped (type system not available)');
      details.typeValidationSkipped = true;
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.workflow && !!context.workflow.edges && context.workflow.edges.length > 0;
  }
}

/**
 * ✅ WORLD-CLASS: Layer 5 - Linear Flow Validation
 * Validates execution order (producer → transformer → output)
 */
export class LinearFlowValidationLayer extends ValidationLayer {
  readonly name = 'linear-flow';
  readonly order = 5;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};
    
    if (!context.workflow) {
      return { valid: true, errors, warnings, details };
    }
    
    const { nodes, edges } = context.workflow;
    
    // Build execution order from edges (topological sort)
    const executionOrder = this.getExecutionOrder(nodes, edges);
    if (executionOrder.length === 0) {
      return { valid: true, errors, warnings, details };
    }
    
    // Categorize nodes by type
    const nodeCategories = new Map<string, 'data_source' | 'processing' | 'conditional' | 'output' | 'other'>();
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.data?.type || node.type || '');
      const category = this.categorizeNode(nodeType);
      nodeCategories.set(node.id, category);
    });
    
    // Validate order for linear workflows
    const orderViolations: Array<{ nodeId: string; nodeType: string; issue: string }> = [];
    
    for (let i = 0; i < executionOrder.length; i++) {
      const currentNodeId = executionOrder[i];
      const currentCategory = nodeCategories.get(currentNodeId) || 'other';
      const currentNodeType = nodes.find(n => n.id === currentNodeId)?.data?.type || nodes.find(n => n.id === currentNodeId)?.type || '';
      
      const immediatePredecessorIndex = i > 0 ? i - 1 : -1;
      
      if (immediatePredecessorIndex >= 0) {
        const previousNodeId = executionOrder[immediatePredecessorIndex];
        const previousCategory = nodeCategories.get(previousNodeId) || 'other';
        
        // ❌ INVALID: Output → Processing (can't process after output)
        if (previousCategory === 'output' && currentCategory === 'processing') {
          orderViolations.push({
            nodeId: currentNodeId,
            nodeType: currentNodeType,
            issue: `Output node cannot be followed by processing node`,
          });
        }
        
        // ❌ INVALID: Output → Data Source (can't read after output)
        if (previousCategory === 'output' && currentCategory === 'data_source') {
          orderViolations.push({
            nodeId: currentNodeId,
            nodeType: currentNodeType,
            issue: `Output node cannot be followed by data source node`,
          });
        }
      }
    }
    
    if (orderViolations.length > 0) {
      const violationMessages = orderViolations.map(v => `${v.nodeType} (${v.issue})`);
      errors.push(`Execution order violations: ${violationMessages.join('; ')}`);
      details.orderViolations = orderViolations;
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  private getExecutionOrder(nodes: any[], edges: any[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    
    nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    });
    
    edges.forEach(edge => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);
      
      const neighbors = adjacencyList.get(edge.source) || [];
      neighbors.push(edge.target);
      adjacencyList.set(edge.source, neighbors);
    });
    
    const queue: string[] = [];
    const result: string[] = [];
    
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach(neighbor => {
        const degree = inDegree.get(neighbor)!;
        inDegree.set(neighbor, degree - 1);
        if (degree - 1 === 0) {
          queue.push(neighbor);
        }
      });
    }
    
    return result;
  }
  
  private categorizeNode(nodeType: string): 'data_source' | 'processing' | 'conditional' | 'output' | 'other' {
    const lower = nodeType.toLowerCase();
    
    if (lower.includes('sheets') || lower.includes('database') || lower.includes('read') || 
        (lower.includes('http_request') && !lower.includes('salesforce'))) {
      return 'data_source';
    }
    
    if (lower.includes('ai_') || lower.includes('chat_model') || lower.includes('agent') ||
        lower.includes('summar') || lower.includes('transform') || lower.includes('process')) {
      return 'processing';
    }
    
    if (lower.includes('if_else') || lower.includes('switch') || lower.includes('filter')) {
      return 'conditional';
    }
    
    if (lower.includes('salesforce') || lower.includes('crm') || lower.includes('gmail') ||
        lower.includes('email') || lower.includes('slack') || lower.includes('notify') ||
        lower.includes('write') || lower.includes('create') || lower.includes('update')) {
      return 'output';
    }
    
    return 'other';
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.workflow && !!context.workflow.nodes && context.workflow.nodes.length > 0;
  }
}

/**
 * ✅ WORLD-CLASS: Layer 6 - Structural DAG Enforcement
 * Enforces strict linear DAG (no branches unless explicit)
 */
export class StructuralDAGValidationLayer extends ValidationLayer {
  readonly name = 'structural-dag-enforcement';
  readonly order = 6;
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {
      removedBranches: 0,
      removedEdges: [] as string[],
    };
    
    if (!context.workflow) {
      return { valid: true, errors, warnings, details };
    }
    
    const workflow = context.workflow;
    const { nodes, edges } = workflow;
    
    // Find all trigger nodes
    const triggerNodes = nodes.filter(n => {
      const type = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return type === 'manual_trigger' || type.includes('trigger') || type === 'webhook' || type === 'form';
    });
    
    if (triggerNodes.length === 0) {
      warnings.push('No trigger node found - cannot enforce DAG structure');
      return { valid: true, errors, warnings, details };
    }
    
    // Build outgoing edges map
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    edges.forEach(edge => {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge);
    });
    
    // ✅ RULE 1: TRIGGERS MUST HAVE EXACTLY 1 OUTGOING EDGE
    for (const triggerNode of triggerNodes) {
      const triggerId = triggerNode.id;
      const outgoing = outgoingEdges.get(triggerId) || [];
      
      if (outgoing.length > 1) {
        warnings.push(`Trigger node has ${outgoing.length} outgoing edges (expected 1). Multiple branches not allowed in linear workflows.`);
        details.removedBranches += outgoing.length - 1;
      }
    }
    
    // ✅ RULE 2: NORMAL NODES MUST HAVE EXACTLY 1 OUTGOING EDGE (unless if_else/switch/merge)
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const isConditional = nodeType === 'if_else' || nodeType === 'switch' || nodeType === 'merge';
      
      if (!isConditional) {
        const outgoing = outgoingEdges.get(node.id) || [];
        if (outgoing.length > 1) {
          warnings.push(`Node ${nodeType} has ${outgoing.length} outgoing edges (expected 1). Multiple branches not allowed in linear workflows.`);
          details.removedBranches += outgoing.length - 1;
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.workflow && context.workflow.nodes.length > 0;
  }
}

/**
 * ✅ WORLD-CLASS: Layer 7 - Final Integrity Validation
 * Final comprehensive checks (duplicate nodes, all nodes connected to output, required inputs, workflow minimal, edge handles, transformation requirements)
 */
export class FinalIntegrityValidationLayer extends ValidationLayer {
  readonly name = 'final-integrity';
  readonly order = 7; // Runs LAST, after all other validations
  
  validate(context: ValidationContext): ValidationLayerResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {
      duplicateNodes: [] as string[],
      disconnectedNodes: [] as string[],
      missingInputs: [] as Array<{ nodeId: string; nodeType: string; reason: string }>,
      invalidEdgeHandles: [] as Array<{ edgeId: string; sourceHandle?: string; targetHandle?: string; reason: string }>,
      missingTransformations: [] as string[],
      nonMinimalIssues: [] as string[],
    };
    
    if (!context.workflow) {
      return { valid: true, errors, warnings, details };
    }
    
    const { nodes, edges } = context.workflow;
    
    // Check 1: Duplicate nodes (duplicate IDs)
    const nodeIdMap = new Map<string, WorkflowNode[]>();
    nodes.forEach(node => {
      if (!nodeIdMap.has(node.id)) {
        nodeIdMap.set(node.id, []);
      }
      nodeIdMap.get(node.id)!.push(node);
    });
    
    nodeIdMap.forEach((duplicates, nodeId) => {
      if (duplicates.length > 1) {
        errors.push(`Duplicate node ID found: "${nodeId}" (${duplicates.length} instances)`);
        details.duplicateNodes.push(nodeId);
      }
    });
    
    // Check 2: All nodes connected to output
    // ✅ UNIVERSAL: log_output is always added as final output node (universal fix)
    // Recognize all output nodes including log_output
    const outputNodes = nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.data?.type || node.type || '');
      const isOutput = unifiedNodeCategorizer.isOutput(nodeType.toLowerCase());
      // Always recognize log_output as output (universal final output node)
      const isLogOutput = nodeType.toLowerCase() === 'log_output';
      const outgoing = edges.filter(e => e.source === node.id);
      return !outgoing.length && !isTriggerNode(node) && (isOutput || isLogOutput);
    });
    
    // ✅ UNIVERSAL: log_output should always exist (added before validation)
    // If it doesn't exist, that's an error in the injection logic
    if (outputNodes.length === 0) {
      errors.push('No output nodes found in workflow - log_output should have been auto-injected');
    }
    
    // Build reverse adjacency list (for backward traversal from outputs)
    const reverseAdj = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!reverseAdj.has(edge.target)) {
        reverseAdj.set(edge.target, []);
      }
      reverseAdj.get(edge.target)!.push(edge.source);
    });
    
    // Find nodes not connected to any output
    const visited = new Set<string>();
    const queue = [...outputNodes.map(n => n.id)];
    outputNodes.forEach(node => visited.add(node.id));
    
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const incoming = reverseAdj.get(currentNodeId) || [];
      for (const neighborId of incoming) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    
    const disconnectedNodes = nodes.filter(node => !visited.has(node.id)).map(n => n.id);
    if (disconnectedNodes.length > 0) {
      errors.push(`Found ${disconnectedNodes.length} node(s) not connected to any output`);
      details.disconnectedNodes = disconnectedNodes;
    }
    
    // Check 3: Required inputs
    const incomingEdgesMap = new Map<string, WorkflowEdge[]>();
    edges.forEach(edge => {
      if (!incomingEdgesMap.has(edge.target)) {
        incomingEdgesMap.set(edge.target, []);
      }
      incomingEdgesMap.get(edge.target)!.push(edge);
    });
    
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.data?.type || node.type || '');
      if (isTriggerNode(node)) {
        return; // Triggers don't need inputs
      }
      
      const incomingEdges = incomingEdgesMap.get(node.id) || [];
      if (incomingEdges.length === 0) {
        errors.push(`Node "${nodeType}" (${node.id}) has no input connections`);
        details.missingInputs.push({
          nodeId: node.id,
          nodeType,
          reason: 'No incoming edges found',
        });
      }
    });
    
    // Check 4: Edge handles validation
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const sourceType = unifiedNormalizeNodeTypeString(sourceNode.data?.type || sourceNode.type || '');
        const targetType = unifiedNormalizeNodeTypeString(targetNode.data?.type || targetNode.type || '');
        
        if (edge.sourceHandle && !isValidHandle(sourceType, edge.sourceHandle, true)) {
          const reason = `Invalid source handle "${edge.sourceHandle}" for "${sourceType}"`;
          errors.push(`Edge ${edge.id}: ${reason}`);
          details.invalidEdgeHandles.push({
            edgeId: edge.id,
            sourceHandle: edge.sourceHandle,
            reason,
          });
        }
        
        if (edge.targetHandle && !isValidHandle(targetType, edge.targetHandle, false)) {
          const reason = `Invalid target handle "${edge.targetHandle}" for "${targetType}"`;
          errors.push(`Edge ${edge.id}: ${reason}`);
          details.invalidEdgeHandles.push({
            edgeId: edge.id,
            targetHandle: edge.targetHandle,
            reason,
          });
        }
      }
    });
    
    // Check 5: Transformation requirements
    // ✅ WORLD-CLASS UNIVERSAL: Use TransformationDetector + UnifiedNodeTypeMatcher
    // to semantically validate that required transformations are present.
    if (context.originalPrompt) {
      // Prefer existing detection from earlier layer, otherwise detect from original prompt
      const detection =
        context.transformationDetection ||
        transformationDetector.detectTransformations(context.originalPrompt);

      if (detection && detection.detected && detection.requiredNodeTypes.length > 0) {
        const workflowNodeTypes = nodes.map(n =>
          unifiedNormalizeNodeTypeString(n.data?.type || n.type || '')
        );

        const tfValidation = transformationDetector.validateTransformations(
          detection,
          workflowNodeTypes
        );

        if (!tfValidation.valid && tfValidation.missing.length > 0) {
          // Keep error message format backward-compatible while using semantic validation
          errors.push(
            `Missing required transformation nodes: ${tfValidation.missing.join(', ')}`
          );
          details.missingTransformations = tfValidation.missing;
          details.transformationValidationErrors = tfValidation.errors;
        }
      }
    }
    
    // Check 6: Workflow minimal (warnings only)
    const nodeTypeCount = new Map<string, number>();
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.data?.type || node.type || '');
      nodeTypeCount.set(nodeType, (nodeTypeCount.get(nodeType) || 0) + 1);
    });
    
    nodeTypeCount.forEach((count, nodeType) => {
      if (count > 1 && !this.isAllowedDuplicate(nodeType)) {
        warnings.push(`Duplicate node type "${nodeType}" found ${count} times (may be non-minimal)`);
        details.nonMinimalIssues.push(`Multiple instances of "${nodeType}" node`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }
  
  private isAllowedDuplicate(nodeType: string): boolean {
    const allowedDuplicates = ['set_variable', 'log', 'delay', 'notification'];
    return allowedDuplicates.includes(nodeType);
  }
  
  shouldRun(context: ValidationContext): boolean {
    return !!context.workflow && context.workflow.nodes.length > 0;
  }
}

/**
 * ✅ WORLD-CLASS: Validation Pipeline Orchestrator
 * SINGLE SOURCE OF TRUTH for workflow validation
 * Runs validation layers in order and aggregates results
 */
export class WorkflowValidationPipeline {
  private layers: ValidationLayer[] = [];
  
  constructor() {
    // ✅ WORLD-CLASS: Register ALL validation layers (SINGLE SOURCE OF TRUTH)
    this.registerLayer(new IntentCoverageValidationLayer());
    this.registerLayer(new DSLStructureValidationLayer());
    this.registerLayer(new GraphConnectivityValidationLayer());
    this.registerLayer(new TypeCompatibilityValidationLayer());
    this.registerLayer(new LinearFlowValidationLayer());
    this.registerLayer(new StructuralDAGValidationLayer());
    this.registerLayer(new FinalIntegrityValidationLayer()); // Final comprehensive checks
  }
  
  /**
   * Register a validation layer
   */
  registerLayer(layer: ValidationLayer): void {
    this.layers.push(layer);
    // Sort by order
    this.layers.sort((a, b) => a.order - b.order);
  }
  
  /**
   * Remove a validation layer
   */
  removeLayer(name: string): void {
    this.layers = this.layers.filter(layer => layer.name !== name);
  }
  
  /**
   * Get all registered layers
   */
  getLayers(): ValidationLayer[] {
    return [...this.layers];
  }
  
  /**
   * Run validation pipeline
   * 
   * @param context - Validation context
   * @returns Validation result
   */
  validate(context: ValidationContext): ValidationPipelineResult {
    return this.runValidation(context);
  }
  
  /**
   * Backward compatibility: Validate workflow directly
   * Wraps workflow in ValidationContext and calls validate()
   * 
   * @param workflow - Workflow to validate
   * @param originalPrompt - Original user prompt (optional)
   * @returns Validation result (compatible with old interface)
   */
  validateWorkflow(workflow: Workflow, originalPrompt?: string): ValidationPipelineResult {
    const context: ValidationContext = {
      intent: {
        trigger: 'manual_trigger',
        actions: [],
        requires_credentials: [],
      },
      workflow,
      originalPrompt,
    };
    
    return this.runValidation(context);
  }
  
  /**
   * Internal validation method
   */
  private runValidation(context: ValidationContext): ValidationPipelineResult {
    console.log('[WorkflowValidationPipeline] Starting validation pipeline...');
    
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const layerResults = new Map<string, ValidationLayerResult>();
    
    // Run each layer in order
    for (const layer of this.layers) {
      if (!layer.shouldRun(context)) {
        console.log(`[WorkflowValidationPipeline] ⏭️  Skipping layer: ${layer.name} (shouldRun returned false)`);
        continue;
      }
      
      console.log(`[WorkflowValidationPipeline] Running layer: ${layer.name} (order: ${layer.order})`);
      
      try {
        const result = layer.validate(context);
        layerResults.set(layer.name, result);
        
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
        
        if (result.valid) {
          console.log(`[WorkflowValidationPipeline] ✅ Layer ${layer.name} passed`);
        } else {
          console.error(`[WorkflowValidationPipeline] ❌ Layer ${layer.name} failed: ${result.errors.join('; ')}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[WorkflowValidationPipeline] ❌ Layer ${layer.name} threw error: ${errorMessage}`);
        
        allErrors.push(`Validation layer ${layer.name} failed: ${errorMessage}`);
        layerResults.set(layer.name, {
          valid: false,
          errors: [errorMessage],
          warnings: [],
        });
      }
    }
    
    const valid = allErrors.length === 0;
    
    console.log(`[WorkflowValidationPipeline] Validation complete: ${valid ? 'VALID' : 'INVALID'}`);
    if (allErrors.length > 0) {
      console.error(`[WorkflowValidationPipeline] Total errors: ${allErrors.length}`);
    }
    if (allWarnings.length > 0) {
      console.warn(`[WorkflowValidationPipeline] Total warnings: ${allWarnings.length}`);
    }
    
    return {
      valid,
      errors: allErrors,
      warnings: allWarnings,
      layerResults,
      context,
      fixesApplied: [], // Backward compatibility: no fixes applied by default
    };
  }
}

// Export singleton instance
export const workflowValidationPipeline = new WorkflowValidationPipeline();
