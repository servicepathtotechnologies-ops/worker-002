/**
 * Dependency Planner
 * 
 * STEP 3: Build execution order based on data flow.
 * 
 * Rules:
 * - Producer nodes first (data sources)
 * - Transformers next
 * - Consumers last (outputs)
 * - Reject invalid graphs
 */

import { SemanticOperation, SemanticOperationType } from './intent-extraction-layer';
import { capabilityRegistry } from './capability-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface ExecutionPlan {
  steps: ExecutionStep[];
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExecutionStep {
  operation: SemanticOperation;
  nodeType: string | null;  // Mapped node type (null if not yet mapped)
  order: number;            // Execution order
  dependencies: number[];   // Indices of steps this depends on
  producesData: boolean;
  requiresData: boolean;
}

/**
 * Dependency Planner
 * Builds execution order based on data flow
 */
export class DependencyPlanner {
  /**
   * Plan execution order from semantic operations
   * 
   * @param operations - Semantic operations from intent extraction
   * @returns Execution plan with ordered steps
   */
  planExecution(operations: SemanticOperation[]): ExecutionPlan {
    console.log('[DependencyPlanner] Planning execution order from semantic operations...');
    
    const steps: ExecutionStep[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // STEP 1: Create execution steps from operations
    for (const operation of operations) {
      const step: ExecutionStep = {
        operation,
        nodeType: null, // Will be mapped later
        order: operation.order,
        dependencies: [],
        producesData: this.operationProducesData(operation),
        requiresData: this.operationRequiresData(operation),
      };
      
      steps.push(step);
    }
    
    // STEP 2: Build dependency graph
    this.buildDependencies(steps, errors, warnings);
    
    // STEP 3: Validate execution order
    const isValid = this.validateExecutionOrder(steps, errors, warnings);
    
    // STEP 4: Sort by execution order (topological sort)
    const sortedSteps = this.topologicalSort(steps);
    
    console.log(`[DependencyPlanner] ✅ Execution plan created: ${sortedSteps.length} steps`);
    if (errors.length > 0) {
      console.error(`[DependencyPlanner] ❌ Errors: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.warn(`[DependencyPlanner] ⚠️  Warnings: ${warnings.join(', ')}`);
    }
    
    return {
      steps: sortedSteps,
      isValid,
      errors,
      warnings,
    };
  }
  
  /**
   * Build dependencies between steps
   * ✅ FIXED: Enforces sequential chain when transformation exists
   * Rule: If transformation exists → producer → transformer → output (no direct producer → output)
   */
  private buildDependencies(steps: ExecutionStep[], errors: string[], warnings: string[]): void {
    // ✅ FIXED: Check if workflow contains transformation
    const hasTransform = steps.some(step => step.operation.type === SemanticOperationType.TRANSFORM);
    
    // Find all transform step indices
    const transformIndices = steps
      .map((step, idx) => step.operation.type === SemanticOperationType.TRANSFORM ? idx : -1)
      .filter(idx => idx !== -1);
    
    // Find last transform index (if any)
    const lastTransformIdx = transformIndices.length > 0 ? Math.max(...transformIndices) : -1;
    
    console.log(`[DependencyPlanner] Building dependencies: hasTransform=${hasTransform}, lastTransformIdx=${lastTransformIdx}`);
    
    // Data flow: fetch_data → transform → send/store
    // ✅ FIXED: When transformation exists, enforce sequential chain: producer → transformer → output
    
    for (let i = 0; i < steps.length; i++) {
      const currentStep = steps[i];
      const currentOp = currentStep.operation;
      
      // Find dependencies based on operation type
      if (currentOp.type === SemanticOperationType.TRANSFORM) {
        // Transform depends on fetch_data or previous transform
        for (let j = 0; j < i; j++) {
          const prevStep = steps[j];
          const prevOp = prevStep.operation;
          
          if (prevOp.type === SemanticOperationType.FETCH_DATA ||
              prevOp.type === SemanticOperationType.TRANSFORM) {
            currentStep.dependencies.push(j);
          }
        }
      } else if (currentOp.type === SemanticOperationType.SEND ||
                 currentOp.type === SemanticOperationType.STORE) {
        // ✅ FIXED: If transformation exists, output must depend on last transformer (not producer)
        if (hasTransform && lastTransformIdx >= 0) {
          // Output depends ONLY on last transformer (sequential chain)
          currentStep.dependencies.push(lastTransformIdx);
          console.log(`[DependencyPlanner] ✅ Output step ${i} depends on last transformer ${lastTransformIdx} (sequential chain enforced)`);
        } else {
          // No transformation: output can depend on fetch_data
          for (let j = 0; j < i; j++) {
            const prevStep = steps[j];
            const prevOp = prevStep.operation;
            
            if (prevOp.type === SemanticOperationType.FETCH_DATA) {
              currentStep.dependencies.push(j);
            }
          }
        }
      } else if (currentOp.type === SemanticOperationType.CONDITION) {
        // Condition depends on all previous steps
        for (let j = 0; j < i; j++) {
          currentStep.dependencies.push(j);
        }
      }
    }
    
    // Validate: fetch_data must come before transform/send
    const fetchDataIndices = steps
      .map((step, idx) => step.operation.type === SemanticOperationType.FETCH_DATA ? idx : -1)
      .filter(idx => idx !== -1);
    
    // Reuse transformIndices from above (already computed at line 100)
    
    const sendIndices = steps
      .map((step, idx) => step.operation.type === SemanticOperationType.SEND ? idx : -1)
      .filter(idx => idx !== -1);
    
    // Check ordering
    for (const transformIdx of transformIndices) {
      if (fetchDataIndices.length === 0) {
        errors.push(`Transform operation at step ${transformIdx} has no data source`);
      } else {
        const hasValidSource = fetchDataIndices.some(fetchIdx => fetchIdx < transformIdx);
        if (!hasValidSource) {
          errors.push(`Transform operation at step ${transformIdx} must come after data source`);
        }
      }
    }
    
    for (const sendIdx of sendIndices) {
      if (fetchDataIndices.length === 0 && transformIndices.length === 0) {
        errors.push(`Send operation at step ${sendIdx} has no data source or transform`);
      } else {
        const hasValidSource = fetchDataIndices.some(fetchIdx => fetchIdx < sendIdx) ||
                              transformIndices.some(transformIdx => transformIdx < sendIdx);
        if (!hasValidSource) {
          errors.push(`Send operation at step ${sendIdx} must come after data source or transform`);
        }
      }
    }
  }
  
  /**
   * Validate execution order
   */
  private validateExecutionOrder(steps: ExecutionStep[], errors: string[], warnings: string[]): boolean {
    // Check for cycles
    const hasCycle = this.detectCycles(steps);
    if (hasCycle) {
      errors.push('Circular dependency detected in execution plan');
      return false;
    }
    
    // Check for orphaned steps (no dependencies and no dependents)
    const orphanedSteps = steps.filter(step => 
      step.dependencies.length === 0 && 
      !steps.some(otherStep => otherStep.dependencies.includes(steps.indexOf(step)))
    );
    
    if (orphanedSteps.length > 1) {
      warnings.push(`Multiple orphaned steps detected: ${orphanedSteps.length}`);
    }
    
    // Check for missing dependencies
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      for (const depIdx of step.dependencies) {
        if (depIdx >= i) {
          errors.push(`Step ${i} depends on step ${depIdx} which comes after it`);
          return false;
        }
      }
    }
    
    return errors.length === 0;
  }
  
  /**
   * Detect cycles in dependency graph
   */
  private detectCycles(steps: ExecutionStep[]): boolean {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();
    
    const dfs = (nodeIdx: number): boolean => {
      if (recursionStack.has(nodeIdx)) {
        return true; // Cycle detected
      }
      
      if (visited.has(nodeIdx)) {
        return false;
      }
      
      visited.add(nodeIdx);
      recursionStack.add(nodeIdx);
      
      const step = steps[nodeIdx];
      for (const depIdx of step.dependencies) {
        if (dfs(depIdx)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeIdx);
      return false;
    };
    
    for (let i = 0; i < steps.length; i++) {
      if (!visited.has(i)) {
        if (dfs(i)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Topological sort of execution steps with category-based priority
   */
  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    const sorted: ExecutionStep[] = [];
    const visited = new Set<number>();
    const inDegree = new Map<number, number>();
    
    // Calculate in-degree
    for (let i = 0; i < steps.length; i++) {
      inDegree.set(i, steps[i].dependencies.length);
    }
    
    // Category priority for ordering
    const getCategoryPriority = (stepIdx: number): number => {
      const step = steps[stepIdx];
      const opType = step.operation.type;
      
      // Data producers first (priority 1)
      if (opType === SemanticOperationType.FETCH_DATA) {
        return 1;
      }
      // Data transformers second (priority 2)
      if (opType === SemanticOperationType.TRANSFORM) {
        return 2;
      }
      // Output actions last (priority 3)
      if (opType === SemanticOperationType.SEND || opType === SemanticOperationType.STORE) {
        return 3;
      }
      // Conditions (priority 2)
      if (opType === SemanticOperationType.CONDITION) {
        return 2;
      }
      // Default to transformer priority
      return 2;
    };
    
    // Find nodes with no dependencies, prioritized by category
    const queue: Array<{ stepIdx: number; priority: number }> = [];
    for (let i = 0; i < steps.length; i++) {
      if (inDegree.get(i) === 0) {
        queue.push({
          stepIdx: i,
          priority: getCategoryPriority(i),
        });
      }
    }
    
    // Sort queue by category priority
    queue.sort((a, b) => a.priority - b.priority);
    
    // Process nodes
    while (queue.length > 0) {
      // Get step with highest priority (lowest number)
      const { stepIdx } = queue.shift()!;
      visited.add(stepIdx);
      sorted.push(steps[stepIdx]);
      
      // Update in-degree of dependent nodes
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].dependencies.includes(stepIdx)) {
          const currentInDegree = inDegree.get(i) || 0;
          inDegree.set(i, currentInDegree - 1);
          
          if (inDegree.get(i) === 0 && !visited.has(i)) {
            queue.push({
              stepIdx: i,
              priority: getCategoryPriority(i),
            });
            // Re-sort queue to maintain priority order
            queue.sort((a, b) => a.priority - b.priority);
          }
        }
      }
    }
    
    // If not all nodes are sorted, there's a cycle (shouldn't happen after validation)
    if (sorted.length !== steps.length) {
      console.warn('[DependencyPlanner] ⚠️  Not all nodes sorted - possible cycle');
      // Add remaining nodes in category order
      const remaining: Array<{ stepIdx: number; priority: number }> = [];
      for (let i = 0; i < steps.length; i++) {
        if (!visited.has(i)) {
          remaining.push({
            stepIdx: i,
            priority: getCategoryPriority(i),
          });
        }
      }
      remaining.sort((a, b) => a.priority - b.priority);
      remaining.forEach(({ stepIdx }) => sorted.push(steps[stepIdx]));
    }
    
    // Update order indices
    sorted.forEach((step, idx) => {
      step.order = idx;
    });
    
    console.log(`[DependencyPlanner] ✅ Topological sort complete: ${sorted.length} steps ordered by category (producer → transformer → output)`);
    
    return sorted;
  }
  
  /**
   * Check if operation produces data
   */
  private operationProducesData(operation: SemanticOperation): boolean {
    return operation.type === SemanticOperationType.FETCH_DATA ||
           operation.type === SemanticOperationType.TRANSFORM;
  }
  
  /**
   * Check if operation requires data
   */
  private operationRequiresData(operation: SemanticOperation): boolean {
    return operation.type === SemanticOperationType.TRANSFORM ||
           operation.type === SemanticOperationType.SEND ||
           operation.type === SemanticOperationType.STORE;
  }
}

// Export singleton instance
export const dependencyPlanner = new DependencyPlanner();

// Export convenience function
export function planExecution(operations: SemanticOperation[]): ExecutionPlan {
  return dependencyPlanner.planExecution(operations);
}
