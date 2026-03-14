/**
 * ✅ EXECUTION ORDER MANAGER
 * 
 * Maintains a dynamic, always-up-to-date execution order that reflects the actual workflow structure.
 * 
 * Key Features:
 * 1. Registry-Driven: Uses unifiedNodeRegistry to determine node capabilities, dependencies, and execution semantics
 * 2. Dynamic Updates: Automatically updates when nodes are injected/removed
 * 3. Topological Ordering: Ensures correct execution sequence
 * 4. Dependency Tracking: Tracks node dependencies using registry metadata
 * 
 * This is the SINGLE SOURCE OF TRUTH for execution order in the system.
 */

import { Workflow, WorkflowNode } from '../types/ai-types';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

/**
 * Execution Order - Represents the canonical execution sequence
 */
export interface ExecutionOrder {
  nodeIds: string[]; // Ordered list of node IDs (execution sequence)
  dependencies: Map<string, string[]>; // nodeId -> [dependency nodeIds]
  metadata: {
    triggerNodeId?: string;
    terminalNodeIds: string[];
    branchingNodeIds: string[]; // Nodes that can have multiple outputs (if_else, switch)
    mergeNodeIds: string[]; // Nodes that can have multiple inputs (merge)
  };
}

export interface ExecutionOrderManager {
  /**
   * Initialize execution order from workflow graph
   * ✅ 3-TIER ORDER-FIRST APPROACH:
   * - TIER 1: Use DSL execution steps (primary source of truth)
   * - TIER 2: Use registry-driven category ordering (fallback)
   * - TIER 3: Preserve node array order (last resort)
   * 
   * @param workflow - Workflow graph
   * @param dslExecutionOrder - Optional DSL execution steps (TIER 1)
   */
  initialize(workflow: Workflow, dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>): ExecutionOrder;
  
  /**
   * Insert node into execution order at correct position
   * Uses registry to determine where node should execute
   */
  insertNode(
    order: ExecutionOrder,
    node: WorkflowNode,
    positionHint?: 'before' | 'after' | 'replace',
    referenceNodeId?: string
  ): ExecutionOrder;
  
  /**
   * Remove node from execution order
   */
  removeNode(order: ExecutionOrder, nodeId: string): ExecutionOrder;
  
  /**
   * Get execution order as array of node IDs
   */
  getOrderedNodeIds(order: ExecutionOrder): string[];
  
  /**
   * Get dependencies for a node (what must execute before it)
   * Uses registry to determine dependencies
   */
  getDependencies(nodeId: string, workflow: Workflow): string[];
}

class ExecutionOrderManagerImpl implements ExecutionOrderManager {
  /**
   * Initialize execution order from workflow graph
   * ✅ 3-TIER ORDER-FIRST APPROACH: DSL → Registry → Array Order
   */
  initialize(workflow: Workflow, dslExecutionOrder?: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>): ExecutionOrder {
    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];
    
    if (nodes.length === 0) {
      return {
        nodeIds: [],
        dependencies: new Map(),
        metadata: {
          terminalNodeIds: [],
          branchingNodeIds: [],
          mergeNodeIds: [],
        },
      };
    }
    
    // ✅ TIER 1: Use DSL execution steps (PRIMARY SOURCE OF TRUTH)
    if (dslExecutionOrder && dslExecutionOrder.length > 0) {
      const tier1Result = this.buildOrderFromDSLSteps(workflow, dslExecutionOrder);
      if (tier1Result.nodeIds.length === nodes.length) {
        console.log(`[ExecutionOrderManager] ✅ TIER 1: Using DSL execution order (${tier1Result.nodeIds.length} nodes)`);
        return tier1Result;
      } else {
        console.warn(`[ExecutionOrderManager] ⚠️  TIER 1: DSL order incomplete (${tier1Result.nodeIds.length}/${nodes.length} nodes), falling back to TIER 2`);
      }
    }
    
