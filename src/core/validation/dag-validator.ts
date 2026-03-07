/**
 * DAG Validator - Enforces Deterministic Workflow DAG Compiler Rules
 * 
 * This validator ensures workflows strictly follow DAG rules:
 * - No cycles
 * - No duplicate nodes/edges
 * - Proper node degrees (in/out)
 * - Linear flow by default
 * - Proper IF/SWITCH/MERGE handling
 * - No burst flow
 */

import { WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixes?: Array<{
    type: 'remove_edge' | 'add_edge' | 'add_merge' | 'fix_degree';
    description: string;
    edge?: { source: string; target: string };
    node?: string;
  }>;
}

export interface WorkflowStructure {
  nodes: Array<{ id: string; type: string }>;
  connections: Array<{ 
    source: string; 
    target: string; 
    type?: string; // DAG Rule: "true", "false", "case_1", "case_2", etc.
    sourceOutput?: string;
    targetInput?: string;
  }>;
  trigger?: string;
}

/**
 * DAG Validator - Validates workflow structure against deterministic DAG rules
 */
export class DAGValidator {
  /**
   * Validate workflow structure against DAG rules
   */
  validateStructure(structure: WorkflowStructure): DAGValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: DAGValidationResult['fixes'] = [];

    // 1. Check for duplicate node IDs
    const nodeIds = new Set<string>();
    const duplicateNodes: string[] = [];
    structure.nodes.forEach(node => {
      if (nodeIds.has(node.id)) {
        duplicateNodes.push(node.id);
      }
      nodeIds.add(node.id);
    });
    if (duplicateNodes.length > 0) {
      errors.push(`Duplicate node IDs: ${duplicateNodes.join(', ')}`);
    }

