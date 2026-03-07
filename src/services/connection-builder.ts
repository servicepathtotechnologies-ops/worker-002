/**
 * Connection Builder
 * 
 * Automatically builds connections between ordered nodes.
 * 
 * Rules:
 * 1. Sequential flow by default (trigger → node1 → node2 → ...)
 * 2. output(node A) → input(node B)
 * 3. Uses schema-aware handle resolution
 * 4. Supports trigger → first node
 * 5. Validates handles exist
 * 6. Integrates with connection-validator
 * 
 * Example:
 * Trigger → GoogleSheets → LLM → Gmail
 */

import { WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { 
  getNodeHandleContract,
  getDefaultSourceHandle,
  getDefaultTargetHandle,
  validateAndFixEdgeHandles,
  isValidHandle,
  NODE_HANDLE_REGISTRY
} from '../core/utils/node-handle-registry';
import { connectionValidator, ConnectionValidationResult } from './ai/connection-validator';
import { unifiedNormalizeNodeType } from '../core/utils/unified-node-type-normalizer';
import { randomUUID } from 'crypto';
import { fieldMapper, FieldMappingConfig } from './field-mapper';

/**
 * Connection building result
 */
export interface ConnectionBuildResult {
  edges: WorkflowEdge[];
  validationResults: ConnectionValidationResult[];
  errors: string[];
  warnings: string[];
}

/**
 * Connection Builder Class
 */
export class ConnectionBuilder {
  /**
   * Build connections for ordered nodes
   * 
   * @param nodes - Ordered array of nodes (first should be trigger)
   * @param options - Optional configuration
   * @returns Array of edges with validation results
   */
  async buildConnections(
    nodes: WorkflowNode[],
    options?: {
      validate?: boolean; // Default: true
      strict?: boolean; // Default: true - throw on validation errors
    }
  ): Promise<ConnectionBuildResult> {
    const validate = options?.validate !== false; // Default: true
    const strict = options?.strict !== false; // Default: true
    
    console.log(`[ConnectionBuilder] Building connections for ${nodes.length} nodes`);
    
    if (nodes.length === 0) {
      return {
        edges: [],
        validationResults: [],
        errors: [],
        warnings: [],
      };
    }
    
    if (nodes.length === 1) {
      console.log(`[ConnectionBuilder] Only one node, no connections needed`);
      return {
        edges: [],
        validationResults: [],
        errors: [],
        warnings: [],
      };
    }
    
    const edges: WorkflowEdge[] = [];
    const validationResults: ConnectionValidationResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Identify trigger node (first node or node with trigger type)
    const triggerNode = this.findTriggerNode(nodes);
    if (!triggerNode) {
      const error = 'No trigger node found. First node must be a trigger type.';
      errors.push(error);
      if (strict) {
        throw new Error(error);
      }
      return { edges, validationResults, errors, warnings };
    }
    
    console.log(`[ConnectionBuilder] Trigger node: ${triggerNode.id} (${unifiedNormalizeNodeType(triggerNode)})`);
    
    // Get action nodes (all nodes except trigger)
    const actionNodes = nodes.filter(n => n.id !== triggerNode.id);
    
    if (actionNodes.length === 0) {
      console.log(`[ConnectionBuilder] No action nodes to connect`);
      return { edges, validationResults, errors, warnings };
    }
    
    // Connect trigger to first action node
    const firstActionNode = actionNodes[0];
    const triggerEdge = await this.createConnection(
      triggerNode,
      firstActionNode,
      'trigger-to-first'
    );
    
    if (triggerEdge) {
      edges.push(triggerEdge);
      
      // Validate trigger connection
      if (validate) {
        const validation = this.validateConnection(triggerNode, firstActionNode, triggerEdge);
        validationResults.push(validation);
        
        if (!validation.valid) {
          errors.push(...validation.errors);
          if (strict) {
            throw new Error(`Invalid trigger connection: ${validation.errors.join('; ')}`);
          }
        }
        
        if (validation.warnings.length > 0) {
          warnings.push(...validation.warnings);
        }
      }
      
      console.log(`[ConnectionBuilder] Connected trigger → ${firstActionNode.id}`);
    } else {
      const error = `Failed to create connection from trigger ${triggerNode.id} to ${firstActionNode.id}`;
      errors.push(error);
      if (strict) {
        throw new Error(error);
      }
    }
    
    // Connect action nodes sequentially
    for (let i = 0; i < actionNodes.length - 1; i++) {
      const sourceNode = actionNodes[i];
      const targetNode = actionNodes[i + 1];
      
      const edge = await this.createConnection(
        sourceNode,
        targetNode,
        `node-${i + 1}-to-${i + 2}`
      );
      
      if (edge) {
        edges.push(edge);
        
        // Validate connection
        if (validate) {
          const validation = this.validateConnection(sourceNode, targetNode, edge);
          validationResults.push(validation);
          
          if (!validation.valid) {
            errors.push(...validation.errors);
            if (strict) {
              throw new Error(`Invalid connection ${sourceNode.id} → ${targetNode.id}: ${validation.errors.join('; ')}`);
            }
          }
          
          if (validation.warnings.length > 0) {
            warnings.push(...validation.warnings);
          }
        }
        
        console.log(`[ConnectionBuilder] Connected ${sourceNode.id} → ${targetNode.id}`);
      } else {
        const error = `Failed to create connection from ${sourceNode.id} to ${targetNode.id}`;
        errors.push(error);
        if (strict) {
          throw new Error(error);
        }
      }
    }
    
    console.log(`[ConnectionBuilder] Built ${edges.length} connections`);
    
    return {
      edges,
      validationResults,
      errors,
      warnings,
    };
  }
  
  /**
   * Create a connection between two nodes
   * Uses schema-aware handle resolution and automatic field mapping
   */
  private async createConnection(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    connectionName: string
  ): Promise<WorkflowEdge | null> {
    const sourceType = unifiedNormalizeNodeType(sourceNode);
    const targetType = unifiedNormalizeNodeType(targetNode);
    
    // Get valid handles for both nodes
    const sourceContract = getNodeHandleContract(sourceType);
    const targetContract = getNodeHandleContract(targetType);
    
    // Get default handles
    let sourceHandle = getDefaultSourceHandle(sourceType);
    let targetHandle = getDefaultTargetHandle(targetType);
    
    // 🆕 AUTOMATIC FIELD MAPPING: Map fields between nodes
    console.log(`[ConnectionBuilder] Mapping fields from ${sourceNode.id} to ${targetNode.id}`);
    let fieldMapping: FieldMappingConfig | null = null;
    
    try {
      fieldMapping = await fieldMapper.mapFields(sourceNode, targetNode);
      
      // Use field mapping to determine best handles if multiple options exist
      if (fieldMapping.mappings.length > 0) {
        // Find best mapping (highest confidence)
        const bestMapping = fieldMapping.mappings.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );
        
        console.log(`[ConnectionBuilder] Best field mapping: ${bestMapping.sourceField} → ${bestMapping.targetField} (confidence: ${bestMapping.confidence.toFixed(2)}, method: ${bestMapping.method})`);
        
        // If target handle matches a mapped field, use it
        if (targetContract.inputs.includes(bestMapping.targetField)) {
          targetHandle = bestMapping.targetField;
          console.log(`[ConnectionBuilder] Using mapped target handle: ${targetHandle}`);
        }
      }
    } catch (error) {
      console.warn(`[ConnectionBuilder] Field mapping failed:`, error);
      // Continue with default handles
    }
    
    // Validate handles exist
    if (!isValidHandle(sourceType, sourceHandle, true)) {
      console.error(`[ConnectionBuilder] Invalid source handle "${sourceHandle}" for node type "${sourceType}"`);
      console.error(`[ConnectionBuilder] Valid source handles: ${sourceContract.outputs.join(', ')}`);
      
      // Try to use first available output handle
      if (sourceContract.outputs.length > 0) {
        sourceHandle = sourceContract.outputs[0];
        console.log(`[ConnectionBuilder] Using first available source handle: ${sourceHandle}`);
      } else {
        console.error(`[ConnectionBuilder] No valid output handles for source node type "${sourceType}"`);
        return null;
      }
    }
    
    if (!isValidHandle(targetType, targetHandle, false)) {
      console.error(`[ConnectionBuilder] Invalid target handle "${targetHandle}" for node type "${targetType}"`);
      console.error(`[ConnectionBuilder] Valid target handles: ${targetContract.inputs.join(', ')}`);
      
      // Try to use first available input handle
      if (targetContract.inputs.length > 0) {
        targetHandle = targetContract.inputs[0];
        console.log(`[ConnectionBuilder] Using first available target handle: ${targetHandle}`);
      } else {
        console.error(`[ConnectionBuilder] No valid input handles for target node type "${targetType}"`);
        return null;
      }
    }
    
    // Use validateAndFixEdgeHandles to ensure handles are correct
    const fixedHandles = validateAndFixEdgeHandles(
      sourceType,
      targetType,
      sourceHandle,
      targetHandle
    );
    
    // Create edge
    const edge: WorkflowEdge = {
      id: `edge_${randomUUID()}`,
      source: sourceNode.id,
      target: targetNode.id,
      type: 'default',
      sourceHandle: fixedHandles.sourceHandle,
      targetHandle: fixedHandles.targetHandle,
    };
    
    console.log(`[ConnectionBuilder] Created connection: ${sourceNode.id}(${fixedHandles.sourceHandle}) → ${targetNode.id}(${fixedHandles.targetHandle})`);
    
    // Log field mapping summary
    if (fieldMapping && fieldMapping.mappings.length > 0) {
      console.log(`[ConnectionBuilder] Field mappings:`);
      fieldMapping.mappings.forEach(mapping => {
        console.log(`   ${mapping.sourceField} → ${mapping.targetField} (${mapping.method}, ${(mapping.confidence * 100).toFixed(0)}%)`);
      });
    }
    
    return edge;
  }
  
  /**
   * Validate a connection using connection validator
   */
  private validateConnection(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    edge: WorkflowEdge
  ): ConnectionValidationResult {
    return connectionValidator.validateConnection(sourceNode, targetNode, edge);
  }
  
  /**
   * Find trigger node in nodes array
   * Returns first node if it's a trigger, otherwise finds first trigger-type node
   */
  private findTriggerNode(nodes: WorkflowNode[]): WorkflowNode | null {
    if (nodes.length === 0) {
      return null;
    }
    
    const triggerTypes = [
      'manual_trigger',
      'schedule',
      'interval',
      'webhook',
      'form',
      'chat_trigger',
      'workflow_trigger',
      'error_trigger',
    ];
    
    // Check first node
    const firstNode = nodes[0];
    const firstNodeType = unifiedNormalizeNodeType(firstNode);
    if (triggerTypes.includes(firstNodeType)) {
      return firstNode;
    }
    
    // Search for trigger node
    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      if (triggerTypes.includes(nodeType)) {
        console.log(`[ConnectionBuilder] Found trigger node: ${node.id} (${nodeType})`);
        return node;
      }
    }
    
    // If no trigger found, assume first node is trigger (for backward compatibility)
    console.warn(`[ConnectionBuilder] No trigger node found, assuming first node is trigger`);
    return firstNode;
  }
  
  /**
   * Validate all connections in a workflow
   * Wrapper around connectionValidator.validateAllConnections
   */
  validateAllConnections(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = connectionValidator.validateAllConnections(nodes, edges);
    
    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    };
  }
  
  /**
   * Get valid output handles for a node type
   */
  getOutputHandles(nodeType: string): string[] {
    const contract = getNodeHandleContract(nodeType);
    return contract.outputs;
  }
  
  /**
   * Get valid input handles for a node type
   */
  getInputHandles(nodeType: string): string[] {
    const contract = getNodeHandleContract(nodeType);
    return contract.inputs;
  }
  
  /**
   * Check if a connection is possible between two node types
   */
  canConnect(sourceType: string, targetType: string): {
    possible: boolean;
    reason?: string;
    suggestedSourceHandle?: string;
    suggestedTargetHandle?: string;
  } {
    const sourceContract = getNodeHandleContract(sourceType);
    const targetContract = getNodeHandleContract(targetType);
    
    // Check if source has outputs
    if (sourceContract.outputs.length === 0) {
      return {
        possible: false,
        reason: `Source node type "${sourceType}" has no output handles`,
      };
    }
    
    // Check if target has inputs
    if (targetContract.inputs.length === 0) {
      return {
        possible: false,
        reason: `Target node type "${targetType}" has no input handles`,
      };
    }
    
    // Connection is possible
    return {
      possible: true,
      suggestedSourceHandle: getDefaultSourceHandle(sourceType),
      suggestedTargetHandle: getDefaultTargetHandle(targetType),
    };
  }
}

// Export singleton instance
export const connectionBuilder = new ConnectionBuilder();
