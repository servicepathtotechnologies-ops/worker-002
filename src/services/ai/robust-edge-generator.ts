// Robust Edge Generator
// ✅ FIXED: Generates edges using ONLY schema-defined handles (no fallback)

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { randomUUID } from 'crypto';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface WorkflowStructure {
  connections?: Array<{
    source: string;
    target: string;
    outputField?: string;
    inputField?: string;
  }>;
  steps?: Array<{
    id: string;
    type: string;
    next?: string[];
  }>;
}

/**
 * RobustEdgeGenerator - Generates edges using ONLY schema-defined handles
 * ✅ FIXED: No fallback strategies - if compatible handles not found → workflow invalid
 */
export class RobustEdgeGenerator {
  /**
   * Generate edges for workflow
   */
  generateEdgesForWorkflow(
    nodes: WorkflowNode[],
    structure?: WorkflowStructure
  ): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];

    console.log(`[EdgeSystem] Generating edges for ${nodes.length} nodes`);

    // ✅ FIXED: Only use structure connections (no fallback)
    // Edge creation must ONLY use schema-defined handles
    // If compatible handles not found → workflow invalid
    if (structure?.connections && structure.connections.length > 0) {
      const structureEdges = this.createEdgesFromStructure(nodes, structure.connections);
      edges.push(...structureEdges);
      console.log(`[EdgeSystem] Created ${structureEdges.length} edges from structure`);
    } else {
      // ✅ REMOVED: Auto-connect fallback - if no structure connections, workflow is invalid
      throw new Error('No structure connections provided. Edge creation must ONLY use schema-defined handles from structure.');
    }
    
    // ✅ REMOVED: Auto-connect and orphan auto-connect fallback
    // If compatible handles not found → workflow invalid

    // METHOD 4: Validate and repair all edges
    const validatedEdges = this.validateAndRepairEdges(nodes, edges);

    // Log for debugging
    console.log(`[EdgeSystem] Final edge count: ${validatedEdges.length} (from ${edges.length} original)`);
    console.log(`[EdgeSystem] Method used: ${structure?.connections ? 'structure' : 'auto'}`);

    return validatedEdges;
  }

  /**
   * Create edges from structure connections
   */
  private createEdgesFromStructure(
    nodes: WorkflowNode[],
    connections: Array<{
      source: string;
      target: string;
      outputField?: string;
      inputField?: string;
    }>
  ): WorkflowEdge[] {
    const edges: WorkflowEdge[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const connection of connections) {
      const sourceNode = nodeMap.get(connection.source);
      const targetNode = nodeMap.get(connection.target);

      if (!sourceNode || !targetNode) {
        console.warn(`[EdgeSystem] Connection references non-existent node: ${connection.source} -> ${connection.target}`);
        continue;
      }

      // Skip if edge already exists
      const existingEdge = edges.find(
        e => e.source === connection.source && e.target === connection.target
      );
      if (existingEdge) continue;

      // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
      const sourceNodeType = unifiedNormalizeNodeType(sourceNode);
      const targetNodeType = unifiedNormalizeNodeType(targetNode);
      
      // ✅ PHASE 1 FIX: Use registry to check if source is trigger
      // CRITICAL: Skip edge if trigger → google_sheets (Google Sheets doesn't need input from trigger)
      // Google Sheets only needs spreadsheetId configured, not data input
      const normalizedSourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
      if (unifiedNodeRegistry.isTrigger(normalizedSourceType) && targetNodeType === 'google_sheets') {
        console.log(`[EdgeSystem] Skipping edge from ${normalizedSourceType} to google_sheets (Google Sheets doesn't need input from trigger)`);
        continue;
      }
      
      // ✅ REMOVED: Input/output guessing - use schema-driven resolver only
      
      // ✅ UNIVERSAL: Use Universal Edge Creation Service
      const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
      
      const edgeResult = universalEdgeCreationService.createEdge({
        sourceNode,
        targetNode,
        sourceHandle: connection.outputField,
        targetHandle: connection.inputField,
        existingEdges: edges,
        allNodes: nodes,
      });
      
      if (edgeResult.success && edgeResult.edge) {
        edges.push(edgeResult.edge);
      } else {
        // If handles not provided, try to resolve them
        const { resolveCompatibleHandles } = require('./schema-driven-connection-resolver');
        const resolution = resolveCompatibleHandles(sourceNode, targetNode);
        
        if (resolution.success && resolution.sourceHandle && resolution.targetHandle) {
          const edgeResult2 = universalEdgeCreationService.createEdge({
            sourceNode,
            targetNode,
            sourceHandle: resolution.sourceHandle,
            targetHandle: resolution.targetHandle,
            existingEdges: edges,
            allNodes: nodes,
          });
          
          if (edgeResult2.success && edgeResult2.edge) {
            edges.push(edgeResult2.edge);
          } else {
            throw new Error(`Cannot create edge ${connection.source} → ${connection.target}: ${edgeResult2.error || edgeResult2.reason || 'No compatible handles found'}. Edge creation must ONLY use schema-defined handles.`);
          }
        } else {
          throw new Error(`Cannot create edge ${connection.source} → ${connection.target}: ${edgeResult.error || edgeResult.reason || resolution.error || 'No compatible handles found'}. Edge creation must ONLY use schema-defined handles.`);
        }
      }
    }

    return edges;
  }

  // ✅ REMOVED: autoConnectNodes - no sequential connection fallback
  // Edge creation must ONLY use schema-defined handles

  /**
   * Sort nodes by execution order
   */
  private sortNodesByExecutionOrder(nodes: WorkflowNode[]): WorkflowNode[] {
    const triggerNodes = nodes.filter(n => this.isTriggerNode(n));
    const processingNodes = nodes.filter(n => !this.isTriggerNode(n) && !this.isOutputNode(n));
    const outputNodes = nodes.filter(n => this.isOutputNode(n));

    return [...triggerNodes, ...processingNodes, ...outputNodes];
  }

  // ✅ REMOVED: ensureTriggerConnection - no orphan auto-connect fallback
  // Edge creation must ONLY use schema-defined handles

  // ✅ REMOVED: createEdgeBetweenNodes - no input/output guessing
  // Edge creation must ONLY use schema-defined handles from structure connections

  // ✅ REMOVED: getSourceHandle/getTargetHandle - no input/output guessing
  // Edge creation must ONLY use schema-defined handles from resolveCompatibleHandles

  /**
   * Check if node is a trigger node
   */
  private isTriggerNode(node: WorkflowNode): boolean {
    const nodeType = node.data?.type || node.type;
    const triggerTypes = [
      'manual_trigger',
      'webhook',
      'schedule',
      'interval',
      'chat_trigger',
      'workflow_trigger',
      'form',
      'error_trigger',
    ];
    return triggerTypes.includes(nodeType);
  }

  /**
   * Check if node is an output node
   */
  private isOutputNode(node: WorkflowNode): boolean {
    const nodeType = node.data?.type || node.type;
    const outputTypes = [
      'slack_message',
      'email',
      'discord',
      'log_output',
      'respond_to_webhook',
      'http_response',
    ];
    return outputTypes.includes(nodeType);
  }

  /**
   * Validate and repair edges
   */
  private validateAndRepairEdges(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): WorkflowEdge[] {
    const nodeIds = new Set(nodes.map(n => n.id));

    return edges
      .map(edge => ({
        ...edge,
        // Ensure required properties
        id: edge.id || randomUUID(),
        type: edge.type || 'default',
        sourceHandle: edge.sourceHandle || 'output',
        targetHandle: edge.targetHandle || 'input',
      }))
      .filter(edge => {
        // Remove edges referencing non-existent nodes
        const sourceExists = nodeIds.has(edge.source);
        const targetExists = nodeIds.has(edge.target);

        if (!sourceExists || !targetExists) {
          console.warn(`[EdgeValidation] Removing invalid edge: ${edge.source}->${edge.target}`);
          return false;
        }

        // Remove self-loops (for now)
        if (edge.source === edge.target) {
          console.warn(`[EdgeValidation] Removing self-loop: ${edge.source}`);
          return false;
        }

        return true;
      });
  }
}
