/**
 * Unified Execution Engine
 * 
 * Single source of truth for workflow execution.
 * Used by both Run Node (debug) and Run Workflow (full execution).
 * 
 * This ensures:
 * - Identical execution paths
 * - Deterministic traversal
 * - Type preservation
 * - Context stability
 */

// Workflow types (inline to avoid circular dependencies)
interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
import { ExecutionContext, createExecutionContext, setNodeOutput } from './typed-execution-context';
import { LRUNodeOutputsCache } from '../cache/lru-node-outputs-cache';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ExecutionPlan {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionOrder: WorkflowNode[];
  triggerNode: WorkflowNode | null;
  validationErrors: string[];
  validationWarnings: string[];
}

export interface UnifiedExecutionContext {
  context: ExecutionContext;
  nodeOutputs: LRUNodeOutputsCache;
  ifElseResults: Record<string, boolean>;
  switchResults: Record<string, string | null>;
}

/**
 * Check if a node is a trigger node (inline version to avoid async import)
 * Recognizes nodes by category === 'triggers' or known trigger types
 */
function isTriggerNodeInline(node: WorkflowNode): boolean {
  const nodeType = node.data?.type || node.type || '';
  const category = node.data?.category || '';
  
  // ✅ PRIMARY: Check if node is in "triggers" category (any node from triggers category)
  if (category.toLowerCase() === 'triggers' || category.toLowerCase() === 'trigger') {
    return true;
  }
  
  // ✅ SECONDARY: Check if type includes 'trigger'
  if (nodeType.includes('trigger')) {
    return true;
  }
  
  // ✅ TERTIARY: Check known trigger types (fallback for nodes without category)
  const knownTriggerTypes = [
    'manual_trigger',
    'webhook',
    'schedule',
    'chat_trigger',
    'form_trigger',
    'form',
    'workflow_trigger',
    // IMPORTANT: error_trigger is a sidecar handler, not a primary trigger.
    // execute-workflow.ts already executes error_trigger nodes out-of-band on failures.
    // Counting it as a trigger breaks the "exactly one trigger" invariant.
    'interval',
    'gmail_trigger',
    'slack_trigger',
    'discord_trigger',
  ];
  
  return knownTriggerTypes.includes(nodeType);
}

/**
 * Build execution plan from workflow graph
 * Validates and prepares workflow for execution
 */
export function buildExecutionPlan(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ExecutionPlan {
  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  // 1. Validate single trigger
  // Use isTriggerNodeInline to recognize ALL nodes from triggers category
  const triggerNodes = nodes.filter(n => isTriggerNodeInline(n));

  if (triggerNodes.length === 0) {
    validationErrors.push('Workflow must have exactly one trigger node');
  } else if (triggerNodes.length > 1) {
    validationErrors.push(`Workflow has ${triggerNodes.length} trigger nodes, but should have exactly one`);
  }

  const triggerNode = triggerNodes.length === 1 ? triggerNodes[0] : null;

  // 2. Topological sort for execution order
  const executionOrder = topologicalSort(nodes, edges);

  // 3. Validate graph structure
  const nodeIds = new Set(nodes.map(n => n.id));
  const invalidEdges = edges.filter(e => 
    !nodeIds.has(e.source) || !nodeIds.has(e.target)
  );

  if (invalidEdges.length > 0) {
    validationErrors.push(`Found ${invalidEdges.length} edge(s) referencing non-existent nodes`);
  }

  // 4. Validate no cycles (topological sort should handle this, but double-check)
  if (executionOrder.length !== nodes.length) {
    validationWarnings.push(`Execution order has ${executionOrder.length} nodes but workflow has ${nodes.length} - possible cycle or disconnected nodes`);
  }

  return {
    nodes,
    edges: edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)),
    executionOrder,
    triggerNode,
    validationErrors,
    validationWarnings,
  };
}

/**
 * Topological sort to determine execution order
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach(node => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach(edge => {
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  });

  const queue: string[] = [];
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeMap[nodeId]);

    adjacency[nodeId].forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  return sorted;
}

/**
 * Create unified execution context
 * Used by both Run Node and Run Workflow
 */
