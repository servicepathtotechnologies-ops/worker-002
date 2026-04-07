  /**
 * ✅ EDGE RECONCILIATION ENGINE
 * 
 * Automatically reconciles edges after ANY graph modification (node injection, removal, etc.).
 * 
 * Key Features:
 * 1. Automatic Reconciliation: Runs after every node injection/removal
 * 2. Execution Order Driven: Uses execution order as source of truth for edge creation
 * 3. Broken Edge Removal: Removes edges that violate execution order
 * 4. Correct Edge Creation: Creates edges that match execution order
 * 5. Registry-Driven: Uses unifiedNodeRegistry for handle resolution, branching rules
 * 
 * This ensures edges ALWAYS match execution order - no broken connections possible.
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';
import { ExecutionOrder, executionOrderManager } from './execution-order-manager';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import { universalHandleResolver } from '../error-prevention';
import { universalEdgeCreationService } from '../../services/edges/universal-edge-creation-service';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';
import { hasPrimaryDataRole, isOutputNode } from '../utils/universal-node-type-checker';
import { randomUUID } from 'crypto';

export interface EdgeReconciliationResult {
  workflow: Workflow;
  edgesRemoved: number;
  edgesAdded: number;
  errors: string[];
  warnings: string[];
  removedNodeTypes: string[]; // ✅ NEW: Track node types that were auto-removed as orphaned
}

export interface EdgeValidationResult {
  edgesToRemove: WorkflowEdge[];
  edgesToAdd: Array<{ sourceId: string; targetId: string; edgeType?: string; sourceHandle?: string; targetHandle?: string }>;
  violations: string[];
}

export interface EdgeReconciliationEngine {
  /**
   * Reconcile edges based on execution order
   * - Removes edges that don't match execution order
   * - Creates edges that match execution order
   * - Uses registry for handle resolution
   * ✅ PHASE 4: Accept tagsFromVariation to preserve nodes in tags
   */
  reconcileEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder,
    tagsFromVariation?: string[]
  ): EdgeReconciliationResult;
  
  /**
   * Validate edges against execution order
   * Returns edges that should be removed/added
   */
  validateEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeValidationResult;
}

