/**
 * Node Capability Registry
 * 
 * Every node must define:
 * {
 *   nodeType,
 *   inputType: "text | array | object",
 *   outputType: "text | array | object",
 *   acceptsArray: boolean,
 *   producesArray: boolean
 * }
 * 
 * Example:
 * google_sheets:
 *   outputType: array
 *   producesArray: true
 * 
 * text_summarizer:
 *   inputType: text | array
 *   outputType: text
 * 
 * gmail:
 *   inputType: text
 * 
 * Workflow generation must use registry to:
 * - determine node order
 * - decide loop insertion
 * - validate connections
 * - prevent invalid workflows
 */

import { NodeLibrary, NodeSchema, NodeCapability } from './node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export type DataType = 'text' | 'array' | 'object';

export interface NodeCapabilityDefinition {
  nodeType: string;
  inputType: DataType | DataType[];
  outputType: DataType;
  acceptsArray: boolean;
  producesArray: boolean;
}

/**
 * Node Capability Registry
 * Central registry for all node data type capabilities
 */
export class NodeCapabilityRegistry {
  private capabilities: Map<string, NodeCapabilityDefinition> = new Map();
  private initialized = false;
  private nodeLibraryInstance: NodeLibrary | null = null;
  
  /**
   * Set the node library instance (to avoid circular dependency)
   */
  setNodeLibrary(instance: NodeLibrary): void {
    this.nodeLibraryInstance = instance;
  }
  
  /**
   * Initialize registry from node library
   */
  initialize(nodeLibraryInstance?: NodeLibrary): void {
    if (this.initialized) {
      return;
    }
    
    console.log('[NodeCapabilityRegistry] Initializing capability registry from node library...');
    
    // Use provided instance, or fall back to stored instance, or try to import
    let libraryInstance: NodeLibrary | null = nodeLibraryInstance || this.nodeLibraryInstance;
    if (!libraryInstance) {
      try {
        const { nodeLibrary } = require('./node-library');
        libraryInstance = nodeLibrary;
      } catch (error) {
        console.warn('[NodeCapabilityRegistry] Could not get node library instance:', error);
        return;
      }
    }
    
    // Get all schemas from library (libraryInstance is guaranteed to be non-null here)
    if (!libraryInstance) {
      console.warn('[NodeCapabilityRegistry] Node library instance is null, cannot initialize');
      return;
    }
    
    const allSchemas = libraryInstance.getAllSchemas();
    
    for (const schema of allSchemas) {
      const nodeType = schema.type;
      const capability = this.getCapabilityFromSchema(nodeType, schema);
      this.capabilities.set(nodeType, capability);
    }
    
    this.initialized = true;
    console.log(`[NodeCapabilityRegistry] ✅ Initialized ${this.capabilities.size} node capabilities`);
  }
  
  /**
   * Get capability from node schema
   */
  private getCapabilityFromSchema(nodeType: string, schema: NodeSchema): NodeCapabilityDefinition {
    // If schema has explicit capability definition, use it
    if (schema.nodeCapability) {
      return {
        nodeType,
        inputType: this.normalizeInputType(schema.nodeCapability.inputType),
        outputType: this.normalizeOutputType(schema.nodeCapability.outputType),
        acceptsArray: schema.nodeCapability.acceptsArray,
        producesArray: schema.nodeCapability.producesArray,
      };
    }
    
    // Otherwise, infer from schema properties
    return this.inferCapability(nodeType, schema);
  }
  
  /**
   * Infer capability from schema (fallback when not explicitly defined)
   */
  private inferCapability(nodeType: string, schema: NodeSchema): NodeCapabilityDefinition {
    const nodeTypeLower = nodeType.toLowerCase();
    const category = schema.category?.toLowerCase() || '';
    
    // Data Sources (produce arrays)
    if (this.isDataSource(nodeTypeLower, category)) {
      return {
        nodeType,
        inputType: 'text', // Most data sources don't need input, but accept text for queries
        outputType: 'array',
        acceptsArray: false,
        producesArray: true,
      };
    }
    
    // Data Transformers (accept text/array, produce text)
    if (this.isTransformer(nodeTypeLower, category)) {
      return {
        nodeType,
        inputType: ['text', 'array'], // Can accept both
        outputType: 'text',
        acceptsArray: true,
        producesArray: false,
      };
    }
    
    // Output Actions (accept text)
    if (this.isOutputAction(nodeTypeLower, category)) {
      return {
        nodeType,
        inputType: 'text',
        outputType: 'text', // Most output actions produce text confirmation
        acceptsArray: false,
        producesArray: false,
      };
    }
    
    // Default: accept text, produce text
    return {
      nodeType,
      inputType: 'text',
      outputType: 'text',
      acceptsArray: false,
      producesArray: false,
    };
  }
  
