// Connection Validator Utility
// Validates node-to-node connections based on comprehensive prompt rules
// Ensures correct input/output field mapping and type compatibility

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';

export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dataContract?: {
    sourceNode: string;
    sourceField: string;
    sourceType: string;
    targetNode: string;
    targetField: string;
    targetType: string;
  };
}

export interface NodeOutputSchema {
  fields: Record<string, string>; // field name -> type
}

export interface NodeInputSchema {
  fields: Record<string, { type: string; required: boolean }>; // field name -> { type, required }
}

/**
 * Connection Validator
 * Validates connections between nodes based on comprehensive prompt rules
 */
export class ConnectionValidator {
  /**
   * Get output schema for a node type
   */
  private getNodeOutputSchema(nodeType: string): NodeOutputSchema {
    const schemas: Record<string, NodeOutputSchema> = {
      'form': {
        fields: {
          'formData': 'object',
          'submissionId': 'string',
          'timestamp': 'string',
        },
      },
      'webhook': {
        fields: {
          'body': 'object',
          'headers': 'object',
          'query': 'object',
          'method': 'string',
          'path': 'string',
        },
      },
      'schedule': {
        fields: {
          'triggerTime': 'string',
          'executionId': 'string',
        },
      },
      'interval': {
        fields: {
          'triggerTime': 'string',
          'executionId': 'string',
        },
      },
      'manual_trigger': {
        fields: {
          'inputData': 'object',
        },
      },
      'chat_trigger': {
        fields: {
          'message': 'string',
          'user': 'string',
          'timestamp': 'string',
        },
      },
      'ai_agent': {
        fields: {
          'response_text': 'string',
          'response_json': 'object',
          'response_markdown': 'string',
          'confidence_score': 'number',
          'used_tools': 'array',
          'memory_written': 'boolean',
          'error_flag': 'boolean',
          'error_message': 'string',
          'reasoning': 'string',
        },
      },
      'http_request': {
        fields: {
          'status': 'number',
          'headers': 'object',
          'body': 'object',
          'response': 'object',
        },
      },
      'http_post': {
        fields: {
          'status': 'number',
          'headers': 'object',
          'body': 'object',
          'response': 'object',
        },
      },
      'google_sheets': {
        fields: {
          'rows': 'array',
          'row_data': 'object',
          'sheet_data': 'array',
        },
      },
      'slack_message': {
        fields: {
          'messageId': 'string',
          'status': 'string',
          'sent': 'boolean',
        },
      },
      'email': {
        fields: {
          'messageId': 'string',
          'status': 'string',
          'sent': 'boolean',
        },
      },
      'discord': {
        fields: {
          'messageId': 'string',
          'status': 'string',
          'sent': 'boolean',
        },
      },
      'javascript': {
        fields: {
          'output': 'any',
          'result': 'any',
        },
      },
      'json_parser': {
        fields: {
          'parsed': 'object',
          'data': 'object',
        },
      },
      'text_formatter': {
        fields: {
          'formatted': 'string',
          'output': 'string',
        },
      },
      'chat_model': {
        fields: {
          'config': 'object',
        },
      },
      'if_else': {
        fields: {
          'data': 'any',
          'output': 'any',
          'result': 'any',
          'condition_result': 'boolean',
          'true': 'any',  // ✅ CRITICAL: if_else outputs 'true' for true path
          'false': 'any', // ✅ CRITICAL: if_else outputs 'false' for false path
        },
      },
      'hubspot': {
        fields: {
          'contact': 'object',
          'deal': 'object',
          'company': 'object',
          'output': 'any',
        },
      },
      'google_gmail': {
        fields: {
          'message': 'object',
          'response': 'object',
          'output': 'any',
          'sentMessage': 'object',
        },
      },
      'google_calendar': {
        fields: {
          'eventId': 'string',
          'success': 'boolean',
          'event': 'object',
        },
      },
    };

    return schemas[nodeType] || { fields: { 'data': 'any', 'output': 'any' } };
  }

