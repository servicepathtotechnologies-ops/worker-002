/**
 * Deterministic Workflow Validator
 * 
 * STEP 6: Reject workflow if:
 * - email before summarization
 * - unused nodes exist
 * - data type mismatch
 * - disconnected graph
 * 
 * This is a strict validator - rejects invalid workflows.
 */

import { MappedExecutionStep } from './node-mapper';
import { capabilityRegistry } from './capability-registry';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { transformationDetector, detectTransformations } from './transformation-detector';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    orderingIssues: string[];
    unusedNodes: string[];
    typeMismatches: Array<{ source: string; target: string; reason: string }>;
    disconnectedNodes: string[];
  };
}

/**
 * Deterministic Workflow Validator
 * Validates workflow structure and data flow
 */
export class DeterministicWorkflowValidator {
  /**
   * Validate workflow
   * 
   * @param steps - Mapped execution steps
   * @param workflow - Generated workflow (optional, for graph validation)
   * @param originalPrompt - Original user prompt (for transformation validation)
   * @returns Validation result
   */
  validate(
    steps: MappedExecutionStep[],
    workflow?: Workflow,
    originalPrompt?: string
  ): ValidationResult {
    console.log('[DeterministicWorkflowValidator] Validating workflow...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: ValidationResult['details'] = {
      orderingIssues: [],
      unusedNodes: [],
      typeMismatches: [],
      disconnectedNodes: [],
    };
    
    // STEP 0: Validate transformations (if prompt provided)
    // ✅ FIXED: Enforce validation rule: if prompt contains transformation verb and no transform node exists → reject workflow
    if (originalPrompt) {
      this.validateTransformations(steps, originalPrompt, errors);
    }
    
    // STEP 1: Validate execution order
    this.validateOrdering(steps, errors, details);
    
    // STEP 2: Validate data type compatibility
    this.validateTypeCompatibility(steps, errors, details);
    
    // STEP 3: Validate graph structure (if workflow provided)
    if (workflow) {
      this.validateGraphStructure(workflow, errors, warnings, details);
    }
    
    // STEP 4: Check for unused nodes
    this.validateUnusedNodes(steps, workflow, errors, details);
    
    const isValid = errors.length === 0;
    
    console.log(`[DeterministicWorkflowValidator] ✅ Validation complete: ${isValid ? 'VALID' : 'INVALID'}`);
    if (errors.length > 0) {
      console.error(`[DeterministicWorkflowValidator] ❌ Errors: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.warn(`[DeterministicWorkflowValidator] ⚠️  Warnings: ${warnings.join(', ')}`);
    }
    
    return {
      isValid,
      errors,
      warnings,
      details,
    };
  }
  
  /**
   * Validate transformations
   * ✅ FIXED: Enforce rule: if prompt contains transformation verb and no transform node exists → reject workflow
   */
  private validateTransformations(
    steps: MappedExecutionStep[],
    originalPrompt: string,
    errors: string[]
  ): void {
    console.log('[DeterministicWorkflowValidator] Validating transformations...');
    
    // Detect transformation verbs in prompt
    const detection = detectTransformations(originalPrompt);
    
    if (!detection.detected) {
      console.log('[DeterministicWorkflowValidator] ✅ No transformation verbs detected in prompt');
      return;
    }
    
    console.log(`[DeterministicWorkflowValidator] ✅ Detected transformation verbs: ${detection.verbs.join(', ')}`);
    console.log(`[DeterministicWorkflowValidator] ✅ Required node types: ${detection.requiredNodeTypes.join(', ')}`);
    
    // Get node types in workflow steps
    const workflowNodeTypes = steps.map(step => step.nodeType);
    
    // Validate transformations exist
    const validation = transformationDetector.validateTransformations(detection, workflowNodeTypes);
    
    if (!validation.valid) {
      const error = `Workflow validation failed: Prompt contains transformation verb(s) "${detection.verbs.join(', ')}" but no corresponding transformation node exists in workflow. Required node types: ${validation.missing.join(', ')}`;
      errors.push(error);
      console.error(`[DeterministicWorkflowValidator] ❌ ${error}`);
    } else {
      console.log(`[DeterministicWorkflowValidator] ✅ All required transformations present in workflow`);
    }
  }
  
  /**
   * Validate execution ordering
   */
  private validateOrdering(
    steps: MappedExecutionStep[],
    errors: string[],
    details: ValidationResult['details']
  ): void {
    // Rule: email/send must come after summarization/transform
    const emailSteps = steps.filter(step => 
      step.nodeType.includes('gmail') || 
      step.nodeType.includes('email') ||
      step.nodeType.includes('send')
    );
    
    const transformSteps = steps.filter(step =>
      step.nodeType.includes('summarizer') ||
      step.nodeType.includes('transform') ||
      step.nodeType.includes('ai') ||
      step.nodeType.includes('llm')
    );
    
    for (const emailStep of emailSteps) {
      // Check if there's a transform step before this email step
      const hasTransformBefore = transformSteps.some(transformStep => 
        transformStep.order < emailStep.order
      );
      
      if (!hasTransformBefore) {
        const error = `Email/send operation "${emailStep.nodeType}" at step ${emailStep.order} must come after summarization/transform`;
        errors.push(error);
        details.orderingIssues.push(error);
      }
    }
    
    // Rule: fetch_data must come before transform/send
    const fetchSteps = steps.filter(step => 
      step.operation.type === 'fetch_data' as any
    );
    
    for (const transformStep of transformSteps) {
      const hasFetchBefore = fetchSteps.some(fetchStep =>
        fetchStep.order < transformStep.order
      );
      
      if (!hasFetchBefore) {
        const error = `Transform operation "${transformStep.nodeType}" at step ${transformStep.order} must come after data source`;
        errors.push(error);
        details.orderingIssues.push(error);
      }
    }
  }
  
  /**
   * Validate data type compatibility
   */
  private validateTypeCompatibility(
    steps: MappedExecutionStep[],
    errors: string[],
    details: ValidationResult['details']
  ): void {
    // Check compatibility between connected steps
    for (let i = 0; i < steps.length; i++) {
      const currentStep = steps[i];
      
      // Check dependencies
      for (const depIdx of currentStep.dependencies) {
        if (depIdx >= 0 && depIdx < steps.length) {
          const upstreamStep = steps[depIdx];
          
          // Check if types are compatible
          const compatible = capabilityRegistry.areCompatible(
            upstreamStep.nodeType,
            currentStep.nodeType
          );
          
          if (!compatible) {
            const upstreamCap = capabilityRegistry.getCapability(upstreamStep.nodeType);
            const currentCap = capabilityRegistry.getCapability(currentStep.nodeType);
            
            const error = `Data type mismatch: "${upstreamStep.nodeType}" (output: ${upstreamCap?.outputType}) → "${currentStep.nodeType}" (input: ${currentCap?.inputType})`;
            errors.push(error);
            details.typeMismatches.push({
              source: upstreamStep.nodeType,
              target: currentStep.nodeType,
              reason: error,
            });
          }
        }
      }
    }
  }
  
  /**
   * Validate graph structure
   */
  private validateGraphStructure(
    workflow: Workflow,
    errors: string[],
    warnings: string[],
    details: ValidationResult['details']
  ): void {
    // Check for disconnected nodes
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const connectedNodeIds = new Set<string>();
    
    // Start from trigger nodes
    const triggerNodes = workflow.nodes.filter(n => {
      const type = n.data?.type || n.type;
      return type.includes('trigger');
    });
    
    // BFS from triggers
    const queue = [...triggerNodes.map(n => n.id)];
    triggerNodes.forEach(n => connectedNodeIds.add(n.id));
    
    const outgoing = new Map<string, string[]>();
    workflow.edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const neighbors = outgoing.get(nodeId) || [];
      
      for (const neighborId of neighbors) {
        if (!connectedNodeIds.has(neighborId)) {
          connectedNodeIds.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    
    // Find disconnected nodes
    const disconnected = workflow.nodes
      .filter(n => !connectedNodeIds.has(n.id))
      .map(n => n.id);
    
    if (disconnected.length > 0) {
      const error = `Disconnected nodes found: ${disconnected.join(', ')}`;
      errors.push(error);
      details.disconnectedNodes.push(...disconnected);
    }
    
    // Check for cycles (should not happen in DAG)
    const hasCycle = this.detectCycle(workflow);
    if (hasCycle) {
      errors.push('Workflow contains a cycle (not a valid DAG)');
    }
  }
  
  /**
   * Validate unused nodes
   */
  private validateUnusedNodes(
    steps: MappedExecutionStep[],
    workflow: Workflow | undefined,
    errors: string[],
    details: ValidationResult['details']
  ): void {
    if (!workflow) {
      return;
    }
    
    const stepNodeTypes = new Set(steps.map(s => s.nodeType));
    const workflowNodeTypes = new Set(
      workflow.nodes.map(n => {
        const type = n.data?.type || n.type;
        return type;
      })
    );
    
    // Find nodes in workflow that are not in steps
    const unused = Array.from(workflowNodeTypes).filter(
      nodeType => !stepNodeTypes.has(nodeType)
    );
    
    if (unused.length > 0) {
      const error = `Unused nodes found: ${unused.join(', ')}`;
      errors.push(error);
      details.unusedNodes.push(...unused);
    }
  }
  
  /**
   * Detect cycle in workflow graph
   */
  private detectCycle(workflow: Workflow): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const outgoing = new Map<string, string[]>();
    workflow.edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // Cycle detected
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const neighbors = outgoing.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (dfs(neighborId)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          return true;
        }
      }
    }
    
    return false;
  }
}

// Export singleton instance
export const deterministicWorkflowValidator = new DeterministicWorkflowValidator();

// Export convenience function
export function validateWorkflow(
  steps: MappedExecutionStep[],
  workflow?: Workflow,
  originalPrompt?: string
): ValidationResult {
  return deterministicWorkflowValidator.validate(steps, workflow, originalPrompt);
}
