/**
 * Self-Healing Workflow Engine
 * 
 * Automatically repairs workflow validation errors and retries generation.
 * 
 * Features:
 * 1. FailureClassifier - Classify validation errors into categories
 * 2. RepairStrategyEngine - Map errors to repair actions
 * 3. WorkflowRegenerator - Recompile workflow after repair
 * 4. Safe retry policy - Max 3 retries with exponential backoff
 * 5. Never crash pipeline - Always return recoverable result
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { FinalValidationResult } from './final-workflow-validator';
import { deterministicWorkflowCompiler } from './deterministic-workflow-compiler';
import { productionWorkflowBuilder } from './production-workflow-builder';
import { randomUUID } from 'crypto';

/**
 * Failure categories for classification
 */
export enum FailureCategory {
  MISSING_NODE = 'missing_node',
  INVALID_DEPENDENCY = 'invalid_dependency',
  CREDENTIAL_MISSING = 'credential_missing',
  PROVIDER_ERROR = 'provider_error',
  TRANSFORMATION_MISSING = 'transformation_missing',
  ORPHAN_NODE = 'orphan_node',
  DUPLICATE_NODE = 'duplicate_node',
  INVALID_EDGE = 'invalid_edge',
  ORDER_ISSUE = 'order_issue',
  TYPE_MISMATCH = 'type_mismatch',
  UNKNOWN = 'unknown',
}

/**
 * Classified failure
 */
export interface ClassifiedFailure {
  category: FailureCategory;
  severity: 'critical' | 'warning' | 'info';
  error: string;
  details: any;
  repairable: boolean;
}

/**
 * Repair action types
 */
export enum RepairActionType {
  ADD_MISSING_NODE = 'add_missing_node',
  REORDER_NODES = 'reorder_nodes',
  REMOVE_INVALID_NODE = 'remove_invalid_node',
  REGENERATE_WORKFLOW = 'regenerate_workflow',
  FIX_EDGE = 'fix_edge',
  ADD_TRANSFORMATION = 'add_transformation',
  REMOVE_DUPLICATE = 'remove_duplicate',
  FIX_ORDER = 'fix_order',
  NO_ACTION = 'no_action',
}

/**
 * Repair action
 */
export interface RepairAction {
  type: RepairActionType;
  description: string;
  targetNodeId?: string;
  targetNodeType?: string;
  parameters?: Record<string, any>;
}

/**
 * Repair strategy result
 */
export interface RepairStrategyResult {
  actions: RepairAction[];
  canRepair: boolean;
  requiresRegeneration: boolean;
}

/**
 * Self-healing result
 */
export interface SelfHealingResult {
  success: boolean;
  workflow?: Workflow;
  repaired: boolean;
  repairAttempts: number;
  errors: string[];
  warnings: string[];
  repairActions: RepairAction[];
  finalValidation: FinalValidationResult | null;
}

/**
 * Failure Classifier
 * Classifies workflow validation errors into categories
 */
export class FailureClassifier {
  /**
   * Classify validation errors
   */
  classifyErrors(validationResult: FinalValidationResult): ClassifiedFailure[] {
    const failures: ClassifiedFailure[] = [];

    // Classify each error
    for (const error of validationResult.errors) {
      const classified = this.classifyError(error, validationResult);
      failures.push(classified);
    }

    // Classify warnings (lower severity)
    for (const warning of validationResult.warnings) {
      const classified = this.classifyError(warning, validationResult, 'warning');
      failures.push(classified);
    }

    return failures;
  }

