/**
 * Semantic Operation Merger
 * 
 * Merges semantic operations that map to the same node type to prevent duplicates.
 * 
 * Rules:
 * 1. If multiple operations map to same node type → merge into one
 * 2. Only one transformation node per transformation group
 * 3. Deduplicate nodes by capability category
 */

import { SemanticOperation, SemanticOperationType } from './intent-extraction-layer';
import { ExecutionStep } from './dependency-planner';
import { nodeLibrary } from '../nodes/node-library';
import { capabilityRegistry } from './capability-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface MergedOperation {
  operation: SemanticOperation;
  mergedFrom: SemanticOperation[];  // Original operations that were merged
  nodeType: string | null;  // Target node type (null if not yet mapped)
  capabilityCategory: string;  // 'transformer', 'producer', 'output', etc.
}

export interface MergeResult {
  mergedSteps: ExecutionStep[];
  mergedOperations: MergedOperation[];
  removedDuplicates: number;
  warnings: string[];
}

/**
 * Semantic Operation Merger
 */
export class SemanticOperationMerger {
  /**
   * Merge execution steps that map to the same node type
   * 
   * @param steps - Execution steps from dependency planner
   * @param mapOperationToNode - Function to map operation to node type
   * @returns Merged steps with duplicates removed
   */
  mergeSteps(
    steps: ExecutionStep[],
    mapOperationToNode: (operation: SemanticOperation) => string | null
  ): MergeResult {
    console.log(`[SemanticOperationMerger] Merging ${steps.length} execution steps...`);
    
    const mergedSteps: ExecutionStep[] = [];
    const mergedOperations: MergedOperation[] = [];
    const warnings: string[] = [];
    const seenNodeTypes = new Map<string, ExecutionStep>();  // nodeType -> first step with that type
    const capabilityGroups = new Map<string, ExecutionStep[]>();  // capabilityCategory -> steps
    
    let removedDuplicates = 0;
    
    // STEP 1: Map all operations to node types
    const operationToNodeType = new Map<SemanticOperation, string | null>();
    for (const step of steps) {
      const nodeType = mapOperationToNode(step.operation);
      operationToNodeType.set(step.operation, nodeType);
    }
    
    // STEP 2: Group operations by capability category and node type
    const operationsByCategory = new Map<string, SemanticOperation[]>();
    const operationsByNodeType = new Map<string, SemanticOperation[]>();
    
    for (const step of steps) {
      const nodeType = operationToNodeType.get(step.operation);
      if (!nodeType) {
        // Unmapped operation - keep as is
        mergedSteps.push(step);
        continue;
      }
      
      // Group by node type
      if (!operationsByNodeType.has(nodeType)) {
        operationsByNodeType.set(nodeType, []);
      }
      operationsByNodeType.get(nodeType)!.push(step.operation);
      
      // Group by category
      const category = this.getCapabilityCategory(nodeType);
      if (!operationsByCategory.has(category)) {
        operationsByCategory.set(category, []);
      }
      operationsByCategory.get(category)!.push(step.operation);
    }
    
    // STEP 3: Merge operations within each category
    const processedOperations = new Set<SemanticOperation>();
    
    // ✅ FIXED: Handle transformers first - merge all into one
    const transformerOps = operationsByCategory.get('transformer') || [];
    if (transformerOps.length > 1) {
      const merged = this.mergeTransformOperations(transformerOps, mapOperationToNode);
      if (merged) {
        mergedOperations.push(merged);
        
        // Create merged execution step
        const mergedStep: ExecutionStep = {
          operation: merged.operation,
          nodeType: merged.nodeType || null,
          order: Math.min(...transformerOps.map(op => {
            const step = steps.find(s => s.operation === op);
            return step?.order ?? 999;
          })),
          dependencies: this.mergeDependencies(transformerOps, steps),
          producesData: true,
          requiresData: true,
        };
        
        mergedSteps.push(mergedStep);
        transformerOps.forEach(op => processedOperations.add(op));
        removedDuplicates += transformerOps.length - 1;
        console.log(`[SemanticOperationMerger] ✅ Merged ${transformerOps.length} transformation operations into one: ${merged.nodeType}`);
      }
    } else if (transformerOps.length === 1) {
      // Single transformer - keep as is
      const step = steps.find(s => s.operation === transformerOps[0]);
      if (step) {
        mergedSteps.push(step);
        processedOperations.add(transformerOps[0]);
      }
    }
    
    // For other categories, merge by exact node type match
    for (const [nodeType, ops] of operationsByNodeType.entries()) {
      // Skip if already processed (e.g., transformers)
      if (ops.some(op => processedOperations.has(op))) {
        continue;
      }
      
      if (ops.length === 1) {
        // No merge needed
        const step = steps.find(s => s.operation === ops[0]);
        if (step) {
          mergedSteps.push(step);
          processedOperations.add(ops[0]);
        }
      } else {
        // Merge multiple operations mapping to same node type
        const merged = this.mergeOperationsByNodeType(ops, nodeType, mapOperationToNode);
        if (merged) {
          mergedOperations.push(merged);
          
          const mergedStep: ExecutionStep = {
            operation: merged.operation,
            nodeType: merged.nodeType || null,
            order: Math.min(...ops.map(op => {
              const step = steps.find(s => s.operation === op);
              return step?.order ?? 999;
            })),
            dependencies: this.mergeDependencies(ops, steps),
            producesData: this.operationProducesData(merged.operation),
            requiresData: this.operationRequiresData(merged.operation),
          };
          
          mergedSteps.push(mergedStep);
          ops.forEach(op => processedOperations.add(op));
          removedDuplicates += ops.length - 1;
          console.log(`[SemanticOperationMerger] ✅ Merged ${ops.length} operations mapping to ${nodeType}`);
        }
      }
    }
    
    // STEP 4: Add any remaining non-merged steps
    for (const step of steps) {
      if (!processedOperations.has(step.operation)) {
        mergedSteps.push(step);
      }
    }
    
    // Sort merged steps by order
    mergedSteps.sort((a, b) => a.order - b.order);
    
    console.log(`[SemanticOperationMerger] ✅ Merged ${steps.length} steps into ${mergedSteps.length} (removed ${removedDuplicates} duplicates)`);
    
    return {
      mergedSteps,
      mergedOperations,
      removedDuplicates,
      warnings,
    };
  }
  