    // 2. Check for duplicate edges
    const edgeKeys = new Set<string>();
    const duplicateEdges: string[] = [];
    structure.connections.forEach(conn => {
      const key = `${conn.source}→${conn.target}`;
      if (edgeKeys.has(key)) {
        duplicateEdges.push(key);
      }
      edgeKeys.add(key);
    });
    if (duplicateEdges.length > 0) {
      errors.push(`Duplicate edges: ${duplicateEdges.join(', ')}`);
      // Auto-fix: Remove duplicates
      const seen = new Set<string>();
      structure.connections = structure.connections.filter(conn => {
        const key = `${conn.source}→${conn.target}`;
        if (seen.has(key)) {
          fixes.push({
            type: 'remove_edge',
            description: `Removed duplicate edge: ${conn.source} → ${conn.target}`,
            edge: { source: conn.source, target: conn.target },
          });
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    // 3. Check for self-loops
    const selfLoops = structure.connections.filter(conn => conn.source === conn.target);
    if (selfLoops.length > 0) {
      errors.push(`Self-loops detected: ${selfLoops.map(e => e.source).join(', ')}`);
      // Auto-fix: Remove self-loops
      structure.connections = structure.connections.filter(conn => {
        if (conn.source === conn.target) {
          fixes.push({
            type: 'remove_edge',
            description: `Removed self-loop: ${conn.source} → ${conn.target}`,
            edge: { source: conn.source, target: conn.target },
          });
          return false;
        }
        return true;
      });
    }

    // 4. Validate node degrees
    const nodeDegrees = this.calculateNodeDegrees(structure);
    const triggerId = 'trigger';
    
    // Check trigger
    const triggerOutDegree = nodeDegrees.get(triggerId)?.out || 0;
    if (triggerOutDegree !== 1) {
      errors.push(`Trigger must have exactly 1 outgoing edge, found ${triggerOutDegree}`);
    }

    // Check normal nodes
    structure.nodes.forEach(node => {
      const normalizedType = unifiedNormalizeNodeTypeString(node.type);
      const degrees = nodeDegrees.get(node.id);
      if (!degrees) return;

      const inDegree = degrees.in;
      const outDegree = degrees.out;

      // Normal action nodes: in-degree = 1, out-degree = 1
      if (!['if_else', 'switch', 'merge', 'log_output'].includes(normalizedType)) {
        if (inDegree !== 1) {
          errors.push(`Node ${node.id} (${normalizedType}) must have exactly 1 input, found ${inDegree}`);
        }
        if (outDegree !== 1) {
          errors.push(`Node ${node.id} (${normalizedType}) must have exactly 1 output, found ${outDegree}`);
        }
      }

      // IF node: in-degree = 1, out-degree = 2 (true/false)
      if (normalizedType === 'if_else') {
        if (inDegree !== 1) {
          errors.push(`IF node ${node.id} must have exactly 1 input, found ${inDegree}`);
        }
        if (outDegree !== 2) {
          errors.push(`IF node ${node.id} must have exactly 2 outputs (true/false), found ${outDegree}`);
        }
        // Check edge types
        const ifEdges = structure.connections.filter(c => c.source === node.id);
        const hasTrue = ifEdges.some(e => e.type === 'true');
        const hasFalse = ifEdges.some(e => e.type === 'false');
        if (!hasTrue || !hasFalse) {
          errors.push(`IF node ${node.id} must have both 'true' and 'false' edges`);
        }
      }

      // SWITCH node: in-degree = 1, out-degree >= 2
      if (normalizedType === 'switch') {
        if (inDegree !== 1) {
          errors.push(`SWITCH node ${node.id} must have exactly 1 input, found ${inDegree}`);
        }
        if (outDegree < 2) {
          errors.push(`SWITCH node ${node.id} must have at least 2 outputs, found ${outDegree}`);
        }
        // Check edge types (case_1, case_2, etc.)
        const switchEdges = structure.connections.filter(c => c.source === node.id);
        const caseTypes = switchEdges.map(e => e.type).filter(t => t?.startsWith('case_'));
        if (caseTypes.length !== outDegree) {
          errors.push(`SWITCH node ${node.id} edges must be labeled case_1, case_2, etc.`);
        }
      }

      // MERGE node: in-degree >= 2, out-degree = 1
      if (normalizedType === 'merge') {
        if (inDegree < 2) {
          errors.push(`MERGE node ${node.id} must have at least 2 inputs, found ${inDegree}`);
        }
        if (outDegree !== 1) {
          errors.push(`MERGE node ${node.id} must have exactly 1 output, found ${outDegree}`);
        }
      }

      // LOG node: in-degree = 1, out-degree = 0
      if (normalizedType === 'log_output') {
        if (inDegree !== 1) {
          errors.push(`LOG node ${node.id} must have exactly 1 input, found ${inDegree}`);
        }
        if (outDegree !== 0) {
          errors.push(`LOG node ${node.id} must have 0 outputs (terminal), found ${outDegree}`);
        }
      }
    });

    // 5. Check for cycles
    const cycleCheck = this.detectCycles(structure);
    if (cycleCheck.hasCycle) {
      errors.push(`Cycle detected: ${cycleCheck.cyclePath?.join(' → ')}`);
    }

    // 6. Check for burst flow (multiple edges from trigger or normal nodes)
    const burstNodes: string[] = [];
    structure.connections.forEach(conn => {
      if (conn.source === triggerId) {
        // Trigger should only have 1 outgoing edge (already checked above)
        return;
      }
      
      const sourceNode = structure.nodes.find(n => n.id === conn.source);
      if (!sourceNode) return;
      
      const normalizedType = unifiedNormalizeNodeTypeString(sourceNode.type);
      const outDegree = nodeDegrees.get(conn.source)?.out || 0;
      
      // Only IF/SWITCH can have multiple outputs
      if (!['if_else', 'switch'].includes(normalizedType) && outDegree > 1) {
        burstNodes.push(conn.source);
      }
    });
    
    if (burstNodes.length > 0) {
      const uniqueBurstNodes = [...new Set(burstNodes)];
      errors.push(`Burst flow detected from nodes: ${uniqueBurstNodes.join(', ')} (only IF/SWITCH can have multiple outputs)`);
    }

    // 7. Check for orphan nodes (nodes with no input/output)
    const orphanNodes: string[] = [];
    structure.nodes.forEach(node => {
      const degrees = nodeDegrees.get(node.id);
      if (!degrees) {
        orphanNodes.push(node.id);
      } else if (degrees.in === 0 && degrees.out === 0) {
        orphanNodes.push(node.id);
      }
    });
    
    if (orphanNodes.length > 0) {
      warnings.push(`Orphan nodes detected: ${orphanNodes.join(', ')} (nodes with no connections)`);
    }

    // 8. Check graph connectivity (all nodes reachable from trigger)
    const reachableNodes = this.getReachableNodes(structure, triggerId);
    const unreachableNodes = structure.nodes.filter(n => !reachableNodes.has(n.id));
    if (unreachableNodes.length > 0) {
      errors.push(`Unreachable nodes from trigger: ${unreachableNodes.map(n => n.id).join(', ')}`);
    }

    // 9. Check for LOG nodes connected from multiple paths without MERGE
    const logNodes = structure.nodes.filter(n => 
      unifiedNormalizeNodeTypeString(n.type) === 'log_output'
    );
    
    logNodes.forEach(logNode => {
      const inDegree = nodeDegrees.get(logNode.id)?.in || 0;
      if (inDegree > 1) {
        // Check if all paths go through MERGE
        const incomingEdges = structure.connections.filter(c => c.target === logNode.id);
        const sourceNodes = incomingEdges.map(e => {
          if (e.source === triggerId) return triggerId;
          return structure.nodes.find(n => n.id === e.source);
        });
        
        const hasMerge = sourceNodes.some(node => {
          if (node === triggerId) return false;
          if (!node) return false;
          return unifiedNormalizeNodeTypeString(node.type) === 'merge';
        });
        
        if (!hasMerge && inDegree > 1) {
          errors.push(`LOG node ${logNode.id} connected from ${inDegree} paths without MERGE node`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      fixes: fixes.length > 0 ? fixes : undefined,
    };
  }

  /**
   * Calculate in-degree and out-degree for each node
   */
  private calculateNodeDegrees(structure: WorkflowStructure): Map<string, { in: number; out: number }> {
    const degrees = new Map<string, { in: number; out: number }>();
    
    // Initialize all nodes
    structure.nodes.forEach(node => {
      degrees.set(node.id, { in: 0, out: 0 });
    });
    degrees.set('trigger', { in: 0, out: 0 });
    
    // Count degrees from connections
    structure.connections.forEach(conn => {
      // Out-degree for source
      const sourceDegrees = degrees.get(conn.source);
      if (sourceDegrees) {
        sourceDegrees.out++;
      }
      
      // In-degree for target
      const targetDegrees = degrees.get(conn.target);
      if (targetDegrees) {
        targetDegrees.in++;
      }
    });
    
    return degrees;
  }

  /**
   * Detect cycles using DFS
   */
  private detectCycles(structure: WorkflowStructure): {
    hasCycle: boolean;
    cyclePath?: string[];
  } {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cyclePath: string[] = [];
    
    const allNodeIds = new Set<string>(structure.nodes.map(n => n.id));
    allNodeIds.add('trigger');
    
    const adjacencyList = new Map<string, string[]>();
    allNodeIds.forEach(id => adjacencyList.set(id, []));
    
    structure.connections.forEach(conn => {
      const neighbors = adjacencyList.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
    });
    
    const dfs = (nodeId: string, path: string[]): boolean => {
      if (recStack.has(nodeId)) {
        // Cycle found
        const cycleStart = path.indexOf(nodeId);
        cyclePath.push(...path.slice(cycleStart), nodeId);
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);
      
      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor, [...path])) {
          return true;
        }
      }
      
      recStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of allNodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [])) {
          return { hasCycle: true, cyclePath };
        }
      }
    }
    
    return { hasCycle: false };
  }

  /**
   * Get all nodes reachable from trigger using BFS
   */
  private getReachableNodes(structure: WorkflowStructure, startNode: string): Set<string> {
    const reachable = new Set<string>();
    const queue: string[] = [startNode];
    reachable.add(startNode);
    
    const adjacencyList = new Map<string, string[]>();
    structure.nodes.forEach(n => adjacencyList.set(n.id, []));
    adjacencyList.set('trigger', []);
    
    structure.connections.forEach(conn => {
      const neighbors = adjacencyList.get(conn.source);
      if (neighbors) {
        neighbors.push(conn.target);
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacencyList.get(current) || [];
      
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    return reachable;
  }

  /**
   * Validate and auto-fix workflow structure
   */
  validateAndFix(structure: WorkflowStructure): {
    structure: WorkflowStructure;
    result: DAGValidationResult;
  } {
    const result = this.validateStructure(structure);
    
    // Apply fixes
    if (result.fixes) {
      result.fixes.forEach(fix => {
        if (fix.type === 'remove_edge' && fix.edge) {
          structure.connections = structure.connections.filter(
            c => !(c.source === fix.edge!.source && c.target === fix.edge!.target)
          );
        }
      });
    }
    
    // Re-validate after fixes
    const revalidation = this.validateStructure(structure);
    
    return {
      structure,
      result: revalidation,
    };
  }
}

export const dagValidator = new DAGValidator();