  /**
   * Check if node is a data source
   */
  private isDataSource(nodeType: string, category: string): boolean {
    const dataSourceKeywords = [
      'sheets', 'csv', 'excel', 'database', 'postgres', 'mysql', 'mongodb',
      'airtable', 'notion', 'http', 'api', 's3', 'storage', 'drive'
    ];
    
    return dataSourceKeywords.some(keyword => nodeType.includes(keyword)) ||
           category === 'data-source' || category === 'database' || category === 'storage';
  }
  
  /**
   * Check if node is a transformer
   */
  private isTransformer(nodeType: string, category: string): boolean {
    const transformerKeywords = [
      'summarizer', 'summarize', 'classifier', 'classify', 'transform',
      'format', 'parse', 'filter', 'map', 'reduce', 'ai', 'llm'
    ];
    
    return transformerKeywords.some(keyword => nodeType.includes(keyword)) ||
           category === 'transformer' || category === 'ai' || category === 'processing';
  }
  
  /**
   * Check if node is an output action
   */
  private isOutputAction(nodeType: string, category: string): boolean {
    const outputKeywords = [
      'gmail', 'email', 'slack', 'discord', 'telegram', 'teams',
      'twitter', 'instagram', 'facebook', 'linkedin', 'notification'
    ];
    
    return outputKeywords.some(keyword => nodeType.includes(keyword)) ||
           category === 'output' || category === 'notification' || category === 'communication';
  }
  
  /**
   * Normalize input type to DataType or array
   */
  private normalizeInputType(inputType: string | string[]): DataType | DataType[] {
    if (Array.isArray(inputType)) {
      return inputType.map(t => this.normalizeDataType(t));
    }
    return this.normalizeDataType(inputType);
  }
  
  /**
   * Normalize output type to DataType
   */
  private normalizeOutputType(outputType: string): DataType {
    return this.normalizeDataType(outputType);
  }
  
  /**
   * Normalize data type string
   */
  private normalizeDataType(type: string): DataType {
    const normalized = type.toLowerCase().trim();
    if (normalized === 'text' || normalized === 'string') return 'text';
    if (normalized === 'array' || normalized === 'list') return 'array';
    if (normalized === 'object' || normalized === 'json') return 'object';
    return 'text'; // Default
  }
  
  /**
   * Get capability for a node type
   */
  getCapability(nodeType: string): NodeCapabilityDefinition | null {
    if (!this.initialized) {
      // Try to initialize if we have a library instance
      if (this.nodeLibraryInstance) {
        this.initialize(this.nodeLibraryInstance);
      } else {
        // Try to get from require as fallback
        try {
          const { nodeLibrary } = require('./node-library');
          this.initialize(nodeLibrary);
        } catch (error) {
          console.warn('[NodeCapabilityRegistry] Could not initialize for getCapability:', error);
          return null;
        }
      }
    }
    
    const normalized = unifiedNormalizeNodeTypeString(nodeType);
    return this.capabilities.get(normalized) || null;
  }
  
  /**
   * Check if node accepts array input
   */
  acceptsArray(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    return capability?.acceptsArray || false;
  }
  
  /**
   * Check if node produces array output
   */
  producesArray(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    return capability?.producesArray || false;
  }
  
  /**
   * Get input type for a node
   */
  getInputType(nodeType: string): DataType | DataType[] | null {
    const capability = this.getCapability(nodeType);
    return capability?.inputType || null;
  }
  
