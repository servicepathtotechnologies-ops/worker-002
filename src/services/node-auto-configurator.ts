/**
 * Node Auto Configurator
 * 
 * Automatically configures node inputs and operations from workflow context
 * without requiring user input.
 * 
 * Features:
 * - Automatic operation detection
 * - Input value inference from previous node outputs
 * - Default value application
 * - DataRouter mapping integration
 * - Workflow intent analysis
 */

import { nodeLibrary } from './nodes/node-library';
import { WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { resolveNodeType } from '../core/utils/node-type-resolver-util';

export interface AutoConfigResult {
  success: boolean;
  config: Record<string, any>;
  operation?: string;
  mappedFields: Array<{
    field: string;
    source: string;
    sourceField: string;
    value: any;
  }>;
  missingFields: string[];
  confidence: number; // 0.0 to 1.0
  skipWizard: boolean; // Whether to skip configuration wizard
}

export interface WorkflowContext {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  previousNode?: WorkflowNode;
  nextNode?: WorkflowNode;
  workflowIntent?: string;
  nodeIndex?: number;
}

/**
 * Node Auto Configurator Service
 */
export class NodeAutoConfigurator {
  /**
   * Auto-configure a node based on workflow context
   */
  async autoConfigure(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<AutoConfigResult> {
    const nodeType = resolveNodeType(node.data?.type || node.type);
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema) {
      return {
        success: false,
        config: node.data?.config || {},
        mappedFields: [],
        missingFields: [],
        confidence: 0.0,
        skipWizard: false,
      };
    }

    const config: Record<string, any> = { ...(node.data?.config || {}) };
    const mappedFields: AutoConfigResult['mappedFields'] = [];
    const missingFields: string[] = [];

    // Step 1: Auto-detect operation
    const operation = this.detectOperation(nodeType, context, schema);
    if (operation) {
      config.operation = operation;
    }

    // Step 2: Infer input values from previous node outputs
    if (context.previousNode) {
      const inputMappings = this.inferInputValues(
        nodeType,
        context.previousNode,
        schema,
        context
      );
      
      for (const mapping of inputMappings) {
        config[mapping.field] = mapping.value;
        mappedFields.push({
          field: mapping.field,
          source: context.previousNode.id,
          sourceField: mapping.sourceField,
          value: mapping.value,
        });
      }
    }

    // Step 3: Apply default values from schema
    const defaults = this.getDefaultValues(schema, config);
    Object.assign(config, defaults);

    // Step 4: Use DataRouter mappings if available
    if (context.edges && context.previousNode) {
      const dataRouterMappings = this.getDataRouterMappings(
        context.previousNode,
        node,
        context.edges
      );
      Object.assign(config, dataRouterMappings);
    }

    // Step 5: Check for missing required fields
    const requiredFields = schema.configSchema?.required || [];
    for (const field of requiredFields) {
      if (!config[field] && !this.hasDefaultValue(schema, field)) {
        missingFields.push(field);
      }
    }

    // Step 6: Calculate confidence and skipWizard decision
    const confidence = this.calculateConfidence(
      config,
      schema,
      mappedFields,
      missingFields
    );
    const skipWizard = confidence >= 0.8 && missingFields.length === 0;

    return {
      success: missingFields.length === 0,
      config,
      operation,
      mappedFields,
      missingFields,
      confidence,
      skipWizard,
    };
  }

  /**
   * Auto-configure all nodes in a workflow
   */
  async autoConfigureWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    workflowIntent?: string
  ): Promise<{
    nodes: WorkflowNode[];
    allConfigured: boolean;
    skipWizard: boolean;
    summary: {
      total: number;
      configured: number;
      partial: number;
      failed: number;
    };
  }> {
    const configuredNodes: WorkflowNode[] = [];
    let allConfigured = true;
    let skipWizard = true;
    const summary = {
      total: nodes.length,
      configured: 0,
      partial: 0,
      failed: 0,
    };

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const previousNode = i > 0 ? nodes[i - 1] : undefined;
      const nextNode = i < nodes.length - 1 ? nodes[i + 1] : undefined;

      const context: WorkflowContext = {
        nodes,
        edges,
        previousNode,
        nextNode,
        workflowIntent,
        nodeIndex: i,
      };

      const result = await this.autoConfigure(node, context);

      // Update node config
      const updatedNode: WorkflowNode = {
        ...node,
        data: {
          ...node.data,
          config: result.config,
          ...(result.success ? { autoConfigured: result.success } : {}),
          ...(result.confidence ? { autoConfigConfidence: result.confidence } : {}),
        } as any,
      };

      configuredNodes.push(updatedNode);

      // Update summary
      if (result.success && result.confidence >= 0.8) {
        summary.configured++;
      } else if (result.confidence >= 0.5) {
        summary.partial++;
        allConfigured = false;
      } else {
        summary.failed++;
        allConfigured = false;
      }

      // Skip wizard only if all nodes are fully configured
      if (!result.skipWizard) {
        skipWizard = false;
      }
    }

    return {
      nodes: configuredNodes,
      allConfigured,
      skipWizard: skipWizard && allConfigured,
      summary,
    };
  }

  /**
   * Detect operation for a node based on context
   */
  private detectOperation(
    nodeType: string,
    context: WorkflowContext,
    schema: any
  ): string | undefined {
    // Check if operation is already set
    if (context.nodes.find(n => n.id === context.previousNode?.id)?.data?.config?.operation) {
      return undefined; // Already configured
    }

    // Operation detection rules based on node type and context
    const operationRules: Record<string, (context: WorkflowContext) => string | undefined> = {
      // Google Sheets
      google_sheets: (ctx) => {
        // If previous node is a trigger or no previous node, likely "read"
        if (!ctx.previousNode || ctx.previousNode.type?.includes('trigger')) {
          return 'read';
        }
        // If next node needs data, likely "read"
        if (ctx.nextNode && this.nodeNeedsData(ctx.nextNode)) {
          return 'read';
        }
        // Otherwise, check workflow intent
        if (ctx.workflowIntent?.toLowerCase().includes('read') || 
            ctx.workflowIntent?.toLowerCase().includes('fetch') ||
            ctx.workflowIntent?.toLowerCase().includes('get')) {
          return 'read';
        }
        if (ctx.workflowIntent?.toLowerCase().includes('write') ||
            ctx.workflowIntent?.toLowerCase().includes('save') ||
            ctx.workflowIntent?.toLowerCase().includes('update')) {
          return 'write';
        }
        return 'read'; // Default to read
      },

      // Google Gmail
      google_gmail: (ctx) => {
        // Gmail is typically "send" in workflows
        if (ctx.workflowIntent?.toLowerCase().includes('send') ||
            ctx.workflowIntent?.toLowerCase().includes('email') ||
            ctx.workflowIntent?.toLowerCase().includes('mail')) {
          return 'send';
        }
        // If previous node is AI or data processing, likely "send"
        if (ctx.previousNode && this.isDataProducer(ctx.previousNode)) {
          return 'send';
        }
        return 'send'; // Default to send
      },

      // Database nodes
      database_write: () => 'insert',
      database_read: () => 'select',
      supabase: (ctx) => {
        if (ctx.workflowIntent?.toLowerCase().includes('read') ||
            ctx.workflowIntent?.toLowerCase().includes('fetch')) {
          return 'select';
        }
        return 'insert'; // Default to insert
      },

      // HTTP nodes
      http_request: () => 'GET',
      http_post: () => 'POST',
    };

    const rule = operationRules[nodeType];
    if (rule) {
      return rule(context);
    }

    // Check schema for default operation
    const defaultOperation = schema.configSchema?.optional?.operation?.default;
    if (defaultOperation) {
      return defaultOperation;
    }

    return undefined;
  }

  /**
   * Infer input values from previous node outputs
   */
  private inferInputValues(
    nodeType: string,
    previousNode: WorkflowNode,
    schema: any,
    context: WorkflowContext
  ): Array<{ field: string; sourceField: string; value: any }> {
    const mappings: Array<{ field: string; sourceField: string; value: any }> = [];
    const previousNodeType = resolveNodeType(previousNode.data?.type || previousNode.type);
    const previousSchema = nodeLibrary.getSchema(previousNodeType);

    if (!previousSchema) {
      return mappings;
    }

    // Get output fields from previous node
    const previousOutputFields = this.getNodeOutputFields(previousNode, previousSchema);
    
    // Get input fields for current node
    const inputFields = this.getNodeInputFields(nodeType, schema);

    // Field mapping rules based on node type combinations
    const fieldMappings = this.getFieldMappingRules(nodeType, previousNodeType);

    for (const inputField of inputFields) {
      // Try explicit mapping rules first
      const explicitMapping = fieldMappings.find(m => m.targetField === inputField);
      if (explicitMapping && previousOutputFields.includes(explicitMapping.sourceField)) {
        mappings.push({
          field: inputField,
          sourceField: explicitMapping.sourceField,
          value: this.formatTemplateValue(explicitMapping.sourceField, previousNode.id),
        });
        continue;
      }

      // Try semantic matching
      const semanticMatch = this.findSemanticMatch(
        inputField,
        previousOutputFields,
        nodeType,
        previousNodeType
      );
      if (semanticMatch) {
        mappings.push({
          field: inputField,
          sourceField: semanticMatch,
          value: this.formatTemplateValue(semanticMatch, previousNode.id),
        });
        continue;
      }

      // Try generic field matching
      const genericMatch = this.findGenericMatch(inputField, previousOutputFields);
      if (genericMatch) {
        mappings.push({
          field: inputField,
          sourceField: genericMatch,
          value: this.formatTemplateValue(genericMatch, previousNode.id),
        });
      }
    }

    return mappings;
  }

  /**
   * Get field mapping rules for node type combinations
   */
  private getFieldMappingRules(
    targetNodeType: string,
    sourceNodeType: string
  ): Array<{ sourceField: string; targetField: string }> {
    // Common mapping patterns
    const commonMappings: Record<string, Record<string, Array<{ sourceField: string; targetField: string }>>> = {
      // Google Sheets → AI Service
      google_sheets: {
        ai_service: [
          { sourceField: 'rows', targetField: 'inputData' },
          { sourceField: 'data', targetField: 'inputData' },
        ],
      },
      // AI Service → Gmail
      ai_service: {
        google_gmail: [
          { sourceField: 'output', targetField: 'body' },
          { sourceField: 'text', targetField: 'body' },
          { sourceField: 'response', targetField: 'body' },
        ],
      },
      // AI Agent → Gmail
      ai_agent: {
        google_gmail: [
          { sourceField: 'response_text', targetField: 'body' },
          { sourceField: 'response_json.message', targetField: 'body' },
        ],
      },
      // Any → AI Service
      '*': {
        ai_service: [
          { sourceField: 'output', targetField: 'inputData' },
          { sourceField: 'data', targetField: 'inputData' },
        ],
      },
    };

    // Try specific mapping
    const specificMapping = commonMappings[sourceNodeType]?.[targetNodeType];
    if (specificMapping) {
      return specificMapping;
    }

    // Try wildcard mapping
    const wildcardMapping = commonMappings['*']?.[targetNodeType];
    if (wildcardMapping) {
      return wildcardMapping;
    }

    return [];
  }

  /**
   * Get node output fields
   */
  private getNodeOutputFields(node: WorkflowNode, schema: any): string[] {
    // Check node config for output fields
    if (node.data?.config?.outputFields) {
      const outputFields = node.data.config.outputFields;
      if (Array.isArray(outputFields)) {
        return outputFields.filter((f): f is string => typeof f === 'string');
      }
      if (typeof outputFields === 'string') {
        return [outputFields];
      }
    }

    // Check schema for output schema
    if (schema.outputSchema) {
      return Object.keys(schema.outputSchema);
    }

    // Use default output fields based on node type
    const defaultOutputs: Record<string, string[]> = {
      google_sheets: ['rows', 'data', 'values'],
      ai_service: ['output', 'text', 'response'],
      ai_agent: ['response_text', 'response_json', 'response_markdown'],
      google_gmail: ['messageId', 'status'],
      database_read: ['rows', 'data', 'results'],
      http_request: ['response', 'body', 'data'],
    };

    const nodeType = resolveNodeType(node.data?.type || node.type);
    return defaultOutputs[nodeType] || ['output', 'data'];
  }

  /**
   * Get node input fields
   */
  private getNodeInputFields(nodeType: string, schema: any): string[] {
    const requiredFields = schema.configSchema?.required || [];
    const optionalFields = Object.keys(schema.configSchema?.optional || {});
    
    // Prioritize required fields, then important optional fields
    const importantOptional = ['inputData', 'input', 'data', 'text', 'body', 'message', 'to', 'subject'];
    const importantFields = importantOptional.filter(f => optionalFields.includes(f));
    
    return [...requiredFields, ...importantFields];
  }

  /**
   * Find semantic match between input and output fields
   */
  private findSemanticMatch(
    inputField: string,
    outputFields: string[],
    targetNodeType: string,
    sourceNodeType: string
  ): string | undefined {
    // Normalize field names for comparison
    const normalize = (field: string) => field.toLowerCase().replace(/[_\s-]/g, '');

    const normalizedInput = normalize(inputField);

    // Try exact match
    for (const outputField of outputFields) {
      if (normalize(outputField) === normalizedInput) {
        return outputField;
      }
    }

    // Try partial match
    for (const outputField of outputFields) {
      const normalizedOutput = normalize(outputField);
      if (normalizedInput.includes(normalizedOutput) || normalizedOutput.includes(normalizedInput)) {
        return outputField;
      }
    }

    // Try semantic synonyms
    const synonyms: Record<string, string[]> = {
      inputdata: ['data', 'input', 'rows', 'values'],
      body: ['message', 'text', 'content', 'output'],
      message: ['body', 'text', 'content', 'output'],
      text: ['message', 'body', 'content', 'output'],
      data: ['rows', 'values', 'inputdata', 'input'],
    };

    const inputSynonyms = synonyms[normalizedInput] || [];
    for (const synonym of inputSynonyms) {
      for (const outputField of outputFields) {
        if (normalize(outputField) === synonym) {
          return outputField;
        }
      }
    }

    return undefined;
  }

  /**
   * Find generic match (fallback)
   */
  private findGenericMatch(inputField: string, outputFields: string[]): string | undefined {
    // Common generic fields
    const genericFields = ['output', 'data', 'result', 'value'];
    
    for (const genericField of genericFields) {
      if (outputFields.includes(genericField)) {
        return genericField;
      }
    }

    // Return first available field as last resort
    return outputFields.length > 0 ? outputFields[0] : undefined;
  }

  /**
   * Format template value for node connection
   * CRITICAL FIX: Use {{$json.field}} format instead of {{nodeId.field}}
   * This ensures proper data flow and compatibility with the execution engine
   */
  private formatTemplateValue(sourceField: string, sourceNodeId: string): string {
    // Format as template expression: {{$json.field}}
    // The execution engine resolves $json to the previous node's output
    return `{{$json.${sourceField}}}`;
  }

  /**
   * Get default values from schema
   */
  private getDefaultValues(schema: any, existingConfig: Record<string, any>): Record<string, any> {
    const defaults: Record<string, any> = {};
    const optionalFields = schema.configSchema?.optional || {};

    for (const [fieldName, fieldDef] of Object.entries(optionalFields)) {
      const field = fieldDef as any;
      // Only set default if not already configured
      if (!existingConfig[fieldName] && field.default !== undefined) {
        defaults[fieldName] = field.default;
      }
    }

    return defaults;
  }

  /**
   * Check if field has default value in schema
   */
  private hasDefaultValue(schema: any, fieldName: string): boolean {
    const optionalFields = schema.configSchema?.optional || {};
    const field = optionalFields[fieldName];
    return field?.default !== undefined;
  }

  /**
   * Get DataRouter mappings from edges
   */
  private getDataRouterMappings(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    edges: WorkflowEdge[]
  ): Record<string, any> {
    const mappings: Record<string, any> = {};
    
    // Find edge connecting source to target
    const edge = edges.find(
      e => e.source === sourceNode.id && e.target === targetNode.id
    );

    if (edge && (edge as any).data?.mapping) {
      // Use explicit mapping from edge
      Object.assign(mappings, (edge as any).data.mapping);
    }

    return mappings;
  }

  /**
   * Calculate configuration confidence
   */
  private calculateConfidence(
    config: Record<string, any>,
    schema: any,
    mappedFields: AutoConfigResult['mappedFields'],
    missingFields: string[]
  ): number {
    let confidence = 0.0;
    const requiredFields = schema.configSchema?.required || [];
    const totalFields = requiredFields.length;

    if (totalFields === 0) {
      return 1.0; // No required fields, fully configured
    }

    // Base confidence from required fields
    const configuredRequired = requiredFields.filter((f: string) => config[f] !== undefined && config[f] !== null && config[f] !== '').length;
    confidence += (configuredRequired / totalFields) * 0.6;

    // Bonus for mapped fields
    if (mappedFields.length > 0) {
      confidence += Math.min(mappedFields.length / totalFields, 0.3);
    }

    // Penalty for missing fields
    if (missingFields.length > 0) {
      confidence -= (missingFields.length / totalFields) * 0.1;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Check if node needs data (likely read operation)
   */
  private nodeNeedsData(node: WorkflowNode): boolean {
    const nodeType = resolveNodeType(node.data?.type || node.type);
    const dataConsumers = ['ai_service', 'ai_agent', 'text_summarizer', 'sentiment_analyzer'];
    return dataConsumers.includes(nodeType);
  }

  /**
   * Check if node produces data
   */
  private isDataProducer(node: WorkflowNode): boolean {
    const nodeType = resolveNodeType(node.data?.type || node.type);
    const dataProducers = ['ai_service', 'ai_agent', 'text_summarizer', 'google_sheets', 'database_read', 'http_request'];
    return dataProducers.includes(nodeType);
  }
}

// Export singleton instance
export const nodeAutoConfigurator = new NodeAutoConfigurator();
