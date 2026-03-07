/**
 * ✅ ROOT-LEVEL: Linear Workflow Connector
 * 
 * This ENFORCES single linear path for all workflows.
 * 
 * Architecture Rules:
 * 1. Trigger is ALWAYS first (position x=0, y=0)
 * 2. All nodes connected linearly (one after another)
 * 3. No multi-path (except merge/switch which have special logic)
 * 4. No duplicate nodes (same operation)
 * 5. All nodes MUST be connected
 * 
 * This replaces complex connection logic with simple, guaranteed linear flow.
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface LinearConnectionResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  removedDuplicates: string[];
}

/**
 * ✅ ROOT-LEVEL: Linear Workflow Connector
 * 
 * Guarantees:
 * - Trigger is first
 * - All nodes connected linearly
 * - No duplicates
 * - No disconnected nodes
 */
export class LinearWorkflowConnector {
  /**
   * ✅ CORE: Connect nodes in linear path
   * 
   * Rules:
   * 1. Trigger is first (position x=0, y=0)
   * 2. Nodes connected sequentially: trigger → node1 → node2 → node3 → ...
   * 3. No branches (except merge/switch)
   * 4. All nodes connected
   */
  connectLinearly(nodes: WorkflowNode[]): LinearConnectionResult {
    if (nodes.length === 0) {
      return { nodes: [], edges: [], removedDuplicates: [] };
    }
    
    // Step 1: Remove duplicate nodes (same operation)
    const { uniqueNodes, removedDuplicates } = this.removeDuplicateNodes(nodes);
    
    // Step 2: Ensure trigger is first
    const { orderedNodes, triggerNode } = this.orderNodesWithTriggerFirst(uniqueNodes);
    
    if (!triggerNode) {
      throw new Error('[LinearWorkflowConnector] ❌ No trigger node found. Workflow must start with a trigger.');
    }
    
    // Step 3: Position nodes linearly (trigger at x=0, y=0)
    const positionedNodes = this.positionNodesLinearly(orderedNodes, triggerNode);
    
    // Step 4: Create linear edges (trigger → node1 → node2 → ...)
    const edges = this.createLinearEdges(positionedNodes);
    
    // Step 5: Validate all nodes are connected
    this.validateAllNodesConnected(positionedNodes, edges);
    
    console.log(
      `[LinearWorkflowConnector] ✅ Connected ${positionedNodes.length} nodes linearly ` +
      `(${removedDuplicates.length} duplicates removed)`
    );
    
    return {
      nodes: positionedNodes,
      edges,
      removedDuplicates,
    };
  }
  
  /**
   * ✅ CORE: Remove duplicate nodes (same operation)
   * 
   * Detects nodes that do the same operation:
   * - HubSpot + Salesforce (both CRM)
   * - Gmail + Email (both email)
   * - Slack + Discord (both messaging)
   * 
   * Keeps the first occurrence, removes duplicates.
   */
  private removeDuplicateNodes(nodes: WorkflowNode[]): {
    uniqueNodes: WorkflowNode[];
    removedDuplicates: string[];
  } {
    const operationGroups = new Map<string, WorkflowNode[]>(); // operation -> nodes
    const uniqueNodes: WorkflowNode[] = [];
    const removedDuplicates: string[] = [];
    
    // Group nodes by operation category
    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const operation = this.getNodeOperation(nodeType);
      
      if (!operationGroups.has(operation)) {
        operationGroups.set(operation, []);
      }
      operationGroups.get(operation)!.push(node);
    }
    
    // For each operation group, keep only the first node
    for (const [operation, groupNodes] of operationGroups.entries()) {
      if (groupNodes.length > 1) {
        // Multiple nodes doing same operation - keep first, remove rest
        uniqueNodes.push(groupNodes[0]);
        const duplicates = groupNodes.slice(1);
        removedDuplicates.push(...duplicates.map(n => `${unifiedNormalizeNodeType(n)} (${operation})`));
        
        console.warn(
          `[LinearWorkflowConnector] ⚠️  Found ${groupNodes.length} nodes doing same operation "${operation}": ` +
          `${groupNodes.map(n => unifiedNormalizeNodeType(n)).join(', ')}. ` +
          `Keeping first (${unifiedNormalizeNodeType(groupNodes[0])}), removing ${duplicates.length} duplicate(s).`
        );
      } else {
        // Only one node for this operation - keep it
        uniqueNodes.push(groupNodes[0]);
      }
    }
    