    // ✅ TIER 2: Use registry-driven category ordering (SECONDARY FALLBACK)
    const tier2Result = this.buildOrderFromCategories(workflow);
    if (tier2Result.nodeIds.length === nodes.length) {
      console.log(`[ExecutionOrderManager] ✅ TIER 2: Using registry-driven category order (${tier2Result.nodeIds.length} nodes)`);
      return tier2Result;
    } else {
      console.warn(`[ExecutionOrderManager] ⚠️  TIER 2: Category order incomplete (${tier2Result.nodeIds.length}/${nodes.length} nodes), falling back to TIER 3`);
    }
    
    // ✅ TIER 3: Preserve node array order (LAST RESORT)
    // DSL compiler already creates nodes in correct order: trigger → data → transformation → output
    console.log(`[ExecutionOrderManager] ✅ TIER 3: Using node array order (${nodes.length} nodes)`);
    return this.buildOrderFromNodeArray(workflow);
  }
  
  /**
   * Insert node into execution order at correct position
   * Uses registry to determine where node should execute
   */
  insertNode(
    order: ExecutionOrder,
    node: WorkflowNode,
    positionHint: 'before' | 'after' | 'replace' = 'after',
    referenceNodeId?: string
  ): ExecutionOrder {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const category = nodeDef?.category || '';
    
    // Determine insertion position using registry
    let insertIndex = -1;
    
    if (referenceNodeId && positionHint !== 'replace') {
      const refIndex = order.nodeIds.indexOf(referenceNodeId);
      if (refIndex >= 0) {
        insertIndex = positionHint === 'before' ? refIndex : refIndex + 1;
      }
    }
    
    // If no reference or reference not found, use registry-based positioning
    if (insertIndex < 0) {
      insertIndex = this.findInsertionPosition(order, node, category);
    }
    
    // Insert node
    const newOrder = [...order.nodeIds];
    if (positionHint === 'replace' && referenceNodeId) {
      const refIndex = newOrder.indexOf(referenceNodeId);
      if (refIndex >= 0) {
        newOrder[refIndex] = node.id;
      } else {
        newOrder.splice(insertIndex, 0, node.id);
      }
    } else {
      newOrder.splice(insertIndex, 0, node.id);
    }
    
    // Update dependencies
    const newDependencies = new Map(order.dependencies);
    const nodeDeps = this.getDependencies(node.id, { nodes: [node], edges: [] } as Workflow);
    newDependencies.set(node.id, nodeDeps);
    
    // Update metadata
    const newMetadata = { ...order.metadata };
    if (nodeDef?.isBranching) {
      if (!newMetadata.branchingNodeIds.includes(node.id)) {
        newMetadata.branchingNodeIds = [...newMetadata.branchingNodeIds, node.id];
      }
    }
    if (category === 'trigger') {
      newMetadata.triggerNodeId = node.id;
    }
    
    return {
      nodeIds: newOrder,
      dependencies: newDependencies,
      metadata: newMetadata,
    };
  }
  
  /**
   * Remove node from execution order
   */
  removeNode(order: ExecutionOrder, nodeId: string): ExecutionOrder {
    const newOrder = order.nodeIds.filter(id => id !== nodeId);
    const newDependencies = new Map(order.dependencies);
    newDependencies.delete(nodeId);
    
    // Remove from dependencies of other nodes
    newDependencies.forEach((deps, key) => {
      if (deps.includes(nodeId)) {
        newDependencies.set(key, deps.filter(id => id !== nodeId));
      }
    });
    
    // Update metadata
    const newMetadata = { ...order.metadata };
    newMetadata.branchingNodeIds = newMetadata.branchingNodeIds.filter(id => id !== nodeId);
    newMetadata.mergeNodeIds = newMetadata.mergeNodeIds.filter(id => id !== nodeId);
    newMetadata.terminalNodeIds = newMetadata.terminalNodeIds.filter(id => id !== nodeId);
    if (newMetadata.triggerNodeId === nodeId) {
      delete newMetadata.triggerNodeId;
    }
    
    return {
      nodeIds: newOrder,
      dependencies: newDependencies,
      metadata: newMetadata,
    };
  }
  
  /**
   * Get execution order as array of node IDs
   */
  getOrderedNodeIds(order: ExecutionOrder): string[] {
    return order.nodeIds;
  }
  
  /**
   * Get dependencies for a node (what must execute before it)
   * Uses registry to determine dependencies
   */
  getDependencies(nodeId: string, workflow: Workflow): string[] {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return [];
    
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const category = nodeDef?.category || '';
    
    // Registry-driven dependency rules
    if (category === 'trigger') {
      return []; // Triggers have no dependencies
    }
    
    // Find nodes that should execute before this node
    const dependencies: string[] = [];
    
    // Data sources depend on triggers
    if (category === 'data') {
      const triggers = workflow.nodes.filter(n => {
        const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        return unifiedNodeRegistry.get(t)?.category === 'trigger';
      });
      dependencies.push(...triggers.map(n => n.id));
    }
    
    // Transformations depend on data sources (or previous transformations)
    if (category === 'transformation' || category === 'ai') {
      const dataSources = workflow.nodes.filter(n => {
        const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        const def = unifiedNodeRegistry.get(t);
        return def?.category === 'data' || def?.category === 'transformation' || def?.category === 'ai';
      });
      dependencies.push(...dataSources.map(n => n.id));
    }
    
    // Outputs depend on transformations/data sources
    if (category === 'communication' || nodeType === 'log_output') {
      const sources = workflow.nodes.filter(n => {
        const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        const def = unifiedNodeRegistry.get(t);
        return def?.category === 'transformation' || def?.category === 'ai' || def?.category === 'data';
      });
      dependencies.push(...sources.map(n => n.id));
    }
    
    // Also check edges for explicit dependencies
    const incomingEdges = (workflow.edges || []).filter(e => e.target === nodeId);
    incomingEdges.forEach(edge => {
      if (!dependencies.includes(edge.source)) {
        dependencies.push(edge.source);
      }
    });
    
    return dependencies;
  }
  
  /**
   * Registry-driven: Check if edge should create dependency
   */
  private shouldCreateDependency(source: WorkflowNode, target: WorkflowNode): boolean {
    const sourceType = unifiedNormalizeNodeTypeString(source.type || source.data?.type || '');
    const targetType = unifiedNormalizeNodeTypeString(target.type || target.data?.type || '');
    
    const sourceDef = unifiedNodeRegistry.get(sourceType);
    const targetDef = unifiedNodeRegistry.get(targetType);
    
    if (!sourceDef || !targetDef) return false;
    
    const sourceCategory = sourceDef.category;
    const targetCategory = targetDef.category;
    
    // Registry-driven dependency rules
    // Triggers can connect to data sources
    if (sourceCategory === 'trigger' && targetCategory === 'data') return true;
    
    // Data sources can connect to transformations
    if (sourceCategory === 'data' && (targetCategory === 'transformation' || targetCategory === 'ai')) return true;
    
    // Transformations can connect to other transformations or outputs
    if (sourceCategory === 'transformation' || sourceCategory === 'ai') {
      if (targetCategory === 'transformation' || targetCategory === 'ai' || targetCategory === 'communication') return true;
    }
    
    // Any node can connect to merge
    if (targetType === 'merge' || (targetDef.tags || []).includes('merge')) return true;
    
    // Branching nodes (if_else, switch) can connect to multiple targets
    if (sourceDef.isBranching) return true;
    
    return false;
  }
  
  /**
   * Registry-driven: Get node priority for topological sort
   * Lower number = higher priority (executes first)
   */
  private getNodePriority(node: WorkflowNode): number {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const category = nodeDef?.category || '';
    
    // Priority order: trigger (0) < data (1) < transformation (2) < output (3)
    const priorityMap: Record<string, number> = {
      'trigger': 0,
      'data': 1,
      'transformation': 2,
      'ai': 2,
      'communication': 3,
      'utility': 3,
      'logic': 1, // Logic nodes (if_else, switch) execute early
    };
    
    return priorityMap[category] ?? 99;
  }
  
  /**
   * Find insertion position for node based on registry category
   */
  private findInsertionPosition(order: ExecutionOrder, node: WorkflowNode, category: string): number {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const priority = this.getNodePriority(node);
    
    // Find first node with equal or higher priority
    for (let i = 0; i < order.nodeIds.length; i++) {
      // Would need workflow to get node types, but for now use simple insertion
      // This will be refined when we have workflow context
    }
    
    // Default: insert at end
    return order.nodeIds.length;
  }
  
  /**
   * ✅ CRITICAL FIX: Build implicit dependencies from DSL structure when no edges exist
   * Order: trigger → data → transformation/ai → communication/output
   * This ensures correct execution order for workflows created from DSL
   * 
   * Creates a linear chain: trigger → first data → first transformation → first output
   * If multiple nodes in a category, creates dependencies from all previous category nodes
   */
  private buildImplicitDependencies(
    nodes: WorkflowNode[],
    dependencies: Map<string, string[]>,
    inDegree: Map<string, number>
  ): void {
    // Categorize nodes by ROLE using capabilities (registry + capability registry)
    const triggerNodes: WorkflowNode[] = [];
    const dataNodes: WorkflowNode[] = [];
    const transformationNodes: WorkflowNode[] = [];
    const outputNodes: WorkflowNode[] = [];
    
    nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const category = nodeDef?.category || '';

      // ✅ UNIVERSAL: Prioritize intendedCapability from metadata (AI-determined, context-aware)
      // This is the PRIMARY source of truth for multi-capability nodes
      const { NodeMetadataHelper } = require('../../core/types/node-metadata');
      const metadata = NodeMetadataHelper.getMetadata(node);
      const intendedCapability = metadata?.dsl?.intendedCapability;

      // Use capability registry to derive semantic role (data_source / transformation / output)
      // This is UNIVERSAL – works for any node type.
      // ✅ FALLBACK: Only use capability registry if intendedCapability not available
      let capabilities: string[] = [];
      try {
        // Lazy import to avoid hard dependency at startup
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { nodeCapabilityRegistryDSL } = require('../../services/ai/node-capability-registry-dsl');
        capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType) || [];
      } catch {
        capabilities = [];
      }
      const capsLower = capabilities.map(c => c.toLowerCase());

      const isTriggerRole =
        capsLower.includes('trigger') ||
        category === 'trigger';

      // ✅ UNIVERSAL: Use intendedCapability if available (AI-determined, context-aware)
      // Otherwise fall back to capability-based classification
      const isDataSourceRole = intendedCapability === 'data_source' || (
        capsLower.includes('data_source') ||
        capsLower.includes('read_data') ||
        category === 'data'
      );

      const isTransformationRole = intendedCapability === 'transformation' || (
        capsLower.includes('transformation') ||
        capsLower.includes('ai_processing') ||
        category === 'ai' ||
        category === 'transformation' ||
        category === 'logic'
      );

      // ✅ UNIVERSAL: Use intendedCapability if available (AI-determined, context-aware)
      // Otherwise fall back to capability-based classification
      const isOutputRole = intendedCapability === 'output' || (
        (!isDataSourceRole && (
          capsLower.includes('output') ||
          capsLower.includes('write_data') ||
          capsLower.includes('send_email') ||
          capsLower.includes('send_post') ||
          capsLower.includes('send_message') ||
          capsLower.includes('notification') ||
          capsLower.includes('terminal') ||
          category === 'communication' ||
          category === 'utility'
        )) ||
        nodeType === 'log_output' // log_output is always output, even if it has data_source capability
      );
      
      if (isTriggerRole) {
        triggerNodes.push(node);
      } else if (isDataSourceRole) {
        dataNodes.push(node);
      } else if (isTransformationRole) {
        transformationNodes.push(node);
      } else if (isOutputRole) {
        outputNodes.push(node);
      }
    });
    
    // Build implicit dependencies based on DSL structure:
    // Create linear chain: trigger → data → transformation → output
    
    // 1. Data nodes depend on trigger nodes (all triggers → all data nodes)
    if (triggerNodes.length > 0 && dataNodes.length > 0) {
      dataNodes.forEach(dataNode => {
        triggerNodes.forEach(triggerNode => {
          const currentDeps = dependencies.get(dataNode.id) || [];
          if (!currentDeps.includes(triggerNode.id)) {
            dependencies.set(dataNode.id, [...currentDeps, triggerNode.id]);
            inDegree.set(dataNode.id, (inDegree.get(dataNode.id) || 0) + 1);
          }
        });
      });
    }
    
    // 2. Transformation nodes depend on data nodes (or trigger if no data)
    if (transformationNodes.length > 0) {
      const sourceNodes = dataNodes.length > 0 ? dataNodes : triggerNodes;
      if (sourceNodes.length > 0) {
        transformationNodes.forEach(transformationNode => {
          sourceNodes.forEach(sourceNode => {
            const currentDeps = dependencies.get(transformationNode.id) || [];
            if (!currentDeps.includes(sourceNode.id)) {
              dependencies.set(transformationNode.id, [...currentDeps, sourceNode.id]);
              inDegree.set(transformationNode.id, (inDegree.get(transformationNode.id) || 0) + 1);
            }
          });
        });
      }
    }
    
    // 3. Output nodes depend on transformation nodes (or data if no transformation, or trigger if neither)
    // ✅ CRITICAL: Separate log_output from other outputs - log_output depends on ALL other outputs
    const logOutputNodes = outputNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'log_output';
    });
    
    const nonLogOutputNodes = outputNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType !== 'log_output';
    });
    
    // 3a. Non-log_output outputs depend on transformation/data/trigger
    if (nonLogOutputNodes.length > 0) {
      const sourceNodes = transformationNodes.length > 0 
        ? transformationNodes 
        : (dataNodes.length > 0 ? dataNodes : triggerNodes);
      
      if (sourceNodes.length > 0) {
        nonLogOutputNodes.forEach(outputNode => {
          sourceNodes.forEach(sourceNode => {
            const currentDeps = dependencies.get(outputNode.id) || [];
            if (!currentDeps.includes(sourceNode.id)) {
              dependencies.set(outputNode.id, [...currentDeps, sourceNode.id]);
              inDegree.set(outputNode.id, (inDegree.get(outputNode.id) || 0) + 1);
            }
          });
        });
      }
    }
    
    // 3b. log_output depends on ALL non-log_output outputs (or transformation/data/trigger if no other outputs)
    if (logOutputNodes.length > 0) {
      const sourceNodes = nonLogOutputNodes.length > 0
        ? nonLogOutputNodes
        : (transformationNodes.length > 0 
          ? transformationNodes 
          : (dataNodes.length > 0 ? dataNodes : triggerNodes));
      
      if (sourceNodes.length > 0) {
        logOutputNodes.forEach(logOutputNode => {
          sourceNodes.forEach(sourceNode => {
            const currentDeps = dependencies.get(logOutputNode.id) || [];
            if (!currentDeps.includes(sourceNode.id)) {
              dependencies.set(logOutputNode.id, [...currentDeps, sourceNode.id]);
              inDegree.set(logOutputNode.id, (inDegree.get(logOutputNode.id) || 0) + 1);
            }
          });
        });
      }
    }
  }
  
  /**
   * ✅ TIER 1: Build execution order from DSL execution steps (PRIMARY SOURCE OF TRUTH)
   * Maps stepRef to nodeId and sorts by explicit order from DSL
   */
  private buildOrderFromDSLSteps(
    workflow: Workflow,
    dslExecutionOrder: Array<{ stepId: string; stepType: string; stepRef: string; order: number; dependsOn?: string[] }>
  ): ExecutionOrder {
    const nodes = workflow.nodes || [];
    const dependencies = new Map<string, string[]>();
    
    // Build map: stepRef → nodeId
    const stepRefToNodeId = new Map<string, string>();
    const nodeIdToStep = new Map<string, typeof dslExecutionOrder[0]>();
    
    // Map trigger node
    const triggerNode = nodes.find(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    if (triggerNode) {
      const triggerStep = dslExecutionOrder.find(s => s.stepRef === 'trigger');
      if (triggerStep) {
        stepRefToNodeId.set('trigger', triggerNode.id);
        nodeIdToStep.set(triggerNode.id, triggerStep);
      }
    }
    
    // Map data source, transformation, and output nodes by DSL ID
    // Access metadata from node.data.config (NodeMetadataHelper format)
    const { NodeMetadataHelper } = require('../types/node-metadata');
    
    for (const node of nodes) {
      const nodeMetadata = NodeMetadataHelper.getMetadata(node);
      const dslId = nodeMetadata?.dsl?.dslId;
      const stepRef = dslId || (node.data as any)?.stepRef;
      
      if (stepRef) {
        const step = dslExecutionOrder.find(s => s.stepRef === stepRef);
        if (step) {
          stepRefToNodeId.set(stepRef, node.id);
          nodeIdToStep.set(node.id, step);
        }
      }
    }
    
    // Sort nodes by DSL execution order
    const orderedNodeIds = dslExecutionOrder
      .map(step => stepRefToNodeId.get(step.stepRef))
      .filter((nodeId): nodeId is string => nodeId !== undefined);
    
    // Build dependencies from DSL dependsOn
    for (const step of dslExecutionOrder) {
      const nodeId = stepRefToNodeId.get(step.stepRef);
      if (!nodeId || !step.dependsOn) continue;
      
      const stepDependencies = step.dependsOn
        .map(depStepRef => stepRefToNodeId.get(depStepRef))
        .filter((depNodeId): depNodeId is string => depNodeId !== undefined);
      
      if (stepDependencies.length > 0) {
        dependencies.set(nodeId, stepDependencies);
      }
    }
    
    // Build metadata
    const triggerNodeId = orderedNodeIds.find(id => {
      const step = nodeIdToStep.get(id);
      return step?.stepType === 'trigger';
    });
    
    const terminalNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const tags = nodeDef?.tags || [];
      return tags.includes('terminal') || nodeDef?.category === 'utility';
    });
    
    const branchingNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.isBranching === true;
    });
    
    const mergeNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'merge' || (unifiedNodeRegistry.get(nodeType)?.tags || []).includes('merge');
    });
    
    return {
      nodeIds: orderedNodeIds,
      dependencies,
      metadata: {
        triggerNodeId,
        terminalNodeIds: terminalNodes.map(n => n.id),
        branchingNodeIds: branchingNodes.map(n => n.id),
        mergeNodeIds: mergeNodes.map(n => n.id),
      },
    };
  }
  
  /**
   * ✅ TIER 2: Build execution order from registry-driven category ordering (SECONDARY FALLBACK)
   * Sorts by category: trigger → data → transformation → output
   */
  private buildOrderFromCategories(workflow: Workflow): ExecutionOrder {
    const nodes = workflow.nodes || [];
    const dependencies = new Map<string, string[]>();
    
    // Category priority: trigger (0) → data (1) → transformation (2) → output (3) → utility (4)
    const categoryPriority: Record<string, number> = {
      trigger: 0,
      data: 1,
      transformation: 2,
      output: 3,
      utility: 4,
    };
    
    // Sort nodes by category priority
    const sortedNodes = [...nodes].sort((a, b) => {
      const nodeTypeA = unifiedNormalizeNodeTypeString(a.type || a.data?.type || '');
      const nodeTypeB = unifiedNormalizeNodeTypeString(b.type || b.data?.type || '');
      
      const nodeDefA = unifiedNodeRegistry.get(nodeTypeA);
      const nodeDefB = unifiedNodeRegistry.get(nodeTypeB);
      
      const categoryA = nodeDefA?.category || 'utility';
      const categoryB = nodeDefB?.category || 'utility';
      
      const priorityA = categoryPriority[categoryA] ?? 99;
      const priorityB = categoryPriority[categoryB] ?? 99;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same category, preserve original order
      return 0;
    });
    
    const orderedNodeIds = sortedNodes.map(n => n.id);
    
    // Build dependencies: each node depends on previous node in same category or previous category
    for (let i = 1; i < sortedNodes.length; i++) {
      const currentNode = sortedNodes[i];
      const previousNode = sortedNodes[i - 1];
      
      const currentDeps = dependencies.get(currentNode.id) || [];
      if (!currentDeps.includes(previousNode.id)) {
        dependencies.set(currentNode.id, [...currentDeps, previousNode.id]);
      }
    }
    
    // Build metadata
    const triggerNode = sortedNodes.find(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    const terminalNodes = sortedNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const tags = nodeDef?.tags || [];
      return tags.includes('terminal') || nodeDef?.category === 'utility';
    });
    
    const branchingNodes = sortedNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.isBranching === true;
    });
    
    const mergeNodes = sortedNodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'merge' || (unifiedNodeRegistry.get(nodeType)?.tags || []).includes('merge');
    });
    
    return {
      nodeIds: orderedNodeIds,
      dependencies,
      metadata: {
        triggerNodeId: triggerNode?.id,
        terminalNodeIds: terminalNodes.map(n => n.id),
        branchingNodeIds: branchingNodes.map(n => n.id),
        mergeNodeIds: mergeNodes.map(n => n.id),
      },
    };
  }
  
  /**
   * ✅ TIER 3: Build execution order from node array order (LAST RESORT)
   * DSL compiler already creates nodes in correct order: trigger → data → transformation → output
   */
  private buildOrderFromNodeArray(workflow: Workflow): ExecutionOrder {
    const nodes = workflow.nodes || [];
    const dependencies = new Map<string, string[]>();
    
    // Use node array order directly (DSL structure is already correct)
    const orderedNodeIds = nodes.map(n => n.id);
    
    // Build dependencies: each node depends on previous node
    for (let i = 1; i < nodes.length; i++) {
      const currentNode = nodes[i];
      const previousNode = nodes[i - 1];
      
      dependencies.set(currentNode.id, [previousNode.id]);
    }
    
    // Build metadata
    const triggerNode = nodes.find(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.category === 'trigger';
    });
    
    const terminalNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      const tags = nodeDef?.tags || [];
      return tags.includes('terminal') || nodeDef?.category === 'utility';
    });
    
    const branchingNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      return nodeDef?.isBranching === true;
    });
    
    const mergeNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'merge' || (unifiedNodeRegistry.get(nodeType)?.tags || []).includes('merge');
    });
    
    return {
      nodeIds: orderedNodeIds,
      dependencies,
      metadata: {
        triggerNodeId: triggerNode?.id,
        terminalNodeIds: terminalNodes.map(n => n.id),
        branchingNodeIds: branchingNodes.map(n => n.id),
        mergeNodeIds: mergeNodes.map(n => n.id),
      },
    };
  }
}

// Export singleton instance
export const executionOrderManager: ExecutionOrderManager = new ExecutionOrderManagerImpl();