  /**
   * Get input schema for a node type
   */
  private getNodeInputSchema(nodeType: string): NodeInputSchema {
    const schemas: Record<string, NodeInputSchema> = {
      'chat_trigger': {
        // NOTE: chat_trigger is a trigger node (outputs only), but this schema is for validation
        // Actual output fields: message, userId, sessionId, timestamp (from node-output-types.ts)
        fields: {
          'message': { type: 'string', required: true },
          'userId': { type: 'string', required: false },
          'sessionId': { type: 'string', required: false },
          'timestamp': { type: 'string', required: false },
        },
      },
      'ai_agent': {
        fields: {
          'userInput': { type: 'string', required: false },
          'chat_model': { type: 'object', required: true },
          'memory': { type: 'object', required: false },
          'tool': { type: 'object', required: false },
        },
      },
      'http_request': {
        fields: {
          'url': { type: 'string', required: true },
          'method': { type: 'string', required: false },
          'headers': { type: 'object', required: false },
          'body': { type: 'object', required: false },
          'params': { type: 'object', required: false },
        },
      },
      'http_post': {
        fields: {
          'url': { type: 'string', required: true },
          'headers': { type: 'object', required: false },
          'body': { type: 'object', required: false },
        },
      },
      'slack_message': {
        fields: {
          'message': { type: 'string', required: true },
          'text': { type: 'string', required: false }, // Alias for message
          'channel': { type: 'string', required: false },
          'username': { type: 'string', required: false },
        },
      },
      'email': {
        fields: {
          'to': { type: 'string', required: true },
          'subject': { type: 'string', required: true },
          'body': { type: 'string', required: true },
          'from': { type: 'string', required: false },
        },
      },
      'discord': {
        fields: {
          'content': { type: 'string', required: true },
          'channel': { type: 'string', required: false },
          'username': { type: 'string', required: false },
        },
      },
      'google_sheets': {
        fields: {
          'spreadsheetId': { type: 'string', required: true },
          'range': { type: 'string', required: false },
          'values': { type: 'array', required: false },
          'data': { type: 'object', required: false },
        },
      },
      'javascript': {
        fields: {
          'code': { type: 'string', required: true },
          'input': { type: 'any', required: false },
        },
      },
      'json_parser': {
        fields: {
          'json': { type: 'string', required: true },
          'data': { type: 'string', required: false },
        },
      },
      'text_formatter': {
        fields: {
          'template': { type: 'string', required: true },
          'data': { type: 'object', required: false },
        },
      },
    };

    return schemas[nodeType] || { fields: { 'input': { type: 'any', required: false }, 'data': { type: 'any', required: false } } };
  }

  /**
   * Check if types are compatible
   */
  private areTypesCompatible(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;

    // 'any' accepts anything
    if (targetType === 'any') return true;
    if (sourceType === 'any') return true;

    // String compatibility
    if (sourceType === 'string' && ['string', 'text', 'content'].includes(targetType)) return true;
    if (targetType === 'string' && ['string', 'text', 'content'].includes(sourceType)) return true;

    // Object compatibility
    if (sourceType === 'object' && ['object', 'json', 'data'].includes(targetType)) return true;
    if (targetType === 'object' && ['object', 'json', 'data'].includes(sourceType)) return true;

    // Array compatibility
    if (sourceType === 'array' && ['array', 'list', 'values'].includes(targetType)) return true;
    if (targetType === 'array' && ['array', 'list', 'values'].includes(sourceType)) return true;

    // Number compatibility
    if (sourceType === 'number' && ['number', 'numeric'].includes(targetType)) return true;
    if (targetType === 'number' && ['number', 'numeric'].includes(sourceType)) return true;

    return false;
  }

  /**
   * Validate a connection between two nodes
   */
  validateConnection(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    edge: WorkflowEdge
  ): ConnectionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // PHASE 1: Use normalized node types
    const sourceType = normalizeNodeType(sourceNode);
    const targetType = normalizeNodeType(targetNode);

    // Get schemas
    const sourceOutputSchema = this.getNodeOutputSchema(sourceType);
    const targetInputSchema = this.getNodeInputSchema(targetType);

    // Determine output and input fields from edge
    const outputField = edge.sourceHandle || 'data';
    const inputField = edge.targetHandle || 'input';

