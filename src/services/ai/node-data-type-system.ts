/**
 * Node Data Type System
 * 
 * Defines data types and validates type compatibility between nodes.
 * 
 * Types:
 * - text: String data
 * - array: Array of items
 * - object: JSON object
 * - binary: Binary data (files, images, etc.)
 * 
 * Each node declares:
 * - inputType: What type of data it accepts
 * - outputType: What type of data it produces
 * 
 * Before connecting nodes:
 * - Validate type compatibility
 * - Attempt auto-transform if mismatch
 * - Reject workflow if transformation not possible
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';

export enum DataType {
  TEXT = 'text',
  ARRAY = 'array',
  OBJECT = 'object',
  BINARY = 'binary',
  ANY = 'any', // Accepts any type (wildcard)
}

export interface NodeTypeInfo {
  nodeType: string;
  inputType: DataType | DataType[];
  outputType: DataType;
  acceptsArray?: boolean; // Legacy support
  requiresScalar?: boolean; // Legacy support
}

export interface TypeCompatibilityResult {
  compatible: boolean;
  requiresTransform: boolean;
  transformType?: DataType;
  reason?: string;
}

export interface TypeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  incompatibleEdges: Array<{
    edgeId: string;
    source: string;
    target: string;
    sourceType: DataType;
    targetType: DataType;
    reason: string;
  }>;
  suggestedTransforms: Array<{
    edgeId: string;
    transformType: DataType;
    reason: string;
  }>;
}

/**
 * Node Data Type System
 * Manages data types and type compatibility for workflow nodes
 */
export class NodeDataTypeSystem {
  private typeRegistry: Map<string, NodeTypeInfo> = new Map();
  
  constructor() {
    this.initializeTypeRegistry();
  }
  
  /**
   * Initialize type registry from node library
   */
  private initializeTypeRegistry(): void {
    console.log('[NodeDataTypeSystem] Initializing type registry...');
    
    // Get all schemas from library
    const allSchemas = nodeLibrary.getAllSchemas();
    
    for (const schema of allSchemas) {
      const nodeType = schema.type;
      const typeInfo = this.inferNodeTypeInfo(nodeType, schema);
      this.typeRegistry.set(nodeType, typeInfo);
    }
    
    console.log(`[NodeDataTypeSystem] ✅ Type registry initialized: ${this.typeRegistry.size} nodes`);
  }
  
  /**
   * Infer node type information from schema
   */
  private inferNodeTypeInfo(nodeType: string, schema: any): NodeTypeInfo {
    const nodeTypeLower = nodeType.toLowerCase();
    
    // Default type info
    let inputType: DataType | DataType[] = DataType.ANY;
    let outputType: DataType = DataType.TEXT;
    
    // Data Producers (output: array or object)
    if (this.isDataProducer(nodeTypeLower)) {
      outputType = DataType.ARRAY; // Most data sources produce arrays
      
      // Specific producers
      if (nodeTypeLower.includes('sheets') || nodeTypeLower.includes('csv') || nodeTypeLower.includes('excel')) {
        outputType = DataType.ARRAY; // Array of rows
      } else if (nodeTypeLower.includes('database') || nodeTypeLower.includes('postgres') || nodeTypeLower.includes('mysql')) {
        outputType = DataType.ARRAY; // Array of records
      } else if (nodeTypeLower.includes('http') || nodeTypeLower.includes('api')) {
        outputType = DataType.OBJECT; // JSON response
      }
    }
    
    // Data Transformers (input: text/array, output: text)
    if (this.isDataTransformer(nodeTypeLower)) {
      inputType = [DataType.TEXT, DataType.ARRAY]; // Can accept both
      outputType = DataType.TEXT;
      
      // Specific transformers
      if (nodeTypeLower.includes('summarizer') || nodeTypeLower.includes('summarize')) {
        inputType = [DataType.TEXT, DataType.ARRAY];
        outputType = DataType.TEXT;
      } else if (nodeTypeLower.includes('classifier') || nodeTypeLower.includes('classify')) {
        inputType = [DataType.TEXT, DataType.OBJECT];
        outputType = DataType.OBJECT; // Classification result
      } else if (nodeTypeLower.includes('transform') || nodeTypeLower.includes('format')) {
        inputType = DataType.ANY;
        outputType = DataType.TEXT;
      }
    }
    
    // Output Actions (input: text/object)
    if (this.isOutputAction(nodeTypeLower)) {
      inputType = [DataType.TEXT, DataType.OBJECT];
      outputType = DataType.TEXT; // Output actions typically don't produce data
      
      // Specific outputs
      if (nodeTypeLower.includes('gmail') || nodeTypeLower.includes('email')) {
        inputType = [DataType.TEXT, DataType.OBJECT]; // Email body/text
      } else if (nodeTypeLower.includes('slack') || nodeTypeLower.includes('discord')) {
        inputType = [DataType.TEXT, DataType.OBJECT]; // Message text/object
      } else if (nodeTypeLower.includes('database_write') || nodeTypeLower.includes('sheets_write')) {
        inputType = [DataType.ARRAY, DataType.OBJECT]; // Write operations accept arrays/objects
        outputType = DataType.OBJECT; // Write confirmation
      }
    }
    
    // Triggers (output: any)
    if (this.isTrigger(nodeTypeLower)) {
      inputType = DataType.ANY; // Triggers don't accept input
      outputType = DataType.ANY; // Triggers can output any type
    }
    
    // Conditions (input: any, output: any)
    if (this.isCondition(nodeTypeLower)) {
      inputType = DataType.ANY;
      outputType = DataType.ANY; // Conditions pass through data
    }
    
    // Loop (input: array, output: scalar)
    if (nodeTypeLower === 'loop') {
      inputType = DataType.ARRAY;
      outputType = DataType.TEXT; // Loop processes array items one by one
    }
    
    return {
      nodeType,
      inputType,
      outputType,
      acceptsArray: Array.isArray(inputType) ? inputType.includes(DataType.ARRAY) : inputType === DataType.ARRAY,
      requiresScalar: outputType === DataType.TEXT || outputType === DataType.OBJECT,
    };
  }
  
