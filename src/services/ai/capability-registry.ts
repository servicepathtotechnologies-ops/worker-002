/**
 * Capability Registry
 * 
 * STEP 2: Create a registry for all nodes with input/output types.
 * 
 * Registry structure:
 * {
 *   nodeType,
 *   inputType,
 *   outputType,
 *   acceptsArray,
 *   requiresScalar,
 *   supportsBatch,
 *   producesData
 * }
 * 
 * Example:
 * google_sheets → output: array<object>
 * text_summarizer → input: text | array
 * gmail → input: text
 */

import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { DataType } from './node-data-type-system';

export interface NodeCapability {
  nodeType: string;
  inputType: DataType | DataType[];  // What data types this node accepts
  outputType: DataType | DataType[]; // What data types this node produces
  acceptsArray: boolean;             // Can accept array input
  requiresScalar: boolean;            // Requires scalar (non-array) input
  supportsBatch: boolean;             // Supports batch processing
  producesData: boolean;              // Produces output data (not just side effects)
  category: string;                   // Node category
}

/**
 * Capability Registry
 * Maps all nodes to their input/output capabilities
 */
export class CapabilityRegistry {
  private capabilities: Map<string, NodeCapability> = new Map();
  private initialized = false;
  
  /**
   * Initialize registry from node library
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }
    
    console.log('[CapabilityRegistry] Initializing capability registry from node library...');
    
    // Get all schemas from library
    const allSchemas = nodeLibrary.getAllSchemas();
    
    for (const schema of allSchemas) {
      const nodeType = schema.type;
      const capability = this.inferCapability(nodeType, schema);
      this.capabilities.set(nodeType, capability);
    }
    
    this.initialized = true;
    console.log(`[CapabilityRegistry] ✅ Initialized ${this.capabilities.size} node capabilities`);
  }
  
  /**
   * Get capability for a node type
   */
  getCapability(nodeType: string): NodeCapability | null {
    if (!this.initialized) {
      this.initialize();
    }
    
    // ✅ ROOT-LEVEL FIX: Use resolveNodeType() to handle aliases (typeform → form)
    // This ensures aliases are resolved to canonical types before capability lookup
    let resolvedType = nodeType;
    try {
      const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
      resolvedType = resolveNodeType(nodeType, false);
    } catch (error) {
      // If resolution fails, try normalization as fallback
      const normalized = unifiedNormalizeNodeTypeString(nodeType);
      resolvedType = normalized || nodeType;
    }
    
    // Lookup using resolved canonical type
    return this.capabilities.get(resolvedType) || null;
  }
  
  /**
   * Check if node accepts array input
   */
  acceptsArray(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    return capability?.acceptsArray || false;
  }
  
  /**
   * Check if node requires scalar input
   */
  requiresScalar(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    return capability?.requiresScalar || false;
  }
  
  /**
   * Check if node produces array output
   */
  producesArray(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    if (!capability) return false;
    
    const outputTypes = Array.isArray(capability.outputType) 
      ? capability.outputType 
      : [capability.outputType];
    
    return outputTypes.includes(DataType.ARRAY) || capability.acceptsArray;
  }
  
  /**
   * Check if node produces data (not just side effects)
   */
  producesData(nodeType: string): boolean {
    const capability = this.getCapability(nodeType);
    return capability?.producesData || false;
  }
  
  /**
   * Get output type for a node
   */
  getOutputType(nodeType: string): DataType | DataType[] {
    const capability = this.getCapability(nodeType);
    return capability?.outputType || DataType.ANY;
  }
  
  /**
   * Get input type for a node
   */
  getInputType(nodeType: string): DataType | DataType[] {
    const capability = this.getCapability(nodeType);
    return capability?.inputType || DataType.ANY;
  }
  
  /**
   * Check if two nodes are compatible (output → input)
   */
  areCompatible(sourceNodeType: string, targetNodeType: string): boolean {
    const sourceCapability = this.getCapability(sourceNodeType);
    const targetCapability = this.getCapability(targetNodeType);
    
    if (!sourceCapability || !targetCapability) {
      return false;
    }
    
    const sourceOutput = Array.isArray(sourceCapability.outputType)
      ? sourceCapability.outputType
      : [sourceCapability.outputType];
    
    const targetInput = Array.isArray(targetCapability.inputType)
      ? targetCapability.inputType
      : [targetCapability.inputType];
    
    // Check if any source output type matches any target input type
    return sourceOutput.some(outType => targetInput.includes(outType)) ||
           sourceOutput.includes(DataType.ANY) ||
           targetInput.includes(DataType.ANY);
  }
  
