/**
 * Node Schema Registry
 * Centralized schema registry that enforces Node Library compliance
 * All nodes must be validated against this registry
 */

import { nodeLibrary, NodeSchema } from '../../services/nodes/node-library';
import { normalizeNodeType } from '../utils/node-type-normalizer';
import type { 
  NodeContract, 
  ValidationResult, 
  EdgeValidationResult 
} from './types';

// Re-export types for backward compatibility
export type { NodeContract, ValidationResult, EdgeValidationResult };

/**
 * Node Schema Registry
 * Singleton that provides schema validation against the Node Library
 */
export class NodeSchemaRegistry {
  private static instance: NodeSchemaRegistry;
  private schemas: Map<string, NodeContract> = new Map();

  private constructor() {
    this.initializeCoreSchemas();
  }

  static getInstance(): NodeSchemaRegistry {
    if (!NodeSchemaRegistry.instance) {
      NodeSchemaRegistry.instance = new NodeSchemaRegistry();
    }
    return NodeSchemaRegistry.instance;
  }

  /**
   * Initialize schemas from Node Library
   */
  private initializeCoreSchemas(): void {
    console.log('[NodeSchemaRegistry] 🔄 Initializing schemas from NodeLibrary...');
    const allSchemas = nodeLibrary.getAllSchemas();
    console.log(`[NodeSchemaRegistry] 📚 Found ${allSchemas.length} schemas in NodeLibrary`);
    
    let registeredCount = 0;
    // Use resolver to get canonical node types for critical nodes
    const { resolveNodeType } = require('../utils/node-type-resolver-util');
    const criticalNodes = [
      'ai_service',
      resolveNodeType('gmail', true), // Resolves 'gmail' → 'google_gmail'
      'google_gmail'
    ].filter((node, index, arr) => arr.indexOf(node) === index); // Remove duplicates
    const foundCriticalNodes: string[] = [];
    
    allSchemas.forEach(schema => {
      this.registerFromNodeSchema(schema);
      registeredCount++;
      
      if (criticalNodes.includes(schema.type)) {
        foundCriticalNodes.push(schema.type);
        console.log(`[NodeSchemaRegistry] ✅ Registered critical node: ${schema.type}`);
      }
    });
    
    console.log(`[NodeSchemaRegistry] ✅ Registered ${registeredCount} schemas`);
    
    // Verify critical nodes
    const missingCritical = criticalNodes.filter(type => !foundCriticalNodes.includes(type));
    if (missingCritical.length > 0) {
      console.error(`[NodeSchemaRegistry] ❌ Missing critical nodes: ${missingCritical.join(', ')}`);
    } else {
      console.log(`[NodeSchemaRegistry] ✅ All critical nodes found: ${foundCriticalNodes.join(', ')}`);
    }
    
    // Verify ai_service and gmail specifically (use resolver for gmail)
    const aiServiceSchema = this.get('ai_service');
    const gmailResolved = resolveNodeType('gmail', false);
    const gmailSchema = this.get(gmailResolved); // Use resolved type (google_gmail)
    
    if (!aiServiceSchema) {
      console.error('[NodeSchemaRegistry] ❌ ai_service node not found in registry!');
    } else {
      console.log(`[NodeSchemaRegistry] ✅ ai_service node registered: ${aiServiceSchema.nodeType}`);
    }
    
    if (!gmailSchema) {
      console.error(`[NodeSchemaRegistry] ❌ gmail node not found in registry! (resolved to "${gmailResolved}")`);
    } else {
      console.log(`[NodeSchemaRegistry] ✅ gmail node registered: ${gmailSchema.nodeType} (resolved from "gmail" → "${gmailResolved}")`);
    }
  }

  /**
   * Register a schema from NodeSchema format
   */
  private registerFromNodeSchema(schema: NodeSchema): void {
    // Extract inputs and outputs from the schema
    // For now, we'll use common patterns based on node type
    const inputs = this.inferInputs(schema);
    const outputs = this.inferOutputs(schema);
    
    const contract: NodeContract = {
      nodeType: schema.type,
      category: schema.category as any, // schema.category is string, NodeCategory is union type
      inputs,
      outputs,
      requiredConfig: schema.configSchema.required || [],
      optionalConfig: Object.keys(schema.configSchema.optional || {}),
      credentialType: this.inferCredentialType(schema)
    };

    this.schemas.set(schema.type, contract);
  }

  /**
   * Register a custom schema
   */
  register(schema: NodeContract): void {
    this.schemas.set(schema.nodeType, schema);
  }

  /**
   * Get schema for a node type
   */
  get(nodeType: string): NodeContract | null {
    return this.schemas.get(nodeType) || null;
  }