    return { uniqueNodes, removedDuplicates };
  }
  
  /**
   * Get operation category for a node type
   * 
   * Groups nodes by what they do:
   * - CRM: hubspot, salesforce, zoho_crm, pipedrive
   * - Email: google_gmail, email, outlook
   * - Messaging: slack_message, discord, telegram
   * - etc.
   */
  private getNodeOperation(nodeType: string): string {
    // CRM nodes
    if (['hubspot', 'salesforce', 'zoho_crm', 'pipedrive', 'freshdesk'].includes(nodeType)) {
      return 'crm';
    }
    
    // Email nodes
    if (['google_gmail', 'email', 'outlook'].includes(nodeType)) {
      return 'email';
    }
    
    // Messaging nodes
    if (['slack_message', 'discord', 'telegram', 'microsoft_teams', 'whatsapp_cloud'].includes(nodeType)) {
      return 'messaging';
    }
    
    // Database nodes
    if (['database_read', 'database_write', 'supabase', 'postgresql', 'mysql', 'mongodb'].includes(nodeType)) {
      return 'database';
    }
    
    // Sheet nodes
    if (['google_sheets', 'airtable'].includes(nodeType)) {
      return 'sheet';
    }
    
    // AI nodes
    if (['ai_agent', 'ai_chat_model', 'text_summarizer', 'sentiment_analyzer'].includes(nodeType)) {
      return 'ai_processing';
    }
    
    // Each node type is its own operation by default
    return nodeType;
  }
  
  /**
   * Order nodes with trigger first
   */
  private orderNodesWithTriggerFirst(nodes: WorkflowNode[]): {
    orderedNodes: WorkflowNode[];
    triggerNode: WorkflowNode | null;
  } {
    const triggerNode = nodes.find(n => {
      const nodeType = unifiedNormalizeNodeType(n);
      const def = unifiedNodeRegistry.get(nodeType);
      return def?.category === 'trigger' || nodeType.includes('trigger');
    });
    
    if (!triggerNode) {
      return { orderedNodes: nodes, triggerNode: null };
    }
    
    const nonTriggerNodes = nodes.filter(n => n.id !== triggerNode.id);
    
    // Order: trigger first, then non-trigger nodes
    return {
      orderedNodes: [triggerNode, ...nonTriggerNodes],
      triggerNode,
    };
  }
  
  /**
   * Position nodes linearly
   * 
   * Trigger at (0, 0)
   * Each subsequent node at (x + 250, 0) - horizontal line
   */
  private positionNodesLinearly(
    nodes: WorkflowNode[],
    triggerNode: WorkflowNode
  ): WorkflowNode[] {
    return nodes.map((node, index) => {
      if (node.id === triggerNode.id) {
        // Trigger at (0, 0)
        return {
          ...node,
          position: { x: 0, y: 0 },
        };
      }
      
      // Other nodes at (250 * index, 0) - horizontal line
      return {
        ...node,
        position: { x: 250 * index, y: 0 },
      };
    });
  }
  
  /**
   * Create linear edges
   * 
   * Connects: trigger → node1 → node2 → node3 → ...
   * 
   * Special handling:
   * - merge: can have multiple inputs (allowed)
   * - switch: can have multiple outputs (allowed)
   * - if_else: can have 2 outputs (true/false - allowed)
   */
  private createLinearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
    if (nodes.length <= 1) {
      return []; // No edges needed for single node
    }
    
    const edges: WorkflowEdge[] = [];
    
    // Connect nodes sequentially: node[i] → node[i+1]
    for (let i = 0; i < nodes.length - 1; i++) {
      const sourceNode = nodes[i];
      const targetNode = nodes[i + 1];
      
      const sourceType = unifiedNormalizeNodeType(sourceNode);
      const targetType = unifiedNormalizeNodeType(targetNode);
      
      // Skip if target is merge (can have multiple inputs - handled separately)
      if (targetType === 'merge') {
        continue; // Merge will be connected separately
      }
      
      // ✅ UNIVERSAL: Use Universal Edge Creation Service
      const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
      
      // Get handles
      const { sourceHandle, targetHandle } = this.resolveHandles(sourceType, targetType);
      
      const edgeResult = universalEdgeCreationService.createEdge({
        sourceNode,
        targetNode,
        sourceHandle,
        targetHandle,
        edgeType: 'default',
        existingEdges: edges,
        allNodes: nodes,
      });
      
      if (edgeResult.success && edgeResult.edge) {
        edges.push(edgeResult.edge);
      }
    }
    
    // ✅ PHASE 1 FIX: Use registry to find merge nodes instead of hardcoded check
    const mergeNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'merge' || unifiedNodeRegistry.hasTag(nodeType, 'merge');
    });
    for (const mergeNode of mergeNodes) {
      // Connect all previous nodes to merge
      const mergeIndex = nodes.findIndex(n => n.id === mergeNode.id);
      for (let i = 0; i < mergeIndex; i++) {
        const sourceNode = nodes[i];
        const sourceType = unifiedNormalizeNodeType(sourceNode);
        const { sourceHandle, targetHandle } = this.resolveHandles(sourceType, 'merge');
        
        // Check if edge already exists
        if (!edges.some(e => e.source === sourceNode.id && e.target === mergeNode.id)) {
          edges.push({
            id: `edge-${sourceNode.id}-${mergeNode.id}`,
            source: sourceNode.id,
            target: mergeNode.id,
            type: 'default',
            sourceHandle,
            targetHandle,
          });
        }
      }
    }
    
    // ✅ ROOT-LEVEL FIX: Skip switch nodes - they are handled by DSL compiler with case-specific handles
    // Switch nodes have dynamic output ports (one per case: "active", "pending", etc.)
    // Linear connector cannot create edges for switch nodes because:
    // 1. It doesn't know the cases (they're extracted from prompt)
    // 2. It would use default "output" handle (which doesn't exist on switch nodes)
    // 3. Switch edges must use case-specific handles (like if_else uses "true"/"false")
    // 
    // Switch nodes are handled by:
    // - workflow-dsl-compiler.ts: Creates edges with case-specific handles during compilation
    // - production-workflow-builder.ts: Creates edges with case-specific handles during injection
    //
    // DO NOT create edges here - it will cause React Flow errors: "Couldn't create edge for source handle id: 'output'"
    // ✅ PHASE 1 FIX: Use registry to find switch nodes instead of hardcoded check
    const switchNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'switch' || unifiedNodeRegistry.hasTag(nodeType, 'switch');
    });
    if (switchNodes.length > 0) {
      console.log(`[LinearWorkflowConnector] ⏭️  Skipping ${switchNodes.length} switch node(s) - handled by DSL compiler with case-specific handles`);
    }
    
    // ✅ PHASE 1 FIX: Use registry to find if_else nodes instead of hardcoded check
    const ifElseNodes = nodes.filter(n => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return nodeType === 'if_else' || unifiedNodeRegistry.hasTag(nodeType, 'if') || unifiedNodeRegistry.hasTag(nodeType, 'conditional');
    });
    for (const ifElseNode of ifElseNodes) {
      const ifElseIndex = nodes.findIndex(n => n.id === ifElseNode.id);
      if (ifElseIndex < nodes.length - 1) {
        // Connect true path to next node
        const targetNode = nodes[ifElseIndex + 1];
        const targetType = unifiedNormalizeNodeType(targetNode);
        const { sourceHandle, targetHandle } = this.resolveHandles('if_else', targetType);
        
        // ✅ UNIVERSAL: Use Universal Edge Creation Service
        const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
        
        const edgeResult = universalEdgeCreationService.createEdge({
          sourceNode: ifElseNode,
          targetNode,
          sourceHandle: 'true', // if_else true path
          targetHandle,
          edgeType: 'true',
          existingEdges: edges,
          allNodes: nodes,
        });
        
        if (edgeResult.success && edgeResult.edge) {
          edges.push(edgeResult.edge);
        }
      }
    }
    
    return edges;
  }
  
  /**
   * Resolve handles for edge connection
   */
  private resolveHandles(sourceType: string, targetType: string): {
    sourceHandle: string;
    targetHandle: string;
  } {
    // Get output fields from source
    const sourceDef = unifiedNodeRegistry.get(sourceType);
    const sourceOutputs = sourceDef?.outputSchema?.default?.schema?.properties
      ? Object.keys(sourceDef.outputSchema.default.schema.properties)
      : ['output', 'data'];
    
    // Get input fields from target
    const targetDef = unifiedNodeRegistry.get(targetType);
    const targetInputs = targetDef?.inputSchema
      ? Object.keys(targetDef.inputSchema)
      : ['input', 'data'];
    
    // Try to find matching field
    for (const outputField of sourceOutputs) {
      if (targetInputs.includes(outputField)) {
        return { sourceHandle: outputField, targetHandle: outputField };
      }
    }
    
    // Fallback: use common defaults
    const sourceHandle = sourceOutputs[0] || 'output';
    const targetHandle = targetInputs[0] || 'input';
    
    return { sourceHandle, targetHandle };
  }
  
  /**
   * Validate all nodes are connected
   */
  private validateAllNodesConnected(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const nodeIds = new Set(nodes.map(n => n.id));
    const connectedNodes = new Set<string>();
    
    // Add trigger (always connected)
    const triggerNode = nodes.find(n => {
      const nodeType = unifiedNormalizeNodeType(n);
      const def = unifiedNodeRegistry.get(nodeType);
      return def?.category === 'trigger';
    });
    if (triggerNode) {
      connectedNodes.add(triggerNode.id);
    }
    
    // Add nodes with incoming edges
    for (const edge of edges) {
      connectedNodes.add(edge.target);
    }
    
    // Add nodes with outgoing edges
    for (const edge of edges) {
      connectedNodes.add(edge.source);
    }
    
    // Check for disconnected nodes
    const disconnectedNodes = Array.from(nodeIds).filter(id => !connectedNodes.has(id));
    
    if (disconnectedNodes.length > 0) {
      const disconnectedTypes = disconnectedNodes.map(id => {
        const node = nodes.find(n => n.id === id);
        return node ? unifiedNormalizeNodeType(node) : 'unknown';
      });
      
      throw new Error(
        `[LinearWorkflowConnector] ❌ ${disconnectedNodes.length} disconnected node(s) found: ${disconnectedTypes.join(', ')}. ` +
        `All nodes must be connected in linear path.`
      );
    }
  }
}

// Export singleton instance
export const linearWorkflowConnector = new LinearWorkflowConnector();