  /**
   * Classify a single error
   */
  private classifyError(
    error: string,
    validationResult: FinalValidationResult,
    severity: 'critical' | 'warning' | 'info' = 'critical'
  ): ClassifiedFailure {
    const errorLower = error.toLowerCase();

    // Missing transformation
    if (
      errorLower.includes('transformation') ||
      errorLower.includes('transform') ||
      errorLower.includes('summarize') ||
      errorLower.includes('analyze') ||
      validationResult.details.missingTransformations.length > 0
    ) {
      return {
        category: FailureCategory.TRANSFORMATION_MISSING,
        severity,
        error,
        details: {
          missingTransformations: validationResult.details.missingTransformations,
        },
        repairable: true,
      };
    }

    // Missing node
    if (
      errorLower.includes('missing node') ||
      errorLower.includes('node not found') ||
      errorLower.includes('required node')
    ) {
      return {
        category: FailureCategory.MISSING_NODE,
        severity,
        error,
        details: {},
        repairable: true,
      };
    }

    // Orphan node
    if (
      errorLower.includes('orphan') ||
      errorLower.includes('disconnected') ||
      validationResult.details.orphanNodes.length > 0
    ) {
      return {
        category: FailureCategory.ORPHAN_NODE,
        severity,
        error,
        details: {
          orphanNodes: validationResult.details.orphanNodes,
        },
        repairable: true,
      };
    }

    // Duplicate node
    if (
      errorLower.includes('duplicate') ||
      validationResult.details.duplicateNodes.length > 0 ||
      validationResult.details.duplicateTriggers.length > 0
    ) {
      return {
        category: FailureCategory.DUPLICATE_NODE,
        severity,
        error,
        details: {
          duplicateNodes: validationResult.details.duplicateNodes,
          duplicateTriggers: validationResult.details.duplicateTriggers,
        },
        repairable: true,
      };
    }

    // Invalid edge
    if (
      errorLower.includes('edge') ||
      errorLower.includes('connection') ||
      errorLower.includes('handle') ||
      validationResult.details.invalidEdgeHandles.length > 0
    ) {
      return {
        category: FailureCategory.INVALID_EDGE,
        severity,
        error,
        details: {
          invalidEdgeHandles: validationResult.details.invalidEdgeHandles,
        },
        repairable: true,
      };
    }

    // Order issue
    if (
      errorLower.includes('order') ||
      errorLower.includes('sequence') ||
      errorLower.includes('dependency') ||
      validationResult.details.orderIssues.length > 0
    ) {
      return {
        category: FailureCategory.ORDER_ISSUE,
        severity,
        error,
        details: {
          orderIssues: validationResult.details.orderIssues,
        },
        repairable: true,
      };
    }

    // Type mismatch
    if (
      errorLower.includes('type') ||
      errorLower.includes('compatibility') ||
      errorLower.includes('mismatch')
    ) {
      return {
        category: FailureCategory.TYPE_MISMATCH,
        severity,
        error,
        details: {},
        repairable: true,
      };
    }

    // Invalid dependency
    if (
      errorLower.includes('dependency') ||
      errorLower.includes('depends on') ||
      errorLower.includes('requires')
    ) {
      return {
        category: FailureCategory.INVALID_DEPENDENCY,
        severity,
        error,
        details: {},
        repairable: true,
      };
    }

    // Credential missing
    if (
      errorLower.includes('credential') ||
      errorLower.includes('authentication') ||
      errorLower.includes('api key')
    ) {
      return {
        category: FailureCategory.CREDENTIAL_MISSING,
        severity,
        error,
        details: {},
        repairable: false, // Credentials must be provided by user
      };
    }

    // Provider error
    if (
      errorLower.includes('provider') ||
      errorLower.includes('service unavailable') ||
      errorLower.includes('rate limit')
    ) {
      return {
        category: FailureCategory.PROVIDER_ERROR,
        severity,
        error,
        details: {},
        repairable: false, // External provider issues
      };
    }

    // Unknown
    return {
      category: FailureCategory.UNKNOWN,
      severity,
      error,
      details: {},
      repairable: false,
    };
  }
}

/**
 * Repair Strategy Engine
 * Maps errors to repair actions
 */
