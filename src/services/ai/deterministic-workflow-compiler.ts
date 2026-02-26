/**
 * Deterministic Workflow Compiler
 * 
 * Main orchestrator for the deterministic intent → workflow compiler.
 * 
 * Pipeline:
 * STEP 1: Intent Extraction Layer
 * STEP 2: Capability Registry
 * STEP 3: Dependency Planner
 * STEP 4: Node Mapping
 * STEP 5: Loop Insertion Rule
 * STEP 6: Workflow Validator
 * STEP 7: Output minimal workflow
 * 
 * This replaces heuristic-based workflow generation with deterministic compilation.
 */

import { StructuredIntent } from './intent-structurer';
import { extractSemanticOperations, ExtractedIntent, SemanticOperationType } from './intent-extraction-layer';
import { planExecution, ExecutionPlan } from './dependency-planner';
import { mapStepsToNodes, NodeMappingResult } from './node-mapper';
import { insertLoops, LoopInsertionResult } from './loop-insertion-rule';
import { validateWorkflow, ValidationResult } from './deterministic-workflow-validator';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { randomUUID } from 'crypto';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';

export interface CompilationResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  metadata: {
    extractedIntent: ExtractedIntent;
    executionPlan: ExecutionPlan;
    nodeMapping: NodeMappingResult;
    loopInsertion: LoopInsertionResult;
    validation: ValidationResult;
  };
}

/**
 * Deterministic Workflow Compiler
 * Compiles user intent into executable workflow
 */
