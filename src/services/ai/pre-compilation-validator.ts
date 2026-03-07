/**
 * Pre-Compilation Validator
 * 
 * Validates DSL before compilation to prevent structural pipeline failures.
 * 
 * Rules:
 * - If intent requires transformation → DSL must have transformations
 * - If intent requires output → DSL must have outputs
 * - Required nodes must be present in DSL
 * - Fail fast on structural issues (no retry loops)
 */

import { WorkflowDSL } from './workflow-dsl';
import { TransformationDetection } from './transformation-detector';
import { StructuredIntent } from './intent-structurer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface PreCompilationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  isStructuralFailure: boolean; // True if this is a structural issue (should not retry)
}

/**
 * Pipeline Contract Error
 * Thrown when pipeline contract is violated
 */
export class PipelineContractError extends Error {
  constructor(message: string, public readonly validationResult: PreCompilationValidationResult) {
    super(message);
    this.name = 'PipelineContractError';
  }
}

/**
 * Pre-Compilation Validator
 * Validates DSL before compilation
 */
export class PreCompilationValidator {
  /**
   * Validate DSL before compilation
   * 
   * @param dsl - Workflow DSL to validate
   * @param transformationDetection - Transformation detection result
   * @param intent - Structured intent
   * @returns Validation result
   */
  validate(
    dsl: WorkflowDSL,
    transformationDetection: TransformationDetection,
    intent: StructuredIntent
  ): PreCompilationValidationResult {
    console.log('[PreCompilationValidator] Validating DSL before compilation...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    let isStructuralFailure = false;

    // Rule 1: If transformation is required → DSL must have transformations
    if (transformationDetection.detected && transformationDetection.verbs.length > 0) {
      if (dsl.transformations.length === 0) {
        const error = `Pipeline contract violation: Transformation verbs detected (${transformationDetection.verbs.join(', ')}) but DSL has 0 transformations. Required node types: ${transformationDetection.requiredNodeTypes.join(', ')}`;
        errors.push(error);
        isStructuralFailure = true;
        console.error(`[PreCompilationValidator] ❌ ${error}`);
      } else {
        // Validate transformation types match required types
        const dslTransformationTypes = dsl.transformations.map(t => t.type);
        const missingTypes = transformationDetection.requiredNodeTypes.filter(
          requiredType => !dslTransformationTypes.some(dslType => 
            dslType === requiredType || 
            dslType.includes(requiredType) || 
            requiredType.includes(dslType)
          )
        );
        
        if (missingTypes.length > 0) {
          warnings.push(`DSL transformations may not match all required types. Missing: ${missingTypes.join(', ')}`);
          console.warn(`[PreCompilationValidator] ⚠️  ${warnings[warnings.length - 1]}`);
        } else {
          console.log(`[PreCompilationValidator] ✅ DSL includes required transformations: ${dslTransformationTypes.join(', ')}`);
        }
      }
    }

    // Rule 2: If intent has actions → DSL must have corresponding data sources or outputs
    if (intent.actions && intent.actions.length > 0) {
      const actionTypes = intent.actions.map(a => a.type);
      const dslNodeTypes = [
        ...dsl.dataSources.map(ds => ds.type),
        ...dsl.outputs.map(out => out.type),
        ...dsl.transformations.map(tf => tf.type),
      ];
      
      const missingActions = actionTypes.filter(actionType => 
        !dslNodeTypes.some(dslType => dslType === actionType || dslType.includes(actionType))
      );
      
      if (missingActions.length > 0) {
        warnings.push(`Some intent actions may not be represented in DSL: ${missingActions.join(', ')}`);
        console.warn(`[PreCompilationValidator] ⚠️  ${warnings[warnings.length - 1]}`);
      }
    }

    // Rule 3: ✅ WORLD-CLASS UNIVERSAL FIX - Capability-based output validation
    // If intent has output actions, DSL must have either:
    // - A separate output node, OR
    // - A terminal-capable node (can serve as output itself)
    // 
    // This is universal - works for ALL node types based on their capabilities.
    // No hardcoding - uses node capability registry.
    const hasOutputActions = intent.actions?.some(a => {
      const op = a.operation?.toLowerCase() || '';
      return ['send', 'write', 'create', 'update', 'notify'].includes(op);
    });
    
    if (hasOutputActions && dsl.outputs.length === 0) {
      // Check if any node in DSL can serve as output (terminal-capable)
      const allDSLNodes = [
        ...dsl.dataSources,
        ...dsl.transformations,
        ...dsl.outputs
      ];
      
      const hasTerminalNode = allDSLNodes.some(node => {
        const nodeType = node.type || '';
        const canServeAsOutput = nodeCapabilityRegistryDSL.canServeAsOutput(nodeType);
        
        if (canServeAsOutput) {
          console.log(
            `[PreCompilationValidator] ✅ Found terminal-capable node: ${nodeType} ` +
            `(can serve as output - no separate output node needed)`
          );
        }
        
        return canServeAsOutput;
      });
      
      if (!hasTerminalNode) {
        const error = 'Pipeline contract violation: Intent has output actions but DSL has no output-capable nodes (needs output node or terminal-capable node)';
        errors.push(error);
        isStructuralFailure = true;
        console.error(`[PreCompilationValidator] ❌ ${error}`);
      } else {
        console.log(
          `[PreCompilationValidator] ✅ Output requirement satisfied: ` +
          `Terminal-capable node found in DSL (no separate output node needed)`
        );
      }
    }

    // Rule 4: DSL must have trigger
    if (!dsl.trigger || !dsl.trigger.type) {
      const error = 'Pipeline contract violation: DSL must have a trigger';
      errors.push(error);
      isStructuralFailure = true;
      console.error(`[PreCompilationValidator] ❌ ${error}`);
    }

    // Rule 5: DSL execution order must be non-empty
    if (dsl.executionOrder.length === 0) {
      const error = 'Pipeline contract violation: DSL execution order must be non-empty';
      errors.push(error);
      isStructuralFailure = true;
      console.error(`[PreCompilationValidator] ❌ ${error}`);
    }

    const valid = errors.length === 0;
    
    if (valid) {
      console.log('[PreCompilationValidator] ✅ DSL validation passed');
    } else {
      console.error(`[PreCompilationValidator] ❌ DSL validation failed: ${errors.length} errors`);
    }

    return {
      valid,
      errors,
      warnings,
      isStructuralFailure,
    };
  }

  /**
   * Validate invariant: intent.requiredNodes ⊆ workflow.nodes
   * 
   * @param requiredNodes - Required node types from intent
   * @param workflowNodeTypes - Node types in workflow
   * @returns Validation result
   */
  validateInvariant(
    requiredNodes: string[],
    workflowNodeTypes: string[]
  ): PreCompilationValidationResult {
    console.log('[PreCompilationValidator] Validating invariant: requiredNodes ⊆ workflow.nodes...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const missingNodes = requiredNodes.filter(required => 
      !this.isRequirementSatisfied(required, workflowNodeTypes)
    );
    
    if (missingNodes.length > 0) {
      const error = `Invariant violation: Required nodes not in workflow. Missing: ${missingNodes.join(', ')}. Required: [${requiredNodes.join(', ')}]. Actual: [${workflowNodeTypes.join(', ')}]`;
      errors.push(error);
      console.error(`[PreCompilationValidator] ❌ ${error}`);
    } else {
      console.log(`[PreCompilationValidator] ✅ Invariant satisfied: All required nodes present in workflow`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      isStructuralFailure: errors.length > 0,
    };
  }

  /**
   * ✅ WORLD-CLASS ARCHITECTURE: Capability-aware requirement satisfaction check
   * 
   * Uses UnifiedNodeTypeMatcher for consistent matching across all layers.
   * 
   * A required node type can be satisfied by any workflow node that:
   * - Matches by canonical type name (exact or contains, for legacy compatibility), OR
   * - Shares the same registry category (e.g., any 'ai' provider fulfilling an AI transformer requirement)
   * 
   * This allows abstract requirements like "ai_chat_model" to be fulfilled by concrete
   * AI providers such as "ollama", "openai_gpt", "anthropic_claude", etc., as long as
   * they are registered under the same 'ai' category in the UnifiedNodeRegistry.
   */
  private isRequirementSatisfied(required: string, workflowNodeTypes: string[]): boolean {
    // ✅ WORLD-CLASS: Use unified matcher for consistent behavior across all layers
    const matchResult = unifiedNodeTypeMatcher.isRequirementSatisfied(
      required,
      workflowNodeTypes,
      {
        strict: false, // Use semantic equivalence
      }
    );
    
    if (matchResult.matches) {
      console.log(
        `[PreCompilationValidator] ✅ Requirement "${required}" is satisfied by ` +
        `workflow node "${matchResult.matchingType}" (${matchResult.reason}, confidence: ${matchResult.confidence}%)`
      );
      return true;
    }
    
    return false;
  }
}

// Export singleton instance
export const preCompilationValidator = new PreCompilationValidator();