export class RepairStrategyEngine {
  /**
   * Generate repair strategy from classified failures
   */
  generateRepairStrategy(
    failures: ClassifiedFailure[],
    workflow: Workflow,
    intent: StructuredIntent,
    originalPrompt: string
  ): RepairStrategyResult {
    const actions: RepairAction[] = [];
    let requiresRegeneration = false;

    // Process failures by category
    for (const failure of failures) {
      if (!failure.repairable) {
        console.log(`[RepairStrategyEngine] ⚠️  Failure not repairable: ${failure.category} - ${failure.error}`);
        continue;
      }

      switch (failure.category) {
        case FailureCategory.TRANSFORMATION_MISSING:
          actions.push({
            type: RepairActionType.ADD_TRANSFORMATION,
            description: `Add missing transformation node: ${failure.details.missingTransformations?.join(', ') || 'unknown'}`,
            parameters: {
              missingTransformations: failure.details.missingTransformations || [],
            },
          });
          requiresRegeneration = true;
          break;

        case FailureCategory.MISSING_NODE:
          actions.push({
            type: RepairActionType.ADD_MISSING_NODE,
            description: `Add missing node required by intent`,
            parameters: {},
          });
          requiresRegeneration = true;
          break;

        case FailureCategory.ORPHAN_NODE:
          actions.push({
            type: RepairActionType.REMOVE_INVALID_NODE,
            description: `Remove orphan nodes: ${failure.details.orphanNodes?.join(', ') || 'unknown'}`,
            parameters: {
              nodeIds: failure.details.orphanNodes || [],
            },
          });
          break;

        case FailureCategory.DUPLICATE_NODE:
          actions.push({
            type: RepairActionType.REMOVE_DUPLICATE,
            description: `Remove duplicate nodes: ${failure.details.duplicateNodes?.join(', ') || 'unknown'}`,
            parameters: {
              nodeIds: failure.details.duplicateNodes || [],
            },
          });
          break;

        case FailureCategory.INVALID_EDGE:
          actions.push({
            type: RepairActionType.FIX_EDGE,
            description: `Fix invalid edge handles`,
            parameters: {
              invalidEdges: failure.details.invalidEdgeHandles || [],
            },
          });
          requiresRegeneration = true;
          break;

        case FailureCategory.ORDER_ISSUE:
          actions.push({
            type: RepairActionType.FIX_ORDER,
            description: `Fix node execution order`,
            parameters: {
              orderIssues: failure.details.orderIssues || [],
            },
          });
          requiresRegeneration = true;
          break;

        case FailureCategory.TYPE_MISMATCH:
        case FailureCategory.INVALID_DEPENDENCY:
          // These require regeneration
          requiresRegeneration = true;
          break;

        default:
          // Unknown failures - try regeneration
          requiresRegeneration = true;
          break;
      }
    }

    // If multiple critical failures or complex issues, regenerate
    const criticalFailures = failures.filter(f => f.severity === 'critical' && f.repairable);
    if (criticalFailures.length > 2 || requiresRegeneration) {
      actions.push({
        type: RepairActionType.REGENERATE_WORKFLOW,
        description: 'Regenerate workflow to fix multiple issues',
        parameters: {},
      });
    }

    return {
      actions,
      canRepair: actions.length > 0,
      requiresRegeneration: requiresRegeneration || criticalFailures.length > 2,
    };
  }
}

/**
 * Workflow Regenerator
 * Recompiles workflow after repair, keeping original intent immutable
 */