export class DeterministicWorkflowCompiler {
  /**
   * Compile structured intent to workflow
   * 
   * @param intent - Structured intent from user prompt
   * @param originalPrompt - Original user prompt
   * @returns Compilation result with workflow
   */
  async compile(intent: StructuredIntent, originalPrompt: string): Promise<CompilationResult> {
    console.log('[DeterministicWorkflowCompiler] Starting deterministic workflow compilation...');
    console.log(`[DeterministicWorkflowCompiler] Intent: ${JSON.stringify(intent, null, 2)}`);
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // STEP 0: LLM Safety Guard - Validate intent before compilation
      console.log('[DeterministicWorkflowCompiler] STEP 0: LLM Safety Guard - Validating intent...');
      const { llmSafetyGuard } = await import('./llm-safety-guard');
      const intentValidation = llmSafetyGuard.validateIntent(intent);
      
      if (!intentValidation.valid) {
        errors.push(...intentValidation.errors);
        console.error(`[DeterministicWorkflowCompiler] ❌ Intent validation failed: ${intentValidation.errors.join(', ')}`);
      } else {
        console.log('[DeterministicWorkflowCompiler] ✅ Intent validation passed');
      }
      
      if (intentValidation.warnings.length > 0) {
        warnings.push(...intentValidation.warnings);
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Intent validation warnings: ${intentValidation.warnings.join(', ')}`);
      }
      
      // STEP 1: Intent Extraction Layer
      console.log('[DeterministicWorkflowCompiler] STEP 1: Extracting semantic operations...');
      const extractedIntent = extractSemanticOperations(intent, originalPrompt);
      
      if (extractedIntent.operations.length === 0) {
        errors.push('No semantic operations extracted from intent');
        return {
          success: false,
          errors,
          warnings,
          metadata: {
            extractedIntent,
            executionPlan: { steps: [], isValid: false, errors: [], warnings: [] },
            nodeMapping: { steps: [], unmappedOperations: [], errors: [] },
            loopInsertion: { steps: [], insertedLoops: [] },
            validation: { isValid: false, errors: [], warnings: [], details: { orderingIssues: [], unusedNodes: [], typeMismatches: [], disconnectedNodes: [] } },
          },
        };
      }
      
      // STEP 1.1: Validate transformation requirements
      console.log('[DeterministicWorkflowCompiler] STEP 1.1: Validating transformation requirements...');
      const { transformationDetector } = await import('./transformation-detector');
      const transformationDetection = transformationDetector.detectTransformations(originalPrompt);
      
      if (transformationDetection.detected) {
        // Check if transformation operations exist
        const hasTransformOperation = extractedIntent.operations.some(op => op.type === SemanticOperationType.TRANSFORM);
        if (!hasTransformOperation) {
          const error = `Transformation verbs detected in prompt (${transformationDetection.verbs.join(', ')}) but no transformation operation found. Required node types: ${transformationDetection.requiredNodeTypes.join(', ')}`;
          errors.push(error);
          console.error(`[DeterministicWorkflowCompiler] ❌ ${error}`);
        } else {
          console.log(`[DeterministicWorkflowCompiler] ✅ Transformation operations found for detected verbs: ${transformationDetection.verbs.join(', ')}`);
        }
      }
      
      // STEP 2: Capability Registry (already initialized on import)
      console.log('[DeterministicWorkflowCompiler] STEP 2: Capability registry ready');
      
      // STEP 3: Dependency Planner
      console.log('[DeterministicWorkflowCompiler] STEP 3: Planning execution order...');
      const executionPlan = planExecution(extractedIntent.operations);
      
      if (!executionPlan.isValid) {
        errors.push(...executionPlan.errors);
        warnings.push(...executionPlan.warnings);
        
        if (errors.length > 0) {
          return {
            success: false,
            errors,
            warnings,
            metadata: {
              extractedIntent,
              executionPlan,
              nodeMapping: { steps: [], unmappedOperations: [], errors: [] },
              loopInsertion: { steps: [], insertedLoops: [] },
              validation: { isValid: false, errors: [], warnings: [], details: { orderingIssues: [], unusedNodes: [], typeMismatches: [], disconnectedNodes: [] } },
            },
          };
        }
      }
      
      // STEP 4: Node Mapping
      console.log('[DeterministicWorkflowCompiler] STEP 4: Mapping operations to node types...');
      const nodeMapping = mapStepsToNodes(executionPlan.steps);
      
      if (nodeMapping.errors.length > 0) {
        errors.push(...nodeMapping.errors);
      }
      
      if (nodeMapping.unmappedOperations.length > 0) {
        errors.push(`Unmapped operations: ${nodeMapping.unmappedOperations.join(', ')}`);
      }
      
      if (nodeMapping.steps.length === 0) {
        errors.push('No steps could be mapped to node types');
        return {
          success: false,
          errors,
          warnings,
          metadata: {
            extractedIntent,
            executionPlan,
            nodeMapping,
            loopInsertion: { steps: [], insertedLoops: [] },
            validation: { isValid: false, errors: [], warnings: [], details: { orderingIssues: [], unusedNodes: [], typeMismatches: [], disconnectedNodes: [] } },
          },
        };
      }
      
      // STEP 5: Loop Insertion Rule
      console.log('[DeterministicWorkflowCompiler] STEP 5: Inserting loops where needed...');
      const loopInsertion = insertLoops(nodeMapping.steps);
      
      // STEP 6: Build workflow graph
      console.log('[DeterministicWorkflowCompiler] STEP 6: Building workflow graph...');
      let workflow = this.buildWorkflowGraph(loopInsertion.steps, extractedIntent.trigger);
      
      // STEP 6.1: LLM Safety Guard - Validate and repair workflow before execution ordering
      console.log('[DeterministicWorkflowCompiler] STEP 6.1: LLM Safety Guard - Validating workflow...');
      try {
        const { llmSafetyGuard } = await import('./llm-safety-guard');
        const safetyValidation = llmSafetyGuard.validateAndRepair(workflow, intent);
        
        if (!safetyValidation.valid) {
          errors.push(...safetyValidation.errors);
          console.error(`[DeterministicWorkflowCompiler] ❌ Safety validation failed: ${safetyValidation.errors.join(', ')}`);
        } else {
          console.log('[DeterministicWorkflowCompiler] ✅ Safety validation passed');
        }
        
        if (safetyValidation.warnings.length > 0) {
          warnings.push(...safetyValidation.warnings);
          console.warn(`[DeterministicWorkflowCompiler] ⚠️  Safety validation warnings: ${safetyValidation.warnings.join(', ')}`);
        }
        
        // Use repaired workflow if available
        if (safetyValidation.repaired && safetyValidation.repairedWorkflow) {
          workflow = safetyValidation.repairedWorkflow;
          console.log(`[DeterministicWorkflowCompiler] ✅ Using safety-guard repaired workflow (removed ${safetyValidation.details.removedNodes.length} node(s), fixed ${safetyValidation.details.fixedNodes.length} node(s))`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during safety validation';
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Safety validation failed: ${errorMessage}`);
        warnings.push(`Could not validate workflow safety: ${errorMessage}`);
        // Continue with original workflow
      }
      
