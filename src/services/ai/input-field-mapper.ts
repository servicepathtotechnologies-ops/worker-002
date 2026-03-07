/**
 * Input Field Mapper
 * Ensures input field values are correctly formatted with template expressions
 * and validated against previous node outputs for proper data flow
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { getNodeOutputSchema, NodeOutputSchema } from '../../core/types/node-output-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface FieldMapping {
  field: string;
  value: string; // Template expression like {{$json.email}}
  sourceNodeId: string;
  sourceNodeType: string;
  sourceField: string;
  sourceType: string;
  targetType: string;
  valid: boolean;
  validationErrors?: string[];
}

export interface NodeOutputFields {
  nodeId: string;
  nodeType: string;
  outputFields: string[];
  outputSchema: NodeOutputSchema | null;
  commonFields: string[]; // Fields like 'data', 'output', 'result'
  // ✅ ENHANCED: Schema-aware template generation support
  fieldPaths?: Record<string, string>;  // Field name → full path (e.g., "body" → "response.body")
  fieldTypes?: Record<string, string>;  // Field name → type (e.g., "body" → "string")
  sampleValues?: Record<string, any>;   // Field name → sample value (for LLM context)
}

/**
 * Enhanced Input Field Mapper
 * Maps input fields to previous node outputs with proper template formatting
 */
export class InputFieldMapper {
  /**
   * Map input field to previous node output with correct template format
   */
  mapInputField(
    fieldName: string,
    fieldType: string,
    targetNode: WorkflowNode,
    previousNode: WorkflowNode | null,
    allNodes: WorkflowNode[],
    nodeIndex: number
  ): FieldMapping {
    const targetNodeType = unifiedNormalizeNodeType(targetNode);
    
    // If no previous node, try to use input from trigger
    if (!previousNode) {
      return this.mapToTriggerInput(fieldName, fieldType, targetNodeType);
    }

    // Get previous node output fields
    const previousOutput = this.getNodeOutputFields(previousNode);
    
    // Try to find matching field
    const match = this.findMatchingField(
      fieldName,
      fieldType,
      previousOutput,
      targetNodeType
    );

    if (match) {
      return {
        field: fieldName,
        value: this.formatTemplateExpression(match.sourceField, previousOutput),
        sourceNodeId: previousNode.id,
        sourceNodeType: previousOutput.nodeType,
        sourceField: match.sourceField,
        sourceType: match.sourceType,
        targetType: fieldType,
        valid: this.validateTypeCompatibility(match.sourceType, fieldType),
        validationErrors: this.validateTypeCompatibility(match.sourceType, fieldType) 
          ? undefined 
          : [`Type mismatch: ${match.sourceType} cannot be assigned to ${fieldType}`],
      };
    }

    // Try to find in other upstream nodes
    const upstreamNodes = allNodes.slice(0, nodeIndex);
    for (let i = upstreamNodes.length - 1; i >= 0; i--) {
      const upstreamNode = upstreamNodes[i];
      const upstreamOutput = this.getNodeOutputFields(upstreamNode);
      const upstreamMatch = this.findMatchingField(
        fieldName,
        fieldType,
        upstreamOutput,
        targetNodeType
      );

      if (upstreamMatch) {
        return {
          field: fieldName,
          value: this.formatTemplateExpression(upstreamMatch.sourceField, upstreamOutput),
          sourceNodeId: upstreamNode.id,
          sourceNodeType: upstreamOutput.nodeType,
          sourceField: upstreamMatch.sourceField,
          sourceType: upstreamMatch.sourceType,
          targetType: fieldType,
          valid: this.validateTypeCompatibility(upstreamMatch.sourceType, fieldType),
          validationErrors: this.validateTypeCompatibility(upstreamMatch.sourceType, fieldType)
            ? undefined
            : [`Type mismatch: ${upstreamMatch.sourceType} cannot be assigned to ${fieldType}`],
        };
      }
    }

    // No match found - return invalid mapping
    return {
      field: fieldName,
      value: `{{$json.${fieldName}}}`, // Fallback format
      sourceNodeId: previousNode.id,
      sourceNodeType: previousOutput.nodeType,
      sourceField: 'unknown',
      sourceType: 'unknown',
      targetType: fieldType,
      valid: false,
      validationErrors: [`No matching field found in upstream nodes for ${fieldName}`],
    };
  }

