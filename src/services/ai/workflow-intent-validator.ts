/**
 * Workflow Intent Validator
 * 
 * Validates workflow against structured intent to ensure:
 * - Every action in intent exists in workflow
 * - No extra actions
 * - Correct execution order
 * - Minimal path
 * 
 * If invalid → triggers workflow regeneration
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { getRequiredNodes } from './intent-constraint-engine';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  shouldRegenerate: boolean;
  details: {
    missingActions: string[];      // Actions in intent but not in workflow
    extraActions: string[];        // Actions in workflow but not in intent
    orderMismatches: OrderMismatch[]; // Execution order issues
    pathIssues: PathIssue[];       // Non-minimal path issues
  };
}

export interface OrderMismatch {
  expectedOrder: string[];        // Expected node types in order
  actualOrder: string[];           // Actual node types in order
  issue: string;                   // Description of the issue
}

export interface PathIssue {
  issue: string;                   // Description of path issue
  suggestion: string;              // How to fix it
}

/**
 * Workflow Intent Validator
 * Validates workflow against structured intent
 */
export class WorkflowIntentValidator {
  /**
   * Validate workflow against intent
   * 
   * @param workflow - Workflow graph to validate
   * @param intent - Structured intent to validate against
   * @returns Validation result
   */
  validate(workflow: Workflow, intent: StructuredIntent): ValidationResult {
    console.log('[WorkflowIntentValidator] Starting validation...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingActions: string[] = [];
    const extraActions: string[] = [];
    const orderMismatches: OrderMismatch[] = [];
    const pathIssues: PathIssue[] = [];

    // STEP 1: Get required nodes from intent
    const requiredNodeTypes = getRequiredNodes(intent);
    const requiredNodeTypesSet = new Set(requiredNodeTypes);
    console.log(`[WorkflowIntentValidator] Required node types: ${requiredNodeTypes.join(', ')}`);

    // STEP 2: Get actual node types from workflow
    const workflowNodeTypes = workflow.nodes.map(node => normalizeNodeType(node));
    const workflowNodeTypesSet = new Set(workflowNodeTypes);
    console.log(`[WorkflowIntentValidator] Workflow node types: ${workflowNodeTypes.join(', ')}`);

    // STEP 3: Validate every action in intent exists in workflow
    for (const requiredType of requiredNodeTypes) {
      // Check if required type exists in workflow (exact match or variant)
      const exists = workflowNodeTypes.some(workflowType => {
        return workflowType === requiredType || this.isNodeTypeVariant(workflowType, requiredType);
      });

      if (!exists) {
        missingActions.push(requiredType);
        errors.push(`Required action "${requiredType}" from intent is missing in workflow`);
        console.error(`[WorkflowIntentValidator] ❌ Missing action: ${requiredType}`);
      }
    }

    // STEP 4: Validate no extra actions (excluding trigger and utility nodes)
    const triggerNodes = workflow.nodes.filter(node => {
      const nodeType = normalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    const utilityNodes = workflow.nodes.filter(node => {
      const nodeType = normalizeNodeType(node);
      return this.isUtilityNode(nodeType);
    });

    const actionNodes = workflow.nodes.filter(node => {
      const nodeType = normalizeNodeType(node);
      return !this.isTriggerNode(nodeType) && !this.isUtilityNode(nodeType);
    });

    for (const node of actionNodes) {
      const nodeType = normalizeNodeType(node);
      const isRequired = requiredNodeTypes.some(requiredType => {
        return nodeType === requiredType || this.isNodeTypeVariant(nodeType, requiredType);
      });

      if (!isRequired) {
        extraActions.push(nodeType);
        warnings.push(`Extra action "${nodeType}" in workflow not present in intent`);
        console.warn(`[WorkflowIntentValidator] ⚠️  Extra action: ${nodeType}`);
      }
    }

    // STEP 5: Validate execution order
    const orderValidation = this.validateExecutionOrder(workflow, intent);
    if (!orderValidation.valid) {
      orderMismatches.push(...orderValidation.mismatches);
      errors.push(...orderValidation.errors);
    }

    // STEP 6: Validate minimal path
    const pathValidation = this.validateMinimalPath(workflow);
    if (!pathValidation.valid) {
      pathIssues.push(...pathValidation.issues);
      warnings.push(...pathValidation.warnings);
    }

    // STEP 7: Determine if regeneration is needed
    const shouldRegenerate = errors.length > 0 || 
                            (warnings.length > 0 && extraActions.length > 0) ||
                            orderMismatches.length > 0;

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      shouldRegenerate,
      details: {
        missingActions,
        extraActions,
        orderMismatches,
        pathIssues,
      },
    };

    console.log(`[WorkflowIntentValidator] Validation complete: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
    if (shouldRegenerate) {
      console.log(`[WorkflowIntentValidator] ⚠️  Workflow should be regenerated`);
    }

    return result;
  }

  /**
   * Validate execution order matches intent
   */
  private validateExecutionOrder(
    workflow: Workflow,
    intent: StructuredIntent
  ): { valid: boolean; mismatches: OrderMismatch[]; errors: string[] } {
    const mismatches: OrderMismatch[] = [];
    const errors: string[] = [];

    // Get expected order from intent actions
    const expectedOrder: string[] = [];
    if (intent.actions && intent.actions.length > 0) {
      for (const action of intent.actions) {
        const actionNodes = this.mapActionToNodeTypes(action);
        expectedOrder.push(...actionNodes);
      }
    }

    // Get actual execution order from workflow
    const actualOrder = this.getExecutionOrder(workflow);

    // Compare orders
    if (expectedOrder.length !== actualOrder.length) {
      mismatches.push({
        expectedOrder,
        actualOrder,
        issue: `Expected ${expectedOrder.length} actions but workflow has ${actualOrder.length} actions`,
      });
      errors.push(`Execution order length mismatch: expected ${expectedOrder.length}, got ${actualOrder.length}`);
    }

    // Check if order matches (allowing for variants)
    for (let i = 0; i < Math.min(expectedOrder.length, actualOrder.length); i++) {
      const expected = expectedOrder[i];
      const actual = actualOrder[i];

      if (actual !== expected && !this.isNodeTypeVariant(actual, expected)) {
        mismatches.push({
          expectedOrder,
          actualOrder,
          issue: `Position ${i}: expected "${expected}" but got "${actual}"`,
        });
        errors.push(`Execution order mismatch at position ${i}: expected "${expected}", got "${actual}"`);
      }
    }

    return {
      valid: mismatches.length === 0,
      mismatches,
      errors,
    };
  }

  /**
   * Get execution order from workflow (topological sort)
   */
  private getExecutionOrder(workflow: Workflow): string[] {
    // Find trigger node
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = normalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      return [];
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, number>();

    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);

      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    }

    // Topological sort (BFS from trigger)
    const order: string[] = [];
    const queue: string[] = [triggerNode.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (node) {
        const nodeType = normalizeNodeType(node);
        if (!this.isTriggerNode(nodeType)) {
          order.push(nodeType);
        }
      }

      const neighbors = outgoing.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const inDegree = incoming.get(neighbor) || 0;
        if (inDegree <= 1) {
          queue.push(neighbor);
        }
      }
    }

    return order;
  }

  /**
   * Validate minimal path (no parallel paths, no cycles)
   */
  private validateMinimalPath(workflow: Workflow): { valid: boolean; issues: PathIssue[]; warnings: string[] } {
    const issues: PathIssue[] = [];
    const warnings: string[] = [];

    // Check for parallel paths
    const parallelPaths = this.detectParallelPaths(workflow);
    if (parallelPaths.length > 0) {
      issues.push({
        issue: `Found ${parallelPaths.length} parallel path(s)`,
        suggestion: 'Remove parallel paths to ensure single execution flow',
      });
      warnings.push(`Workflow has ${parallelPaths.length} parallel path(s), should be minimal`);
    }

    // Check for cycles
    const hasCycle = this.detectCycles(workflow);
    if (hasCycle) {
      issues.push({
        issue: 'Workflow contains cycles',
        suggestion: 'Remove cycles to ensure DAG structure',
      });
      warnings.push('Workflow contains cycles, should be acyclic');
    }

    // Check for unreachable nodes
    const unreachable = this.findUnreachableNodes(workflow);
    if (unreachable.length > 0) {
      issues.push({
        issue: `Found ${unreachable.length} unreachable node(s)`,
        suggestion: 'Remove unreachable nodes or connect them to the workflow',
      });
      warnings.push(`Workflow has ${unreachable.length} unreachable node(s)`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Detect parallel paths in workflow
   */
  private detectParallelPaths(workflow: Workflow): Array<{ source: string; target: string; paths: string[][] }> {
    const parallelPaths: Array<{ source: string; target: string; paths: string[][] }> = [];
    const nodeMap = new Map<string, WorkflowNode>();
    workflow.nodes.forEach(node => nodeMap.set(node.id, node));

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // Find all pairs of nodes with multiple paths
    for (const sourceNode of workflow.nodes) {
      for (const targetNode of workflow.nodes) {
        if (sourceNode.id === targetNode.id) {
          continue;
        }

        const paths = this.findAllPaths(sourceNode.id, targetNode.id, outgoing);
        if (paths.length > 1) {
          parallelPaths.push({
            source: sourceNode.id,
            target: targetNode.id,
            paths,
          });
        }
      }
    }

    return parallelPaths;
  }

  /**
   * Find all paths from source to target
   */
  private findAllPaths(
    source: string,
    target: string,
    outgoing: Map<string, string[]>
  ): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]): void => {
      if (current === target) {
        paths.push([...path, current]);
        return;
      }

      if (visited.has(current)) {
        return;
      }

      visited.add(current);
      const neighbors = outgoing.get(current) || [];
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, current]);
      }
      visited.delete(current);
    };

    dfs(source, []);
    return paths;
  }

  /**
   * Detect cycles in workflow
   */
  private detectCycles(workflow: Workflow): boolean {
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) {
        return true; // Cycle detected
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = outgoing.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (hasCycleDFS(neighbor)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find unreachable nodes (not reachable from trigger)
   */
  private findUnreachableNodes(workflow: Workflow): string[] {
    const triggerNode = workflow.nodes.find(node => {
      const nodeType = normalizeNodeType(node);
      return this.isTriggerNode(nodeType);
    });

    if (!triggerNode) {
      return workflow.nodes.map(n => n.id);
    }

    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    for (const edge of workflow.edges) {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    }

    // BFS from trigger
    const reachable = new Set<string>();
    const queue: string[] = [triggerNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) {
        continue;
      }

      reachable.add(nodeId);
      const neighbors = outgoing.get(nodeId) || [];
      queue.push(...neighbors);
    }

    // Find unreachable nodes
    const unreachable = workflow.nodes
      .filter(node => !reachable.has(node.id))
      .map(node => node.id);

    return unreachable;
  }

  /**
   * Map action to node types (same logic as IntentConstraintEngine)
   */
  private mapActionToNodeTypes(action: StructuredIntent['actions'][0]): string[] {
    const actionType = action.type.toLowerCase();
    
    // Direct node type match
    const normalized = normalizeNodeType({ type: 'custom', data: { type: actionType } });
    const schema = nodeLibrary.getSchema(normalized);
    if (schema) {
      return [normalized];
    }

    // Pattern matching
    if (actionType.includes('google_sheets') || actionType.includes('sheets')) {
      return ['google_sheets'];
    }
    if (actionType.includes('gmail') || actionType.includes('google_mail')) {
      return ['google_gmail'];
    }
    if (actionType.includes('summarize') || actionType.includes('summary')) {
      return ['text_summarizer'];
    }
    if (actionType.includes('slack')) {
      return ['slack_message'];
    }

    return [actionType]; // Fallback
  }

  /**
   * Check if node is a trigger node
   */
  private isTriggerNode(nodeType: string): boolean {
    const triggerTypes = [
      'manual_trigger',
      'schedule',
      'webhook',
      'form',
      'chat_trigger',
      'interval',
      'error_trigger',
    ];

    return triggerTypes.includes(nodeType) || nodeType.includes('trigger');
  }

  /**
   * Check if node is a utility node (not an action)
   */
  private isUtilityNode(nodeType: string): boolean {
    const utilityTypes = [
      'set_variable',
      'format',
      'parse',
      'transform',
    ];

    return utilityTypes.includes(nodeType);
  }

  /**
   * Check if node type is a variant of another type
   */
  private isNodeTypeVariant(nodeType: string, requiredType: string): boolean {
    if (nodeType === requiredType) {
      return true;
    }

    // Check aliases
    const aliases: Record<string, string[]> = {
      'google_gmail': ['gmail', 'google_mail'],
      'google_sheets': ['sheets', 'spreadsheet'],
      'slack_message': ['slack'],
      'text_summarizer': ['summarizer', 'summarize'],
    };

    for (const [canonical, variants] of Object.entries(aliases)) {
      if (canonical === requiredType && variants.includes(nodeType)) {
        return true;
      }
      if (canonical === nodeType && variants.includes(requiredType)) {
        return true;
      }
    }

    return false;
  }
}

// Export singleton instance
export const workflowIntentValidator = new WorkflowIntentValidator();

// Export convenience function
export function validateWorkflowIntent(workflow: Workflow, intent: StructuredIntent): ValidationResult {
  return workflowIntentValidator.validate(workflow, intent);
}
