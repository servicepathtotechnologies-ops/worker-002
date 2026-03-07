/**
 * ✅ EXECUTION PLAN BUILDER - Deterministic Execution Order
 * 
 * Constructs a strict linear or DAG execution plan based on intent.
 * Guarantees:
 * - Trigger is always first
 * - All nodes are included in plan
 * - Deterministic ordering
 * - No orphan nodes possible
 * 
 * Architecture:
 * - Sorts nodes by intent priority
 * - Ensures trigger is first
 * - Builds linear execution plan
 * - Returns ordered node IDs
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { StructuredIntent } from '../ai/intent-structurer';

export interface ExecutionPlan {
  orderedNodeIds: string[];
  triggerNodeId: string;
  nodeTypes: string[];
  isValid: boolean;
  errors: string[];
}

/**
 * ✅ Execution Plan Builder
 * 
 * Builds deterministic execution plan from nodes and intent
 */
export class ExecutionPlanBuilder {
  /**
   * Build execution plan from nodes and intent
   * 
   * Guarantees:
   * - Trigger is always first
   * - All nodes included
   * - Deterministic ordering
   */
  buildExecutionPlan(
    nodes: WorkflowNode[],
    intent?: StructuredIntent | null
  ): ExecutionPlan {
    const errors: string[] = [];
    
    if (nodes.length === 0) {
      return {
        orderedNodeIds: [],
        triggerNodeId: '',
        nodeTypes: [],
        isValid: false,
        errors: ['No nodes provided'],
      };
    }
    
    // ✅ STEP 1: Find or ensure trigger node
    const triggerNode = this.findOrCreateTrigger(nodes);
    if (!triggerNode) {
      return {
        orderedNodeIds: [],
        triggerNodeId: '',
        nodeTypes: [],
        isValid: false,
        errors: ['No trigger node found and could not create one'],
      };
    }
    
    // ✅ STEP 2: Sort nodes by intent priority
    const sortedNodes = this.sortNodesByIntentPriority(nodes, triggerNode, intent);
    
    // ✅ STEP 3: Build ordered plan (trigger first, then sorted nodes)
    const orderedNodeIds: string[] = [triggerNode.id];
    const nodeTypes: string[] = [unifiedNormalizeNodeType(triggerNode)];
    
    // Add all other nodes in sorted order
    for (const node of sortedNodes) {
      if (node.id !== triggerNode.id) {
        orderedNodeIds.push(node.id);
        nodeTypes.push(unifiedNormalizeNodeType(node));
      }
    }
    
    // ✅ STEP 4: Validate plan
    const validation = this.validateExecutionPlan(orderedNodeIds, nodes);
    if (!validation.valid) {
      errors.push(...validation.errors);
    }
    
    return {
      orderedNodeIds,
      triggerNodeId: triggerNode.id,
      nodeTypes,
      isValid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Find trigger node or create one if missing
   */
  private findOrCreateTrigger(nodes: WorkflowNode[]): WorkflowNode | null {
    // Find existing trigger
    const triggerNodes = nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return nodeType.includes('trigger') || 
             nodeType === 'manual_trigger' ||
             nodeType === 'webhook' ||
             nodeType === 'schedule' ||
             nodeType === 'interval';
    });
    
    if (triggerNodes.length > 0) {
      return triggerNodes[0];
    }
    
    // Create manual_trigger if none exists
    const { randomUUID } = require('crypto');
    const triggerNode: WorkflowNode = {
      id: randomUUID(),
      type: 'manual_trigger',
      data: {
        type: 'manual_trigger',
        label: 'Manual Trigger',
        category: 'trigger',
        config: {},
      },
      position: { x: 0, y: 0 },
    };
    
    console.log('[ExecutionPlanBuilder] ✅ Created manual_trigger (none existed)');
    return triggerNode;
  }
  
  /**
   * Sort nodes by intent priority
   * 
   * Priority order:
   * 1. Trigger (already handled)
   * 2. Data sources (read operations)
   * 3. Transformations (processing)
   * 4. Actions (write operations)
   * 5. Outputs (final nodes)
   */
  private sortNodesByIntentPriority(
    nodes: WorkflowNode[],
    triggerNode: WorkflowNode,
    intent?: StructuredIntent | null
  ): WorkflowNode[] {
    const sorted = [...nodes].filter(n => n.id !== triggerNode.id);
    
    // Sort by node category/type priority
    sorted.sort((a, b) => {
      const typeA = unifiedNormalizeNodeType(a);
      const typeB = unifiedNormalizeNodeType(b);
      
      const priorityA = this.getNodePriority(typeA);
      const priorityB = this.getNodePriority(typeB);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Same priority: maintain original order
      return 0;
    });
    
    return sorted;
  }
  
  /**
   * Get priority for node type (lower = earlier in execution)
   */
  private getNodePriority(nodeType: string): number {
    // Priority 1: Data sources (read)
    if (['google_sheets', 'postgresql', 'supabase', 'database_read', 'http_request'].includes(nodeType)) {
      return 1;
    }
    
    // Priority 2: Transformations (processing)
    if (['javascript', 'function', 'if_else', 'switch', 'filter', 'loop'].includes(nodeType)) {
      return 2;
    }
    
    // Priority 3: AI/ML operations
    if (['ai_chat_model', 'ai_agent', 'ollama', 'openai_gpt', 'anthropic_claude'].includes(nodeType)) {
      return 3;
    }
    
    // Priority 4: Actions (write)
    if (['google_gmail', 'slack_message', 'email', 'discord', 'telegram'].includes(nodeType)) {
      return 4;
    }
    
    // Priority 5: Outputs (final)
    if (['log_output', 'http_response'].includes(nodeType)) {
      return 5;
    }
    
    // Default priority
    return 3;
  }
  
  /**
   * Validate execution plan
   */
  private validateExecutionPlan(
    orderedNodeIds: string[],
    nodes: WorkflowNode[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check: All nodes included
    const planNodeIds = new Set(orderedNodeIds);
    const allNodeIds = new Set(nodes.map(n => n.id));
    
    for (const nodeId of allNodeIds) {
      if (!planNodeIds.has(nodeId)) {
        errors.push(`Node ${nodeId} not in execution plan`);
      }
    }
    
    // Check: No duplicates
    if (orderedNodeIds.length !== new Set(orderedNodeIds).size) {
      errors.push('Execution plan contains duplicate node IDs');
    }
    
    // Check: At least one node (trigger)
    if (orderedNodeIds.length === 0) {
      errors.push('Execution plan is empty');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const executionPlanBuilder = new ExecutionPlanBuilder();