  /**
   * Validate a node against its schema
   */
  validateNode(node: any): ValidationResult {
    const nodeType = normalizeNodeType(node);
    
    if (!nodeType || nodeType === 'custom') {
      return {
        valid: false,
        errors: [`Node type is invalid or undefined. Node: ${JSON.stringify(node)}`]
      };
    }

    const schema = this.get(nodeType);
    
    if (!schema) {
      return {
        valid: false,
        errors: [`Node type "${nodeType}" is not registered in schema registry`]
      };
    }

    const errors: string[] = [];
    const config = node.data?.config || node.data || {};

    // Check required config fields
    schema.requiredConfig.forEach(field => {
      // Check if field exists and is not empty (allowing false and 0 as valid values)
      if (
        config[field] === undefined ||
        config[field] === null ||
        (typeof config[field] === 'string' && config[field].trim() === '')
      ) {
        errors.push(`Missing required config field: ${field}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate an edge connection
   */
  validateEdge(
    sourceNode: any,
    targetNode: any,
    edge: any
  ): EdgeValidationResult {
    const sourceType = normalizeNodeType(sourceNode);
    const targetType = normalizeNodeType(targetNode);

    const sourceSchema = this.get(sourceType);
    const targetSchema = this.get(targetType);

    if (!sourceSchema) {
      return {
        valid: false,
        errors: [`Source node type "${sourceType}" not found in schema registry`]
      };
    }

    if (!targetSchema) {
      return {
        valid: false,
        errors: [`Target node type "${targetType}" not found in schema registry`]
      };
    }

    const errors: string[] = [];

    // Validate port compatibility
    const sourceOutput = edge.sourceHandle || 'output';
    const targetInput = edge.targetHandle || 'input';

    // Special handling for manual_trigger output port
    if (sourceType === 'manual_trigger' && sourceOutput === 'data') {
      // This is a common mistake - manual_trigger outputs 'inputData', not 'data'
      errors.push(
        `Source node "${sourceType}" uses incorrect output port "${sourceOutput}". ` +
        `Should be "inputData". Available outputs: ${sourceSchema.outputs.join(', ')}`
      );
    } else if (sourceType === 'chat_trigger' && (sourceOutput === 'data' || sourceOutput === 'inputData')) {
      // CRITICAL: chat_trigger outputs 'message', not 'data' or 'inputData'
      errors.push(
        `Source node "${sourceType}" uses incorrect output port "${sourceOutput}". ` +
        `Should be "message". Available outputs: ${sourceSchema.outputs.join(', ')}`
      );
    } else if (!sourceSchema.outputs.includes(sourceOutput)) {
      errors.push(
        `Source node "${sourceType}" does not have output port "${sourceOutput}". ` +
        `Available: ${sourceSchema.outputs.join(', ')}`
      );
    }

    // Special handling for common input port names
    if (targetType === 'slack_message' && targetInput === 'input') {
      // Slack accepts 'text' as input, not 'input'
      if (!targetSchema.inputs.includes(targetInput)) {
        errors.push(
          `Target node "${targetType}" does not have input port "${targetInput}". ` +
          `Available: ${targetSchema.inputs.join(', ')}`
        );
      }
    } else if (!targetSchema.inputs.includes(targetInput)) {
      errors.push(
        `Target node "${targetType}" does not have input port "${targetInput}". ` +
        `Available: ${targetSchema.inputs.join(', ')}`
      );
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get all registered schemas
   */
  getAllSchemas(): NodeContract[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get all registered node types
   */
  getAllNodeTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Infer inputs from node schema
   */
  private inferInputs(schema: NodeSchema): string[] {
    // Common input patterns based on category
    if (schema.category === 'triggers') {
      return []; // Triggers have no inputs
    }
    
    // For action nodes, common inputs
    if (schema.category === 'output' || schema.category === 'social') {
      return ['text', 'input', 'inputData'];
    }
    
    // Default inputs
    return ['input', 'inputData'];
  }

  /**
   * Infer outputs from node schema
   */
  private inferOutputs(schema: NodeSchema): string[] {
    // Special handling for manual_trigger
    if (schema.type === 'manual_trigger') {
      return ['inputData', 'output'];
    }
    
    // Schedule trigger
    if (schema.type === 'schedule') {
      return ['output'];
    }
    
    // Common output patterns
    return ['output', 'data', 'result'];
  }

  /**
   * Infer credential type from schema
   */
  private inferCredentialType(schema: NodeSchema): string | null {
    // Check if node requires credentials based on type
    const credentialNodes = [
      'slack_message',
      'linkedin',
      'twitter',
      'instagram',
      'google_sheets',
      'google_doc',
      'email'
    ];
    
    if (credentialNodes.includes(schema.type)) {
      // Return credential type based on node type
      if (schema.type === 'slack_message') return 'slackOAuth';
      if (schema.type === 'linkedin') return 'linkedinOAuth';
      if (schema.type === 'twitter') return 'twitterOAuth';
      if (schema.type === 'instagram') return 'instagramOAuth';
      if (schema.type.startsWith('google_')) return 'googleOAuth';
      if (schema.type === 'email') return 'smtp';
    }
    
    return null;
  }
}