  /**
   * Infer capability from node schema
   */
  private inferCapability(nodeType: string, schema: any): NodeCapability {
    const category = schema.category?.toLowerCase() || '';
    const label = schema.label?.toLowerCase() || '';
    const normalizedType = nodeType.toLowerCase();
    
    // Default capability
    let capability: NodeCapability = {
      nodeType: normalizedType,
      inputType: DataType.ANY,
      outputType: DataType.ANY,
      acceptsArray: false,
      requiresScalar: false,
      supportsBatch: false,
      producesData: true,
      category,
    };
    
    // Data sources (produce array<object>)
    if (this.isDataSource(normalizedType, category)) {
      capability = {
        ...capability,
        inputType: DataType.ANY, // Data sources don't need input
        outputType: DataType.ARRAY,
        acceptsArray: false,
        requiresScalar: false,
        supportsBatch: false,
        producesData: true,
      };
    }
    // Transformations (accept text|array, produce text)
    else if (this.isTransformation(normalizedType, category)) {
      capability = {
        ...capability,
        inputType: [DataType.TEXT, DataType.ARRAY],
        outputType: DataType.TEXT,
        acceptsArray: true,
        requiresScalar: false,
        supportsBatch: true,
        producesData: true,
      };
    }
    // Outputs (accept text, produce nothing)
    else if (this.isOutput(normalizedType, category)) {
      capability = {
        ...capability,
        inputType: DataType.TEXT,
        outputType: DataType.ANY, // Outputs don't produce data
        acceptsArray: false,
        requiresScalar: true,
        supportsBatch: false,
        producesData: false,
      };
    }
    // Triggers (produce nothing, just start workflow)
    else if (this.isTrigger(normalizedType, category)) {
      capability = {
        ...capability,
        inputType: DataType.ANY,
        outputType: DataType.ANY,
        acceptsArray: false,
        requiresScalar: false,
        supportsBatch: false,
        producesData: false,
      };
    }
    // Conditions (accept any, produce any)
    else if (this.isCondition(normalizedType, category)) {
      capability = {
        ...capability,
        inputType: DataType.ANY,
        outputType: DataType.ANY,
        acceptsArray: true,
        requiresScalar: false,
        supportsBatch: false,
        producesData: true,
      };
    }
    
    return capability;
  }
  
  /**
   * Check if node is a data source
   */
  private isDataSource(nodeType: string, category: string): boolean {
    const dataSourceTypes = [
      'google_sheets', 'sheets', 'spreadsheet',
      'postgresql', 'postgres', 'mysql', 'mongodb', 'database',
      'aws_s3', 's3', 'dropbox', 'storage',
      'airtable', 'notion', 'csv', 'excel',
      'google_drive', 'drive',
    ];
    
    return dataSourceTypes.some(type => nodeType.includes(type)) ||
           category.includes('data') ||
           category.includes('database') ||
           category.includes('storage');
  }
  
  /**
   * Check if node is a transformation
   */
  private isTransformation(nodeType: string, category: string): boolean {
    const transformationTypes = [
      'summarize', 'summary', 'summarizer',
      'classify', 'classification',
      'transform', 'format', 'parse', 'filter', 'map', 'reduce',
      'ai', 'llm', 'process',
      'ollama', 'openai', 'anthropic', 'gemini',
    ];
    
    return transformationTypes.some(type => nodeType.includes(type)) ||
           category.includes('transform') ||
           category.includes('process') ||
           category.includes('ai') ||
           category.includes('ml');
  }
  
  /**
   * Check if node is an output
   */
  private isOutput(nodeType: string, category: string): boolean {
    const outputTypes = [
      'gmail', 'email', 'mail',
      'slack', 'discord', 'telegram',
      'notification', 'notify',
      'webhook', 'http_request', 'api',
    ];
    
    return outputTypes.some(type => nodeType.includes(type)) ||
           category.includes('output') ||
           category.includes('communication') ||
           category.includes('notification');
  }
  
  /**
   * Check if node is a trigger
   */
  private isTrigger(nodeType: string, category: string): boolean {
    return nodeType.includes('trigger') ||
           category.includes('trigger') ||
           ['manual_trigger', 'webhook', 'schedule', 'form', 'chat_trigger'].includes(nodeType);
  }
  
  /**
   * Check if node is a condition
   */
  private isCondition(nodeType: string, category: string): boolean {
    return nodeType.includes('if_else') ||
           nodeType.includes('switch') ||
           nodeType.includes('condition') ||
           category.includes('condition') ||
           category.includes('logic');
  }
}

// Export singleton instance
export const capabilityRegistry = new CapabilityRegistry();

// Initialize on import
capabilityRegistry.initialize();
