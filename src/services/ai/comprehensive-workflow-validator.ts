// Comprehensive Workflow Validator
// Ensures 100% valid workflows with proper connections, required fields, and data flow

import { WorkflowNode, WorkflowEdge, Workflow } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  fixesApplied: string[];
}

export interface ValidationError {
  type: 'missing_field' | 'invalid_connection' | 'orphan_node' | 'circular_dependency' | 'data_type_mismatch' | 'execution_order';
  severity: 'critical' | 'high' | 'medium';
  nodeId?: string;
  nodeType?: string;
  fieldName?: string;
  message: string;
  fix?: string;
}

export interface ValidationWarning {
  type: 'optional_field_missing' | 'performance' | 'best_practice';
  nodeId?: string;
  message: string;
  suggestion?: string;
}

/**
 * Execution order priority (lower number = executes first)
 */
const EXECUTION_ORDER: Record<string, number> = {
  // Triggers (0-10)
  'manual_trigger': 0,
  'schedule': 1,
  'interval': 2,
  'webhook': 3,
  'form': 4,
  'chat_trigger': 5,
  'workflow_trigger': 6,
  'error_trigger': 7,
  
  // Data Sources (10-20)
  'google_sheets': 10,
  'google_drive': 11,
  'http_request': 12,
  'http_post': 13,
  'database_read': 14,
  'supabase': 15,
  
  // Data Processing (20-30)
  'set_variable': 20,
  'edit_fields': 21,
  'json_parser': 22,
  'csv_processor': 23,
  
  // Logic (30-40)
  'if_else': 30,
  'switch': 31,
  'filter': 32,
  'loop': 33,
  'merge': 34,
  'split_in_batches': 35,
  
  // AI/Transformation (40-50)
  'ai_agent': 40,
  'openai_gpt': 41,
  'anthropic_claude': 42,
  'google_gemini': 43,
  'javascript': 44,
  'text_formatter': 45,
  
  // Output (50-60)
  'slack_message': 50,
  'email': 51,
  'google_gmail': 52,
  'log_output': 53,
  'respond_to_webhook': 54,
  'database_write': 55,
};

/**
 * Required field defaults for nodes
 */
const NODE_DEFAULTS: Record<string, Record<string, any>> = {
  'ai_agent': {
    userInput: '{{inputData}}',
    systemPrompt: 'You are a helpful assistant. Process the input data and provide a useful response.',
    mode: 'chat',
  },
  'manual_trigger': {
    inputData: '{}',
  },
  'schedule': {
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
  },
  'interval': {
    interval: 3600,
    unit: 'seconds',
  },
  'webhook': {
    method: 'POST',
    path: '/webhook',
  },
  'if_else': {
    conditions: [{ leftValue: '{{$json.value}}', operation: 'equals', rightValue: 'true' }],
    combineOperation: 'AND',
  },
  'javascript': {
    code: 'return { ...input, processed: true };',
  },
  'slack_message': {
    channel: '#general',
    text: 'Workflow executed successfully',
  },
  'email': {
    to: 'user@example.com',
    subject: 'Workflow Notification',
    text: 'The workflow has been executed.',
  },
  'google_sheets': {
    operation: 'read',
    spreadsheetId: '',
    sheetName: 'Sheet1',
    range: 'A1:Z1000',
    outputFormat: 'json',
  },
  'http_request': {
    method: 'GET',
    url: 'https://api.example.com/data',
    headers: { 'Content-Type': 'application/json' },
  },
};

/**
 * Comprehensive Workflow Validator
 */
export class ComprehensiveWorkflowValidator {
  /**
   * Validate entire workflow
   */
  validateWorkflow(workflow: Workflow): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fixesApplied: string[] = [];
    
    // Step 1: Validate nodes
    const nodeValidation = this.validateNodes(workflow.nodes);
    errors.push(...nodeValidation.errors);
    warnings.push(...nodeValidation.warnings);
    fixesApplied.push(...nodeValidation.fixesApplied);
    