export class WorkflowRegenerator {
  /**
   * Regenerate workflow with original intent
   */
  async regenerate(
    intent: StructuredIntent,
    originalPrompt: string,
    repairActions: RepairAction[]
  ): Promise<{ workflow: Workflow; success: boolean; errors: string[]; warnings: string[] }> {
    console.log('[WorkflowRegenerator] Regenerating workflow with original intent...');
    console.log(`[WorkflowRegenerator] Repair actions: ${repairActions.length}`);

    try {
      // Use production workflow builder to regenerate
      const buildResult = await productionWorkflowBuilder.build(intent, originalPrompt, {
        maxRetries: 1, // Single attempt for regeneration
        strictMode: false, // Allow some flexibility
        allowRegeneration: true,
      });

      if (buildResult.success && buildResult.workflow) {
        console.log('[WorkflowRegenerator] ✅ Workflow regenerated successfully');
        return {
          workflow: buildResult.workflow,
          success: true,
          errors: buildResult.errors,
          warnings: buildResult.warnings,
        };
      } else {
        console.error('[WorkflowRegenerator] ❌ Workflow regeneration failed');
        return {
          workflow: { nodes: [], edges: [], metadata: {} } as Workflow,
          success: false,
          errors: buildResult.errors,
          warnings: buildResult.warnings,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during regeneration';
      console.error(`[WorkflowRegenerator] ❌ Regeneration error: ${errorMessage}`);
      return {
        workflow: { nodes: [], edges: [], metadata: {} } as Workflow,
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }
}

/**
 * Self-Healing Workflow Engine
 * Main orchestrator for automatic workflow repair
 */
export class SelfHealingWorkflowEngine {
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 1000; // 1 second
  private readonly MAX_BACKOFF_MS = 10000; // 10 seconds

  private failureClassifier = new FailureClassifier();
  private repairStrategyEngine = new RepairStrategyEngine();
  private workflowRegenerator = new WorkflowRegenerator();

  /**
   * Attempt to heal workflow with automatic repair
   * 
   * @param workflow - Workflow with validation errors
   * @param validationResult - Validation result with errors
   * @param intent - Original structured intent (immutable)
   * @param originalPrompt - Original user prompt
   * @returns Self-healing result
   */
  async heal(
    workflow: Workflow,
    validationResult: FinalValidationResult,
    intent: StructuredIntent,
    originalPrompt: string
  ): Promise<SelfHealingResult> {
    console.log('[SelfHealingWorkflowEngine] Starting self-healing process...');
    console.log(`[SelfHealingWorkflowEngine] Validation errors: ${validationResult.errors.length}`);
    console.log(`[SelfHealingWorkflowEngine] Validation warnings: ${validationResult.warnings.length}`);

    let currentWorkflow = workflow;
    let repairAttempts = 0;
    const allRepairActions: RepairAction[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        console.log(`[SelfHealingWorkflowEngine] Attempt ${attempt + 1}/${this.MAX_RETRIES}`);

        // STEP 1: Classify failures
        const failures = this.failureClassifier.classifyErrors(validationResult);
        console.log(`[SelfHealingWorkflowEngine] Classified ${failures.length} failure(s)`);

        // Check if any failures are repairable
        const repairableFailures = failures.filter(f => f.repairable);
        if (repairableFailures.length === 0) {
          console.log('[SelfHealingWorkflowEngine] ⚠️  No repairable failures found');
          return {
            success: false,
            repaired: false,
            repairAttempts,
            errors: [...allErrors, ...validationResult.errors],
            warnings: [...allWarnings, ...validationResult.warnings],
            repairActions: allRepairActions,
            finalValidation: validationResult,
          };
        }

        // STEP 2: Generate repair strategy
        const strategy = this.repairStrategyEngine.generateRepairStrategy(
          failures,
          currentWorkflow,
          intent,
          originalPrompt
        );

        if (!strategy.canRepair) {
          console.log('[SelfHealingWorkflowEngine] ⚠️  Cannot generate repair strategy');
          return {
            success: false,
            repaired: false,
            repairAttempts,
            errors: [...allErrors, ...validationResult.errors],
            warnings: [...allWarnings, ...validationResult.warnings],
            repairActions: allRepairActions,
            finalValidation: validationResult,
          };
        }

        console.log(`[SelfHealingWorkflowEngine] Generated ${strategy.actions.length} repair action(s)`);
        allRepairActions.push(...strategy.actions);

        // STEP 3: Regenerate workflow if required
        if (strategy.requiresRegeneration) {
          console.log('[SelfHealingWorkflowEngine] Regenerating workflow...');
          repairAttempts++;

          const regenerateResult = await this.workflowRegenerator.regenerate(
            intent,
            originalPrompt,
            strategy.actions
          );

          if (regenerateResult.success && regenerateResult.workflow) {
            currentWorkflow = regenerateResult.workflow;
            allErrors.push(...regenerateResult.errors);
            allWarnings.push(...regenerateResult.warnings);

            // Re-validate regenerated workflow
            const { validateFinalWorkflow } = await import('./final-workflow-validator');
            const revalidation = validateFinalWorkflow(currentWorkflow, originalPrompt);

            if (revalidation.valid) {
              console.log('[SelfHealingWorkflowEngine] ✅ Workflow healed successfully');
              return {
                success: true,
                workflow: currentWorkflow,
                repaired: true,
                repairAttempts,
                errors: allErrors,
                warnings: allWarnings,
                repairActions: allRepairActions,
                finalValidation: revalidation,
              };
            } else {
              // Update validation result for next iteration
              validationResult = revalidation;
              console.log(`[SelfHealingWorkflowEngine] ⚠️  Revalidation failed, retrying... (${revalidation.errors.length} errors)`);
            }
          } else {
            allErrors.push(...regenerateResult.errors);
            console.error(`[SelfHealingWorkflowEngine] ❌ Regeneration failed: ${regenerateResult.errors.join(', ')}`);
          }
        } else {
          // Simple repairs (remove nodes, fix edges) - can be done in-place
          console.log('[SelfHealingWorkflowEngine] Applying in-place repairs...');
          // TODO: Implement in-place repairs for simple actions
          // For now, we'll regenerate for all repairs
          strategy.requiresRegeneration = true;
        }

        // Exponential backoff before retry
        if (attempt < this.MAX_RETRIES - 1) {
          const backoffMs = Math.min(
            this.INITIAL_BACKOFF_MS * Math.pow(2, attempt),
            this.MAX_BACKOFF_MS
          );
          console.log(`[SelfHealingWorkflowEngine] Waiting ${backoffMs}ms before retry...`);
          await this.sleep(backoffMs);
        }
      } catch (error) {
        // ✅ NEVER CRASH: Catch all errors and return recoverable result
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during healing';
        console.error(`[SelfHealingWorkflowEngine] ❌ Error during healing attempt ${attempt + 1}: ${errorMessage}`);
        allErrors.push(errorMessage);

        // Continue to next attempt or return recoverable result
        if (attempt === this.MAX_RETRIES - 1) {
          return {
            success: false,
            repaired: false,
            repairAttempts,
            errors: allErrors,
            warnings: allWarnings,
            repairActions: allRepairActions,
            finalValidation: validationResult,
          };
        }

        // Exponential backoff before retry
        const backoffMs = Math.min(
          this.INITIAL_BACKOFF_MS * Math.pow(2, attempt),
          this.MAX_BACKOFF_MS
        );
        await this.sleep(backoffMs);
      }
    }

    // Max retries exhausted
    console.log('[SelfHealingWorkflowEngine] ⚠️  Max retries exhausted, returning recoverable result');
    return {
      success: false,
      repaired: repairAttempts > 0,
      repairAttempts,
      errors: allErrors,
      warnings: allWarnings,
      repairActions: allRepairActions,
      finalValidation: validationResult,
    };
  }

  /**
   * Sleep utility for exponential backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const selfHealingWorkflowEngine = new SelfHealingWorkflowEngine();

// Export convenience function
export async function healWorkflow(
  workflow: Workflow,
  validationResult: FinalValidationResult,
  intent: StructuredIntent,
  originalPrompt: string
): Promise<SelfHealingResult> {
  return selfHealingWorkflowEngine.heal(workflow, validationResult, intent, originalPrompt);
}
