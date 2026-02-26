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

    // Rule 3: DSL must have at least one output if intent has output actions
    const hasOutputActions = intent.actions?.some(a => {
      const op = a.operation?.toLowerCase() || '';
      return ['send', 'write', 'create', 'update', 'notify'].includes(op);
    });
    
    if (hasOutputActions && dsl.outputs.length === 0) {
      const error = 'Pipeline contract violation: Intent has output actions but DSL has 0 outputs';
      errors.push(error);
      isStructuralFailure = true;
      console.error(`[PreCompilationValidator] ❌ ${error}`);
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
      !workflowNodeTypes.some(actual => actual === required || actual.includes(required))
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
}

// Export singleton instance
export const preCompilationValidator = new PreCompilationValidator();
