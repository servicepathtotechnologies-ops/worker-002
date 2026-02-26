/**
 * Loop Insertion Rule
 * 
 * STEP 5: Loop should be added ONLY IF:
 * - upstream produces array AND
 * - downstream accepts scalar only (does NOT accept array)
 * 
 * Examples:
 * - array → gmail (doesn't accept array) → requires loop ✅
 * - array → summarizer (accepts array) → no loop ✅
 * 
 * This is a STRICT rule - no heuristic guessing.
 * 
 * ⚠️ CRITICAL: This is the ONLY place loops should be inserted.
 * All other loop generation logic should be removed.
 */

import { MappedExecutionStep } from './node-mapper';
import { capabilityRegistry } from './capability-registry';
import { nodeCapabilityRegistry } from '../nodes/node-capability-registry';

export interface LoopInsertionResult {
  steps: MappedExecutionStep[];
  insertedLoops: Array<{
    index: number;
    reason: string;
  }>;
}

/**
 * Loop Insertion Rule
 * Inserts loops only when required by data flow
 */
export class LoopInsertionRule {
  /**
   * Insert loops based on data flow requirements
   * 
   * @param steps - Mapped execution steps
   * @returns Steps with loops inserted where needed
   */
  insertLoops(steps: MappedExecutionStep[]): LoopInsertionResult {
    console.log('[LoopInsertionRule] Checking for loop insertion requirements...');
    
    const resultSteps: MappedExecutionStep[] = [];
    const insertedLoops: Array<{ index: number; reason: string }> = [];
    let offset = 0; // Track index offset due to inserted loops
    
    for (let i = 0; i < steps.length; i++) {
      const currentStep = steps[i];
      resultSteps.push(currentStep);
      
      // Check if we need a loop between current and next step
      if (i < steps.length - 1) {
        const nextStep = steps[i + 1];
        
        const needsLoop = this.needsLoop(currentStep, nextStep);
        
        if (needsLoop) {
          // Insert loop node
          const loopStep: MappedExecutionStep = {
            ...currentStep, // Copy structure
            operation: {
              type: 'loop' as any,
              order: currentStep.order + 0.5, // Insert between steps
            },
            nodeType: 'loop',
            capability: {
              inputType: ['array'],
              outputType: ['any'],
              acceptsArray: true,
              requiresScalar: false,
            },
            dependencies: [i + offset], // Depends on current step
            producesData: true,
            requiresData: true,
          };
          
          resultSteps.push(loopStep);
          insertedLoops.push({
            index: i + offset + 1,
            reason: `Upstream "${currentStep.nodeType}" produces array, downstream "${nextStep.nodeType}" requires scalar`,
          });
          
          // Update next step to depend on loop
          nextStep.dependencies = [i + offset + 1]; // Depend on loop, not original step
          offset++;
          
          console.log(`[LoopInsertionRule] ✅ Inserted loop at index ${i + offset}: ${insertedLoops[insertedLoops.length - 1].reason}`);
        }
      }
    }
    
    // Update order indices
    resultSteps.forEach((step, idx) => {
      step.order = idx;
    });
    
    console.log(`[LoopInsertionRule] ✅ Loop insertion complete: ${insertedLoops.length} loops inserted`);
    
    return {
      steps: resultSteps,
      insertedLoops,
    };
  }
  
  /**
   * Check if loop is needed between two steps
   * 
   * Rule: Loop needed ONLY if:
   * - upstream produces array AND
   * - downstream accepts scalar only (does NOT accept array)
   * 
   * Examples:
   * - array → gmail (doesn't accept array) → requires loop ✅
   * - array → summarizer (accepts array) → no loop ✅
   * 
   * This is a strict rule - no heuristic guessing.
   */
  private needsLoop(upstream: MappedExecutionStep, downstream: MappedExecutionStep): boolean {
    // Use Node Capability Registry (strict rule, no heuristics)
    const needsLoop = nodeCapabilityRegistry.requiresLoop(upstream.nodeType, downstream.nodeType);
    
    // Logging is handled by nodeCapabilityRegistry.requiresLoop()
    return needsLoop;
  }
}

// Export singleton instance
export const loopInsertionRule = new LoopInsertionRule();

// Export convenience function
export function insertLoops(steps: MappedExecutionStep[]): LoopInsertionResult {
  return loopInsertionRule.insertLoops(steps);
}