  /**
   * Get output fields from a node
   * Public method for use in validation
   */
  getNodeOutputFields(node: WorkflowNode): NodeOutputFields {
    const nodeType = unifiedNormalizeNodeType(node);
    const outputSchema = getNodeOutputSchema(nodeType);
    const nodeSchema = nodeLibrary.getSchema(nodeType);

    const outputFields: string[] = [];
    const commonFields: string[] = ['data', 'output', 'result'];

    // Get fields from output schema
    if (outputSchema?.structure?.fields) {
      outputFields.push(...Object.keys(outputSchema.structure.fields));
    }

    // Get fields from node config (if explicitly set)
    if (node.data?.config?.outputFields) {
      const fields = node.data.config.outputFields;
      if (Array.isArray(fields)) {
        outputFields.push(...fields);
      }
    }

    // Infer from node type
    const inferredFields = this.inferOutputFieldsFromNodeType(nodeType);
    outputFields.push(...inferredFields);

    // Remove duplicates
    const uniqueFields = Array.from(new Set(outputFields));

    // ✅ ENHANCED: Extract field paths, types, and sample values for schema-aware generation
    const fieldPaths: Record<string, string> = {};
    const fieldTypes: Record<string, string> = {};
    const sampleValues: Record<string, any> = {};

    for (const field of uniqueFields) {
      // Set field path (default to field name, can be nested)
      fieldPaths[field] = field;
      
      // Get field type from output schema
      if (outputSchema?.structure?.fields?.[field]) {
        fieldTypes[field] = outputSchema.structure.fields[field];
      } else {
        // Infer type from node type
        fieldTypes[field] = this.inferFieldType(field, nodeType);
      }
      
      // Generate sample value for LLM context
      sampleValues[field] = this.generateSampleValue(field, fieldTypes[field], nodeType);
    }

    return {
      nodeId: node.id,
      nodeType,
      outputFields: uniqueFields,
      outputSchema,
      commonFields,
      fieldPaths,
      fieldTypes,
      sampleValues,
    };
  }

  /**
   * Infer field type from field name and node type
   */
  private inferFieldType(fieldName: string, nodeType: string): string {
    const fieldLower = fieldName.toLowerCase();
    
    // Common patterns
    if (fieldLower.includes('id') || fieldLower === 'id') return 'string';
    if (fieldLower.includes('email')) return 'string';
    if (fieldLower.includes('url') || fieldLower.includes('link')) return 'string';
    if (fieldLower.includes('timestamp') || fieldLower.includes('date') || fieldLower.includes('time')) return 'string';
    if (fieldLower.includes('count') || fieldLower.includes('number') || fieldLower.includes('amount')) return 'number';
    if (fieldLower.includes('is') || fieldLower.includes('has') || fieldLower === 'active') return 'boolean';
    if (fieldLower.includes('items') || fieldLower.includes('rows') || fieldLower.includes('list')) return 'array';
    if (fieldLower.includes('data') || fieldLower.includes('body') || fieldLower.includes('content')) return 'object';
    
    // Default to string
    return 'string';
  }

  /**
   * Generate sample value for a field (for LLM context)
   */
  private generateSampleValue(fieldName: string, fieldType: string, nodeType: string): any {
    const fieldLower = fieldName.toLowerCase();
    
    switch (fieldType) {
      case 'string':
        if (fieldLower.includes('email')) return 'user@example.com';
        if (fieldLower.includes('url')) return 'https://example.com';
        if (fieldLower.includes('id')) return '12345';
        if (fieldLower.includes('name')) return 'John Doe';
        if (fieldLower.includes('title')) return 'Sample Title';
        if (fieldLower.includes('body') || fieldLower.includes('content')) return 'Sample content text';
        return 'sample string';
      
      case 'number':
        if (fieldLower.includes('count')) return 10;
        if (fieldLower.includes('amount') || fieldLower.includes('price')) return 99.99;
        return 42;
      
      case 'boolean':
        return true;
      
      case 'array':
        return [{ example: 'item' }];
      
      case 'object':
        return { example: 'value' };
      
      default:
        return null;
    }
  }