export function createUnifiedExecutionContext(
  initialInput: unknown,
  nodeOutputs?: LRUNodeOutputsCache
): UnifiedExecutionContext {
  const context = createExecutionContext(initialInput);
  const outputs = nodeOutputs || new LRUNodeOutputsCache(100, false);
  
  // Initialize $json to point to merged input
  const inputObj = typeof initialInput === 'object' && initialInput !== null && !Array.isArray(initialInput)
    ? initialInput as Record<string, unknown>
    : { value: initialInput, data: initialInput };
  
  context.variables.$json = inputObj;
  context.variables.json = inputObj;
  context.lastOutput = initialInput;

  return {
    context,
    nodeOutputs: outputs,
    ifElseResults: {},
    switchResults: {},
  };
}

/**
 * Update execution context with node output
 * 
 * ✅ CORE ARCHITECTURE FIX: Store node output in isolated storage
 * 
 * Ensures:
 * - Node output stored ONLY in nodeOutputs map
 * - Variables contain ONLY merged input (not node output)
 * - $json points to merged input (for template resolution)
 * - No root-level pollution
 */
export function updateExecutionContext(
  execCtx: UnifiedExecutionContext,
  nodeId: string,
  output: unknown,
  mergedInput: unknown
): void {
  // ✅ Store output in isolated storage (nodeOutputs map)
  execCtx.nodeOutputs.set(nodeId, output);
  setNodeOutput(execCtx.context, nodeId, output);

  // ✅ Restore $json to merged input (not last node output)
  // This ensures {{$json.items}} resolves to current node's input, not previous node's output
  const mergedInputObj = typeof mergedInput === 'object' && mergedInput !== null && !Array.isArray(mergedInput)
    ? mergedInput as Record<string, unknown>
    : { value: mergedInput, data: mergedInput };
  
  execCtx.context.variables.$json = mergedInputObj;
  execCtx.context.variables.json = mergedInputObj;
  execCtx.context.lastOutput = output; // lastOutput is the node's output (for backward compatibility)
}

/**
 * Check if node should be skipped based on conditional branches
 * 
 * ✅ CORE ARCHITECTURE FIX: Recursively check if ANY upstream node was skipped
 * This ensures nodes downstream from skipped nodes are also skipped
 */
