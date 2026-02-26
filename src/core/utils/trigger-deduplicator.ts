/**
 * Trigger Deduplicator
 * 
 * Ensures only one trigger exists per workflow.
 * Removes duplicate triggers and keeps the first one.
 */

import { WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { normalizeNodeType } from './node-type-normalizer';

/**
 * Trigger node types
 */
const TRIGGER_TYPES = [
  'manual_trigger',
  'webhook',
  'schedule',
  'interval',
  'chat_trigger',
  'form',
  'error_trigger',
  'workflow_trigger',
];

/**
 * Check if a node is a trigger
 */
export function isTriggerNode(node: WorkflowNode): boolean {
  const nodeType = normalizeNodeType(node);
  const category = node.data?.category || '';
  
  return (
    TRIGGER_TYPES.includes(nodeType) ||
    category.toLowerCase() === 'triggers' ||
    category.toLowerCase() === 'trigger'
  );
}

/**
 * Get all trigger nodes from a workflow
 */
export function getTriggerNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.filter(isTriggerNode);
}

/**
 * Remove duplicate triggers from workflow
 * Keeps the first trigger and removes all others
 * 
 * @param nodes - Workflow nodes
 * @param edges - Workflow edges
 * @returns Deduplicated nodes and edges with removed trigger IDs
 */
export function removeDuplicateTriggers(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  removedTriggerIds: string[];
} {
  const triggerNodes = getTriggerNodes(nodes);
  
  // If no duplicates, return as-is
  if (triggerNodes.length <= 1) {
    return {
      nodes,
      edges,
      removedTriggerIds: [],
    };
  }
  
  // Keep the first trigger
  const firstTrigger = triggerNodes[0];
  const triggersToRemove = triggerNodes.slice(1);
  const removedTriggerIds = triggersToRemove.map(t => t.id);
  
  // Remove duplicate triggers from nodes
  const deduplicatedNodes = nodes.filter(
    node => !removedTriggerIds.includes(node.id)
  );
  
  // Remove edges connected to removed triggers
  const deduplicatedEdges = edges.filter(edge => {
    // Remove edges from removed triggers
    if (removedTriggerIds.includes(edge.source)) {
      return false;
    }
    // Remove edges to removed triggers
    if (removedTriggerIds.includes(edge.target)) {
      return false;
    }
    return true;
  });
  
  // Redirect edges from removed triggers to the first trigger
  // Find edges that were targeting removed triggers and redirect to first trigger
  const redirectedEdges = edges
    .filter(edge => removedTriggerIds.includes(edge.target))
    .map(edge => ({
      ...edge,
      target: firstTrigger.id,
    }));
  
  // Add redirected edges (avoid duplicates)
  const finalEdges = [...deduplicatedEdges];
  for (const redirectedEdge of redirectedEdges) {
    const exists = finalEdges.some(
      e => e.source === redirectedEdge.source && e.target === redirectedEdge.target
    );
    if (!exists) {
      finalEdges.push(redirectedEdge);
    }
  }
  
  return {
    nodes: deduplicatedNodes,
    edges: finalEdges,
    removedTriggerIds,
  };
}

/**
 * Validate that workflow has exactly one trigger
 */
export function validateTriggerCount(nodes: WorkflowNode[]): {
  valid: boolean;
  triggerCount: number;
  error?: string;
} {
  const triggerNodes = getTriggerNodes(nodes);
  const triggerCount = triggerNodes.length;
  
  if (triggerCount === 0) {
    return {
      valid: false,
      triggerCount: 0,
      error: 'Workflow must have exactly one trigger node',
    };
  }
  
  if (triggerCount > 1) {
    return {
      valid: false,
      triggerCount,
      error: `Workflow has ${triggerCount} trigger nodes, but only one is allowed`,
    };
  }
  
  return {
    valid: true,
    triggerCount: 1,
  };
}

/**
 * Ensure workflow has exactly one trigger
 * If none exists, adds a manual_trigger
 * If multiple exist, removes duplicates
 */
export function ensureSingleTrigger(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  added: boolean;
  removed: string[];
} {
  const triggerNodes = getTriggerNodes(nodes);
  
  // Case 1: No triggers - add manual_trigger
  if (triggerNodes.length === 0) {
    const { randomUUID } = require('crypto');
    const manualTrigger: WorkflowNode = {
      id: randomUUID(),
      type: 'manual_trigger',
      position: { x: 0, y: 0 },
      data: {
        type: 'manual_trigger',
        label: 'Start',
        category: 'triggers',
        config: {},
      },
    };
    
    return {
      nodes: [manualTrigger, ...nodes],
      edges,
      added: true,
      removed: [],
    };
  }
  
  // Case 2: Multiple triggers - remove duplicates
  if (triggerNodes.length > 1) {
    const result = removeDuplicateTriggers(nodes, edges);
    return {
      nodes: result.nodes,
      edges: result.edges,
      added: false,
      removed: result.removedTriggerIds,
    };
  }
  
  // Case 3: Exactly one trigger - return as-is
  return {
    nodes,
    edges,
    added: false,
    removed: [],
  };
}

/**
 * Get or create a single trigger node.
 *
 * Rules:
 * - If a trigger already exists → return the existing trigger (do not create another)
 * - If multiple triggers exist → remove duplicates and keep the first one
 * - If no trigger exists → create a new trigger of the requested type
 *
 * This is a thin, explicit wrapper around the existing trigger utilities and is
 * designed to be idempotent and safe to call multiple times during graph build.
 */
export function getOrCreateSingleTrigger(
  nodes: WorkflowNode[],
  edges?: WorkflowEdge[],
  triggerType: string = 'manual_trigger'
): {
  trigger: WorkflowNode;
  nodes: WorkflowNode[];
  edges?: WorkflowEdge[];
  created: boolean;
  removed: string[];
} {
  const triggerNodes = getTriggerNodes(nodes);

  // Case 1: Exactly one trigger exists → return it as-is
  if (triggerNodes.length === 1) {
    return {
      trigger: triggerNodes[0],
      nodes,
      edges,
      created: false,
      removed: [],
    };
  }

  // Case 2: Multiple triggers → delegate to removeDuplicateTriggers when edges provided
  if (triggerNodes.length > 1) {
    if (edges) {
      const result = removeDuplicateTriggers(nodes, edges);
      const remainingTriggers = getTriggerNodes(result.nodes);
      const primaryTrigger = remainingTriggers[0];

      return {
        trigger: primaryTrigger,
        nodes: result.nodes,
        edges: result.edges,
        created: false,
        removed: result.removedTriggerIds,
      };
    }

    // No edges provided – do a node-only deduplication
    const firstTrigger = triggerNodes[0];
    const triggersToRemove = triggerNodes.slice(1);
    const removedIds = triggersToRemove.map(t => t.id);
    const deduplicatedNodes = nodes.filter(n => !removedIds.includes(n.id));

    return {
      trigger: firstTrigger,
      nodes: deduplicatedNodes,
      created: false,
      removed: removedIds,
    };
  }

  // Case 3: No trigger exists → create one
  const { randomUUID } = require('crypto');
  const newTrigger: WorkflowNode = {
    id: randomUUID(),
    type: triggerType,
    position: { x: 0, y: 0 },
    data: {
      type: triggerType,
      label: triggerType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      category: 'triggers',
      config: {},
    },
  };

  return {
    trigger: newTrigger,
    nodes: [newTrigger, ...nodes],
    edges,
    created: true,
    removed: [],
  };
}