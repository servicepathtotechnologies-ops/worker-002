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
      
      if (hasWriteOperation && dsl.outputs.length === 0) {
        errors.push('Intent contains send/write operations but no outputs were generated.');
        details.missingOutputs = true;
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
    if (context.transformationDetection?.detected && context.transformationDetection.verbs.length > 0) {
      if (dsl.transformations.length === 0) {
        errors.push(
          `Transformation verbs detected (${context.transformationDetection.verbs.join(', ')}) but DSL has 0 transformations. ` +
          `Required node types: ${context.transformationDetection.requiredNodeTypes.join(', ')}`
        );
        details.missingTransformations = true;
        details.requiredNodeTypes = context.transformationDetection.requiredNodeTypes;
      } else {
        // Validate transformation types match required types
        const dslTransformationTypes = dsl.transformations.map(t => t.type);
        const missingTypes = context.transformationDetection.requiredNodeTypes.filter(
          requiredType => !dslTransformationTypes.some(dslType => 
            dslType === requiredType || 
            dslType.includes(requiredType) || 
            requiredType.includes(dslType)
          )
        );
        
        if (missingTypes.length > 0) {
          warnings.push(`DSL transformations may not match all required types. Missing: ${missingTypes.join(', ')}`);
          details.partialTransformationMatch = true;
          details.missingTransformationTypes = missingTypes;
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
    
    // Find trigger nodes
    const triggerNodes = nodes.filter(node => {
      const nodeType = (node.data?.type || node.type || '').toLowerCase();
      return nodeType.includes('trigger') || nodeType === 'manual_trigger';
    });
    
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
 * Validation Pipeline Orchestrator
 * Runs validation layers in order and aggregates results
 */
export class WorkflowValidationPipeline {
  private layers: ValidationLayer[] = [];
  
  constructor() {
    // Register default layers
    this.registerLayer(new IntentCoverageValidationLayer());
    this.registerLayer(new DSLStructureValidationLayer());
    this.registerLayer(new GraphConnectivityValidationLayer());
    this.registerLayer(new TypeCompatibilityValidationLayer());
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