  /**
   * Infer output fields from node type
   * ✅ UPDATED: Synchronized with workflow-builder.ts for consistency
   */
  private inferOutputFieldsFromNodeType(nodeType: string): string[] {
    const typeLower = nodeType.toLowerCase();
    const fields: string[] = [];

    // ============================================
    // TRIGGER NODES
    // ============================================
    if (typeLower === 'manual_trigger') {
      // ✅ CRITICAL: manual_trigger outputs 'inputData', NOT 'output'
      fields.push('inputData', 'timestamp', 'triggerType');
    } else if (typeLower === 'workflow_trigger') {
      // ✅ CRITICAL: workflow_trigger also outputs 'inputData'
      fields.push('inputData', 'workflowId', 'timestamp');
    } else if (typeLower === 'chat_trigger') {
      // ✅ CRITICAL: chat_trigger outputs 'message', NOT 'output' or 'inputData'
      fields.push('message', 'userId', 'sessionId', 'timestamp');
    } else if (typeLower === 'webhook') {
      fields.push('body', 'headers', 'queryParams', 'method', 'query', 'path');
    } else if (typeLower === 'form') {
      fields.push('formData', 'fields', 'submission', 'submittedAt', 'formId');
    } else if (typeLower === 'schedule') {
      fields.push('output', 'executionId', 'cronExpression', 'executionTime', 'timezone', 'timestamp');
    } else if (typeLower === 'interval') {
      fields.push('output', 'executionId', 'interval', 'unit', 'executionTime');
    } else if (typeLower === 'error_trigger') {
      // ✅ CRITICAL: error_trigger outputs 'error', 'timestamp', 'source'
      fields.push('error', 'timestamp', 'source');
    }

    // AI nodes
    else if (typeLower.includes('ai_agent') || typeLower.includes('chat_model')) {
      fields.push('response_text', 'response_json', 'response_markdown', 'text', 'output');
    } else if (typeLower.includes('openai') || typeLower.includes('claude') || typeLower.includes('gemini')) {
      fields.push('text', 'response', 'content', 'message');
    }

    // CRM nodes
    else if (typeLower === 'hubspot') {
      fields.push('record', 'records', 'contact', 'company', 'deal');
    } else if (typeLower === 'zoho_crm' || typeLower === 'zoho') {
      fields.push('record', 'records', 'data');
    } else if (typeLower === 'pipedrive') {
      fields.push('deal', 'person', 'organization', 'data');
    } else if (typeLower === 'notion') {
      fields.push('page', 'pages', 'database', 'data');
    } else if (typeLower === 'airtable') {
      fields.push('record', 'records', 'data');
    } else if (typeLower === 'clickup') {
      fields.push('task', 'tasks', 'data');
    }

    // Communication nodes
    else if (typeLower === 'google_gmail') {
      // ✅ PERMANENT: Only google_gmail exists - gmail is NOT a separate node type
      fields.push('sentMessage', 'messageId', 'messages');
    } else if (typeLower === 'slack_message' || typeLower === 'slack') {
      fields.push('message', 'ts', 'channel');
    } else if (typeLower === 'telegram') {
      fields.push('message', 'messageId', 'chatId');
    } else if (typeLower === 'outlook') {
      fields.push('sentMessage', 'messageId');
    } else if (typeLower === 'google_calendar') {
      fields.push('event', 'eventId', 'events');
    }

    // Social/Dev nodes
    else if (typeLower === 'linkedin') {
      fields.push('post', 'postId', 'urn');
    } else if (typeLower === 'github') {
      fields.push('issue', 'pullRequest', 'repository');
    } else if (typeLower === 'twitter') {
      fields.push('tweet', 'tweetId');
    } else if (typeLower === 'instagram') {
      fields.push('post', 'postId', 'mediaId');
    } else if (typeLower === 'facebook') {
      fields.push('post', 'postId');
    } else if (typeLower === 'youtube') {
      fields.push('video', 'videoId', 'playlist');
    } else if (typeLower === 'whatsapp_cloud') {
      fields.push('message', 'messageId', 'to');
    }

    // Data nodes
    else if (typeLower === 'google_sheets') {
      fields.push('rows', 'data', 'values', 'range');
    } else if (typeLower.includes('database')) {
      fields.push('rows', 'data', 'records');
    }

    // Logic nodes
    else if (typeLower === 'if_else' || typeLower === 'if') {
      fields.push('result', 'output', 'condition_result', 'data');
    } else if (typeLower === 'switch') {
      fields.push('result', 'output', 'case_result', 'data');
    } else if (typeLower === 'set' || typeLower === 'set_variable') {
      fields.push('output', 'data', 'variables', 'result');
    } else if (typeLower.includes('javascript') || typeLower === 'code') {
      fields.push('result', 'output', 'data', 'value');
    } else if (typeLower === 'merge') {
      fields.push('output', 'merged', 'data', 'result');
    } else if (typeLower === 'wait') {
      fields.push('output', 'data', 'waitedUntil', 'duration');
    } else if (typeLower === 'limit') {
      fields.push('output', 'data', 'limited', 'items');
    } else if (typeLower === 'aggregate') {
      fields.push('output', 'data', 'aggregated', 'result', 'groups');
    } else if (typeLower === 'sort') {
      fields.push('output', 'data', 'sorted', 'items');
    } else if (typeLower === 'function') {
      fields.push('output', 'data', 'result', 'returnValue');
    } else if (typeLower === 'function_item') {
      fields.push('output', 'data', 'result', 'processed');
    } else if (typeLower === 'noop') {
      fields.push('output', 'data', 'input', 'result');
    } else if (typeLower === 'filter') {
      fields.push('output', 'data', 'filtered', 'items');
    } else if (typeLower === 'loop') {
      fields.push('output', 'data', 'iterated', 'items');
    }

    // HTTP Request node
    else if (typeLower === 'http_request') {
      fields.push('body', 'response', 'data', 'status', 'headers');
    }

    // AI Chat Model (ai_chat_model)
    else if (typeLower === 'ai_chat_model' || typeLower === 'chat_model') {
      fields.push('text', 'response', 'content', 'message', 'output');
    }

    // Common fallback fields
    if (fields.length === 0) {
      fields.push('data', 'output', 'result', 'value');
    }

    return fields;
  }

