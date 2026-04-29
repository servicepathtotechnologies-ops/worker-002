/**
 * Workflow Graph Normalizer
 * 
 * ✅ CRITICAL: Single source of truth for workflow graph format
 * 
 * Used by:
 * - generate-workflow
 * - attach-inputs
 * - attach-credentials
 * - executor
 * - UI fetch
 * 
 * Eliminates format drift forever.
 */

import { Workflow, WorkflowNode } from '../types/ai-types';
import { validateAndFixEdgeHandles, getDefaultSourceHandle, getDefaultTargetHandle } from './node-handle-registry';
import { logger } from '../logger';
import { coerceWorkflowNodePosition } from './workflow-node-position';
import { extractSwitchCasePortNames } from './branching-node-ports';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';

export interface NormalizedWorkflowGraph {
  nodes: WorkflowNode[];
  edges: any[];
  metadata?: {
    version?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/** full: legacy (linearization, log rewiring); topologyPreserve: handle fixes only, no structural rewrites */
export interface NormalizeWorkflowGraphOptions {
  mode?: 'full' | 'topologyPreserve';
}

/**
 * Normalize workflow graph from any format
 * 
 * Handles:
 * - String JSON
 * - Object format
 * - Missing nodes/edges
 * - Invalid structure
 */
export function normalizeWorkflowGraph(
  rawGraph: any,
  options?: NormalizeWorkflowGraphOptions
): NormalizedWorkflowGraph {
  try {
    // Parse if string
    let parsed: any;
    if (typeof rawGraph === 'string') {
      try {
        parsed = JSON.parse(rawGraph);
      } catch (parseError) {
        throw new Error(`Failed to parse workflow graph JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } else if (rawGraph && typeof rawGraph === 'object') {
      parsed = rawGraph;
    } else {
      throw new Error('Workflow graph must be a string or object');
    }

    // Extract nodes and edges
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const edges = Array.isArray(parsed.edges) ? parsed.edges : [];

    // ✅ CRITICAL: Deduplicate nodes by ID FIRST (before normalization)
    // This prevents duplicate node IDs from causing validation errors
    const nodeMap = new Map<string, any>();
    const duplicateNodeIds: string[] = [];
    
    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue; // Skip invalid nodes
      }
      
      const nodeId = node.id || `node_${nodes.indexOf(node)}_${Date.now()}`;
      if (nodeMap.has(nodeId)) {
        duplicateNodeIds.push(nodeId);
        logger.debug(`[NormalizeWorkflowGraph] Found duplicate node ID: ${nodeId}, keeping first occurrence`);
        continue; // Skip duplicate, keep first
      }
      nodeMap.set(nodeId, node);
    }
    
    if (duplicateNodeIds.length > 0) {
      logger.debug(`[NormalizeWorkflowGraph] Removed ${duplicateNodeIds.length} duplicate node(s) by ID: ${[...new Set(duplicateNodeIds)].join(', ')}`);
    }

    // Validate nodes structure (only process unique nodes)
    let normalizedNodes = Array.from(nodeMap.values()).map((node: any, index: number) => {
      const pos = coerceWorkflowNodePosition(node.position) ?? { x: 0, y: 0 };
      // Ensure required fields
      return {
        id: node.id || `node_${index}_${Date.now()}`,
        type: node.type || node.data?.type || 'custom',
        position: pos,
        data: {
          ...node.data,
          type: node.data?.type || node.type || 'custom',
          label: node.data?.label || node.label || 'Node',
          config: node.data?.config || {},
        },
      };
    });

    // Validate edges structure and fix handles
    // ✅ Branch-handle inference pass (pre-handle-registry):
    // - If/Else requires explicit 'true'/'false' sourceHandle (never default both to 'true')
    // - Switch prefers case_* handle IDs when provided on edge.type
    const nodesById = new Map<string, any>(normalizedNodes.map((n: any) => [n.id, n]));
    const outgoingBySource = new Map<string, any[]>();
    for (const e of edges) {
      if (!e || typeof e !== 'object') continue;
      if (!outgoingBySource.has(e.source)) outgoingBySource.set(e.source, []);
      outgoingBySource.get(e.source)!.push(e);
    }
    // Mutate a shallow clone so we can safely adjust handles.
    const edgesWithInferredHandles = edges.map((e: any) => ({ ...e }));
    const edgeById = new Map<string, any>();
    for (const e of edgesWithInferredHandles) {
      if (e && typeof e === 'object' && e.id) edgeById.set(String(e.id), e);
    }
    const getWorkingEdge = (e: any) =>
      e && e.id && edgeById.has(String(e.id)) ? edgeById.get(String(e.id)) : e;

    for (const [sourceId, outs] of outgoingBySource.entries()) {
      const srcNode = nodesById.get(sourceId);
      const srcType = String(srcNode?.data?.type || srcNode?.type || '').toLowerCase();
      const srcDef = unifiedNodeRegistry.get(srcType);
      if (!srcType) continue;

      // ✅ REGISTRY-DRIVEN: Handle branching nodes with fixed semantic ports (e.g. if_else → true/false)
      if (srcDef?.isBranching && srcDef.outgoingPorts && srcDef.outgoingPorts.length > 0) {
        const hasSemanticPorts = !srcDef.outgoingPorts.every((p: string) => p === 'output' || p === 'default');
        if (hasSemanticPorts) {
          const working = outs.map(getWorkingEdge);
          const used = new Set<string>();
          for (const e of working) {
            const h = String(e?.sourceHandle || '').toLowerCase();
            if (srcDef.outgoingPorts.includes(h)) used.add(h);
          }
          // Prefer edge.type if it already encodes the branch.
          for (const e of working) {
            if (e?.sourceHandle) continue;
            const t = typeof e?.type === 'string' ? String(e.type).toLowerCase() : '';
            if (srcDef.outgoingPorts.includes(t)) {
              e.sourceHandle = t;
              used.add(t);
            }
          }
          // Assign remaining handle deterministically for any still-missing.
          for (const e of working) {
            const h = String(e?.sourceHandle || '').toLowerCase();
            if (srcDef.outgoingPorts.includes(h)) continue;
            const next = srcDef.outgoingPorts.find(p => !used.has(p)) ?? null;
            if (next) {
              e.sourceHandle = next;
              used.add(next);
            }
          }
          // Keep type in sync.
          for (const e of working) {
            const h = String(e?.sourceHandle || '').toLowerCase();
            if (srcDef.outgoingPorts.includes(h)) {
              e.type = h;
            }
          }
        }
      }

      // ✅ REGISTRY-DRIVEN: Handle dynamic branching nodes (switch-like with runtime cases)
      // These have outgoingPorts: ['output'] as a fallback — not semantic constraints.
      if (srcDef?.isBranching) {
        const fixedPorts = srcDef.outgoingPorts || [];
        const hasSemanticPorts = fixedPorts.length > 0 && !fixedPorts.every((p: string) => p === 'output' || p === 'default');
        if (!hasSemanticPorts) {
          const working = outs.map(getWorkingEdge);
          const switchCasePorts = extractSwitchCasePortNames((srcNode?.data?.config || {}) as Record<string, any>);
          for (const e of working) {
            // Treat 'output'/'default' as the generic fallback — not a real case handle.
            // If edge.type carries a meaningful case label, promote it to sourceHandle.
            const existingHandle = String(e?.sourceHandle || '');
            const isGenericHandle = !existingHandle || existingHandle === 'output' || existingHandle === 'default';
            if (!isGenericHandle) continue;
            const t = typeof e?.type === 'string' ? String(e.type) : '';
            const positionalMatch = /^case_(\d+)$/i.exec(t);
            if (positionalMatch) {
              const caseIndex = parseInt(positionalMatch[1], 10) - 1;
              e.sourceHandle = switchCasePorts[caseIndex] || t;
              continue;
            }
            if (t && t.toLowerCase() !== 'main' && t.toLowerCase() !== 'default' && t.toLowerCase() !== 'output') {
              e.sourceHandle = t;
            }
          }
        }
      }
    }

    let normalizedEdges = edgesWithInferredHandles.map((edge: any, index: number) => {
      if (!edge || typeof edge !== 'object') {
        throw new Error(`Invalid edge at index ${index}: must be an object`);
      }

      // Find source and target nodes to get their types
      const sourceNode = normalizedNodes.find((n: any) => n.id === edge.source);
      const targetNode = normalizedNodes.find((n: any) => n.id === edge.target);

      const sourceNodeType = sourceNode?.data?.type || sourceNode?.type || 'default';
      const targetNodeType = targetNode?.data?.type || targetNode?.type || 'default';

      // ✅ CRITICAL: Validate and fix handles using handle registry
      const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
        sourceNodeType,
        targetNodeType,
        edge.sourceHandle,
        edge.targetHandle
      );

      // Log handle fixes for debugging
      if (edge.sourceHandle !== sourceHandle || edge.targetHandle !== targetHandle) {
        logger.debug(
          `[NormalizeWorkflowGraph] 🔧 Fixed edge handles: ${edge.source} → ${edge.target} ` +
          `(${edge.sourceHandle || 'undefined'} → ${sourceHandle}, ` +
          `${edge.targetHandle || 'undefined'} → ${targetHandle})`
        );
      }

      return {
        ...edge,
        id: edge.id || `edge_${index}`,
        source: edge.source || '',
        target: edge.target || '',
        sourceHandle,
        targetHandle,
        // Preserve explicit branching type when present; otherwise default.
        type: edge.type || 'default',
      };
    });

    if (options?.mode === 'topologyPreserve') {
      logger.debug(
        '[NormalizeWorkflowGraph] topologyPreserve: skipping log_output placement and linearization'
      );
      return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
        metadata: {
          version: parsed.metadata?.version || '1.0',
          createdAt: parsed.metadata?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    // ✅ ARCHITECTURAL RULE (CORE): log_output must never connect from triggers.
    // It must be placed AFTER terminal execution nodes, branch-aware.
    try {
      const getType = (n: any) => String(n?.data?.type || n?.type || '').toLowerCase();
      const isTrigger = (n: any): boolean => {
        const nodeType = getType(n);
        const category = String(n?.data?.category || '').toLowerCase();
        if (category === 'triggers' || category === 'trigger') return true;
        if (nodeType.includes('trigger')) return true;
        return [
          'manual_trigger', 'webhook', 'schedule', 'chat_trigger', 'form_trigger',
          'form', 'workflow_trigger', 'error_trigger', 'interval',
        ].includes(nodeType);
      };

      const isTerminalNode = (n: any): boolean => {
        const nodeType = getType(n);
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        return nodeDef?.isTerminal === true || (nodeDef?.tags || []).includes('terminal');
      };

      const nodeById = new Map<string, any>(normalizedNodes.map((n: any) => [n.id, n]));
      const logNodes = normalizedNodes.filter((n: any) => isTerminalNode(n));
      if (logNodes.length > 0) {
        const logNodeIds = new Set(logNodes.map((n: any) => n.id));
        const existingLog = logNodes[0];

        // Remove trigger -> terminal edges and any outgoing from any terminal (sink behavior).
        normalizedEdges = normalizedEdges.filter((e: any) => {
          if (logNodeIds.has(e?.source)) return false;
          if (logNodeIds.has(e?.target)) {
            const src = nodeById.get(e.source);
            if (src && isTrigger(src)) return false;
          }
          return true;
        });

        // If multiple logs exist (common for branching observability), preserve them as-is.
        // Do not collapse all terminal paths into the first log node.
        const shouldSkipSingleLogRewire = logNodes.length > 1;
        if (shouldSkipSingleLogRewire) {
          logger.debug(
            `[NormalizeWorkflowGraph] 🔀 Preserving ${logNodes.length} terminal nodes; skipping single-log rewiring`
          );
        }
        if (!shouldSkipSingleLogRewire) {
          // Compute terminal nodes (no outgoing), excluding triggers and existing terminal nodes
          const sources = new Set(normalizedEdges.map((e: any) => e.source));
          const terminals = normalizedNodes
            .filter((n: any) => !sources.has(n.id))
            .filter((n: any) => !isTrigger(n))
            .filter((n: any) => !isTerminalNode(n));

          if (terminals.length > 0) {
          const hasFailureTerminal = terminals.some((n: any) => getType(n) === 'stop_and_error');
          const hasSuccessTerminal = terminals.some((n: any) => getType(n) !== 'stop_and_error');

          // If we have both success and failure terminals, split log_output into two with different messages.
          let successLog = existingLog;
          let failureLog = existingLog;
          if (hasFailureTerminal && hasSuccessTerminal) {
            // Remove existing log node entirely (we'll replace with 2 nodes)
            normalizedNodes = normalizedNodes.filter((n: any) => n.id !== existingLog.id);
            normalizedEdges = normalizedEdges.filter((e: any) => e.source !== existingLog.id && e.target !== existingLog.id);

            const basePos = existingLog.position || { x: 0, y: 0 };
            const baseData = existingLog.data || {};
            const existingType = existingLog.type || getType(existingLog);
            const mkLog = (suffix: string, label: string, message: string, yOffset: number) => ({
              id: `${existingLog.id}_${suffix}_${Date.now()}`,
              type: existingType,
              position: { x: basePos.x, y: basePos.y + yOffset },
              data: {
                ...baseData,
                label,
                type: existingType,
                config: {
                  ...(baseData.config || {}),
                  level: 'info',
                  message,
                },
              },
            });

            successLog = mkLog('success', 'Log Output (Success)', '✅ Success path completed.', -80);
            failureLog = mkLog('failure', 'Log Output (Failure)', '❌ Failure path completed (workflow stopped).', 80);
            normalizedNodes.push(successLog, failureLog);
          }

          const existingPairs = new Set(normalizedEdges.map((e: any) => `${e.source}::${e.target}::${e.sourceHandle || ''}::${e.targetHandle || ''}`));
          terminals.forEach((tNode: any, idx: number) => {
            const terminalType = getType(tNode);
            const targetLog = terminalType === 'stop_and_error' ? failureLog : successLog;

            const sourceType = terminalType;
            const targetType = getType(targetLog);

            const desiredSourceHandle = getDefaultSourceHandle(sourceType);
            const desiredTargetHandle = getDefaultTargetHandle(targetType);
            const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
              sourceType,
              targetType,
              desiredSourceHandle,
              desiredTargetHandle
            );

            const key = `${tNode.id}::${targetLog.id}::${sourceHandle || ''}::${targetHandle || ''}`;
            if (existingPairs.has(key)) return;

            normalizedEdges.push({
              id: `edge_log_${idx}_${Date.now()}`,
              source: tNode.id,
              target: targetLog.id,
              sourceHandle,
              targetHandle,
              type: 'default',
            });
            existingPairs.add(key);
          });
          }
        }
      }
    } catch (e) {
      logger.warn('[NormalizeWorkflowGraph] log_output placement fix failed (non-fatal):', e);
    }

    // ✅ LINEARIZATION: Enforce single-trigger, single-chain default graph
    // This is a safety net on top of AI generation rules. It rewrites simple
    // non-branching workflows into a strict linear chain:
    //   trigger → node1 → node2 → ... → lastNode
    //
    // Rules:
    // - Exactly one trigger node is kept (uses same detection as validation)
    // - All other triggers are REMOVED (not just ordered)
    // - All non-trigger nodes are ordered by existing edges if possible
    // - We then rebuild edges as a single chain
    try {
      // ✅ CRITICAL: Use same trigger detection logic as validation
      // Inline isTriggerNode logic to match validation exactly
      const isTriggerNode = (node: any): boolean => {
        const nodeType = node.data?.type || node.type || '';
        const category = node.data?.category || '';
        
        // PRIMARY: Check if node is in "triggers" category
        if (category.toLowerCase() === 'triggers' || category.toLowerCase() === 'trigger') {
          return true;
        }
        
        // SECONDARY: Check if type includes 'trigger'
        if (nodeType.includes('trigger')) {
          return true;
        }
        
        // TERTIARY: Check known trigger types
        const knownTriggerTypes = [
          'manual_trigger', 'webhook', 'schedule', 'chat_trigger', 'form_trigger',
          'form', 'workflow_trigger', 'error_trigger', 'interval',
          'gmail_trigger', 'slack_trigger', 'discord_trigger',
        ];
        
        return knownTriggerTypes.includes(nodeType);
      };
      
      const triggerNodes = normalizedNodes.filter((n: any) => isTriggerNode(n));

      if (triggerNodes.length > 0) {
        // ✅ FIXED: Use first trigger for linearization, but do NOT remove others
        // Post-normalization trigger cleanup removed - triggers should be checked before creation
        const primaryTrigger = triggerNodes[0];
        
        // ✅ FIXED: Warn if multiple triggers found (should not happen if graph builder checks correctly)
        if (triggerNodes.length > 1) {
          logger.warn(`[NormalizeWorkflowGraph] ⚠️ Multiple triggers found (${triggerNodes.length}), using first: ${primaryTrigger.id}. This should not happen - graph builder should check before creating triggers.`);
        }
        
        // Only non-trigger nodes are linearized after the single primary trigger.
        const nonTriggerNodes = normalizedNodes.filter((n: any) => !isTriggerNode(n));

        // Build adjacency from existing edges to infer ordering
        const outgoingMap = new Map<string, string[]>();
        const incomingCount = new Map<string, number>();

        for (const edge of normalizedEdges) {
          if (!edge.source || !edge.target) continue;
          if (!outgoingMap.has(edge.source)) {
            outgoingMap.set(edge.source, []);
          }
          outgoingMap.get(edge.source)!.push(edge.target);
          incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
        }

        // Simple linearization: start from trigger and follow single outgoing
        const ordered: any[] = [primaryTrigger];
        const visited = new Set<string>([primaryTrigger.id]);
        let currentId = primaryTrigger.id;

        while (true) {
          const outs = outgoingMap.get(currentId) || [];
          const nextId = outs.find(id => !visited.has(id));
          if (!nextId) break;
          const nextNode = normalizedNodes.find(n => n.id === nextId);
          if (!nextNode) break;
          ordered.push(nextNode);
          visited.add(nextId);
          currentId = nextId;
        }

        // Append any remaining nodes that weren't reachable (including other triggers if any)
        for (const node of nonTriggerNodes) {
          if (!visited.has(node.id)) {
            // ✅ FIXED: Include all nodes, even if they're triggers (don't filter out)
            ordered.push(node);
            visited.add(node.id);
          }
        }

        // ✅ REGISTRY-DRIVEN: Preserve branching structures (any isBranching node)
        // DO NOT linearize graphs with branching nodes - they have multiple outputs
        const hasBranchingNodes = ordered.some((n: any) => {
          const nodeType = n.data?.type || n.type || '';
          const def = unifiedNodeRegistry.get(nodeType);
          return def?.isBranching === true;
        });
        const hasBranchingHandles = normalizedEdges.some((e: any) =>
          typeof e?.sourceHandle === 'string' &&
          (e.sourceHandle === 'true' || e.sourceHandle === 'false' || e.sourceHandle.startsWith('case_'))
        );
        
        if (hasBranchingNodes || hasBranchingHandles) {
          // ✅ PRESERVE ALL EDGES from branching nodes - do not linearize
          const validNodeIds = new Set(ordered.map((n: any) => n.id));
          const preservedEdges = normalizedEdges.filter((e: any) => 
            validNodeIds.has(e.source) && validNodeIds.has(e.target)
          );
          
          logger.debug(`[NormalizeWorkflowGraph] 🔀 Preserving branching structure - keeping ${preservedEdges.length} edge(s) (skipping linearization)`);
          
          return {
            nodes: ordered,
            edges: preservedEdges,
            metadata: {
              version: parsed.metadata?.version || '1.0',
              createdAt: parsed.metadata?.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          };
        }
        
        // ✅ LINEARIZATION: Only for simple sequential chains (no branching)
        // ✅ FIXED: Do not remove edges referencing triggers - all nodes are kept
        const validNodeIds = new Set(ordered.map((n: any) => n.id));
        const linearEdges: any[] = [];
        
        // Filter edges to only include valid nodes (but don't remove trigger edges)
        const validEdges = normalizedEdges.filter((e: any) => 
          validNodeIds.has(e.source) && validNodeIds.has(e.target)
        );
        
        // Build linear chain edges
        for (let i = 0; i < ordered.length - 1; i++) {
          const source = ordered[i];
          const target = ordered[i + 1];
          
          // ✅ CRITICAL FIX: Check ALL edges from source (not just first match)
          // This preserves multiple edges from the same source if they exist
          const existingEdges = validEdges.filter((e: any) => 
            e.source === source.id && e.target === target.id
          );
          
          if (existingEdges.length > 0) {
            // Keep ALL existing edges (preserves branching if somehow present)
            linearEdges.push(...existingEdges);
          } else {
            // Create new linear edge with validated handles
            const sourceType = source.data?.type || source.type || 'default';
            const targetType = target.data?.type || target.type || 'default';
            
            const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
              sourceType,
              targetType,
              undefined,
              undefined
            );
            
            linearEdges.push({
              id: `edge_linear_${source.id}_${target.id}`,
              source: source.id,
              target: target.id,
              sourceHandle,
              targetHandle,
              type: 'default',
            });
          }
        }
        
        // ✅ CRITICAL FIX: Also preserve any edges that don't fit the linear chain
        // This catches edges from branching nodes that weren't in the ordered sequence
        const linearEdgeKeys = new Set(linearEdges.map((e: any) => `${e.source}::${e.target}::${e.sourceHandle || ''}::${e.targetHandle || ''}`));
        const additionalEdges = validEdges.filter((e: any) => {
          const key = `${e.source}::${e.target}::${e.sourceHandle || ''}::${e.targetHandle || ''}`;
          return !linearEdgeKeys.has(key);
        });
        
        if (additionalEdges.length > 0) {
          logger.debug(`[NormalizeWorkflowGraph] 🔀 Preserving ${additionalEdges.length} additional edge(s) that don't fit linear chain`);
          linearEdges.push(...additionalEdges);
        }
        
        // ✅ FIXED: Removed post-normalization trigger cleanup logging
        // Edges are filtered for valid nodes only, but triggers are not removed

        return {
          nodes: ordered,
          edges: linearEdges,
          metadata: {
            version: parsed.metadata?.version || '1.0',
            createdAt: parsed.metadata?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      // Fallback: no trigger detected, return graph as‑is
      return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
        metadata: {
          version: parsed.metadata?.version || '1.0',
          createdAt: parsed.metadata?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (linearError) {
      logger.warn('[NormalizeWorkflowGraph] Linearization failed, using original graph:', linearError);
      return {
        nodes: normalizedNodes,
        edges: normalizedEdges,
        metadata: {
          version: parsed.metadata?.version || '1.0',
          createdAt: parsed.metadata?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    throw new Error(`Workflow graph normalization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate normalized workflow graph
 */
export function validateNormalizedGraph(graph: NormalizedWorkflowGraph): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    errors.push('Workflow graph missing nodes array');
  }

  if (!graph.edges || !Array.isArray(graph.edges)) {
    errors.push('Workflow graph missing edges array');
  }

  if (graph.nodes.length === 0) {
    warnings.push('Workflow graph has no nodes');
  }

  // Validate node IDs are unique
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Validate edge references
  const validNodeIds = new Set(graph.nodes.map(n => n.id));
  for (const edge of graph.edges) {
    if (edge.source && !validNodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (edge.target && !validNodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