export function shouldSkipNode(
  node: WorkflowNode,
  incomingEdges: WorkflowEdge[],
  nodes: WorkflowNode[],
  ifElseResults: Record<string, boolean>,
  switchResults: Record<string, string | null>,
  skippedNodeIds: Set<string> = new Set() // Track skipped nodes to prevent infinite loops
): boolean {
  // ✅ FIX: If this node was already determined to be skipped, return true
  if (skippedNodeIds && skippedNodeIds.has(node.id)) {
    return true;
  }

  for (const edge of incomingEdges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;

    // ✅ FIX: Recursively check if source node was skipped
    // If source node is skipped, this node should also be skipped
    if (skippedNodeIds && skippedNodeIds.has(edge.source)) {
      console.log('[shouldSkipNode] ✅ Skipping node - source node was skipped:', {
        targetNodeId: node.id,
        targetNodeLabel: node.data?.label,
        sourceNodeId: edge.source,
        sourceNodeLabel: sourceNode.data?.label,
      });
      // ✅ FIX: Mark this node as skipped so further downstream nodes are also skipped
      skippedNodeIds.add(node.id);
      return true;
    }

    // Check If/Else branches
    if (sourceNode.data?.type === 'if_else' && ifElseResults[edge.source] !== undefined) {
      const conditionResult = ifElseResults[edge.source];
      const isTruePath = edge.sourceHandle === 'true' || edge.sourceHandle === 'output_true';
      const isFalsePath = edge.sourceHandle === 'false' || edge.sourceHandle === 'output_false';
      
      // ✅ DEBUG: Log routing decision
      console.log('[shouldSkipNode] If/Else routing check:', {
        targetNodeId: node.id,
        targetNodeLabel: node.data?.label,
        sourceNodeId: edge.source,
        sourceNodeLabel: sourceNode.data?.label,
        sourceHandle: edge.sourceHandle,
        conditionResult,
        isTruePath,
        isFalsePath,
        ifElseResults: { ...ifElseResults },
      });
      
      // ✅ CRITICAL FIX: If edge from if_else doesn't have sourceHandle, we need to infer it
      // This can happen if edges were created without explicit sourceHandle values
      // Strategy: If condition is false and no sourceHandle, assume it's on false path (most common case)
      // If condition is true and no sourceHandle, assume it's on true path
      if (!isTruePath && !isFalsePath) {
        console.warn('[shouldSkipNode] ⚠️ Edge from if_else node missing sourceHandle - inferring from condition:', {
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          conditionResult,
        });
        
        // ✅ INFERENCE: If condition is false, assume this edge is on false path
        // If condition is true, assume this edge is on true path
        // This handles the common case where edges are created without explicit sourceHandle
        if (!conditionResult) {
          // Condition is false, so this edge is likely on the false path
          // Don't skip - allow execution
          console.log('[shouldSkipNode] ✅ Inferred false path (condition=false, no sourceHandle) - allowing execution');
          continue; // Don't skip - this is likely the false path
        } else {
          // Condition is true, so this edge is likely on the true path
          // Don't skip - allow execution
          console.log('[shouldSkipNode] ✅ Inferred true path (condition=true, no sourceHandle) - allowing execution');
          continue; // Don't skip - this is likely the true path
        }
      }
      
      // ✅ EXPLICIT PATH CHECK: If sourceHandle is explicitly set, use it strictly
      // CRITICAL FIX: Always skip nodes on the wrong path - no exceptions
      // The routing must be deterministic: if condition=false, only FALSE path executes
      if (isTruePath && !conditionResult) {
        // Edge says true path but condition is false → SKIP
        console.log('[shouldSkipNode] ✅ Skipping node - on true path but condition is false', {
          targetNodeId: node.id,
          targetNodeLabel: node.data?.label,
          sourceNodeId: edge.source,
          sourceHandle: edge.sourceHandle,
          conditionResult,
        });
        // ✅ FIX: Mark this node as skipped so downstream nodes are also skipped
        if (skippedNodeIds) {
          skippedNodeIds.add(node.id);
        }
        return true; // Skip - on true path but condition is false
      }
      if (isFalsePath && conditionResult) {
        // Edge says false path but condition is true → SKIP
        console.log('[shouldSkipNode] ✅ Skipping node - on false path but condition is true', {
          targetNodeId: node.id,
          targetNodeLabel: node.data?.label,
          sourceNodeId: edge.source,
          sourceHandle: edge.sourceHandle,
          conditionResult,
        });
        // ✅ FIX: Mark this node as skipped so downstream nodes are also skipped
        if (skippedNodeIds) {
          skippedNodeIds.add(node.id);
        }
        return true; // Skip - on false path but condition is true
      }
      
      // ✅ If we reach here, the node is on the correct path and should execute
      console.log('[shouldSkipNode] ✅ Node should execute - on correct path');
    }

    // Check Switch branches
    if (sourceNode.data?.type === 'switch' && switchResults[edge.source] !== undefined) {
      const matchedCase = switchResults[edge.source];
      // ✅ IMPORTANT:
      // - If no case matched (matchedCase === null), skip ALL downstream branches.
      // - If a case matched, only the matching sourceHandle branch should execute.
      if (matchedCase === null) {
        return true;
      }
      if (edge.sourceHandle !== matchedCase) {
        return true; // Skip - doesn't match switch case
      }
    }
  }

  return false;
}

/**
 * Build node input from incoming edges
 * 
 * ✅ CORE ARCHITECTURE FIX: Merge upstream outputs cleanly
 * 
 * This function merges outputs from all source nodes into a single input object.
 * It ensures:
 * - Clean merging without duplication
 * - Proper handling of multiple upstream nodes
 * - Fallback to defaultInput if no upstream outputs
 */
export function buildNodeInput(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  nodeOutputs: LRUNodeOutputsCache,
  defaultInput: unknown
): unknown {
  const incomingEdges = edges.filter(e => e.target === node.id);
  
  if (incomingEdges.length === 0) {
    return defaultInput;
  }

  // ✅ Merge outputs from all source nodes
  // Use a clean merge strategy to avoid duplication
  const mergedInput: Record<string, unknown> = {};
  
  for (const edge of incomingEdges) {
    const sourceOutput = nodeOutputs.get(edge.source);
    if (sourceOutput !== undefined) {
      // ✅ Handle different output types
      if (typeof sourceOutput === 'object' && sourceOutput !== null && !Array.isArray(sourceOutput)) {
        // Object output: merge keys
        const sourceObj = sourceOutput as Record<string, unknown>;
        Object.assign(mergedInput, sourceObj);
      } else if (Array.isArray(sourceOutput)) {
        // Array output: wrap in items key
        mergedInput.items = sourceOutput;
        mergedInput.data = sourceOutput;
        mergedInput.array = sourceOutput;
      } else {
        // Primitive output: wrap in value key
        mergedInput.value = sourceOutput;
        mergedInput.data = sourceOutput;
      }
    }
  }

  return Object.keys(mergedInput).length > 0 ? mergedInput : defaultInput;
}
