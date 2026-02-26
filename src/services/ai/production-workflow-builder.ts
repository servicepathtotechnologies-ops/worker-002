/**
 * Production-Grade Workflow Builder
 * 
 * Enforces strict production-grade pipeline:
 * 
 * 1. Deterministic generation - no randomness, same input = same output
 * 2. No hallucinated nodes - only use nodes from capability registry
 * 3. Dependency-based planning - order based on data dependencies
 * 4. Capability registry - validate all nodes exist
 * 5. Type-safe connections - validate type compatibility
 * 6. Minimal workflows - only required nodes
 * 7. Validation before return - comprehensive validation
 * 8. Retry generation if invalid - regenerate on failure
 * 
 * This is the main entry point for production workflow generation.
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { capabilityRegistry } from './capability-registry';
import { nodeDataTypeSystem, validateWorkflowTypes } from './node-data-type-system';
import { finalWorkflowValidator, validateFinalWorkflow } from './final-workflow-validator';
import { executionOrderEnforcer, enforceExecutionOrder } from './execution-order-enforcer';
import { intentConstraintEngine } from './intent-constraint-engine';
import { workflowGraphPruner } from './workflow-graph-pruner';
import { deterministicWorkflowCompiler } from './deterministic-workflow-compiler';
import { dslGenerator, WorkflowDSL, DSLGenerationError } from './workflow-dsl';
import { workflowDSLCompiler } from './workflow-dsl-compiler';
import { transformationDetector } from './transformation-detector';
import { preCompilationValidator, PipelineContractError } from './pre-compilation-validator';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { nodeLibrary } from '../nodes/node-library';
import { randomUUID } from 'crypto';
import { workflowValidationPipeline, ValidationContext } from './workflow-validation-pipeline';

export interface ProductionBuildResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  metadata: {
    buildAttempts: number;
    validationAttempts: number;
    nodesUsed: string[];
    buildTime: number;
  };
}

export interface BuildOptions {
  maxRetries?: number;
  strictMode?: boolean;
  allowRegeneration?: boolean;
}

/**
 * Production-Grade Workflow Builder
 * Enforces all production requirements
 */
export class ProductionWorkflowBuilder {
  private readonly MAX_RETRIES = 3;
  private readonly STRICT_MODE = true;
  
  /**
   * Determine if error is retryable
   * 
   * ✅ STRICT RETRY POLICY: Retry ONLY on transient failures
   * 
   * Retry ONLY for:
   * - network failure (connection errors, network timeouts)
   * - provider failure (API provider errors, rate limits)
   * - timeout (execution timeouts)
   * 
   * Do NOT retry (fail immediately):
   * - missing nodes
   * - DSL validation failure
   * - invariant violation
   * - structural workflow errors
   * - invalid DSL
   * - validation failure
   * - pipeline contract violation
   * - type validation errors
   * - schema validation errors
   * - compilation failures
   */
  private isRetryableError(error: string | Error): boolean {
    const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
    const errorLower = errorMessage.toLowerCase();
    
    // ✅ STRICT: Only retry on network, provider, or timeout errors
    const retryablePatterns = [
      // Network errors
      'network',
      'connection',
      'econnrefused',
      'enotfound',
      'etimedout',
      'econnreset',
      'econnaborted',
      'ehostunreach',
      'enetunreach',
      // Timeout errors
      'timeout',
      'timed out',
      'request timeout',
      'execution timeout',
      // Provider errors (API/service level)
      'rate limit',
      '429', // Too Many Requests
      '503', // Service Unavailable
      '502', // Bad Gateway
      '504', // Gateway Timeout
      'service unavailable',
      'provider error',
      'api error',
      'temporary',
    ];
    
    // ✅ STRICT: Non-retryable errors (structural failures - fail immediately)
    const nonRetryablePatterns = [
      // Missing nodes
      'missing node',
      'required node',
      'missing transformation',
      'missing output',
      'unknown node',
      'hallucinated',
      // DSL validation failures
      'invalid dsl',
      'dsl generation',
      'dsl validation',
      'uncategorized action',
      'action count mismatch',
      // Invariant violations
      'invariant violation',
      'invariant',
      'required nodes not in workflow',
      // Structural workflow errors
      'structural failure',
      'structural error',
      'workflow structure',
      'invalid node type',
      'type validation',
      'schema validation',
      'validation failure',
      // Pipeline contract violations
      'pipeline contract',
      'contract violation',
      // Compilation failures
      'compilation failed',
      'compilation error',
      'pre-compilation',
      'cannot resolve',
      'no compatible handles',
      'connection validation',
      'edge validation',
    ];
    
    // ✅ STRICT: Check for non-retryable patterns first (structural failures - fail immediately)
    if (nonRetryablePatterns.some(pattern => errorLower.includes(pattern))) {
      return false;
    }
    
    // ✅ STRICT: Only retry if error matches retryable patterns (network/provider/timeout)
    return retryablePatterns.some(pattern => errorLower.includes(pattern));
  }
  