class EdgeReconciliationEngineImpl implements EdgeReconciliationEngine {
  private getNodeType(node: WorkflowNode): string {
    return unifiedNormalizeNodeType(node);
  }
  /**
   * Reconcile edges based on execution order
   * ✅ PHASE 4: Accept tagsFromVariation to preserve nodes in tags
   */
  reconcileEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder,
    tagsFromVariation?: string[]
  ): EdgeReconciliationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Step 1: Validate edges against execution order
    const validation = this.validateEdges(workflow, executionOrder);
    
    // Step 2: Remove invalid edges
    const edgesToKeep = workflow.edges.filter(
      edge => !validation.edgesToRemove.some(e => e.id === edge.id)
    );
    
    // Step 3: Create missing edges based on execution order
    const edgesToAdd: WorkflowEdge[] = [];
    const workingEdges: WorkflowEdge[] = [...edgesToKeep];
    const edgeIdsToDrop = new Set<string>();
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    
    // Create edges for linear chain: node[i] → node[i+1]
    for (let i = 0; i < orderedNodeIds.length - 1; i++) {
      const sourceId = orderedNodeIds[i];
      const targetId = orderedNodeIds[i + 1];

      const sourceNodeForLinear = workflow.nodes.find(n => n.id === sourceId);
      if (sourceNodeForLinear) {
        const linearSourceType = unifiedNormalizeNodeTypeString(
          sourceNodeForLinear.type || sourceNodeForLinear.data?.type || ''
        );
        // Branching nodes (if_else, switch, …): do not create a single "next hop" edge here —
        // Step 4 assigns explicit branch ports (true/false/case_*). A linear edge would duplicate
        // branch edges and collide on source→target.
        if (unifiedNodeRegistry.get(linearSourceType)?.isBranching === true) {
          continue;
        }
      }

      const targetNodeForLinear = workflow.nodes.find((n) => n.id === targetId);
      if (sourceNodeForLinear && targetNodeForLinear) {
        // Throughput outputs (Gmail, Slack send, etc.) must accept linear edges from data/transform predecessors.
        // Only terminal sinks (alwaysTerminal / terminal tag) skip here — Step 7 wires log_output branch-aware.
        const targetLinearType = unifiedNormalizeNodeTypeString(
          targetNodeForLinear.type || targetNodeForLinear.data?.type || '',
        );
        const sourceLinearType = unifiedNormalizeNodeTypeString(
          sourceNodeForLinear.type || sourceNodeForLinear.data?.type || '',
        );
        // log_output: inbound wiring is Step 7 (branch-aware); never linear backbone in/out of log terminals
        if (targetLinearType === 'log_output' || sourceLinearType === 'log_output') {
          continue;
        }
        const targetLinearDef = unifiedNodeRegistry.get(targetLinearType);
        if (
          targetLinearDef?.workflowBehavior?.alwaysTerminal === true ||
          (targetLinearDef?.tags || []).includes('terminal')
        ) {
          continue;
        }
      }

      // Branch-aware: do not chain consecutive execution-order pairs that live in different
      // exclusive fork regions (e.g. Gmail true-branch → Slack false-branch).
      // 1) Graph-based (after branch edges exist). 2) Order-based — Step 3 runs *before* Step 4
      // fan-out, so we mirror Step 4's port→target assignment using execution order + registry ports.
      if (sourceNodeForLinear && targetNodeForLinear) {
        if (
          this.areExclusiveForkDescendantsInDifferentRegions(
            workflow.nodes,
            edgesToKeep,
            sourceId,
            targetId
          ) ||
          this.areConsecutivePairExclusiveBranchHeadsByOrder(
            workflow.nodes,
            orderedNodeIds,
            sourceId,
            targetId,
            workingEdges
          )
        ) {
          continue;
        }
      }
      
      // Check if edge already exists
      const edgeExists = workingEdges.some(
        e => e.source === sourceId && e.target === targetId
      );
      
      if (!edgeExists) {
        // Create edge using registry-driven logic
          const edge = this.createEdgeFromOrder(
          workflow,
          sourceId,
          targetId,
            executionOrder,
            undefined,
            workingEdges
        );
        
        if (edge) {
          edgesToAdd.push(edge);
          workingEdges.push(edge);
        } else {
          warnings.push(
            `Could not create edge from ${sourceId} to ${targetId} - handle resolution failed`
          );
        }
      }
    }
    
    // Step 4: Handle branching nodes (if_else, switch) - they can have multiple outputs
    const branchingNodes = workflow.nodes.filter(n => {
      const nodeType = this.getNodeType(n);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.isBranching === true;
    });
    
    for (const branchingNode of branchingNodes) {
      const nodeIndex = orderedNodeIds.indexOf(branchingNode.id);
      if (nodeIndex < 0) continue;
      
      // Find nodes that should connect from this branching node
      const potentialTargets = orderedNodeIds.slice(nodeIndex + 1);
      
      // Use registry + persisted node config for branch ports (switch cases live in config)
      const outgoingPorts = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(branchingNode);
      
      // Registry-driven branch fanout: map each outgoing branch port to a unique
      // downstream target in execution order when an explicit edge for that port
      // does not already exist.
      if (outgoingPorts.length > 1 && potentialTargets.length > 0) {
        const usedTargets = new Set<string>(
          workingEdges
            .filter(e => e.source === branchingNode.id)
            .map(e => e.target),
        );

        const branchPorts = outgoingPorts.filter(p => p !== 'output');
        branchPorts.forEach((portName, index) => {
          const edgeForPortExists =
            workingEdges.some(
              e =>
                e.source === branchingNode.id &&
                (e.type === portName || e.sourceHandle === portName)
            );
          if (edgeForPortExists) return;

          const targetCandidate = potentialTargets.find(t => !usedTargets.has(t));
          // Task 4.4: guard branch exhaustion — emit hard error instead of silently skipping
          if (!targetCandidate) {
            errors.push(
              `Switch/If node ${branchingNode.id}: no distinct target available for branch port ${portName} — the planner may have emitted too few nodes for this branch`
            );
            return;
          }

          const newEdge = this.createEdgeFromOrder(
            workflow,
            branchingNode.id,
            targetCandidate,
            executionOrder,
            portName,
            workingEdges
          );
          if (newEdge) {
            edgesToAdd.push(newEdge);
            workingEdges.push(newEdge);
            usedTargets.add(targetCandidate);
          } else {
            // Fallback for branch completeness: keep port topology complete even when
            // handle inference fails for a branch edge.
            edgesToAdd.push({
              id: `edge_${randomUUID()}`,
              source: branchingNode.id,
              target: targetCandidate,
              type: portName,
              sourceHandle: portName,
              targetHandle: 'input',
            });
            workingEdges.push(edgesToAdd[edgesToAdd.length - 1]);
            usedTargets.add(targetCandidate);
          }
        });

        // Task 4.3: assert no two branch edges from this node share the same target
        const outgoingBranchEdges = workingEdges.filter(e => e.source === branchingNode.id);
        const branchTargets = outgoingBranchEdges.map(e => e.target);
        const uniqueBranchTargets = new Set(branchTargets);
        if (uniqueBranchTargets.size < branchTargets.length) {
          // Find which targets are shared
          const seen = new Set<string>();
          for (const target of branchTargets) {
            if (seen.has(target)) {
              errors.push(
                `Switch/If node ${branchingNode.id}: branch ports share the same target node ${target} — each branch must have a distinct target node`
              );
              break;
            }
            seen.add(target);
          }
        }
      }
    }
    
    // Step 5: Handle merge nodes - they can have multiple inputs
    const mergeNodes = workflow.nodes.filter(n => {
      const nodeType = this.getNodeType(n);
      return nodeType === 'merge' || (unifiedNodeRegistry.get(nodeType)?.tags || []).includes('merge');
    });
    
    for (const mergeNode of mergeNodes) {
      const mergeIndex = orderedNodeIds.indexOf(mergeNode.id);
      if (mergeIndex < 0) continue;
      
      // Find nodes that should connect to merge (nodes before merge in order)
      const potentialSources = orderedNodeIds.slice(0, mergeIndex);
      
      for (const sourceId of potentialSources) {
        const sourceNode = workflow.nodes.find(n => n.id === sourceId);
        if (!sourceNode) continue;
        
        // Check if edge should exist (registry-based)
        if (this.shouldHaveEdge(sourceNode, mergeNode)) {
          const edgeExists = workingEdges.some(
            e => e.source === sourceId && e.target === mergeNode.id
          );
          
          if (!edgeExists) {
            const edge = this.createEdgeFromOrder(
              workflow,
              sourceId,
              mergeNode.id,
              executionOrder,
              undefined,
              workingEdges
            );
            if (edge) {
              edgesToAdd.push(edge);
              workingEdges.push(edge);
            }
          }
        }
      }
    }
    
    // ✅ STEP 6: Ensure ALL output nodes (HubSpot, Gmail, CRM, Communication, etc.) are connected from last transformation node
    // ✅ UNIVERSAL FIX: Use isOutputNode() function instead of hardcoded list
    // This ensures ANY node that acts as an output is properly connected, regardless of type
    // Branch outputs (e.g. if_else → slack on false) already have hasIncoming — skip to avoid cross-branch wiring.
    const outputNodes = workflow.nodes.filter(n => {
      return isOutputNode(n);
    });
    
    for (const outputNode of outputNodes) {
      const outputNodeType = this.getNodeType(outputNode);

      // ✅ log_output terminals are handled exclusively by Step 7 (branch-aware predecessor logic).
      // Step 6 must NOT wire log_output nodes — it has no branch awareness and would connect
      // both branch terminals to the same predecessor (the last output node in execution order).
      if (outputNodeType === 'log_output') continue;

      const outputIndex = orderedNodeIds.indexOf(outputNode.id);
      if (outputIndex < 0) continue;
      
      // Check if output node already has incoming edges (include edges queued earlier this pass)
      const hasIncoming = workingEdges.some(e => e.target === outputNode.id);
      if (hasIncoming) continue; // Already connected (includes branch edges from if_else / switch)
      
      // Find the last transformation node before this output node
      let lastTransformationNodeId: string | null = null;
      for (let i = outputIndex - 1; i >= 0; i--) {
        const candidateId = orderedNodeIds[i];
        const candidateNode = workflow.nodes.find(n => n.id === candidateId);
        if (!candidateNode) continue;
        
        const candidateType = this.getNodeType(candidateNode);
        const candidateDef = unifiedNodeRegistry.get(candidateType);
        
        // Skip trigger nodes
        if (candidateDef?.category === 'trigger') continue;

        // Skip pure output nodes, but NOT primary data nodes (e.g. google_sheets has output capability)
        if (isOutputNode(candidateNode) && !hasPrimaryDataRole(candidateNode)) continue;
        
        // Found a valid predecessor - connect from here
        lastTransformationNodeId = candidateId;
        break;
      }
      
      if (lastTransformationNodeId) {
        const edgeExists = workingEdges.some(
          e => e.source === lastTransformationNodeId && e.target === outputNode.id
        );
        
        if (!edgeExists) {
          const edge = this.createEdgeFromOrder(
            workflow,
            lastTransformationNodeId,
            outputNode.id,
            executionOrder,
            undefined,
            workingEdges
          );
          if (edge) {
            edgesToAdd.push(edge);
            workingEdges.push(edge);
            console.log(
              `[EdgeReconciliationEngine] ✅ Connected output node: ${this.getNodeType(outputNode)} (${outputNode.id.substring(0, 8)}) from last transformation node`
            );
          }
        }
      }
      // Linear fallback: if no transform/data predecessor exists, connect trigger -> first output.
      if (!lastTransformationNodeId) {
        const triggerNodeId = orderedNodeIds.find((id) => {
          const n = workflow.nodes.find((x) => x.id === id);
          if (!n) return false;
          const nt = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
          return unifiedNodeRegistry.get(nt)?.category === 'trigger';
        });
        const targetHasIncoming = workingEdges.some((e) => e.target === outputNode.id);
        if (triggerNodeId && !targetHasIncoming) {
          const edge = this.createEdgeFromOrder(
            workflow,
            triggerNodeId,
            outputNode.id,
            executionOrder,
            undefined,
            workingEdges
          );
          if (edge) {
            edgesToAdd.push(edge);
            workingEdges.push(edge);
            console.log(
              `[EdgeReconciliationEngine] ✅ Linear fallback connected trigger -> output: ${triggerNodeId.substring(0, 8)} -> ${outputNode.id.substring(0, 8)}`
            );
          }
        }
      }
    }
    
    // ✅ STEP 7: Ensure ALL output nodes (including log_output) are properly connected
    // ✅ UNIVERSAL FIX: Check for ALL output nodes using isOutputNode(), not just log_output
    // This ensures any output node (CRM, email, log_output, etc.) is connected properly
    const allOutputNodes = workflow.nodes.filter(n => {
      return isOutputNode(n);
    });
    
    const logOutputNodes = allOutputNodes.filter(n => {
      const nodeType = this.getNodeType(n);
      return nodeType === 'log_output';
    });
    
    console.log(
      `[EdgeReconciliationEngine] 🔍 DEBUG STEP 7: Found ${allOutputNodes.length} output node(s) (${logOutputNodes.length} log_output), ` +
      `execution order has ${orderedNodeIds.length} nodes: [${orderedNodeIds.map(id => {
        const node = workflow.nodes.find(n => n.id === id);
        const type = node ? this.getNodeType(node) : 'unknown';
        return `${type}(${id.substring(0, 8)})`;
      }).join(' → ')}]`
    );
    
    // Process log_output nodes in execution order (stable wiring for multi-branch terminals)
    const logOutputNodesSorted = [...logOutputNodes].sort(
      (a, b) => orderedNodeIds.indexOf(a.id) - orderedNodeIds.indexOf(b.id)
    );
    const usedTerminalPredecessors = new Set<string>();

    for (const logOutputNode of logOutputNodesSorted) {
      const logOutputIndex = orderedNodeIds.indexOf(logOutputNode.id);
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG log_output(${logOutputNode.id.substring(0, 8)}): ` +
        `index=${logOutputIndex}, ` +
        `totalNodes=${orderedNodeIds.length}`
      );
      
      if (logOutputIndex < 0) {
        console.warn(`[EdgeReconciliationEngine] ⚠️  log_output node ${logOutputNode.id} not found in execution order`);
        continue;
      }
      
      const structuralSnapshot = [...workingEdges];
      // Branch-aware predecessor: avoids wiring the wrong branch's communication node into a sibling log
      let lastNonTerminalNodeId = this.pickBranchAwarePredecessorForLogOutput(
        workflow,
        orderedNodeIds,
        structuralSnapshot,
        logOutputNode.id,
        logOutputIndex,
        {
          usedPredecessorIds: usedTerminalPredecessors,
          disableLegacyFallback: true,
        }
      );

      if (lastNonTerminalNodeId) {
        console.log(
          `[EdgeReconciliationEngine] ✅ Branch-aware predecessor for log_output(${logOutputNode.id.substring(0, 8)}): ` +
            `${lastNonTerminalNodeId.substring(0, 8)}`
        );
      }
      
      if (lastNonTerminalNodeId) {
        const sourceNode = workflow.nodes.find(n => n.id === lastNonTerminalNodeId);
        const sourceType = sourceNode ? this.getNodeType(sourceNode) : 'unknown';
        
        // Check if edge already exists
        const edgeExists = workingEdges.some(
          e => e.source === lastNonTerminalNodeId && e.target === logOutputNode.id
        );
        
        console.log(
          `[EdgeReconciliationEngine] 🔍 DEBUG Edge check: ` +
          `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)}): ` +
          `exists=${edgeExists}`
        );
        const structuralEdgesSnapshot = [...workingEdges];
        const existingIncoming = structuralEdgesSnapshot.filter(e => e.target === logOutputNode.id);

        const hasLineageValidIncoming = existingIncoming.some((inc) => {
          if (inc.source === lastNonTerminalNodeId) return true;
          const incomingSourceNode = workflow.nodes.find((n) => n.id === inc.source);
          if (!incomingSourceNode) return false;
          const incomingSourceType = this.getNodeType(incomingSourceNode);
          const incomingSourceDef = unifiedNodeRegistry.get(incomingSourceType);
          // Merge nodes are explicit branch reconvergence points and are valid
          // terminal predecessors even if lineage picker chooses a branch head.
          return (incomingSourceDef?.tags || []).includes('merge') || incomingSourceType === 'merge';
        });

        if (existingIncoming.length > 0 && hasLineageValidIncoming) {
          usedTerminalPredecessors.add(lastNonTerminalNodeId);
          console.log(
            `[EdgeReconciliationEngine] 🔍 Skip log_output wiring: lineage-valid incoming already exists ` +
              `(${lastNonTerminalNodeId.substring(0, 8)} -> ${logOutputNode.id.substring(0, 8)})`
          );
        } else if (!edgeExists) {
          if (existingIncoming.length > 0 && !hasLineageValidIncoming) {
            for (const staleEdge of existingIncoming) {
              edgeIdsToDrop.add(staleEdge.id);
              const idx = workingEdges.findIndex((e) => e.id === staleEdge.id);
              if (idx >= 0) workingEdges.splice(idx, 1);
            }
            console.warn(
              `[EdgeReconciliationEngine] ⚠️  Rewiring stale incoming edges for log_output(${logOutputNode.id.substring(0, 8)}): ` +
                `${existingIncoming.map((e) => e.source.substring(0, 8)).join(', ')}`
            );
          }

          const wouldCrossForkFanIn = existingIncoming.some(inc =>
            this.areExclusiveForkDescendantsInDifferentRegions(
              workflow.nodes,
              structuralEdgesSnapshot,
              lastNonTerminalNodeId,
              inc.source
            )
          );
          const crossExclusiveFork =
            this.areExclusiveForkDescendantsInDifferentRegions(
              workflow.nodes,
              structuralEdgesSnapshot,
              lastNonTerminalNodeId,
              logOutputNode.id
            ) ||
            this.areConsecutivePairExclusiveBranchHeadsByOrder(
              workflow.nodes,
              orderedNodeIds,
              lastNonTerminalNodeId,
              logOutputNode.id,
              structuralEdgesSnapshot
            );
          if (wouldCrossForkFanIn) {
            console.log(
              `[EdgeReconciliationEngine] 🔍 Skip log_output wiring: cross-fork fan-in avoided ` +
                `(would add ${lastNonTerminalNodeId.substring(0, 8)} but log already has edge(s) from ` +
                `${existingIncoming.map(e => e.source.substring(0, 8)).join(', ')})`
            );
          } else if (crossExclusiveFork) {
            console.log(
              `[EdgeReconciliationEngine] 🔍 Skip log_output wiring: exclusive fork regions ` +
                `(${lastNonTerminalNodeId.substring(0, 8)} → ${logOutputNode.id.substring(0, 8)})`
            );
          } else {
            // Create edge from last non-terminal node to log_output
            console.log(
              `[EdgeReconciliationEngine] 🔍 DEBUG Attempting to create edge: ` +
                `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)})`
            );

            const edge = this.createEdgeFromOrder(
              workflow,
              lastNonTerminalNodeId,
              logOutputNode.id,
              executionOrder,
              undefined,
              workingEdges
            );

            if (edge) {
              edgesToAdd.push(edge);
              workingEdges.push(edge);
              usedTerminalPredecessors.add(lastNonTerminalNodeId);
              console.log(
                `[EdgeReconciliationEngine] ✅ Connected last non-terminal node (${lastNonTerminalNodeId}) → log_output (${logOutputNode.id})`
              );
            } else {
              // If source already points to a different log_output, treat that as stale lineage wiring
              // and retry once for the lineage-selected terminal.
              const staleOutgoingToOtherLog = workingEdges.find((e) => {
                if (e.source !== lastNonTerminalNodeId || e.target === logOutputNode.id) return false;
                const tNode = workflow.nodes.find((n) => n.id === e.target);
                return !!tNode && this.getNodeType(tNode) === 'log_output';
              });
              if (staleOutgoingToOtherLog) {
                edgeIdsToDrop.add(staleOutgoingToOtherLog.id);
                const staleIdx = workingEdges.findIndex((e) => e.id === staleOutgoingToOtherLog.id);
                if (staleIdx >= 0) workingEdges.splice(staleIdx, 1);
                console.warn(
                  `[EdgeReconciliationEngine] ⚠️  Rewiring stale outgoing log edge from ${lastNonTerminalNodeId.substring(0, 8)}: ` +
                    `${staleOutgoingToOtherLog.target.substring(0, 8)} → ${logOutputNode.id.substring(0, 8)}`
                );
                const retriedEdge = this.createEdgeFromOrder(
                  workflow,
                  lastNonTerminalNodeId,
                  logOutputNode.id,
                  executionOrder,
                  undefined,
                  workingEdges
                );
                if (retriedEdge) {
                  edgesToAdd.push(retriedEdge);
                  workingEdges.push(retriedEdge);
                  usedTerminalPredecessors.add(lastNonTerminalNodeId);
                  console.log(
                    `[EdgeReconciliationEngine] ✅ Rewired terminal edge: ${lastNonTerminalNodeId.substring(0, 8)} → ${logOutputNode.id.substring(0, 8)}`
                  );
                  continue;
                }
              }
              // Linear Step 3 can chain sibling branch heads (e.g. slack → gmail) when hypothetical
              // ports were empty; universal edge service then blocks slack → log. Drop that spine.
              const staleCrossBranchSpine = workingEdges.find((e) => {
                if (e.source !== lastNonTerminalNodeId || e.target === logOutputNode.id) return false;
                const tNode = workflow.nodes.find((n) => n.id === e.target);
                if (!tNode) return false;
                if (this.getNodeType(tNode) === 'log_output') return false;
                return this.areConsecutivePairExclusiveBranchHeadsByOrder(
                  workflow.nodes,
                  orderedNodeIds,
                  lastNonTerminalNodeId,
                  e.target,
                  structuralEdgesSnapshot
                );
              });
              if (staleCrossBranchSpine) {
                edgeIdsToDrop.add(staleCrossBranchSpine.id);
                const spineIdx = workingEdges.findIndex((e) => e.id === staleCrossBranchSpine.id);
                if (spineIdx >= 0) workingEdges.splice(spineIdx, 1);
                console.warn(
                  `[EdgeReconciliationEngine] ⚠️  Removed erroneous cross-branch spine ${lastNonTerminalNodeId.substring(0, 8)} → ` +
                    `${staleCrossBranchSpine.target.substring(0, 8)} (sibling branch heads cannot linearly chain)`
                );
                const retriedSpine = this.createEdgeFromOrder(
                  workflow,
                  lastNonTerminalNodeId,
                  logOutputNode.id,
                  executionOrder,
                  undefined,
                  workingEdges
                );
                if (retriedSpine) {
                  edgesToAdd.push(retriedSpine);
                  workingEdges.push(retriedSpine);
                  usedTerminalPredecessors.add(lastNonTerminalNodeId);
                  console.log(
                    `[EdgeReconciliationEngine] ✅ Rewired after spine removal: ${lastNonTerminalNodeId.substring(0, 8)} → ` +
                      `${logOutputNode.id.substring(0, 8)}`
                  );
                  continue;
                }
              }
              const sourceNodeDef = unifiedNodeRegistry.get(sourceType);
              const logOutputNodeDef = unifiedNodeRegistry.get('log_output');
              console.error(
                `[EdgeReconciliationEngine] ❌ FAILED to create edge: ` +
                  `${sourceType}(${lastNonTerminalNodeId.substring(0, 8)}) → log_output(${logOutputNode.id.substring(0, 8)})\n` +
                  `  Source node: type=${sourceType}, outgoingPorts=[${(sourceNodeDef?.outgoingPorts || []).join(', ')}], ` +
                  `incomingPorts=[${(sourceNodeDef?.incomingPorts || []).join(', ')}]\n` +
                  `  Target node: type=log_output, outgoingPorts=[${(logOutputNodeDef?.outgoingPorts || []).join(', ')}], ` +
                  `incomingPorts=[${(logOutputNodeDef?.incomingPorts || []).join(', ')}]`
              );
              warnings.push(
                `Could not create edge from ${lastNonTerminalNodeId} to log_output (${logOutputNode.id}) - handle resolution failed`
              );
            }
          }
        } else {
          console.log(`[EdgeReconciliationEngine] 🔍 DEBUG Edge already exists, skipping creation`);
        }
      } else {
        console.warn(
          `[EdgeReconciliationEngine] ⚠️  No node found to connect to log_output(${logOutputNode.id.substring(0, 8)}) - ` +
          `logOutputIndex=${logOutputIndex}, orderedNodeIds.length=${orderedNodeIds.length}, lineageAware=true`
        );
      }
    }
    
    // Combine all edges
    let workingNodes = [...workflow.nodes];
    let finalEdges = [...edgesToKeep.filter((e) => !edgeIdsToDrop.has(e.id)), ...edgesToAdd];

    // ✅ STEP 7b: log_output is a single-input terminal — multiple incoming edges (e.g. if_else false
    // + sequential gmail → same log) violate that contract. Split into one log_output per incoming edge.
    const splitResult = this.splitMultiInputLogOutputs(workingNodes, finalEdges);
    workingNodes = splitResult.nodes;
    finalEdges = splitResult.edges;
    if (splitResult.splitCount > 0) {
      warnings.push(
        `Split ${splitResult.splitCount} multi-input log_output node(s) into separate terminals (one edge each).`
      );
    }
    
    // ✅ STEP 8: Auto-remove orphaned nodes that are not required
    // This implements the user's insight: orphaned nodes = unnecessary nodes = should be removed
    // ✅ PHASE 4: Pass tagsFromVariation to preserve nodes in tags
    const { nodes: finalNodes, nodesRemoved, removedNodeTypes } = this.removeUnrequiredOrphanedNodes(
      { ...workflow, nodes: workingNodes },
      finalEdges,
      orderedNodeIds,
      tagsFromVariation
    );
    
    // Remove edges connected to removed nodes
    const nodeIdsSet = new Set(finalNodes.map(n => n.id));
    const finalEdgesFiltered = finalEdges.filter(
      (e: WorkflowEdge) => nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target)
    );
    
    if (nodesRemoved > 0) {
      warnings.push(
        `Auto-removed ${nodesRemoved} orphaned node(s) that were not required (not connected to workflow): ${removedNodeTypes.join(', ')}`
      );
    }
    
    return {
      workflow: {
        ...workflow,
        nodes: finalNodes,
        edges: finalEdgesFiltered,
      },
      edgesRemoved: validation.edgesToRemove.length,
      edgesAdded: edgesToAdd.length,
      errors,
      warnings: [...warnings, ...validation.violations],
      removedNodeTypes, // ✅ Return removed node types
    };
  }

  /**
   * Prefer keeping direct branch edges (false, true, case_*) on the original log node;
   * sequential / main hops to log get cloned terminals.
   */
  private branchEdgeIncomingPriority(e: WorkflowEdge): number {
    const t = String(e.type || e.sourceHandle || '').toLowerCase();
    if (t === 'false') return 0;
    if (t === 'true') return 1;
    if (t.startsWith('case_')) return 2;
    return 10;
  }

  private cloneLogOutputForSplit(sourceLog: WorkflowNode, splitIndex: number): WorkflowNode {
    // Deterministic id so reconcileWorkflow is idempotent (no random UUIDs per §P1 tests)
    const newId = `${sourceLog.id}_split_${splitIndex}`;
    const baseLabel =
      (sourceLog.data && (sourceLog.data as any).label) ||
      (sourceLog as any).label ||
      'Log';
    const data = sourceLog.data
      ? {
          ...(sourceLog.data as object),
          label: `${baseLabel} (branch ${splitIndex + 1})`,
        }
      : { type: 'log_output', label: `${baseLabel} (branch ${splitIndex + 1})` };
    return {
      ...sourceLog,
      id: newId,
      data: data as any,
    };
  }

  /**
   * Universal: log_output must not fan-in from multiple sources without an explicit merge node.
   * Duplicate the log node so each incoming edge targets its own terminal.
   */
  private splitMultiInputLogOutputs(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; splitCount: number } {
    const outNodes = [...nodes];
    let outEdges = [...edges];
    let splitCount = 0;

    const logNodes = outNodes.filter(n => {
      const t = this.getNodeType(n);
      return t === 'log_output';
    });

    for (const log of logNodes) {
      // Split only base terminals; clones from a prior split use deterministic ids containing "_split_"
      // and must not be split again (idempotent reconcile — see workflow-graph-correctness-preservation P1).
      if (String(log.id).includes('_split_')) {
        continue;
      }
      const incoming = outEdges.filter(e => e.target === log.id);
      if (incoming.length <= 1) continue;

      splitCount++;
      const sorted = [...incoming].sort(
        (a, b) => this.branchEdgeIncomingPriority(a) - this.branchEdgeIncomingPriority(b)
      );

      for (let i = 1; i < sorted.length; i++) {
        const edgeToRewire = sorted[i];
        const newLog = this.cloneLogOutputForSplit(log, i);
        outNodes.push(newLog);

        const idx = outEdges.findIndex(e =>
          edgeToRewire.id ? e.id === edgeToRewire.id
            : e.source === edgeToRewire.source && e.target === edgeToRewire.target
        );
        if (idx >= 0) {
          const next = [...outEdges];
          next[idx] = { ...next[idx], target: newLog.id };
          outEdges = next;
        }
      }
    }

    return { nodes: outNodes, edges: outEdges, splitCount };
  }
  
  /**
   * ✅ AUTO-REMOVAL: Remove orphaned nodes that are not required.
   * 
   * Rules:
   * 1. Orphaned = not reachable from any trigger in the reconciled graph.
   * 2. Nodes required by registry (`workflowBehavior.alwaysRequired` or `exemptFromRemoval`)
   *    are preserved so validators can surface a hard pipeline contract error.
   * 3. All other orphaned nodes (including unused output nodes) are removed.
   * 
   * This keeps the final workflow structurally minimal and prevents validators
   * from failing solely because the planner produced extra, unused nodes.
   *
   * Returns removed node types so caller can update requiredNodes list.
   */
  private removeUnrequiredOrphanedNodes(
    workflow: Workflow,
    edges: WorkflowEdge[],
    orderedNodeIds: string[],
    tagsFromVariation?: string[]
  ): { nodes: WorkflowNode[]; nodesRemoved: number; removedNodeTypes: string[] } {
    // Find trigger nodes
    const triggerNodes = workflow.nodes.filter(n => {
      const nodeType = this.getNodeType(n);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    if (triggerNodes.length === 0) {
      // No trigger = can't determine orphaned nodes
      return { nodes: workflow.nodes, nodesRemoved: 0, removedNodeTypes: [] };
    }
    
    // Build reachability graph from triggers
    const reachableNodeIds = new Set<string>();
    const outgoingEdges = new Map<string, string[]>();
    
    // Initialize with triggers
    triggerNodes.forEach(t => reachableNodeIds.add(t.id));
    
    // Build adjacency list
    edges.forEach(edge => {
      if (!outgoingEdges.has(edge.source)) {
        outgoingEdges.set(edge.source, []);
      }
      outgoingEdges.get(edge.source)!.push(edge.target);
    });
    
    // BFS from all triggers to find reachable nodes
    const queue = [...triggerNodes.map(t => t.id)];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const targets = outgoingEdges.get(nodeId) || [];
      targets.forEach(targetId => {
        if (!reachableNodeIds.has(targetId)) {
          reachableNodeIds.add(targetId);
          queue.push(targetId);
        }
      });
    }
    
    // Find orphaned nodes (not reachable from trigger)
    const orphanedNodes = workflow.nodes.filter(n => !reachableNodeIds.has(n.id));
    
    if (orphanedNodes.length === 0) {
      return { nodes: workflow.nodes, nodesRemoved: 0, removedNodeTypes: [] };
    }
    
    // Filter: Keep only required orphaned nodes, remove the rest
    const nodesToKeep: WorkflowNode[] = [];
    const nodesToRemove: WorkflowNode[] = [];
    const removedNodeTypes: string[] = []; // ✅ Track removed node types
    
    for (const node of workflow.nodes) {
      const isOrphaned = !reachableNodeIds.has(node.id);
      
      if (!isOrphaned) {
        // Not orphaned = keep
        nodesToKeep.push(node);
        continue;
      }
      
      // Orphaned - check if required
      const nodeType = this.getNodeType(node);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // ✅ PHASE 4: CRITICAL RULE - Never remove nodes in tags (tags are source of truth)
      if (this.shouldPreserveNode(node, tagsFromVariation)) {
        nodesToKeep.push(node);
        console.log(
          `[EdgeReconciliationEngine] ✅ Preserving orphaned node from tags: ${nodeType} (${node.id})`
        );
        continue;
      }
      
      // ✅ RULE: Keep if required by registry
      const isRequired = 
        nodeDef?.workflowBehavior?.alwaysRequired === true ||
        nodeDef?.workflowBehavior?.exemptFromRemoval === true;
      
      const isSolePredecessorOfRequiredTerminal = edges.some((e) => {
        if (e.source !== node.id) return false;
        const target = workflow.nodes.find((n) => n.id === e.target);
        if (!target) return false;
        const targetType = this.getNodeType(target);
        const targetDef = unifiedNodeRegistry.get(targetType);
        const targetRequired =
          targetDef?.workflowBehavior?.alwaysRequired === true ||
          targetDef?.workflowBehavior?.exemptFromRemoval === true;
        if (!targetRequired) return false;
        const incomingCount = edges.filter((ie) => ie.target === target.id).length;
        return incomingCount <= 1;
      });

      if (isRequired || isSolePredecessorOfRequiredTerminal) {
        // Required but orphaned = real error (edge creation failed)
        // Keep it so validation can report the error
        nodesToKeep.push(node);
        console.log(
          `[EdgeReconciliationEngine] ⚠️  Keeping required orphaned node: ${nodeType} (${node.id}) - edge creation may have failed`
        );
      } else {
        // Not required and orphaned = unnecessary = remove
        nodesToRemove.push(node);
        removedNodeTypes.push(nodeType); // ✅ Track removed node type
        console.log(
          `[EdgeReconciliationEngine] 🗑️  Auto-removing unnecessary orphaned node: ${nodeType} (${node.id})`
        );
      }
    }
    
    return {
      nodes: nodesToKeep,
      nodesRemoved: nodesToRemove.length,
      removedNodeTypes, // ✅ Return removed node types
    };
  }

  /**
   * ✅ PHASE 4: Check if node should be preserved based on tags from variation
   * Tags are the source of truth - if a node is in tags, it must be preserved
   * ✅ FIX 2: Alias-aware preservation - checks aliases and semantic equivalence
   * 
   * @param node - Node to check
   * @param tagsFromVariation - Tags from selected variation (format: ["nodeType"] or ["nodeType:capability"])
   * @returns true if node should be preserved
   */
  private shouldPreserveNode(
    node: WorkflowNode,
    tagsFromVariation?: string[]
  ): boolean {
    if (!tagsFromVariation || tagsFromVariation.length === 0) {
      return false; // No tags = no protection
    }
    
    const nodeType = this.getNodeType(node);
    const nodeTypeLower = nodeType.toLowerCase();
    
    // ✅ PHASE 4: Parse tag format: "nodeType" or "nodeType:capability"
    // Check if node is in tags (handle both formats)
    for (const tag of tagsFromVariation) {
      const [tagNodeType] = tag.split(':'); // Extract nodeType from "nodeType:capability"
      const tagNodeTypeLower = tagNodeType.toLowerCase();
      
      // ✅ FIX 2: Step 1: Exact match (case-insensitive)
      if (tagNodeTypeLower === nodeTypeLower || tag === nodeType || tag === nodeTypeLower) {
        console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (exact match in tags: ${tag})`);
        return true;
      }
      
      // ✅ FIX 2: Step 2: Check aliases using unified-node-registry (single source of truth)
      try {
        const { unifiedNodeRegistry } = require('../registry/unified-node-registry');
        const tagCanonical = unifiedNodeRegistry.resolveAlias(tagNodeType) || tagNodeType;
        const nodeCanonical = unifiedNodeRegistry.resolveAlias(nodeType) || nodeType;

        if (tagCanonical.toLowerCase() === nodeTypeLower) {
          console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (alias match: "${tagNodeType}" → "${tagCanonical}")`);
          return true;
        }
        if (nodeCanonical.toLowerCase() === tagNodeTypeLower) {
          console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (alias match: "${nodeType}" → "${nodeCanonical}")`);
          return true;
        }

        if (tagCanonical.toLowerCase() === nodeCanonical.toLowerCase() && tagCanonical !== tagNodeType) {
          console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (canonical match: "${tagNodeType}" → "${tagCanonical}", "${nodeType}" → "${nodeCanonical}")`);
          return true;
        }
      } catch (error) {
        // nodeTypeResolver not available, continue
      }
      
      // ✅ FIX 2: Step 3: Check semantic equivalence
      try {
        const { semanticNodeEquivalenceRegistry } = require('../../core/registry/semantic-node-equivalence-registry');
        if (semanticNodeEquivalenceRegistry.areEquivalent(tagNodeType, nodeType)) {
          console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (semantic equivalence: "${tagNodeType}" ≡ "${nodeType}")`);
          return true;
        }
      } catch (error) {
        // Semantic equivalence registry not available, continue
      }
      
      // ✅ FIX 2: Step 4: Check UnifiedNodeTypeMatcher (if available)
      try {
        const { UnifiedNodeTypeMatcher } = require('../../core/utils/unified-node-type-matcher');
        const matcher = UnifiedNodeTypeMatcher.getInstance();
        const matchResult = matcher.matches(tagNodeType, nodeType, { strict: false });
        if (matchResult.matches) {
          console.log(`[EdgeReconciliationEngine] ✅ Preserving ${nodeType} (type matcher: "${tagNodeType}" matches "${nodeType}", confidence: ${matchResult.confidence}%)`);
          return true;
        }
      } catch (error) {
        // UnifiedNodeTypeMatcher not available, continue
      }
    }
    
    return false;
  }
  
  /**
   * Forward reachability (directed) along current edge list — used for exclusive fork regions.
   */
  private reachableNodeIdsFrom(edges: WorkflowEdge[], startId: string): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const n = queue.shift()!;
      if (visited.has(n)) continue;
      visited.add(n);
      for (const e of edges) {
        if (e.source === n) queue.push(e.target);
      }
    }
    return visited;
  }

  /**
   * Choose upstream node for log_output wiring when execution order interleaves both branch outputs
   * (e.g. form → if_else → gmail → slack → log_true → log_false). Naïve "closest output" picks Slack for both logs.
   */
  private pickBranchAwarePredecessorForLogOutput(
    workflow: Workflow,
    orderedNodeIds: string[],
    structuralEdges: WorkflowEdge[],
    logOutputNodeId: string,
    logOutputIndex: number,
    options?: {
      usedPredecessorIds?: Set<string>;
      disableLegacyFallback?: boolean;
    }
  ): string | null {
    const nodeById = new Map(workflow.nodes.map(n => [n.id, n]));
    const isLogType = (id: string) =>
      (nodeById.get(id) ? this.getNodeType(nodeById.get(id) as WorkflowNode) : '') ===
      'log_output';

    const candidatesBefore: Array<{ id: string; idx: number }> = [];
    for (let i = logOutputIndex - 1; i >= 0; i--) {
      const id = orderedNodeIds[i];
      const n = nodeById.get(id);
      if (!n || isLogType(id)) continue;
      const nt = this.getNodeType(n);
      const def = unifiedNodeRegistry.get(nt);
      if (!def) continue;
      if (def.category === 'trigger') continue;
      if (def.workflowBehavior?.alwaysTerminal === true) continue;
      candidatesBefore.push({ id, idx: i });
    }

    const usedPredecessorIds = options?.usedPredecessorIds || new Set<string>();
    const isEligibleCandidate = (id: string): boolean => {
      const n = nodeById.get(id);
      if (!n) return false;
      const nt = this.getNodeType(n);
      const def = unifiedNodeRegistry.get(nt);
      if (!def) return false;
      // Branching nodes (if_else/switch) must not be chosen as terminal predecessors.
      // Terminals should connect from branch action/output nodes, not directly from forks.
      if (def.isBranching === true) return false;
      // Non-branching predecessors must be used once to avoid duplicate terminal wiring.
      return !usedPredecessorIds.has(id);
    };

    // Fork nodes (if_else/switch/...) can reach every downstream log by graph traversal.
    // They should not be selected as direct log_output predecessors; branch actions should.
    const isEligibleNonForkCandidate = (id: string): boolean => {
      const n = nodeById.get(id);
      if (!n) return false;
      const nt = this.getNodeType(n);
      const def = unifiedNodeRegistry.get(nt);
      if (!def || def.isBranching === true) return false;
      return isEligibleCandidate(id);
    };
    const isPreferredTerminalPredecessor = (id: string): boolean => {
      const n = nodeById.get(id);
      if (!n) return false;
      const nt = this.getNodeType(n);
      if (nt === 'merge') return true;
      return nodeCapabilityRegistryDSL.isOutput(nt) || isOutputNode(nt);
    };
    const pickCandidateInRange = (
      minIdxInclusive: number,
      maxIdxExclusive: number
    ): string | null => {
      // candidatesBefore is ordered closest-to-log first (immediate predecessor at index 0).
      // Scan forward so we prefer the nearest valid predecessor, not an earlier ancestor
      // (e.g. google_gmail → log_output, not google_sheets skipping Gmail on a linear chain).
      for (let k = 0; k < candidatesBefore.length; k++) {
        const { id, idx } = candidatesBefore[k];
        if (
          idx >= minIdxInclusive &&
          idx < maxIdxExclusive &&
          isEligibleCandidate(id) &&
          isPreferredTerminalPredecessor(id)
        ) {
          return id;
        }
      }
      for (let k = 0; k < candidatesBefore.length; k++) {
        const { id, idx } = candidatesBefore[k];
        if (idx >= minIdxInclusive && idx < maxIdxExclusive && isEligibleCandidate(id)) {
          return id;
        }
      }
      return null;
    };

    // 1) Upstream that already reaches this log on current edges
    for (let k = 0; k < candidatesBefore.length; k++) {
      const { id } = candidatesBefore[k];
      if (
        isEligibleNonForkCandidate(id) &&
        !this.areExclusiveForkDescendantsInDifferentRegions(
          workflow.nodes,
          structuralEdges,
          id,
          logOutputNodeId
        ) &&
        this.reachableNodeIdsFrom(structuralEdges, id).has(logOutputNodeId)
      ) {
        return id;
      }
    }

    // 2) If/Else (or any registry branching node): partition outputs by index between true/false heads
    for (const brNode of workflow.nodes) {
      const bt = this.getNodeType(brNode);
      if (!unifiedNodeRegistry.get(bt)?.isBranching) continue;
      const forkId = brNode.id;
      const outs = structuralEdges.filter(e => this.getExclusiveBranchPortFromEdge(e, forkId) !== null);
      if (outs.length < 2) continue;

      const byPort = (p: string) =>
        outs.find(e => String(e.type || e.sourceHandle || '').toLowerCase() === p);
      const trueE = byPort('true');
      const falseE = byPort('false');

      // ── if_else (true/false) ──────────────────────────────────────────────
      if (trueE && falseE) {
        const ti = orderedNodeIds.indexOf(trueE.target);
        const fi = orderedNodeIds.indexOf(falseE.target);
        if (ti < 0 || fi < 0) continue;

        const logIdx = logOutputIndex;

        // When the execution order groups all branch outputs together (category-sorted),
        // both log_outputs end up after both branch heads. Use log ordinal to map each
        // log_output to its branch: ordinal 0 → earlier branch head, ordinal 1 → later.
        // This prevents both logs from being assigned to the same (last) branch output.
        const orderedLogs = orderedNodeIds.filter(id => isLogType(id));
        const logOrdinal = orderedLogs.indexOf(logOutputNodeId);
        if (logOrdinal >= 0) {
          // Sort branch heads by execution-order index
          const branchHeads = [
            { id: trueE.target, idx: ti },
            { id: falseE.target, idx: fi },
          ].sort((a, b) => a.idx - b.idx);

          if (logOrdinal < branchHeads.length) {
            const mappedHead = branchHeads[logOrdinal];
            const nextHead = branchHeads[logOrdinal + 1];
            // Find the closest output node that is in the mapped branch's exclusive region:
            // between mappedHead.idx (inclusive) and nextHead.idx (exclusive) if there is a
            // next head, otherwise between mappedHead.idx and logIdx.
            const regionEnd = nextHead ? nextHead.idx : logIdx;
            const inMappedExclusiveRegion = pickCandidateInRange(mappedHead.idx, regionEnd);
            if (inMappedExclusiveRegion) return inMappedExclusiveRegion;
            // Fallback: any candidate in [mappedHead.idx, logIdx)
            const inMappedRegionToLog = pickCandidateInRange(mappedHead.idx, logIdx);
            if (inMappedRegionToLog) return inMappedRegionToLog;
          }
        }

        for (let k = 0; k < candidatesBefore.length; k++) {
          const { id, idx } = candidatesBefore[k];
          if (ti < fi) {
            if (logIdx >= fi) {
              if (idx >= fi && idx < logIdx && isEligibleCandidate(id)) return id;
            } else if (idx >= ti && idx < fi) {
              if (isEligibleCandidate(id)) return id;
            }
          } else {
            if (logIdx >= ti) {
              if (idx >= ti && idx < logIdx && isEligibleCandidate(id)) return id;
            } else if (idx >= fi && idx < ti) {
              if (isEligibleCandidate(id)) return id;
            }
          }
        }
        continue;
      }

      // ── switch (case_N) ───────────────────────────────────────────────────
      // Sort case branch heads by their position in execution order.
      const caseHeads = outs
        .map(e => ({ edge: e, idx: orderedNodeIds.indexOf(e.target) }))
        .filter(x => x.idx >= 0)
        .sort((a, b) => a.idx - b.idx);

      if (caseHeads.length < 2) continue;

      // Category-ordered workflows often group terminal logs at the end.
      // Preserve branch identity by mapping log ordinal to case-head ordinal.
      // Use the NEXT case head's index as the exclusive upper bound so each log
      // is mapped to its own branch's output node, not a sibling branch's node.
      const orderedLogs = orderedNodeIds.filter(id => isLogType(id));
      const logOrdinal = orderedLogs.indexOf(logOutputNodeId);
      if (logOrdinal >= 0 && logOrdinal < caseHeads.length) {
        const mappedHead = caseHeads[logOrdinal];
        const nextCaseHead = caseHeads[logOrdinal + 1];
        const regionEnd = nextCaseHead ? nextCaseHead.idx : logOutputIndex;
        // First try the exclusive region [mappedHead.idx, regionEnd)
        const inCaseExclusiveRegion = pickCandidateInRange(mappedHead.idx, regionEnd);
        if (inCaseExclusiveRegion) return inCaseExclusiveRegion;
        // Fallback: any candidate in [mappedHead.idx, logOutputIndex)
        const inCaseRegionToLog = pickCandidateInRange(mappedHead.idx, logOutputIndex);
        if (inCaseRegionToLog) return inCaseRegionToLog;
      }

      // Find which case region this log_output belongs to:
      // The log belongs to case_K if its index is >= caseHeads[K].idx and < caseHeads[K+1].idx
      // (or >= caseHeads[last].idx for the last case).
      const logIdx = logOutputIndex;
      let regionStart = -1;
      let regionEnd = orderedNodeIds.length;
      for (let ci = 0; ci < caseHeads.length; ci++) {
        const start = caseHeads[ci].idx;
        const end = ci + 1 < caseHeads.length ? caseHeads[ci + 1].idx : orderedNodeIds.length;
        if (logIdx >= start && logIdx < end) {
          regionStart = start;
          regionEnd = end;
          break;
        }
      }
      if (regionStart < 0) continue;

      // Return the closest output node within this case region (before the log).
      for (let k = 0; k < candidatesBefore.length; k++) {
        const { id, idx } = candidatesBefore[k];
        if (idx >= regionStart && idx < logIdx && isEligibleCandidate(id)) return id;
      }
    }

    // 3) Closest candidate not in a mutually exclusive fork region vs this log (registry-aware)
    for (let k = 0; k < candidatesBefore.length; k++) {
      const { id } = candidatesBefore[k];
      if (
        isEligibleNonForkCandidate(id) &&
        !this.areExclusiveForkDescendantsInDifferentRegions(
          workflow.nodes,
          structuralEdges,
          id,
          logOutputNodeId
        )
      ) {
        return id;
      }
    }

    // 4) Closest non-trigger, non-branching, non-terminal predecessor before log (legacy fallback)
    if (options?.disableLegacyFallback === true) {
      // Strict mode: caller asked to avoid flat-order fallback guesses.
      return null;
    }

    for (let i = logOutputIndex - 1; i >= 0; i--) {
      const id = orderedNodeIds[i];
      const n = nodeById.get(id);
      if (!n || isLogType(id)) continue;
      const ct = this.getNodeType(n);
      const candidateDef = unifiedNodeRegistry.get(ct);
      if (candidateDef?.category === 'trigger') continue;
      if (candidateDef?.isBranching === true) continue;
      if (candidateDef?.workflowBehavior?.alwaysTerminal === true) continue;
      if (isEligibleCandidate(id)) return id;
    }

    if (logOutputIndex > 0) {
      const fallbackId = orderedNodeIds[logOutputIndex - 1];
      if (isEligibleCandidate(fallbackId)) return fallbackId;
    }
    return null;
  }

  /**
   * Branch port id for exclusive outputs from a fork (not `main`).
   */
  private getExclusiveBranchPortFromEdge(edge: WorkflowEdge, forkId: string): string | null {
    if (edge.source !== forkId) return null;
    const t = String(edge.type || edge.sourceHandle || '').toLowerCase();
    if (t === 'main' || t === '') return null;
    if (t === 'true' || t === 'false') return t;
    if (t.startsWith('case_')) return t;
    return null;
  }

  /**
   * True when `u` and `v` lie in different exclusive subtrees of the same registry branching node,
   * with no mutual reachability between those subtrees (merge/rejoin would allow overlap).
   * Prevents spurious linear edges between sibling branch paths from flat execution order.
   */
  private areExclusiveForkDescendantsInDifferentRegions(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    u: string,
    v: string
  ): boolean {
    if (u === v) return false;
    for (const node of nodes) {
      const nodeType = this.getNodeType(node);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef?.isBranching) continue;

      const forkId = node.id;
      const outs = edges.filter(e => this.getExclusiveBranchPortFromEdge(e, forkId) !== null);
      if (outs.length < 2) continue;

      for (let i = 0; i < outs.length; i++) {
        for (let j = i + 1; j < outs.length; j++) {
          const e1 = outs[i];
          const e2 = outs[j];
          const p1 = this.getExclusiveBranchPortFromEdge(e1, forkId);
          const p2 = this.getExclusiveBranchPortFromEdge(e2, forkId);
          if (!p1 || !p2 || p1 === p2) continue;

          const R1 = this.reachableNodeIdsFrom(edges, e1.target);
          const R2 = this.reachableNodeIdsFrom(edges, e2.target);

          const uInR1Only = R1.has(u) && !R2.has(u);
          const vInR2Only = R2.has(v) && !R1.has(v);
          const uInR2Only = R2.has(u) && !R1.has(u);
          const vInR1Only = R1.has(v) && !R2.has(v);

          if (uInR1Only && vInR2Only) return true;
          if (uInR2Only && vInR1Only) return true;
        }
      }
    }
    return false;
  }

  /**
   * Hypothetical mapping of branch ports → first downstream node in execution order (same as Step 4
   * when each port takes the next unused node in potentialTargets). Used when branch edges are
   * not materialized yet (Step 3 runs before Step 4).
   */
  private getHypotheticalBranchPortTargetsForFork(
    forkNode: WorkflowNode,
    orderedNodeIds: string[]
  ): Map<string, string> | null {
    const forkIndex = orderedNodeIds.indexOf(forkNode.id);
    if (forkIndex < 0) return null;
    const potentialTargets = orderedNodeIds.slice(forkIndex + 1);
    const outgoingPorts = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(forkNode);
    const branchPorts = outgoingPorts.filter(p => p !== 'output');
    if (branchPorts.length < 2) return null;

    const map = new Map<string, string>();
    for (let i = 0; i < branchPorts.length && i < potentialTargets.length; i++) {
      map.set(branchPorts[i], potentialTargets[i]);
    }
    return map.size >= 2 ? map : null;
  }

  /**
   * Branch head node ids already wired from a fork (if_else / switch), in stable port order.
   * Used when switch `cases` are not hydrated yet so hypothetical port mapping is empty,
   * but `wireSwitchCaseEdges` already created case_* (or semantic) branch edges.
   */
  private getBranchHeadTargetsFromForkEdges(forkNode: WorkflowNode, edges: WorkflowEdge[]): string[] | null {
    const forkType = this.getNodeType(forkNode);
    if (!unifiedNodeRegistry.get(forkType)?.isBranching) return null;

    const outs = edges.filter(e => {
      if (e.source !== forkNode.id) return false;
      // Prefer sourceHandle: some builders set type to "default" while branch port lives on sourceHandle.
      const t = String(e.sourceHandle || e.type || '').toLowerCase();
      if (!t || t === 'main' || t === 'default' || t === 'output') return false;
      if (forkType === 'if_else') return t === 'true' || t === 'false';
      if (forkType === 'switch') {
        if (t.startsWith('case_')) return true;
        // Semantic case id (e.g. "success") when not using case_N
        return true;
      }
      return this.edgeUsesBranchPort(e);
    });
    if (outs.length < 2) return null;

    const sorted = [...outs].sort((a, b) => {
      const ta = String(a.type || a.sourceHandle || '').toLowerCase();
      const tb = String(b.type || b.sourceHandle || '').toLowerCase();
      const ma = /^case_(\d+)$/.exec(ta);
      const mb = /^case_(\d+)$/.exec(tb);
      if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
      if (ma) return -1;
      if (mb) return 1;
      return ta.localeCompare(tb);
    });
    return sorted.map(e => e.target);
  }

  /**
   * True when source/target are consecutive in execution order and match two distinct branch head
   * targets under the same registry branching node (if_else true/false, switch case_*, …).
   */
  private areConsecutivePairExclusiveBranchHeadsByOrder(
    workflowNodes: WorkflowNode[],
    orderedNodeIds: string[],
    sourceId: string,
    targetId: string,
    structuralEdges: WorkflowEdge[] = []
  ): boolean {
    const si = orderedNodeIds.indexOf(sourceId);
    const ti = orderedNodeIds.indexOf(targetId);
    if (si < 0 || ti !== si + 1) return false;

    for (const node of workflowNodes) {
      const nodeType = this.getNodeType(node);
      if (!unifiedNodeRegistry.get(nodeType)?.isBranching) continue;

      let targets: string[] | null = null;
      const portMap = this.getHypotheticalBranchPortTargetsForFork(node, orderedNodeIds);
      if (portMap && portMap.size >= 2) {
        targets = [...portMap.values()];
      } else {
        const fromEdges = this.getBranchHeadTargetsFromForkEdges(node, structuralEdges);
        if (fromEdges && fromEdges.length >= 2) {
          targets = fromEdges;
        }
      }
      if (!targets) continue;

      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const a = targets[i];
          const b = targets[j];
          if (a && b && ((sourceId === a && targetId === b) || (sourceId === b && targetId === a))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * True when the edge carries an exclusive branch port (if_else / switch), not a linear "main" hop.
   */
  private edgeUsesBranchPort(edge: WorkflowEdge): boolean {
    const t = String(edge.type || edge.sourceHandle || '').toLowerCase();
    if (t === 'true' || t === 'false') return true;
    if (t.startsWith('case_')) return true;
    return false;
  }

  /**
   * Category/array-based execution order can list branch heads *before* the fork node (same priority
   * bucket in buildOrderFromCategories). Those edges are still valid DAG edges; dropping them for
   * sourceIdx >= targetIdx alone removes real branches and orphans second terminals on save.
   */
  private shouldKeepEdgeDespiteNonMonotonicOrder(
    workflow: Workflow,
    edge: WorkflowEdge
  ): boolean {
    const sourceNode = workflow.nodes.find(n => n.id === edge.source);
    const targetNode = workflow.nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    const sourceType = unifiedNormalizeNodeTypeString(
      sourceNode.type || sourceNode.data?.type || ''
    );
    if (unifiedNodeRegistry.get(sourceType)?.isBranching === true && this.edgeUsesBranchPort(edge)) {
      return true;
    }

    const targetType = unifiedNormalizeNodeTypeString(
      targetNode.type || targetNode.data?.type || ''
    );
    if (targetType === 'log_output' && isOutputNode(sourceNode)) {
      return true;
    }

    return false;
  }

  /**
   * Validate edges against execution order
   */
  validateEdges(
    workflow: Workflow,
    executionOrder: ExecutionOrder
  ): EdgeValidationResult {
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    const nodeIndex = new Map(orderedNodeIds.map((id, idx) => [id, idx]));
    
    const edgesToRemove: WorkflowEdge[] = [];
    const edgesToAdd: Array<{ sourceId: string; targetId: string; edgeType?: string; sourceHandle?: string; targetHandle?: string }> = [];
    const violations: string[] = [];
    
    // Validate each existing edge
    workflow.edges.forEach(edge => {
      const sourceIdx = nodeIndex.get(edge.source);
      const targetIdx = nodeIndex.get(edge.target);
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      if (sourceNode) {
        const sourceType = this.getNodeType(sourceNode);
        const sourceDef = unifiedNodeRegistry.get(sourceType);
        // Terminal-by-contract nodes must never emit outgoing edges.
        if (sourceDef?.workflowBehavior?.alwaysTerminal === true) {
          edgesToRemove.push(edge);
          violations.push(
            `Edge ${edge.source} → ${edge.target} is invalid: source node ${sourceType} is terminal`
          );
          return;
        }
        if ((sourceDef?.tags || []).includes('terminal')) {
          edgesToRemove.push(edge);
          violations.push(
            `Edge ${edge.source} → ${edge.target} is invalid: source node ${sourceType} is tagged terminal`
          );
          return;
        }
        if ((sourceDef?.outgoingPorts || []).length === 0 && sourceDef?.isBranching !== true) {
          edgesToRemove.push(edge);
          violations.push(
            `Edge ${edge.source} → ${edge.target} is invalid: source node ${sourceType} has no outgoing ports`
          );
          return;
        }
      }
      
      if (sourceIdx === undefined || targetIdx === undefined) {
        // Edge references non-existent node
        edgesToRemove.push(edge);
        violations.push(`Edge ${edge.source} → ${edge.target} references non-existent node`);
        return;
      }
      
      if (sourceIdx >= targetIdx) {
        if (this.shouldKeepEdgeDespiteNonMonotonicOrder(workflow, edge)) {
          return;
        }
        // Exempt intentional port-labeled branch edges (case_*, true, false) from a branching
        // node — these are pre-wired by wireSwitchCaseEdges() and must survive into Step 4's
        // edgeForPortExists guard. Removing them causes Step 4 to re-create them positionally,
        // overwriting the semantic intent captured in caseNodeMapping.
        const branchEdgeLabel = String(edge.type || edge.sourceHandle || '');
        const isBranchPortEdge =
          branchEdgeLabel === 'true' ||
          branchEdgeLabel === 'false' ||
          /^case_\d+$/.test(branchEdgeLabel);
        if (isBranchPortEdge) {
          const sourceNodeForBranch = workflow.nodes.find((n) => n.id === edge.source);
          const sourceIsBranching = sourceNodeForBranch
            ? unifiedNodeRegistry.get(this.getNodeType(sourceNodeForBranch))?.isBranching === true
            : false;
          if (sourceIsBranching) {
            return; // Keep intentional branch edge — Step 4 will see it via edgeForPortExists
          }
        }
        // Edge violates execution order (target comes before source in flat list)
        edgesToRemove.push(edge);
        violations.push(
          `Edge ${edge.source} → ${edge.target} violates execution order ` +
          `(source at index ${sourceIdx}, target at index ${targetIdx})`
        );
        return;
      }

      // ✅ UNIVERSAL FIX: Remove skip edges to log_output terminals.
      // A log_output node must only receive an edge from its direct predecessor in execution
      // order (the node immediately before it). Any edge that skips over intermediate nodes
      // to reach log_output is invalid and causes the splitMultiInputLogOutputs to fire,
      // creating a spurious "branch 2" clone node.
      //
      // Example of bad skip edge: google_sheets(idx=1) → log_output(idx=3)
      // when google_gmail(idx=2) sits between them. The correct edge is
      // google_gmail(idx=2) → log_output(idx=3).
      const targetNode = workflow.nodes.find(n => n.id === edge.target);
      if (targetNode) {
        const targetType = this.getNodeType(targetNode);
        if (targetType === 'log_output') {
          // The only valid predecessor for log_output is the node at targetIdx - 1
          // (or a branch output node in a branching workflow).
          // If the source is NOT the direct predecessor, it's a skip edge — remove it.
          const directPredecessorId = orderedNodeIds[targetIdx - 1];
          if (directPredecessorId && edge.source !== directPredecessorId) {
            // Allow branch edges (true/false/case_*) — these are legitimate multi-input scenarios
            // that splitMultiInputLogOutputs handles correctly.
            const edgeType = String(edge.type || edge.sourceHandle || '').toLowerCase();
            const isBranchEdge = edgeType === 'true' || edgeType === 'false' || edgeType.startsWith('case_');
            const sourceNodeForLog = workflow.nodes.find(n => n.id === edge.source);
            const sourceIsOutput = sourceNodeForLog ? isOutputNode(sourceNodeForLog) : false;
            const branchAwarePredecessor = this.pickBranchAwarePredecessorForLogOutput(
              workflow,
              orderedNodeIds,
              workflow.edges,
              edge.target,
              targetIdx
            );
            const isBranchAwareOutputToLog =
              sourceIsOutput &&
              typeof branchAwarePredecessor === 'string' &&
              branchAwarePredecessor === edge.source;
            if (!isBranchEdge && !isBranchAwareOutputToLog) {
              edgesToRemove.push(edge);
              violations.push(
                `Edge ${edge.source} → ${edge.target} is a skip edge to log_output ` +
                `(source at index ${sourceIdx}, log_output at index ${targetIdx}, ` +
                `direct predecessor is ${directPredecessorId} at index ${targetIdx - 1})`
              );
              return;
            }
          }
        }
      }
      
      // Edge is valid
    });

    // Terminal lineage invariant:
    // non-branching sources must not fan out into multiple log_output terminals.
    const nonBranchingSourceToLogs = new Map<string, Set<string>>();
    for (const edge of workflow.edges) {
      const targetNode = workflow.nodes.find(n => n.id === edge.target);
      if (!targetNode || this.getNodeType(targetNode) !== 'log_output') continue;
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      if (!sourceNode) continue;
      const sourceType = this.getNodeType(sourceNode);
      const sourceDef = unifiedNodeRegistry.get(sourceType);
      if (!sourceDef || sourceDef.isBranching === true) continue;
      if (!nonBranchingSourceToLogs.has(edge.source)) {
        nonBranchingSourceToLogs.set(edge.source, new Set<string>());
      }
      nonBranchingSourceToLogs.get(edge.source)!.add(edge.target);
    }
    for (const [sourceId, targets] of nonBranchingSourceToLogs.entries()) {
      if (targets.size > 1) {
        violations.push(
          `Terminal lineage violation: non-branching node ${sourceId} connects to multiple log_output terminals (${Array.from(targets).join(', ')})`
        );
      }
    }

    const hasBranchingNode = workflow.nodes.some((n) => {
      const def = unifiedNodeRegistry.get(this.getNodeType(n));
      return def?.isBranching === true;
    });
    if (hasBranchingNode) {
      const logOutputNodes = workflow.nodes.filter((n) => this.getNodeType(n) === 'log_output');
      for (const logNode of logOutputNodes) {
        const incomingCount = workflow.edges.filter((e) => e.target === logNode.id).length;
        if (incomingCount !== 1) {
          violations.push(
            `Terminal lineage violation: branching workflow requires exactly one incoming edge for log_output ${logNode.id} (found ${incomingCount})`
          );
        }
      }
    }

    const effectiveEdges = workflow.edges.filter(
      e => !edgesToRemove.some(er => er.id === e.id)
    );
    
    // Determine missing edges based on execution order
    for (let i = 0; i < orderedNodeIds.length - 1; i++) {
      const sourceId = orderedNodeIds[i];
      const targetId = orderedNodeIds[i + 1];
      
      const sourceNode = workflow.nodes.find(n => n.id === sourceId);
      const targetNode = workflow.nodes.find(n => n.id === targetId);
      
      if (!sourceNode || !targetNode) continue;
      if (isOutputNode(targetNode)) {
        const sourceType = unifiedNormalizeNodeTypeString(
          sourceNode.type || sourceNode.data?.type || '',
        );
        const sourceDef = unifiedNodeRegistry.get(sourceType);
        const hasIncoming = effectiveEdges.some((e) => e.target === targetId);
        const allowTriggerToOutput = sourceDef?.category === 'trigger' && !hasIncoming;
        if (!allowTriggerToOutput) continue;
      }

      const validateSourceType = unifiedNormalizeNodeTypeString(
        sourceNode.type || sourceNode.data?.type || ''
      );
      // Same rule as reconcileEdges Step 3: branching sources are wired via branch fan-out, not linear i→i+1.
      if (unifiedNodeRegistry.get(validateSourceType)?.isBranching === true) {
        continue;
      }
      const validateTargetType = unifiedNormalizeNodeTypeString(
        targetNode.type || targetNode.data?.type || ''
      );
      const validateTargetDef = unifiedNodeRegistry.get(validateTargetType);
      if (
        validateTargetDef?.workflowBehavior?.alwaysTerminal === true ||
        (validateTargetDef?.tags || []).includes('terminal')
      ) {
        continue;
      }

      if (
        this.areExclusiveForkDescendantsInDifferentRegions(
          workflow.nodes,
          effectiveEdges,
          sourceId,
          targetId
        ) ||
        this.areConsecutivePairExclusiveBranchHeadsByOrder(
          workflow.nodes,
          orderedNodeIds,
          sourceId,
          targetId,
          effectiveEdges
        )
      ) {
        continue;
      }
      
      // Check if edge should exist (registry-based)
      if (this.shouldHaveEdge(sourceNode, targetNode)) {
        const edgeExists = effectiveEdges.some(
          e => e.source === sourceId && e.target === targetId
        );
        
        if (!edgeExists) {
          edgesToAdd.push({ sourceId, targetId });
        }
      }
    }
    
    return { edgesToRemove, edgesToAdd, violations };
  }
  
  /**
   * Create edge from execution order using registry
   */
  private createEdgeFromOrder(
    workflow: Workflow,
    sourceId: string,
    targetId: string,
    executionOrder: ExecutionOrder,
    edgeType?: string,
    existingEdges?: WorkflowEdge[]
  ): WorkflowEdge | null {
    const sourceNode = workflow.nodes.find(n => n.id === sourceId);
    const targetNode = workflow.nodes.find(n => n.id === targetId);
    
    if (!sourceNode || !targetNode) {
      console.error(
        `[EdgeReconciliationEngine] 🔍 DEBUG createEdgeFromOrder: Node not found - ` +
        `sourceNode=${!!sourceNode}, targetNode=${!!targetNode}, ` +
        `sourceId=${sourceId.substring(0, 8)}, targetId=${targetId.substring(0, 8)}`
      );
      return null;
    }
    
    const sourceType = this.getNodeType(sourceNode);
    const targetType = this.getNodeType(targetNode);
    
    // 🔍 DEBUG: Track edge creation for log_output connections
    const isLogOutputConnection = targetType === 'log_output';
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG createEdgeFromOrder: ` +
        `${sourceType}(${sourceId.substring(0, 8)}) → log_output(${targetId.substring(0, 8)}), ` +
        `edgeType=${edgeType || 'default'}`
      );
    }
    
    // Use universal handle resolver (registry-driven)
    const sourceHandleResult = universalHandleResolver.resolveSourceHandle(
      sourceType,
      undefined, // No explicit handle
      edgeType // Connection type ('true', 'false', etc.)
    );
    
    const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
    
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Handle resolution: ` +
        `sourceHandle=${sourceHandleResult.handle || 'null'}, valid=${sourceHandleResult.valid}, ` +
        `targetHandle=${targetHandleResult.handle || 'null'}, valid=${targetHandleResult.valid}`
      );
    }
    
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      if (isLogOutputConnection) {
        console.error(
          `[EdgeReconciliationEngine] ❌ Handle resolution failed: ` +
          `sourceHandle.valid=${sourceHandleResult.valid}, ` +
          `targetHandle.valid=${targetHandleResult.valid}, ` +
          `sourceHandle.reason=${sourceHandleResult.reason || 'none'}, ` +
          `targetHandle.reason=${targetHandleResult.reason || 'none'}`
        );
      }
      return null;
    }
    
    // Use universal edge creation service to create edge
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Calling universalEdgeCreationService.createEdge: ` +
        `sourceHandle=${sourceHandleResult.handle}, targetHandle=${targetHandleResult.handle}`
      );
    }
    
    const edgeResult = universalEdgeCreationService.createEdge({
      sourceNode,
      targetNode,
      sourceHandle: sourceHandleResult.handle,
      targetHandle: targetHandleResult.handle,
      edgeType: edgeType || 'default',
      existingEdges: existingEdges || workflow.edges,
      allNodes: workflow.nodes,
    });
    
    if (isLogOutputConnection) {
      console.log(
        `[EdgeReconciliationEngine] 🔍 DEBUG Edge creation result: ` +
        `success=${edgeResult.success}, ` +
        `hasEdge=${!!edgeResult.edge}, ` +
        `error=${edgeResult.error || 'none'}`
      );
    }
    
    if (edgeResult.success && edgeResult.edge) {
      if (isLogOutputConnection) {
        console.log(
          `[EdgeReconciliationEngine] ✅ Successfully created edge: ` +
          `${sourceType}(${sourceId.substring(0, 8)}) → log_output(${targetId.substring(0, 8)})`
        );
      }
      return edgeResult.edge;
    }
    
    if (isLogOutputConnection) {
      console.error(
        `[EdgeReconciliationEngine] ❌ Edge creation failed: ` +
        `success=${edgeResult.success}, ` +
        `error=${edgeResult.error || 'unknown error'}`
      );
    }
    
    return null;
  }
  
  /**
   * ✅ CAPABILITY-DRIVEN: Check if edge should exist between two nodes
   * Uses capability-based roles (data_source, transformation, output) instead of registry categories
   * This ensures nodes like http_post (utility category, but data_source capability) are correctly connected
   */
  private shouldHaveEdge(source: WorkflowNode, target: WorkflowNode): boolean {
    const sourceType = this.getNodeType(source);
    const targetType = this.getNodeType(target);
    
    const sourceDef = unifiedNodeRegistry.get(sourceType);
    const targetDef = unifiedNodeRegistry.get(targetType);
    
    if (!sourceDef || !targetDef) return false;

    // Parallel branch terminals (e.g. true/false both logging) must not be linearly chained by order repair
    if (sourceType === 'log_output' && targetType === 'log_output') {
      return false;
    }
    
    // ✅ UNIVERSAL: Prioritize intendedCapability from metadata (AI-determined, context-aware)
    // This is the PRIMARY source of truth for multi-capability nodes
    const { NodeMetadataHelper } = require('../../core/types/node-metadata');
    const sourceMetadata = NodeMetadataHelper.getMetadata(source);
    const targetMetadata = NodeMetadataHelper.getMetadata(target);
    
    const sourceIntendedCapability = sourceMetadata?.dsl?.intendedCapability;
    const targetIntendedCapability = targetMetadata?.dsl?.intendedCapability;
    
    // ✅ CAPABILITY-BASED ROLES: Use intendedCapability if available, otherwise fall back to capability registry
    const sourceIsTrigger = sourceDef.category === 'trigger';
    
    // Use intendedCapability if available (AI-determined), otherwise use capability registry
    const sourceIsDataSource = sourceIntendedCapability === 'data_source' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isDataSource(sourceType));
    const sourceIsTransformation = sourceIntendedCapability === 'transformation' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isTransformation(sourceType));
    const sourceIsOutput = sourceIntendedCapability === 'output' || 
      (sourceIntendedCapability === undefined && nodeCapabilityRegistryDSL.isOutput(sourceType));
    
    const targetIsDataSource = targetIntendedCapability === 'data_source' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isDataSource(targetType));
    const targetIsTransformation = targetIntendedCapability === 'transformation' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isTransformation(targetType));
    const targetIsOutput = targetIntendedCapability === 'output' || 
      (targetIntendedCapability === undefined && nodeCapabilityRegistryDSL.isOutput(targetType));
    
    // ✅ RULE 1 (universal): Trigger connects to first executable non-trigger node,
    // regardless of category/capability. This keeps trigger->logic, trigger->ai, and
    // trigger->output workflows structurally valid without node-type hardcoding.
    if (sourceIsTrigger && targetDef.category !== 'trigger') return true;
    
    // ✅ RULE 2: Data sources (by capability) can connect to transformations
    if (sourceIsDataSource && targetIsTransformation) return true;
    
    // ✅ RULE 3: Transformations can connect to other transformations or outputs
    if (sourceIsTransformation) {
      if (targetIsTransformation || targetIsOutput) return true;
      if (targetType === 'log_output') return true;
    }
    
    // ✅ RULE 4: Any node can connect to merge
    if (targetType === 'merge' || (targetDef.tags || []).includes('merge')) return true;
    
    // ✅ RULE 5: Branching nodes (if_else, switch) can connect to multiple targets
    if (sourceDef.isBranching) return true;
    
    // ✅ RULE 6: Logic nodes (if_else, switch) can connect to any node
    if (sourceDef.category === 'logic') return true;
    
    // ✅ RULE 7: Outputs can connect to log_output (universal terminal)
    if (sourceIsOutput && targetType === 'log_output') return true;
    
    // ✅ RULE 8: Data sources can connect to outputs (for direct data → output flows)
    if (sourceIsDataSource && targetIsOutput) return true;
    
    // ✅ RULE 9: Fallback: Use registry categories for nodes without capability classification
    const sourceCategory = sourceDef.category;
    const targetCategory = targetDef.category;
    
    // Legacy category-based rules (fallback only)
    if (sourceCategory === 'trigger' && targetCategory === 'data') return true;
    if (sourceCategory === 'data' && (targetCategory === 'transformation' || targetCategory === 'ai')) return true;
    if ((sourceCategory === 'transformation' || sourceCategory === 'ai') && 
        (targetCategory === 'transformation' || targetCategory === 'ai' || targetCategory === 'communication')) return true;
    if (sourceCategory === 'utility' && (targetCategory === 'transformation' || targetCategory === 'ai' || targetCategory === 'communication')) return true;
    
    return false;
  }
}

// Export singleton instance
export const edgeReconciliationEngine: EdgeReconciliationEngine = new EdgeReconciliationEngineImpl();
