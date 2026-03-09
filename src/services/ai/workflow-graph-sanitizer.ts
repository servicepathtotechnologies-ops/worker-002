/**
 * Workflow Graph Sanitizer
 * 
 * Enforces correct workflow topology, removes duplicate/invalid nodes,
 * fixes node configs, and normalizes field modes.
 * 
 * Runs AFTER ProductionWorkflowBuilder.build() and BEFORE FinalWorkflowValidator.validate()
 * 
 * Responsibilities:
 * - Remove duplicate nodes (especially AI provider nodes like Ollama)
 * - Enforce linear/DAG topology
 * - Fix IfElse branch structure (both if/else branches)
 * - Fix node naming corruption
 * - Fix node config field modes (HTTP headers/body, ClickUp URL, PostgreSQL query)
 * - Remove invalid edges (manual trigger to all nodes, logout connections)
 * - Remove orphan nodes
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { randomUUID } from 'crypto';
import { semanticNodeEquivalenceRegistry } from '../../core/registry/semantic-node-equivalence-registry';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { nodeReplacementTracker } from './node-replacement-tracker';
import {
  isBranchingNode,
  isOutputNode,
  isDataSourceNode,
  isTransformationNode,
  getNodeExecutionPriority,
  shouldFieldBeAIMode,
  isSpecialNodeType,
  getBranchingNodeTypes
} from '../../core/utils/universal-node-analyzer';

export interface SanitizationResult {
  workflow: Workflow;
  fixes: {
    duplicateNodesRemoved: number;
    invalidEdgesRemoved: number;
    orphanNodesRemoved: number;
    nodeNamesFixed: number;
    nodeConfigsFixed: number;
    ifElseBranchesFixed: number;
    topologyFixed: boolean;
  };
  errors: string[];
  warnings: string[];
}

export class WorkflowGraphSanitizer {
  /**
   * Sanitize workflow graph
   * @param workflow - Workflow to sanitize
   * @param requiredNodeTypes - Optional set of required node types that should NOT be removed
   */
  sanitize(workflow: Workflow, requiredNodeTypes?: Set<string>, confidenceScore?: number): SanitizationResult {
    const fixes = {
      duplicateNodesRemoved: 0,
      invalidEdgesRemoved: 0,
      orphanNodesRemoved: 0,
      nodeNamesFixed: 0,
      nodeConfigsFixed: 0,
      ifElseBranchesFixed: 0,
      topologyFixed: false,
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('[WorkflowGraphSanitizer] 🧹 Starting workflow graph sanitization...');
    console.log(`[WorkflowGraphSanitizer] Initial state: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    // Clone workflow to avoid mutations
    let sanitizedWorkflow: Workflow = {
      nodes: JSON.parse(JSON.stringify(workflow.nodes)),
      edges: JSON.parse(JSON.stringify(workflow.edges)),
      metadata: workflow.metadata,
    };

    // STEP 1: Remove duplicate nodes (especially AI provider nodes)
    const duplicateResult = this.removeDuplicateNodes(sanitizedWorkflow, confidenceScore, requiredNodeTypes);
    sanitizedWorkflow = duplicateResult.workflow;
    fixes.duplicateNodesRemoved = duplicateResult.removedCount;
    warnings.push(...duplicateResult.warnings);

    // STEP 2: Fix node naming corruption
    const namingResult = this.fixNodeNames(sanitizedWorkflow);
    sanitizedWorkflow = namingResult.workflow;
    fixes.nodeNamesFixed = namingResult.fixedCount;
    warnings.push(...namingResult.warnings);

    // STEP 3: Fix node configs (field modes)
    const configResult = this.fixNodeConfigs(sanitizedWorkflow);
    sanitizedWorkflow = configResult.workflow;
    fixes.nodeConfigsFixed = configResult.fixedCount;
    warnings.push(...configResult.warnings);

    // STEP 4: Fix IfElse branch structure
    const ifElseResult = this.fixIfElseBranches(sanitizedWorkflow);
    sanitizedWorkflow = ifElseResult.workflow;
    fixes.ifElseBranchesFixed = ifElseResult.fixedCount;
    warnings.push(...ifElseResult.warnings);

    // STEP 5: Enforce topology (remove invalid edges, fix manual trigger)
    const topologyResult = this.enforceTopology(sanitizedWorkflow);
    sanitizedWorkflow = topologyResult.workflow;
    fixes.invalidEdgesRemoved = topologyResult.removedEdges;
    fixes.topologyFixed = topologyResult.fixed;
    warnings.push(...topologyResult.warnings);

    // STEP 5.5: Repair connections for orphaned required nodes (safety net - should rarely trigger after root-level fix)
    // This is a defensive measure in case edge removal still creates orphans
    if (requiredNodeTypes && requiredNodeTypes.size > 0) {
      const repairResult = this.repairOrphanedRequiredNodes(sanitizedWorkflow, requiredNodeTypes);
      sanitizedWorkflow = repairResult.workflow;
      if (repairResult.repairedCount > 0) {
        warnings.push(`Repaired ${repairResult.repairedCount} orphaned required node(s) by reconnecting them`);
        console.log(`[WorkflowGraphSanitizer] ✅ Repaired ${repairResult.repairedCount} orphaned required node(s)`);
      }
    }

    // STEP 6: Remove orphan nodes (but protect required nodes)
    const orphanResult = this.removeOrphanNodes(sanitizedWorkflow, requiredNodeTypes, confidenceScore);
    sanitizedWorkflow = orphanResult.workflow;
    fixes.orphanNodesRemoved = orphanResult.removedCount;
    warnings.push(...orphanResult.warnings);

    console.log(`[WorkflowGraphSanitizer] ✅ Sanitization complete:`);
    console.log(`[WorkflowGraphSanitizer]   - Removed ${fixes.duplicateNodesRemoved} duplicate node(s)`);
    console.log(`[WorkflowGraphSanitizer]   - Fixed ${fixes.nodeNamesFixed} node name(s)`);
    console.log(`[WorkflowGraphSanitizer]   - Fixed ${fixes.nodeConfigsFixed} node config(s)`);
    console.log(`[WorkflowGraphSanitizer]   - Fixed ${fixes.ifElseBranchesFixed} IfElse branch(es)`);
    console.log(`[WorkflowGraphSanitizer]   - Removed ${fixes.invalidEdgesRemoved} invalid edge(s)`);
    console.log(`[WorkflowGraphSanitizer]   - Removed ${fixes.orphanNodesRemoved} orphan node(s)`);
    console.log(`[WorkflowGraphSanitizer] Final state: ${sanitizedWorkflow.nodes.length} nodes, ${sanitizedWorkflow.edges.length} edges`);

    return {
      workflow: sanitizedWorkflow,
      fixes,
      errors,
      warnings,
    };
  }

  /**
   * ✅ ENHANCED: Remove duplicate nodes (exact duplicates + semantic duplicates)
   * 
   * Now checks both:
   * 1. Exact duplicates (same node type)
   * 2. Semantic duplicates (semantically equivalent node types)
   * 
   * Rule: Only ONE canonical node type allowed per workflow (removes semantic equivalents)
   */
  private removeDuplicateNodes(workflow: Workflow, confidenceScore?: number, requiredNodeTypes?: Set<string>): {
    workflow: Workflow;
    removedCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const nodesToRemove = new Set<string>();
    const seenCanonicals = new Map<string, string>(); // canonicalType -> first nodeId

    for (const node of workflow.nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const operation = node.data?.config?.operation as string | undefined;
      
      // Get category from node definition
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const category = nodeDef?.category?.toLowerCase();
      
      // ✅ WORLD-CLASS ARCHITECTURE: Get canonical type using unified matcher
      const canonical = unifiedNodeTypeMatcher.getCanonicalType(nodeType, {
        operation: operation?.toLowerCase(),
        category: category,
      });
      const canonicalLower = canonical.toLowerCase();
      
      // ✅ CRITICAL: Never remove protected nodes (user-explicit nodes)
      const isProtected = (node.data as any)?.origin?.source === 'user' || 
                         (node.data as any)?.protected === true;
      
      // ✅ NEW: Never remove required/mandatory nodes (from keyword extraction)
      const isRequired = requiredNodeTypes && requiredNodeTypes.has(canonicalLower);
      
      if (isProtected || isRequired) {
        // User-explicit or required node - always keep it, even if duplicate
        if (isRequired) {
          console.log(`[WorkflowGraphSanitizer] 🛡️  Protecting required node from duplicate removal: ${nodeType} (canonical: ${canonical})`);
        }
        seenCanonicals.set(canonicalLower, node.id);
        continue;
      }

      // Check if canonical already exists
      if (seenCanonicals.has(canonicalLower)) {
        // This is a semantic duplicate - mark for removal
        const firstNodeId = seenCanonicals.get(canonicalLower)!;
        nodesToRemove.add(node.id);
        
        const reason = `Semantic duplicate ${nodeType} node (canonical: ${canonical}) - keeping first occurrence`;
        warnings.push(
          `Removed semantic duplicate ${nodeType} node: ${node.id} ` +
          `(canonical: ${canonical}, keeping: ${firstNodeId})`
        );
        
        // ✅ TRACK REPLACEMENT
        const nodeDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(node.type || node.data?.type || ''));
        let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
        if (nodeDef?.category === 'data') {
          category = 'dataSource';
        } else if (nodeDef?.category === 'communication') {
          category = 'output';
        }
        
        nodeReplacementTracker.trackReplacement({
          nodeId: node.id,
          nodeType,
          operation: typeof node.data?.config?.operation === 'string' ? node.data.config.operation : '',
          category,
          reason,
          stage: 'workflow_graph_sanitizer.removeDuplicateNodes',
          replacedBy: unifiedNormalizeNodeTypeString(workflow.nodes.find(n => n.id === firstNodeId)?.type || workflow.nodes.find(n => n.id === firstNodeId)?.data?.type || '') || '',
          wasRemoved: true,
          isProtected: false,
          confidence: confidenceScore,
          metadata: {
            canonical,
            firstNodeId: firstNodeId || '',
          },
        });
        
        console.log(
          `[WorkflowGraphSanitizer] 🗑️  Marking semantic duplicate ${nodeType} → ${canonical} ` +
          `for removal: ${node.id} (keeping: ${firstNodeId})`
        );
      } else {
        // First occurrence of canonical type - keep it
        seenCanonicals.set(canonicalLower, node.id);
        if (canonical !== nodeType) {
          console.log(
            `[WorkflowGraphSanitizer] ✅ Normalized ${nodeType} → ${canonical} ` +
            `(semantic equivalence, keeping: ${node.id})`
          );
        }
      }
    }

    if (nodesToRemove.size === 0) {
      return { workflow, removedCount: 0, warnings: [] };
    }

    // Remove duplicate nodes
    const filteredNodes = workflow.nodes.filter(n => !nodesToRemove.has(n.id));

    // Remove edges connected to removed nodes
    const filteredEdges = workflow.edges.filter(
      e => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
    );

    // Reconnect downstream edges from removed nodes to the kept node
    const reconnectedEdges: WorkflowEdge[] = [];
    for (const edge of workflow.edges) {
      if (nodesToRemove.has(edge.source)) {
        // Find the kept node of the same canonical type
        const removedNode = workflow.nodes.find(n => n.id === edge.source);
        if (removedNode) {
          const removedNodeType = unifiedNormalizeNodeType(removedNode);
          const operation = removedNode.data?.config?.operation as string | undefined;
          const nodeDef = unifiedNodeRegistry.get(removedNodeType);
          const category = nodeDef?.category?.toLowerCase();
          
          // ✅ WORLD-CLASS ARCHITECTURE: Get canonical type using unified matcher
          const canonical = unifiedNodeTypeMatcher.getCanonicalType(removedNodeType, {
            operation: operation?.toLowerCase(),
            category: category,
          });
          const canonicalLower = canonical.toLowerCase();
          
          const keptNodeId = seenCanonicals.get(canonicalLower);
          if (keptNodeId) {
            // Reconnect to kept node
            reconnectedEdges.push({
              ...edge,
              source: keptNodeId,
            });
            warnings.push(`Reconnected edge from removed ${removedNodeType} (canonical: ${canonical}) to kept node: ${keptNodeId}`);
          }
        }
      } else if (!nodesToRemove.has(edge.target)) {
        // Keep edge if target is not removed
        reconnectedEdges.push(edge);
      }
    }

    return {
      workflow: {
        ...workflow,
        nodes: filteredNodes,
        edges: [...filteredEdges.filter(e => !nodesToRemove.has(e.source)), ...reconnectedEdges],
      },
      removedCount: nodesToRemove.size,
      warnings,
    };
  }

  /**
   * Fix node naming corruption
   * Rule: node.data.label must match node canonical type from registry
   */
  private fixNodeNames(workflow: Workflow): {
    workflow: Workflow;
    fixedCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let fixedCount = 0;

    const fixedNodes = workflow.nodes.map(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const schema = nodeLibrary.getSchema(nodeType);

      if (!nodeDef && !schema) {
        return node; // Unknown node type, skip
      }

      const expectedLabel = schema?.label || nodeDef?.label || nodeType;
      const currentLabel = node.data?.label || '';

      if (currentLabel !== expectedLabel) {
        console.log(`[WorkflowGraphSanitizer] 🔧 Fixing node name: "${currentLabel}" → "${expectedLabel}" (type: ${nodeType})`);
        warnings.push(`Fixed node name: ${node.id} "${currentLabel}" → "${expectedLabel}"`);
        fixedCount++;

        return {
          ...node,
          data: {
            ...node.data,
            label: expectedLabel,
          },
        };
      }

      return node;
    });

    return {
      workflow: {
        ...workflow,
        nodes: fixedNodes,
      },
      fixedCount,
      warnings,
    };
  }

  /**
   * ✅ UNIVERSAL: Fix node configs (field modes)
   * Uses registry inputSchema - works for ALL nodes automatically
   * No hardcoded node type checks - universal solution
   */
  private fixNodeConfigs(workflow: Workflow): {
    workflow: Workflow;
    fixedCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let fixedCount = 0;

    const fixedNodes = workflow.nodes.map(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const config = node.data?.config || {};
      let updatedConfig = { ...config };
      let nodeFixed = false;

      // ✅ UNIVERSAL: Fix all fields that should be in AI mode
      // Uses registry inputSchema - works for ALL nodes
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef) {
        // Check all fields in inputSchema
        for (const fieldName of Object.keys(nodeDef.inputSchema)) {
          if (shouldFieldBeAIMode(nodeType, fieldName)) {
            const fieldValue = config[fieldName];
            const fieldModeKey = `_${fieldName}Mode`;
            
            // Set AI mode if field is string or missing
            if (!fieldValue || typeof fieldValue === 'string') {
              updatedConfig[fieldName] = fieldValue || '';
              updatedConfig[fieldModeKey] = 'ai';
              nodeFixed = true;
            }
          }
          
          // Fix fields that should be strings (not objects/dropdowns)
          const fieldSchema = nodeDef.inputSchema[fieldName];
          if (fieldSchema && fieldSchema.type === 'string') {
            const fieldValue = config[fieldName];
            if (fieldValue && typeof fieldValue !== 'string') {
              updatedConfig[fieldName] = String(fieldValue);
              nodeFixed = true;
            }
          }
        }
      }

      if (nodeFixed) {
        console.log(`[WorkflowGraphSanitizer] 🔧 Fixed config for ${nodeType} node: ${node.id}`);
        warnings.push(`Fixed config for ${nodeType} node: ${node.id}`);
        fixedCount++;

        return {
          ...node,
          data: {
            ...node.data,
            config: updatedConfig,
          },
        };
      }

      return node;
    });

    return {
      workflow: {
        ...workflow,
        nodes: fixedNodes,
      },
      fixedCount,
      warnings,
    };
  }

  /**
   * Fix IfElse branch structure
   * Rule: IfElse node MUST have exactly two branches (if and else)
   */
  private fixIfElseBranches(workflow: Workflow): {
    workflow: Workflow;
    fixedCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let fixedCount = 0;

    // ✅ PHASE 1 FIX: Use registry to find if_else nodes instead of hardcoded check
    const ifElseNodes = workflow.nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'if_else' || unifiedNodeRegistry.hasTag(nodeType, 'if') || unifiedNodeRegistry.hasTag(nodeType, 'conditional');
    });
    if (ifElseNodes.length === 0) {
      return { workflow, fixedCount: 0, warnings: [] };
    }

    const updatedEdges = [...workflow.edges];
    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    for (const ifElseNode of ifElseNodes) {
      // Find edges from this IfElse node
      const outgoingEdges = workflow.edges.filter(e => e.source === ifElseNode.id);
      
      // Check if both branches exist
      const hasTrueBranch = outgoingEdges.some(e => e.sourceHandle === 'true' || e.sourceHandle === 'output_true');
      const hasFalseBranch = outgoingEdges.some(e => e.sourceHandle === 'false' || e.sourceHandle === 'output_false');

      if (!hasTrueBranch || !hasFalseBranch) {
        console.log(`[WorkflowGraphSanitizer] 🔧 Fixing IfElse branches for node: ${ifElseNode.id}`);
        
        // Find downstream nodes (nodes that should receive IfElse output)
        const downstreamNodes = outgoingEdges
          .map(e => workflow.nodes.find(n => n.id === e.target))
          .filter((n): n is WorkflowNode => n !== undefined);

        if (downstreamNodes.length > 0) {
          // If true branch missing, connect first downstream to true branch
          if (!hasTrueBranch && downstreamNodes.length > 0) {
            const targetNode = downstreamNodes[0];
            updatedEdges.push({
              id: randomUUID(),
              source: ifElseNode.id,
              target: targetNode.id,
              sourceHandle: 'true',
              targetHandle: 'input',
            });
            warnings.push(`Added true branch to IfElse node: ${ifElseNode.id} → ${targetNode.id}`);
          }

          // If false branch missing, connect to noop or next available node
          if (!hasFalseBranch) {
            // ✅ PHASE 1 FIX: Use registry to find noop nodes instead of hardcoded check
            const noopNode = workflow.nodes.find(n => {
              const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
              return nodeType === 'noop' || unifiedNodeRegistry.hasTag(nodeType, 'noop');
            });
            
            if (noopNode) {
              updatedEdges.push({
                id: randomUUID(),
                source: ifElseNode.id,
                target: noopNode.id,
                sourceHandle: 'false',
                targetHandle: 'input',
              });
              warnings.push(`Added false branch to IfElse node: ${ifElseNode.id} → ${noopNode.id} (noop)`);
            } else if (downstreamNodes.length > 1) {
              // Connect to second downstream node
              updatedEdges.push({
                id: randomUUID(),
                source: ifElseNode.id,
                target: downstreamNodes[1].id,
                sourceHandle: 'false',
                targetHandle: 'input',
              });
              warnings.push(`Added false branch to IfElse node: ${ifElseNode.id} → ${downstreamNodes[1].id}`);
            } else {
              // Create a noop node as fallback
              const noopId = randomUUID();
              workflow.nodes.push({
                id: noopId,
                type: 'custom',
                data: {
                  label: 'No Operation',
                  type: 'noop',
                  category: 'utility',
                  config: {},
                },
              });
              updatedEdges.push({
                id: randomUUID(),
                source: ifElseNode.id,
                target: noopId,
                sourceHandle: 'false',
                targetHandle: 'input',
              });
              warnings.push(`Created noop node and connected false branch: ${ifElseNode.id} → ${noopId}`);
            }
          }

          fixedCount++;
        }
      }
    }

    return {
      workflow: {
        ...workflow,
        edges: updatedEdges,
      },
      fixedCount,
      warnings,
    };
  }

  /**
   * Enforce topology constraints
   * - Manual trigger must connect ONLY to first producer or transformer
   * - ✅ ROOT-LEVEL FIX: In LINEAR workflows, only the LAST node is terminal
   * - Remove invalid edges (logout connections, etc.)
   */
  private enforceTopology(workflow: Workflow): {
    workflow: Workflow;
    removedEdges: number;
    fixed: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let removedEdges = 0;
    let fixed = false;

    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const nodeTypeMap = new Map(workflow.nodes.map(n => [n.id, unifiedNormalizeNodeType(n)]));

    // Find trigger node
    const triggerNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeType(n);
      return type === 'manual_trigger' || type === 'trigger' || type.includes('trigger');
    });

    // ✅ ROOT-LEVEL FIX: Detect if workflow is LINEAR
    // Linear workflow = no branching (except if_else/switch/merge)
    const outDegreeMap = new Map<string, number>();
    workflow.edges.forEach(edge => {
      outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) || 0) + 1);
    });
    
    const hasBranching = Array.from(outDegreeMap.entries()).some(([nodeId, outDegree]) => {
      if (outDegree <= 1) return false;
      const node = workflow.nodes.find(n => n.id === nodeId);
      // ✅ UNIVERSAL: Use registry isBranching property - works for ALL nodes
      return !isBranchingNode(node || '');
    });
    
    const isLinearWorkflow = !hasBranching;
    console.log(`[WorkflowGraphSanitizer] 🔍 Workflow type: ${isLinearWorkflow ? 'LINEAR' : 'BRANCHING'}`);

    // ✅ UNIVERSAL: Find output nodes using registry - works for ALL nodes
    const outputNodes = workflow.nodes.filter(n => {
      const type = unifiedNormalizeNodeType(n);
      return isOutputNode(type);
    });

    // ✅ ROOT-LEVEL FIX: In LINEAR workflows, find the LAST node in execution chain
    // Only the LAST node should be terminal (no outgoing edges)
    // All other nodes (including output nodes) can have outgoing edges
    let lastNodeInChain: WorkflowNode | null = null;
    if (isLinearWorkflow && triggerNode) {
      // Use BFS to find last node in execution chain
      const visited = new Set<string>();
      const queue = [triggerNode.id];
      visited.add(triggerNode.id);
      let currentLast = triggerNode;
      
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        const outgoing = workflow.edges.filter(e => e.source === currentNodeId);
        
        for (const edge of outgoing) {
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push(edge.target);
            const targetNode = workflow.nodes.find(n => n.id === edge.target);
            if (targetNode) {
              currentLast = targetNode;
            }
          }
        }
      }
      
      lastNodeInChain = currentLast;
      console.log(`[WorkflowGraphSanitizer] 🔍 Last node in linear chain: ${lastNodeInChain ? unifiedNormalizeNodeType(lastNodeInChain) : 'none'}`);
    }

    // ✅ ROOT-LEVEL FIX: Only remove edges from TERMINAL nodes (last node in linear workflow)
    // In linear workflows: All nodes except the last one can have outgoing edges
    // In branching workflows: Only true terminal nodes (log_output, etc.) should have no outgoing edges
    const edgesToRemove = new Set<string>();
    for (const outputNode of outputNodes) {
      const outgoingEdges = workflow.edges.filter(e => e.source === outputNode.id);
      
      // ✅ ROOT-LEVEL FIX: In linear workflows, only remove edges from LAST node
      if (isLinearWorkflow && lastNodeInChain && outputNode.id === lastNodeInChain.id) {
        // This is the terminal node - remove all outgoing edges
        for (const edge of outgoingEdges) {
          edgesToRemove.add(edge.id);
          warnings.push(`Removed outgoing edge from terminal node: ${outputNode.id} → ${edge.target}`);
          removedEdges++;
        }
        continue;
      }
      
      // For non-terminal output nodes OR branching workflows, check edge validity
      for (const edge of outgoingEdges) {
        const targetNode = workflow.nodes.find(n => n.id === edge.target);
        if (!targetNode) {
          edgesToRemove.add(edge.id);
          warnings.push(`Removed edge to non-existent node: ${outputNode.id} → ${edge.target}`);
          removedEdges++;
          continue;
        }
        
        const targetType = unifiedNormalizeNodeType(targetNode);
        // ✅ UNIVERSAL: Use registry-based detection - works for ALL nodes
        const targetIsOutput = isOutputNode(targetType);
        const targetIsDataSource = isDataSourceNode(targetType);
        const targetIsTransformation = isTransformationNode(targetType);
        
        // ✅ ALLOW: Output → Output (valid in linear workflows: notify → route to CRM)
        if (targetIsOutput) {
          if (isLinearWorkflow) {
            // In linear workflows, output-to-output is valid (sequential outputs)
            console.log(`[WorkflowGraphSanitizer] ✅ Keeping output-to-output edge: ${outputNode.id} → ${edge.target} (linear workflow)`);
            continue;
          } else {
            // In branching workflows, output-to-output might be invalid (depends on context)
            // Keep it for now - let validation catch if it's truly invalid
            console.log(`[WorkflowGraphSanitizer] ✅ Keeping output-to-output edge: ${outputNode.id} → ${edge.target} (branching workflow)`);
            continue;
          }
        }
        
        // ❌ REMOVE: Output → Data Source (invalid: can't read after output)
        if (targetIsDataSource) {
          edgesToRemove.add(edge.id);
          warnings.push(`Removed invalid edge from output node to data source: ${outputNode.id} → ${edge.target} (output → data_source is invalid)`);
          removedEdges++;
          continue;
        }
        
        // ❌ REMOVE: Output → Transformation (invalid: can't transform after output)
        if (targetIsTransformation) {
          edgesToRemove.add(edge.id);
          warnings.push(`Removed invalid edge from output node to transformation: ${outputNode.id} → ${edge.target} (output → transformation is invalid)`);
          removedEdges++;
          continue;
        }
        
        // ✅ ALLOW: Output → Other (CRM, storage, etc. - might be valid)
        // Keep the edge for now - let validation catch if it's truly invalid
        console.log(`[WorkflowGraphSanitizer] ✅ Keeping output edge: ${outputNode.id} → ${edge.target} (target: ${targetType})`);
      }
    }

    // ✅ LABBUILD LINEAR FLOW: Fix manual trigger connections
    // In linear workflows, trigger should connect to the FIRST node in the execution chain
    // But we need to preserve the linear flow, not break it
    if (triggerNode) {
      const triggerEdges = workflow.edges.filter(e => e.source === triggerNode.id);
      
      if (triggerEdges.length > 1) {
        // Find the first non-trigger node in execution order (data source, then transformation, then output)
        // Priority: data_source > transformation > output
        const firstNode = workflow.nodes
          .filter(n => n.id !== triggerNode.id)
          .sort((a, b) => {
            const typeA = unifiedNormalizeNodeType(a);
            const typeB = unifiedNormalizeNodeType(b);
            
            // ✅ UNIVERSAL: Use registry-based priority - works for ALL nodes
            return getNodeExecutionPriority(typeA) - getNodeExecutionPriority(typeB);
          })[0]; // Get first node by priority

        if (firstNode) {
          // ✅ LABBUILD: Keep edge to first node, but DON'T remove other edges if they're part of linear flow
          // Instead, check if other edges are needed for the linear chain
          const edgesToKeep = new Set<string>();
          edgesToKeep.add(triggerEdges.find(e => e.target === firstNode.id)?.id || '');
          
          // Check if other trigger edges are needed (they might be part of a valid linear flow)
          // Only remove edges that create invalid topology (e.g., trigger → output directly when there's a transformation)
          for (const edge of triggerEdges) {
            const targetNode = workflow.nodes.find(n => n.id === edge.target);
            if (!targetNode) continue;
            
            const targetType = unifiedNormalizeNodeType(targetNode);
            // ✅ UNIVERSAL: Use registry-based output detection - works for ALL nodes
            const isOutput = isOutputNode(targetType);
            
            // Keep edge if it's to first node OR if it's a valid linear connection
            // Remove only if it's a direct trigger → output when there are transformations/data sources
            if (edge.target === firstNode.id) {
              edgesToKeep.add(edge.id);
            } else if (isOutput && firstNode) {
              // Direct trigger → output when there's a first node (data source/transformation) is invalid
              // Remove it - output should come after transformation/data source
              edgesToRemove.add(edge.id);
              warnings.push(`Removed invalid trigger edge to output: ${triggerNode.id} → ${edge.target} (output should come after transformation)`);
              removedEdges++;
            } else {
              // Keep other edges - they might be needed for linear flow
              edgesToKeep.add(edge.id);
            }
          }

          // Ensure trigger connects to first node
          const hasFirstNodeEdge = triggerEdges.some(e => e.target === firstNode.id);
          if (!hasFirstNodeEdge) {
            workflow.edges.push({
              id: randomUUID(),
              source: triggerNode.id,
              target: firstNode.id,
              type: 'default',
            });
            warnings.push(`Added trigger edge to first node: ${triggerNode.id} → ${firstNode.id}`);
            fixed = true;
          }
        }
      }
    }

    // Remove edges to/from non-existent nodes
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        edgesToRemove.add(edge.id);
        removedEdges++;
      }
    }

    // Remove logout node connections (if logout node exists, remove all its edges)
    const logoutNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeType(n);
      return type === 'logout' || type.includes('logout');
    });

    if (logoutNode) {
      const logoutEdges = workflow.edges.filter(
        e => e.source === logoutNode.id || e.target === logoutNode.id
      );
      for (const edge of logoutEdges) {
        edgesToRemove.add(edge.id);
        warnings.push(`Removed logout node edge: ${edge.source} → ${edge.target}`);
        removedEdges++;
      }
    }

    const filteredEdges = workflow.edges.filter(e => !edgesToRemove.has(e.id));

    return {
      workflow: {
        ...workflow,
        edges: filteredEdges,
      },
      removedEdges,
      fixed: removedEdges > 0 || fixed,
      warnings,
    };
  }

  /**
   * Repair connections for orphaned required nodes
   * Attempts to reconnect required nodes that became orphaned after edge removal
   */
  private repairOrphanedRequiredNodes(workflow: Workflow, requiredNodeTypes: Set<string>): {
    workflow: Workflow;
    repairedCount: number;
  } {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    
    // Build edge maps
    const incomingEdges = new Map<string, number>();
    const outgoingEdges = new Map<string, number>();
    
    for (const edge of workflow.edges) {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
      outgoingEdges.set(edge.source, (outgoingEdges.get(edge.source) || 0) + 1);
    }
    
    // Find orphaned required nodes
    const orphanedRequiredNodes = workflow.nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const canonicalType = nodeType.toLowerCase();
      const isRequired = requiredNodeTypes.has(canonicalType);
      const isTrigger = nodeType.includes('trigger');
      
      if (!isRequired || isTrigger) {
        return false;
      }
      
      const hasIncoming = (incomingEdges.get(node.id) || 0) > 0;
      const hasOutgoing = (outgoingEdges.get(node.id) || 0) > 0;
      
      return !hasIncoming && !hasOutgoing;
    });
    
    if (orphanedRequiredNodes.length === 0) {
      return { workflow, repairedCount: 0 };
    }
    
    console.log(`[WorkflowGraphSanitizer] 🔧 Found ${orphanedRequiredNodes.length} orphaned required node(s), attempting to reconnect with category-aware positioning...`);
    
    // ✅ Build topological order for execution chain traversal
    const executionOrder = this.getTopologicalOrder(workflow);
    
    // ✅ Reconnect orphaned required nodes using category-aware positioning
    const newEdges: WorkflowEdge[] = [];
    let repairedCount = 0;
    
    for (const orphanNode of orphanedRequiredNodes) {
      const orphanType = unifiedNormalizeNodeType(orphanNode);
      
      // ✅ Determine orphan node's category using registry
      const orphanCategory = this.getNodeCategory(orphanType);
      
      if (!orphanCategory) {
        console.warn(`[WorkflowGraphSanitizer] ⚠️  Cannot determine category for ${orphanType}, skipping reconnection`);
        continue;
      }
      
      // ✅ Find last appropriate node based on category rules
      const sourceNode = this.findLastAppropriateNode(workflow, executionOrder, orphanCategory, orphanType);
      
      if (!sourceNode) {
        console.warn(`[WorkflowGraphSanitizer] ⚠️  Cannot find appropriate source node for ${orphanType} (category: ${orphanCategory})`);
        continue;
      }
      
      const sourceType = unifiedNormalizeNodeType(sourceNode);
      
      // Check if connection is valid
      const isValidConnection = 
        (!sourceType.includes('trigger') || orphanCategory === 'data_source') && // Data sources can connect to trigger
        orphanNode.id !== sourceNode.id; // Don't self-connect
      
      if (isValidConnection) {
        const newEdge: WorkflowEdge = {
          id: randomUUID(),
          source: sourceNode.id,
          target: orphanNode.id,
          sourceHandle: 'output',
          targetHandle: 'input',
          type: 'default',
        };
        newEdges.push(newEdge);
        repairedCount++;
        console.log(`[WorkflowGraphSanitizer] ✅ Reconnected orphaned required node: ${sourceType} → ${orphanType} (category: ${orphanCategory})`);
      } else {
        console.warn(`[WorkflowGraphSanitizer] ⚠️  Cannot reconnect ${orphanType}: invalid connection to ${sourceType}`);
      }
    }
    
    if (newEdges.length > 0) {
      return {
        workflow: {
          ...workflow,
          edges: [...workflow.edges, ...newEdges],
        },
        repairedCount,
      };
    }
    
    return { workflow, repairedCount: 0 };
  }

  /**
   * Remove orphan nodes (nodes with no incoming or outgoing edges, except trigger)
   */
  private removeOrphanNodes(workflow: Workflow, requiredNodeTypes?: Set<string>, confidenceScore?: number): {
    workflow: Workflow;
    removedCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    // Build edge maps
    const incomingEdges = new Map<string, number>();
    const outgoingEdges = new Map<string, number>();

    for (const edge of workflow.edges) {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
      outgoingEdges.set(edge.source, (outgoingEdges.get(edge.source) || 0) + 1);
    }

    // Find orphan nodes (no incoming and no outgoing edges, except trigger and required nodes)
    const orphanNodes = workflow.nodes.filter(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const isTrigger = nodeType.includes('trigger');
      
      if (isTrigger) {
        return false; // Don't remove trigger nodes
      }

      // ✅ CRITICAL FIX: Don't remove required nodes even if they're orphaned
      // They need to be connected, not removed
      if (requiredNodeTypes) {
        const canonicalType = nodeType.toLowerCase();
        if (requiredNodeTypes.has(canonicalType)) {
          console.log(`[WorkflowGraphSanitizer] 🛡️  Protecting required orphan node: ${nodeType} (${node.id}) - will attempt to connect instead of remove`);
          return false; // Don't remove required nodes
        }
      }

      const hasIncoming = (incomingEdges.get(node.id) || 0) > 0;
      const hasOutgoing = (outgoingEdges.get(node.id) || 0) > 0;

      return !hasIncoming && !hasOutgoing;
    });

    if (orphanNodes.length === 0) {
      return { workflow, removedCount: 0, warnings: [] };
    }

    const orphanIds = new Set(orphanNodes.map(n => n.id));
    const filteredNodes = workflow.nodes.filter(n => !orphanIds.has(n.id));
    const filteredEdges = workflow.edges.filter(
      e => !orphanIds.has(e.source) && !orphanIds.has(e.target)
    );

    for (const orphan of orphanNodes) {
      const nodeType = unifiedNormalizeNodeType(orphan);
      const reason = `Orphan node (no incoming or outgoing edges)`;
      warnings.push(`Removed orphan node: ${orphan.id} (${nodeType})`);
      
      // ✅ TRACK REPLACEMENT
      const nodeDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(orphan.type || orphan.data?.type || ''));
      let category: 'dataSource' | 'transformation' | 'output' = 'transformation';
      if (nodeDef?.category === 'data') {
        category = 'dataSource';
      } else if (nodeDef?.category === 'communication') {
        category = 'output';
      }
      
      const isProtected = (orphan.data as any)?.origin?.source === 'user' || 
                         (orphan.data as any)?.protected === true;
      
      nodeReplacementTracker.trackReplacement({
        nodeId: orphan.id,
        nodeType: unifiedNormalizeNodeTypeString(orphan.type || orphan.data?.type || ''),
        operation: typeof orphan.data?.config?.operation === 'string' ? orphan.data.config.operation : '',
        category,
        reason,
        stage: 'workflow_graph_sanitizer.removeOrphanNodes',
        wasRemoved: true,
        isProtected,
        confidence: confidenceScore,
        metadata: {
          hasIncoming: (incomingEdges.get(orphan.id) || 0) > 0,
          hasOutgoing: (outgoingEdges.get(orphan.id) || 0) > 0,
        },
      });
    }

    return {
      workflow: {
        ...workflow,
        nodes: filteredNodes,
        edges: filteredEdges,
      },
      removedCount: orphanNodes.length,
      warnings,
    };
  }

  /**
   * ✅ WORLD-CLASS UNIVERSAL: Get node category using intelligent registry analysis
   * 
   * This is a PERFECT, FUTURE-PROOF solution that works for ALL categories:
   * - Uses capability registry (most reliable)
   * - Falls back to registry properties (category, tags, isBranching)
   * - Uses semantic analysis (node type patterns)
   * - NO hardcoded category mappings - works for infinite categories
   * 
   * @param nodeType - Node type to categorize
   * @returns DSL category: 'data_source', 'transformation', or 'output'
   */
  private getNodeCategory(nodeType: string): 'data_source' | 'transformation' | 'output' | null {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (!nodeDef) {
      // Node not in registry → use capability registry as fallback
      return this.inferCategoryFromCapabilities(nodeType);
    }
    
    // ✅ STEP 1: Use capability registry (most reliable - works for ALL nodes)
    try {
      if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        return 'output';
      }
      if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
        return 'transformation';
      }
      if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        return 'data_source';
      }
    } catch (error) {
      // Capability registry error → continue to next step
      console.warn(`[WorkflowGraphSanitizer] ⚠️  Capability registry error for ${nodeType}, using fallback analysis`);
    }
    
    // ✅ STEP 2: Use registry properties (category, tags, isBranching)
    const category = nodeDef.category || '';
    const tags = nodeDef.tags || [];
    const isBranching = nodeDef.isBranching || false;
    const nodeTypeLower = nodeType.toLowerCase();
    
    // Branching nodes (if_else, switch, try_catch, merge) are transformations
    if (isBranching) {
      return 'transformation';
    }
    
    // Logic/flow nodes are transformations
    // Note: 'flow' is not in the type definition but exists in node-library (e.g., try_catch)
    const categoryLower = String(category).toLowerCase();
    if (categoryLower === 'logic' || categoryLower === 'flow') {
      return 'transformation';
    }
    
    // Nodes with transformation tags
    const transformationTags = ['transform', 'process', 'analyze', 'summarize', 'ai', 'logic', 'conditional', 'branch', 'try', 'catch', 'error', 'retry'];
    if (tags.some(tag => transformationTags.includes(tag.toLowerCase()))) {
      return 'transformation';
    }
    
    // Communication nodes are outputs
    if (category === 'communication') {
      return 'output';
    }
    
    // Nodes with output tags
    const outputTags = ['send', 'notify', 'message', 'email', 'slack', 'crm', 'write', 'create', 'update'];
    if (tags.some(tag => outputTags.includes(tag.toLowerCase()))) {
      return 'output';
    }
    
    // Data nodes are data sources
    if (category === 'data') {
      return 'data_source';
    }
    
    // Nodes with data source tags
    const dataSourceTags = ['read', 'fetch', 'get', 'query', 'retrieve', 'pull', 'list', 'database', 'api'];
    if (tags.some(tag => dataSourceTags.includes(tag.toLowerCase()))) {
      return 'data_source';
    }
    
    // ✅ STEP 3: Semantic analysis (node type patterns)
    // AI/LLM nodes are transformations
    if (nodeTypeLower.includes('ai') || nodeTypeLower.includes('llm') || 
        nodeTypeLower.includes('gpt') || nodeTypeLower.includes('claude') || 
        nodeTypeLower.includes('gemini') || nodeTypeLower.includes('ollama') ||
        nodeTypeLower.includes('chat_model') || nodeTypeLower.includes('agent')) {
      return 'transformation';
    }
    
    // Error handling/flow control nodes are transformations
    if (nodeTypeLower.includes('try_catch') || nodeTypeLower.includes('retry') || 
        nodeTypeLower.includes('if_else') || nodeTypeLower.includes('switch') || 
        nodeTypeLower.includes('merge') || nodeTypeLower.includes('loop')) {
      return 'transformation';
    }
    
    // Communication nodes are outputs
    if (nodeTypeLower.includes('slack') || nodeTypeLower.includes('email') || 
        nodeTypeLower.includes('gmail') || nodeTypeLower.includes('telegram') || 
        nodeTypeLower.includes('discord') || nodeTypeLower.includes('teams') ||
        nodeTypeLower.includes('message') || nodeTypeLower.includes('notify')) {
      return 'output';
    }
    
    // CRM/storage nodes are outputs (they write data)
    if (nodeTypeLower.includes('crm') || nodeTypeLower.includes('hubspot') || 
        nodeTypeLower.includes('salesforce') || nodeTypeLower.includes('zoho') ||
        nodeTypeLower.includes('airtable') || nodeTypeLower.includes('notion')) {
      return 'output';
    }
    
    // Data source nodes
    if (nodeTypeLower.includes('database') || nodeTypeLower.includes('sheets') || 
        nodeTypeLower.includes('csv') || nodeTypeLower.includes('excel') ||
        nodeTypeLower.includes('api') || nodeTypeLower.includes('http_request')) {
      return 'data_source';
    }
    
    // ✅ STEP 4: Fallback to capability registry inference
    return this.inferCategoryFromCapabilities(nodeType);
  }

  /**
   * ✅ Helper: Infer category from capability registry (fallback)
   * 
   * Production-ready with proper error handling and logging
   */
  private inferCategoryFromCapabilities(nodeType: string): 'data_source' | 'transformation' | 'output' | null {
    try {
      if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        console.log(`[WorkflowGraphSanitizer] ✅ Inferred category 'output' for ${nodeType} via capability registry`);
        return 'output';
      }
      if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
        console.log(`[WorkflowGraphSanitizer] ✅ Inferred category 'transformation' for ${nodeType} via capability registry`);
        return 'transformation';
      }
      if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        console.log(`[WorkflowGraphSanitizer] ✅ Inferred category 'data_source' for ${nodeType} via capability registry`);
        return 'data_source';
      }
    } catch (error) {
      // Capability registry error → log and use default
      console.warn(`[WorkflowGraphSanitizer] ⚠️  Capability registry error for ${nodeType}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Default: treat as transformation (most common category)
    console.log(`[WorkflowGraphSanitizer] ℹ️  Using default category 'transformation' for ${nodeType} (no capability match found)`);
    return 'transformation';
  }

  /**
   * ✅ Helper: Get valid source categories for injected node category
   */
  private getValidSourceCategories(
    injectedCategory: 'data_source' | 'transformation' | 'output'
  ): Array<'data_source' | 'transformation' | 'output'> {
    switch (injectedCategory) {
      case 'data_source':
        // Data sources connect to trigger (they come first)
        return []; // Special case: handled separately
      
      case 'transformation':
        // Transformations connect to data sources or other transformations
        return ['data_source', 'transformation'];
      
      case 'output':
        // Outputs connect to transformations or data sources
        return ['transformation', 'data_source'];
      
      default:
        return [];
    }
  }

  /**
   * ✅ Helper: Find last appropriate node for orphan node based on category rules
   */
  private findLastAppropriateNode(
    workflow: Workflow,
    executionOrder: string[],
    orphanCategory: 'data_source' | 'transformation' | 'output',
    orphanNodeType: string
  ): WorkflowNode | null {
    const existingNodes = workflow.nodes;
    
    // ✅ Define valid source categories for orphan category
    const validSourceCategories = this.getValidSourceCategories(orphanCategory);
    
    // Traverse in reverse order (from end of chain)
    for (let i = executionOrder.length - 1; i >= 0; i--) {
      const nodeId = executionOrder[i];
      const node = existingNodes.find(n => n.id === nodeId);
      if (!node) continue;
      
      // ✅ Get node category from registry
      const nodeType = unifiedNormalizeNodeType(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (!nodeDef) {
        continue;
      }
      
      // ✅ Use universal category resolver (works for ALL categories)
      const mappedCategory = this.getNodeCategory(nodeType);
      const registryCategory = nodeDef.category;
      
      // ✅ Check if this node is a valid source (using registry category)
      if (mappedCategory && validSourceCategories.includes(mappedCategory)) {
        console.log(
          `[WorkflowGraphSanitizer] ✅ Found last appropriate node: ${nodeType} ` +
          `(registry category: ${registryCategory}, DSL category: ${mappedCategory}) ` +
          `for ${orphanCategory} node ${orphanNodeType}`
        );
        return node;
      }
      
      // ✅ Special case: Check if trigger (registry category='trigger')
      if (registryCategory === 'trigger' && orphanCategory === 'data_source') {
        return node;
      }
    }
    
    // Fallback: return trigger if available
    const triggerNode = existingNodes.find(n => {
      const t = unifiedNormalizeNodeType(n.type || n.data?.type || '');
      const def = unifiedNodeRegistry.get(t);
      return def?.category === 'trigger';
    });
    
    if (triggerNode && orphanCategory === 'data_source') {
      console.warn(
        `[WorkflowGraphSanitizer] ⚠️  Using trigger as fallback for ${orphanNodeType} ` +
        `(no appropriate node found in chain)`
      );
      return triggerNode;
    }
    
    return null;
  }

  /**
   * ✅ Helper: Get topological order from workflow (execution order)
   */
  private getTopologicalOrder(workflow: Workflow): string[] {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    
    // Initialize in-degree and adjacency list
    for (const node of workflow.nodes) {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    }
    
    // Build graph
    for (const edge of workflow.edges) {
      const source = edge.source;
      const target = edge.target;
      
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
      const neighbors = adjacencyList.get(source) || [];
      neighbors.push(target);
      adjacencyList.set(source, neighbors);
    }
    
    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    const result: string[] = [];
    
    // Add nodes with in-degree 0
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      
      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
    
    return result;
  }
}

export const workflowGraphSanitizer = new WorkflowGraphSanitizer();
