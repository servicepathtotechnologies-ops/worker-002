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
// ✅ WORLD-CLASS: FinalWorkflowValidator consolidated into WorkflowValidationPipeline
// import { finalWorkflowValidator, validateFinalWorkflow } from './final-workflow-validator';
import { universalNodeAIContext } from './universal-node-ai-context';
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
import { nodeTypeNormalizationService } from './node-type-normalization-service';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { UnifiedNodeDefinition } from '../../core/types/unified-node-contract';
import { unifiedNormalizeNodeTypeString, unifiedNormalizeNodeTypeWithInfo } from '../../core/utils/unified-node-type-normalizer';
import { graphBranchingValidator } from '../../core/validation/graph-branching-validator';
import { unifiedNodeCategorizer } from './unified-node-categorizer';
import { getTriggerNodes } from '../../core/utils/trigger-deduplicator';
import { isTriggerNode, isDataSourceNode, isOutputNode, isTransformationNode } from '../../core/utils/universal-node-type-checker';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';
import { isSpecialNodeType } from '../../core/utils/universal-node-analyzer';
import { universalHandleResolver } from '../../core/error-prevention';

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
      dsl = await dslGenerator.generateDSL(intent, originalPrompt, transformationDetection);
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
    
    // ✅ FIX 4: Validate DSL structure before compilation (Stage 3 → Stage 5)
    console.log('[ProductionWorkflowBuilder] STEP 1.3: Validating DSL structure before compilation...');
    const { stageValidationLayers } = await import('./stage-validation-layers');
    const dslValidationResult = stageValidationLayers.validateDSLBeforeCompilation(dsl);
    
    if (!dslValidationResult.valid) {
      console.error(`[ProductionWorkflowBuilder] ❌ DSL structure validation failed - FAILING IMMEDIATELY`);
      console.error(`[ProductionWorkflowBuilder]   Validation errors: ${dslValidationResult.errors.join(', ')}`);
      return {
        success: false,
        errors: dslValidationResult.errors,
        warnings: [...allWarnings, ...dslValidationResult.warnings],
        metadata: {
          buildAttempts: 0,
          validationAttempts: 0,
          nodesUsed: [],
          buildTime: Date.now() - startTime,
        },
      };
    }
    allWarnings.push(...dslValidationResult.warnings);
    console.log(`[ProductionWorkflowBuilder] ✅ DSL structure validation passed`);
    
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
    
    // ✅ WORLD-CLASS UNIVERSAL: DSL completeness is now handled INSIDE DSLGenerator.generateDSL()
    // No external validation needed - DSLGenerator ensures completeness DURING generation
    // This prevents nodes from being added after ordering (prevents branches)
    console.log('[ProductionWorkflowBuilder] ✅ DSL completeness handled by DSLGenerator (universal solution)');
    
    // Retry loop for generation (ONLY for network/provider failures, NOT structural failures)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      buildAttempts = attempt;
      console.log(`[ProductionWorkflowBuilder] 🔄 Build attempt ${attempt}/${maxRetries}`);
      
      try {
        // STEP 3: Compile DSL to Workflow Graph
        // This is the ONLY way to generate workflow graph - LLM cannot generate graph directly
        // ✅ NOW all required nodes are in DSL before compilation (no branches from post-ordering injection)
        console.log('[ProductionWorkflowBuilder] STEP 3: Compiling DSL to Workflow Graph...');
        const dslCompilationResult = workflowDSLCompiler.compile(dsl, originalPrompt);
        
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

        // ✅ FIX 4: Validate workflow structure after compilation (Stage 5 → Stage 7)
        console.log('[ProductionWorkflowBuilder] STEP 3.1: Validating workflow structure after compilation...');
        const workflowValidationResult = stageValidationLayers.validateWorkflowAfterCompilation(workflow);
        
        if (!workflowValidationResult.valid) {
          console.error(`[ProductionWorkflowBuilder] ❌ Workflow structure validation failed`);
          console.error(`[ProductionWorkflowBuilder]   Validation errors: ${workflowValidationResult.errors.join(', ')}`);
          
          // Try to repair workflow if possible
          const { enhancedEdgeCreationService } = await import('./enhanced-edge-creation-service');
          const repairResult = enhancedEdgeCreationService.repairOrphanNodes(workflow);
          
          if (repairResult.repaired > 0) {
            console.log(`[ProductionWorkflowBuilder] ✅ Repaired ${repairResult.repaired} orphan node(s)`);
            workflow = repairResult.workflow;
            allWarnings.push(...repairResult.warnings);
            
            // Re-validate after repair
            const reValidation = stageValidationLayers.validateWorkflowAfterCompilation(workflow);
            if (!reValidation.valid) {
              allErrors.push(...reValidation.errors);
              allWarnings.push(...reValidation.warnings);
            } else {
              allWarnings.push(...reValidation.warnings);
              console.log(`[ProductionWorkflowBuilder] ✅ Workflow structure validation passed after repair`);
            }
          } else {
            // Could not repair - add errors but continue (may be fixable later)
            allErrors.push(...workflowValidationResult.errors);
            allWarnings.push(...workflowValidationResult.warnings);
            console.warn(`[ProductionWorkflowBuilder] ⚠️  Workflow has structural issues but continuing`);
          }
        } else {
          allWarnings.push(...workflowValidationResult.warnings);
          console.log(`[ProductionWorkflowBuilder] ✅ Workflow structure validation passed`);
        }
        
        console.log(`[ProductionWorkflowBuilder] ✅ DSL compilation successful: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
        
        // ✅ STEP 3.3: Remove duplicate nodes (universal deduplication)
        // This runs AFTER DSL compilation to remove duplicates while preserving main execution path
        console.log('[ProductionWorkflowBuilder] STEP 3.3: Removing duplicate nodes...');
        try {
          const { workflowDeduplicator } = await import('./workflow-deduplicator');
          // Get confidence score from pipeline context if available
          const confidenceScore = (workflow.metadata as any)?.confidenceScore;
          const dedupResult = workflowDeduplicator.deduplicate(workflow, dsl, confidenceScore);
          
          if (dedupResult.metrics.nodesRemoved > 0) {
            workflow = dedupResult.workflow;
            console.log(`[ProductionWorkflowBuilder] ✅ Removed ${dedupResult.metrics.nodesRemoved} duplicate node(s)`);
            console.log(`[ProductionWorkflowBuilder]   Rewired ${dedupResult.metrics.edgesRewired} edge(s)`);
            console.log(`[ProductionWorkflowBuilder]   Processing time: ${dedupResult.metrics.processingTimeMs}ms`);
            
            // Log details for each duplicate removal
            dedupResult.details.forEach(detail => {
              console.log(`[ProductionWorkflowBuilder]   - ${detail.nodeType}: Kept ${detail.keptNode}, Removed ${detail.removedNodes.join(', ')} (${detail.reason})`);
            });
            
            allWarnings.push(...dedupResult.warnings);
            
            // Add metrics to workflow metadata
            workflow.metadata = {
              ...workflow.metadata,
              deduplication: {
                nodesRemoved: dedupResult.metrics.nodesRemoved,
                edgesRewired: dedupResult.metrics.edgesRewired,
                duplicateGroups: dedupResult.metrics.duplicateGroups,
                processingTimeMs: dedupResult.metrics.processingTimeMs,
              },
            };
          } else {
            console.log(`[ProductionWorkflowBuilder] ✅ No duplicate nodes found`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`[ProductionWorkflowBuilder] ⚠️  Deduplication failed: ${errorMessage} - continuing with original workflow`);
          allWarnings.push(`Deduplication failed: ${errorMessage}`);
          // Continue with original workflow (fail-safe)
        }
        
        // ✅ WORLD-CLASS: STEP 3.5: Validate invariant (requiredNodes ⊆ workflow.nodes) - FAIL-FAST
        // Since we validated completeness BEFORE compilation (STEP 2.5), missing nodes here = structural error
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
          // ✅ STRICT: Missing nodes after compilation = structural error (fail immediately, no auto-repair)
          // Nodes should have been added to DSL BEFORE compilation (STEP 2.5)
          // If they're still missing, it's a structural issue that cannot be auto-repaired
          // Auto-repair after ordering creates branches, so we fail-fast instead
          console.error(`[ProductionWorkflowBuilder] ❌ Invariant violated after compilation - structural error`);
          console.error(`[ProductionWorkflowBuilder]   Missing nodes: ${invariantValidation.errors.join(', ')}`);
          console.error(`[ProductionWorkflowBuilder]   This should not happen - nodes should be in DSL before compilation (STEP 2.5)`);
          console.error(`[ProductionWorkflowBuilder]   FAILING IMMEDIATELY (no auto-repair - prevents branches)`);
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
        
        console.log(`[ProductionWorkflowBuilder] ✅ Invariant satisfied: All required nodes present in workflow`);
        
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
        const confidenceScore = (workflow.metadata as any)?.confidenceScore;
        const pruningResult = workflowGraphPruner.prune(workflow, intent, originalPrompt, confidenceScore);
        
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
        
        // STEP 6.4.5: Optimize workflow by removing duplicate operations
        // ✅ ROOT-LEVEL: Remove nodes that perform the same operation (e.g., both ai_agent and ai_chat_model doing summarize)
        // ✅ FIXED: Pass required nodes to prevent removal of required nodes
        console.log('[ProductionWorkflowBuilder] STEP 6.4.5: Optimizing workflow - removing duplicate operations...');
        try {
          const { optimizeWorkflowOperations } = await import('./workflow-operation-optimizer');
          // Convert required nodes array to Set (normalized to lowercase for comparison)
          const requiredNodeTypesSet = new Set(requiredNodes.map(n => n.toLowerCase()));
          const optimizationResult = optimizeWorkflowOperations(workflow, originalPrompt, {
            requiredNodeTypes: requiredNodeTypesSet,
            preserveRequiredNodes: true,
          });
          
          if (optimizationResult.removedNodes.length > 0) {
            workflow = optimizationResult.workflow;
            console.log(
              `[ProductionWorkflowBuilder] ✅ Workflow optimized: ` +
              `Removed ${optimizationResult.removedNodes.length} duplicate operation node(s), ` +
              `${optimizationResult.removedEdges.length} edge(s)`
            );
            allWarnings.push(
              `Removed ${optimizationResult.removedNodes.length} duplicate operation node(s): ` +
              optimizationResult.optimizations.map(opt => 
                `${opt.operation} (kept ${opt.keptNode.nodeType}, removed ${opt.removedNodes.length})`
              ).join(', ')
            );
          } else {
            console.log(`[ProductionWorkflowBuilder] ✅ No duplicate operations found - workflow already optimized`);
          }
        } catch (error) {
          // ✅ ERROR RECOVERY: Operation optimization failed (non-critical, continue with original workflow)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error during operation optimization';
          console.warn(`[ProductionWorkflowBuilder] ⚠️  Operation optimization failed: ${errorMessage}`);
          allWarnings.push(`Could not optimize duplicate operations: ${errorMessage}`);
          // Continue with original workflow
        }

        // STEP 6.5: Layered Validation Pipeline (NEW - Extensible Architecture)
        // ✅ NEW: Run layered validation pipeline for comprehensive validation
        // STEP 6.4: Sanitize workflow graph (topology, duplicates, configs, naming)
        console.log('[ProductionWorkflowBuilder] STEP 6.4: Sanitizing workflow graph...');
        const { workflowGraphSanitizer } = await import('./workflow-graph-sanitizer');
        // ✅ CRITICAL FIX: Pass required node types to sanitizer to protect them from removal
        const requiredNodeTypesSet = new Set(requiredNodes.map(n => n.toLowerCase()));
        const sanitizationResult = workflowGraphSanitizer.sanitize(workflow, requiredNodeTypesSet, confidenceScore);
        workflow = sanitizationResult.workflow;
        
        if (sanitizationResult.fixes.duplicateNodesRemoved > 0 ||
            sanitizationResult.fixes.nodeNamesFixed > 0 ||
            sanitizationResult.fixes.nodeConfigsFixed > 0 ||
            sanitizationResult.fixes.ifElseBranchesFixed > 0 ||
            sanitizationResult.fixes.invalidEdgesRemoved > 0 ||
            sanitizationResult.fixes.orphanNodesRemoved > 0) {
          console.log(`[ProductionWorkflowBuilder] ✅ Workflow sanitized: ${sanitizationResult.fixes.duplicateNodesRemoved} duplicates removed, ${sanitizationResult.fixes.nodeNamesFixed} names fixed, ${sanitizationResult.fixes.nodeConfigsFixed} configs fixed`);
          if (sanitizationResult.warnings.length > 0) {
            allWarnings.push(...sanitizationResult.warnings);
          }
        }

        // ✅ UNIVERSAL FIX: STEP 6.4.5 - Ensure log_output exists BEFORE validation
        // This guarantees EVERY workflow has a terminal output node (log_output)
        // Applied to ALL workflows automatically - no exceptions
        // MUST run BEFORE validation so validation sees the output node
        console.log('[ProductionWorkflowBuilder] STEP 6.4.5: Ensuring log_output terminal node exists (before validation)...');
        if (!workflow) {
          throw new Error('Workflow is undefined - cannot ensure log_output node');
        }
        workflow = this.ensureLogOutputNode(workflow);

        console.log('[ProductionWorkflowBuilder] STEP 6.5: Running layered validation pipeline...');
        validationAttempts++;
        
        const pipelineValidationContext: ValidationContext = {
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
        
        const pipelineValidation = workflowValidationPipeline.validate(pipelineValidationContext);
        
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
          // ✅ Sanitize workflow before returning error (if workflow exists)
          const sanitizedWorkflow = await this.sanitizeWorkflowIfExists(workflow, requiredNodes);
          console.error(`[ProductionWorkflowBuilder] ❌ Validation pipeline failed with structural errors - FAILING IMMEDIATELY (not retryable)`);
          return {
            success: false,
            errors: [...allErrors, ...pipelineValidation.errors],
            warnings: [...allWarnings, ...pipelineValidation.warnings],
            workflow: sanitizedWorkflow, // Return sanitized workflow even on error
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
        
        // STEP 7: Auto-fill text fields using AI before validation
        // ✅ ROOT-LEVEL: Auto-generate message, subject, body, etc. for all nodes
        console.log('[ProductionWorkflowBuilder] STEP 7: Auto-filling text fields using AI...');
        try {
          // TypeScript type guard: workflow is guaranteed to be defined at this point
          if (!workflow) {
            throw new Error('Workflow is undefined');
          }
          const workflowForAutoFill: Workflow = workflow;
          const autoFilledNodes = await Promise.all(
            workflowForAutoFill.nodes.map(async (node) => {
              return await universalNodeAIContext.autoFillNode(
                node,
                workflowForAutoFill,
                originalPrompt,
                {} // Previous outputs not available during generation
              );
            })
          );
          workflow.nodes = autoFilledNodes;
          console.log(`[ProductionWorkflowBuilder] ✅ AI auto-filled text fields for ${autoFilledNodes.length} nodes`);
        } catch (error) {
          console.warn(`[ProductionWorkflowBuilder] ⚠️ AI auto-fill failed (non-blocking):`, error);
          // Continue without auto-fill - user can fill manually
        }
        
        // STEP 8: Final validation before return
        // ✅ FIXED: FinalWorkflowValidator is the SINGLE SOURCE OF TRUTH for build success
        // All other validators (DeterministicWorkflowValidator, type validation, etc.) are advisory only
        console.log('[ProductionWorkflowBuilder] STEP 8: Final validation before return (WorkflowValidationPipeline - single source of truth)');
        validationAttempts++;
        
        // ✅ WORLD-CLASS: Use WorkflowValidationPipeline for final validation (includes all checks from FinalWorkflowValidator)
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
        const finalValidation = workflowValidationPipeline.validate(validationContext);
        
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
          
          // ✅ ROOT-LEVEL: Structural DAG enforcement is handled by StructuralDAGValidationLayer
          // This runs as the FINAL layer (order 6) in the validation pipeline (STEP 6.5)
          // The workflow has already been modified by the validation layer to enforce DAG rules
          // No additional linearization needed here - it's done at the root level in the pipeline
          
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
        const isRetryable = finalValidation.errors.some((e: string) => this.isRetryableError(e));
        
        // Pipeline doesn't have shouldRegenerate - use error count as indicator
        if (isRetryable && attempt < maxRetries) {
          console.log(`[ProductionWorkflowBuilder] 🔄 Retrying due to retryable error (network/provider/temporary failure)...`);
          continue;
        }
        
        // ✅ STRICT: Final validation failure - check if structural or transient
        const hasStructuralError = finalValidation.errors.some((e: string) => !this.isRetryableError(e));
        
        if (hasStructuralError) {
          // Structural failure (validation failure, missing nodes, etc.) - fail immediately (no retry)
          console.error(`[ProductionWorkflowBuilder] ❌ Final validation failed with structural error - FAILING IMMEDIATELY (not retryable)`);
          console.error(`[ProductionWorkflowBuilder]   Errors: ${finalValidation.errors.join(', ')}`);
        } else {
          // Only transient errors - continue retry loop
          console.log(`[ProductionWorkflowBuilder] ⚠️  Final validation failed with transient error - will retry`);
        }
        
        // If structural error or max retries, fail immediately
        // ✅ Sanitize workflow before returning error (if workflow exists)
        if (hasStructuralError || attempt >= maxRetries) {
          const sanitizedWorkflow = await this.sanitizeWorkflowIfExists(workflow, requiredNodes);
          return {
            success: false,
            errors: allErrors,
            warnings: allWarnings,
            workflow: sanitizedWorkflow, // Return sanitized workflow even on error
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
   * ✅ Helper: Sanitize workflow if it exists (for error paths)
   * This ensures sanitization runs even when returning errors
   */
  private async sanitizeWorkflowIfExists(
    workflow: Workflow | undefined,
    requiredNodes: string[]
  ): Promise<Workflow | undefined> {
    if (!workflow) {
      return undefined;
    }
    
    try {
      const { workflowGraphSanitizer } = await import('./workflow-graph-sanitizer');
      const requiredNodeTypesSet = new Set(requiredNodes.map(n => n.toLowerCase()));
      const sanitizationResult = workflowGraphSanitizer.sanitize(workflow, requiredNodeTypesSet);
      
      if (sanitizationResult.fixes.duplicateNodesRemoved > 0 ||
          sanitizationResult.fixes.nodeNamesFixed > 0 ||
          sanitizationResult.fixes.nodeConfigsFixed > 0 ||
          sanitizationResult.fixes.ifElseBranchesFixed > 0 ||
          sanitizationResult.fixes.invalidEdgesRemoved > 0 ||
          sanitizationResult.fixes.orphanNodesRemoved > 0) {
        console.log(`[ProductionWorkflowBuilder] ✅ Workflow sanitized in error path: ${sanitizationResult.fixes.duplicateNodesRemoved} duplicates removed`);
      }
      
      return sanitizationResult.workflow;
    } catch (error) {
      console.warn(`[ProductionWorkflowBuilder] ⚠️  Sanitization failed in error path: ${error}`);
      return workflow; // Return original workflow if sanitization fails
    }
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
   * ✅ ROOT-LEVEL FIX: Uses resolveNodeType() to handle aliases (typeform, gmail, ai, etc.)
   * This ensures aliases are properly resolved to canonical types before validation
   */
  private validateNodesInRegistry(nodeTypes: string[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    normalized: string[]; // Return normalized node types
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalized: string[] = [];
    
    // ✅ ROOT-LEVEL FIX: Import resolveNodeType for alias resolution
    const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
    
    for (const nodeType of nodeTypes) {
      // ✅ UNIVERSAL: Check for special node types (categories, invalid types) using registry
      const specialCheck = isSpecialNodeType(nodeType);
      if (specialCheck.isInvalid) {
        warnings.push(specialCheck.reason || `Node type "${nodeType}" is invalid.`);
        continue; // Skip invalid node types
      }

      // ✅ ROOT-LEVEL FIX: Use resolveNodeType() instead of unifiedNormalizeNodeTypeString()
      // This handles aliases like "typeform" → "form", "gmail" → "google_gmail", "ai" → "ai_chat_model"
      let resolvedType: string;
      try {
        resolvedType = resolveNodeType(nodeType, false);
        
        // Successfully resolved alias
        if (resolvedType && resolvedType !== nodeType) {
          warnings.push(`Node type "${nodeType}" resolved to "${resolvedType}" (alias resolution)`);
        } else if (!resolvedType) {
          // Resolution returned empty - try normalization as fallback
          const normalizationResult = nodeTypeNormalizationService.normalizeNodeType(nodeType);
          if (normalizationResult.valid && normalizationResult.normalized !== nodeType) {
            resolvedType = normalizationResult.normalized;
            warnings.push(`Node type "${nodeType}" normalized to "${resolvedType}" (${normalizationResult.method})`);
          } else if (!normalizationResult.valid) {
            // Could not resolve or normalize - this might be a hallucinated node
            errors.push(`Node type "${nodeType}" could not be resolved and is not found in capability registry (hallucinated node)`);
            continue; // Skip validation for invalid nodes
          } else {
            resolvedType = nodeType; // Use original if normalization didn't change it
          }
        }
        // If resolvedType === nodeType, it's already canonical, use as-is
      } catch (error) {
        // Resolution failed (node type not found) - try normalization as fallback
        const normalizationResult = nodeTypeNormalizationService.normalizeNodeType(nodeType);
        if (normalizationResult.valid && normalizationResult.normalized !== nodeType) {
          resolvedType = normalizationResult.normalized;
          warnings.push(`Node type "${nodeType}" normalized to "${resolvedType}" (fallback: ${normalizationResult.method})`);
        } else {
          // Both resolution and normalization failed
          errors.push(`Node type "${nodeType}" could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
      }
      
      // Ensure we have a resolved type
      if (!resolvedType) {
        resolvedType = nodeType; // Fallback to original
      }
      
      // Validate resolved node type exists in capability registry
      const capability = capabilityRegistry.getCapability(resolvedType);
      
      if (!capability) {
        errors.push(`Node type "${resolvedType}" (from "${nodeType}") not found in capability registry (hallucinated node)`);
      } else {
        // Validate node has required properties
        if (!capability.inputType && !capability.outputType) {
          warnings.push(`Node type "${resolvedType}" has incomplete capability information`);
        }
        normalized.push(resolvedType);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalized,
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

    // ✅ FIX #4: Validate against original user prompt - remove AI nodes if not in original prompt
    const originalPromptLower = (originalPrompt || '').toLowerCase();
    const shouldHaveAI = 
      originalPromptLower.includes('ai') || 
      originalPromptLower.includes('chatbot') ||
      originalPromptLower.includes('llm') ||
      originalPromptLower.includes('summarize') ||
      originalPromptLower.includes('summarise') ||
      originalPromptLower.includes('analyze') ||
      originalPromptLower.includes('analyse') ||
      originalPromptLower.includes('classify') ||
      originalPromptLower.includes('generate') ||
      originalPromptLower.includes('translate');
    
    // Filter out AI nodes if not in original prompt
    const filteredMissingNodeTypes = missingNodeTypes.filter(nodeType => {
      const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
      const isAINode = normalizedType === 'ai_chat_model' || 
                       normalizedType === 'ai_agent' || 
                       normalizedType === 'memory_node' ||
                       nodeType.toLowerCase().includes('ai_');
      
      if (isAINode && !shouldHaveAI) {
        console.log(`[ProductionWorkflowBuilder] ⚠️  Removing ${nodeType}: Not in original prompt ("${originalPrompt?.substring(0, 100)}...")`);
        warnings.push(`Removed ${nodeType} node: Not mentioned in original user prompt`);
        return false;
      }
      return true;
    });
    
    if (filteredMissingNodeTypes.length < missingNodeTypes.length) {
      console.log(`[ProductionWorkflowBuilder] ✅ Filtered ${missingNodeTypes.length - filteredMissingNodeTypes.length} AI node(s) not in original prompt`);
    }

    for (const nodeType of filteredMissingNodeTypes) {
      try {
        // ✅ SEMANTIC EQUIVALENCE: Check if semantically equivalent node already exists BEFORE injection
        // Use temporary variable names to avoid conflicts with later declarations
        const existingNodeTypes = workflow.nodes.map(n => n.type || n.data?.type || '').filter(Boolean);
        const tempIntentAction = intent.actions?.find(a => a.type === nodeType);
        const tempOperation = tempIntentAction?.operation?.toLowerCase();
        
        // Get category from node definition (temporary variable)
        const tempSchema = nodeLibrary.getSchema(nodeType);
        const tempCategory = tempSchema?.category?.toLowerCase();
        
        // ✅ WORLD-CLASS ARCHITECTURE: Check for semantic duplicate using unified matcher
        const semanticDuplicate = unifiedNodeTypeMatcher.findSemanticDuplicate(
          nodeType,
          existingNodeTypes,
          {
            operation: tempOperation,
            category: tempCategory,
            strict: false, // Use semantic equivalence
          }
        );
        
        if (semanticDuplicate) {
          const canonical = unifiedNodeTypeMatcher.getCanonicalType(nodeType, {
            operation: tempOperation,
            category: tempCategory,
          });
          warnings.push(
            `Skipping injection of ${nodeType}: Semantically equivalent node ${semanticDuplicate} already exists in workflow. ` +
            `Both map to canonical type: ${canonical}.`
          );
          console.log(
            `[ProductionWorkflowBuilder]   ⚠️  Skipping semantic duplicate: ${nodeType} ` +
            `(equivalent ${semanticDuplicate} already exists, canonical: ${canonical})`
          );
          continue; // Skip this node - semantic duplicate exists
        }

        // ✅ ROOT-LEVEL FIX: Check for duplicate operations BEFORE injection
        // This prevents injecting nodes that perform the same operation as existing nodes
        const resolvedNodeTypeForCheck = nodeType.toLowerCase() === 'website' 
          ? (originalPrompt.toLowerCase().includes('webhook') || originalPrompt.toLowerCase().includes('receive') || originalPrompt.toLowerCase().includes('listen') ? 'webhook' : 'http_request')
          : nodeType;
        
        // Determine category for duplicate check (simplified - will be recalculated below)
        let duplicateCheckCategory: 'data_source' | 'transformation' | 'output' | null = null;
        if (nodeCapabilityRegistryDSL.isOutput(resolvedNodeTypeForCheck)) {
          duplicateCheckCategory = 'output';
        } else if (nodeCapabilityRegistryDSL.isTransformation(resolvedNodeTypeForCheck)) {
          duplicateCheckCategory = 'transformation';
        } else if (nodeCapabilityRegistryDSL.isDataSource(resolvedNodeTypeForCheck)) {
          duplicateCheckCategory = 'data_source';
        }
        
        if (duplicateCheckCategory) {
          const duplicateCheck = this.checkForDuplicateOperation(workflow, resolvedNodeTypeForCheck, duplicateCheckCategory);
          if (duplicateCheck.isDuplicate) {
            warnings.push(
              `Skipping injection of ${nodeType}: ${duplicateCheck.reason}. ` +
              `Existing node ${duplicateCheck.existingNode?.data?.type || duplicateCheck.existingNode?.type} already performs this operation.`
            );
            console.log(`[ProductionWorkflowBuilder]   ⚠️  Skipping duplicate operation: ${nodeType} (${duplicateCheck.reason})`);
            continue; // Skip this node - duplicate operation detected
          }
        }

        // ✅ CRITICAL FIX: "website" is a category/credential, NOT a node type
        // Resolve "website" to concrete node types before validation
        let resolvedNodeType = nodeType;
        if (nodeType.toLowerCase() === 'website') {
          // "website" should be resolved to http_request or webhook based on context
          // For "capture leads from website" → use http_request
          const promptLower = originalPrompt.toLowerCase();
          if (promptLower.includes('webhook') || promptLower.includes('receive') || promptLower.includes('listen')) {
            resolvedNodeType = 'webhook';
          } else {
            resolvedNodeType = 'http_request'; // Default for reading from website
          }
          console.log(`[ProductionWorkflowBuilder] 🔧 Resolved category "website" → "${resolvedNodeType}"`);
        }

        // Step 1: Validate node exists in capability registry (use resolved type)
        const capability = capabilityRegistry.getCapability(resolvedNodeType);
        if (!capability) {
          errors.push(`Cannot inject node "${nodeType}" (resolved: "${resolvedNodeType}"): Not found in capability registry`);
          continue;
        }

        // Step 2: Determine node category (dataSource/transformation/output) using capability registry
        let nodeCategory: 'data_source' | 'transformation' | 'output' | null = null;
        let operation = 'read'; // Default operation

        // Check intent actions/dataSources to find the operation for this node type
        // Use resolved node type for lookup
        const intentAction = intent.actions?.find(a => a.type === nodeType || a.type === resolvedNodeType);
        const intentDataSource = intent.dataSources?.find(ds => ds.type === nodeType || ds.type === resolvedNodeType);
        if (intentAction) {
          operation = intentAction.operation || operation;
        } else if (intentDataSource) {
          operation = intentDataSource.operation || 'read';
        }

        // Categorize based on capabilities (use resolved type)
        // ✅ PRODUCTION-READY: Add null safety check for operation
        if (nodeCapabilityRegistryDSL.isOutput(resolvedNodeType) || 
            (nodeCapabilityRegistryDSL.canWriteData(resolvedNodeType) && operation && ['write', 'create', 'update', 'append', 'send'].includes(operation.toLowerCase()))) {
          nodeCategory = 'output';
        } else if (nodeCapabilityRegistryDSL.isTransformation(resolvedNodeType)) {
          nodeCategory = 'transformation';
        } else if (nodeCapabilityRegistryDSL.isDataSource(resolvedNodeType) || 
                   nodeCapabilityRegistryDSL.canReadData(resolvedNodeType)) {
          nodeCategory = 'data_source';
        } else {
          // ✅ ROOT-LEVEL FIX: Use registry to infer category (not string matching)
          const nodeDef = unifiedNodeRegistry.get(resolvedNodeType);
          if (nodeDef) {
            // Use registry category to determine DSL category
            const mappedCategory = this.mapRegistryCategoryToDSLCategory(nodeDef.category);
            if (mappedCategory) {
              nodeCategory = mappedCategory;
              // Infer operation from registry tags or category
              const tags = nodeDef.tags || [];
              if (tags.some(tag => ['send', 'notify', 'message'].includes(tag.toLowerCase()))) {
                operation = 'send';
              } else if (tags.some(tag => ['transform', 'process', 'ai'].includes(tag.toLowerCase()))) {
                operation = 'transform';
              } else if (tags.some(tag => ['read', 'fetch', 'get'].includes(tag.toLowerCase()))) {
                operation = 'read';
              }
            } else {
              // Fallback: use registry category directly
              nodeCategory = nodeDef.category === 'communication' ? 'output' : 
                           nodeDef.category === 'ai' ? 'transformation' : 
                           'data_source';
            }
          } else {
            // Node not in registry → default to data_source
            nodeCategory = 'data_source';
            operation = 'read';
          }
        }

        // ✅ SAFETY: Use canonical node category resolver as a final tie-breaker
        // This prevents structural mistakes like treating http_request as an output.
        try {
          const { resolveNodeType: resolveNodeTypeForNode } = require('../../utils/nodeTypeResolver');
          const syntheticNode: WorkflowNode = {
            id: 'synthetic-' + resolvedNodeType,
            type: resolvedNodeType,
            position: { x: 0, y: 0 },
            data: {
              type: resolvedNodeType,
              label: resolvedNodeType,
              // Use currently inferred category as a hint only; the resolver
              // primarily cares about type, not this field.
              category: nodeCategory || '',
              config: {},
            },
          };
          const resolvedMeta = resolveNodeTypeForNode(syntheticNode);

          if (resolvedMeta.category === 'producer') {
            // Map producer → data_source in the DSL/intent terminology
            nodeCategory = 'data_source';
          } else if (resolvedMeta.category === 'transformer') {
            nodeCategory = 'transformation';
          } else if (resolvedMeta.category === 'output') {
            nodeCategory = 'output';
          } else if (resolvedMeta.category === 'trigger') {
            // Triggers should not be auto-injected here; keep existing category
          } else if (resolvedMeta.category === 'condition') {
            // ✅ ROOT-LEVEL FIX: Use registry to detect conditional nodes (not string matching)
            const nodeDef = unifiedNodeRegistry.get(resolvedNodeType);
            const isConditional = nodeDef && (
              nodeDef.category === 'logic' || 
              (nodeDef.tags || []).some(tag => ['conditional', 'branch', 'if', 'switch'].includes(tag.toLowerCase()))
            );
            if (isConditional) {
              // Leave nodeCategory as determined above; they are handled as part of the graph,
              // not as data_source/transformation/output in this switch.
            }
          }
        } catch {
          // If the canonical resolver is not available, fall back to the capability-based result
        }

        if (!nodeCategory) {
          errors.push(`Cannot determine category for node "${nodeType}"`);
          continue;
        }

        // Step 3: Get node schema from library (use resolved type)
        const schema = nodeLibrary.getSchema(resolvedNodeType);
        if (!schema) {
          errors.push(`Cannot inject node "${nodeType}" (resolved: "${resolvedNodeType}"): Schema not found in node library`);
          continue;
        }

        // Step 4: Create node (use resolved type)
        const nodeId = randomUUID();
        const newNode: WorkflowNode = {
          id: nodeId,
          type: resolvedNodeType,
          position: {
            x: 700 + (injectedNodes.length * 200),
            y: 100,
          },
          data: {
            type: resolvedNodeType, // Use resolved type for actual node type
            label: schema.label || resolvedNodeType.replace(/_/g, ' '),
            category: schema.category || nodeCategory,
            config: {
              operation,
              _autoInjected: true, // Mark as auto-injected for debugging
              _injectedReason: `Missing required node from intent (original: "${nodeType}", resolved: "${resolvedNodeType}")`,
            },
          },
        };

        injectedNodes.push(newNode);
        console.log(`[ProductionWorkflowBuilder]   ✅ Created ${nodeCategory} node: ${resolvedNodeType} (from "${nodeType}", operation: ${operation})`);

        // Step 5: Connect node to workflow
        // ✅ CRITICAL: Ensure node is properly connected in linear flow after injection
        // ✅ ROOT-LEVEL FIX: Special handling for branching nodes with true/false ports
        // These nodes must be positioned BEFORE the nodes they route to, with TWO edges (true/false)
        const nodeDef = unifiedNodeRegistry.get(resolvedNodeType);
        const isBranchingWithTrueFalse = nodeDef && 
                                        nodeDef.isBranching && 
                                        nodeDef.outgoingPorts?.includes('true') && 
                                        nodeDef.outgoingPorts?.includes('false');
        
        if (isBranchingWithTrueFalse) {
          // ✅ SPECIAL HANDLING: IF-ELSE nodes need to route to multiple output nodes
          // Find nodes that should be on true/false paths from intent
          const truePathNodeTypes: string[] = [];
          const falsePathNodeTypes: string[] = [];
          
          // Try to infer from intent actions (google_sheets = true, log_output = false)
          if (intent.actions) {
            for (const action of intent.actions) {
              const actionType = action.type.toLowerCase();
              // Heuristic: google_sheets, salesforce, crm = true path (qualified leads)
              // log_output, slack = false path (non-qualified)
              if (actionType.includes('sheets') || actionType.includes('salesforce') || actionType.includes('crm') || actionType.includes('hubspot')) {
                truePathNodeTypes.push(action.type);
              } else if (actionType.includes('log') || actionType.includes('slack') || actionType.includes('notification')) {
                falsePathNodeTypes.push(action.type);
              }
            }
          }
          
          // Find existing nodes that match true/false paths
          const truePathNodes = workflow.nodes.filter(n => {
            const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
            return truePathNodeTypes.some(t => unifiedNormalizeNodeTypeString(t) === nodeType);
          });
          const falsePathNodes = workflow.nodes.filter(n => {
            const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
            return falsePathNodeTypes.some(t => unifiedNormalizeNodeTypeString(t) === nodeType);
          });
          
          // If we can't find specific paths, use first output node as true, second as false
          let targetTrueNode = truePathNodes[0];
          let targetFalseNode = falsePathNodes[0];
          
          if (!targetTrueNode || !targetFalseNode) {
            // Fallback: Find output nodes from workflow
            const outputNodes = workflow.nodes.filter(n => {
              const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
              return nodeCapabilityRegistryDSL.isOutput(nodeType) || 
                     nodeCapabilityRegistryDSL.canWriteData(nodeType);
            });
            
            if (!targetTrueNode && outputNodes.length > 0) {
              targetTrueNode = outputNodes[0]; // First output = true path
            }
            if (!targetFalseNode && outputNodes.length > 1) {
              targetFalseNode = outputNodes[1]; // Second output = false path
            } else if (!targetFalseNode && outputNodes.length === 1) {
              // Only one output - use log_output as false path
              const logOutputNode = workflow.nodes.find(n => {
                const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
                return nodeType === 'log_output';
              });
              if (logOutputNode) {
                targetFalseNode = logOutputNode;
              }
            }
          }
          
          // ✅ UNIVERSAL: Find source node using registry-based detection
          let sourceNode = this.findLastAppropriateNode(workflow, 'transformation', resolvedNodeType);
          
          // ✅ FIX #2: If no appropriate source found, find chain end (not trigger directly)
          if (!sourceNode) {
            const triggerNode = workflow.nodes.find(n => isTriggerNode(n));
            if (triggerNode) {
              // Check if trigger already has outgoing edges
              const triggerOutgoingEdges = workflow.edges.filter(e => e.source === triggerNode.id);
              if (triggerOutgoingEdges.length > 0) {
                // Trigger already connected - find chain end instead
                const chainEndNode = this.findChainEndNode(workflow, triggerNode.id, []);
                if (chainEndNode && chainEndNode.id !== triggerNode.id) {
                  sourceNode = chainEndNode; // Use chain end, not trigger
                  console.log(`[ProductionWorkflowBuilder] ✅ Using chain end node instead of trigger: ${chainEndNode.type || chainEndNode.data?.type}`);
                } else {
                  sourceNode = triggerNode; // Only use trigger if chain is empty
                }
              } else {
                sourceNode = triggerNode; // Trigger has no outgoing edges - safe to use
              }
            }
          }
          
          if (sourceNode) {
            // ✅ UNIVERSAL: Connect source → IF-ELSE using universal service
            const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
            const allNodesForEdges = [...workflow.nodes, newNode];
            
            const edgeToIfElseResult = universalEdgeCreationService.createEdge({
              sourceNode,
              targetNode: newNode,
              existingEdges: [...workflow.edges, ...injectedEdges],
              allNodes: allNodesForEdges,
            });
            
            if (edgeToIfElseResult.success && edgeToIfElseResult.edge) {
              injectedEdges.push(edgeToIfElseResult.edge);
              const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
              console.log(`[ProductionWorkflowBuilder]   ✅ Connected ${sourceType} → if_else`);
            }
            
            // ✅ UNIVERSAL: Connect IF-ELSE → true path node using universal service
            if (targetTrueNode) {
              const trueEdgeResult = universalEdgeCreationService.createEdge({
                sourceNode: newNode,
                targetNode: targetTrueNode,
                sourceHandle: 'true',
                edgeType: 'true',
                existingEdges: [...workflow.edges, ...injectedEdges],
                allNodes: allNodesForEdges,
              });
              
              if (trueEdgeResult.success && trueEdgeResult.edge) {
                injectedEdges.push(trueEdgeResult.edge);
                const trueNodeType = unifiedNormalizeNodeTypeString(targetTrueNode.type || targetTrueNode.data?.type || '');
                console.log(`[ProductionWorkflowBuilder]   ✅ Connected if_else (true) → ${trueNodeType}`);
              }
            }
            
            // ✅ UNIVERSAL: Connect IF-ELSE → false path node using universal service
            if (targetFalseNode) {
              const falseEdgeResult = universalEdgeCreationService.createEdge({
                sourceNode: newNode,
                targetNode: targetFalseNode,
                sourceHandle: 'false',
                edgeType: 'false',
                existingEdges: [...workflow.edges, ...injectedEdges],
                allNodes: allNodesForEdges,
              });
              
              if (falseEdgeResult.success && falseEdgeResult.edge) {
                injectedEdges.push(falseEdgeResult.edge);
                const falseNodeType = unifiedNormalizeNodeTypeString(targetFalseNode.type || targetFalseNode.data?.type || '');
                console.log(`[ProductionWorkflowBuilder]   ✅ Connected if_else (false) → ${falseNodeType}`);
              }
            }
            
            // Remove existing edges that would create cycles (edges from source to true/false nodes)
            // These edges will be replaced by IF-ELSE branching
            // Also remove any edges that connect nodes that should be on IF-ELSE paths
            const edgesToRemove: WorkflowEdge[] = [];
            for (const edge of workflow.edges) {
              // Remove edges from source directly to true/false path nodes
              if (edge.source === sourceNode.id && 
                  (edge.target === targetTrueNode?.id || edge.target === targetFalseNode?.id)) {
                edgesToRemove.push(edge);
              }
              // Remove edges that would create cycles (e.g., log_output → if_else)
              if (edge.source === targetTrueNode?.id && edge.target === nodeId) {
                edgesToRemove.push(edge);
              }
              if (edge.source === targetFalseNode?.id && edge.target === nodeId) {
                edgesToRemove.push(edge);
              }
            }
            // Remove edges that would create cycles
            for (const edgeToRemove of edgesToRemove) {
              const index = workflow.edges.findIndex(e => e.id === edgeToRemove.id);
              if (index >= 0) {
                workflow.edges.splice(index, 1);
                const sourceType = unifiedNormalizeNodeTypeString(
                  workflow.nodes.find(n => n.id === edgeToRemove.source)?.type || 
                  workflow.nodes.find(n => n.id === edgeToRemove.source)?.data?.type || 
                  'unknown'
                );
                const targetType = unifiedNormalizeNodeTypeString(
                  workflow.nodes.find(n => n.id === edgeToRemove.target)?.type || 
                  workflow.nodes.find(n => n.id === edgeToRemove.target)?.data?.type || 
                  'unknown'
                );
                console.log(`[ProductionWorkflowBuilder]   🔧 Removed edge ${sourceType} → ${targetType} (replaced by IF-ELSE branching)`);
              }
            }
            
            console.log(`[ProductionWorkflowBuilder]   ✅ IF-ELSE node injected with branching structure`);
            continue; // Skip normal connection logic for IF-ELSE
          } else {
            warnings.push(`Could not find appropriate source for IF-ELSE node - needs manual connection`);
            console.warn(`[ProductionWorkflowBuilder]   ⚠️  Could not find source for IF-ELSE node`);
            continue;
          }
        }
        
        // ✅ ROOT-LEVEL FIX: Special handling for SWITCH nodes
        // SWITCH nodes need: cases extracted from prompt, multiple output ports (one per case), multiple edges
        const isSwitchNode = resolvedNodeType === 'switch' || 
                            (nodeDef && nodeDef.isBranching && nodeDef.outgoingPorts && nodeDef.outgoingPorts.length > 2);
        
        if (isSwitchNode) {
          // ✅ REAL FUNCTIONALITY: Extract cases from user prompt
          // Pattern: "active statuses send notifications via slack_message, pending statuses trigger email alerts through google_gmail, completed statuses log their details"
          // Extract: cases = ["active", "pending", "completed"], mappings = {active: "slack_message", pending: "google_gmail", completed: "log_output"}
          
          const switchCases: Array<{ value: string; label: string }> = [];
          const caseToNodeMapping: Map<string, string> = new Map();
          
          // Extract cases and mappings from prompt
          const promptLower = originalPrompt.toLowerCase();
          
          // Pattern 1: "X statuses send Y via Z" or "X statuses trigger Y through Z"
          const casePattern = /(\w+)\s+statuses?\s+(?:send|trigger|route|go to|use)\s+(?:notifications?|alerts?|messages?|emails?|logs?)?\s*(?:via|through|to|using)\s+(\w+)/gi;
          let match;
          while ((match = casePattern.exec(originalPrompt)) !== null) {
            const caseValue = match[1].toLowerCase();
            const targetNodeType = match[2].toLowerCase();
            
            // Normalize node type (slack_message, google_gmail, log_output, etc.)
            let normalizedNodeType = targetNodeType;
            if (targetNodeType.includes('slack')) normalizedNodeType = 'slack_message';
            else if (targetNodeType.includes('gmail') || targetNodeType.includes('email')) normalizedNodeType = 'google_gmail';
            else if (targetNodeType.includes('log')) normalizedNodeType = 'log_output';
            
            switchCases.push({ value: caseValue, label: caseValue.charAt(0).toUpperCase() + caseValue.slice(1) });
            caseToNodeMapping.set(caseValue, normalizedNodeType);
          }
          
          // Pattern 2: "if status is X route to Y, if status is Z route to W"
          if (switchCases.length === 0) {
            const ifPattern = /(?:if|when)\s+(?:\w+\s+)?(?:is|equals|==)\s+["']?(\w+)["']?\s+(?:route|send|go|use)\s+(?:to|via|through)\s+(\w+)/gi;
            while ((match = ifPattern.exec(originalPrompt)) !== null) {
              const caseValue = match[1].toLowerCase();
              const targetNodeType = match[2].toLowerCase();
              
              let normalizedNodeType = targetNodeType;
              if (targetNodeType.includes('slack')) normalizedNodeType = 'slack_message';
              else if (targetNodeType.includes('gmail') || targetNodeType.includes('email')) normalizedNodeType = 'google_gmail';
              else if (targetNodeType.includes('log')) normalizedNodeType = 'log_output';
              
              switchCases.push({ value: caseValue, label: caseValue.charAt(0).toUpperCase() + caseValue.slice(1) });
              caseToNodeMapping.set(caseValue, normalizedNodeType);
            }
          }
          
          // Pattern 3: Extract from intent actions if available
          if (switchCases.length === 0 && intent.actions) {
            // Try to infer cases from action types and config
            for (const action of intent.actions) {
              const actionType = action.type.toLowerCase();
              const actionConfig = action.config || {};
              
              // Look for case keywords in action type or config
              const statusKeywords = ['active', 'pending', 'completed', 'success', 'failed', 'error', 'new', 'old'];
              
              // Check action type for keywords
              for (const keyword of statusKeywords) {
                if (actionType.includes(keyword)) {
                  if (!switchCases.some(c => c.value === keyword)) {
                    switchCases.push({ value: keyword, label: keyword.charAt(0).toUpperCase() + keyword.slice(1) });
                    caseToNodeMapping.set(keyword, actionType);
                  }
                }
              }
              
              // Check config for case-related values
              const configStr = JSON.stringify(actionConfig).toLowerCase();
              for (const keyword of statusKeywords) {
                if (configStr.includes(keyword) && !switchCases.some(c => c.value === keyword)) {
                  switchCases.push({ value: keyword, label: keyword.charAt(0).toUpperCase() + keyword.slice(1) });
                  caseToNodeMapping.set(keyword, actionType);
                }
              }
            }
          }
          
          // ✅ CRITICAL: If no cases found, create default cases from output nodes
          if (switchCases.length === 0) {
            const outputNodes = workflow.nodes.filter(n => {
              const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
              return nodeCapabilityRegistryDSL.isOutput(nodeType) || 
                     nodeCapabilityRegistryDSL.canWriteData(nodeType);
            });
            
            // Create cases from output nodes (case_1, case_2, etc.)
            outputNodes.forEach((outputNode, index) => {
              const caseValue = `case_${index + 1}`;
              const nodeType = unifiedNormalizeNodeTypeString(outputNode.type || outputNode.data?.type || '');
              switchCases.push({ value: caseValue, label: `Case ${index + 1}` });
              caseToNodeMapping.set(caseValue, nodeType);
            });
          }
          
          // ✅ REAL FUNCTIONALITY: Extract expression field from prompt
          // Pattern: "route by status", "switch on priority", "based on type"
          let expressionField = 'status'; // Default
          const expressionPatterns = [
            /(?:route|switch|based|by|on)\s+(?:by|on)?\s+(\w+)/i,
            /(\w+)\s+(?:status|field|value|type|category)/i,
          ];
          
          for (const pattern of expressionPatterns) {
            const match = originalPrompt.match(pattern);
            if (match && match[1]) {
              expressionField = match[1].toLowerCase();
              break;
            }
          }
          
          // ✅ REAL FUNCTIONALITY: Set cases in switch node config
          if (switchCases.length > 0) {
            newNode.data.config.cases = switchCases;
            newNode.data.config.expression = `{{$json.${expressionField}}}`; // ✅ REAL FUNCTIONALITY: Expression from prompt analysis
            
            // Update outgoingPorts dynamically - each case gets its own output port
            const caseValues = switchCases.map(c => c.value);
            if (nodeDef) {
              nodeDef.outgoingPorts = caseValues; // ✅ REAL FUNCTIONALITY: Dynamic ports based on cases
            }
            
            console.log(`[ProductionWorkflowBuilder]   ✅ Switch node configured with ${switchCases.length} cases:`, caseValues);
            console.log(`[ProductionWorkflowBuilder]   ✅ Switch expression: {{$json.${expressionField}}}`);
          }
          
          // ✅ UNIVERSAL: Find source node using registry-based detection
          const sourceNode = this.findLastAppropriateNode(workflow, 'transformation', resolvedNodeType) ||
                           workflow.nodes.find(n => isTriggerNode(n));
          
          if (sourceNode && switchCases.length > 0) {
            // Insert SWITCH node after sourceNode
            const sourceNodeIndex = workflow.nodes.findIndex(n => n.id === sourceNode.id);
            if (sourceNodeIndex !== -1) {
              workflow.nodes.splice(sourceNodeIndex + 1, 0, newNode);
            } else {
              workflow.nodes.unshift(newNode); // Fallback to beginning if source not found
            }
            
            // ✅ UNIVERSAL: Connect source → SWITCH using universal service
            const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
            const allNodesForEdges = [...workflow.nodes, newNode];
            
            const edgeToSwitchResult = universalEdgeCreationService.createEdge({
              sourceNode,
              targetNode: newNode,
              existingEdges: [...workflow.edges, ...injectedEdges],
              allNodes: allNodesForEdges,
            });
            
            if (edgeToSwitchResult.success && edgeToSwitchResult.edge) {
              injectedEdges.push(edgeToSwitchResult.edge);
              const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
              console.log(`[ProductionWorkflowBuilder]   ✅ Connected ${sourceType} → switch`);
            }
            
            // ✅ UNIVERSAL: Create ONE edge per case (one plug per case) using universal service
            // Each case gets its own output port and edge to target node
            for (const switchCase of switchCases) {
              const caseValue = switchCase.value;
              const targetNodeType = caseToNodeMapping.get(caseValue);
              
              if (targetNodeType) {
                // Find target node by type
                let targetNode = workflow.nodes.find(n => {
                  const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
                  return unifiedNormalizeNodeTypeString(targetNodeType) === nodeType;
                });
                
                // If target node not found, use first available output node
                if (!targetNode) {
                  const outputNodes = workflow.nodes.filter(n => {
                    const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
                    return nodeCapabilityRegistryDSL.isOutput(nodeType) || 
                           nodeCapabilityRegistryDSL.canWriteData(nodeType);
                  });
                  targetNode = outputNodes[switchCases.indexOf(switchCase)] || outputNodes[0];
                }
                
                if (targetNode) {
                  // ✅ UNIVERSAL: Create edge with sourceHandle = case value using universal service
                  const caseEdgeResult = universalEdgeCreationService.createEdge({
                    sourceNode: newNode,
                    targetNode,
                    sourceHandle: caseValue,
                    edgeType: caseValue,
                    existingEdges: [...workflow.edges, ...injectedEdges],
                    allNodes: allNodesForEdges,
                  });
                  
                  if (caseEdgeResult.success && caseEdgeResult.edge) {
                    injectedEdges.push(caseEdgeResult.edge);
                    const targetNodeTypeName = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
                    console.log(`[ProductionWorkflowBuilder]   ✅ Connected switch (${caseValue}) → ${targetNodeTypeName}`);
                  }
                }
              }
            }
            
            // Remove existing edges that would create cycles (edges from source to case target nodes)
            const edgesToRemove: WorkflowEdge[] = [];
            for (const edge of workflow.edges) {
              if (edge.source === sourceNode.id) {
                // Check if target is one of the case target nodes
                const isCaseTarget = Array.from(caseToNodeMapping.values()).some(targetType => {
                  const targetNode = workflow.nodes.find(n => {
                    const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
                    return unifiedNormalizeNodeTypeString(targetType) === nodeType && n.id === edge.target;
                  });
                  return targetNode !== undefined;
                });
                
                if (isCaseTarget) {
                  edgesToRemove.push(edge);
                }
              }
            }
            
            for (const edgeToRemove of edgesToRemove) {
              const index = workflow.edges.findIndex(e => e.id === edgeToRemove.id);
              if (index >= 0) {
                workflow.edges.splice(index, 1);
                console.log(`[ProductionWorkflowBuilder]   🔧 Removed edge ${edgeToRemove.source} → ${edgeToRemove.target} (replaced by SWITCH branching)`);
              }
            }
            
            console.log(`[ProductionWorkflowBuilder]   ✅ SWITCH node injected with ${switchCases.length} case branches`);
            continue; // Skip normal connection logic for SWITCH
          } else {
            warnings.push(`Could not find appropriate source or cases for SWITCH node - needs manual connection`);
            console.warn(`[ProductionWorkflowBuilder]   ⚠️  Could not find source or cases for SWITCH node`);
            continue;
          }
        }
        
        // ✅ WORLD-CLASS ROOT-LEVEL FIX: Universal branching prevention for ALL node types
        // ✅ Uses registry to determine branching rules (no hardcoded node lists)
        // ✅ Checks BOTH original edges AND injected edges from current pass
        const existingNodes = workflow.nodes;
        let sourceNode = this.findLastAppropriateNode(workflow, nodeCategory, resolvedNodeType);
        
        // ✅ FIX #4: If sourceNode is trigger and trigger already has outgoing edges, use chain end instead
        if (sourceNode && isTriggerNode(sourceNode)) {
          // ✅ TypeScript fix: sourceNode is guaranteed to be non-null here (checked above)
          const triggerNodeId = sourceNode.id;
          const triggerOutgoingEdges = [...workflow.edges, ...injectedEdges].filter(e => e.source === triggerNodeId);
          if (triggerOutgoingEdges.length > 0) {
            // Trigger already connected - find chain end
            const chainEndNode = this.findChainEndNode(workflow, triggerNodeId, injectedEdges);
            if (chainEndNode && chainEndNode.id !== triggerNodeId) {
              sourceNode = chainEndNode;
              console.log(`[ProductionWorkflowBuilder] ✅ Using chain end instead of trigger: ${chainEndNode.type || chainEndNode.data?.type}`);
            }
          }
        }
        
        if (sourceNode) {
          // ✅ UNIVERSAL FIX: Check ALL edges (original + already injected in this pass)
          // This prevents multiple nodes from connecting to the same source in a single injection pass
          const allExistingEdges = [...workflow.edges, ...injectedEdges];
          const existingOutgoingEdges = allExistingEdges.filter(e => e.source === sourceNode.id);
          const wouldCreateBranching = existingOutgoingEdges.length > 0;
          
          // ✅ PRODUCTION-READY: Use centralized branching validator
          const sourceNodeType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
          const isAllowedBranchingNode = graphBranchingValidator.nodeAllowsBranching(sourceNodeType);
          
          // ✅ UNIVERSAL: Use registry to determine if injected node is non-critical
          const injectedNodeDef = unifiedNodeRegistry.get(resolvedNodeType);
          const isNonCriticalNode = injectedNodeDef ? this.isNonCriticalNode(injectedNodeDef, resolvedNodeType) : false;
          
          if (wouldCreateBranching && !isAllowedBranchingNode) {
            if (isNonCriticalNode) {
              // Skip non-critical nodes that would create branching
              warnings.push(
                `Skipping injection of ${resolvedNodeType}: Would create branching from ${unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '')}. ` +
                `This node is not critical for workflow execution and can be omitted to maintain linear flow.`
              );
              console.log(
                `[ProductionWorkflowBuilder]   ⚠️  Skipping ${resolvedNodeType} injection: Would create branching (non-critical node)`
              );
              continue; // Skip this node injection
            } else {
              // For critical nodes, insert linearly in the chain instead of branching
              // Find the last node in the chain from sourceNode (considering injected edges too)
              const chainEndNode = this.findChainEndNode(workflow, sourceNode.id, injectedEdges);
              if (chainEndNode && chainEndNode.id !== sourceNode.id) {
                // Connect to chain end instead of source (linear insertion)
                const edgeId = randomUUID();
                // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
                // ✅ UNIVERSAL: Create edge using universal service (handles resolved internally)
                const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
                const allNodesForEdges = [...workflow.nodes, newNode];
                
                const edgeResult = universalEdgeCreationService.createEdge({
                  sourceNode: chainEndNode,
                  targetNode: newNode,
                  existingEdges: [...workflow.edges, ...injectedEdges],
                  allNodes: allNodesForEdges,
                });
                
                if (edgeResult.success && edgeResult.edge) {
                  injectedEdges.push(edgeResult.edge);
                  const chainEndType = unifiedNormalizeNodeTypeString(chainEndNode.type || chainEndNode.data?.type || '');
                  console.log(
                    `[ProductionWorkflowBuilder]   ✅ Connected ${chainEndType} → ${resolvedNodeType} (${nodeCategory}, linear chain insertion)`
                  );
                } else {
                  warnings.push(`Failed to create edge from chain end to ${resolvedNodeType}: ${edgeResult.error || edgeResult.reason}`);
                  continue;
                }
              } else {
                // Fallback: Skip if we can't find chain end
                warnings.push(
                  `Skipping injection of ${resolvedNodeType}: Would create branching and cannot find chain end for linear insertion`
                );
                console.warn(
                  `[ProductionWorkflowBuilder]   ⚠️  Skipping ${resolvedNodeType}: Would create branching, no chain end found`
                );
                continue;
              }
            }
          } else {
            // No branching issue - connect normally
            const edgeId = randomUUID();
            // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
            // ✅ UNIVERSAL: Create edge using universal service (handles resolved internally)
            const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
            const allNodesForEdges = [...workflow.nodes, newNode];
            
            const edgeResult = universalEdgeCreationService.createEdge({
              sourceNode,
              targetNode: newNode,
              existingEdges: [...workflow.edges, ...injectedEdges],
              allNodes: allNodesForEdges,
            });
            
            if (edgeResult.success && edgeResult.edge) {
              injectedEdges.push(edgeResult.edge);
              const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
              console.log(`[ProductionWorkflowBuilder]   ✅ Connected ${sourceType} → ${resolvedNodeType} (${nodeCategory})`);
            } else {
              warnings.push(`Failed to create edge from source to ${resolvedNodeType}: ${edgeResult.error || edgeResult.reason}`);
              continue;
            }
          }
        } else {
          // No appropriate source found → mark as needs_review
          newNode.data.config._needs_review = true;
          warnings.push(`Injected ${nodeCategory} node ${resolvedNodeType} could not be connected automatically (needs_review)`);
          console.warn(
            `[ProductionWorkflowBuilder]   ⚠️  Could not find appropriate source for ${resolvedNodeType} (${nodeCategory}) - marked as needs_review`
          );
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

      // ✅ CRITICAL FIX: Verify and fix connections after node injection
      // Ensure all nodes are properly connected in linear flow
      const connectionFix = this.verifyAndFixConnections(updatedWorkflow, injectedNodes);
      if (connectionFix.fixed) {
        updatedWorkflow.edges = connectionFix.edges;
        console.log(`[ProductionWorkflowBuilder] ✅ Fixed ${connectionFix.fixedCount} connection(s) after node injection`);
        warnings.push(`Fixed ${connectionFix.fixedCount} connection(s) after node injection`);
      }

      // ✅ WORLD-CLASS FINAL VALIDATION: Ensure no branching errors slipped through
      const branchingValidation = this.validateNoInvalidBranching(updatedWorkflow);
      if (!branchingValidation.valid) {
        errors.push(...branchingValidation.errors);
        console.error(`[ProductionWorkflowBuilder] ❌ Branching validation failed after injection: ${branchingValidation.errors.join(', ')}`);
      }

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
      // ✅ UNIVERSAL: Skip trigger nodes (they're handled separately)
      if (isTriggerNode(requiredNode)) {
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

  /**
   * ✅ WORLD-CLASS: Add missing nodes to DSL BEFORE compilation
   * 
   * This prevents nodes from being added after ordering (which creates branches).
   * Missing nodes are added to the appropriate DSL component (dataSources, transformations, outputs).
   * 
   * @param dsl - Current DSL
   * @param missingNodes - Missing node types
   * @param intent - Structured intent
   * @param originalPrompt - Original user prompt
   * @returns Updated DSL with all required nodes
   */
  private addMissingNodesToDSL(
    dsl: WorkflowDSL,
    missingNodes: string[],
    intent: StructuredIntent,
    originalPrompt: string
  ): WorkflowDSL {
    console.log(`[ProductionWorkflowBuilder] Adding ${missingNodes.length} missing node(s) to DSL...`);
    
    const updatedDSL = { ...dsl };
    let stepCounter = Math.max(
      dsl.dataSources.length,
      dsl.transformations.length,
      dsl.outputs.length
    );
    
    for (const missingNode of missingNodes) {
      const normalizedType = unifiedNormalizeNodeTypeString(missingNode);
      const schema = nodeLibrary.getSchema(normalizedType);
      
      if (!schema) {
        console.warn(`[ProductionWorkflowBuilder] ⚠️  Cannot add missing node "${missingNode}" - not in node library`);
        continue;
      }
      
      // ✅ Determine which DSL component to add to using capability registry
      const capabilities = nodeCapabilityRegistryDSL.getCapabilities(normalizedType);
      const isDataSource = capabilities.includes('data_source') || capabilities.includes('read');
      const isTransformation = capabilities.includes('transformation') || capabilities.includes('ai');
      const isOutput = capabilities.includes('output') || capabilities.includes('write') || capabilities.includes('send') || capabilities.includes('terminal');
      
      // Determine operation from intent or default
      let operation = 'read';
      if (isTransformation) {
        operation = 'transform';
      } else if (isOutput) {
        operation = 'send';
      }
      
      if (isDataSource) {
        updatedDSL.dataSources.push({
          id: `ds_${stepCounter++}`,
          type: normalizedType,
          operation: operation as any,
          config: {},
        });
        console.log(`[ProductionWorkflowBuilder] ✅ Added missing data source to DSL: ${normalizedType}`);
      } else if (isTransformation) {
        updatedDSL.transformations.push({
          id: `tf_${stepCounter++}`,
          type: normalizedType,
          operation: operation as any,
          config: {},
        });
        console.log(`[ProductionWorkflowBuilder] ✅ Added missing transformation to DSL: ${normalizedType}`);
      } else if (isOutput) {
        updatedDSL.outputs.push({
          id: `out_${stepCounter++}`,
          type: normalizedType,
          operation: operation as any,
          config: {},
        });
        console.log(`[ProductionWorkflowBuilder] ✅ Added missing output to DSL: ${normalizedType}`);
      } else {
        console.warn(`[ProductionWorkflowBuilder] ⚠️  Cannot categorize missing node "${missingNode}" - skipping`);
      }
    }
    
    // ✅ Rebuild execution order with new nodes (manual rebuild following DSLGenerator pattern)
    const steps: any[] = [];
    let order = 0;
    
    // Step 0: Trigger
    steps.push({
      stepId: 'step_trigger',
      stepType: 'trigger',
      stepRef: 'trigger',
      order: order++,
    });
    
    // Step 1: Data sources
    for (const ds of updatedDSL.dataSources) {
      steps.push({
        stepId: `step_${ds.id}`,
        stepType: 'data_source',
        stepRef: ds.id,
        dependsOn: ['step_trigger'],
        order: order++,
      });
    }
    
    // Step 2: Transformations
    let lastDataSourceId: string | undefined;
    if (updatedDSL.dataSources.length > 0) {
      lastDataSourceId = `step_${updatedDSL.dataSources[updatedDSL.dataSources.length - 1].id}`;
    }
    
    for (const tf of updatedDSL.transformations) {
      const dependsOn = lastDataSourceId ? [lastDataSourceId] : ['step_trigger'];
      steps.push({
        stepId: `step_${tf.id}`,
        stepType: 'transformation',
        stepRef: tf.id,
        dependsOn,
        order: order++,
      });
      lastDataSourceId = `step_${tf.id}`;
    }
    
    // Step 3: Outputs
    const lastStepId = lastDataSourceId || (updatedDSL.dataSources.length > 0 ? `step_${updatedDSL.dataSources[updatedDSL.dataSources.length - 1].id}` : 'step_trigger');
    
    for (const out of updatedDSL.outputs) {
      steps.push({
        stepId: `step_${out.id}`,
        stepType: 'output',
        stepRef: out.id,
        dependsOn: [lastStepId],
        order: order++,
      });
    }
    
    updatedDSL.executionOrder = steps;
    
    return updatedDSL;
  }

  /**
   * ✅ ROOT-LEVEL FIX: Check for duplicate operations using REGISTRY
   * 
   * Prevents injecting nodes that perform the same operation as existing nodes.
   * Uses registry properties (category, tags) to determine operation equivalence.
   * Works for ANY node type - no hardcoded lists.
   */
  private checkForDuplicateOperation(
    workflow: Workflow,
    nodeType: string,
    nodeCategory: 'data_source' | 'transformation' | 'output'
  ): { isDuplicate: boolean; existingNode?: WorkflowNode; reason?: string } {
    const normalizedType = nodeType.toLowerCase();
    
    // ✅ Get node definition from registry (single source of truth)
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    if (!nodeDef) {
      // Node not in registry → can't determine operation → allow injection
      console.warn(`[ProductionWorkflowBuilder] ⚠️  Node type not in registry: ${nodeType}, skipping duplicate check`);
      return { isDuplicate: false };
    }
    
    // ✅ Determine operation signature from registry properties
    const operationSignature = this.getOperationSignature(nodeDef, nodeCategory);
    
    if (!operationSignature) {
      // Can't determine operation → allow injection
      return { isDuplicate: false };
    }
    
    // ✅ Check if any existing node has same operation signature
    const existingNode = workflow.nodes.find(n => {
      const existingType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const existingDef = unifiedNodeRegistry.get(existingType);
      
      if (!existingDef) return false;
      
      // Must be same category
      const existingCategory = this.mapRegistryCategoryToDSLCategory(existingDef.category);
      if (existingCategory !== nodeCategory) {
        return false;
      }
      
      // Check if has same operation signature
      const existingSignature = this.getOperationSignature(existingDef, existingCategory);
      return existingSignature === operationSignature;
    });
    
    if (existingNode) {
      const existingType = unifiedNormalizeNodeTypeString(existingNode.type || existingNode.data?.type || '');
      return {
        isDuplicate: true,
        existingNode,
        reason: `${nodeType} performs same operation as existing ${existingType} (operation: ${operationSignature})`,
      };
    }
    
    return { isDuplicate: false };
  }

  /**
   * ✅ UNIVERSAL: Get operation signature from registry properties
   * 
   * Operation signature = unique identifier for what the node does
   * Determined from: category + tags + operation type
   * 
   * Examples:
   * - ai_processing: category='ai' + tags=['ai', 'llm']
   * - crm_route: category='data' + tags=['crm', 'route']
   * - email_notify: category='communication' + tags=['email', 'notify']
   */
  private getOperationSignature(
    nodeDef: UnifiedNodeDefinition,
    dslCategory: 'data_source' | 'transformation' | 'output'
  ): string | null {
    const category = nodeDef.category;
    const tags = nodeDef.tags || [];
    
    // ✅ Build operation signature from registry properties
    // Format: "category:operation_type"
    
    // AI processing operations
    if (category === 'ai' || tags.some(tag => ['ai', 'llm', 'chat', 'agent'].includes(tag.toLowerCase()))) {
      return 'ai_processing';
    }
    
    // CRM/route operations
    if (category === 'data' && tags.some(tag => ['crm', 'route', 'sales'].includes(tag.toLowerCase()))) {
      return 'crm_route';
    }
    
    // Database/storage operations
    if (category === 'data' && tags.some(tag => ['database', 'storage', 'write'].includes(tag.toLowerCase()))) {
      return 'data_storage';
    }
    
    // Email operations
    if (category === 'communication' && tags.some(tag => ['email', 'gmail', 'mail'].includes(tag.toLowerCase()))) {
      return 'email_notify';
    }
    
    // Messaging operations
    if (category === 'communication' && tags.some(tag => ['slack', 'discord', 'message', 'chat'].includes(tag.toLowerCase()))) {
      return 'messaging';
    }
    
    // Data source operations
    if (dslCategory === 'data_source') {
      // Check operation type from tags or category
      if (tags.some(tag => ['read', 'fetch', 'get'].includes(tag.toLowerCase()))) {
        return 'data_read';
      }
      if (tags.some(tag => ['write', 'create', 'update'].includes(tag.toLowerCase()))) {
        return 'data_write';
      }
      return 'data_source'; // Generic data source
    }
    
    // Transformation operations
    if (dslCategory === 'transformation') {
      return 'transformation'; // Generic transformation
    }
    
    // Output operations
    if (dslCategory === 'output') {
      // Use category + tags to determine specific operation
      if (category === 'communication') {
        return 'communication_output';
      }
      if (category === 'data') {
        return 'data_output';
      }
      return 'output'; // Generic output
    }
    
    return null; // Unknown operation
  }

  /**
   * ✅ UNIVERSAL: Map registry category to DSL category
   * 
   * Uses registry as single source of truth for category mapping.
   */
  private mapRegistryCategoryToDSLCategory(
    registryCategory: string
  ): 'data_source' | 'transformation' | 'output' | null {
    // ✅ Universal mapping based on registry category definitions
    const mapping: Record<string, 'data_source' | 'transformation' | 'output'> = {
      'data': 'data_source',
      'transformation': 'transformation',
      'ai': 'transformation', // AI nodes are transformations
      'logic': 'transformation', // Logic nodes are transformations
      'communication': 'output',
      'utility': 'output',
    };
    
    return mapping[registryCategory.toLowerCase()] || null;
  }

  /**
   * ✅ WORLD-CLASS UNIVERSAL: Find last appropriate node using REGISTRY
   * 
   * Uses registry category to determine valid connection targets.
   * Works for ANY node type - no hardcoded string matching.
   * 
   * Prevents parallel branches by connecting to last appropriate node in chain.
   * 
   * @param workflow - Current workflow
   * @param startNodeId - Node ID to start traversal from
   * @param injectedEdges - Edges already injected in current pass (for accurate chain detection)
   * @returns Last node in the chain, or null if not found
   */
  private findChainEndNode(workflow: Workflow, startNodeId: string, injectedEdges: WorkflowEdge[] = []): WorkflowNode | null {
    const visited = new Set<string>();
    let currentNodeId = startNodeId;
    
    // ✅ UNIVERSAL: Consider BOTH original edges AND injected edges
    const allEdges = [...workflow.edges, ...injectedEdges];
    
    // Follow the chain until we find a node with no outgoing edges or multiple outgoing edges
    while (currentNodeId) {
      if (visited.has(currentNodeId)) {
        // Cycle detected - return current node
        break;
      }
      visited.add(currentNodeId);
      
      const outgoingEdges = allEdges.filter(e => e.source === currentNodeId);
      
      if (outgoingEdges.length === 0) {
        // Terminal node - this is the chain end
        return workflow.nodes.find(n => n.id === currentNodeId) || null;
      }
      
      if (outgoingEdges.length > 1) {
        // Branching detected - return current node (don't follow branches)
        return workflow.nodes.find(n => n.id === currentNodeId) || null;
      }
      
      // Single outgoing edge - follow it
      currentNodeId = outgoingEdges[0].target;
    }
    
    // Return the last visited node
    const lastNodeId = Array.from(visited).pop();
    return lastNodeId ? workflow.nodes.find(n => n.id === lastNodeId) || null : null;
  }

  private findLastAppropriateNode(
    workflow: Workflow,
    nodeCategory: 'data_source' | 'transformation' | 'output',
    injectedNodeType: string
  ): WorkflowNode | null {
    const existingNodes = workflow.nodes;
    
    // Build execution order from edges (topological sort)
    const executionOrder = this.getTopologicalOrder(workflow);
    
    // ✅ Define valid source categories for each injected category (registry-driven)
    const validSourceCategories = this.getValidSourceCategories(nodeCategory);
    
    // Traverse in reverse order (from end of chain)
    for (let i = executionOrder.length - 1; i >= 0; i--) {
      const nodeId = executionOrder[i];
      const node = existingNodes.find(n => n.id === nodeId);
      if (!node) continue;
      
      // ✅ Get node category from registry (single source of truth)
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (!nodeDef) {
        // Node not in registry → skip
        continue;
      }
      
      const registryCategory = nodeDef.category;
      const mappedCategory = this.mapRegistryCategoryToDSLCategory(registryCategory);
      
      // ✅ Check if this node is a valid source (using registry category)
      if (mappedCategory && validSourceCategories.includes(mappedCategory)) {
        console.log(
          `[ProductionWorkflowBuilder] ✅ Found last appropriate node: ${nodeType} ` +
          `(registry category: ${registryCategory}, DSL category: ${mappedCategory}) ` +
          `for ${nodeCategory} node ${injectedNodeType}`
        );
        return node;
      }
      
      // ✅ Special case: Check if trigger (registry category='trigger')
      if (registryCategory === 'trigger' && nodeCategory === 'data_source') {
        return node;
      }
    }
    
    // ✅ FIX #1: Never return trigger if it already has outgoing edges (prevents branching)
    const triggerNode = existingNodes.find(n => {
      const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const def = unifiedNodeRegistry.get(t);
      return def?.category === 'trigger';
    });
    
    if (triggerNode) {
      // Check if trigger already has outgoing edges
      const triggerOutgoingEdges = workflow.edges.filter(e => e.source === triggerNode.id);
      if (triggerOutgoingEdges.length > 0) {
        // Trigger already connected - find chain end instead (linear insertion)
        console.log(`[ProductionWorkflowBuilder] ⚠️  Trigger already has ${triggerOutgoingEdges.length} outgoing edge(s) - finding chain end instead`);
        const chainEndNode = this.findChainEndNode(workflow, triggerNode.id, []);
        if (chainEndNode && chainEndNode.id !== triggerNode.id) {
          console.log(`[ProductionWorkflowBuilder] ✅ Using chain end node instead of trigger: ${chainEndNode.type || chainEndNode.data?.type}`);
          return chainEndNode; // Return chain end, not trigger
        }
        // If chain end is trigger itself (empty chain), still return trigger (first node)
        console.log(`[ProductionWorkflowBuilder] ⚠️  Chain is empty - using trigger as source (first node)`);
      }
      console.warn(
        `[ProductionWorkflowBuilder] ⚠️  Using trigger as fallback for ${injectedNodeType} ` +
        `(no appropriate node found in chain)`
      );
      return triggerNode; // Only return trigger if it has no outgoing edges or chain is empty
    }
    
    return null;
  }

  /**
   * ✅ WORLD-CLASS UNIVERSAL: Determine if a node allows branching using REGISTRY
   * 
   * Uses registry properties (category, tags, isBranching) to determine if a node
   * can have multiple outgoing edges. Works for ALL node types - no hardcoded lists.
   * 
   * @param nodeDef - Node definition from unified registry
   * @param nodeType - Node type (for logging)
   * @returns true if node allows branching, false otherwise
   */
  /**
   * ✅ PHASE 1 FIX: Use registry helper method instead of private method
   * Registry is single source of truth for branching capability
   * 
   * @param nodeType - Node type (normalized)
   * @returns true if node allows branching, false otherwise
   */
  private nodeAllowsBranching(nodeType: string): boolean {
    // ✅ PHASE 1 FIX: Use registry helper method
    return unifiedNodeRegistry.allowsBranching(nodeType);
  }

  /**
   * ✅ WORLD-CLASS UNIVERSAL: Determine if a node is non-critical using REGISTRY
   * 
   * Non-critical nodes can be skipped if they would create branching.
   * Uses registry properties (category, tags) to determine criticality.
   * Works for ALL node types - no hardcoded lists.
   * 
   * @param nodeDef - Node definition from unified registry
   * @param nodeType - Node type (for logging)
   * @returns true if node is non-critical and can be skipped, false otherwise
   */
  private isNonCriticalNode(nodeDef: UnifiedNodeDefinition, nodeType: string): boolean {
    // ✅ Check registry properties (single source of truth)
    const category = nodeDef.category || '';
    const tags = nodeDef.tags || [];
    const nodeTypeLower = nodeType.toLowerCase();
    
    // ✅ Utility/formatting nodes are typically non-critical
    if (category === 'utility') {
      const formattingTags = ['format', 'parse', 'transform', 'variable', 'set'];
      if (tags.some(tag => formattingTags.includes(tag.toLowerCase()))) {
        console.log(`[ProductionWorkflowBuilder] ✅ Node ${nodeType} is non-critical (category=utility, formatting tag found)`);
        return true;
      }
    }
    
    // ✅ Known non-critical node types (for backward compatibility)
    const knownNonCriticalTypes = ['text_formatter', 'set_variable', 'json_parser', 'variable'];
    if (knownNonCriticalTypes.includes(nodeTypeLower)) {
      console.log(`[ProductionWorkflowBuilder] ✅ Node ${nodeType} is non-critical (known non-critical type)`);
      return true;
    }
    
    // ✅ Default: nodes are critical (should not be skipped)
    return false;
  }

  /**
   * ✅ UNIVERSAL: Get valid source categories for injected node category
   * 
   * Determines which node categories can be valid sources for connection.
   * Based on logical flow rules, not hardcoded node types.
   */
  private getValidSourceCategories(
    injectedCategory: 'data_source' | 'transformation' | 'output'
  ): Array<'data_source' | 'transformation' | 'output'> {
    switch (injectedCategory) {
      case 'data_source':
        // Data sources connect to trigger (they come first)
        return []; // Special case: handled separately
    
      case 'transformation':
        // Transformations connect to data sources or other transformations
        return ['data_source', 'transformation'];
    
      case 'output':
        // Outputs connect to transformations or data sources
        return ['transformation', 'data_source'];
    
      default:
        return [];
    }
  }

  /**
   * ✅ WORLD-CLASS UNIVERSAL: Validate no invalid branching in workflow
   * 
   * Ensures that only nodes that allow branching (if_else, switch, merge, try_catch)
   * have multiple outgoing edges. All other nodes must have exactly one outgoing edge.
   * 
   * Uses registry to determine branching rules - works for ALL node types.
   * 
   * @param workflow - Workflow to validate
   * @returns Validation result with errors if branching is invalid
   */
  /**
   * ✅ CRITICAL FIX: Verify and fix connections after node injection
   * Ensures all injected nodes are properly connected in linear flow
   * Fixes output node detection and connection issues
   */
  private verifyAndFixConnections(
    workflow: Workflow,
    injectedNodes: WorkflowNode[]
  ): { fixed: boolean; edges: WorkflowEdge[]; fixedCount: number } {
    if (injectedNodes.length === 0) {
      return { fixed: false, edges: workflow.edges, fixedCount: 0 };
    }

    const edges = [...workflow.edges];
    let fixedCount = 0;
    const existingEdgePairs = new Set(edges.map(e => `${e.source}::${e.target}`));

    // Sort nodes by execution order (trigger → data sources → transformations → outputs)
    const sortedNodes = this.sortNodesByExecutionOrder(workflow.nodes);
    
    // ✅ UNIVERSAL: Use registry-based trigger detection
    const triggerNode = sortedNodes.find(n => isTriggerNode(n));

    if (!triggerNode) {
      console.warn(`[ProductionWorkflowBuilder] ⚠️  No trigger node found for connection verification`);
      return { fixed: false, edges, fixedCount: 0 };
    }

    // ✅ FIX #3: Remove duplicate edges from trigger BEFORE fixing connections
    // Enforce DAG rule: "Trigger must have exactly 1 outgoing edge"
    const triggerOutgoingEdges = edges.filter(e => e.source === triggerNode.id);
    if (triggerOutgoingEdges.length > 1) {
      // Keep only the first edge, remove others
      const firstEdge = triggerOutgoingEdges[0];
      const edgesToRemove = triggerOutgoingEdges.slice(1);
      
      for (const edgeToRemove of edgesToRemove) {
        const index = edges.findIndex(e => 
          e.source === edgeToRemove.source && e.target === edgeToRemove.target && e.id === edgeToRemove.id
        );
        if (index >= 0) {
          edges.splice(index, 1);
          console.log(`[ProductionWorkflowBuilder] ✅ Removed duplicate edge from trigger: ${edgeToRemove.target}`);
        }
      }
      
      console.log(`[ProductionWorkflowBuilder] ✅ Enforced single edge from trigger: kept ${firstEdge.target}, removed ${edgesToRemove.length} duplicate(s)`);
      fixedCount += edgesToRemove.length;
    }

    // Build linear chain: trigger → ... → last node
    // Connect any disconnected nodes in the chain
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      const sourceNode = sortedNodes[i];
      const targetNode = sortedNodes[i + 1];

      // Skip if source is trigger and target is already connected from trigger
      if (sourceNode.id === triggerNode.id) {
        const hasConnection = edges.some(e => e.source === triggerNode.id && e.target === targetNode.id);
        if (hasConnection) continue;
      }

      // Skip if connection already exists
      const edgeKey = `${sourceNode.id}::${targetNode.id}`;
      if (existingEdgePairs.has(edgeKey)) continue;

      // ✅ UNIVERSAL: Skip if target is trigger (can't connect to trigger)
      if (isTriggerNode(targetNode)) continue;

      // Create connection
      // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
      const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
      const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
      const sourceHandleResult = universalHandleResolver.resolveSourceHandle(sourceType);
      const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
      
      if (!sourceHandleResult.valid || !targetHandleResult.valid) {
        console.warn(`[ProductionWorkflowBuilder] ⚠️  Cannot create edge ${sourceType} → ${targetType}: Handle resolution failed - ${sourceHandleResult.reason || targetHandleResult.reason}`);
        continue;
      }
      
      const newEdge: WorkflowEdge = {
        id: randomUUID(),
        source: sourceNode.id,
        target: targetNode.id,
        type: 'main',
        sourceHandle: sourceHandleResult.handle,
        targetHandle: targetHandleResult.handle,
      };

      edges.push(newEdge);
      existingEdgePairs.add(edgeKey);
      fixedCount++;
      console.log(`[ProductionWorkflowBuilder] ✅ Fixed connection: ${sourceType} → ${targetType}`);
    }

    // ✅ CRITICAL: Ensure output nodes are properly detected and connected
    const outputNodes = sortedNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeCapabilityRegistryDSL.isOutput(nodeType) || 
             nodeCapabilityRegistryDSL.canWriteData(nodeType);
    });

    if (outputNodes.length === 0) {
      console.warn(`[ProductionWorkflowBuilder] ⚠️  No output nodes detected after injection`);
    } else {
      console.log(`[ProductionWorkflowBuilder] ✅ Detected ${outputNodes.length} output node(s) after injection`);
    }

    return { fixed: fixedCount > 0, edges, fixedCount };
  }

  /**
   * Sort nodes by execution order (trigger → data sources → transformations → outputs)
   */
  private sortNodesByExecutionOrder(nodes: WorkflowNode[]): WorkflowNode[] {
    const triggerNodes: WorkflowNode[] = [];
    const dataSourceNodes: WorkflowNode[] = [];
    const transformationNodes: WorkflowNode[] = [];
    const outputNodes: WorkflowNode[] = [];
    const otherNodes: WorkflowNode[] = [];

    // ✅ UNIVERSAL: Use registry-based node categorization for ALL nodes
    for (const node of nodes) {
      if (isTriggerNode(node)) {
        triggerNodes.push(node);
      } else if (isDataSourceNode(node)) {
        dataSourceNodes.push(node);
      } else if (isTransformationNode(node)) {
        transformationNodes.push(node);
      } else if (isOutputNode(node)) {
        outputNodes.push(node);
      } else {
        otherNodes.push(node);
      }
    }

    // Return in execution order
    return [...triggerNodes, ...dataSourceNodes, ...transformationNodes, ...outputNodes, ...otherNodes];
  }

  private validateNoInvalidBranching(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeOutgoingCount = new Map<string, number>();
    
    // Count outgoing edges per node
    workflow.edges.forEach(edge => {
      const count = nodeOutgoingCount.get(edge.source) || 0;
      nodeOutgoingCount.set(edge.source, count + 1);
    });
    
    // Validate each node
    workflow.nodes.forEach(node => {
      const nodeId = node.id;
      const outgoingCount = nodeOutgoingCount.get(nodeId) || 0;
      
      // Nodes with multiple outgoing edges must allow branching
      if (outgoingCount > 1) {
        const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        
        if (!nodeDef) {
          // Node not in registry - assume it doesn't allow branching (conservative)
          errors.push(
            `Node ${nodeType} (${nodeId}) has ${outgoingCount} outgoing edges but is not in registry. ` +
            `Assuming it does not allow branching.`
          );
          return;
        }
        
        // ✅ PRODUCTION-READY: Use centralized branching validator
        const allowsBranching = graphBranchingValidator.nodeAllowsBranching(nodeType);
        
        if (!allowsBranching) {
          errors.push(
            `Node ${nodeType} (${nodeId}) has ${outgoingCount} outgoing edges but does not allow branching. ` +
            `Only nodes with category='logic' or isBranching=true can have multiple outgoing edges.`
          );
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * ✅ Helper: Get topological order from workflow (execution order)
   * 
   * Uses topological sort to determine execution order.
   */
  private getTopologicalOrder(workflow: Workflow): string[] {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    
    // Initialize
    workflow.nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    });
    
    // Build graph
    workflow.edges.forEach(edge => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);
      
      const neighbors = adjacencyList.get(edge.source) || [];
      neighbors.push(edge.target);
      adjacencyList.set(edge.source, neighbors);
    });
    
    // Topological sort
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

  /**
   * ✅ DEPRECATED: This method has been moved to StructuralDAGValidationLayer
   * in workflow-validation-pipeline.ts as a proper validation layer (order 6).
   * 
   * Structural DAG enforcement is now handled at the root level in the validation pipeline,
   * not as a patch in the production builder. This ensures it runs for ALL workflows
   * through the proper architectural layer.
   * 
   * @deprecated Use StructuralDAGValidationLayer in workflow-validation-pipeline.ts
   */
  private enforceStrictLinearDAGStructure_DEPRECATED(
    workflow: Workflow,
    requiredNodes: string[]
  ): {
    workflow: Workflow;
    removedBranches: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let removedBranches = 0;
    const edgesToRemove: WorkflowEdge[] = [];
    
    // Build outgoing edges map
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    workflow.edges.forEach(edge => {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge);
    });
    
    // ✅ UNIVERSAL: Use registry-based trigger detection
    const triggerNodes = workflow.nodes.filter(n => isTriggerNode(n));
    
    if (triggerNodes.length === 0) {
      warnings.push('No trigger node found - cannot enforce linear structure');
      return { workflow, removedBranches: 0, warnings };
    }
    
    // ✅ RULE 1: TRIGGERS MUST HAVE EXACTLY 1 OUTGOING EDGE
    // Remove ALL parallel branches from triggers - keep only the primary path
    for (const triggerNode of triggerNodes) {
      const triggerId = triggerNode.id;
      const triggerType = unifiedNormalizeNodeTypeString(triggerNode.type || triggerNode.data?.type || '');
      const outgoing = outgoingEdges.get(triggerId) || [];
      
      if (outgoing.length > 1) {
        // ✅ CRITICAL: Trigger has multiple branches - remove all except primary path
        const primaryPath = this.findPrimaryPath(workflow, triggerId, requiredNodes);
        const primaryPathSet = new Set(primaryPath);
        
        // Find the edge that's in the primary path
        let primaryEdge: WorkflowEdge | null = null;
        for (const edge of outgoing) {
          if (primaryPathSet.has(edge.target)) {
            primaryEdge = edge;
            break;
          }
        }
        
        // If no edge in primary path, keep the first one (fallback)
        if (!primaryEdge && outgoing.length > 0) {
          primaryEdge = outgoing[0];
        }
        
        // Remove ALL other edges from trigger
        if (primaryEdge) {
          for (const edge of outgoing) {
            if (edge.source !== primaryEdge.source || edge.target !== primaryEdge.target) {
              edgesToRemove.push(edge);
              removedBranches++;
            }
          }
          
          if (outgoing.length > 1) {
            warnings.push(
              `Removed ${outgoing.length - 1} parallel branch(es) from ${triggerType} (${triggerId}) ` +
              `- triggers must have exactly 1 outgoing edge`
            );
          }
        }
      } else if (outgoing.length === 0) {
        warnings.push(`Trigger ${triggerType} (${triggerId}) has no outgoing edges - workflow may be incomplete`);
      }
    }
    
    // ✅ RULE 2: NORMAL NODES MUST HAVE EXACTLY 1 OUTGOING EDGE
    // Find the primary path from trigger to output
    const primaryTrigger = triggerNodes[0];
    const primaryPath = this.findPrimaryPath(workflow, primaryTrigger.id, requiredNodes);
    const primaryPathSet = new Set(primaryPath);
    
    // Process all nodes (except allowed branching nodes)
    workflow.nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeId = node.id;
      
      // ✅ ALLOWED BRANCHING NODES: if_else, switch, merge
      // These can have multiple outputs/inputs as per DAG rules
      // ✅ PHASE 1 FIX: Use registry to check if node allows branching
      const normalizedNodeType = unifiedNormalizeNodeTypeString(nodeType);
      const nodeDef = unifiedNodeRegistry.get(normalizedNodeType);
      const allowsBranching = nodeDef?.isBranching || false;
      
      if (allowsBranching) {
        // ✅ ROOT-LEVEL FIX: Validate edge types for branching nodes with true/false ports
        // Check if node has true/false ports (e.g., if_else)
        const hasTrueFalsePorts = nodeDef?.isBranching && 
                                 nodeDef.outgoingPorts?.includes('true') && 
                                 nodeDef.outgoingPorts?.includes('false');
        
        if (hasTrueFalsePorts) {
          const outgoing = outgoingEdges.get(nodeId) || [];
          const hasTrueEdge = outgoing.some(e => e.type === 'true');
          const hasFalseEdge = outgoing.some(e => e.type === 'false');
          
          if (outgoing.length > 2) {
            // Too many edges - keep only true and false
            const edgesToKeep = outgoing.filter(e => e.type === 'true' || e.type === 'false');
            for (const edge of outgoing) {
              if (!edgesToKeep.includes(edge)) {
                edgesToRemove.push(edge);
                removedBranches++;
              }
            }
            warnings.push(`Branching node with true/false ports (${nodeId}) had ${outgoing.length} edges - kept only true/false paths`);
          }
        }
        return; // Skip further processing for allowed branching nodes
      }
      
      // ✅ PHASE 1 FIX: Use registry to check if node is merge
      if (normalizedNodeType === 'merge' || (nodeDef?.tags || []).some(tag => tag.toLowerCase() === 'merge')) {
        // Merge: Can have multiple inputs but EXACTLY 1 output
        const outgoing = outgoingEdges.get(nodeId) || [];
        if (outgoing.length > 1) {
          // Keep only the first edge (primary path)
          for (let i = 1; i < outgoing.length; i++) {
            edgesToRemove.push(outgoing[i]);
            removedBranches++;
          }
          warnings.push(`Merge node (${nodeId}) had ${outgoing.length} outputs - kept only 1 (merge must have exactly 1 output)`);
        }
        return; // Skip further processing for merge
      }
      
      // ✅ RULE: All other nodes must have EXACTLY 1 outgoing edge
      const outgoing = outgoingEdges.get(nodeId) || [];
      
      if (outgoing.length > 1) {
        // This node has illegal branching - keep only the edge in primary path
        let edgeToKeep: WorkflowEdge | null = null;
        
        // First, try to find edge in primary path
        for (const edge of outgoing) {
          if (primaryPathSet.has(edge.target)) {
            edgeToKeep = edge;
            break;
          }
        }
        
        // If no edge in primary path, check if target is a required node
        if (!edgeToKeep) {
          for (const edge of outgoing) {
            const targetNode = workflow.nodes.find(n => n.id === edge.target);
            if (!targetNode) continue;
            
            const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
            const isRequiredNode = requiredNodes.some(req => 
              targetType === req || targetType.includes(req) || req.includes(targetType)
            );
            
            if (isRequiredNode) {
              edgeToKeep = edge;
              break;
            }
          }
        }
        
        // Fallback: keep first edge
        if (!edgeToKeep && outgoing.length > 0) {
          edgeToKeep = outgoing[0];
        }
        
        // Remove ALL other edges
        if (edgeToKeep) {
          for (const edge of outgoing) {
            if (edge.source !== edgeToKeep.source || edge.target !== edgeToKeep.target) {
              edgesToRemove.push(edge);
              removedBranches++;
            }
          }
          
          warnings.push(
            `Removed ${outgoing.length - 1} illegal branch(es) from ${nodeType} (${nodeId}) ` +
            `- normal nodes must have exactly 1 outgoing edge`
          );
        }
      }
    });
    
    // Remove marked edges
    const remainingEdges = workflow.edges.filter(edge => 
      !edgesToRemove.some(toRemove => 
        toRemove.source === edge.source && toRemove.target === edge.target
      )
    );
    
    // Create new workflow with linearized edges
    const linearizedWorkflow: Workflow = {
      ...workflow,
      edges: remainingEdges,
    };
    
    return {
      workflow: linearizedWorkflow,
      removedBranches,
      warnings,
    };
  }

  /**
   * Find the primary execution path from trigger to main output
   * This is the path that should be preserved when linearizing
   */
  private findPrimaryPath(
    workflow: Workflow,
    triggerId: string,
    requiredNodes: string[]
  ): string[] {
    const path: string[] = [triggerId];
    const visited = new Set<string>([triggerId]);
    
    // Build adjacency map
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    workflow.edges.forEach(edge => {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge);
    });
    
    // BFS to find path to main output
    let currentNodeId = triggerId;
    
    while (currentNodeId) {
      const outgoing = outgoingEdges.get(currentNodeId) || [];
      
      if (outgoing.length === 0) {
        // Terminal node - end of path
        break;
      }
      
      // Prefer edge that leads to a required node
      let nextNodeId: string | null = null;
      
      // First, try to find edge leading to required node
      for (const edge of outgoing) {
        const targetNode = workflow.nodes.find(n => n.id === edge.target);
        if (!targetNode) continue;
        
        const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
        const isRequired = requiredNodes.some(req => 
          targetType === req || targetType.includes(req) || req.includes(targetType)
        );
        
        if (isRequired && !visited.has(edge.target)) {
          nextNodeId = edge.target;
          break;
        }
      }
      
      // If no required node found, take first unvisited edge
      if (!nextNodeId) {
        for (const edge of outgoing) {
          if (!visited.has(edge.target)) {
            nextNodeId = edge.target;
            break;
          }
        }
      }
      
      if (!nextNodeId) {
        // No more nodes to visit
        break;
      }
      
      path.push(nextNodeId);
      visited.add(nextNodeId);
      currentNodeId = nextNodeId;
    }
    
    return path;
  }

  /**
   * ✅ UNIVERSAL ROOT FIX: Always ensure log_output node exists as final terminal output
   * 
   * This is a UNIVERSAL fix - applies to ALL workflows (chatbot, email, slack, JSON, etc.)
   * log_output is ALWAYS added as the final node to show the workflow's final response/output.
   * This ensures users can always see the last output of any workflow.
   * 
   * Strategy:
   * 1. Find all terminal nodes (nodes with no outgoing edges, excluding triggers)
   * 2. Check if log_output already exists
   * 3. If not, create log_output node (ALWAYS, regardless of other output nodes)
   * 4. Connect all terminal nodes to log_output
   * 
   * This runs BEFORE final validation to ensure validation never fails on "No output nodes found"
   */
  private ensureLogOutputNode(workflow: Workflow): Workflow {
    if (!workflow || !workflow.nodes || workflow.nodes.length === 0) {
      return workflow;
    }

    // Find existing output nodes using unified categorizer
    const outgoingEdgesMap = new Map<string, WorkflowEdge[]>();
    workflow.edges.forEach(edge => {
      if (!outgoingEdgesMap.has(edge.source)) {
        outgoingEdgesMap.set(edge.source, []);
      }
      outgoingEdgesMap.get(edge.source)!.push(edge);
    });

    // ✅ UNIVERSAL: Always ensure log_output exists as final output node
    // Check if log_output already exists
    let logOutputNode = workflow.nodes.find(node => {
      const nodeType = node.type || (node.data as any)?.type || '';
      return (nodeType || '').toLowerCase() === 'log_output';
    });
      
    // If log_output already exists and has incoming edges, it's already connected - we're done
    if (logOutputNode) {
      const hasIncomingEdges = workflow.edges.some(edge => edge.target === logOutputNode!.id);
      if (hasIncomingEdges) {
        console.log(`[ProductionWorkflowBuilder] ✅ log_output already exists and is connected - no action needed`);
      return workflow;
      }
    }

    // ✅ ROOT-LEVEL FIX: Find ONLY actual terminal nodes (nodes with no outgoing edges, excluding triggers)
    // Terminal nodes are nodes that have no outgoing edges AND are not log_output itself
    // These are the nodes that should connect to log_output
    const terminalNodes = workflow.nodes.filter(node => {
      const nodeType = node.type || (node.data as any)?.type || '';
      const nodeTypeLower = (nodeType || '').toLowerCase();
      const isTerminal = !outgoingEdgesMap.has(node.id) && !isTriggerNode(node);
      
      // Exclude log_output itself from terminal nodes
      return isTerminal && nodeTypeLower !== 'log_output';
    });

    if (terminalNodes.length === 0) {
      // If log_output exists but no terminal nodes, it might already be connected
      if (logOutputNode) {
        console.log(`[ProductionWorkflowBuilder] ✅ log_output exists - all nodes may already be connected`);
        return workflow;
      }
      console.warn(`[ProductionWorkflowBuilder] ⚠️  No terminal nodes found to connect log_output to`);
      return workflow;
    }

    // ✅ UNIVERSAL: Always create log_output if it doesn't exist (regardless of other output nodes)
    // This ensures EVERY workflow has log_output as the final node to show the response
    if (!logOutputNode) {
      // Find the rightmost terminal node to position log_output after it
      const lastTerminalNode = terminalNodes.reduce((last, current) => {
        const lastPos = last.position?.x || 0;
        const currentPos = current.position?.x || 0;
        return currentPos > lastPos ? current : last;
      }, terminalNodes[0]);
      
      const lastPosition = lastTerminalNode.position || { x: 0, y: 0 };
      
      logOutputNode = {
        id: randomUUID(),
        type: 'log_output',
        position: {
          x: (lastPosition.x || 0) + 400,
          y: lastPosition.y || 0,
        },
        data: {
          label: 'Log Output',
          type: 'log_output',
          category: 'output',
          config: {
            message: '{{$json}}',
            level: 'info',
            _autoInjected: true,
          },
        },
      };
      
      workflow.nodes.push(logOutputNode);
      console.log(`[ProductionWorkflowBuilder] ✅ Created log_output node: ${logOutputNode.id} (universal final output)`);
    } else {
      console.log(`[ProductionWorkflowBuilder] ✅ Using existing log_output node: ${logOutputNode.id} (universal final output)`);
    }

    // Connect all terminal nodes to log_output
    const existingEdgePairs = new Set(workflow.edges.map(e => `${e.source}::${e.target}`));
    
    for (const terminalNode of terminalNodes) {
      const edgeKey = `${terminalNode.id}::${logOutputNode.id}`;
      
      // Skip if edge already exists
      if (existingEdgePairs.has(edgeKey)) {
        continue;
      }

      // Create edge from terminal node to log_output
      // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
      const terminalNodeType = unifiedNormalizeNodeTypeString(terminalNode.type || (terminalNode.data as any)?.type || 'unknown');
      const sourceHandleResult = universalHandleResolver.resolveSourceHandle(terminalNodeType);
      const targetHandleResult = universalHandleResolver.resolveTargetHandle('log_output');
      
      if (!sourceHandleResult.valid || !targetHandleResult.valid) {
        console.warn(`[ProductionWorkflowBuilder] ⚠️  Cannot create edge to log_output: Handle resolution failed - ${sourceHandleResult.reason || targetHandleResult.reason}`);
        continue;
      }
      
      const newEdge: WorkflowEdge = {
        id: randomUUID(),
        source: terminalNode.id,
        target: logOutputNode.id,
        type: 'main',
        sourceHandle: sourceHandleResult.handle,
        targetHandle: targetHandleResult.handle,
      };

      workflow.edges.push(newEdge);
      existingEdgePairs.add(edgeKey);
      console.log(`[ProductionWorkflowBuilder] ✅ Connected ${terminalNodeType} → log_output`);
    }

    console.log(`[ProductionWorkflowBuilder] ✅ Ensured log_output node exists: connected ${terminalNodes.length} terminal node(s)`);
    
    return workflow;
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
