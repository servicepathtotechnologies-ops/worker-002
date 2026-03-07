/**
 * Linear Flow Validator
 * 
 * Validates that workflows follow a linear execution pattern:
 * trigger → node1 → node2 → node3 → ...
 * 
 * This is the LabBuild workflow model where nodes execute sequentially,
 * not all directly connected to the trigger.
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';

export interface LinearFlowValidationResult {
  valid: boolean;
  isLinear: boolean;
  linearPath: string[]; // Ordered node IDs in the linear path
  disconnectedNodes: string[]; // Nodes not in the linear path
  errors: string[];
  warnings: string[];
  details: {
    totalNodes: number;
    totalEdges: number;
    pathLength: number;
    hasBranches: boolean;
    hasCycles: boolean;
  };
}

/**
 * Validate that a workflow follows a linear execution pattern
 * 
 * Linear flow means:
 * 1. Trigger is the first node
 * 2. Each subsequent node has exactly one incoming edge (from previous node)
 * 3. Each node (except last) has at least one outgoing edge
 * 4. All nodes are reachable through a single linear path
 * 5. No branches (except allowed ones like if_else, switch)
 */
export function validateLinearFlow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): LinearFlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const linearPath: string[] = [];
  const disconnectedNodes: string[] = [];

  // Find trigger node
  const triggerNode = nodes.find(node => {
    const nodeType = (node.data?.type || node.type || '').toLowerCase();
    return nodeType.includes('trigger') || nodeType === 'manual_trigger';
  });

  if (!triggerNode) {
    return {
      valid: false,
      isLinear: false,
      linearPath: [],
      disconnectedNodes: nodes.map(n => n.id),
      errors: ['No trigger node found'],
      warnings: [],
      details: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        pathLength: 0,
        hasBranches: false,
        hasCycles: false,
      },
    };
  }

  // Build adjacency maps
  const incomingEdges = new Map<string, WorkflowEdge[]>();
  const outgoingEdges = new Map<string, WorkflowEdge[]>();

  edges.forEach(edge => {
    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target)!.push(edge);

    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source)!.push(edge);
  });

  // ✅ LABBUILD LINEAR FLOW: Build ALL reachable nodes from trigger (BFS)
  // In linear workflows, nodes can be connected sequentially: trigger → node1 → node2 → node3
  // OR have parallel outputs: node → output1, node → output2 (both valid in linear flow)
  const visited = new Set<string>();
  const queue: string[] = [triggerNode.id];
  visited.add(triggerNode.id);
  const path: string[] = [triggerNode.id]; // Track primary path
  let hasBranches = false;

  // BFS to find ALL reachable nodes from trigger
  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const outgoing = outgoingEdges.get(currentNodeId) || [];
    
    if (outgoing.length === 0) {
      // End of path (leaf node)
      continue;
    }

    if (outgoing.length > 1) {
      // Multiple outgoing edges - check if it's an allowed branch node
      const currentNode = nodes.find(n => n.id === currentNodeId);
      const nodeType = (currentNode?.data?.type || currentNode?.type || '').toLowerCase();
      
      // Allowed branch nodes: if_else, switch, merge (can have multiple outputs)
      // Also allow parallel outputs (e.g., transformation → output1, transformation → output2)
      const allowedBranchNodes = ['if_else', 'switch', 'merge'];
      const isOutputNode = nodeType.includes('output') || 
                          ['email', 'slack_message', 'google_gmail', 'airtable', 'hubspot'].includes(nodeType);
      
      if (!allowedBranchNodes.includes(nodeType) && !isOutputNode) {
        hasBranches = true;
        // Don't warn for parallel outputs - they're valid in linear flow
        if (!isOutputNode) {
          warnings.push(`Node ${currentNodeId} (${nodeType}) has ${outgoing.length} outgoing edges - may not be linear`);
        }
      }
      
      // For primary path tracking, take the first edge
      // But visit ALL targets to mark them as reachable
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
          // Add to primary path only if it's the first outgoing edge
          if (edge === outgoing[0]) {
            path.push(edge.target);
          }
        }
      }
    } else {
      // Single outgoing edge - follow it
      const nextNodeId = outgoing[0].target;
      if (!visited.has(nextNodeId)) {
        visited.add(nextNodeId);
        queue.push(nextNodeId);
        path.push(nextNodeId); // Add to primary path
      } else {
        // Cycle detected
        warnings.push(`Cycle detected: node ${nextNodeId} already visited`);
      }
    }
  }

  // Find disconnected nodes (not in the linear path)
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      disconnectedNodes.push(node.id);
    }
  });

  // Validate each node in path (except trigger) has exactly one incoming edge
  for (let i = 1; i < path.length; i++) {
    const nodeId = path[i];
    const incoming = incomingEdges.get(nodeId) || [];
    
    // Check if node is a merge node (can have multiple inputs)
    const node = nodes.find(n => n.id === nodeId);
    const nodeType = (node?.data?.type || node?.type || '').toLowerCase();
    const isMergeNode = nodeType === 'merge';
    
    if (!isMergeNode && incoming.length !== 1) {
      if (incoming.length === 0) {
        errors.push(`Node ${nodeId} (${nodeType}) in path has no incoming edge`);
      } else {
        warnings.push(`Node ${nodeId} (${nodeType}) has ${incoming.length} incoming edges (expected 1 for linear flow)`);
      }
    }
  }

  // Check for cycles (simple check - if we visited a node twice, it's a cycle)
  const hasCycles = path.length !== new Set(path).size;

  const isLinear = disconnectedNodes.length === 0 && errors.length === 0 && !hasCycles;

  if (disconnectedNodes.length > 0) {
    const disconnectedNodeTypes = disconnectedNodes.map(id => {
      const node = nodes.find(n => n.id === id);
      return (node?.data?.type || node?.type || 'unknown');
    });
    errors.push(
      `Found ${disconnectedNodes.length} node(s) not in linear path: ${disconnectedNodeTypes.join(', ')}`
    );
  }

  return {
    valid: isLinear,
    isLinear,
    linearPath: path,
    disconnectedNodes,
    errors,
    warnings,
    details: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      pathLength: path.length,
      hasBranches,
      hasCycles,
    },
  };
}

/**
 * Check if all required nodes are reachable through the linear path
 */
export function validateRequiredNodesInLinearPath(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  requiredNodeTypes: Set<string>
): { valid: boolean; missingNodes: string[]; errors: string[] } {
  const linearValidation = validateLinearFlow(nodes, edges);
  const errors: string[] = [];
  const missingNodes: string[] = [];

  if (!linearValidation.valid) {
    errors.push('Linear flow validation failed');
    return { valid: false, missingNodes: [], errors };
  }

  // Check if all required node types are in the linear path
  const pathNodeTypes = new Set(
    linearValidation.linearPath.map(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return (node?.data?.type || node?.type || '').toLowerCase();
    })
  );

  requiredNodeTypes.forEach(reqType => {
    if (!pathNodeTypes.has(reqType.toLowerCase())) {
      missingNodes.push(reqType);
    }
  });

  if (missingNodes.length > 0) {
    errors.push(
      `Required node types not in linear path: ${missingNodes.join(', ')}`
    );
  }

  return {
    valid: missingNodes.length === 0,
    missingNodes,
    errors,
  };
}