  /**
   * Merge transformation operations into one
   */
  private mergeTransformOperations(
    operations: SemanticOperation[],
    mapOperationToNode: (operation: SemanticOperation) => string | null
  ): MergedOperation | null {
    if (operations.length === 0) return null;
    
    // Find the most specific node type (prefer text_summarizer over ollama)
    const nodeTypes = operations
      .map(op => mapOperationToNode(op))
      .filter((type): type is string => type !== null);
    
    if (nodeTypes.length === 0) return null;
    
    // Priority: text_summarizer > ai_agent > ollama > openai_gpt
    const priority = ['text_summarizer', 'text_classifier', 'ai_agent', 'ollama', 'openai_gpt', 'anthropic_claude'];
    const selectedNodeType = nodeTypes.find(type => priority.includes(type)) || nodeTypes[0];
    
    // Merge all operations into one
    const primaryOperation = operations[0];
    const mergedOperation: SemanticOperation = {
      ...primaryOperation,
      operation: operations.map(op => op.operation).filter(Boolean).join(', '),
      config: {
        ...primaryOperation.config,
        mergedFrom: operations.map(op => op.operation),
      },
    };
    
    return {
      operation: mergedOperation,
      mergedFrom: operations,
      nodeType: selectedNodeType,
      capabilityCategory: 'transformer',
    };
  }
  
  /**
   * Merge operations that map to the same node type
   */
  private mergeOperationsByNodeType(
    operations: SemanticOperation[],
    nodeType: string,
    mapOperationToNode: (operation: SemanticOperation) => string | null
  ): MergedOperation | null {
    if (operations.length === 0) return null;
    
    const primaryOperation = operations[0];
    const mergedOperation: SemanticOperation = {
      ...primaryOperation,
      config: {
        ...primaryOperation.config,
        mergedFrom: operations.map(op => ({
          type: op.type,
          source: op.source,
          destination: op.destination,
          operation: op.operation,
        })),
      },
    };
    
    const category = this.getCapabilityCategory(nodeType);
    
    return {
      operation: mergedOperation,
      mergedFrom: operations,
      nodeType,
      capabilityCategory: category,
    };
  }
  
  /**
   * Get capability category for a node type
   */
  private getCapabilityCategory(nodeType: string): string {
    const nodeTypeLower = nodeType.toLowerCase();
    
    // Transformers
    if (nodeTypeLower.includes('summarizer') ||
        nodeTypeLower.includes('classifier') ||
        nodeTypeLower.includes('ollama') ||
        nodeTypeLower.includes('openai') ||
        nodeTypeLower.includes('anthropic') ||
        nodeTypeLower.includes('ai_agent') ||
        nodeTypeLower.includes('transform')) {
      return 'transformer';
    }
    
    // Producers
    if (nodeTypeLower.includes('sheets') ||
        nodeTypeLower.includes('database') ||
        nodeTypeLower.includes('api') ||
        nodeTypeLower.includes('csv') ||
        nodeTypeLower.includes('excel')) {
      return 'producer';
    }
    
    // Outputs
    if (nodeTypeLower.includes('gmail') ||
        nodeTypeLower.includes('slack') ||
        nodeTypeLower.includes('crm') ||
        nodeTypeLower.includes('storage')) {
      return 'output';
    }
    
    return 'other';
  }
  
  /**
   * Merge dependencies from multiple operations
   */
  private mergeDependencies(
    operations: SemanticOperation[],
    allSteps: ExecutionStep[]
  ): number[] {
    const allDependencies = new Set<number>();
    
    for (const operation of operations) {
      const step = allSteps.find(s => s.operation === operation);
      if (step) {
        step.dependencies.forEach(dep => allDependencies.add(dep));
      }
    }
    
    return Array.from(allDependencies);
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
export const semanticOperationMerger = new SemanticOperationMerger();

// Export convenience function
export function mergeSemanticOperations(
  steps: ExecutionStep[],
  mapOperationToNode: (operation: SemanticOperation) => string | null
): MergeResult {
  return semanticOperationMerger.mergeSteps(steps, mapOperationToNode);
}