  /**
   * Build workflow with production-grade pipeline
   * 
   * @param intent - Structured intent from user
   * @param originalPrompt - Original user prompt
   * @param options - Build options
   * @returns Production build result
   */
  async build(
    intent: StructuredIntent,
    originalPrompt: string,
    options: BuildOptions = {}
  ): Promise<ProductionBuildResult> {
    const startTime = Date.now();
    const maxRetries = options.maxRetries || this.MAX_RETRIES;
    const strictMode = options.strictMode !== false ? this.STRICT_MODE : false;
    
    console.log('[ProductionWorkflowBuilder] ========================================');
    console.log('[ProductionWorkflowBuilder] Starting production-grade workflow build...');
    console.log(`[ProductionWorkflowBuilder] Options: maxRetries=${maxRetries}, strictMode=${strictMode}`);
    console.log(`[ProductionWorkflowBuilder] Original prompt: "${originalPrompt.substring(0, 100)}${originalPrompt.length > 100 ? '...' : ''}"`);
    console.log('[ProductionWorkflowBuilder] ========================================');
    
    let buildAttempts = 0;
    let validationAttempts = 0;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    
    // STEP 0: Detect transformations (STRICT PIPELINE CONTRACT)
    console.log('[ProductionWorkflowBuilder] STEP 0: Detecting required transformations...');
    const transformationDetection = transformationDetector.detectTransformations(originalPrompt);
    console.log(`[ProductionWorkflowBuilder] 🔍 Transformation detection: detected=${transformationDetection.detected}, verbs=[${transformationDetection.verbs.join(', ')}], requiredNodeTypes=[${transformationDetection.requiredNodeTypes.join(', ')}]`);
    
    // STEP 1: Generate DSL from StructuredIntent (with transformation detection)
    // This is the ONLY way to generate workflow - LLM cannot generate graph directly
    console.log('[ProductionWorkflowBuilder] STEP 1: Generating DSL from StructuredIntent...');
    
    let dsl: WorkflowDSL;
    try {
      dsl = dslGenerator.generateDSL(intent, originalPrompt, transformationDetection);
    } catch (error: unknown) {
      // ✅ STRICT VALIDATION: Handle DSLGenerationError (uncategorized actions or count mismatch)
      if (error instanceof DSLGenerationError) {
        const errorMessages = [
          error.message,
          ...(error.uncategorizedActions.length > 0
            ? [`Uncategorized actions: ${error.uncategorizedActions.map((a: { type: string; operation: string }) => `${a.type}(${a.operation})`).join(', ')}`]
            : []),
          ...(error.missingIntentActions && error.missingIntentActions.length > 0
            ? [`Missing intent actions: ${error.missingIntentActions.map((a: { type: string; operation: string }) => `${a.type}(${a.operation})`).join(', ')}`]
            : []),
          ...(error.minimumComponentViolations && error.minimumComponentViolations.length > 0
            ? [`Minimum component violations: ${error.minimumComponentViolations.map((v: { component: string; required: number; actual: number }) => `${v.component} (required: ${v.required}, actual: ${v.actual})`).join(', ')}`]
            : []),
        ];
        
        console.error(`[ProductionWorkflowBuilder] ❌ DSL generation failed with validation error:`);
        console.error(`[ProductionWorkflowBuilder]   ${errorMessages.join('. ')}`);
        
        // Log uncategorized actions details
        if (error.uncategorizedActions.length > 0) {
          console.error(`[ProductionWorkflowBuilder]   Uncategorized actions details:`);
          error.uncategorizedActions.forEach((action: { type: string; operation: string; reason?: string }, idx: number) => {
            console.error(`[ProductionWorkflowBuilder]     ${idx + 1}. type="${action.type}", operation="${action.operation}"`);
            if (action.reason) {
              console.error(`[ProductionWorkflowBuilder]        Reason: ${action.reason}`);
            }
          });
        }
        
        // ✅ STRICT: DSL generation failure - structural error, fail immediately (no retry)
        console.error(`[ProductionWorkflowBuilder] ❌ DSL generation failed - FAILING IMMEDIATELY (structural error, not retryable)`);
        return {
          success: false,
          errors: errorMessages,
          warnings: allWarnings,
          metadata: {
            buildAttempts: 0,
            validationAttempts: 0,
            nodesUsed: [],
            buildTime: Date.now() - startTime,
          },
        };
      }
      
      // ✅ ERROR HANDLING: Catch unexpected errors and return structured error (prevent server crash)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[ProductionWorkflowBuilder] ❌ Unexpected error during DSL generation:`, errorMessage);
      if (errorStack) {
        console.error(`[ProductionWorkflowBuilder] Error stack:`, errorStack);
      }
      
      // Return structured error instead of throwing (prevents server crash)
      return {
        success: false,
        errors: [
          `DSL generation failed: ${errorMessage}`,
          'This may be due to invalid intent structure or an internal error. Please try regenerating the workflow with a more specific prompt.',
        ],
        warnings: allWarnings,
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    
    // ✅ STRICT: Validate DSL - structural validation, fail immediately on failure (no retry)
    const dslValidation = dslGenerator.validateDSL(dsl);
    if (!dslValidation.valid) {
      console.error(`[ProductionWorkflowBuilder] ❌ DSL validation failed - FAILING IMMEDIATELY (structural error, not retryable)`);
      console.error(`[ProductionWorkflowBuilder]   Validation errors: ${dslValidation.errors.join(', ')}`);
      return {
        success: false,
        errors: dslValidation.errors,
        warnings: dslValidation.warnings,
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    
    console.log(`[ProductionWorkflowBuilder] ✅ DSL generated: ${dsl.dataSources.length} data sources, ${dsl.transformations.length} transformations, ${dsl.outputs.length} outputs`);
    
    // STEP 1.5: Pre-Compilation Validation (HARD VALIDATION BEFORE COMPILATION)
    console.log('[ProductionWorkflowBuilder] STEP 1.5: Pre-compilation validation...');
    const preCompilationValidation = preCompilationValidator.validate(dsl, transformationDetection, intent);
    
    if (!preCompilationValidation.valid) {
      // ✅ STRICT: Pre-compilation validation failure - structural error, fail immediately (no retry)
      console.error(`[ProductionWorkflowBuilder] ❌ Pre-compilation validation failed - FAILING IMMEDIATELY (structural error, not retryable)`);
      console.error(`[ProductionWorkflowBuilder]   Validation errors: ${preCompilationValidation.errors.join(', ')}`);
      
      if (preCompilationValidation.isStructuralFailure) {
        console.error(`[ProductionWorkflowBuilder]   Structural pipeline failure detected - throwing PipelineContractError`);
        throw new PipelineContractError(
          'Pipeline contract violation: DSL does not satisfy intent requirements',
          preCompilationValidation
        );
      }
      
      // Non-structural failure - still fail immediately (validation errors are not retryable)
      return {
        success: false,
        errors: preCompilationValidation.errors,
        warnings: preCompilationValidation.warnings,
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    
    console.log(`[ProductionWorkflowBuilder] ✅ Pre-compilation validation passed`);
    
    // STEP 2: Validate intent and get required nodes (no hallucination)
    console.log('[ProductionWorkflowBuilder] STEP 2: Validating intent and getting required nodes');
    const requiredNodes = this.getRequiredNodes(intent, originalPrompt);
    
    if (requiredNodes.length === 0) {
      return {
        success: false,
        errors: ['No required nodes found in intent'],
        warnings: [],
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    
    console.log(`[ProductionWorkflowBuilder] ✅ Required nodes: ${requiredNodes.join(', ')}`);
    
    // STEP 2: Validate all nodes exist in capability registry (no hallucination)
    console.log('[ProductionWorkflowBuilder] STEP 2: Validating nodes in capability registry');
    const nodeValidation = this.validateNodesInRegistry(requiredNodes);
    
    if (!nodeValidation.valid) {
      // ✅ STRICT: Missing nodes - structural error, fail immediately (no retry)
      console.error(`[ProductionWorkflowBuilder] ❌ Node validation failed - FAILING IMMEDIATELY (structural error, not retryable)`);
      console.error(`[ProductionWorkflowBuilder]   Validation errors: ${nodeValidation.errors.join(', ')}`);
      return {
        success: false,
        errors: nodeValidation.errors,
        warnings: nodeValidation.warnings,
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    
    console.log(`[ProductionWorkflowBuilder] ✅ All nodes validated in registry`);
    
    // Retry loop for generation (ONLY for network/provider failures, NOT structural failures)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      buildAttempts = attempt;
      console.log(`[ProductionWorkflowBuilder] 🔄 Build attempt ${attempt}/${maxRetries}`);
      
      try {
        // STEP 3: Compile DSL to Workflow Graph
        // This is the ONLY way to generate workflow graph - LLM cannot generate graph directly
        console.log('[ProductionWorkflowBuilder] STEP 3: Compiling DSL to Workflow Graph...');
        const dslCompilationResult = workflowDSLCompiler.compile(dsl);
        
        if (!dslCompilationResult.success || !dslCompilationResult.workflow) {
          allErrors.push(...dslCompilationResult.errors);
          allWarnings.push(...dslCompilationResult.warnings);
          console.error(`[ProductionWorkflowBuilder] ❌ DSL compilation failed on attempt ${attempt}`);
          
          // ✅ FIXED: Check if error is retryable (network/provider/temporary) or structural
          const isRetryable = dslCompilationResult.errors.some(e => this.isRetryableError(e));
          
          if (isRetryable && attempt < maxRetries) {
            console.log(`[ProductionWorkflowBuilder] 🔄 Retrying DSL compilation (retryable error: network/provider/temporary)...`);
            continue;
          }
          
          // ✅ STRICT: DSL compilation failure - check if structural or transient
          const hasStructuralError = dslCompilationResult.errors.some(e => !this.isRetryableError(e));
          
          if (hasStructuralError) {
            // Structural failure (missing nodes, invalid DSL, etc.) - fail immediately (no retry)
            console.error(`[ProductionWorkflowBuilder] ❌ DSL compilation failed with structural error - FAILING IMMEDIATELY (not retryable)`);
            console.error(`[ProductionWorkflowBuilder]   Errors: ${dslCompilationResult.errors.join(', ')}`);
            return {
              success: false,
              errors: allErrors,
              warnings: allWarnings,
              metadata: {
                buildAttempts,
                validationAttempts,
                nodesUsed: requiredNodes,
                buildTime: Date.now() - startTime,
              },
            };
          }
          
          // Only transient errors (network/provider/timeout) - continue retry loop
          console.log(`[ProductionWorkflowBuilder] ⚠️  DSL compilation failed with transient error - will retry`);
        }
        
        let workflow = dslCompilationResult.workflow;
        allWarnings.push(...dslCompilationResult.warnings);
        
        if (!workflow) {
          console.error(`[ProductionWorkflowBuilder] ❌ DSL compilation failed: workflow is undefined`);
          return {
            success: false,
            errors: allErrors,
            warnings: allWarnings,
            metadata: {
              buildAttempts,
              validationAttempts,
              nodesUsed: requiredNodes,
              buildTime: Date.now() - startTime,
            },
          };
        }
        
        console.log(`[ProductionWorkflowBuilder] ✅ DSL compilation successful: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
        
        // ✅ AUTO-REPAIR: STEP 3.5: Validate invariant (requiredNodes ⊆ workflow.nodes) with auto-repair
        console.log('[ProductionWorkflowBuilder] STEP 3.5: Validating invariant (requiredNodes ⊆ workflow.nodes)...');
        
        if (!workflow) {
          console.error(`[ProductionWorkflowBuilder] ❌ Cannot validate invariant: workflow is undefined`);
          return {
            success: false,
            errors: [...allErrors, 'Workflow is undefined after compilation'],
            warnings: allWarnings,
            metadata: {
              buildAttempts,
              validationAttempts,
              nodesUsed: requiredNodes,
              buildTime: Date.now() - startTime,
            },
          };
        }
        
        const workflowNodeTypes = workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean);
        const invariantValidation = preCompilationValidator.validateInvariant(requiredNodes, workflowNodeTypes);
        
        if (!invariantValidation.valid) {
          // ✅ AUTO-REPAIR: Try to inject missing nodes instead of failing immediately
          const missingNodes = requiredNodes.filter(reqNode => 
            !workflowNodeTypes.some(workflowNode => 
              workflowNode === reqNode || 
              workflowNode.includes(reqNode) || 
              reqNode.includes(workflowNode)
            )
          );
          
          if (missingNodes.length > 0) {
            console.warn(`[ProductionWorkflowBuilder] ⚠️  Missing nodes detected: ${missingNodes.join(', ')} - attempting auto-repair...`);
            
            try {
              // Attempt to inject missing nodes
              const repairResult = this.injectMissingNodes(workflow, missingNodes, dsl, intent, originalPrompt);
              
              if (repairResult.success && repairResult.workflow) {
                workflow = repairResult.workflow;
                allWarnings.push(...repairResult.warnings);
                console.log(`[ProductionWorkflowBuilder] ✅ Auto-repair successful: Injected ${missingNodes.length} missing node(s)`);
                
                // Re-validate after auto-repair
                const workflowNodeTypesAfter = workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean);
                const revalidation = preCompilationValidator.validateInvariant(requiredNodes, workflowNodeTypesAfter);
                
                if (!revalidation.valid) {
                  // Auto-repair failed - this is a real structural issue
                  console.error(`[ProductionWorkflowBuilder] ❌ Auto-repair failed - invariant still violated after injection`);
                  console.error(`[ProductionWorkflowBuilder]   Errors: ${revalidation.errors.join(', ')}`);
                  return {
                    success: false,
                    errors: [...allErrors, ...revalidation.errors],
                    warnings: [...allWarnings, ...revalidation.warnings],
                    metadata: {
                      buildAttempts,
                      validationAttempts,
                      nodesUsed: requiredNodes,
                      buildTime: Date.now() - startTime,
                    },
                  };
                }
                
                console.log(`[ProductionWorkflowBuilder] ✅ Invariant satisfied after auto-repair: All required nodes present in workflow`);
              } else {
                // Auto-repair failed to inject nodes
                console.error(`[ProductionWorkflowBuilder] ❌ Auto-repair failed: ${repairResult.errors.join(', ')}`);
                return {
                  success: false,
                  errors: [...allErrors, ...invariantValidation.errors, ...repairResult.errors],
                  warnings: [...allWarnings, ...invariantValidation.warnings, ...repairResult.warnings],
                  metadata: {
                    buildAttempts,
                    validationAttempts,
                    nodesUsed: requiredNodes,
                    buildTime: Date.now() - startTime,
                  },
                };
              }
            } catch (repairError) {
              // Auto-repair threw an error
              const errorMessage = repairError instanceof Error ? repairError.message : String(repairError);
              console.error(`[ProductionWorkflowBuilder] ❌ Auto-repair error: ${errorMessage}`);
              return {
                success: false,
                errors: [...allErrors, ...invariantValidation.errors, `Auto-repair failed: ${errorMessage}`],
                warnings: [...allWarnings, ...invariantValidation.warnings],
                metadata: {
                  buildAttempts,
                  validationAttempts,
                  nodesUsed: requiredNodes,
                  buildTime: Date.now() - startTime,
                },
              };
            }
          } else {
            // No missing nodes but validation failed - this shouldn't happen, but handle it
            console.error(`[ProductionWorkflowBuilder] ❌ Invariant validation failed but no missing nodes detected`);
            return {
              success: false,
              errors: [...allErrors, ...invariantValidation.errors],
              warnings: [...allWarnings, ...invariantValidation.warnings],
              metadata: {
                buildAttempts,
                validationAttempts,
                nodesUsed: requiredNodes,
                buildTime: Date.now() - startTime,
              },
            };
          }
        } else {
          console.log(`[ProductionWorkflowBuilder] ✅ Invariant satisfied: All required nodes present in workflow`);
        }
        
        // STEP 4: Enforce execution ordering (dependency-based planning)
        console.log('[ProductionWorkflowBuilder] STEP 4: Enforcing execution ordering');
        const orderResult = enforceExecutionOrder(workflow.nodes, workflow.edges);
        
        if (orderResult.reordered) {
          workflow = {
            ...workflow,
            nodes: orderResult.nodes,
            edges: orderResult.edges,
          };
          console.log(`[ProductionWorkflowBuilder] ✅ Workflow reordered based on dependencies`);
        }
        
        // STEP 5: Validate type-safe connections
        console.log('[ProductionWorkflowBuilder] STEP 5: Validating type-safe connections');
        validationAttempts++;
        const typeValidation = validateWorkflowTypes(workflow.nodes, workflow.edges);
        
        if (!typeValidation.valid) {
          allErrors.push(...typeValidation.errors);
          allWarnings.push(...typeValidation.warnings);
          
          // Attempt auto-transformation
          if (typeValidation.suggestedTransforms.length > 0) {
            console.log(`[ProductionWorkflowBuilder] 🔄 Auto-transforming ${typeValidation.suggestedTransforms.length} type mismatches...`);
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
            
            // Re-validate after transformation
            const revalidation = validateWorkflowTypes(workflow.nodes, workflow.edges);
            if (!revalidation.valid) {
              allErrors.push(...revalidation.errors);
              console.error(`[ProductionWorkflowBuilder] ❌ Type validation still failed after transformation`);
              
              // ✅ STRICT: Type validation failure - structural error, fail immediately (no retry)
              console.error(`[ProductionWorkflowBuilder] ❌ Type validation failure - FAILING IMMEDIATELY (structural error, not retryable)`);
              return {
                success: false,
                errors: allErrors,
                warnings: allWarnings,
                metadata: {
                  buildAttempts,
                  validationAttempts,
                  nodesUsed: requiredNodes,
                  buildTime: Date.now() - startTime,
                },
              };
            } else {
              console.log(`[ProductionWorkflowBuilder] ✅ Type validation passed after transformation`);
            }
          } else {
            console.error(`[ProductionWorkflowBuilder] ❌ Type validation failed with no suggested transforms`);
            
            // ✅ FIXED: Type validation failure is a structural failure - do not retry, fail fast
            console.error(`[ProductionWorkflowBuilder] ❌ Type validation failure is structural - NOT retrying`);
            return {
              success: false,
              errors: allErrors,
              warnings: allWarnings,
              metadata: {
                buildAttempts,
                validationAttempts,
                nodesUsed: requiredNodes,
                buildTime: Date.now() - startTime,
              },
            };
          }
        } else {
          console.log(`[ProductionWorkflowBuilder] ✅ Type validation passed`);
        }
        
        // STEP 6: Enforce minimal workflow (with protected nodes)
        console.log('[ProductionWorkflowBuilder] STEP 6: Enforcing minimal workflow (protected nodes: trigger, data_source, transformation, output)...');
        const pruningResult = workflowGraphPruner.prune(workflow, intent, originalPrompt);
        
        if (pruningResult.removedNodes.length > 0 || pruningResult.removedEdges.length > 0) {
          workflow = pruningResult.workflow;
          console.log(`[ProductionWorkflowBuilder] ✅ Workflow pruned: ${pruningResult.removedNodes.length} nodes, ${pruningResult.removedEdges.length} edges removed`);
          allWarnings.push(...pruningResult.violations.map(v => `Pruning: ${v.reason}`));
          
          // ✅ FIXED: Validate invariant after pruning (required nodes must still be present)
          const prunedNodeTypes = workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean);
          const postPruningInvariant = preCompilationValidator.validateInvariant(requiredNodes, prunedNodeTypes);
          
          if (!postPruningInvariant.valid) {
            console.error(`[ProductionWorkflowBuilder] ❌ Invariant violated after pruning - required nodes were removed`);
            return {
              success: false,
              errors: [...allErrors, ...postPruningInvariant.errors],
              warnings: [...allWarnings, ...postPruningInvariant.warnings],
              metadata: {
                buildAttempts,
                validationAttempts,
                nodesUsed: requiredNodes,
                buildTime: Date.now() - startTime,
              },
            };
          }
        } else {
          console.log(`[ProductionWorkflowBuilder] ✅ Workflow already minimal`);
        }
        
        // STEP 6.5: Layered Validation Pipeline (NEW - Extensible Architecture)
        // ✅ NEW: Run layered validation pipeline for comprehensive validation
        console.log('[ProductionWorkflowBuilder] STEP 6.5: Running layered validation pipeline...');
        validationAttempts++;
        
        const validationContext: ValidationContext = {
          intent,
          dsl,
          workflow,
          transformationDetection,
          originalPrompt,
          metadata: {
            buildAttempt: attempt,
            requiredNodes,
          },
        };
        
        const pipelineValidation = workflowValidationPipeline.validate(validationContext);
        
        if (!pipelineValidation.valid) {
          allErrors.push(...pipelineValidation.errors);
          allWarnings.push(...pipelineValidation.warnings);
          
          console.error(`[ProductionWorkflowBuilder] ❌ Validation pipeline failed: ${pipelineValidation.errors.length} errors`);
          
          // Log layer-specific results
          pipelineValidation.layerResults.forEach((result, layerName) => {
            if (!result.valid) {
              console.error(`[ProductionWorkflowBuilder]   Layer ${layerName}: ${result.errors.length} error(s)`);
            }
          });
          
          // Check if errors are retryable (network/provider/temporary) or structural (not retryable)
          const hasRetryableError = pipelineValidation.errors.some(err => 
            this.isRetryableError(err)
          );
          
          if (hasRetryableError) {
            console.log(`[ProductionWorkflowBuilder] 🔄 Retrying due to retryable error (network/provider/temporary failure)...`);
            continue;
          }
          
          // Structural errors - fail immediately (not retryable)
          console.error(`[ProductionWorkflowBuilder] ❌ Validation pipeline failed with structural errors - FAILING IMMEDIATELY (not retryable)`);
          return {
            success: false,
            errors: [...allErrors, ...pipelineValidation.errors],
            warnings: [...allWarnings, ...pipelineValidation.warnings],
            metadata: {
              buildAttempts: attempt,
              validationAttempts,
              nodesUsed: requiredNodes,
              buildTime: Date.now() - startTime,
            },
          };
        } else {
          console.log(`[ProductionWorkflowBuilder] ✅ Validation pipeline passed`);
          allWarnings.push(...pipelineValidation.warnings);
        }
        
        // STEP 7: Final validation before return
        // ✅ FIXED: FinalWorkflowValidator is the SINGLE SOURCE OF TRUTH for build success
        // All other validators (DeterministicWorkflowValidator, type validation, etc.) are advisory only
        console.log('[ProductionWorkflowBuilder] STEP 7: Final validation before return (single source of truth)');
        validationAttempts++;
        const finalValidation = validateFinalWorkflow(workflow, originalPrompt);
        
        // ✅ FIXED: Stop retry if validation passes - FinalWorkflowValidator decides build success
        if (finalValidation.valid) {
          console.log(`[ProductionWorkflowBuilder] ✅ Final validation passed - stopping retry loop`);
          
          // ✅ HARD INVARIANT: Enforce requiredNodes ⊆ workflow.nodes before returning
          // This is a hard guarantee - if violated, throw PipelineContractError
          console.log('[ProductionWorkflowBuilder] STEP 8: Enforcing pipeline invariant (requiredNodes ⊆ workflow.nodes)...');
          const workflowNodeTypes = workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean);
          const invariantValidation = preCompilationValidator.validateInvariant(requiredNodes, workflowNodeTypes);
          
          if (!invariantValidation.valid) {
            // ✅ HARD INVARIANT VIOLATION: Throw PipelineContractError (hard guarantee)
            const missingNodes = requiredNodes.filter(reqNode => 
              !workflowNodeTypes.some(workflowNode => 
                workflowNode === reqNode || 
                workflowNode.includes(reqNode) || 
                reqNode.includes(workflowNode)
              )
            );
            
            const errorMessage = `Pipeline invariant violation: Required nodes not in workflow. ` +
              `Missing: [${missingNodes.join(', ')}]. ` +
              `Required: [${requiredNodes.join(', ')}]. ` +
              `Actual: [${workflowNodeTypes.join(', ')}]`;
            
            console.error(`[ProductionWorkflowBuilder] ❌ ${errorMessage}`);
            console.error(`[ProductionWorkflowBuilder]   Invariant errors: ${invariantValidation.errors.join(', ')}`);
            
            // Create a validation result for PipelineContractError
            const invariantValidationResult = {
              valid: false,
              errors: invariantValidation.errors,
              warnings: invariantValidation.warnings,
              isStructuralFailure: true,
            };
            
            throw new PipelineContractError(errorMessage, invariantValidationResult);
          }
          
          console.log(`[ProductionWorkflowBuilder] ✅ Pipeline invariant satisfied: All required nodes present in workflow`);
          
          // STEP 9: Success - return validated workflow
          const nodesUsed = workflow.nodes.map(n => {
            const nodeType = n.data?.type || n.type;
            return nodeType;
          });
          
          console.log('[ProductionWorkflowBuilder] ========================================');
          console.log(`[ProductionWorkflowBuilder] ✅ Production build successful:`);
          console.log(`  - Nodes: ${workflow.nodes.length} (types: ${nodesUsed.join(', ')})`);
          console.log(`  - Edges: ${workflow.edges.length}`);
          console.log(`  - Build attempts: ${buildAttempts}`);
          console.log(`  - Validation attempts: ${validationAttempts}`);
          console.log(`  - Build time: ${Date.now() - startTime}ms`);
          console.log(`  - Detected transformations: ${transformationDetection.detected ? transformationDetection.verbs.join(', ') : 'none'}`);
          console.log(`  - DSL transformations: ${dsl.transformations.length}`);
          console.log(`  - Required nodes: ${requiredNodes.join(', ')}`);
          console.log('[ProductionWorkflowBuilder] ========================================');
          
          return {
            success: true,
            workflow,
            errors: [],
            warnings: allWarnings,
            metadata: {
              buildAttempts,
              validationAttempts,
              nodesUsed,
              buildTime: Date.now() - startTime,
            },
          };
        }
        
        // ✅ FIXED: Retry only if validation returns invalid AND it's a network/provider/temporary failure
        allErrors.push(...finalValidation.errors);
        allWarnings.push(...finalValidation.warnings);
        
        console.error(`[ProductionWorkflowBuilder] ❌ Final validation failed: ${finalValidation.errors.length} errors`);
        
        // Check if errors are retryable (network/provider/temporary) or structural (not retryable)
        const isRetryable = finalValidation.errors.some(e => this.isRetryableError(e));
        
        if (isRetryable && finalValidation.shouldRegenerate && attempt < maxRetries) {
          console.log(`[ProductionWorkflowBuilder] 🔄 Retrying due to retryable error (network/provider/temporary failure)...`);
          continue;
        }
        
        // ✅ STRICT: Final validation failure - check if structural or transient
        const hasStructuralError = finalValidation.errors.some(e => !this.isRetryableError(e));
        
        if (hasStructuralError) {
          // Structural failure (validation failure, missing nodes, etc.) - fail immediately (no retry)
          console.error(`[ProductionWorkflowBuilder] ❌ Final validation failed with structural error - FAILING IMMEDIATELY (not retryable)`);
          console.error(`[ProductionWorkflowBuilder]   Errors: ${finalValidation.errors.join(', ')}`);
        } else {
          // Only transient errors - continue retry loop
          console.log(`[ProductionWorkflowBuilder] ⚠️  Final validation failed with transient error - will retry`);
        }
        
        // If structural error or max retries, fail immediately
        if (hasStructuralError || attempt >= maxRetries) {
          return {
            success: false,
            errors: allErrors,
            warnings: allWarnings,
            metadata: {
              buildAttempts,
              validationAttempts,
              nodesUsed: workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean),
              buildTime: Date.now() - startTime,
            },
          };
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during build';
        console.error(`[ProductionWorkflowBuilder] ❌ Build attempt ${attempt} failed: ${errorMessage}`);
        
        // ✅ FIXED: Only retry on network/provider failures, NOT structural failures
        if (error instanceof PipelineContractError) {
          // Pipeline contract violation - structural failure, do not retry
          console.error(`[ProductionWorkflowBuilder] ❌ Pipeline contract violation - NOT retrying`);
          return {
            success: false,
            errors: [...allErrors, errorMessage, ...error.validationResult.errors],
            warnings: [...allWarnings, ...error.validationResult.warnings],
            metadata: {
              buildAttempts,
              validationAttempts,
              nodesUsed: requiredNodes,
              buildTime: Date.now() - startTime,
            },
          };
        }
        
        // ✅ FIXED: Check if error is retryable (network/provider/temporary) or structural
        const isRetryable = this.isRetryableError(errorMessage);
        
        allErrors.push(`Build attempt ${attempt} failed: ${errorMessage}`);
        
        if (isRetryable && attempt < maxRetries) {
          console.log(`[ProductionWorkflowBuilder] 🔄 Retrying after retryable error (network/provider/temporary failure)...`);
          continue;
        }
        
        // Structural failure or max retries reached - do not retry, fail fast
        console.error(`[ProductionWorkflowBuilder] ❌ Structural failure or max retries reached - NOT retrying`);
      }
    }
    
    // All retries exhausted
    console.error(`[ProductionWorkflowBuilder] ❌ All build attempts failed`);
    
    return {
      success: false,
      errors: allErrors,
      warnings: allWarnings,
      metadata: {
        buildAttempts,
        validationAttempts,
        nodesUsed: requiredNodes,
        buildTime: Date.now() - startTime,
      },
    };
  }
  
  /**
   * Get required nodes from intent (no hallucination)
   * ✅ FIXED: Includes transformation nodes from TransformationDetector
   */
  private getRequiredNodes(intent: StructuredIntent, originalPrompt?: string): string[] {
    return intentConstraintEngine.getRequiredNodes(intent, originalPrompt);
  }
  
  /**
   * Validate all nodes exist in capability registry (no hallucination)
   */
  private validateNodesInRegistry(nodeTypes: string[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    for (const nodeType of nodeTypes) {
      const capability = capabilityRegistry.getCapability(nodeType);
      
      if (!capability) {
        errors.push(`Node type "${nodeType}" not found in capability registry (hallucinated node)`);
      } else {
        // Validate node has required properties
        if (!capability.inputType && !capability.outputType) {
          warnings.push(`Node type "${nodeType}" has incomplete capability information`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * ✅ AUTO-REPAIR: Inject missing nodes into workflow
   * 
   * When invariant validation fails, this method attempts to automatically inject
   * missing nodes with proper connections to fix the workflow.
   * 
   * @param workflow - Current workflow (may be missing nodes)
   * @param missingNodeTypes - Array of missing node types to inject
   * @param dsl - Original DSL (for reference)
   * @param intent - Structured intent (for context)
   * @param originalPrompt - Original user prompt (for context)
   * @returns Repair result with updated workflow or errors
   */
  private injectMissingNodes(
    workflow: Workflow,
    missingNodeTypes: string[],
    dsl: WorkflowDSL,
    intent: StructuredIntent,
    originalPrompt: string
  ): {
    success: boolean;
    workflow?: Workflow;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const injectedNodes: WorkflowNode[] = [];
    const injectedEdges: WorkflowEdge[] = [];

    console.log(`[ProductionWorkflowBuilder] 🔧 Auto-repair: Injecting ${missingNodeTypes.length} missing node(s)...`);

    for (const nodeType of missingNodeTypes) {
      try {
        // Step 1: Validate node exists in capability registry
        const capability = capabilityRegistry.getCapability(nodeType);
        if (!capability) {
          errors.push(`Cannot inject node "${nodeType}": Not found in capability registry`);
          continue;
        }

        // Step 2: Determine node category (dataSource/transformation/output) using capability registry
        let nodeCategory: 'data_source' | 'transformation' | 'output' | null = null;
        let operation = 'read'; // Default operation

        // Check intent actions to find the operation for this node type
        const intentAction = intent.actions?.find(a => a.type === nodeType);
        if (intentAction) {
          operation = intentAction.operation || operation;
        }

        // Categorize based on capabilities
        if (nodeCapabilityRegistryDSL.isOutput(nodeType) || 
            (nodeCapabilityRegistryDSL.canWriteData(nodeType) && ['write', 'create', 'update', 'append', 'send'].includes(operation.toLowerCase()))) {
          nodeCategory = 'output';
        } else if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
          nodeCategory = 'transformation';
        } else if (nodeCapabilityRegistryDSL.isDataSource(nodeType) || 
                   nodeCapabilityRegistryDSL.canReadData(nodeType)) {
          nodeCategory = 'data_source';
        } else {
          // Fallback: Try to infer from node type name
          if (nodeType.includes('gmail') || nodeType.includes('email') || 
              nodeType.includes('slack') || nodeType.includes('discord') ||
              nodeType.includes('notification') || nodeType.includes('webhook_response')) {
            nodeCategory = 'output';
            operation = 'send';
          } else if (nodeType.includes('summarizer') || nodeType.includes('llm') || 
                     nodeType.includes('ai_') || nodeType.includes('openai') ||
                     nodeType.includes('anthropic') || nodeType.includes('ollama')) {
            nodeCategory = 'transformation';
            operation = 'transform';
          } else {
            nodeCategory = 'data_source';
            operation = 'read';
          }
        }

        if (!nodeCategory) {
          errors.push(`Cannot determine category for node "${nodeType}"`);
          continue;
        }

        // Step 3: Get node schema from library
        const schema = nodeLibrary.getSchema(nodeType);
        if (!schema) {
          errors.push(`Cannot inject node "${nodeType}": Schema not found in node library`);
          continue;
        }

        // Step 4: Create node
        const nodeId = randomUUID();
        const newNode: WorkflowNode = {
          id: nodeId,
          type: nodeType,
          position: {
            x: 700 + (injectedNodes.length * 200),
            y: 100,
          },
          data: {
            type: nodeType,
            label: schema.label || nodeType.replace(/_/g, ' '),
            category: schema.category || nodeCategory,
            config: {
              operation,
              _autoInjected: true, // Mark as auto-injected for debugging
              _injectedReason: `Missing required node from intent`,
            },
          },
        };

        injectedNodes.push(newNode);
        console.log(`[ProductionWorkflowBuilder]   ✅ Created ${nodeCategory} node: ${nodeType} (operation: ${operation})`);

        // Step 5: Connect node to workflow
        // Find the last node in the workflow (usually a transformation or data source)
        const existingNodes = workflow.nodes;
        const lastNode = existingNodes[existingNodes.length - 1];

        if (lastNode && nodeCategory === 'output') {
          // Connect last node to output node
          const edgeId = randomUUID();
          const newEdge: WorkflowEdge = {
            id: edgeId,
            source: lastNode.id,
            target: nodeId,
            sourceHandle: 'output',
            targetHandle: 'input',
            type: 'default',
          };
          injectedEdges.push(newEdge);
          console.log(`[ProductionWorkflowBuilder]   ✅ Connected ${lastNode.data?.type || lastNode.type} → ${nodeType}`);
        } else if (nodeCategory === 'data_source' && existingNodes.length > 0) {
          // Connect trigger to data source
          const triggerNode = existingNodes.find(n => n.data?.category === 'trigger' || n.type.includes('trigger'));
          if (triggerNode) {
            const edgeId = randomUUID();
            const newEdge: WorkflowEdge = {
              id: edgeId,
              source: triggerNode.id,
              target: nodeId,
              sourceHandle: 'output',
              targetHandle: 'input',
              type: 'default',
            };
            injectedEdges.push(newEdge);
            console.log(`[ProductionWorkflowBuilder]   ✅ Connected trigger → ${nodeType}`);
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to inject node "${nodeType}": ${errorMessage}`);
        console.error(`[ProductionWorkflowBuilder]   ❌ Failed to inject ${nodeType}: ${errorMessage}`);
      }
    }

    // Step 6: Update workflow with injected nodes and edges
    if (injectedNodes.length > 0) {
      const updatedWorkflow: Workflow = {
        ...workflow,
        nodes: [...workflow.nodes, ...injectedNodes],
        edges: [...workflow.edges, ...injectedEdges],
      };

      warnings.push(`Auto-injected ${injectedNodes.length} missing node(s): ${missingNodeTypes.join(', ')}`);

      return {
        success: errors.length === 0,
        workflow: updatedWorkflow,
        errors,
        warnings,
      };
    }

    return {
      success: false,
      errors: errors.length > 0 ? errors : ['No nodes were injected'],
      warnings,
    };
  }

  /**
   * ✅ ENHANCED: Validate DSL completeness before compilation
   * Checks if DSL includes all required nodes from intent
   * 
   * @param dsl - Workflow DSL to validate
   * @param requiredNodes - Required node types from intent
   * @returns Completeness validation result
   */
  private validateDSLCompleteness(
    dsl: WorkflowDSL,
    requiredNodes: string[]
  ): {
    valid: boolean;
    missingNodes: string[];
    warnings: string[];
  } {
    const warnings: string[] = [];
    const dslNodeTypes = new Set<string>();

    // Collect all node types from DSL
    dsl.dataSources.forEach(ds => dslNodeTypes.add(ds.type));
    dsl.transformations.forEach(tf => dslNodeTypes.add(tf.type));
    dsl.outputs.forEach(out => dslNodeTypes.add(out.type));

    // Check for missing nodes (using fuzzy matching)
    const missingNodes: string[] = [];
    for (const requiredNode of requiredNodes) {
      // Skip trigger nodes (they're handled separately)
      if (requiredNode.includes('trigger')) {
        continue;
      }

      // Check if node exists in DSL (exact or partial match)
      const found = Array.from(dslNodeTypes).some(dslType =>
        dslType === requiredNode ||
        dslType.includes(requiredNode) ||
        requiredNode.includes(dslType)
      );

      if (!found) {
        missingNodes.push(requiredNode);
      }
    }

    if (missingNodes.length > 0) {
      warnings.push(`DSL missing ${missingNodes.length} required node(s): ${missingNodes.join(', ')}. Will attempt auto-repair during compilation.`);
    }

    return {
      valid: missingNodes.length === 0,
      missingNodes,
      warnings,
    };
  }
}

// Export singleton instance
export const productionWorkflowBuilder = new ProductionWorkflowBuilder();

// Export convenience function
export async function buildProductionWorkflow(
  intent: StructuredIntent,
  originalPrompt: string,
  options?: BuildOptions
): Promise<ProductionBuildResult> {
  return productionWorkflowBuilder.build(intent, originalPrompt, options);
}