  /**
   * Get type information for a node
   */
  getNodeTypeInfo(nodeType: string): NodeTypeInfo | null {
    const normalized = normalizeNodeType({ type: 'custom', data: { type: nodeType } });
    return this.typeRegistry.get(normalized) || null;
  }
  
  /**
   * Check type compatibility between two nodes
   */
  checkTypeCompatibility(sourceType: DataType, targetInputType: DataType | DataType[]): TypeCompatibilityResult {
    // If target accepts ANY, always compatible
    if (targetInputType === DataType.ANY) {
      return { compatible: true, requiresTransform: false };
    }
    
    // If target accepts array of types, check if source type is in array
    if (Array.isArray(targetInputType)) {
      if (targetInputType.includes(sourceType)) {
        return { compatible: true, requiresTransform: false };
      }
      
      // Check if transformation is possible
      const transformType = this.findCompatibleType(sourceType, targetInputType);
      if (transformType) {
        return {
          compatible: true,
          requiresTransform: true,
          transformType,
          reason: `Type ${sourceType} can be transformed to ${transformType} for compatibility`,
        };
      }
      
      return {
        compatible: false,
        requiresTransform: false,
        reason: `Type ${sourceType} is not compatible with target types: ${targetInputType.join(', ')}`,
      };
    }
    
    // Single target type
    if (sourceType === targetInputType) {
      return { compatible: true, requiresTransform: false };
    }
    
    // Check if transformation is possible
    const transformType = this.findCompatibleType(sourceType, [targetInputType]);
    if (transformType) {
      return {
        compatible: true,
        requiresTransform: true,
        transformType,
        reason: `Type ${sourceType} can be transformed to ${transformType} for compatibility`,
      };
    }
    
    return {
      compatible: false,
      requiresTransform: false,
      reason: `Type ${sourceType} is not compatible with target type: ${targetInputType}`,
    };
  }
  
  /**
   * Find compatible type through transformation
   */
  private findCompatibleType(sourceType: DataType, targetTypes: DataType[]): DataType | null {
    // Direct match
    if (targetTypes.includes(sourceType)) {
      return sourceType;
    }
    
    // Transformation rules
    // array → text (join/stringify)
    if (sourceType === DataType.ARRAY && targetTypes.includes(DataType.TEXT)) {
      return DataType.TEXT;
    }
    
    // object → text (stringify)
    if (sourceType === DataType.OBJECT && targetTypes.includes(DataType.TEXT)) {
      return DataType.TEXT;
    }
    
    // array → object (first item or wrap)
    if (sourceType === DataType.ARRAY && targetTypes.includes(DataType.OBJECT)) {
      return DataType.OBJECT;
    }
    
    // text → array (split/parse)
    if (sourceType === DataType.TEXT && targetTypes.includes(DataType.ARRAY)) {
      return DataType.ARRAY;
    }
    
    // object → array (wrap in array)
    if (sourceType === DataType.OBJECT && targetTypes.includes(DataType.ARRAY)) {
      return DataType.ARRAY;
    }
    
    return null;
  }
  