  /**
   * Find matching field in previous node output
   */
  private findMatchingField(
    fieldName: string,
    fieldType: string,
    previousOutput: NodeOutputFields,
    targetNodeType: string
  ): { sourceField: string; sourceType: string } | null {
    const fieldNameLower = fieldName.toLowerCase();

    // Exact match
    for (const outputField of previousOutput.outputFields) {
      if (outputField.toLowerCase() === fieldNameLower) {
        const sourceType = this.getFieldType(outputField, previousOutput);
        return { sourceField: outputField, sourceType };
      }
    }

    // Semantic matching
    const semanticMatches: Record<string, string[]> = {
      email: ['email', 'to', 'recipient', 'userEmail', 'contactEmail'],
      name: ['name', 'firstName', 'firstname', 'fullName', 'username'],
      message: ['message', 'text', 'content', 'body', 'response_text', 'responseText'],
      subject: ['subject', 'title', 'heading'],
      text: ['text', 'message', 'content', 'body', 'response_text'],
      data: ['data', 'output', 'result', 'value'],
      id: ['id', 'objectId', 'recordId', 'messageId', 'eventId', 'taskId'],
      url: ['url', 'link', 'href', 'uri'],
      phone: ['phone', 'phoneNumber', 'mobile', 'telephone'],
      date: ['date', 'timestamp', 'createdAt', 'updatedAt'],
    };

    for (const [key, synonyms] of Object.entries(semanticMatches)) {
      if (fieldNameLower.includes(key)) {
        for (const synonym of synonyms) {
          const match = previousOutput.outputFields.find(f => 
            f.toLowerCase() === synonym.toLowerCase() ||
            f.toLowerCase().includes(synonym.toLowerCase())
          );
          if (match) {
            const sourceType = this.getFieldType(match, previousOutput);
            return { sourceField: match, sourceType };
          }
        }
      }
    }

    // Use first available field if no match
    if (previousOutput.outputFields.length > 0) {
      const firstField = previousOutput.outputFields[0];
      const sourceType = this.getFieldType(firstField, previousOutput);
      return { sourceField: firstField, sourceType };
    }

    // Use common fields
    if (previousOutput.commonFields.length > 0) {
      const commonField = previousOutput.commonFields[0];
      return { sourceField: commonField, sourceType: 'object' };
    }

    return null;
  }