  /**
   * Get output type for a node
   */
  getOutputType(nodeType: string): DataType | null {
    const capability = this.getCapability(nodeType);
    return capability?.outputType || null;
  }
  
  /**
   * Check if source output is compatible with target input
   */
  areCompatible(sourceNodeType: string, targetNodeType: string): boolean {
    const sourceCapability = this.getCapability(sourceNodeType);
    const targetCapability = this.getCapability(targetNodeType);
    
    if (!sourceCapability || !targetCapability) {
      return false;
    }
    
    const sourceOutput = sourceCapability.outputType;
    const targetInput = targetCapability.inputType;
    
    // If target accepts any type
    if (Array.isArray(targetInput) && targetInput.length === 0) {
      return true;
    }
    
    // If target accepts single type
    if (typeof targetInput === 'string') {
      return sourceOutput === targetInput || targetInput === 'text'; // text is most compatible
    }
    
    // If target accepts multiple types
    if (Array.isArray(targetInput)) {
      return targetInput.includes(sourceOutput);
    }
    
    return false;
  }
  
  /**
   * Check if loop is required between source and target
   * 
   * Rule: Insert loop ONLY if:
   * - upstream produces array AND
   * - downstream accepts scalar only (does NOT accept array)
   * 
   * Examples:
   * - array → gmail (doesn't accept array) → requires loop ✅
   * - array → summarizer (accepts array) → no loop ✅
   * 
   * This is a strict rule - no heuristic guessing.
   */
  requiresLoop(sourceNodeType: string, targetNodeType: string): boolean {
    const sourceCapability = this.getCapability(sourceNodeType);
    const targetCapability = this.getCapability(targetNodeType);
    
    if (!sourceCapability || !targetCapability) {
      console.log(`[NodeCapabilityRegistry] ⚠️  Cannot determine loop requirement: missing capability for "${sourceNodeType}" or "${targetNodeType}"`);
      return false; // No loop if we can't determine capabilities
    }
    
    // Loop required ONLY if:
    // 1. Source produces array
    // 2. Target does NOT accept array (accepts scalar only)
    const sourceProducesArray = sourceCapability.producesArray;
    const targetAcceptsArray = targetCapability.acceptsArray;
    
    const requiresLoop = sourceProducesArray && !targetAcceptsArray;
    
    if (requiresLoop) {
      console.log(`[NodeCapabilityRegistry] 🔄 Loop required: "${sourceNodeType}" (produces array) → "${targetNodeType}" (does NOT accept array)`);
    } else {
      // Log why loop is NOT required (for debugging)
      if (sourceProducesArray && targetAcceptsArray) {
        console.log(`[NodeCapabilityRegistry] ✅ No loop needed: "${sourceNodeType}" (produces array) → "${targetNodeType}" (accepts array)`);
      } else if (!sourceProducesArray) {
        console.log(`[NodeCapabilityRegistry] ✅ No loop needed: "${sourceNodeType}" does not produce array`);
      }
    }
    
    return requiresLoop;
  }
  
  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): Map<string, NodeCapabilityDefinition> {
    if (!this.initialized) {
      // Try to initialize if we have a library instance
      if (this.nodeLibraryInstance) {
        this.initialize(this.nodeLibraryInstance);
      } else {
        // Try to get from require as fallback
        try {
          const { nodeLibrary } = require('./node-library');
          this.initialize(nodeLibrary);
        } catch (error) {
          console.warn('[NodeCapabilityRegistry] Could not initialize for getAllCapabilities:', error);
          return new Map();
        }
      }
    }
    return new Map(this.capabilities);
  }
}

// Export singleton instance
export const nodeCapabilityRegistry = new NodeCapabilityRegistry();

// Export convenience functions
export function getNodeCapability(nodeType: string): NodeCapabilityDefinition | null {
  return nodeCapabilityRegistry.getCapability(nodeType);
}

export function areNodesCompatible(sourceNodeType: string, targetNodeType: string): boolean {
  return nodeCapabilityRegistry.areCompatible(sourceNodeType, targetNodeType);
}

export function requiresLoop(sourceNodeType: string, targetNodeType: string): boolean {
  return nodeCapabilityRegistry.requiresLoop(sourceNodeType, targetNodeType);
}