    // Special handling for AI Agent nodes
    if (targetType === 'ai_agent') {
      // Check if this is a chat_model connection
      if (sourceType === 'chat_model') {
        if (edge.targetHandle !== 'chat_model' && edge.type !== 'chat_model') {
          warnings.push(`AI Agent requires chat_model connection. Consider using targetHandle='chat_model'`);
        }
        return {
          valid: true,
          errors: [],
          warnings,
          dataContract: {
            sourceNode: sourceNode.id,
            sourceField: 'config',
            sourceType: 'object',
            targetNode: targetNode.id,
            targetField: 'chat_model',
            targetType: 'object',
          },
        };
      }

      // Check if this is a memory or tool connection
      if (sourceType === 'memory' || sourceType === 'tool') {
        return {
          valid: true,
          errors: [],
          warnings: [],
          dataContract: {
            sourceNode: sourceNode.id,
            sourceField: sourceType,
            sourceType: 'object',
            targetNode: targetNode.id,
            targetField: sourceType,
            targetType: 'object',
          },
        };
      }

      // Default: map to userInput
      if (!sourceOutputSchema.fields[outputField]) {
        // Try to find a suitable output field
        const suitableFields = Object.keys(sourceOutputSchema.fields).filter(f => 
          this.areTypesCompatible(sourceOutputSchema.fields[f], 'string')
        );
        if (suitableFields.length > 0) {
          warnings.push(`Output field '${outputField}' not found. Consider using: ${suitableFields.join(', ')}`);
        } else {
          errors.push(`Output field '${outputField}' does not exist in ${sourceType} node`);
        }
      }
    }

    // Validate output field exists
    if (!sourceOutputSchema.fields[outputField]) {
      errors.push(`Output field '${outputField}' does not exist in ${sourceType} node. Available fields: ${Object.keys(sourceOutputSchema.fields).join(', ')}`);
    }

    // Validate input field exists
    if (!targetInputSchema.fields[inputField]) {
      errors.push(`Input field '${inputField}' does not exist in ${targetType} node. Available fields: ${Object.keys(targetInputSchema.fields).join(', ')}`);
    }

    // Validate type compatibility
    if (sourceOutputSchema.fields[outputField] && targetInputSchema.fields[inputField]) {
      const sourceFieldType = sourceOutputSchema.fields[outputField];
      const targetFieldType = targetInputSchema.fields[inputField].type;

      if (!this.areTypesCompatible(sourceFieldType, targetFieldType)) {
        errors.push(`Type mismatch: ${sourceType}.${outputField} (${sourceFieldType}) → ${targetType}.${inputField} (${targetFieldType})`);
      }
    }

    // Check required fields for AI Agent
    if (targetType === 'ai_agent') {
      // Check if chat_model is connected (required)
      // This is checked at workflow level, not connection level
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      dataContract: errors.length === 0 ? {
        sourceNode: sourceNode.id,
        sourceField: outputField,
        sourceType: sourceOutputSchema.fields[outputField] || 'unknown',
        targetNode: targetNode.id,
        targetField: inputField,
        targetType: targetInputSchema.fields[inputField]?.type || 'unknown',
      } : undefined,
    };
  }

  /**
   * Validate all connections in a workflow
   */
  validateAllConnections(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): {
    valid: boolean;
    results: ConnectionValidationResult[];
    errors: string[];
    warnings: string[];
  } {
    const results: ConnectionValidationResult[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode) {
        allErrors.push(`Edge ${edge.id}: Source node ${edge.source} not found`);
        continue;
      }

      if (!targetNode) {
        allErrors.push(`Edge ${edge.id}: Target node ${edge.target} not found`);
        continue;
      }

      const result = this.validateConnection(sourceNode, targetNode, edge);
      results.push(result);

      if (!result.valid) {
        // ✅ CRITICAL FIX: Use normalizeNodeType for consistent type reporting
        const sourceActualType = normalizeNodeType(sourceNode);
        const targetActualType = normalizeNodeType(targetNode);
        allErrors.push(...result.errors.map(e => `Edge ${edge.id} (${sourceActualType} → ${targetActualType}): ${e}`));
      }

      if (result.warnings.length > 0) {
        // ✅ CRITICAL FIX: Use normalizeNodeType for consistent type reporting
        const sourceActualType = normalizeNodeType(sourceNode);
        const targetActualType = normalizeNodeType(targetNode);
        allWarnings.push(...result.warnings.map(w => `Edge ${edge.id} (${sourceActualType} → ${targetActualType}): ${w}`));
      }
    }

    return {
      valid: allErrors.length === 0,
      results,
      errors: allErrors,
      warnings: allWarnings,
    };
  }
}

export const connectionValidator = new ConnectionValidator();