  /**
   * Get field type from output schema
   */
  private getFieldType(fieldName: string, output: NodeOutputFields): string {
    if (output.outputSchema?.structure?.fields) {
      const fieldType = output.outputSchema.structure.fields[fieldName];
      if (fieldType) {
        return fieldType;
      }
    }

    // Infer from field name
    const fieldLower = fieldName.toLowerCase();
    if (fieldLower.includes('email') || fieldLower.includes('to')) return 'email';
    if (fieldLower.includes('id')) return 'string';
    if (fieldLower.includes('count') || fieldLower.includes('number')) return 'number';
    if (fieldLower.includes('is') || fieldLower.includes('has')) return 'boolean';
    if (fieldLower.includes('date') || fieldLower.includes('time')) return 'datetime';

    // Default based on output schema type
    if (output.outputSchema) {
      if (output.outputSchema.type === 'array') {
        return 'array';
      }
      if (output.outputSchema.type === 'object') {
        return 'object';
      }
      if (output.outputSchema.type === 'string') {
        return 'string';
      }
    }

    return 'string'; // Default
  }

  /**
   * Format template expression correctly
   * Uses {{$json.field}} format for proper data flow
   */
  private formatTemplateExpression(
    fieldName: string,
    sourceOutput: NodeOutputFields
  ): string {
    // Use $json prefix for proper template resolution
    // This ensures the value is correctly extracted from the previous node's output
    return `{{$json.${fieldName}}}`;
  }

  /**
   * Map to trigger input (when no previous node)
   */
  private mapToTriggerInput(
    fieldName: string,
    fieldType: string,
    targetNodeType: string
  ): FieldMapping {
    return {
      field: fieldName,
      value: `{{input.${fieldName}}}`, // Use input. prefix for trigger data
      sourceNodeId: 'trigger',
      sourceNodeType: 'trigger',
      sourceField: fieldName,
      sourceType: fieldType,
      targetType: fieldType,
      valid: true,
    };
  }

  /**
   * Validate type compatibility
   */
  private validateTypeCompatibility(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;

    // String can accept most types (converted to string)
    if (targetType === 'string') return true;

    // Number can accept string numbers
    if (targetType === 'number' && sourceType === 'string') return true;

    // Object can accept arrays (as single-item array)
    if (targetType === 'object' && sourceType === 'array') return true;

    // Array can accept single objects (wrapped)
    if (targetType === 'array' && sourceType === 'object') return true;

    // Email is a string subtype
    if (targetType === 'email' && sourceType === 'string') return true;

    // Datetime is a string subtype
    if (targetType === 'datetime' && sourceType === 'string') return true;

    return false;
  }

  /**
   * Validate all input fields for a node
   */
  validateNodeInputs(
    node: WorkflowNode,
    previousNode: WorkflowNode | null,
    allNodes: WorkflowNode[],
    nodeIndex: number
  ): {
    valid: boolean;
    mappings: FieldMapping[];
    errors: string[];
  } {
    const nodeType = unifiedNormalizeNodeType(node);
    const nodeSchema = nodeLibrary.getSchema(nodeType);
    
    if (!nodeSchema?.configSchema) {
      return {
        valid: false,
        mappings: [],
        errors: [`No schema found for node type: ${nodeType}`],
      };
    }

    const requiredFields = nodeSchema.configSchema.required || [];
    const optionalFields = nodeSchema.configSchema.optional || {};
    const allFields = [...requiredFields, ...Object.keys(optionalFields)];

    const mappings: FieldMapping[] = [];
    const errors: string[] = [];

    for (const fieldName of allFields) {
      const fieldInfo = optionalFields[fieldName] || {};
      const fieldType = fieldInfo.type || 'string';

      // Skip credential fields
      if (this.isCredentialField(fieldName, nodeType)) {
        continue;
      }

      // Skip operation field (set separately)
      if (fieldName === 'operation') {
        continue;
      }

      // Map the field
      const mapping = this.mapInputField(
        fieldName,
        fieldType,
        node,
        previousNode,
        allNodes,
        nodeIndex
      );

      mappings.push(mapping);

      // Check if required field is valid
      if (requiredFields.includes(fieldName) && !mapping.valid) {
        errors.push(
          `Required field ${fieldName} has invalid mapping: ${mapping.validationErrors?.join(', ')}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      mappings,
      errors,
    };
  }

  /**
   * Check if field is a credential field
   */
  private isCredentialField(fieldName: string, nodeType: string): boolean {
    const fieldLower = fieldName.toLowerCase();
    const credentialPatterns = [
      'credential',
      'oauth',
      'token',
      'api_key',
      'apikey',
      'secret',
      'password',
      'client_id',
      'client_secret',
    ];

    return credentialPatterns.some(pattern => fieldLower.includes(pattern));
  }
}

// Export singleton instance
export const inputFieldMapper = new InputFieldMapper();