  /**
   * Validate type compatibility for entire workflow
   */
  validateWorkflowTypes(nodes: WorkflowNode[], edges: WorkflowEdge[]): TypeValidationResult {
    console.log('[NodeDataTypeSystem] Validating workflow type compatibility...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const incompatibleEdges: TypeValidationResult['incompatibleEdges'] = [];
    const suggestedTransforms: TypeValidationResult['suggestedTransforms'] = [];
    
    // Build node type map
    const nodeTypeMap = new Map<string, NodeTypeInfo>();
    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      const typeInfo = this.getNodeTypeInfo(nodeType);
      if (typeInfo) {
        nodeTypeMap.set(node.id, typeInfo);
      } else {
        warnings.push(`Node ${node.id} (${nodeType}) has no type information`);
      }
    }
    
    // Validate each edge
    for (const edge of edges) {
      const sourceTypeInfo = nodeTypeMap.get(edge.source);
      const targetTypeInfo = nodeTypeMap.get(edge.target);
      
      if (!sourceTypeInfo || !targetTypeInfo) {
        warnings.push(`Edge ${edge.id}: Missing type information for source or target node`);
        continue;
      }
      
      const sourceOutputType = sourceTypeInfo.outputType;
      const targetInputType = targetTypeInfo.inputType;
      
      const compatibility = this.checkTypeCompatibility(sourceOutputType, targetInputType);
      
      if (!compatibility.compatible) {
        errors.push(
          `Type mismatch: ${edge.source} (${sourceOutputType}) → ${edge.target} (${targetInputType}): ${compatibility.reason}`
        );
        incompatibleEdges.push({
          edgeId: edge.id,
          source: edge.source,
          target: edge.target,
          sourceType: sourceOutputType,
          targetType: Array.isArray(targetInputType) ? targetInputType[0] : targetInputType,
          reason: compatibility.reason || 'Type mismatch',
        });
      } else if (compatibility.requiresTransform) {
        warnings.push(
          `Type transformation required: ${edge.source} (${sourceOutputType}) → ${edge.target} (${targetInputType}): ${compatibility.reason}`
        );
        suggestedTransforms.push({
          edgeId: edge.id,
          transformType: compatibility.transformType!,
          reason: compatibility.reason || 'Type transformation needed',
        });
      }
    }
    
    const valid = errors.length === 0;
    
    if (valid) {
      console.log(`[NodeDataTypeSystem] ✅ Workflow type validation passed`);
    } else {
      console.error(`[NodeDataTypeSystem] ❌ Workflow type validation failed: ${errors.length} errors`);
    }
    
    return {
      valid,
      errors,
      warnings,
      incompatibleEdges,
      suggestedTransforms,
    };
  }
  