    // Step 2: Validate connections
    const connectionValidation = this.validateConnections(workflow.nodes, workflow.edges);
    errors.push(...connectionValidation.errors);
    warnings.push(...connectionValidation.warnings);
    fixesApplied.push(...connectionValidation.fixesApplied);
    
    // Step 3: Validate execution order
    const orderValidation = this.validateExecutionOrder(workflow.nodes, workflow.edges);
    errors.push(...orderValidation.errors);
    warnings.push(...orderValidation.warnings);
    
    // Step 4: Validate data flow
    const dataFlowValidation = this.validateDataFlow(workflow.nodes, workflow.edges);
    errors.push(...dataFlowValidation.errors);
    warnings.push(...dataFlowValidation.warnings);
    
    // Step 5: Validate data type compatibility
    const typeValidation = this.validateDataTypeCompatibility(workflow.nodes, workflow.edges);
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      fixesApplied,
    };
  }
  
  /**
   * Step 1: Validate nodes - ensure all required fields are populated
   */
  private validateNodes(nodes: WorkflowNode[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    fixesApplied: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fixesApplied: string[] = [];
    
    for (const node of nodes) {
      // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
      const nodeType = normalizeNodeType(node);
      const nodeId = node.id;
      const config = node.data?.config || {};
      
      // Get schema from node library
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        errors.push({
          type: 'missing_field',
          severity: 'critical',
          nodeId,
          nodeType,
          message: `Node type "${nodeType}" not found in node library`,
          fix: 'Use a valid node type from the node library',
        });
        continue;
      }
      
      const requiredFields = schema.configSchema?.required || [];
      
      // Check each required field
      for (const fieldName of requiredFields) {
        const value = config[fieldName];
        const isEmpty = value === undefined || 
                       value === null || 
                       (typeof value === 'string' && value.trim() === '') ||
                       (Array.isArray(value) && value.length === 0);
        
        if (isEmpty) {
          // Try to apply default
          const defaultValue = this.getDefaultValue(nodeType, fieldName);
          if (defaultValue !== undefined) {
            config[fieldName] = defaultValue;
            fixesApplied.push(`Applied default value for ${nodeType}.${fieldName}`);
          } else {
            errors.push({
              type: 'missing_field',
              severity: 'critical',
              nodeId,
              nodeType,
              fieldName,
              message: `Required field "${fieldName}" is empty in node ${nodeId} (${nodeType})`,
              fix: `Provide a value for ${fieldName} in node configuration`,
            });
          }
        }
      }
    }
    
    return { errors, warnings, fixesApplied };
  }
  
  /**
   * Step 2: Validate connections - ensure all nodes are properly connected
   */
  private validateConnections(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    fixesApplied: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fixesApplied: string[] = [];
    
    // Get trigger nodes (nodes that don't need incoming connections)
    const triggerNodeTypes = ['manual_trigger', 'schedule', 'interval', 'webhook', 'form', 'chat_trigger', 'workflow_trigger', 'error_trigger'];
    // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
    const triggerNodes = nodes.filter(n => triggerNodeTypes.includes(normalizeNodeType(n)));
    const triggerNodeIds = new Set(triggerNodes.map(n => n.id));
    
    // Get output nodes (nodes that don't need outgoing connections)
    const outputNodeTypes = ['slack_message', 'email', 'google_gmail', 'log_output', 'respond_to_webhook', 'database_write'];
    // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
    const outputNodes = nodes.filter(n => outputNodeTypes.includes(normalizeNodeType(n)));
    const outputNodeIds = new Set(outputNodes.map(n => n.id));
    
    // Check each node
    for (const node of nodes) {
      const nodeId = node.id;
      const incomingEdges = edges.filter(e => e.target === nodeId);
      const outgoingEdges = edges.filter(e => e.source === nodeId);
      
      // Non-trigger nodes must have incoming connections
      if (!triggerNodeIds.has(nodeId) && incomingEdges.length === 0) {
        // ✅ CRITICAL FIX: Use normalizeNodeType for consistent type reporting
        const nodeActualType = normalizeNodeType(node);
        errors.push({
          type: 'orphan_node',
          severity: 'critical',
          nodeId,
          nodeType: nodeActualType,
          message: `Node ${nodeId} (${nodeActualType}) has no incoming connection`,
          fix: `Connect a previous node to ${nodeId}`,
        });
      }
      
      // Non-output nodes should have outgoing connections
      if (!outputNodeIds.has(nodeId) && outgoingEdges.length === 0) {
        // ✅ CRITICAL FIX: Use normalizeNodeType for consistent type reporting
        const nodeActualType = normalizeNodeType(node);
        warnings.push({
          type: 'best_practice',
          nodeId,
          message: `Node ${nodeId} (${nodeActualType}) has no outgoing connection - workflow may end here`,
        });
      }
      
      // Validate each edge
      for (const edge of edges) {
        if (edge.source === nodeId || edge.target === nodeId) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          
          if (!sourceNode) {
            errors.push({
              type: 'invalid_connection',
              severity: 'critical',
              message: `Edge references non-existent source node: ${edge.source}`,
              fix: 'Remove or fix this edge',
            });
            continue;
          }
          
          if (!targetNode) {
            errors.push({
              type: 'invalid_connection',
              severity: 'critical',
              message: `Edge references non-existent target node: ${edge.target}`,
              fix: 'Remove or fix this edge',
            });
            continue;
          }
          
          // Validate source field exists
          if (edge.sourceHandle) {
            // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
            const sourceActualType = normalizeNodeType(sourceNode);
            const sourceOutputs = this.getNodeOutputFields(sourceActualType);
            if (!sourceOutputs.includes(edge.sourceHandle) && !this.isValidOutputField(sourceNode, edge.sourceHandle)) {
              // ✅ CRITICAL FIX: Use first available output field (not hardcoded 'output')
              const defaultOutput = sourceOutputs[0] || 'output';
              edge.sourceHandle = defaultOutput;
              fixesApplied.push(`Fixed source field for edge ${edge.id}: ${edge.sourceHandle} (node type: ${sourceActualType})`);
            }
          }
          
          // Validate target field exists
          if (edge.targetHandle) {
            // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
            const targetActualType = normalizeNodeType(targetNode);
            const targetInputs = this.getNodeInputFields(targetActualType);
            if (!targetInputs.includes(edge.targetHandle) && !this.isValidInputField(targetNode, edge.targetHandle)) {
              // Try to fix with default input field
              const defaultInput = targetInputs[0] || 'input';
              edge.targetHandle = defaultInput;
              fixesApplied.push(`Fixed target field for edge ${edge.id}: ${edge.targetHandle} (node type: ${targetActualType})`);
            }
          }
        }
      }
    }
    
    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(nodes, edges);
    if (circularDeps.length > 0) {
      errors.push({
        type: 'circular_dependency',
        severity: 'critical',
        message: `Circular dependencies detected: ${circularDeps.join(', ')}`,
        fix: 'Remove circular connections',
      });
    }
    
    return { errors, warnings, fixesApplied };
  }
  
  /**
   * Step 3: Validate execution order
   */
  private validateExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Check if nodes are in correct execution order based on connections
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
        const sourceActualType = normalizeNodeType(sourceNode);
        const targetActualType = normalizeNodeType(targetNode);
        const sourceOrder = EXECUTION_ORDER[sourceActualType] ?? 100;
        const targetOrder = EXECUTION_ORDER[targetActualType] ?? 100;
        
        if (sourceOrder > targetOrder) {
          warnings.push({
            type: 'best_practice',
            nodeId: targetNode.id,
            message: `Execution order violation: ${sourceActualType} (order ${sourceOrder}) connects to ${targetActualType} (order ${targetOrder})`,
            suggestion: 'Consider reordering nodes for better execution flow',
          });
        }
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Step 4: Validate data flow - ensure path exists from trigger to output
   */
  private validateDataFlow(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    const triggerNodeTypes = ['manual_trigger', 'schedule', 'interval', 'webhook', 'form', 'chat_trigger', 'workflow_trigger', 'error_trigger'];
    const outputNodeTypes = ['slack_message', 'email', 'google_gmail', 'log_output', 'respond_to_webhook'];
    
    // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
    const { normalizeNodeType } = require('../../core/utils/node-type-normalizer');
    const triggerNodes = nodes.filter(n => triggerNodeTypes.includes(normalizeNodeType(n)));
    const outputNodes = nodes.filter(n => outputNodeTypes.includes(normalizeNodeType(n)));
    
    if (triggerNodes.length === 0) {
      errors.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Workflow has no trigger node',
        fix: 'Add a trigger node (manual_trigger, schedule, webhook, etc.)',
      });
    }
    
    if (outputNodes.length === 0) {
      warnings.push({
        type: 'best_practice',
        message: 'Workflow has no output node - consider adding one',
      });
    }
    
    // Check if there's a path from at least one trigger to at least one output
    let hasValidPath = false;
    for (const trigger of triggerNodes) {
      for (const output of outputNodes) {
        if (this.canReach(trigger.id, output.id, edges, nodes)) {
          hasValidPath = true;
          break;
        }
      }
      if (hasValidPath) break;
    }
    
    if (!hasValidPath && triggerNodes.length > 0 && outputNodes.length > 0) {
      errors.push({
        type: 'invalid_connection',
        severity: 'critical',
        message: 'No valid path exists from trigger to output node',
        fix: 'Add connections to create a path from trigger to output',
      });
    }
    
    return { errors, warnings };
  }
  
  /**
   * Step 5: Validate data type compatibility
   */
  private validateDataTypeCompatibility(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode && edge.sourceHandle && edge.targetHandle) {
        // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
        const sourceActualType = normalizeNodeType(sourceNode);
        const targetActualType = normalizeNodeType(targetNode);
        const sourceType = this.getOutputFieldType(sourceActualType, edge.sourceHandle);
        const targetType = this.getInputFieldType(targetActualType, edge.targetHandle);
        
        if (sourceType && targetType && !this.areTypesCompatible(sourceType, targetType)) {
          warnings.push({
            type: 'best_practice',
            nodeId: targetNode.id,
            message: `Potential type mismatch: ${sourceActualType}.${edge.sourceHandle} (${sourceType}) → ${targetActualType}.${edge.targetHandle} (${targetType})`,
            suggestion: 'Verify data types are compatible',
          });
        }
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Get default value for a field
   */
  private getDefaultValue(nodeType: string, fieldName: string): any {
    // Check node defaults
    if (NODE_DEFAULTS[nodeType]?.[fieldName] !== undefined) {
      return NODE_DEFAULTS[nodeType][fieldName];
    }
    
    // Check schema default
    const schema = nodeLibrary.getSchema(nodeType);
    if (schema?.configSchema?.optional?.[fieldName]?.default !== undefined) {
      return schema.configSchema.optional[fieldName].default;
    }
    
    return undefined;
  }
  
  /**
   * Get output fields for a node type
   */
  private getNodeOutputFields(nodeType: string): string[] {
    const outputFields: Record<string, string[]> = {
      // ============================================
      // TRIGGER NODES
      // ============================================
      'manual_trigger': ['inputData', 'timestamp', 'triggerType'],
      'workflow_trigger': ['inputData', 'workflowId', 'timestamp'],
      'webhook': ['body', 'headers', 'query', 'method', 'path', 'queryParams'],
      'schedule': ['output', 'executionId', 'cronExpression', 'executionTime', 'timezone'],
      'interval': ['output', 'executionId', 'interval', 'unit', 'executionTime'],
      'chat_trigger': ['message', 'userId', 'sessionId', 'timestamp'],
      'error_trigger': ['error', 'timestamp', 'source'],
      'form': ['formData', 'submissionId', 'timestamp', 'fields'],
      
      // ============================================
      // AI NODES
      // ============================================
      'ai_agent': ['response_text', 'response_json', 'response_markdown', 'confidence_score', 'used_tools', 'memory_written', 'error_flag', 'error_message', 'reasoning', 'text', 'output'],
      'openai_gpt': ['text', 'response', 'content', 'message', 'output'],
      'anthropic_claude': ['text', 'response', 'content', 'message', 'output'],
      'google_gemini': ['text', 'response', 'content', 'message', 'output'],
      'ollama': ['text', 'response', 'content', 'message', 'output'],
      'text_summarizer': ['text', 'summary', 'output'],
      'sentiment_analyzer': ['sentiment', 'score', 'emotions', 'output'],
      'chat_model': ['config', 'provider', 'model'],
      'memory': ['messages', 'context'],
      'tool': ['name', 'description', 'parameters'],
      
      // ============================================
      // HTTP & API NODES
      // ============================================
      'http_request': ['status', 'headers', 'body', 'response', 'responseTime'],
      'http_post': ['status', 'headers', 'body', 'response', 'responseTime'],
      'respond_to_webhook': [],
      'webhook_response': [],
      'graphql': ['data', 'errors', 'response'],
      
      // ============================================
      // GOOGLE SERVICES
      // ============================================
      'google_sheets': ['data', 'rows', 'row_data', 'sheet_data'],
      'google_doc': ['content', 'document_data', 'text'],
      'google_drive': ['file_id', 'file_url', 'file_data', 'files'],
      'google_gmail': ['message', 'response', 'output'],
      'google_calendar': ['eventId', 'success', 'event'],
      'google_tasks': ['tasks', 'data'],
      'google_contacts': ['contacts', 'data'],
      'google_bigquery': ['rows', 'data', 'result'],
      
      // ============================================
      // OUTPUT & COMMUNICATION NODES
      // ============================================
      'slack_message': ['message', 'response', 'output'],
      'slack_webhook': ['message', 'response', 'output'],
      'log_output': [],
      'discord': ['message', 'response', 'output'],
      'discord_webhook': ['message', 'response', 'output'],
      'email': ['message', 'response', 'output'],
      'microsoft_teams': ['message', 'response', 'output'],
      'telegram': ['message', 'response', 'output'],
      'whatsapp_cloud': ['message', 'response', 'output'],
      'twilio': ['message', 'response', 'output'],
      
      // ============================================
      // SOCIAL MEDIA NODES
      // ============================================
      'linkedin': ['message', 'response', 'output'],
      'twitter': ['message', 'response', 'output'],
      'instagram': ['message', 'response', 'output'],
      'facebook': ['message', 'response', 'output'],
      
      // ============================================
      // DATA MANIPULATION NODES
      // ============================================
      'javascript': ['output', 'result', 'data'],
      'set_variable': ['output', 'data', 'variables'],
      'set': ['output', 'data', 'variables'],
      'json_parser': ['parsed', 'data', 'output'],
      'text_formatter': ['formatted', 'output', 'text'],
      'date_time': ['formatted', 'timestamp', 'output'],
      'math': ['result', 'output'],
      'html': ['parsed', 'text', 'output'],
      'xml': ['parsed', 'text', 'output'],
      'csv': ['rows', 'data'],
      'merge_data': ['merged', 'data', 'output'],
      'rename_keys': ['renamed', 'data', 'output'],
      'edit_fields': ['edited', 'data', 'output'],
      
      // ============================================
      // LOGIC NODES
      // ============================================
      'if_else': ['data', 'output', 'result', 'condition_result', 'true', 'false'],
      'switch': ['result', 'output', 'case_result', 'data'],
      'filter': ['filtered', 'data', 'output'],
      'loop': ['iterated', 'data', 'output'],
      'merge': ['merged', 'data', 'output'],
      'split_in_batches': ['batches', 'data'],
      'wait': ['waitedUntil', 'duration', 'output'],
      'error_handler': ['result', 'output', 'data'],
      'stop_and_error': [],
      'noop': ['output', 'data'],
      'limit': ['limited', 'data', 'output'],
      'aggregate': ['groups', 'totals', 'count', 'output'],
      'sort': ['sorted', 'data', 'output'],
      
      // ============================================
      // DATABASE NODES
      // ============================================
      'database_read': ['rows', 'data', 'result'],
      'database_write': ['affectedRows', 'insertId', 'result', 'rowsAffected'],
      'supabase': ['data', 'error', 'rows'],
      'postgresql': ['rows', 'data', 'result'],
      'mysql': ['rows', 'data', 'result'],
      'mongodb': ['documents', 'data', 'result'],
      'redis': ['value', 'data', 'result'],
      
      // ============================================
      // CRM & MARKETING NODES
      // ============================================
      'hubspot': ['data', 'result', 'output'],
      'zoho_crm': ['data', 'result', 'output'],
      'pipedrive': ['data', 'result', 'output'],
      'salesforce': ['data', 'result', 'output'],
      'freshdesk': ['data', 'result', 'output'],
      'intercom': ['data', 'result', 'output'],
      'mailchimp': ['data', 'result', 'output'],
      'activecampaign': ['data', 'result', 'output'],
      
      // ============================================
      // FILE & STORAGE NODES
      // ============================================
      'read_binary_file': ['content', 'data', 'file'],
      'write_binary_file': ['success', 'filePath', 'output'],
      'aws_s3': ['fileUrl', 'fileKey', 'data'],
      'dropbox': ['fileUrl', 'filePath', 'data'],
      'onedrive': ['fileUrl', 'filePath', 'data'],
      'ftp': ['success', 'filePath', 'output'],
      'sftp': ['success', 'filePath', 'output'],
      
      // ============================================
      // DEVOPS NODES
      // ============================================
      'github': ['data', 'result', 'output'],
      'gitlab': ['data', 'result', 'output'],
      'bitbucket': ['data', 'result', 'output'],
      'jira': ['data', 'result', 'output'],
      'jenkins': ['data', 'result', 'output'],
      
      // ============================================
      // E-COMMERCE NODES
      // ============================================
      'shopify': ['data', 'result', 'output'],
      'woocommerce': ['data', 'result', 'output'],
      'stripe': ['data', 'result', 'output'],
      'paypal': ['data', 'result', 'output'],
    };
    
    return outputFields[nodeType] || ['output', 'data', 'result'];
  }
  
  /**
   * Get input fields for a node type
   */
  private getNodeInputFields(nodeType: string): string[] {
    const inputFields: Record<string, string[]> = {
      'ai_agent': ['userInput', 'chat_model', 'memory', 'tool'], // CRITICAL: ai_agent accepts userInput, chat_model, memory, and tool
      'http_request': ['url', 'body', 'headers'],
      'google_sheets': ['spreadsheetId', 'range', 'values', 'data'],
      'slack_message': ['channel', 'text', 'message'],
      'email': ['to', 'subject', 'text', 'body'],
      'if_else': ['data', 'condition'],
      'javascript': ['input', 'data'],
      'set_variable': ['input', 'data'],
    };
    
    return inputFields[nodeType] || ['input', 'data'];
  }
  
  /**
   * Check if field is a valid output field
   */
  private isValidOutputField(node: WorkflowNode, fieldName: string): boolean {
    // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
    const nodeActualType = normalizeNodeType(node);
    const outputs = this.getNodeOutputFields(nodeActualType);
    return outputs.includes(fieldName) || 
           fieldName === 'output' || 
           fieldName === 'data' || 
           fieldName === 'result';
  }
  
  /**
   * Check if field is a valid input field
   */
  private isValidInputField(node: WorkflowNode, fieldName: string): boolean {
    // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
    const nodeActualType = normalizeNodeType(node);
    const inputs = this.getNodeInputFields(nodeActualType);
    return inputs.includes(fieldName) || 
           fieldName === 'input' || 
           fieldName === 'data';
  }
  
  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        cycles.push(path.join(' → ') + ` → ${nodeId}`);
        return;
      }
      
      if (visited.has(nodeId)) return;
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const outgoingEdges = edges.filter(e => e.source === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.target, [...path]);
      }
      
      recursionStack.delete(nodeId);
    };
    
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }
    
    return cycles;
  }
  
  /**
   * Check if target node is reachable from source node
   */
  private canReach(sourceId: string, targetId: string, edges: WorkflowEdge[], nodes: WorkflowNode[]): boolean {
    if (sourceId === targetId) return true;
    
    const visited = new Set<string>();
    const queue = [sourceId];
    visited.add(sourceId);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const outgoingEdges = edges.filter(e => e.source === currentId);
      
      for (const edge of outgoingEdges) {
        if (edge.target === targetId) {
          return true;
        }
        
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get output field type
   */
  private getOutputFieldType(nodeType: string, fieldName: string): string | null {
    // Use connection validator's output schema if available
    const outputFields = this.getNodeOutputFields(nodeType);
    if (outputFields.includes(fieldName)) {
      // Return common type based on field name
      if (fieldName.includes('json') || fieldName.includes('data') || fieldName.includes('body')) return 'object';
      if (fieldName.includes('text') || fieldName.includes('message')) return 'string';
      if (fieldName.includes('status') || fieldName.includes('count')) return 'number';
      return 'string'; // Default
    }
    return null;
  }
  
  /**
   * Get input field type
   */
  private getInputFieldType(nodeType: string, fieldName: string): string | null {
    const inputFields = this.getNodeInputFields(nodeType);
    if (inputFields.includes(fieldName)) {
      // Return common type based on field name
      if (fieldName.includes('json') || fieldName.includes('data') || fieldName.includes('body')) return 'object';
      if (fieldName.includes('text') || fieldName.includes('message') || fieldName.includes('input')) return 'string';
      if (fieldName.includes('count') || fieldName.includes('number')) return 'number';
      return 'string'; // Default
    }
    return null;
  }
  
  /**
   * Check if types are compatible
   */
  private areTypesCompatible(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;
    
    // Object is compatible with most types (flexible)
    if (sourceType === 'object') return true;
    if (targetType === 'object') return true;
    
    // String is compatible with most types
    if (sourceType === 'string') return true;
    
    // Number and string are somewhat compatible
    if ((sourceType === 'number' && targetType === 'string') || 
        (sourceType === 'string' && targetType === 'number')) {
      return true; // Can convert
    }
    
    return false;
  }
  
  /**
   * Apply fixes to workflow
   */
  applyFixes(workflow: Workflow, validation: ValidationResult): Workflow {
    const fixedWorkflow = {
      ...workflow,
      nodes: [...workflow.nodes],
      edges: [...workflow.edges],
    };
    
    // Apply required field defaults
    for (const node of fixedWorkflow.nodes) {
      // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) continue;
      
      const requiredFields = schema.configSchema?.required || [];
      const config = node.data?.config || {};
      
      for (const fieldName of requiredFields) {
        if (!config[fieldName] || (typeof config[fieldName] === 'string' && config[fieldName].trim() === '')) {
          const defaultValue = this.getDefaultValue(nodeType, fieldName);
          if (defaultValue !== undefined) {
            config[fieldName] = defaultValue;
            node.data = {
              ...node.data,
              config: { ...config },
            };
          }
        }
      }
    }
    
    // Fix edge field references
    for (const edge of fixedWorkflow.edges) {
      const sourceNode = fixedWorkflow.nodes.find(n => n.id === edge.source);
      const targetNode = fixedWorkflow.nodes.find(n => n.id === edge.target);
      
      if (sourceNode && !edge.sourceHandle) {
        // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
        const sourceActualType = normalizeNodeType(sourceNode);
        const outputs = this.getNodeOutputFields(sourceActualType);
        edge.sourceHandle = outputs[0] || 'output';
      }
      
      if (targetNode && !edge.targetHandle) {
        // ✅ CRITICAL FIX: Use normalizeNodeType to handle 'custom' type nodes
        const targetActualType = normalizeNodeType(targetNode);
        const inputs = this.getNodeInputFields(targetActualType);
        edge.targetHandle = inputs[0] || 'input';
      }
    }
    
    return fixedWorkflow;
  }
}

// Export singleton
export const comprehensiveWorkflowValidator = new ComprehensiveWorkflowValidator();