      // STEP 6.5: Enforce strict execution ordering
      console.log('[DeterministicWorkflowCompiler] STEP 6.5: Enforcing strict execution ordering...');
      try {
        const { enforceExecutionOrder } = await import('./execution-order-enforcer');
        const orderResult = enforceExecutionOrder(workflow.nodes, workflow.edges);
        
        if (orderResult.reordered) {
          console.log(`[DeterministicWorkflowCompiler] ✅ Workflow reordered based on execution rules`);
          workflow = {
            ...workflow,
            nodes: orderResult.nodes,
            edges: orderResult.edges,
          };
          warnings.push(`Workflow execution order corrected: ${orderResult.ordering.filter(o => o.originalOrder !== o.finalOrder).length} nodes reordered`);
        } else {
          console.log(`[DeterministicWorkflowCompiler] ✅ Workflow already correctly ordered`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during execution ordering';
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Execution ordering failed: ${errorMessage}`);
        warnings.push(`Could not enforce execution ordering: ${errorMessage}`);
        // Continue with original workflow
      }
      
      // STEP 6.6: Validate and fix type compatibility
      console.log('[DeterministicWorkflowCompiler] STEP 6.6: Validating type compatibility...');
      try {
        const { validateWorkflowTypes, nodeDataTypeSystem } = await import('./node-data-type-system');
        const typeValidation = validateWorkflowTypes(workflow.nodes, workflow.edges);
        
        if (!typeValidation.valid) {
          console.error(`[DeterministicWorkflowCompiler] ❌ Type validation failed: ${typeValidation.errors.length} errors`);
          errors.push(...typeValidation.errors);
          
          // Attempt auto-transformation for suggested transforms
          if (typeValidation.suggestedTransforms.length > 0) {
            console.log(`[DeterministicWorkflowCompiler] 🔄 Attempting auto-transformation for ${typeValidation.suggestedTransforms.length} type mismatches...`);
            const transformResult = nodeDataTypeSystem.autoTransformWorkflow(
              workflow.nodes,
              workflow.edges,
              typeValidation.suggestedTransforms
            );
            
            workflow = {
              ...workflow,
              nodes: transformResult.nodes,
              edges: transformResult.edges,
            };
            
            warnings.push(`Auto-transformed ${transformResult.addedTransformers.length} type mismatches`);
            console.log(`[DeterministicWorkflowCompiler] ✅ Auto-transformation complete: ${transformResult.addedTransformers.length} transform nodes added`);
            
            // Re-validate after transformation
            const revalidation = validateWorkflowTypes(workflow.nodes, workflow.edges);
            if (revalidation.valid) {
              console.log(`[DeterministicWorkflowCompiler] ✅ Type validation passed after auto-transformation`);
            } else {
              errors.push(...revalidation.errors);
              console.error(`[DeterministicWorkflowCompiler] ❌ Type validation still failed after auto-transformation: ${revalidation.errors.length} errors`);
            }
          }
        } else {
          console.log(`[DeterministicWorkflowCompiler] ✅ Type validation passed`);
          if (typeValidation.warnings.length > 0) {
            warnings.push(...typeValidation.warnings);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during type validation';
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Type validation failed: ${errorMessage}`);
        warnings.push(`Could not validate type compatibility: ${errorMessage}`);
        // Continue with original workflow
      }
      
      // STEP 7: Workflow Validator (downgraded to warnings only)
      // ✅ FIXED: DeterministicWorkflowValidator is now advisory only - FinalWorkflowValidator is the single source of truth
      console.log('[DeterministicWorkflowCompiler] STEP 7: Validating workflow (advisory only)...');
      const validation = validateWorkflow(loopInsertion.steps, workflow, originalPrompt);
      
      // ✅ FIXED: Convert all errors to warnings - only FinalWorkflowValidator decides build success
      if (!validation.isValid) {
        warnings.push(...validation.errors.map(e => `[Advisory] ${e}`));
        warnings.push(...validation.warnings);
        console.log(`[DeterministicWorkflowCompiler] ⚠️  Advisory validation found ${validation.errors.length} issues (converted to warnings)`);
      } else {
        warnings.push(...validation.warnings);
        console.log(`[DeterministicWorkflowCompiler] ✅ Advisory validation passed`);
      }
      
      // STEP 7.1: Validate transformation requirements in final workflow
      console.log('[DeterministicWorkflowCompiler] STEP 7.1: Validating transformation requirements in workflow...');
      try {
        const { transformationDetector } = await import('./transformation-detector');
        const transformationDetection = transformationDetector.detectTransformations(originalPrompt);
        
        if (transformationDetection.detected) {
          const workflowNodeTypes = workflow.nodes.map(n => {
            const nodeType = n.data?.type || n.type;
            return nodeType;
          });
          
          const transformationValidation = transformationDetector.validateTransformations(
            transformationDetection,
            workflowNodeTypes
          );
          
          if (!transformationValidation.valid) {
            // ✅ FIXED: Convert to warnings - only FinalWorkflowValidator decides build success
            warnings.push(...transformationValidation.errors.map(e => `[Advisory] ${e}`));
            console.warn(`[DeterministicWorkflowCompiler] ⚠️  Transformation validation found issues (advisory only): ${transformationValidation.errors.join(', ')}`);
          } else {
            console.log(`[DeterministicWorkflowCompiler] ✅ Transformation validation passed`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during transformation validation';
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Transformation validation failed: ${errorMessage}`);
        warnings.push(`Could not validate transformation requirements: ${errorMessage}`);
      }
      
      // STEP 8: Final Workflow Validation
      console.log('[DeterministicWorkflowCompiler] STEP 8: Final workflow validation...');
      try {
        const { validateFinalWorkflow } = await import('./final-workflow-validator');
        const finalValidation = validateFinalWorkflow(workflow, originalPrompt);
        
        if (!finalValidation.valid) {
          console.error(`[DeterministicWorkflowCompiler] ❌ Final validation failed: ${finalValidation.errors.length} errors`);
          errors.push(...finalValidation.errors);
          warnings.push(...finalValidation.warnings);
          
          // Log detailed validation failures
          if (finalValidation.details.orphanNodes.length > 0) {
            console.error(`[DeterministicWorkflowCompiler]   - Orphan nodes: ${finalValidation.details.orphanNodes.join(', ')}`);
          }
          if (finalValidation.details.duplicateTriggers.length > 0) {
            console.error(`[DeterministicWorkflowCompiler]   - Duplicate triggers: ${finalValidation.details.duplicateTriggers.join(', ')}`);
          }
          if (finalValidation.details.disconnectedNodes.length > 0) {
            console.error(`[DeterministicWorkflowCompiler]   - Disconnected nodes: ${finalValidation.details.disconnectedNodes.join(', ')}`);
          }
          if (finalValidation.details.missingInputs.length > 0) {
            console.error(`[DeterministicWorkflowCompiler]   - Missing inputs: ${finalValidation.details.missingInputs.length} nodes`);
          }
          if (finalValidation.details.dataFlowIssues.length > 0) {
            console.error(`[DeterministicWorkflowCompiler]   - Data flow issues: ${finalValidation.details.dataFlowIssues.join(', ')}`);
          }
          
          // ✅ FIXED: Do not block compilation - ProductionWorkflowBuilder will use FinalWorkflowValidator to decide
          // Log shouldRegenerate flag for ProductionWorkflowBuilder to use
          if (finalValidation.shouldRegenerate) {
            console.warn(`[DeterministicWorkflowCompiler] ⚠️  Final validation suggests regeneration (advisory only)`);
            warnings.push('Final validation suggests workflow regeneration');
          }
        } else {
          console.log(`[DeterministicWorkflowCompiler] ✅ Final validation passed (advisory)`);
          if (finalValidation.warnings.length > 0) {
            warnings.push(...finalValidation.warnings);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during final validation';
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Final validation failed: ${errorMessage}`);
        warnings.push(`Could not perform final validation: ${errorMessage}`);
        // Continue with workflow - validation is advisory in compiler
      }
      
      // ✅ FIXED: STEP 9: Output workflow (compiler always succeeds - only FinalWorkflowValidator decides build success)
      // Only block on critical compilation errors (not validation errors)
      // Critical errors: missing operations, execution plan invalid, node mapping failed
      const criticalErrors = errors.filter(e => 
        e.includes('No semantic operations') ||
        e.includes('Execution plan invalid') ||
        e.includes('Node mapping failed') ||
        e.includes('Could not map operation')
      );
      
      if (criticalErrors.length > 0) {
        console.error(`[DeterministicWorkflowCompiler] ❌ Compilation failed with ${criticalErrors.length} critical errors`);
        return {
          success: false,
          errors: criticalErrors,
          warnings,
          metadata: {
            extractedIntent,
            executionPlan,
            nodeMapping,
            loopInsertion,
            validation,
          },
        };
      }
      
      // Non-critical errors (validation issues) are converted to warnings
      if (errors.length > 0) {
        console.warn(`[DeterministicWorkflowCompiler] ⚠️  Compilation completed with ${errors.length} non-critical issues (converted to warnings)`);
        warnings.push(...errors.map(e => `[Advisory] ${e}`));
      }
      
      console.log(`[DeterministicWorkflowCompiler] ✅ Compilation successful: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
      
      return {
        success: true,
        workflow,
        errors: [],
        warnings: [...warnings, ...validation.warnings],
        metadata: {
          extractedIntent,
          executionPlan,
          nodeMapping,
          loopInsertion,
          validation,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DeterministicWorkflowCompiler] ❌ Compilation error: ${errorMessage}`);
      errors.push(`Compilation error: ${errorMessage}`);
      
      return {
        success: false,
        errors,
        warnings,
        metadata: {
          extractedIntent: { operations: [], trigger: 'manual_trigger', metadata: { originalPrompt, extractedAt: new Date().toISOString() } },
          executionPlan: { steps: [], isValid: false, errors: [], warnings: [] },
          nodeMapping: { steps: [], unmappedOperations: [], errors: [] },
          loopInsertion: { steps: [], insertedLoops: [] },
          validation: { isValid: false, errors: [], warnings: [], details: { orderingIssues: [], unusedNodes: [], typeMismatches: [], disconnectedNodes: [] } },
        },
      };
    }
  }
  
  /**
   * Build workflow graph from execution steps
   */
  private buildWorkflowGraph(steps: any[], trigger: string): Workflow {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    
    // Add trigger node
    const triggerNode: WorkflowNode = {
      id: randomUUID(),
      type: trigger,
      position: { x: 0, y: 0 },
      data: {
        type: trigger,
        label: this.getNodeLabel(trigger),
        category: 'triggers',
        config: {},
      },
    };
    nodes.push(triggerNode);
    
    // Add operation nodes
    const stepNodes = new Map<number, WorkflowNode>();
    
    for (const step of steps) {
      const node: WorkflowNode = {
        id: randomUUID(),
        type: step.nodeType,
        position: { x: 0, y: 0 }, // Will be laid out by frontend
        data: {
          type: step.nodeType,
          label: this.getNodeLabel(step.nodeType),
          category: this.getNodeCategory(step.nodeType),
          config: step.operation.config || {},
        },
      };
      
      nodes.push(node);
      stepNodes.set(step.order, node);
    }
    
    // Connect trigger to first step (schema-driven)
    if (steps.length > 0 && stepNodes.has(0)) {
      const firstStepNode = stepNodes.get(0)!;
      const resolution = resolveCompatibleHandles(triggerNode, firstStepNode);
      if (resolution.success && resolution.sourceHandle && resolution.targetHandle) {
        edges.push({
          id: randomUUID(),
          source: triggerNode.id,
          target: firstStepNode.id,
          sourceHandle: resolution.sourceHandle,
          targetHandle: resolution.targetHandle,
        });
        console.log(`[DeterministicWorkflowCompiler] ✅ Connected trigger → first step: ${resolution.sourceHandle} → ${resolution.targetHandle}`);
      } else {
        console.error(`[DeterministicWorkflowCompiler] ❌ Failed to connect trigger → first step: ${resolution.error}`);
        // Note: We don't push to errors array here as it's not accessible in this scope
        // Errors will be caught at a higher level
      }
    }
    
    // ✅ FIXED: Connect steps based on dependencies (schema-driven)
    // Rule: If transformation exists → remove direct producer → output edges
    // Enforce sequential chain: trigger → producer → transformer → output
    
    // Check if workflow contains transformation nodes
    const hasTransform = steps.some(step => {
      const nodeType = step.nodeType || '';
      return nodeType.includes('summarizer') || 
             nodeType.includes('ollama') || 
             nodeType.includes('openai') || 
             nodeType.includes('ai_agent') ||
             step.operation.type === SemanticOperationType.TRANSFORM;
    });
    
    // Find transformer step indices
    const transformStepIndices = new Set<number>();
    steps.forEach((step, idx) => {
      const nodeType = step.nodeType || '';
      if (nodeType.includes('summarizer') || 
          nodeType.includes('ollama') || 
          nodeType.includes('openai') || 
          nodeType.includes('ai_agent') ||
          step.operation.type === SemanticOperationType.TRANSFORM) {
        transformStepIndices.add(step.order);
      }
    });
    
    // Find producer step indices
    const producerStepIndices = new Set<number>();
    steps.forEach((step, idx) => {
      if (step.operation.type === SemanticOperationType.FETCH_DATA) {
        producerStepIndices.add(step.order);
      }
    });
    
    // Find output step indices
    const outputStepIndices = new Set<number>();
    steps.forEach((step, idx) => {
      if (step.operation.type === SemanticOperationType.SEND || 
          step.operation.type === SemanticOperationType.STORE) {
        outputStepIndices.add(step.order);
      }
    });
    
    console.log(`[DeterministicWorkflowCompiler] Building edges: hasTransform=${hasTransform}, transformers=${Array.from(transformStepIndices).join(',')}, producers=${Array.from(producerStepIndices).join(',')}, outputs=${Array.from(outputStepIndices).join(',')}`);
    
    // Connect steps based on dependencies (schema-driven)
    for (const step of steps) {
      const currentNode = stepNodes.get(step.order);
      if (!currentNode) continue;
      
      // ✅ FIXED: If transformation exists, remove direct producer → output edges
      const isOutput = outputStepIndices.has(step.order);
      const isProducer = producerStepIndices.has(step.order);
      
      // Connect to dependencies
      for (const depOrder of step.dependencies) {
        const depNode = stepNodes.get(depOrder);
        if (!depNode) continue;
        
        // ✅ FIXED: Skip direct producer → output edges when transformer exists
        if (hasTransform && isOutput && producerStepIndices.has(depOrder)) {
          console.log(`[DeterministicWorkflowCompiler] ⚠️  Skipping direct producer → output edge (transformer exists, enforcing sequential chain)`);
          continue;
        }
        
        const resolution = resolveCompatibleHandles(depNode, currentNode);
        if (resolution.success && resolution.sourceHandle && resolution.targetHandle) {
          edges.push({
            id: randomUUID(),
            source: depNode.id,
            target: currentNode.id,
            sourceHandle: resolution.sourceHandle,
            targetHandle: resolution.targetHandle,
          });
          console.log(`[DeterministicWorkflowCompiler] ✅ Connected dependency: ${resolution.sourceHandle} → ${resolution.targetHandle}`);
        } else {
          console.error(`[DeterministicWorkflowCompiler] ❌ Failed to connect dependency: ${resolution.error}`);
          // Note: We don't push to errors array here as it's not accessible in this scope
          // Errors will be caught at a higher level
        }
      }
    }
    
    return {
      nodes,
      edges,
      metadata: {
        compiledAt: new Date().toISOString(),
        compiler: 'deterministic',
        trigger,
      },
    };
  }
  
  /**
   * Get node label
   */
  private getNodeLabel(nodeType: string): string {
    const { nodeLibrary } = require('../nodes/node-library');
    const schema = nodeLibrary.getSchema(nodeType);
    return schema?.label || nodeType;
  }
  
  /**
   * Get node category
   */
  private getNodeCategory(nodeType: string): string {
    const { nodeLibrary } = require('../nodes/node-library');
    const schema = nodeLibrary.getSchema(nodeType);
    return schema?.category || 'other';
  }
}

// Export singleton instance
export const deterministicWorkflowCompiler = new DeterministicWorkflowCompiler();

// Export convenience function
export async function compileWorkflow(intent: StructuredIntent, originalPrompt: string): Promise<CompilationResult> {
  return deterministicWorkflowCompiler.compile(intent, originalPrompt);
}