  /**
   * Auto-transform workflow to fix type mismatches
   */
  autoTransformWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    suggestedTransforms: TypeValidationResult['suggestedTransforms']
  ): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; addedTransformers: string[] } {
    console.log('[NodeDataTypeSystem] Auto-transforming workflow to fix type mismatches...');
    
    const addedTransformers: string[] = [];
    const newNodes = [...nodes];
    const newEdges: WorkflowEdge[] = [];
    const transformNodeMap = new Map<string, string>(); // edgeId → transformNodeId
    
    // Create transform nodes for each suggested transform
    for (const transform of suggestedTransforms) {
      const edge = edges.find(e => e.id === transform.edgeId);
      if (!edge) continue;
      
      // Determine transform node type based on transform type
      const transformNodeType = this.getTransformNodeType(transform.transformType);
      if (!transformNodeType) {
        console.warn(`[NodeDataTypeSystem] ⚠️  Cannot determine transform node type for ${transform.transformType}`);
        continue;
      }
      
      // Create transform node
      const transformNode: WorkflowNode = {
        id: `transform_${edge.id}_${Date.now()}`,
        type: transformNodeType,
        position: { x: 0, y: 0 }, // Will be laid out by frontend
        data: {
          type: transformNodeType,
          label: `Transform: ${transform.transformType}`,
          category: 'transformers',
          config: {
            transformType: transform.transformType,
            reason: transform.reason,
          },
        },
      };
      
      newNodes.push(transformNode);
      addedTransformers.push(transformNode.id);
      transformNodeMap.set(edge.id, transformNode.id);
      
      // Update edges: source → transform → target (schema-driven)
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const { resolveCompatibleHandles } = require('./schema-driven-connection-resolver');
        
        // ✅ FIXED: Resolve source → transform (no fallback)
        // If compatible handles not found → workflow invalid
        const sourceToTransform = resolveCompatibleHandles(sourceNode, transformNode);
        if (!sourceToTransform.success || !sourceToTransform.sourceHandle || !sourceToTransform.targetHandle) {
          throw new Error(`Cannot connect source → transform: ${sourceToTransform.error || 'No compatible handles found'}. Edge creation must ONLY use schema-defined handles.`);
        }
        newEdges.push({
          id: `${edge.id}_source_to_transform`,
          source: edge.source,
          target: transformNode.id,
          sourceHandle: sourceToTransform.sourceHandle,
          targetHandle: sourceToTransform.targetHandle,
        });
        
        // ✅ FIXED: Resolve transform → target (no fallback)
        // If compatible handles not found → workflow invalid
        const transformToTarget = resolveCompatibleHandles(transformNode, targetNode);
        if (!transformToTarget.success || !transformToTarget.sourceHandle || !transformToTarget.targetHandle) {
          throw new Error(`Cannot connect transform → target: ${transformToTarget.error || 'No compatible handles found'}. Edge creation must ONLY use schema-defined handles.`);
        }
        newEdges.push({
          id: `${edge.id}_transform_to_target`,
          source: transformNode.id,
          target: edge.target,
          sourceHandle: transformToTarget.sourceHandle,
          targetHandle: transformToTarget.targetHandle,
        });
      }
    }
    
    // Add original edges that don't need transformation
    for (const edge of edges) {
      if (!transformNodeMap.has(edge.id)) {
        newEdges.push(edge);
      }
    }
    
    console.log(`[NodeDataTypeSystem] ✅ Auto-transformation complete: ${addedTransformers.length} transform nodes added`);
    
    return {
      nodes: newNodes,
      edges: newEdges,
      addedTransformers,
    };
  }
  
  /**
   * Get transform node type for a data type transformation
   */
  private getTransformNodeType(transformType: DataType): string | null {
    switch (transformType) {
      case DataType.TEXT:
        return 'format'; // Format array/object to text
      case DataType.ARRAY:
        return 'transform'; // Transform text/object to array
      case DataType.OBJECT:
        return 'transform'; // Transform array/text to object
      default:
        return 'transform'; // Generic transform
    }
  }
  
  // Helper methods for node categorization
  private isDataProducer(nodeType: string): boolean {
    return nodeType.includes('sheets') || nodeType.includes('database') || 
           nodeType.includes('postgres') || nodeType.includes('mysql') ||
           nodeType.includes('http') || nodeType.includes('api') ||
           nodeType.includes('csv') || nodeType.includes('excel') ||
           nodeType.includes('airtable') || nodeType.includes('notion');
  }
  
  private isDataTransformer(nodeType: string): boolean {
    return nodeType.includes('summarizer') || nodeType.includes('classifier') ||
           nodeType.includes('transform') || nodeType.includes('format') ||
           nodeType.includes('ollama') || nodeType.includes('openai') ||
           nodeType.includes('anthropic') || nodeType.includes('gemini');
  }
  
  private isOutputAction(nodeType: string): boolean {
    return nodeType.includes('gmail') || nodeType.includes('email') ||
           nodeType.includes('slack') || nodeType.includes('discord') ||
           nodeType.includes('notification') || nodeType.includes('webhook') ||
           nodeType.includes('database_write') || nodeType.includes('sheets_write');
  }
  
  private isTrigger(nodeType: string): boolean {
    return nodeType.includes('trigger') || nodeType === 'schedule' ||
           nodeType === 'webhook' || nodeType === 'form';
  }
  
  private isCondition(nodeType: string): boolean {
    return nodeType.includes('if_else') || nodeType.includes('switch') ||
           nodeType.includes('condition');
  }
}

// Export singleton instance
export const nodeDataTypeSystem = new NodeDataTypeSystem();

// Export convenience functions
export function getNodeTypeInfo(nodeType: string): NodeTypeInfo | null {
  return nodeDataTypeSystem.getNodeTypeInfo(nodeType);
}

export function checkTypeCompatibility(
  sourceType: DataType,
  targetInputType: DataType | DataType[]
): TypeCompatibilityResult {
  return nodeDataTypeSystem.checkTypeCompatibility(sourceType, targetInputType);
}

export function validateWorkflowTypes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): TypeValidationResult {
  return nodeDataTypeSystem.validateWorkflowTypes(nodes, edges);
}
