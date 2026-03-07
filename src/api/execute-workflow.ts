// Execute Workflow API Route
// Migrated from Supabase Edge Function with correct state propagation

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../core/config';
import { LLMAdapter } from '../shared/llm-adapter';
import { HuggingFaceRouterClient } from '../shared/huggingface-client';
import { getGoogleAccessToken } from '../shared/google-sheets';
import { REQUIRED_GMAIL_SCOPES } from '../shared/gmail-executor';
import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';
import { validationMiddleware } from '../core/validation/validation-middleware';
import { safeParse, safeDeepClone } from '../shared/safe-json';
import { getNodeOutputSchema, getNodeOutputType } from '../core/types/node-output-types';
// TypeConverter removed - not used in this file
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../core/utils/unified-node-type-normalizer';
import { getMemoryManager } from '../memory';
import { ErrorCode } from '../core/utils/error-codes';
// Enterprise Architecture - Multi-tier state management
import { PersistentLayer } from '../services/workflow-executor/persistent-layer';
import { CentralExecutionState } from '../services/workflow-executor/central-execution-state';
import { createObjectStorageService } from '../services/workflow-executor/object-storage-service';
// Typed execution system
import { createExecutionContext, setNodeOutput } from '../core/execution/typed-execution-context';
import { evaluateCondition, Condition } from '../core/execution/typed-condition-evaluator';
import { normalizeNodeOutput as normalizeNodeOutputContract } from '../core/execution/node-output-contract';
import { resolveTypedValue, resolveWithSchema } from '../core/execution/typed-value-resolver';
import { getNestedValue } from '../core/utils/object-utils';
import { executeClickUpNode } from '../executors/clickup.executor';
import Airtable from 'airtable';
import FormData from 'form-data';
import { PipedriveApiClient } from '../services/pipedrive/pipedrive-api-client';
import { Client } from '@notionhq/client';
import { getNotionAccessToken } from '../shared/notion-token-manager';
import { TwitterApi } from 'twitter-api-v2';
import { getTwitterAccessToken } from '../shared/twitter-token-manager';
import { getInstagramAccessToken, getInstagramBusinessAccountId } from '../shared/instagram-token-manager';
import { getWhatsAppAccessToken, getWhatsAppBusinessAccountId } from '../shared/whatsapp-token-manager';
import { executeDatabaseNode } from '../services/database/database-node-handler';

interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}

/**
 * Topological sort to determine execution order
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach(node => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach(edge => {
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  });

  const queue: string[] = [];
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeMap[nodeId]);

    adjacency[nodeId].forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  return sorted;
}

/**
 * Normalize If/Else node conditions field
 * Converts string or object formats to the expected array format
 */
function normalizeIfElseConditions(config: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...config };
  
  if (config.condition && !config.conditions) {
    // Old format: condition (string) -> convert to conditions array
    const conditionStr = typeof config.condition === 'string' ? config.condition : String(config.condition);
    if (conditionStr.trim()) {
      normalized.conditions = [{ expression: conditionStr.trim() }];
    }
  } else if (config.conditions && !Array.isArray(config.conditions)) {
    // Handle case where conditions is sent as string or object
    if (typeof config.conditions === 'string') {
      normalized.conditions = [{ expression: config.conditions }];
    } else if (typeof config.conditions === 'object' && config.conditions !== null) {
      const conditionsObj = config.conditions as Record<string, unknown>;
      if (conditionsObj.expression) {
        // Single condition object - wrap in array
        normalized.conditions = [config.conditions];
      }
    }
  }
  
  return normalized;
}

/**
 * Extract input object from unknown input type
 */
function extractInputObject(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (Array.isArray(input)) {
    return { items: input, data: input, array: input };
  }
  return { value: input, data: input };
}

/**
 * Get string property from config or object
 */
function getStringProperty(obj: Record<string, unknown>, key: string, defaultValue: string = ''): string {
  const value = obj[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return defaultValue;
}

function getNumberProperty(obj: Record<string, unknown>, key: string, defaultValue: number = 0): number {
  const value = obj[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return defaultValue;
}

function getBooleanProperty(obj: Record<string, unknown>, key: string, defaultValue: boolean = false): boolean {
  const value = obj[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  if (typeof value === 'number') return value !== 0;
  return defaultValue;
}

/**
 * Resolve template variables in string (e.g., "Hello {{name}}" or "{{input.value}}" or "{{$json.value1}}")
 * Supports:
 * - {{key}} - direct context access
 * - {{key.field}} - nested object access
 * - {{$json.path}} - n8n-style $json syntax (maps to input/context data)
 * - {{input.path}} - input object access
 * 
 * Phase 3: Enhanced with template validation and helpful suggestions
 * 
 * ⚠️ DEPRECATED: This function always returns strings, causing type coercion issues.
 * Use resolveTypedValue from typed-value-resolver.ts for type-preserving resolution.
 * This function is kept for backward compatibility but should be migrated.
 */
function resolveTemplate(template: string, context: Record<string, unknown>, nodeId?: string): string {
  // First, ensure $json and json aliases point to the input/context data
  // The primary data source is typically in 'input' or spread at root level
  const jsonData = context.input || context.json || context.$json || context;
  
  // Add $json and json aliases to context if not present
  const enrichedContext: Record<string, unknown> = {
    ...context,
    $json: jsonData,
    json: jsonData,
  };
  
  // Flatten all node outputs into context for easier access
  const flattenedContext: Record<string, unknown> = { ...enrichedContext };
  
  // Extract values from nested objects in context
  for (const [key, value] of Object.entries(enrichedContext)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      // Add nested properties as top-level keys (e.g., input.name -> input_name)
      for (const [nestedKey, nestedValue] of Object.entries(obj)) {
        flattenedContext[`${key}_${nestedKey}`] = nestedValue;
        // Also support dot notation in template
        flattenedContext[`${key}.${nestedKey}`] = nestedValue;
      }
    }
  }
  
  // Helper function to find similar field names (for suggestions)
  function findSimilarFields(path: string, availableFields: string[]): string[] {
    const pathLower = path.toLowerCase();
    const suggestions: Array<{ field: string; score: number }> = [];
    
    for (const field of availableFields) {
      const fieldLower = field.toLowerCase();
      let score = 0;
      
      // Exact match
      if (fieldLower === pathLower) {
        score = 100;
      }
      // Starts with
      else if (fieldLower.startsWith(pathLower) || pathLower.startsWith(fieldLower)) {
        score = 80;
      }
      // Contains
      else if (fieldLower.includes(pathLower) || pathLower.includes(fieldLower)) {
        score = 60;
      }
      // Levenshtein-like (simple character overlap)
      else {
        const commonChars = [...pathLower].filter(c => fieldLower.includes(c)).length;
        score = (commonChars / Math.max(pathLower.length, fieldLower.length)) * 40;
      }
      
      if (score > 30) {
        suggestions.push({ field, score });
      }
    }
    
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.field);
  }
  
  // Support multiple template patterns: {{key}}, {{key.field}}, {{$json.path}}, {{input.path}}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();
    let resolvedValue: unknown = undefined;
    let resolved = false;
    
    // Handle $json syntax: {{$json.value1}} or {{$json.path.to.value}}
    if (trimmedPath.startsWith('$json.')) {
      const jsonPath = trimmedPath.substring(6); // Remove '$json.' prefix
      resolvedValue = getNestedValue(jsonData, jsonPath);
      if (resolvedValue !== null && resolvedValue !== undefined) {
        resolved = true;
      }
    }
    // Handle json syntax: {{json.value1}}
    else if (trimmedPath.startsWith('json.')) {
      const jsonPath = trimmedPath.substring(5); // Remove 'json.' prefix
      resolvedValue = getNestedValue(jsonData, jsonPath);
      if (resolvedValue !== null && resolvedValue !== undefined) {
        resolved = true;
      }
    }
    // Try direct access first
    else if (flattenedContext[trimmedPath] !== undefined) {
      resolvedValue = flattenedContext[trimmedPath];
      if (resolvedValue !== null && resolvedValue !== undefined) {
        resolved = true;
      }
    }
    // Try dot notation (e.g., input.name)
    else {
      const parts = trimmedPath.split('.');
      let current: unknown = enrichedContext;
      
      for (const part of parts) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      
      if (current !== null && current !== undefined) {
        resolvedValue = current;
        resolved = true;
      }
    }
    
    // If resolved, return the value
    if (resolved && resolvedValue !== null && resolvedValue !== undefined) {
      // Phase 3: Validate template value
      const validation = validationMiddleware.validateTemplateValue(
        match,
        resolvedValue,
        enrichedContext
      );
      
      if (!validation.valid && validation.error) {
        // Log validation warning but still return resolved value (non-strict mode)
        console.warn(`[Template Validation] ${nodeId ? `Node ${nodeId}: ` : ''}${validation.error}`);
      }
      
      return String(resolvedValue);
    }
    
    // Path not found - Phase 3: Provide helpful suggestions
    if (process.env.NODE_ENV === 'development' || process.env.VALIDATE_TEMPLATES !== 'false') {
      const availableFields = Object.keys(flattenedContext).slice(0, 20); // Limit for performance
      const suggestions = findSimilarFields(trimmedPath, availableFields);
      
      let errorMessage = `Template '${match}' references non-existent field '${trimmedPath}'`;
      
      if (suggestions.length > 0) {
        errorMessage += `. Did you mean: ${suggestions.map(s => `{{${s}}}`).join(', ')}?`;
      } else if (availableFields.length > 0) {
        errorMessage += `. Available fields: ${availableFields.slice(0, 5).join(', ')}${availableFields.length > 5 ? '...' : ''}`;
      }
      
      // Log helpful error message
      console.warn(`[Template Validation] ${nodeId ? `Node ${nodeId}: ` : ''}${errorMessage}`);
      
      // In strict mode, throw error
      if (process.env.VALIDATION_STRICT === 'true') {
        throw new Error(errorMessage);
      }
    }
    
    // Return original template if not resolved (backward compatibility)
    return match;
  });
}

/**
 * Execute a single workflow node
 * This is a simplified version - the full implementation would handle all node types
 */
export async function executeNode(
  node: WorkflowNode,
  input: unknown,
  nodeOutputs: LRUNodeOutputsCache,
  supabase: SupabaseClient,
  workflowId: string,
  userId?: string,
  currentUserId?: string
): Promise<unknown> {
  // ============================================
  // ✅ WORLD-CLASS: Registry-Only Execution
  // ============================================
  // ✅ ALL NODES MIGRATED: All 70+ nodes migrated to UnifiedNodeRegistry
  // ✅ NO FALLBACK: Legacy executor fallback completely removed
  // ✅ REGISTRY-ONLY: All nodes must execute via UnifiedNodeRegistry
  // ============================================
  
  try {
    const { executeNodeDynamically } = await import('../core/execution/dynamic-node-executor');
    const dynamicResult = await executeNodeDynamically({
      node,
      input,
      nodeOutputs,
      supabase,
      workflowId,
      userId,
      currentUserId,
    });
    
    // If dynamic executor succeeded (no _error), return result
    if (dynamicResult && typeof dynamicResult === 'object' && !('_error' in dynamicResult)) {
      console.log(`[ExecuteNode] ✅ Executed ${node.data?.label || node.id} using dynamic executor`);
      return dynamicResult;
    }
    
    // ✅ WORLD-CLASS: No fallback - throw error immediately if node not found
    if (dynamicResult && typeof dynamicResult === 'object' && '_error' in dynamicResult) {
      const errorMsg = (dynamicResult as any)._error || '';
      if (errorMsg.includes('not found in registry') || errorMsg.includes('not registered')) {
        // ✅ STRICT MODE: Registry-only execution, no fallback
        throw new Error(
          `[ExecuteNode] ❌ Node type "${node.data?.type || node.type}" not found in registry. ` +
          `Registry-only mode enabled. All nodes must be in UnifiedNodeRegistry. ` +
          `If this node exists, ensure it's registered in unified-node-registry-overrides.ts`
        );
      } else {
        // Other error from dynamic executor, return it
        return dynamicResult;
      }
    }
  } catch (error: any) {
    // ✅ WORLD-CLASS: No fallback - throw error immediately
    // All nodes must execute via UnifiedNodeRegistry
    throw error;
  }
  
  // ============================================
  // ✅ WORLD-CLASS: Legacy Executor Removed
  // ============================================
  // ✅ ALL NODES MIGRATED: All 70+ nodes migrated to UnifiedNodeRegistry
  // ✅ NO FALLBACK: Legacy executor fallback completely removed
  // ✅ REGISTRY-ONLY: All nodes must execute via UnifiedNodeRegistry
  // 
  // Legacy executor is ONLY accessible through:
  // - unified-node-registry-legacy-adapter.ts (for nodes using executeViaLegacyExecutor)
  // This is the correct architecture - adapter pattern, not direct fallback
  // ============================================
  
  // ✅ STRICT MODE: No legacy fallback - all nodes must be in registry
  throw new Error(
    `[ExecuteNode] ❌ Node type "${node.data?.type || node.type}" execution failed. ` +
    `Registry-only mode enabled. All nodes must be in UnifiedNodeRegistry. ` +
    `This indicates a system integrity issue or unmigrated node. ` +
    `If this node exists, ensure it's registered in unified-node-registry-overrides.ts`
  );
}

/**
 * LEGACY EXECUTOR - Direct execution without dynamic executor
 * This is called by:
 * 1. Main executeNode() when dynamic executor fails/not found
 * 2. UnifiedNodeRegistry.execute() to avoid circular dependency
 */
export async function executeNodeLegacy(
  node: WorkflowNode,
  input: unknown,
  nodeOutputs: LRUNodeOutputsCache,
  supabase: SupabaseClient,
  workflowId: string,
  userId?: string,
  currentUserId?: string
): Promise<unknown> {
  // PHASE 1: Normalize node type to handle custom type pattern
  const normalizedType = unifiedNormalizeNodeType(node);
  const type = normalizedType || node.data?.type || node.type;
  const config = node.data?.config || {};
  const inputObj = extractInputObject(input);

  console.log(`[ExecuteNodeLegacy] 🔄 Executing node using legacy executor: ${node.data?.label || node.id} (${type})`);

  // ✅ REFACTORED: Removed output wrapping - nodes return their actual output type
  // Nodes now return their contract type directly (number, string, boolean, object)
  // No more generic { data, type } wrapping
  const normalizeNodeOutput = (result: any, nodeType: string): any => {
    // If result is already wrapped in old format, extract the data
    if (result && typeof result === 'object' && 'data' in result && 'type' in result) {
      return result.data;
    }
    
    // Return as-is - nodes are responsible for returning correct types
    return result;
  };

  // ✅ Helper: Create typed execution context for all nodes
  const createTypedContext = () => {
    const execContext = createExecutionContext(input);
    Object.entries(nodeOutputs.getAll()).forEach(([nodeId, output]) => {
      setNodeOutput(execContext, nodeId, output);
    });
    return execContext;
  };

  // ✅ FIX: Normalize If/Else config before validation
  // Convert condition (string) to conditions (array) format for validation
  const normalizedConfig = { ...config };
  if (type === 'if_else') {
    if (config.condition && !config.conditions) {
      // Old format: condition (string) -> convert to conditions array
      const conditionStr = typeof config.condition === 'string' ? config.condition : String(config.condition);
      if (conditionStr.trim()) {
        normalizedConfig.conditions = [{ expression: conditionStr.trim() }];
      }
    } else if (config.conditions && !Array.isArray(config.conditions)) {
      // Handle case where conditions is sent as string or object
      if (typeof config.conditions === 'string') {
        normalizedConfig.conditions = [{ expression: config.conditions }];
      } else if (typeof config.conditions === 'object' && config.conditions !== null) {
        const conditionsObj = config.conditions as Record<string, unknown>;
        if (conditionsObj.expression) {
          normalizedConfig.conditions = [config.conditions];
        }
      }
    }
  }

  // Phase 3: Validate node configuration before execution (using normalized config)
  const configValidation = validationMiddleware.validateConfig(type, normalizedConfig, node.id);
  if (!configValidation.success && configValidation.error) {
    const errorMessage = configValidation.error.message;
    console.warn(`[Validation] ${errorMessage}`);
    
      // In strict mode, return error immediately
      if (process.env.VALIDATION_STRICT === 'true') {
        const errorResult = {
          ...inputObj,
          _error: `Configuration validation failed: ${errorMessage}`,
          _validationError: true,
        };
        return normalizeNodeOutput(errorResult, type);
      }
    // In non-strict mode, log warning and continue (backward compatibility)
  }

  // Handle different node types
  let result: any;
  
  switch (type) {
    case 'manual_trigger': {
      // ✅ OPTIMIZED: Return clean output - just the input data, no trigger metadata
      // Manual trigger is typically used for testing, so return input as-is
      result = inputObj && Object.keys(inputObj).length > 0 ? inputObj : {};
      break;
    }

    case 'chat_trigger': {
      // ✅ OPTIMIZED: Chat Trigger - return clean output with just the message (like form returns only data)
      // Extract message from input (can come from chat API or manual execution)
      const message = 
        inputObj.message || 
        inputObj.text || 
        inputObj.input || 
        (typeof inputObj === 'string' ? inputObj : '') ||
        ''; // Empty string if no message found
      
      // Return just the message string (clean output, no metadata)
      result = message;
      break;
    }

    case 'webhook':
    case 'webhook_trigger_response': {
      // ✅ OPTIMIZED: Webhook trigger - return clean output with just the payload
      // The body contains the actual webhook payload, which is what users typically need
      // Also include query params and headers for advanced use cases
      const body = inputObj.body || inputObj;
      
      result = typeof body === 'object' && body !== null && !Array.isArray(body) 
        ? { ...body } 
        : { body };
      
      if (inputObj.query && typeof inputObj.query === 'object' && Object.keys(inputObj.query).length > 0) {
        result.query = inputObj.query;
      }
      if (inputObj.headers && typeof inputObj.headers === 'object' && Object.keys(inputObj.headers).length > 0) {
        result.headers = inputObj.headers;
      }
      if (inputObj.method) {
        result.method = inputObj.method;
      }
      break;
    }

    // ✅ Aliases / compatibility for webhook response nodes
    // Some schemas/pipelines use these names for "respond back to webhook caller".
    // In this runtime, the actual HTTP response is handled by the API layer;
    // this node normalizes/returns the payload intended for response.
    case 'webhook_response':
    case 'respond_to_webhook': {
      const body = (config as any)?.body ?? (config as any)?.responseBody ?? inputObj.body ?? inputObj;
      const statusCodeRaw = (config as any)?.statusCode ?? (config as any)?.status ?? 200;
      const statusCode = Number(statusCodeRaw) || 200;
      const headers = (config as any)?.headers ?? {};
      return {
        statusCode,
        headers,
        body,
      };
    }

    case 'set_variable': {
      // ✅ REFACTORED: Set Variable node with typed resolution
      const name = getStringProperty(config, 'name', '');
      const value = getStringProperty(config, 'value', '');
      
      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedValue = resolveTypedValue(value, execContext);
      
      result = {
        [name]: resolvedValue,
      };
      break;
    }

    case 'set': {
      // ✅ REFACTORED: Set node with typed resolution - preserves types
      // Set node: Sets fields in output object
      // Config: { fields: '{"name": "{{input.name}}", "age": 25}' }
      const fieldsJson = getStringProperty(config, 'fields', '{}');
      const fields = safeParse<Record<string, unknown>>(fieldsJson, {}) || {};
      const resolvedFields: Record<string, unknown> = {};
      
      // Create typed execution context
      const execContext = createExecutionContext(input);
      Object.entries(nodeOutputs.getAll()).forEach(([nodeId, output]) => {
        setNodeOutput(execContext, nodeId, output);
      });
      
      // Resolve template expressions with type preservation
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'string') {
          // Use typed resolution - preserves numbers, booleans, etc.
          const resolved = resolveTypedValue(value, execContext);
          resolvedFields[key] = resolved;
        } else {
          resolvedFields[key] = value;
        }
      }
      
      // Merge with input
      return {
        ...inputObj,
        ...resolvedFields,
      };
    }

    case 'math': {
      // ✅ REFACTORED: Math node with typed resolution - returns number directly
      // Math node: Performs mathematical operations
      // Config: { operation: 'add', value1: '10', value2: '5', precision: 10 }
      const operation = getStringProperty(config, 'operation', 'add');
      const value1Str = getStringProperty(config, 'value1', '0');
      const value2Str = getStringProperty(config, 'value2', '0');
      const precision = parseInt(getStringProperty(config, 'precision', '10'), 10) || 10;
      
      // Create typed execution context
      const execContext = createExecutionContext(input);
      Object.entries(nodeOutputs.getAll()).forEach(([nodeId, output]) => {
        setNodeOutput(execContext, nodeId, output);
      });
      
      // Resolve with type preservation - numbers stay numbers
      const resolvedValue1 = resolveWithSchema(value1Str, execContext, 'number');
      const resolvedValue2 = resolveWithSchema(value2Str, execContext, 'number');
      
      // Parse values (handle arrays for min/max/sum/avg)
      const parseValue = (val: unknown): number | number[] => {
        if (typeof val === 'number') {
          return val;
        }
        if (Array.isArray(val)) {
          return val.filter((v): v is number => typeof v === 'number');
        }
        if (typeof val === 'string') {
          if (val.includes(',')) {
            // Array of values
            return val.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
          }
          const num = parseFloat(val);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };
      
      const val1 = parseValue(resolvedValue1);
      const val2 = parseValue(resolvedValue2);
      
      let result: number;
      
      try {
        switch (operation) {
          case 'add':
            result = (Array.isArray(val1) ? val1[0] : val1) + (Array.isArray(val2) ? val2[0] : val2);
            break;
          case 'subtract':
            result = (Array.isArray(val1) ? val1[0] : val1) - (Array.isArray(val2) ? val2[0] : val2);
            break;
          case 'multiply':
            result = (Array.isArray(val1) ? val1[0] : val1) * (Array.isArray(val2) ? val2[0] : val2);
            break;
          case 'divide':
            const divisor = Array.isArray(val2) ? val2[0] : val2;
            if (divisor === 0) throw new Error('Division by zero');
            result = (Array.isArray(val1) ? val1[0] : val1) / divisor;
            break;
          case 'modulo':
            result = (Array.isArray(val1) ? val1[0] : val1) % (Array.isArray(val2) ? val2[0] : val2);
            break;
          case 'power':
            result = Math.pow(Array.isArray(val1) ? val1[0] : val1, Array.isArray(val2) ? val2[0] : val2);
            break;
          case 'sqrt':
            result = Math.sqrt(Array.isArray(val1) ? val1[0] : val1);
            break;
          case 'abs':
            result = Math.abs(Array.isArray(val1) ? val1[0] : val1);
            break;
          case 'round':
            result = Math.round(Array.isArray(val1) ? val1[0] : val1);
            break;
          case 'floor':
            result = Math.floor(Array.isArray(val1) ? val1[0] : val1);
            break;
          case 'ceil':
            result = Math.ceil(Array.isArray(val1) ? val1[0] : val1);
            break;
          case 'min':
            const arr1 = Array.isArray(val1) ? val1 : [val1 as number];
            result = Math.min(...arr1);
            break;
          case 'max':
            const arr2 = Array.isArray(val1) ? val1 : [val1 as number];
            result = Math.max(...arr2);
            break;
          case 'avg':
            const arr3 = Array.isArray(val1) ? val1 : [val1 as number];
            result = arr3.reduce((a, b) => a + b, 0) / arr3.length;
            break;
          case 'sum':
            const arr4 = Array.isArray(val1) ? val1 : [val1 as number];
            result = arr4.reduce((a, b) => a + b, 0);
            break;
          default:
            throw new Error(`Unknown math operation: ${operation}`);
        }
        
        // Apply precision
        result = parseFloat(result.toFixed(precision));
        
        return {
          ...inputObj,
          result,
          operation,
        };
      } catch (error) {
        console.error('Math node error:', error);
        return {
          ...inputObj,
          _error: error instanceof Error ? error.message : 'Math operation failed',
        };
      }
    }

    case 'sort': {
      // ✅ Sort node - sorts an array of items by a given field and direction
      // Expected input shape (from previous node):
      //   { items: [{ name: 'Item A', price: 30 }, ...], ... }
      // Config (from node config):
      //   field: 'price'
      //   direction: 'asc' | 'desc' | 'ascending' | 'descending'
      //   type: 'auto' | 'number' | 'string' | 'date'

      const items = Array.isArray((inputObj as any).items) ? (inputObj as any).items : null;
      if (!items) {
        // Nothing to sort – return input unchanged
        return inputObj;
      }

      const field = getStringProperty(config, 'field', '').trim();
      const directionRaw = getStringProperty(config, 'direction', 'asc').toLowerCase();
      const dir = directionRaw === 'desc' || directionRaw === 'descending' ? 'desc' : 'asc';
      const typeRaw = getStringProperty(config, 'type', 'auto').toLowerCase();

      // Defensive copy so we don't mutate upstream data
      const itemsCopy = [...items];

      itemsCopy.sort((a: any, b: any) => {
        const av = field ? (a?.[field]) : a;
        const bv = field ? (b?.[field]) : b;

        // Auto-detect type if needed
        const detectType = () => {
          const sample = av ?? bv;
          if (sample instanceof Date) return 'date';
          if (typeof sample === 'number') return 'number';
          if (typeof sample === 'string') {
            // Try parse as number/date; fall back to string
            const num = Number(sample);
            if (!Number.isNaN(num)) return 'number';
            const d = new Date(sample);
            if (!Number.isNaN(d.getTime())) return 'date';
            return 'string';
          }
          return 'number';
        };

        const valueType = typeRaw === 'auto' ? detectType() : typeRaw;

        let cmp = 0;

        if (valueType === 'string') {
          const as = av != null ? String(av) : '';
          const bs = bv != null ? String(bv) : '';
          cmp = as.localeCompare(bs);
        } else if (valueType === 'date') {
          const at = av != null ? new Date(av as any).getTime() : 0;
          const bt = bv != null ? new Date(bv as any).getTime() : 0;
          if (at < bt) cmp = -1;
          else if (at > bt) cmp = 1;
          else cmp = 0;
        } else {
          // number (default)
          const an = av != null ? Number(av) : 0;
          const bn = bv != null ? Number(bv) : 0;
          if (an < bn) cmp = -1;
          else if (an > bn) cmp = 1;
          else cmp = 0;
        }

        return dir === 'desc' ? -cmp : cmp;
      });

      return {
        ...inputObj,
        items: itemsCopy,
      };
    }

    case 'limit': {
      // ✅ Limit node - limits the number of items in an array
      // Expected input shape (from previous node):
      //   { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ... }
      // Config (from node config):
      //   limit: 5
      //   array: '{{$json.items}}' (optional - if provided, use this instead of input.items)
      // Output:
      //   { items: [1, 2, 3, 4, 5], ... }

      // ✅ CORE ARCHITECTURE FIX: Preserve original input object BEFORE any extraction
      // This ensures ALL input fields (items, rows, headers, values, etc.) are preserved
      const originalInputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : inputObj;

      // ✅ DEBUG: Log input and config to diagnose issues
      if (process.env.DEBUG_DATA_FLOW === 'true') {
        console.log('[Limit] 🔍 Input keys:', Object.keys(inputObj));
        console.log('[Limit] 🔍 Input.items:', Array.isArray((inputObj as any).items) ? `Array(${(inputObj as any).items.length})` : (inputObj as any).items);
        console.log('[Limit] 🔍 Input.array:', (inputObj as any).array);
        console.log('[Limit] 🔍 Config:', config);
        console.log('[Limit] 🔍 Config.array:', (config as any).array);
      }
      
      // ✅ FIX: Check config.array first (template expression), then input.items
      let items: any[] | null = null;
      
      // Check if config has 'array' field (template expression)
      const arrayConfig = (config as any).array;
      if (arrayConfig) {
        // If it's already an array, use it directly
        if (Array.isArray(arrayConfig)) {
          items = arrayConfig;
          if (process.env.DEBUG_DATA_FLOW === 'true') {
            console.log('[Limit] ✅ Using config.array (direct array)');
          }
        }
        // If it's a string (template expression or path), try to resolve it
        else if (typeof arrayConfig === 'string') {
          if (process.env.DEBUG_DATA_FLOW === 'true') {
            console.log('[Limit] 🔄 Resolving template expression:', arrayConfig);
          }
          
          // Create execution context for template resolution
          const execContext = createExecutionContext(input);
          const allOutputs = nodeOutputs.getAll();
          Object.entries(allOutputs).forEach(([nodeId, output]) => {
            setNodeOutput(execContext, nodeId, output);
          });
          
          // Resolve template expression
          const resolvedArray = resolveWithSchema(arrayConfig, execContext, 'array');
          if (Array.isArray(resolvedArray)) {
            items = resolvedArray;
            if (process.env.DEBUG_DATA_FLOW === 'true') {
              console.log('[Limit] ✅ Resolved template to array:', resolvedArray.length, 'items');
            }
          }
          // If not resolved, try to get from input using the path
          else if (arrayConfig.startsWith('$json.') || arrayConfig.startsWith('{{$json.')) {
            const path = arrayConfig.replace(/^\{\{|\}\}$/g, '').replace(/^\$json\./, '');
            const value = getNestedValue(inputObj, path);
            if (Array.isArray(value)) {
              items = value;
              if (process.env.DEBUG_DATA_FLOW === 'true') {
                console.log('[Limit] ✅ Resolved path to array:', value.length, 'items');
              }
            }
          }
        }
      }
      
      // Fallback: Check input.items (standard path)
      if (!items) {
        items = Array.isArray((inputObj as any).items) ? (inputObj as any).items : null;
        if (items && process.env.DEBUG_DATA_FLOW === 'true') {
          console.log('[Limit] ✅ Using input.items:', items.length, 'items');
        }
      }
      
      // Also check input.array (if data was passed as array field)
      if (!items && Array.isArray((inputObj as any).array)) {
        items = (inputObj as any).array;
        if (process.env.DEBUG_DATA_FLOW === 'true' && items) {
          console.log('[Limit] ✅ Using input.array:', items.length, 'items');
        }
      }
      
      if (!items) {
        // Nothing to limit – return input unchanged
        console.warn('[Limit] ⚠️  No array found in input or config. Input keys:', Object.keys(inputObj), 'Config keys:', Object.keys(config));
        return inputObj;
      }

      const limitStr = getStringProperty(config, 'limit', '10');
      const limit = parseInt(limitStr, 10);
      
      if (Number.isNaN(limit) || limit < 0) {
        // Invalid limit – return input unchanged
        return inputObj;
      }

      // Defensive copy so we don't mutate upstream data
      const limitedItems = items.slice(0, limit);

      // ✅ CORE ARCHITECTURE FIX: Return full input data with limited items
      // Limit nodes MUST forward ALL input data to downstream nodes
      // This ensures downstream nodes receive the complete data structure
      return {
        ...originalInputObj,  // ✅ Preserve ALL input fields (rows, headers, values, google_sheets, etc.)
        items: limitedItems,   // ✅ Override items with limited array
      };
    }

    case 'aggregate': {
      // ✅ Aggregate node - aggregates an array of items using sum/avg/count/min/max
      // Expected input shape:
      //   { items: [{ amount: 10 }, { amount: 20 }], ... }
      // Config:
      //   operation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'join'
      //   field?: 'amount' | '{{$json.amount}}' (optional - if omitted, aggregate the item itself)
      //   delimiter?: '\n' (for join)
      const items = Array.isArray((inputObj as any).items) ? (inputObj as any).items : null;
      if (!items) {
        return inputObj;
      }

      const operation = getStringProperty(config, 'operation', 'count').toLowerCase();
      const fieldRaw = getStringProperty(config, 'field', '').trim();
      // Allow UI-friendly escaped delimiters like "\\n" and "\\t"
      const delimiterRaw = getStringProperty(config, 'delimiter', '\n');
      const delimiter =
        delimiterRaw === '\\n' ? '\n' :
        delimiterRaw === '\\t' ? '\t' :
        delimiterRaw === '\\r\\n' ? '\r\n' :
        delimiterRaw;

      // Support common template-like field values: {{$json.amount}} → amount
      const field = (() => {
        if (!fieldRaw) return '';
        const m = fieldRaw.match(/^\s*\{\{\s*\$json\.([a-zA-Z0-9_.$-]+)\s*\}\}\s*$/);
        return m?.[1] || fieldRaw;
      })();

      const values = items
        .map((it: any) => (field ? it?.[field] : it))
        .filter((v: any) => v !== undefined && v !== null);

      if (operation === 'join' || operation === 'concat') {
        const text = values
          .map((v: any) => {
            if (typeof v === 'string') return v;
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            try { return JSON.stringify(v); } catch { return String(v); }
          })
          .join(delimiter);
        return { ...inputObj, aggregate: text, text, operation, delimiter, field: field || undefined };
      }

      if (operation === 'count') {
        return { ...inputObj, aggregate: values.length, operation };
      }

      // Convert to numbers when needed
      const nums = values
        .map((v: any) => (typeof v === 'number' ? v : Number(v)))
        .filter((n: number) => Number.isFinite(n));

      if (nums.length === 0) {
        return { ...inputObj, aggregate: 0, operation, _warning: 'Aggregate: no numeric values found' };
      }

      let agg = 0;
      switch (operation) {
        case 'sum':
          agg = nums.reduce((a: number, b: number) => a + b, 0);
          break;
        case 'avg':
        case 'average':
          agg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
          break;
        case 'min':
          agg = Math.min(...nums);
          break;
        case 'max':
          agg = Math.max(...nums);
          break;
        default:
          return { ...inputObj, _error: `Aggregate: Unknown operation "${operation}". Supported: sum, avg, count, min, max, join` };
      }

      return { ...inputObj, aggregate: agg, operation, field: field || undefined };
    }

    case 'wait': {
      // ✅ Wait node - pauses execution for a specified duration
      // Frontend config (nodeTypes.ts):
      //   { duration: 1000 }  // in milliseconds
      //
      // Older/AI-generated configs (workflow-builder.ts) may also use:
      //   duration + unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours'

      // Prefer explicit duration from config; fall back to legacy duration/unit
      const durationRaw = (config as any)?.duration ?? getStringProperty(config, 'duration', '0');
      let durationMs = Number(durationRaw);
      if (Number.isNaN(durationMs) || durationMs < 0) {
        durationMs = 0;
      }

      // Support optional unit for AI-generated waits
      const unit = (getStringProperty(config, 'unit', 'milliseconds') || 'milliseconds').toLowerCase();
      if (unit === 'seconds' || unit === 'second' || unit === 's') {
        durationMs *= 1000;
      } else if (unit === 'minutes' || unit === 'minute' || unit === 'm') {
        durationMs *= 60_000;
      } else if (unit === 'hours' || unit === 'hour' || unit === 'h') {
        durationMs *= 3_600_000;
      }

      // Safety cap: don't allow extremely long waits in the worker
      const MAX_WAIT_MS = 5 * 60_000; // 5 minutes
      if (durationMs > MAX_WAIT_MS) {
        console.warn(`[Wait Node] Duration ${durationMs}ms exceeds max ${MAX_WAIT_MS}ms, capping.`);
        durationMs = MAX_WAIT_MS;
      }

      if (durationMs > 0) {
        console.log(`[Wait Node] Pausing execution for ${durationMs}ms`);
        await new Promise(resolve => setTimeout(resolve, durationMs));
      }

      // Wait node passes input through unchanged after delay
      result = inputObj;
      break;
    }

    case 'delay': {
      try {
        let duration = getNumberProperty(config, 'duration', 0);
        const unit = getStringProperty(config, 'unit', 'milliseconds');
        
        // Convert to milliseconds
        if (unit === 'seconds') {
          duration *= 1000;
        } else if (unit === 'minutes') {
          duration *= 60 * 1000;
        }
        
        // Ensure duration is a number
        if (isNaN(duration) || duration < 0) {
          return {
            success: false,
            error: 'Invalid duration',
            originalInput: inputObj,
          };
        }
        
        // Safety cap: don't allow extremely long delays
        const MAX_DELAY_MS = 10 * 60 * 1000; // 10 minutes
        if (duration > MAX_DELAY_MS) {
          console.warn(`[Delay Node] Duration ${duration}ms exceeds max ${MAX_DELAY_MS}ms, capping.`);
          duration = MAX_DELAY_MS;
        }
        
        // Wait
        if (duration > 0) {
          console.log(`[Delay Node] Pausing execution for ${duration}ms`);
          await new Promise(resolve => setTimeout(resolve, duration));
        }
        
        return {
          success: true,
          waitedMs: duration,
          originalInput: inputObj,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Delay failed',
          originalInput: inputObj,
        };
      }
    }

    case 'timeout': {
      // Timeout node is handled by override, but provide fallback execution
      // The override will handle branching logic
      const limit = getNumberProperty(config, 'limit', 5000);
      const workflowStart = (node as any).workflowStartTime || Date.now();
      const elapsed = Date.now() - workflowStart;
      const timedOut = elapsed > limit;

      return {
        success: true,
        elapsedMs: elapsed,
        limit,
        timedOut,
        originalInput: inputObj,
      };
    }

    case 'return': {
      try {
        let returnValue;
        if (config.includeInput) {
          returnValue = inputObj;
        } else if (config.value !== undefined) {
          // config.value may be a string that needs evaluation as expression
          // Templates are already resolved by the system, so use directly
          returnValue = config.value;
        } else {
          returnValue = null;
        }
        
        // Signal to workflow engine to stop
        // Return a special marker that the engine can detect
        return {
          success: true,
          __return: true, // marker for workflow engine to stop execution
          value: returnValue,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Return node failed',
        };
      }
    }

    case 'execute_workflow': {
      try {
        const subWorkflowId = getStringProperty(config, 'workflowId', '');
        if (!subWorkflowId) {
          return {
            success: false,
            error: 'Workflow ID is required',
          };
        }

        const subWorkflowInput = config.input !== undefined ? config.input : inputObj;
        const waitForCompletion = config.waitForCompletion !== false; // Default to true

        // Fetch the sub-workflow from database
        const { data: subWorkflow, error: workflowError } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', subWorkflowId)
          .single();

        if (workflowError || !subWorkflow) {
          return {
            success: false,
            error: `Sub-workflow not found: ${subWorkflowId}`,
            workflowId: subWorkflowId,
          };
        }

        // Check if sub-workflow is confirmed/active
        const isConfirmed = subWorkflow.confirmed === true || subWorkflow.status === 'active';
        if (!isConfirmed) {
          return {
            success: false,
            error: `Sub-workflow ${subWorkflowId} is not confirmed/active`,
            workflowId: subWorkflowId,
          };
        }

        // Execute the sub-workflow
        // We'll use a simplified execution approach
        const subNodes = subWorkflow.nodes || [];
        const subEdges = subWorkflow.edges || [];

        if (subNodes.length === 0) {
          return {
            success: true,
            result: subWorkflowInput,
            workflowId: subWorkflowId,
          };
        }

        // Find trigger node
        const triggerNode = subNodes.find((n: any) => {
          const nodeType = n.data?.type || n.type || '';
          const category = n.data?.category || '';
          return category.toLowerCase() === 'triggers' || 
                 category.toLowerCase() === 'trigger' ||
                 nodeType.includes('trigger') ||
                 ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType);
        });

        if (!triggerNode) {
          return {
            success: false,
            error: `Sub-workflow ${subWorkflowId} has no trigger node`,
            workflowId: subWorkflowId,
          };
        }

        // Build execution order
        const subExecutionOrder = topologicalSort(subNodes, subEdges);
        
        // Import buildNodeInput from unified execution engine
        const { buildNodeInput } = await import('../core/execution/unified-execution-engine');
        
        // Execute sub-workflow nodes
        const subNodeOutputs = new LRUNodeOutputsCache(100, false);
        subNodeOutputs.set('trigger', subWorkflowInput, true);
        subNodeOutputs.set('$json', subWorkflowInput, true);
        subNodeOutputs.set('json', subWorkflowInput, true);

        let subFinalOutput: unknown = subWorkflowInput;

        for (const subNode of subExecutionOrder) {
          // Skip trigger node (already handled)
          if (subNode.id === triggerNode.id) {
            continue;
          }

          const subNodeInput = buildNodeInput(subNode, subEdges, subNodeOutputs, subWorkflowInput);
          
          // Update template context
          if (subNodeInput && typeof subNodeInput === 'object' && subNodeInput !== null && !Array.isArray(subNodeInput)) {
            subNodeOutputs.set('$json', subNodeInput, true);
            subNodeOutputs.set('json', subNodeInput, true);
          }

          const subNodeOutput = await executeNode(
            subNode,
            subNodeInput,
            subNodeOutputs,
            supabase,
            subWorkflowId,
            userId,
            currentUserId
          );

          // Check for return marker
          if (subNodeOutput && typeof subNodeOutput === 'object' && (subNodeOutput as any).__return) {
            subFinalOutput = (subNodeOutput as any).value;
            break; // Stop execution
          }

          subNodeOutputs.set(subNode.id, subNodeOutput, true);
          subFinalOutput = subNodeOutput;
        }

        return {
          success: true,
          result: subFinalOutput,
          workflowId: subWorkflowId,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to execute sub-workflow',
        };
      }
    }

    case 'try_catch': {
      // Try/Catch node is handled by override, but provide fallback execution
      // The override will handle branching logic (try/catch ports)
      // The workflow engine should handle error routing to catch branch
      return {
        success: true,
        output: inputObj,
      };
    }

    case 'retry': {
      // Retry node is handled by override, but provide fallback execution
      // The override will handle branching logic (success/error ports)
      // The workflow engine should handle retry logic with maxAttempts, delayBetween, backoff
      const maxAttempts = getNumberProperty(config, 'maxAttempts', 3);
      const delayBetween = getNumberProperty(config, 'delayBetween', 1000);
      const backoff = getStringProperty(config, 'backoff', 'none');

      return {
        success: true,
        attempts: 0,
        maxAttempts,
        delayBetween,
        backoff,
        output: inputObj,
      };
    }

    case 'parallel': {
      // Parallel node is handled by override, but provide fallback execution
      // The override will handle branching logic
      // The workflow engine should handle parallel execution of connected branches
      const mode = getStringProperty(config, 'mode', 'all');

      return {
        success: true,
        mode,
        results: [],
        output: inputObj,
      };
    }

    case 'queue_push': {
      try {
        const queueName = getStringProperty(config, 'queueName', '');
        if (!queueName) {
          return {
            success: false,
            error: 'Queue name is required',
          };
        }

        const message = config.message !== undefined ? config.message : inputObj;
        const options = config.options || {};

        // Get Redis credentials from Supabase
        const { data: credential } = await supabase
          .from('credentials')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('node_id', node.id)
          .eq('provider', 'redis')
          .single();

        // Also try to get by workflow_id only (fallback)
        let redisCredential = credential;
        if (!redisCredential) {
          const { data: workflowCredential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('provider', 'redis')
            .single();
          redisCredential = workflowCredential;
        }

        if (!redisCredential) {
          return {
            success: false,
            error: 'Redis credentials not found. Please connect a Redis instance.',
          };
        }

        // Get Redis URL from credential
        // Credential structure may vary, try common fields
        const redisUrl = redisCredential.redis_url || 
                        redisCredential.url || 
                        redisCredential.connection_string ||
                        (redisCredential.data && typeof redisCredential.data === 'object' 
                          ? (redisCredential.data as any).redis_url || (redisCredential.data as any).url
                          : null);

        if (!redisUrl) {
          return {
            success: false,
            error: 'Redis URL not found in credentials',
          };
        }

        // Initialize Bull queue
        const Queue = require('bull');
        const queue = new Queue(queueName, redisUrl);

        // Add job to queue
        const job = await queue.add(message, options);

        // Close queue connection
        await queue.close();

        return {
          success: true,
          jobId: String(job.id),
          queueName,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to push message to queue',
        };
      }
    }

    case 'queue_consume': {
      try {
        const queueName = getStringProperty(config, 'queueName', '');
        if (!queueName) {
          return {
            success: false,
            error: 'Queue name is required',
          };
        }

        const timeout = getNumberProperty(config, 'timeout', 30000);
        const autoAck = config.autoAck !== false;

        // Get Redis credentials from Supabase
        const { data: credential } = await supabase
          .from('credentials')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('node_id', node.id)
          .eq('provider', 'redis')
          .single();

        // Also try to get by workflow_id only (fallback)
        let redisCredential = credential;
        if (!redisCredential) {
          const { data: workflowCredential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('provider', 'redis')
            .single();
          redisCredential = workflowCredential;
        }

        if (!redisCredential) {
          return {
            success: false,
            error: 'Redis credentials not found. Please connect a Redis instance.',
          };
        }

        // Get Redis URL from credential
        const redisUrl = redisCredential.redis_url || 
                        redisCredential.url || 
                        redisCredential.connection_string ||
                        (redisCredential.data && typeof redisCredential.data === 'object' 
                          ? (redisCredential.data as any).redis_url || (redisCredential.data as any).url
                          : null);

        if (!redisUrl) {
          return {
            success: false,
            error: 'Redis URL not found in credentials',
          };
        }

        // Initialize Bull queue
        const Queue = require('bull');
        const queue = new Queue(queueName, redisUrl);

        // Wait for a job using Bull's getNextJob or polling
        let job: any = null;
        
        // Try to get next job from waiting queue
        const startTime = Date.now();
        while (!job && (timeout === 0 || (Date.now() - startTime) < timeout)) {
          // Get waiting jobs
          const waitingJobs = await queue.getWaiting(0, 1);
          if (waitingJobs && waitingJobs.length > 0) {
            job = waitingJobs[0];
            break;
          }

          // If no waiting jobs and timeout not infinite, wait a bit before retrying
          if (timeout > 0 && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
          } else if (timeout > 0) {
            break; // Timeout reached
          } else {
            // Infinite timeout, wait longer between polls
            await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s for infinite
          }
        }

        if (!job) {
          await queue.close();
          return {
            success: false,
            error: timeout > 0 ? 'Timeout waiting for queue message' : 'No message available',
          };
        }

        // Get job data
        const message = job.data;
        const jobId = String(job.id);

        // Acknowledge job if autoAck is enabled
        if (autoAck) {
          try {
            await job.moveToCompleted('succeeded', true);
          } catch (ackError: any) {
            console.warn('[Queue Consume] Failed to acknowledge job:', ackError.message);
          }
        }

        // Close queue connection
        await queue.close();

        return {
          success: true,
          message,
          jobId,
          queueName,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to consume message from queue',
        };
      }
    }

    case 'cache_get': {
      try {
        const key = getStringProperty(config, 'key', '');
        if (!key) {
          return {
            success: false,
            error: 'Cache key is required',
          };
        }

        const defaultValue = config.defaultValue;

        // Get Redis credentials from Supabase
        const { data: credential } = await supabase
          .from('credentials')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('node_id', node.id)
          .eq('provider', 'redis')
          .single();

        // Also try to get by workflow_id only (fallback)
        let redisCredential = credential;
        if (!redisCredential) {
          const { data: workflowCredential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('provider', 'redis')
            .single();
          redisCredential = workflowCredential;
        }

        if (!redisCredential) {
          return {
            success: false,
            error: 'Redis credentials not found. Please connect a Redis instance.',
          };
        }

        // Get Redis URL from credential
        const redisUrl = redisCredential.redis_url || 
                        redisCredential.url || 
                        redisCredential.connection_string ||
                        (redisCredential.data && typeof redisCredential.data === 'object' 
                          ? (redisCredential.data as any).redis_url || (redisCredential.data as any).url
                          : null);

        if (!redisUrl) {
          return {
            success: false,
            error: 'Redis URL not found in credentials',
          };
        }

        // Connect to Redis using ioredis
        const Redis = require('ioredis');
        const redis = new Redis(redisUrl);

        // Get value from cache
        const value = await redis.get(key);
        await redis.quit();

        if (value !== null) {
          // Try to parse JSON
          try {
            const parsedValue = JSON.parse(value);
            return {
              success: true,
              found: true,
              value: parsedValue,
            };
          } catch {
            // Not JSON, return as string
            return {
              success: true,
              found: true,
              value,
            };
          }
        } else {
          // Key not found, return default value
          return {
            success: true,
            found: false,
            value: defaultValue,
          };
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to get value from cache',
        };
      }
    }

    case 'cache_set': {
      try {
        const key = getStringProperty(config, 'key', '');
        if (!key) {
          return {
            success: false,
            error: 'Cache key is required',
          };
        }

        let value = config.value;
        const ttl = getNumberProperty(config, 'ttl', 0);

        // Get Redis credentials from Supabase
        const { data: credential } = await supabase
          .from('credentials')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('node_id', node.id)
          .eq('provider', 'redis')
          .single();

        // Also try to get by workflow_id only (fallback)
        let redisCredential = credential;
        if (!redisCredential) {
          const { data: workflowCredential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('provider', 'redis')
            .single();
          redisCredential = workflowCredential;
        }

        if (!redisCredential) {
          return {
            success: false,
            error: 'Redis credentials not found. Please connect a Redis instance.',
          };
        }

        // Get Redis URL from credential
        const redisUrl = redisCredential.redis_url || 
                        redisCredential.url || 
                        redisCredential.connection_string ||
                        (redisCredential.data && typeof redisCredential.data === 'object' 
                          ? (redisCredential.data as any).redis_url || (redisCredential.data as any).url
                          : null);

        if (!redisUrl) {
          return {
            success: false,
            error: 'Redis URL not found in credentials',
          };
        }

        // Connect to Redis using ioredis
        const Redis = require('ioredis');
        const redis = new Redis(redisUrl);

        // Serialize value to JSON string if object/array, otherwise convert to string
        let serializedValue: string;
        if (value === null || value === undefined) {
          serializedValue = '';
        } else if (typeof value === 'object') {
          serializedValue = JSON.stringify(value);
        } else {
          serializedValue = String(value);
        }

        // Set value with optional TTL
        if (ttl > 0) {
          await redis.setex(key, ttl, serializedValue);
        } else {
          await redis.set(key, serializedValue);
        }

        await redis.quit();

        return {
          success: true,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to set value in cache',
        };
      }
    }

    case 'oauth2_auth': {
      try {
        const provider = getStringProperty(config, 'provider', '');
        if (!provider) {
          return {
            success: false,
            error: 'OAuth2 provider is required',
          };
        }

        const action = getStringProperty(config, 'action', 'getToken');

        // Get user ID from function parameters
        const effectiveUserId = currentUserId || userId;

        if (!effectiveUserId) {
          return {
            success: false,
            error: 'User ID is required for OAuth2 authentication',
          };
        }

        // Try to get OAuth tokens from provider-specific tables
        let tokenData: any = null;

        // Check provider-specific token tables
        if (provider === 'google') {
          const { data: googleToken } = await supabase
            .from('google_oauth_tokens')
            .select('access_token, refresh_token, expires_at, token_type, scope')
            .eq('user_id', effectiveUserId)
            .single();
          tokenData = googleToken;
        } else if (provider === 'github' || provider === 'facebook' || provider === 'twitter' || provider === 'linkedin') {
          // Check unified social_tokens table
          const { data: socialToken } = await supabase
            .from('social_tokens')
            .select('access_token, refresh_token, expires_at, token_type, scope')
            .eq('user_id', effectiveUserId)
            .eq('provider', provider)
            .single();
          tokenData = socialToken;
        } else if (provider === 'zoho') {
          const { data: zohoToken } = await supabase
            .from('zoho_oauth_tokens')
            .select('access_token, refresh_token, expires_at, region')
            .eq('user_id', effectiveUserId)
            .single();
          tokenData = zohoToken;
        } else {
          // For custom providers, check credentials table
          const { data: credential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('node_id', node.id)
            .eq('provider', 'oauth2')
            .single();
          
          if (credential && credential.data) {
            tokenData = {
              access_token: credential.data.access_token,
              refresh_token: credential.data.refresh_token,
              expires_at: credential.data.expires_at,
              token_type: credential.data.token_type || 'Bearer',
              scope: credential.data.scope,
            };
          }
        }

        if (!tokenData || !tokenData.access_token) {
          return {
            success: false,
            error: `OAuth2 credentials for ${provider} not found. Please authenticate first.`,
          };
        }

        if (action === 'getToken') {
          // Check if token is expired or about to expire (within 5 minutes)
          let accessToken = tokenData.access_token;
          let needsRefresh = false;

          if (tokenData.expires_at) {
            const expiresAt = new Date(tokenData.expires_at);
            const now = new Date();
            const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

            if (expiresAt <= fiveMinutesFromNow && tokenData.refresh_token) {
              needsRefresh = true;
            }
          }

          // If token needs refresh and we have refresh token, try to refresh
          if (needsRefresh && tokenData.refresh_token) {
            // Token refresh logic would go here
            // For now, we'll return the existing token and note that it may be expired
            console.warn(`[OAuth2 Auth] Token for ${provider} may be expired, but refresh not implemented yet`);
          }

          return {
            success: true,
            accessToken,
            refreshToken: tokenData.refresh_token || undefined,
            expiresIn: tokenData.expires_at 
              ? Math.max(0, Math.floor((new Date(tokenData.expires_at).getTime() - Date.now()) / 1000))
              : undefined,
            tokenType: tokenData.token_type || 'Bearer',
            scope: tokenData.scope || undefined,
          };
        } else if (action === 'refresh') {
          // Token refresh implementation
          // This would require calling the OAuth2 provider's token endpoint
          // For now, return an error indicating it needs to be implemented
          return {
            success: false,
            error: 'Token refresh is not yet implemented. Please re-authenticate.',
          };
        } else if (action === 'startFlow') {
          // OAuth flow initiation
          // This typically requires redirecting the user to the provider's authorization URL
          // For now, return an error indicating it must be done via UI
          return {
            success: false,
            error: 'OAuth flow must be started via the UI. Please use the "Connect" button in the node configuration.',
          };
        } else {
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to get OAuth2 token',
        };
      }
    }

    case 'api_key_auth': {
      try {
        const apiKeyName = getStringProperty(config, 'apiKeyName', '');
        if (!apiKeyName) {
          return {
            success: false,
            error: 'API key name is required',
          };
        }

        // Get user ID from function parameters
        const effectiveUserId = currentUserId || userId;

        // Try to get API key from credential_vault first
        let apiKey: string | null = null;

        if (effectiveUserId) {
          // Check credential_vault table (user-level credentials)
          const { data: vaultCredential } = await supabase
            .from('credential_vault')
            .select('encrypted_value, metadata')
            .eq('user_id', effectiveUserId)
            .eq('key', apiKeyName)
            .eq('type', 'api_key')
            .is('workflow_id', null) // User-level credential
            .single();

          if (vaultCredential && vaultCredential.encrypted_value) {
            // Note: In production, encrypted_value should be decrypted
            // For now, we'll assume it's stored as plain text or use a decryption function
            // This is a placeholder - actual implementation should decrypt
            apiKey = vaultCredential.encrypted_value;
          }
        }

        // If not found in vault, try credentials table (workflow-level)
        if (!apiKey) {
          const { data: credential } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('node_id', node.id)
            .eq('provider', 'apikey')
            .single();

          if (credential) {
            // Check if credential has the apiKeyName in data or name field
            if (credential.data && typeof credential.data === 'object') {
              const credData = credential.data as any;
              // Try multiple possible field names
              apiKey = credData.api_key || 
                      credData.apiKey || 
                      credData.key || 
                      credData[apiKeyName] ||
                      (credData.name === apiKeyName ? credData.value : null);
            } else if (credential.name === apiKeyName) {
              apiKey = (credential as any).api_key || (credential as any).value;
            }
          }
        }

        // If still not found, try workflow-level credential_vault
        if (!apiKey && effectiveUserId) {
          const { data: workflowVaultCredential } = await supabase
            .from('credential_vault')
            .select('encrypted_value, metadata')
            .eq('user_id', effectiveUserId)
            .eq('workflow_id', workflowId)
            .eq('key', apiKeyName)
            .eq('type', 'api_key')
            .single();

          if (workflowVaultCredential && workflowVaultCredential.encrypted_value) {
            // Use CredentialVault service to retrieve (handles decryption automatically)
            try {
              const { getCredentialVault } = await import('../services/credential-vault');
              const vault = getCredentialVault();
              const retrievedKey = await vault.retrieve(
                { userId: effectiveUserId, workflowId: workflowId },
                apiKeyName
              );
              if (retrievedKey) {
                apiKey = retrievedKey;
              }
            } catch (vaultError) {
              // If vault retrieval fails, try using the encrypted value directly (might be plain text in dev)
              console.warn('[API Key Auth] Failed to retrieve from vault, trying encrypted value as-is');
              apiKey = workflowVaultCredential.encrypted_value;
            }
          }
        }

        // If still not found, try credentials table with name matching
        if (!apiKey) {
          const { data: credentialByName } = await supabase
            .from('credentials')
            .select('*')
            .eq('workflow_id', workflowId)
            .eq('provider', 'apikey')
            .or(`name.eq.${apiKeyName},data->>name.eq.${apiKeyName}`)
            .single();

          if (credentialByName) {
            if (credentialByName.data && typeof credentialByName.data === 'object') {
              const credData = credentialByName.data as any;
              apiKey = credData.api_key || credData.apiKey || credData.key || credData.value;
            } else {
              apiKey = (credentialByName as any).api_key || (credentialByName as any).value;
            }
          }
        }

        if (!apiKey) {
          return {
            success: false,
            error: `API key '${apiKeyName}' not found. Please add it in credentials.`,
          };
        }

        return {
          success: true,
          apiKey,
          apiKeyName,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to get API key',
        };
      }
    }

    case 'read_binary_file': {
      // ✅ Read Binary File node
      // Config: { filePath: string }
      // Output: { filePath, dataBase64, sizeBytes }
      const filePath = getStringProperty(config, 'filePath', '');
      if (!filePath) {
        return { ...inputObj, _error: 'read_binary_file: filePath is required' };
      }

      try {
        const fs = await import('fs/promises');
        const buf = await fs.readFile(filePath);
        return {
          ...inputObj,
          filePath,
          dataBase64: Buffer.from(buf).toString('base64'),
          sizeBytes: buf.length,
        };
      } catch (e) {
        return {
          ...inputObj,
          _error: `read_binary_file: failed to read "${filePath}": ${e instanceof Error ? e.message : String(e)}`,
          filePath,
        };
      }
    }

    case 'write_binary_file': {
      // ✅ Write Binary File node
      // Config: { filePath: string, data: base64 string }
      const filePath = getStringProperty(config, 'filePath', '');
      const data = getStringProperty(config, 'data', '');
      if (!filePath) {
        return { ...inputObj, _error: 'write_binary_file: filePath is required' };
      }
      if (!data) {
        return { ...inputObj, _error: 'write_binary_file: data (base64) is required', filePath };
      }

      try {
        const fs = await import('fs/promises');
        const buf = Buffer.from(data, 'base64');
        await fs.writeFile(filePath, buf);
        return {
          ...inputObj,
          filePath,
          sizeBytes: buf.length,
          written: true,
        };
      } catch (e) {
        return {
          ...inputObj,
          _error: `write_binary_file: failed to write "${filePath}": ${e instanceof Error ? e.message : String(e)}`,
          filePath,
        };
      }
    }

    case 'database_read':
    case 'database_write': {
      // ✅ Generic SQL runner (PostgreSQL) for database_read/database_write
      // Uses config.connectionString or DATABASE_URL from environment.
      const execContext = createTypedContext();

      const queryRaw = getStringProperty(config, 'query', '');
      const resolvedQuery = typeof resolveWithSchema(queryRaw, execContext, 'string') === 'string'
        ? (resolveWithSchema(queryRaw, execContext, 'string') as string)
        : String(resolveTypedValue(queryRaw, execContext));

      const connRaw = getStringProperty(config, 'connectionString', '');
      const resolvedConn = connRaw
        ? (typeof resolveWithSchema(connRaw, execContext, 'string') === 'string'
            ? (resolveWithSchema(connRaw, execContext, 'string') as string)
            : String(resolveTypedValue(connRaw, execContext)))
        : '';

      const connectionString = (resolvedConn || process.env.DATABASE_URL || '').trim();

      if (!resolvedQuery) {
        return { ...inputObj, _error: `${type}: query is required` };
      }
      if (!connectionString) {
        return {
          ...inputObj,
          _error: `${type}: missing connectionString. Provide config.connectionString or set DATABASE_URL in worker environment.`,
        };
      }

      // Parameters: allow array or JSON string
      let params: any[] = [];
      const paramsRaw = (config as any)?.parameters ?? (config as any)?.params;
      if (Array.isArray(paramsRaw)) {
        params = paramsRaw;
      } else if (typeof paramsRaw === 'string' && paramsRaw.trim()) {
        const resolvedParamsStr = typeof resolveWithSchema(paramsRaw, execContext, 'string') === 'string'
          ? (resolveWithSchema(paramsRaw, execContext, 'string') as string)
          : String(resolveTypedValue(paramsRaw, execContext));
        try {
          const parsed = JSON.parse(resolvedParamsStr);
          params = Array.isArray(parsed) ? parsed : [];
        } catch {
          params = [];
        }
      }

      try {
        const { Pool } = await import('pg');
        const pool = new Pool({
          connectionString,
          // Conservative SSL behavior: many managed PG providers require SSL
          ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false },
          max: 4,
          idleTimeoutMillis: 15_000,
          connectionTimeoutMillis: 15_000,
        } as any);

        try {
          const result = await pool.query(resolvedQuery, params);
          const items = Array.isArray(result.rows) ? result.rows : [];
          const rowsAffected = typeof result.rowCount === 'number' ? result.rowCount : 0;

          // Normalize for downstream logic nodes: always return items array
          return {
            ...inputObj,
            items,
            rowsAffected,
            query: resolvedQuery,
          };
        } finally {
          await pool.end().catch(() => {});
        }
      } catch (e) {
        return {
          ...inputObj,
          _error: `${type}: query failed: ${e instanceof Error ? e.message : String(e)}`,
          query: resolvedQuery,
        };
      }
    }

    case 'aws_s3': {
      // ✅ AWS S3 node - upload/download/list using aws-sdk v2
      const operation = getStringProperty(config, 'operation', '').toLowerCase();
      const bucket = getStringProperty(config, 'bucket', '').trim();
      const key = getStringProperty(config, 'key', '').trim();
      const prefix = getStringProperty(config, 'prefix', '').trim();
      const region = (getStringProperty(config, 'region', '') || 'us-east-1').trim();

      if (!operation) return { ...inputObj, _error: 'aws_s3: operation is required (upload, download, list)' };
      if (!bucket) return { ...inputObj, _error: 'aws_s3: bucket is required' };

      const accessKeyId = getStringProperty(config, 'accessKeyId', '').trim();
      const secretAccessKey = getStringProperty(config, 'secretAccessKey', '').trim();
      const sessionToken = getStringProperty(config, 'sessionToken', '').trim();

      try {
        const AWS = await import('aws-sdk');
        const s3 = new (AWS as any).S3({
          region,
          ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } }
            : {}),
        });

        if (operation === 'list') {
          const resp = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix || undefined, MaxKeys: 1000 }).promise();
          const items = (resp.Contents || []).map((o: any) => ({
            key: o.Key,
            size: o.Size,
            lastModified: o.LastModified,
            etag: o.ETag,
          }));
          return { ...inputObj, bucket, prefix, items, count: items.length };
        }

        if (operation === 'download') {
          if (!key) return { ...inputObj, _error: 'aws_s3: key is required for download', bucket };
          const resp = await s3.getObject({ Bucket: bucket, Key: key }).promise();
          const body = resp.Body;
          const buf = Buffer.isBuffer(body) ? body : Buffer.from(body as any);
          return {
            ...inputObj,
            bucket,
            key,
            dataBase64: buf.toString('base64'),
            sizeBytes: buf.length,
            contentType: resp.ContentType,
            etag: resp.ETag,
          };
        }

        if (operation === 'upload') {
          if (!key) return { ...inputObj, _error: 'aws_s3: key is required for upload', bucket };
          const dataBase64 = (getStringProperty(config, 'dataBase64', '') || getStringProperty(config, 'data', '')).trim();
          if (!dataBase64) return { ...inputObj, _error: 'aws_s3: dataBase64 (or data) is required for upload', bucket, key };
          const buf = Buffer.from(dataBase64, 'base64');
          const resp = await s3.putObject({ Bucket: bucket, Key: key, Body: buf }).promise();
          return { ...inputObj, bucket, key, sizeBytes: buf.length, etag: resp.ETag, uploaded: true };
        }

        return { ...inputObj, _error: `aws_s3: unsupported operation "${operation}" (supported: upload, download, list)` };
      } catch (e) {
        return { ...inputObj, _error: `aws_s3: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'dropbox': {
      // ✅ Dropbox file operations via Dropbox API
      const operation = getStringProperty(config, 'operation', '').toLowerCase();
      const path = (getStringProperty(config, 'path', '') || '').trim(); // Dropbox paths start with '/'
      const recursive = (config as any)?.recursive === true || getStringProperty(config, 'recursive', 'false') === 'true';

      // Token from config.accessToken or vault key "dropbox"
      let accessToken = getStringProperty(config, 'accessToken', '').trim();
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'dropbox');
            if (found) {
              accessToken = found;
              break;
            }
          }
        } catch {
          // ignore - handled below
        }
      }

      if (!accessToken) {
        return { ...inputObj, _error: 'Dropbox: access token not found. Connect Dropbox or provide accessToken.' };
      }

      try {
        if (operation === 'list') {
          const resp = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ path: path || '', recursive }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            return { ...inputObj, _error: `Dropbox list failed (${resp.status})`, _errorDetails: data };
          }
          const items = Array.isArray((data as any)?.entries) ? (data as any).entries : [];
          return { ...inputObj, success: true, items, cursor: (data as any)?.cursor, hasMore: (data as any)?.has_more };
        }

        if (operation === 'download') {
          if (!path) return { ...inputObj, _error: 'Dropbox: path is required for download' };
          const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Dropbox-API-Arg': JSON.stringify({ path }),
            },
          });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return { ...inputObj, _error: `Dropbox download failed (${resp.status})`, _errorDetails: text };
          }
          const arrayBuffer = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const metaHeader = resp.headers.get('dropbox-api-result');
          let metadata: any = null;
          try { metadata = metaHeader ? JSON.parse(metaHeader) : null; } catch { metadata = null; }
          return { ...inputObj, success: true, path, dataBase64: buf.toString('base64'), sizeBytes: buf.length, metadata };
        }

        if (operation === 'upload') {
          if (!path) return { ...inputObj, _error: 'Dropbox: path is required for upload' };
          const dataBase64 = (getStringProperty(config, 'dataBase64', '') || getStringProperty(config, 'data', '')).trim();
          if (!dataBase64) return { ...inputObj, _error: 'Dropbox: dataBase64 (or data) is required for upload', path };
          const buf = Buffer.from(dataBase64, 'base64');
          const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: false }),
            },
            body: buf,
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            return { ...inputObj, _error: `Dropbox upload failed (${resp.status})`, _errorDetails: data };
          }
          return { ...inputObj, success: true, path, sizeBytes: buf.length, metadata: data };
        }

        return { ...inputObj, _error: `Dropbox: Unsupported operation "${operation}". Supported: upload, download, list` };
      } catch (e) {
        return { ...inputObj, _error: `Dropbox error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'onedrive': {
      // ✅ OneDrive file operations via Microsoft Graph
      const operation = getStringProperty(config, 'operation', '').toLowerCase();
      const pathRaw = (getStringProperty(config, 'path', '') || '').trim();
      const path = pathRaw.startsWith('/') ? pathRaw : (pathRaw ? `/${pathRaw}` : '');

      // Token from config.accessToken or vault key "microsoft"
      let accessToken = getStringProperty(config, 'accessToken', '').trim();
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'microsoft');
            if (found) {
              accessToken = found;
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!accessToken) {
        return { ...inputObj, _error: 'OneDrive: access token not found. Connect Microsoft or provide accessToken.' };
      }

      const graph = 'https://graph.microsoft.com/v1.0';

      try {
        if (operation === 'list') {
          const url = path
            ? `${graph}/me/drive/root:${encodeURI(path)}:/children`
            : `${graph}/me/drive/root/children`;
          const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            return { ...inputObj, _error: `OneDrive list failed (${resp.status})`, _errorDetails: data };
          }
          const items = Array.isArray((data as any)?.value) ? (data as any).value : [];
          return { ...inputObj, success: true, items };
        }

        if (operation === 'download') {
          if (!path) return { ...inputObj, _error: 'OneDrive: path is required for download' };
          const url = `${graph}/me/drive/root:${encodeURI(path)}:/content`;
          const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return { ...inputObj, _error: `OneDrive download failed (${resp.status})`, _errorDetails: text };
          }
          const arrayBuffer = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          return { ...inputObj, success: true, path, dataBase64: buf.toString('base64'), sizeBytes: buf.length };
        }

        if (operation === 'upload') {
          if (!path) return { ...inputObj, _error: 'OneDrive: path is required for upload' };
          const dataBase64 = (getStringProperty(config, 'dataBase64', '') || getStringProperty(config, 'data', '')).trim();
          if (!dataBase64) return { ...inputObj, _error: 'OneDrive: dataBase64 (or data) is required for upload', path };
          const buf = Buffer.from(dataBase64, 'base64');
          const url = `${graph}/me/drive/root:${encodeURI(path)}:/content`;
          const resp = await fetch(url, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: buf,
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            return { ...inputObj, _error: `OneDrive upload failed (${resp.status})`, _errorDetails: data };
          }
          return { ...inputObj, success: true, path, sizeBytes: buf.length, metadata: data };
        }

        return { ...inputObj, _error: `OneDrive: Unsupported operation "${operation}". Supported: upload, download, list` };
      } catch (e) {
        return { ...inputObj, _error: `OneDrive error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'stripe': {
      // ✅ Stripe node - minimal REST integration
      // Credentials: config.apiKey or vault key "stripe"
      const operation = getStringProperty(config, 'operation', '').toLowerCase();
      const currency = (getStringProperty(config, 'currency', '') || 'usd').toLowerCase();
      const description = getStringProperty(config, 'description', '');

      // Resolve templates
      const execContext = createTypedContext();
      const resolveStr = (v: string): string => {
        const out = resolveTypedValue(v, execContext);
        return typeof out === 'string' ? out : JSON.stringify(out);
      };

      let apiKey = (getStringProperty(config, 'apiKey', '') || '').trim();
      if (!apiKey) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'stripe');
            if (found) {
              apiKey = found;
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!apiKey) {
        return { ...inputObj, _error: 'Stripe: API key not found. Provide apiKey or attach vault credential "stripe".' };
      }

      const stripeFetch = async (path: string, params: Record<string, any>) => {
        const body = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null || v === '') return;
          body.append(k, String(v));
        });

        const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { ok: false, status: resp.status, data };
        }
        return { ok: true, status: resp.status, data };
      };

      try {
        if (!operation) {
          return { ...inputObj, _error: 'Stripe: operation is required (charge, refund, createCustomer)' };
        }

        if (operation === 'createcustomer' || operation === 'create_customer') {
          const email = getStringProperty(config, 'email', '');
          const name = getStringProperty(config, 'name', '');
          const resp = await stripeFetch('customers', {
            email: email ? resolveStr(email) : undefined,
            name: name ? resolveStr(name) : undefined,
            description: description ? resolveStr(description) : undefined,
          });
          if (!resp.ok) return { ...inputObj, _error: `Stripe createCustomer failed (${resp.status})`, _errorDetails: resp.data };
          return { ...inputObj, success: true, customer: resp.data };
        }

        if (operation === 'refund') {
          const chargeId = getStringProperty(config, 'chargeId', '');
          const paymentIntentId = getStringProperty(config, 'paymentIntentId', '');
          const amountRaw = getStringProperty(config, 'amount', '');
          const amount = amountRaw ? Number(resolveStr(amountRaw)) : undefined;
          const resp = await stripeFetch('refunds', {
            charge: chargeId ? resolveStr(chargeId) : undefined,
            payment_intent: paymentIntentId ? resolveStr(paymentIntentId) : undefined,
            ...(Number.isFinite(amount as any) ? { amount: Math.trunc(amount as any) } : {}),
          });
          if (!resp.ok) return { ...inputObj, _error: `Stripe refund failed (${resp.status})`, _errorDetails: resp.data };
          return { ...inputObj, success: true, refund: resp.data };
        }

        if (operation === 'charge' || operation === 'payment' || operation === 'paymentintent') {
          const amountRaw = getStringProperty(config, 'amount', '');
          const amount = amountRaw ? Number(resolveStr(amountRaw)) : NaN;
          if (!Number.isFinite(amount) || amount <= 0) {
            return { ...inputObj, _error: 'Stripe charge: amount (in cents) is required' };
          }

          const source = getStringProperty(config, 'source', '');
          const customerId = getStringProperty(config, 'customerId', '');
          const paymentMethodId = getStringProperty(config, 'paymentMethodId', '');

          // Prefer PaymentIntents (modern)
          if (paymentMethodId || !source) {
            const resp = await stripeFetch('payment_intents', {
              amount: Math.trunc(amount),
              currency,
              description: description ? resolveStr(description) : undefined,
              customer: customerId ? resolveStr(customerId) : undefined,
              payment_method: paymentMethodId ? resolveStr(paymentMethodId) : undefined,
              confirmation_method: 'automatic',
              confirm: 'false',
            });
            if (!resp.ok) return { ...inputObj, _error: `Stripe payment_intents failed (${resp.status})`, _errorDetails: resp.data };
            return { ...inputObj, success: true, paymentIntent: resp.data };
          }

          // Legacy charges API
          const resp = await stripeFetch('charges', {
            amount: Math.trunc(amount),
            currency,
            description: description ? resolveStr(description) : undefined,
            source: source ? resolveStr(source) : undefined,
            customer: customerId ? resolveStr(customerId) : undefined,
          });
          if (!resp.ok) return { ...inputObj, _error: `Stripe charge failed (${resp.status})`, _errorDetails: resp.data };
          return { ...inputObj, success: true, charge: resp.data };
        }

        return { ...inputObj, _error: `Stripe: Unsupported operation "${operation}". Supported: charge, refund, createCustomer` };
      } catch (e) {
        return { ...inputObj, _error: `Stripe error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'twilio': {
      // ✅ Twilio node - send SMS via Twilio REST API
      // Credentials: config.authToken + config.accountSid OR vault key "twilio"
      const toRaw = getStringProperty(config, 'to', '');
      const msgRaw = getStringProperty(config, 'message', '');
      const fromRaw = getStringProperty(config, 'from', '');

      if (!toRaw || !msgRaw) {
        return { ...inputObj, _error: 'Twilio: to and message are required' };
      }

      const execContext = createTypedContext();
      const to = typeof resolveWithSchema(toRaw, execContext, 'string') === 'string'
        ? (resolveWithSchema(toRaw, execContext, 'string') as string)
        : String(resolveTypedValue(toRaw, execContext));
      const message = typeof resolveWithSchema(msgRaw, execContext, 'string') === 'string'
        ? (resolveWithSchema(msgRaw, execContext, 'string') as string)
        : String(resolveTypedValue(msgRaw, execContext));
      const from = fromRaw
        ? (typeof resolveWithSchema(fromRaw, execContext, 'string') === 'string'
            ? (resolveWithSchema(fromRaw, execContext, 'string') as string)
            : String(resolveTypedValue(fromRaw, execContext)))
        : '';

      let accountSid = (getStringProperty(config, 'accountSid', '') || '').trim();
      let authToken = (getStringProperty(config, 'authToken', '') || '').trim();

      // Vault fallback: value can be JSON ({accountSid, authToken, from}) or "sid:token" or token-only
      if (!authToken || !accountSid) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'twilio');
            if (!found) continue;
            const trimmed = found.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const parsed = JSON.parse(trimmed) as any;
                accountSid = accountSid || String(parsed.accountSid || parsed.sid || '').trim();
                authToken = authToken || String(parsed.authToken || parsed.token || '').trim();
                if (!from && parsed.from) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const _ = parsed.from;
                }
              } catch {
                // fall back below
              }
            }
            if ((!accountSid || !authToken) && trimmed.includes(':')) {
              const [sid, tok] = trimmed.split(':', 2);
              accountSid = accountSid || sid.trim();
              authToken = authToken || tok.trim();
            }
            if (!authToken && trimmed && !trimmed.includes(':')) {
              authToken = trimmed;
            }
            if (authToken && accountSid) break;
          }
        } catch {
          // ignore
        }
      }

      if (!accountSid || !authToken) {
        return { ...inputObj, _error: 'Twilio: missing accountSid/authToken. Provide in node config or attach vault credential "twilio".' };
      }

      if (!from) {
        return { ...inputObj, _error: 'Twilio: from is required (Twilio phone number).' };
      }

      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
        const body = new URLSearchParams({ To: to, From: from, Body: message });
        const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { ...inputObj, _error: `Twilio send failed (${resp.status})`, _errorDetails: data };
        }
        return { ...inputObj, success: true, twilio: data };
      } catch (e) {
        return { ...inputObj, _error: `Twilio error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'shopify': {
      // ✅ Shopify Admin API (minimal): list/get/create/update/delete for products/orders/customers
      const resource = (getStringProperty(config, 'resource', 'product') || 'product').toLowerCase();
      const operation = (getStringProperty(config, 'operation', 'get') || 'get').toLowerCase();
      const shopDomain = getStringProperty(config, 'shopDomain', '').trim();
      const execContext = createTypedContext();

      let token = (getStringProperty(config, 'apiKey', '') || '').trim();
      if (!token) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'shopify');
            if (found) { token = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!shopDomain) return { ...inputObj, _error: 'Shopify: shopDomain is required (e.g., my-store.myshopify.com)' };
      if (!token) return { ...inputObj, _error: 'Shopify: access token not found. Provide apiKey or vault credential "shopify".' };

      const base = `https://${shopDomain}/admin/api/2024-04`;
      const mapResource = (r: string): string => {
        if (r === 'product' || r === 'products') return 'products';
        if (r === 'order' || r === 'orders') return 'orders';
        if (r === 'customer' || r === 'customers') return 'customers';
        return r.endsWith('s') ? r : `${r}s`;
      };
      const rPath = mapResource(resource);

      const id =
        getStringProperty(config, 'id', '') ||
        getStringProperty(config, `${resource}Id`, '') ||
        getStringProperty(config, 'productId', '') ||
        getStringProperty(config, 'orderId', '') ||
        getStringProperty(config, 'customerId', '');

      const limitRaw = getStringProperty(config, 'limit', '50');
      const limit = Number(limitRaw) || 50;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      };

      try {
        if (operation === 'get' || operation === 'list') {
          if (id) {
            const resp = await fetch(`${base}/${rPath}/${encodeURIComponent(id)}.json`, { headers });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) return { ...inputObj, _error: `Shopify get failed (${resp.status})`, _errorDetails: data };
            return { ...inputObj, success: true, item: data };
          }
          const resp = await fetch(`${base}/${rPath}.json?limit=${encodeURIComponent(String(limit))}`, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Shopify list failed (${resp.status})`, _errorDetails: data };
          // Shopify returns { products: [...] } / { orders: [...] } / { customers: [...] }
          const items = data && typeof data === 'object' ? ((data as any)[rPath] || (data as any)[resource] || []) : [];
          return { ...inputObj, success: true, items };
        }

        // Parse payload (object or json string)
        let payload: any = (config as any).data ?? (config as any).orderData ?? (config as any).productData ?? null;
        if (typeof payload === 'string' && payload.trim()) {
          const resolved = resolveTypedValue(payload, execContext);
          try { payload = JSON.parse(typeof resolved === 'string' ? resolved : JSON.stringify(resolved)); } catch { payload = null; }
        }

        if (operation === 'create') {
          if (!payload || typeof payload !== 'object') return { ...inputObj, _error: 'Shopify create: data is required (object)' };
          const wrapperKey = rPath.slice(0, -1); // products -> product
          const resp = await fetch(`${base}/${rPath}.json`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ [wrapperKey]: payload }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Shopify create failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, item: data };
        }

        if (operation === 'update') {
          if (!id) return { ...inputObj, _error: 'Shopify update: id is required' };
          if (!payload || typeof payload !== 'object') return { ...inputObj, _error: 'Shopify update: data is required (object)' };
          const wrapperKey = rPath.slice(0, -1);
          const resp = await fetch(`${base}/${rPath}/${encodeURIComponent(id)}.json`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ [wrapperKey]: { ...payload, id: Number(id) || id } }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Shopify update failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, item: data };
        }

        if (operation === 'delete') {
          if (!id) return { ...inputObj, _error: 'Shopify delete: id is required' };
          const resp = await fetch(`${base}/${rPath}/${encodeURIComponent(id)}.json`, { method: 'DELETE', headers });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return { ...inputObj, _error: `Shopify delete failed (${resp.status})`, _errorDetails: text };
          }
          return { ...inputObj, success: true, deleted: true, id };
        }

        return { ...inputObj, _error: `Shopify: Unsupported operation "${operation}". Supported: get/list/create/update/delete` };
      } catch (e) {
        return { ...inputObj, _error: `Shopify error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'woocommerce': {
      // ✅ WooCommerce REST API (minimal): list/get/create/update/delete
      const resource = (getStringProperty(config, 'resource', 'product') || 'product').toLowerCase();
      const operation = (getStringProperty(config, 'operation', 'get') || 'get').toLowerCase();
      const storeUrl = getStringProperty(config, 'storeUrl', '').trim();

      let apiKey = (getStringProperty(config, 'apiKey', '') || '').trim();
      let apiSecret = (getStringProperty(config, 'apiSecret', '') || '').trim();
      if (!apiKey || !apiSecret) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'woocommerce');
            if (!found) continue;
            const trimmed = found.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const parsed = JSON.parse(trimmed) as any;
                apiKey = apiKey || String(parsed.apiKey || parsed.consumerKey || parsed.key || '').trim();
                apiSecret = apiSecret || String(parsed.apiSecret || parsed.consumerSecret || parsed.secret || '').trim();
              } catch {}
            }
            if ((!apiKey || !apiSecret) && trimmed.includes(':')) {
              const [k, s] = trimmed.split(':', 2);
              apiKey = apiKey || k.trim();
              apiSecret = apiSecret || s.trim();
            }
            if (apiKey && apiSecret) break;
          }
        } catch {
          // ignore
        }
      }

      if (!storeUrl) return { ...inputObj, _error: 'WooCommerce: storeUrl is required (e.g., https://example.com)' };
      if (!apiKey || !apiSecret) return { ...inputObj, _error: 'WooCommerce: missing apiKey/apiSecret. Provide in config or vault credential "woocommerce".' };

      const base = storeUrl.replace(/\/+$/, '') + '/wp-json/wc/v3';
      const resPath = resource === 'product' ? 'products' : resource === 'order' ? 'orders' : resource === 'customer' ? 'customers' : (resource.endsWith('s') ? resource : `${resource}s`);
      const id = getStringProperty(config, 'id', '').trim();
      const perPage = Number(getStringProperty(config, 'perPage', '50')) || 50;

      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` };

      try {
        if (operation === 'get' || operation === 'list') {
          const url = id
            ? `${base}/${resPath}/${encodeURIComponent(id)}`
            : `${base}/${resPath}?per_page=${encodeURIComponent(String(perPage))}`;
          const resp = await fetch(url, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `WooCommerce ${operation} failed (${resp.status})`, _errorDetails: data };
          return id ? { ...inputObj, success: true, item: data } : { ...inputObj, success: true, items: data };
        }

        let payload: any = (config as any).data ?? null;
        if (typeof payload === 'string' && payload.trim()) {
          try { payload = JSON.parse(payload); } catch { payload = null; }
        }
        if (!payload || typeof payload !== 'object') return { ...inputObj, _error: `WooCommerce ${operation}: data is required (object)` };

        if (operation === 'create') {
          const resp = await fetch(`${base}/${resPath}`, { method: 'POST', headers, body: JSON.stringify(payload) });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `WooCommerce create failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, item: data };
        }
        if (operation === 'update') {
          if (!id) return { ...inputObj, _error: 'WooCommerce update: id is required' };
          const resp = await fetch(`${base}/${resPath}/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `WooCommerce update failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, item: data };
        }
        if (operation === 'delete') {
          if (!id) return { ...inputObj, _error: 'WooCommerce delete: id is required' };
          const resp = await fetch(`${base}/${resPath}/${encodeURIComponent(id)}?force=true`, { method: 'DELETE', headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `WooCommerce delete failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, deleted: true, item: data };
        }

        return { ...inputObj, _error: `WooCommerce: Unsupported operation "${operation}". Supported: get/list/create/update/delete` };
      } catch (e) {
        return { ...inputObj, _error: `WooCommerce error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'paypal': {
      // ✅ PayPal (minimal): create order (charge) and refund capture
      const operation = (getStringProperty(config, 'operation', 'charge') || 'charge').toLowerCase();
      const environment = (getStringProperty(config, 'environment', '') || 'live').toLowerCase();
      const base = environment === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
      const currency = (getStringProperty(config, 'currency', '') || 'USD').toUpperCase();
      const description = getStringProperty(config, 'description', '');
      const autoCapture = (config as any)?.autoCapture !== false;

      let accessToken = (getStringProperty(config, 'accessToken', '') || '').trim();
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'paypal');
            if (found) { accessToken = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!accessToken) {
        return { ...inputObj, _error: 'PayPal: access token not found. Connect PayPal or provide accessToken.' };
      }

      try {
        if (operation === 'charge' || operation === 'createorder' || operation === 'order') {
          const amountRaw = getStringProperty(config, 'amount', '');
          const amount = amountRaw ? Number(amountRaw) : NaN;
          if (!Number.isFinite(amount) || amount <= 0) return { ...inputObj, _error: 'PayPal charge: amount is required' };

          const createResp = await fetch(`${base}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              intent: autoCapture ? 'CAPTURE' : 'AUTHORIZE',
              purchase_units: [
                {
                  description: description || undefined,
                  amount: {
                    currency_code: currency,
                    value: amount.toFixed(2),
                  },
                },
              ],
            }),
          });
          const orderData = await createResp.json().catch(() => null);
          if (!createResp.ok) return { ...inputObj, _error: `PayPal create order failed (${createResp.status})`, _errorDetails: orderData };

          // If CAPTURE intent, we can capture immediately only if payer has approved; without approval this will fail.
          // So we just return order info; UI can redirect user to approval link.
          return { ...inputObj, success: true, order: orderData };
        }

        if (operation === 'refund') {
          const captureId = getStringProperty(config, 'paymentId', '').trim();
          if (!captureId) return { ...inputObj, _error: 'PayPal refund: paymentId (captureId) is required' };
          const amountRaw = getStringProperty(config, 'amount', '');
          const amount = amountRaw ? Number(amountRaw) : NaN;
          const body: any = {};
          if (Number.isFinite(amount) && amount > 0) {
            body.amount = { currency_code: currency, value: amount.toFixed(2) };
          }
          const resp = await fetch(`${base}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `PayPal refund failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, refund: data };
        }

        return { ...inputObj, _error: `PayPal: Unsupported operation "${operation}". Supported: charge, refund` };
      } catch (e) {
        return { ...inputObj, _error: `PayPal error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'jira': {
      // ✅ Jira (Atlassian Cloud) minimal: create/read/update/delete issues
      const operation = (getStringProperty(config, 'operation', 'read') || 'read').toLowerCase();
      const baseUrl = getStringProperty(config, 'baseUrl', '').trim().replace(/\/+$/, '');
      const email = getStringProperty(config, 'email', '').trim();

      // Token from config.apiToken or vault key "jira"
      let apiToken = getStringProperty(config, 'apiToken', '').trim();
      if (!apiToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'jira');
            if (found) { apiToken = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!baseUrl) return { ...inputObj, _error: 'Jira: baseUrl is required (e.g., https://your-domain.atlassian.net)' };
      if (!email) return { ...inputObj, _error: 'Jira: email is required (for API token auth)' };
      if (!apiToken) return { ...inputObj, _error: 'Jira: apiToken not found. Provide apiToken or vault credential "jira".' };

      const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
      const headers: Record<string, string> = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      const issueKey = getStringProperty(config, 'issueKey', '').trim();

      try {
        if (operation === 'read' || operation === 'get') {
          if (!issueKey) return { ...inputObj, _error: 'Jira read: issueKey is required (e.g., PROJ-123)' };
          const resp = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Jira read failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, issue: data };
        }

        if (operation === 'create') {
          const projectKey = getStringProperty(config, 'projectKey', '').trim();
          const summary = getStringProperty(config, 'summary', '').trim();
          const descriptionText = getStringProperty(config, 'descriptionText', '').trim();
          const issueType = (getStringProperty(config, 'issueType', '') || 'Task').trim();
          if (!projectKey || !summary) return { ...inputObj, _error: 'Jira create: projectKey and summary are required' };

          const body = {
            fields: {
              project: { key: projectKey },
              summary,
              issuetype: { name: issueType },
              ...(descriptionText
                ? {
                    description: {
                      type: 'doc',
                      version: 1,
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: descriptionText }],
                        },
                      ],
                    },
                  }
                : {}),
            },
          };

          const resp = await fetch(`${baseUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Jira create failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, created: data };
        }

        if (operation === 'update') {
          if (!issueKey) return { ...inputObj, _error: 'Jira update: issueKey is required' };
          const summary = getStringProperty(config, 'summary', '').trim();
          const descriptionText = getStringProperty(config, 'descriptionText', '').trim();
          if (!summary && !descriptionText) return { ...inputObj, _error: 'Jira update: provide summary and/or descriptionText' };

          const fields: any = {};
          if (summary) fields.summary = summary;
          if (descriptionText) {
            fields.description = {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: descriptionText }],
                },
              ],
            };
          }

          const resp = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ fields }),
          });
          const text = await resp.text().catch(() => '');
          if (!resp.ok) return { ...inputObj, _error: `Jira update failed (${resp.status})`, _errorDetails: text };
          return { ...inputObj, success: true, updated: true };
        }

        if (operation === 'delete') {
          if (!issueKey) return { ...inputObj, _error: 'Jira delete: issueKey is required' };
          const resp = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
            method: 'DELETE',
            headers,
          });
          const text = await resp.text().catch(() => '');
          if (!resp.ok) return { ...inputObj, _error: `Jira delete failed (${resp.status})`, _errorDetails: text };
          return { ...inputObj, success: true, deleted: true, issueKey };
        }

        return { ...inputObj, _error: `Jira: Unsupported operation "${operation}". Supported: create, read, update, delete` };
      } catch (e) {
        return { ...inputObj, _error: `Jira error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'gitlab': {
      // ✅ GitLab minimal: list issues / create issue / get issue
      const operation = (getStringProperty(config, 'operation', 'read') || 'read').toLowerCase();
      const baseUrl = (getStringProperty(config, 'baseUrl', '') || 'https://gitlab.com/api/v4').trim().replace(/\/+$/, '');
      const projectId = (getStringProperty(config, 'projectId', '') || getStringProperty(config, 'repo', '')).trim();
      const issueIid = getStringProperty(config, 'issueIid', '').trim();

      // Token from config.accessToken or vault key "gitlab"
      let accessToken = getStringProperty(config, 'accessToken', '').trim();
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'gitlab');
            if (found) { accessToken = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!projectId) return { ...inputObj, _error: 'GitLab: projectId (or repo) is required' };
      if (!accessToken) return { ...inputObj, _error: 'GitLab: access token not found. Connect GitLab or provide accessToken.' };

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const projectEnc = encodeURIComponent(projectId);

      try {
        if (operation === 'read' || operation === 'get') {
          if (issueIid) {
            const resp = await fetch(`${baseUrl}/projects/${projectEnc}/issues/${encodeURIComponent(issueIid)}`, { headers });
            const data = await resp.json().catch(() => null);
            if (!resp.ok) return { ...inputObj, _error: `GitLab get issue failed (${resp.status})`, _errorDetails: data };
            return { ...inputObj, success: true, issue: data };
          }
          const resp = await fetch(`${baseUrl}/projects/${projectEnc}/issues?per_page=50`, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `GitLab list issues failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, items: data };
        }

        if (operation === 'create') {
          const title = getStringProperty(config, 'title', '').trim();
          const descriptionText = getStringProperty(config, 'descriptionText', '').trim();
          if (!title) return { ...inputObj, _error: 'GitLab create issue: title is required' };
          const resp = await fetch(`${baseUrl}/projects/${projectEnc}/issues`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title, description: descriptionText || undefined }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `GitLab create issue failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, created: data };
        }

        return { ...inputObj, _error: `GitLab: Unsupported operation "${operation}". Supported: create, read` };
      } catch (e) {
        return { ...inputObj, _error: `GitLab error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'freshdesk': {
      // ✅ Freshdesk minimal: tickets create/get/list/update/delete
      const resource = (getStringProperty(config, 'resource', 'ticket') || 'ticket').toLowerCase();
      const operation = (getStringProperty(config, 'operation', 'get') || 'get').toLowerCase();
      const domain = getStringProperty(config, 'domain', '').trim();
      const id = getStringProperty(config, 'id', '').trim();

      let apiKey = getStringProperty(config, 'apiKey', '').trim();
      if (!apiKey) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'freshdesk');
            if (found) { apiKey = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!domain) return { ...inputObj, _error: 'Freshdesk: domain is required (e.g., mycompany.freshdesk.com)' };
      if (!apiKey) return { ...inputObj, _error: 'Freshdesk: apiKey not found. Provide apiKey or vault credential "freshdesk".' };

      const base = `https://${domain}/api/v2`;
      const auth = Buffer.from(`${apiKey}:X`).toString('base64');
      const headers: Record<string, string> = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      };

      const resPath = resource === 'ticket' ? 'tickets' : resource === 'contact' ? 'contacts' : resource === 'company' ? 'companies' : `${resource}s`;

      try {
        if (operation === 'get' || operation === 'read') {
          if (!id) return { ...inputObj, _error: `Freshdesk ${operation}: id is required` };
          const resp = await fetch(`${base}/${resPath}/${encodeURIComponent(id)}`, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Freshdesk get failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, item: data };
        }

        if (operation === 'list') {
          const resp = await fetch(`${base}/${resPath}`, { headers });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Freshdesk list failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, items: data };
        }

        if (operation === 'create') {
          let payload: any = (config as any).data ?? null;
          if (!payload || typeof payload !== 'object') {
            // Ticket convenience fields
            const subject = getStringProperty(config, 'subject', '').trim();
            const descriptionText = getStringProperty(config, 'descriptionText', '').trim();
            const email = getStringProperty(config, 'email', '').trim();
            if (resPath === 'tickets' && subject && descriptionText && email) {
              payload = {
                subject,
                description: descriptionText,
                email,
                priority: (config as any).priority,
                status: (config as any).status,
              };
            }
          }
          if (!payload || typeof payload !== 'object') return { ...inputObj, _error: 'Freshdesk create: data (object) is required (or provide subject+descriptionText+email for ticket)' };
          const resp = await fetch(`${base}/${resPath}`, { method: 'POST', headers, body: JSON.stringify(payload) });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Freshdesk create failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, created: data };
        }

        if (operation === 'update') {
          if (!id) return { ...inputObj, _error: 'Freshdesk update: id is required' };
          const payload = (config as any).data;
          if (!payload || typeof payload !== 'object') return { ...inputObj, _error: 'Freshdesk update: data (object) is required' };
          const resp = await fetch(`${base}/${resPath}/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) return { ...inputObj, _error: `Freshdesk update failed (${resp.status})`, _errorDetails: data };
          return { ...inputObj, success: true, updated: data };
        }

        if (operation === 'delete') {
          if (!id) return { ...inputObj, _error: 'Freshdesk delete: id is required' };
          const resp = await fetch(`${base}/${resPath}/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
          const text = await resp.text().catch(() => '');
          if (!resp.ok) return { ...inputObj, _error: `Freshdesk delete failed (${resp.status})`, _errorDetails: text };
          return { ...inputObj, success: true, deleted: true, id };
        }

        return { ...inputObj, _error: `Freshdesk: Unsupported operation "${operation}". Supported: get/read, list, create, update, delete` };
      } catch (e) {
        return { ...inputObj, _error: `Freshdesk error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case 'log':
    case 'log_output': {
      // ✅ REFACTORED: Log node with typed resolution - returns string directly
      // Log output node: Logs a message and returns it as string
      // Config: { message: 'Debug: {{input}}', level: 'info' }
      const message = getStringProperty(config, 'message', '');
      const level = getStringProperty(config, 'level', 'info');
      
      // Use typed execution context
      const execContext = createTypedContext();
      
      // Resolve the message template - get the actual value (could be string, object, array, etc.)
      const resolvedValue = resolveTypedValue(message, execContext);
      
      // Convert to string properly - use JSON.stringify for objects/arrays, String() for primitives
      let resolvedMessage: string;
      if (resolvedValue === null || resolvedValue === undefined) {
        resolvedMessage = String(resolvedValue);
      } else if (typeof resolvedValue === 'object') {
        // For objects and arrays, use JSON.stringify to get proper representation
        try {
          resolvedMessage = JSON.stringify(resolvedValue, null, 2);
        } catch {
          // Fallback if JSON.stringify fails
          resolvedMessage = String(resolvedValue);
        }
      } else {
        // For primitives (string, number, boolean), use String()
        resolvedMessage = String(resolvedValue);
      }
      
      // Log to console with appropriate level
      const logPrefix = `[LOG ${level.toUpperCase()}]`;
      switch (level) {
        case 'error':
          console.error(`${logPrefix} ${resolvedMessage}`);
          break;
        case 'warn':
          console.warn(`${logPrefix} ${resolvedMessage}`);
          break;
        case 'debug':
          console.debug(`${logPrefix} ${resolvedMessage}`);
          break;
        default:
          console.log(`${logPrefix} ${resolvedMessage}`);
      }
      
      // ✅ REFACTORED: Log node returns string, not generic object
      // Log nodes output the message string directly
      return resolvedMessage;
    }

    case 'clickup': {
      const clickupCredentials =
        (node as any).credentials?.clickup_api || (node as any).clickup_api || null;
      result = await executeClickUpNode(node as any, inputObj, clickupCredentials);
      break;
    }

    case 'text_formatter': {
      // Text Formatter node: Formats text using templates
      // Config: { template: 'Hello {{name}}!' }
      // Output: The formatted text string as the primary data field
      const template = getStringProperty(config, 'template', '');
      
      if (!template || template.trim() === '') {
        // If template is empty, convert input to string
        const inputStr = typeof inputObj === 'string' 
          ? inputObj 
          : (inputObj && typeof inputObj === 'object' 
            ? JSON.stringify(inputObj) 
            : String(inputObj || ''));
        return {
          data: inputStr,
          formatted: inputStr,
        };
      }
      
      // ✅ REFACTORED: Text Formatter already migrated - ensure it uses typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      // Text formatter always returns string
      const formattedText = typeof resolveWithSchema(template, execContext, 'string') === 'string'
        ? resolveWithSchema(template, execContext, 'string') as string
        : String(resolveTypedValue(template, execContext));
      
      // ✅ REFACTORED: Return string directly (not wrapped)
      return formattedText;
    }

    case 'openai_gpt':
    case 'anthropic_claude':
    case 'google_gemini': {
      // ✅ REFACTORED: AI nodes with typed resolution
      const prompt = getStringProperty(config, 'prompt', '');
      const model = getStringProperty(config, 'model', 'gpt-4o');
      const apiKey = getStringProperty(config, 'apiKey', '');
      const provider = type === 'openai_gpt' ? 'openai' : 
                      type === 'anthropic_claude' ? 'claude' : 'gemini';
      
      // Use typed execution context
      const execContext = createTypedContext();
      // Prompts are always strings
      const resolvedPrompt = typeof resolveWithSchema(prompt, execContext, 'string') === 'string'
        ? resolveWithSchema(prompt, execContext, 'string') as string
        : String(resolveTypedValue(prompt, execContext));
      
      const llmAdapter = new LLMAdapter();
      const response = await llmAdapter.chat(provider, [
        { role: 'user', content: resolvedPrompt }
      ], { model, apiKey });

      return {
        response: response.content,
        model: response.model,
      };
    }

    case 'ai_chat_model': {
      // Direct AI chat model call (defaults to Ollama Qwen 2.5 14B)
      const prompt = getStringProperty(config, 'prompt', '');
      const provider = getStringProperty(config, 'provider', 'ollama') as any;
      const model = getStringProperty(config, 'model', 'qwen2.5:14b-instruct-q4_K_M');
      const systemPrompt = getStringProperty(config, 'systemPrompt', '');
      const responseFormat = getStringProperty(config, 'responseFormat', 'text');
      const temperatureRaw = getStringProperty(config, 'temperature', '0.7');
      const temperature = parseFloat(temperatureRaw) || 0.7;

      // ✅ DEBUG: Log prompt received from config
      console.log('[AI Chat Model] 🔍 Prompt received:', {
        nodeId: node.id,
        nodeLabel: node.data?.label,
        promptFromConfig: prompt,
        promptLength: prompt.length,
        promptEmpty: !prompt || prompt.trim() === '',
        configKeys: Object.keys(config),
        hasPromptInConfig: 'prompt' in config,
      });

      const execContext = createTypedContext();
      const resolvedPrompt =
        typeof resolveWithSchema(prompt, execContext, 'string') === 'string'
          ? (resolveWithSchema(prompt, execContext, 'string') as string)
          : String(resolveTypedValue(prompt, execContext));

      // ✅ DEBUG: Log resolved prompt
      console.log('[AI Chat Model] 🔍 Resolved prompt:', {
        nodeId: node.id,
        resolvedPrompt: resolvedPrompt,
        resolvedPromptLength: resolvedPrompt.length,
        resolvedPromptEmpty: !resolvedPrompt || resolvedPrompt.trim() === '',
      });

      if (!resolvedPrompt || resolvedPrompt.trim() === '') {
        console.error('[AI Chat Model] ❌ ERROR: Prompt is empty or missing', {
          nodeId: node.id,
          nodeLabel: node.data?.label,
          promptFromConfig: prompt,
          configKeys: Object.keys(config),
        });
        return { ...inputObj, _error: 'AI Chat Model node: prompt is required' };
      }

      const llmAdapter = new LLMAdapter();
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: resolvedPrompt });

      const response = await llmAdapter.chat(provider, messages, { model, temperature });

      if (responseFormat === 'json') {
        // Best-effort JSON parse; fall back to raw text if invalid
        try {
          const parsed = JSON.parse(response.content);
          return { ...inputObj, response: parsed, model: response.model };
        } catch {
          return { ...inputObj, response: response.content, model: response.model };
        }
      }

      return { ...inputObj, response: response.content, model: response.model };
    }

    case 'ollama': {
      // Alias: provider-specific wrapper for ai_chat_model
      const model = getStringProperty(config, 'model', 'qwen2.5:14b-instruct-q4_K_M');
      const prompt = getStringProperty(config, 'prompt', '');
      const nextConfig = {
        ...config,
        provider: 'ollama',
        model,
        prompt,
      };
      // ✅ CRITICAL: avoid re-entering dynamic executor (prevents infinite/log spam loop)
      // Calling executeNode() from inside executeNodeLegacy() causes:
      // DynamicExecutor → Registry.execute → executeNodeLegacy('ollama') → executeNode() → DynamicExecutor → ...
      // Instead, call executeNodeLegacy directly with an ai_chat_model node config.
      // IMPORTANT: executeNodeLegacy() uses unifiedNormalizeNodeType(node) which prefers top-level node.type.
      // So we must set BOTH node.type and node.data.type to the canonical type to avoid recursion.
      const nextNode = {
        ...node,
        type: 'ai_chat_model',
        data: { ...node.data, type: 'ai_chat_model', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'text_summarizer': {
      // Alias: convenience wrapper over ai_chat_model
      const text = getStringProperty(config, 'text', '');
      const maxLength = getStringProperty(config, 'maxLength', '');
      const prompt = `Summarize the following text${maxLength ? ` in <= ${maxLength} words` : ''}:\n\n${text}`;
      const nextConfig = {
        ...config,
        provider: 'ollama',
        prompt,
      };
      const nextNode = {
        ...node,
        type: 'ai_chat_model',
        data: { ...node.data, type: 'ai_chat_model', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'sentiment_analyzer': {
      // Minimal sentiment analyzer via ai_chat_model
      const text = getStringProperty(config, 'text', '');
      const prompt = `Analyze the sentiment of the following text. Return JSON with keys: sentiment (positive|neutral|negative), score (0-1), summary.\n\nText:\n${text}`;
      const nextConfig = { ...config, provider: 'ollama', prompt, responseFormat: 'json' };
      const nextNode = {
        ...node,
        type: 'ai_chat_model',
        data: { ...node.data, type: 'ai_chat_model', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'ai_service': {
      // Generic AI Service wrapper → ai_chat_model
      const prompt = getStringProperty(config, 'prompt', '');
      const inputData = getStringProperty(config, 'inputData', '');
      const serviceType = getStringProperty(config, 'serviceType', 'summarize');
      const provider = getStringProperty(config, 'provider', 'ollama') as any;
      const model = getStringProperty(config, 'model', '');
      const temperature = getStringProperty(config, 'temperature', '0.7');
      const maxTokens = getStringProperty(config, 'maxTokens', '500');
      const effectivePrompt = prompt || (inputData ? `${serviceType.toUpperCase()}:\n${inputData}` : '');
      const nextConfig = {
        ...config,
        provider,
        ...(model ? { model } : {}),
        temperature,
        maxTokens,
        prompt: effectivePrompt,
      };
      const nextNode = {
        ...node,
        type: 'ai_chat_model',
        data: { ...node.data, type: 'ai_chat_model', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'google_veo': {
      // Google Veo video generation node
      // Handles asynchronous video generation: start job → poll → return video URL
      
      const apiKey = getStringProperty(config, 'apiKey', '');
      const prompt = getStringProperty(config, 'prompt', '');
      const duration = getNumberProperty(config, 'duration', 60);
      const style = getStringProperty(config, 'style', 'realistic');
      const resolution = getStringProperty(config, 'resolution', '1080p');
      const pollInterval = getNumberProperty(config, 'pollInterval', 5);
      const timeout = getNumberProperty(config, 'timeout', 300);

      // Resolve prompt template variables
      const execContext = createTypedContext();
      const resolvedPrompt = typeof resolveWithSchema(prompt, execContext, 'string') === 'string'
        ? resolveWithSchema(prompt, execContext, 'string') as string
        : String(resolveTypedValue(prompt, execContext));

      if (!apiKey || apiKey.trim() === '') {
        throw new Error('Google Veo API key is required');
      }

      if (!resolvedPrompt || resolvedPrompt.trim() === '') {
        throw new Error('Prompt is required for video generation');
      }

      // Google Veo API endpoints
      // Note: Direct Google Veo API is not publicly available yet
      // Using Fal.ai as intermediary (recommended) or configurable endpoint
      const useFalRun = getStringProperty(config, 'useFalRun', 'true').toLowerCase() === 'true';
      const GENERATE_ENDPOINT = process.env.GOOGLE_VEO_GENERATE_ENDPOINT || 
        (useFalRun ? 'https://fal.run/fal-ai/veo3' : 'https://generativelanguage.googleapis.com/v1beta/models/veo-3:generateVideo');
      const STATUS_ENDPOINT = process.env.GOOGLE_VEO_STATUS_ENDPOINT || 
        (useFalRun ? 'https://queue.fal.run/fal-ai/veo3' : 'https://generativelanguage.googleapis.com/v1beta/models/veo-3/jobs');

      // Step 1: Start video generation job
      console.log(`[Google Veo] Starting video generation job using ${useFalRun ? 'Fal.run' : 'Google AI Studio'}...`);
      console.log(`[Google Veo] Endpoint: ${GENERATE_ENDPOINT}`);
      
      // Prepare request body based on provider
      let requestBody: any;
      let requestHeaders: Record<string, string>;
      
      if (useFalRun) {
        // Fal.ai API format
        // Fal.ai can use Authorization header or query parameter
        // We'll use both: header for standard auth, query param as additional auth
        const cleanApiKey = apiKey.trim();
        
        // IMPORTANT: Fal.ai Veo3 has a maximum duration of 8 seconds
        // Enforce this limit and warn user if they requested more
        const maxDuration = 8;
        const actualDuration = Math.min(duration, maxDuration);
        
        if (duration > maxDuration) {
          console.warn(`[Google Veo] Duration ${duration}s exceeds Veo3 maximum of ${maxDuration}s. Using ${maxDuration}s instead.`);
          console.warn(`[Google Veo] To create longer videos, generate multiple 8-second segments and combine them.`);
        }
        
        // Use Authorization header
        requestHeaders = {
          'Authorization': `Key ${cleanApiKey}`, // Fal.ai uses "Key" prefix
          'Content-Type': 'application/json',
        };
        
        requestBody = {
          prompt: resolvedPrompt,
          duration_seconds: actualDuration, // Use capped duration
          aspect_ratio: resolution === '4k' ? '16:9' : resolution === '1080p' ? '16:9' : '9:16',
        };
      } else {
        // Google AI Studio format (if available)
        requestHeaders = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
        requestBody = {
          prompt: resolvedPrompt,
          duration,
          style,
          resolution,
        };
      }

      // For Fal.ai, try with query parameter if using Fal.ai
      const finalGenerateEndpoint = useFalRun 
        ? `${GENERATE_ENDPOINT}?key=${encodeURIComponent(apiKey.trim())}`
        : GENERATE_ENDPOINT;
      
      const generateResponse = await fetch(finalGenerateEndpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        let errorMessage = `Google Veo API error: ${generateResponse.status} ${generateResponse.statusText}. ${errorText}`;
        
        // Provide helpful error messages
        if (generateResponse.status === 404) {
          errorMessage += '\n\n💡 TIP: Google Veo API endpoint may not be available. Try using Fal.ai instead:\n' +
            '1. Get API key from https://fal.ai\n' +
            '2. Set "Use Fal.run" to true in node configuration\n' +
            '3. Use your Fal.ai API key';
        } else if (generateResponse.status === 401 || generateResponse.status === 403) {
          errorMessage += '\n\n💡 TIP: Authentication failed. Please check:\n' +
            '1. Your API key is correct (get it from https://fal.ai/dashboard)\n' +
            '2. Your Fal.ai account has access to Veo3 model\n' +
            '3. Your API key is not expired\n' +
            '4. Make sure "Use Fal.run" is enabled if using Fal.ai';
        }
        
        throw new Error(errorMessage);
      }

      const generateResult = await generateResponse.json() as any;
      
      // Log the full response for debugging
      console.log('[Google Veo] API Response:', JSON.stringify(generateResult, null, 2));
      
      // Check if Fal.ai returned the video directly (synchronous response)
      // Fal.ai veo3 often returns video immediately without async job
      const directVideoUrl = generateResult.video?.url || 
                            generateResult.video_url || 
                            generateResult.url ||
                            (generateResult.output && generateResult.output.video?.url) ||
                            (generateResult.output && generateResult.output.url);
      
      if (directVideoUrl) {
        // Video returned immediately - no polling needed
        console.log('[Google Veo] Video generated synchronously, returning immediately');
        return {
          videoUrl: directVideoUrl,
          jobId: 'synchronous',
          status: 'completed',
          duration: duration,
          resolution: resolution,
        };
      }
      
      // Fal.ai can return job ID in various formats for async operations
      const jobId = generateResult.jobId || 
                    generateResult.id || 
                    generateResult.request_id || 
                    generateResult.requestId ||
                    generateResult.ref ||
                    generateResult.ref_id ||
                    (generateResult.request && generateResult.request.ref) ||
                    (generateResult.data && generateResult.data.ref);

      if (!jobId) {
        // Check if there's a video URL in the response (some formats)
        if (generateResult.video?.url || generateResult.url) {
          const videoUrl = generateResult.video?.url || generateResult.url;
          console.log('[Google Veo] Video found in response, returning immediately');
          return {
            videoUrl,
            jobId: 'immediate',
            status: 'completed',
            duration: duration,
            resolution: resolution,
          };
        }
        
        // Provide detailed error with actual response
        const responseStr = JSON.stringify(generateResult, null, 2);
        throw new Error(`Failed to get job ID from API response. Response: ${responseStr}\n\n💡 TIP: Check if the API response format matches expected format. For Fal.ai, the job ID might be in a different field, or the video might be returned directly.`);
      }

      console.log(`[Google Veo] Job started with ID: ${jobId}`);

      // Step 2: Poll for completion
      const startTime = Date.now();
      const timeoutMs = timeout * 1000;
      let status = 'processing';
      let videoUrl: string | null = null;
      let finalStatus: string = 'processing';
      let finalDuration: number = duration;
      let finalResolution: string = resolution;

      while (status === 'processing' || status === 'pending' || status === 'queued') {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Video generation timed out after ${timeout} seconds. Job ID: ${jobId}`);
        }

        // Wait before polling
        await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));

        // Check job status
        // Fal.ai uses different endpoint format for status checks
        const statusUrlBase = useFalRun 
          ? `https://queue.fal.run/fal-ai/veo3/${jobId}` 
          : `${STATUS_ENDPOINT}/${jobId}`;
        
        // For Fal.ai, add API key as query parameter
        const statusUrl = useFalRun
          ? `${statusUrlBase}?key=${encodeURIComponent(apiKey.trim())}`
          : statusUrlBase;
        
        const statusHeaders = useFalRun
          ? {
              'Authorization': `Key ${apiKey.trim()}`,
              'Content-Type': 'application/json',
            }
          : {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            };

        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: statusHeaders,
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          throw new Error(`Failed to check job status: ${statusResponse.status} ${statusResponse.statusText}. ${errorText}`);
        }

        const statusResult = await statusResponse.json() as any;
        
        // Log status response for debugging
        console.log(`[Google Veo] Status Response for ${jobId}:`, JSON.stringify(statusResult, null, 2));
        
        // Extract status from various possible formats
        const statusResultTyped = {
          status: statusResult.status,
          state: statusResult.state,
          status_code: statusResult.status_code,
          statusCode: statusResult.statusCode,
          status_type: statusResult.status_type,
          videoUrl: statusResult.videoUrl || statusResult.video_url || statusResult.url,
          video: statusResult.video,
          videos: statusResult.videos,
          output: statusResult.output, // Fal.ai often uses 'output' field
          error: statusResult.error,
          message: statusResult.message,
          duration: statusResult.duration,
          resolution: statusResult.resolution,
        };
        
        // Handle different status formats
        if (useFalRun) {
          // Fal.ai uses various status formats
          status = statusResultTyped.status_code || 
                   statusResultTyped.statusCode || 
                   statusResultTyped.status_type ||
                   statusResultTyped.status || 
                   'IN_PROGRESS';
          
          // Normalize Fal.ai status values
          const statusUpper = String(status).toUpperCase();
          if (statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS' || statusUpper === 'DONE') {
            status = 'completed';
          } else if (statusUpper === 'IN_PROGRESS' || statusUpper === 'IN_QUEUE' || statusUpper === 'PROCESSING' || statusUpper === 'QUEUED') {
            status = 'processing';
          } else if (statusUpper === 'FAILED' || statusUpper === 'ERROR') {
            status = 'failed';
          }
        } else {
          status = statusResultTyped.status || statusResultTyped.state || 'processing';
        }
        finalStatus = status;

        console.log(`[Google Veo] Job ${jobId} status: ${status}`);

        if (status === 'completed' || status === 'success' || status === 'COMPLETED') {
          // Handle different response formats
          if (useFalRun) {
            // Fal.ai can return video in different formats
            // Check output field first (common in Fal.ai)
            if (statusResultTyped.output?.video?.url) {
              videoUrl = statusResultTyped.output.video.url;
            } else if (statusResultTyped.output?.url) {
              videoUrl = statusResultTyped.output.url;
            } else if (statusResultTyped.video?.url) {
              videoUrl = statusResultTyped.video.url;
            } else if (statusResultTyped.videos && Array.isArray(statusResultTyped.videos) && statusResultTyped.videos.length > 0) {
              videoUrl = statusResultTyped.videos[0].url || statusResultTyped.videos[0];
            } else {
              videoUrl = statusResultTyped.videoUrl || null;
            }
          } else {
            videoUrl = statusResultTyped.videoUrl || null;
          }
          
          if (statusResult.duration) finalDuration = statusResult.duration;
          if (statusResult.resolution) finalResolution = statusResult.resolution;
          
          if (!videoUrl) {
            throw new Error('Video generation completed but no video URL was returned');
          }
          break;
        }

        if (status === 'failed' || status === 'error') {
          const errorMessage = statusResultTyped.error || 
                              statusResultTyped.message || 
                              (statusResultTyped.output && statusResultTyped.output.error) ||
                              'Video generation failed';
          throw new Error(`Video generation failed: ${errorMessage}`);
        }
      }

      if (!videoUrl) {
        throw new Error(`Video generation did not complete. Final status: ${finalStatus}`);
      }

      console.log(`[Google Veo] Video generation completed. URL: ${videoUrl}`);

      // Step 3: Return result
      return {
        videoUrl,
        jobId,
        status: finalStatus,
        duration: finalDuration,
        resolution: finalResolution,
      };
    }

    case 'ai_agent': {
      // AI Agent node with port-specific inputs
      // Input structure: { chat_model: {...}, memory: {...}, tool: {...}, userInput: {...} }
      
      // CRITICAL: Detect chatbot workflow at runtime by checking workflow structure
      // Get all nodes from the workflow to check if there's a chat_trigger
      let isChatbotWorkflow = false;
      try {
        const { data: workflowData } = await supabase
          .from('workflows')
          .select('nodes')
          .eq('id', workflowId)
          .single();
        
        if (workflowData?.nodes) {
          const nodes = Array.isArray(workflowData.nodes) ? workflowData.nodes : [];
          isChatbotWorkflow = nodes.some((n: any) => n.type === 'chat_trigger' || n.data?.type === 'chat_trigger');
        }
      } catch (error) {
        console.warn('[AI Agent] Could not check workflow structure for chatbot detection:', error);
      }
      
      // CRITICAL: Check if this is a chatbot workflow by looking at the system prompt OR workflow structure
      // Chatbot workflows have a specific system prompt that mentions "chatbot assistant"
      let defaultSystemPrompt = 'You are an autonomous intelligent agent inside an automation workflow.';
      const configSystemPrompt = getStringProperty(config, 'systemPrompt', '');
      
      // If workflow has chat_trigger OR system prompt mentions chatbot, use chatbot-specific prompt
      if (isChatbotWorkflow || 
          configSystemPrompt.toLowerCase().includes('chatbot') || 
          configSystemPrompt.toLowerCase().includes('chat bot') ||
          configSystemPrompt.toLowerCase().includes('conversational')) {
        defaultSystemPrompt = 'You are a helpful and friendly chatbot assistant. Your role is to have natural conversations with users.\n\n' +
          'CRITICAL RULES:\n' +
          '1. When a user sends you a message, respond DIRECTLY to that message in a conversational way.\n' +
          '2. Do NOT explain how workflows work, do NOT describe workflow structures, and do NOT provide technical explanations about automation.\n' +
          '3. Do NOT analyze JSON objects or data structures - just respond to the user\'s message as if you are having a friendly chat.\n' +
          '4. If you receive a simple greeting like "Hello", respond with a friendly greeting like "Hi! How can I help you today?"\n' +
          '5. Keep responses concise (1-3 sentences), helpful, and engaging.\n' +
          '6. Be conversational and natural - act like a helpful assistant, not a technical documentation generator.\n\n' +
          'Example: If user says "Hello", respond with "Hi! How can I help you today?" NOT with explanations about workflows or JSON structures.';
        
        if (isChatbotWorkflow && !configSystemPrompt) {
          console.log('[AI Agent] ✅ Chatbot workflow detected at runtime - applying chatbot system prompt');
        }
      }
      
      const systemPrompt = configSystemPrompt || defaultSystemPrompt;
      const mode = getStringProperty(config, 'mode', 'chat');
      const temperature = parseFloat(getStringProperty(config, 'temperature', '0.7')) || 0.7;
      const maxTokens = parseInt(getStringProperty(config, 'maxTokens', '2000'), 10) || 2000;
      const topP = parseFloat(getStringProperty(config, 'topP', '1.0')) || 1.0;
      const frequencyPenalty = parseFloat(getStringProperty(config, 'frequencyPenalty', '0.0')) || 0.0;
      const presencePenalty = parseFloat(getStringProperty(config, 'presencePenalty', '0.0')) || 0.0;
      const timeoutLimit = parseInt(getStringProperty(config, 'timeoutLimit', '30000'), 10) || 30000;
      const retryCount = parseInt(getStringProperty(config, 'retryCount', '3'), 10) || 3;
      const outputFormat = getStringProperty(config, 'outputFormat', 'text');
      const includeReasoning = getStringProperty(config, 'includeReasoning', 'false') === 'true';
      const enableMemory = getStringProperty(config, 'enableMemory', 'true') !== 'false';
      const enableTools = getStringProperty(config, 'enableTools', 'true') !== 'false';
      
      // Extract port-specific inputs from inputObj
      const chatModelConfig = (inputObj as any)?.chat_model || {};
      const memoryData = (inputObj as any)?.memory;
      const toolData = (inputObj as any)?.tool || (inputObj as any)?.tools;
      let userInput = (inputObj as any)?.userInput || (inputObj as any)?.input || inputObj;
      
      // CRITICAL: For chatbot workflows, extract the message text from the userInput object
      // Chat trigger outputs: { message: "Hello", trigger: "chat", ... }
      // We need to extract just the message text for the AI to respond to
      // This is MANDATORY for chatbot workflows to work correctly
      const originalUserInput = userInput;
      if (typeof userInput === 'object' && userInput !== null) {
        const userInputObj = userInput as any;
        
        // Priority 1: Check if it's a chat trigger output (has 'message' field)
        if (userInputObj.message && typeof userInputObj.message === 'string') {
          console.log(`[AI Agent] ✅ Extracted message from userInput.message: "${userInputObj.message}"`);
          userInput = userInputObj.message;
        }
        // Priority 2: Check for other common message field names
        else if (userInputObj.text && typeof userInputObj.text === 'string') {
          console.log(`[AI Agent] ✅ Extracted text from userInput.text: "${userInputObj.text}"`);
          userInput = userInputObj.text;
        }
        // Priority 3: If it's an object but no message field, try to extract meaningful text
        else if (userInputObj.userInput && typeof userInputObj.userInput === 'string') {
          console.log(`[AI Agent] ✅ Extracted userInput from nested object: "${userInputObj.userInput}"`);
          userInput = userInputObj.userInput;
        }
        // Priority 4: If still an object, try to find any string field that might be the message
        else {
          console.warn(`[AI Agent] ⚠️ userInput is an object but no message field found. Keys: ${Object.keys(userInputObj).join(', ')}`);
          // Try to find any string field that might be the message
          let found = false;
          for (const key of ['message', 'text', 'input', 'content', 'query', 'prompt', 'userInput']) {
            if (userInputObj[key] && typeof userInputObj[key] === 'string') {
              console.log(`[AI Agent] ✅ Found message in field "${key}": "${userInputObj[key]}"`);
              userInput = userInputObj[key];
              found = true;
              break;
            }
          }
          
          // If still not found and this is a chatbot workflow, try to extract from nested objects
          if (!found && isChatbotWorkflow) {
            console.warn(`[AI Agent] ⚠️ Could not extract message from userInput object. Original:`, JSON.stringify(originalUserInput).substring(0, 200));
            // Last resort: if it's a chatbot and we can't find the message, use the first string value
            for (const key in userInputObj) {
              if (typeof userInputObj[key] === 'string' && userInputObj[key].length > 0) {
                console.log(`[AI Agent] ✅ Using first string field "${key}" as message: "${userInputObj[key]}"`);
                userInput = userInputObj[key];
                found = true;
                break;
              }
            }
          }
        }
      }
      
      // Final check: ensure userInput is a string
      if (typeof userInput !== 'string') {
        console.warn(`[AI Agent] userInput is not a string after extraction: ${typeof userInput}. Converting to string.`);
        userInput = typeof userInput === 'object' ? JSON.stringify(userInput) : String(userInput);
      }
      
      // Determine provider and model from chat_model connection or config
      // Default to Ollama for production (Qwen 2.5 14B)
      let provider: 'openai' | 'claude' | 'gemini' | 'ollama' = 'ollama';
      let model = 'qwen2.5:14b-instruct-q4_K_M';
      let apiKey: string | undefined;
      
      if (chatModelConfig.provider) {
        provider = chatModelConfig.provider as any;
      } else if (chatModelConfig.model) {
        provider = LLMAdapter.detectProvider(chatModelConfig.model);
      }
      
      // Default to Ollama production model if not specified
      model = chatModelConfig.model || getStringProperty(config, 'model', 'qwen2.5:14b-instruct-q4_K_M');
      
      // Only get API key if using external providers (not Ollama)
      if (provider !== 'ollama') {
      apiKey = chatModelConfig.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
      }
      
      // Build messages array
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      
      // ✅ REFACTORED: AI Agent with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      // System prompt is always string
      const resolvedSystemPrompt = typeof resolveWithSchema(systemPrompt, execContext, 'string') === 'string'
        ? resolveWithSchema(systemPrompt, execContext, 'string') as string
        : String(resolveTypedValue(systemPrompt, execContext));
      messages.push({ role: 'system', content: resolvedSystemPrompt });
      
      // Add memory context if available
      if (enableMemory && memoryData) {
        if (Array.isArray(memoryData.messages)) {
          // Add conversation history
          memoryData.messages.forEach((msg: any) => {
            if (msg.role && msg.content) {
              messages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.content
              });
            }
          });
        } else if (memoryData.context) {
          messages.push({
            role: 'system',
            content: `Previous context: ${JSON.stringify(memoryData.context)}`
          });
        }
      }
      
      // Add user input - should already be extracted to just the message text
      // Log what we're sending to help debug
      console.log(`[AI Agent] Final userInput before sending to LLM:`, 
        typeof userInput === 'string' ? userInput : JSON.stringify(userInput).substring(0, 200));
      
      const userInputStr = typeof userInput === 'string' ? userInput : JSON.stringify(userInput);
      messages.push({ role: 'user', content: userInputStr });
      
      // Log the full message array for debugging (truncated)
      console.log(`[AI Agent] Full messages array being sent to LLM:`, 
        messages.map(m => ({
          role: m.role,
          content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '')
        })));
      
      // Execute LLM call with timeout
      const llmAdapter = new LLMAdapter();
      let response;
      let attempts = 0;
      let lastError: Error | null = null;
      
      while (attempts <= retryCount) {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeoutLimit)
          );
          
          const llmPromise = llmAdapter.chat(provider, messages, {
            model,
            temperature,
            maxTokens,
            apiKey,
          });
          
          response = await Promise.race([llmPromise, timeoutPromise]) as any;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          attempts++;
          if (attempts > retryCount) {
            throw lastError;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
      
      if (!response) {
        throw lastError || new Error('Failed to get response from LLM');
      }
      
      // Process tool calls if enabled and tools are available
      let usedTools: any[] = [];
      let finalResponse = response.content;
      
      if (enableTools && toolData) {
        // Simple tool execution - in a full implementation, this would parse tool calls from response
        // and execute them, then continue the conversation
        if (Array.isArray(toolData)) {
          usedTools = toolData;
        } else if (toolData.tools) {
          usedTools = Array.isArray(toolData.tools) ? toolData.tools : [];
        }
      }
      
      // Format output based on outputFormat
      let formattedOutput: any = {
        response_text: finalResponse,
        response_json: null,
        confidence_score: 0.8, // Default confidence
        used_tools: usedTools,
        memory_written: false,
        error_flag: false,
        error_message: null,
      };
      
      if (outputFormat === 'json') {
        try {
          formattedOutput.response_json = JSON.parse(finalResponse);
        } catch {
          // If not valid JSON, wrap it
          formattedOutput.response_json = { content: finalResponse };
        }
      } else if (outputFormat === 'keyvalue') {
        // Try to parse key-value pairs
        const lines = finalResponse.split('\n');
        const kv: Record<string, string> = {};
        lines.forEach((line: string) => {
          const match = line.match(/^([^:]+):\s*(.+)$/);
          if (match) {
            kv[match[1].trim()] = match[2].trim();
          }
        });
        formattedOutput.response_json = kv;
      } else if (outputFormat === 'markdown') {
        formattedOutput.response_markdown = finalResponse;
      }
      
      if (includeReasoning) {
        formattedOutput.reasoning = {
          steps: 1,
          mode,
          provider,
          model: response.model,
        };
      }
      
      // Store in memory if enabled
      if (enableMemory && memoryData && memoryData.sessionId) {
        try {
          // In a full implementation, this would use the memory service
          formattedOutput.memory_written = true;
        } catch (error) {
          console.error('Failed to write memory:', error);
        }
      }
      
      // CRITICAL: Auto-send AI agent response to chat UI if this is a chatbot workflow
      if (isChatbotWorkflow) {
        try {
          // Use static sessionId format: ${workflowId}_${nodeId}
          // Find the chat trigger node to get the nodeId
          let chatSessionId: string | null = null;
          let chatTriggerNodeId: string | null = null;
          
          // First, try to find chat_trigger node in the workflow
          const allOutputs = nodeOutputs.getAll();
          for (const [nodeId, output] of Object.entries(allOutputs)) {
            if (output && typeof output === 'object' && output !== null) {
              const outputObj = output as any;
              // Check if this node is a chat_trigger by looking at its type
              // We need to find the actual node in the workflow nodes array
              // For now, check if output has sessionId (from chat trigger)
              if (outputObj.sessionId && typeof outputObj.sessionId === 'string') {
                chatSessionId = outputObj.sessionId;
                chatTriggerNodeId = nodeId;
                console.log(`[AI Agent] ✅ Found sessionId from chat_trigger node ${nodeId}: ${chatSessionId}`);
                break;
              }
            }
          }
          
          // Also check inputObj for sessionId (might be passed through from chat trigger)
          if (!chatSessionId && inputObj && typeof inputObj === 'object') {
            const inputObjAny = inputObj as any;
            if (inputObjAny.sessionId && typeof inputObjAny.sessionId === 'string') {
              chatSessionId = inputObjAny.sessionId;
              // Try to extract nodeId from input
              if (inputObjAny.node_id) {
                chatTriggerNodeId = inputObjAny.node_id;
              }
              console.log(`[AI Agent] ✅ Found sessionId from inputObj: ${chatSessionId}`);
            }
          }
          
          // If we still don't have sessionId, try to construct it using static format
          // This requires finding the chat trigger node in the workflow
          if (!chatSessionId) {
            // Get workflow nodes from context (we need to pass this through)
            // For now, try to use workflowId and find chat trigger node
            // The sessionId format is: ${workflowId}_${nodeId}
            // We need to find the chat trigger nodeId
            try {
              // Try to get nodes from the execution context
              // Since we're in executeNode, we don't have direct access to all nodes
              // But we can check if input has workflow_id and node_id
              if (inputObj && typeof inputObj === 'object') {
                const inputObjAny = inputObj as any;
                if (inputObjAny.workflow_id && inputObjAny.node_id) {
                  chatSessionId = `${inputObjAny.workflow_id}_${inputObjAny.node_id}`;
                  chatTriggerNodeId = inputObjAny.node_id;
                  console.log(`[AI Agent] ✅ Constructed sessionId using static format: ${chatSessionId}`);
                }
              }
            } catch (err) {
              console.warn('[AI Agent] Could not construct sessionId from input:', err);
            }
          }
          
          // If we have a sessionId and a response, send it to chat UI
          if (chatSessionId && formattedOutput.response_text) {
            try {
              const { getChatServer } = require('../services/chat/chat-server');
              const chatServer = getChatServer();
              
              const sent = chatServer.sendToSession(chatSessionId, {
                type: 'chat',
                message: formattedOutput.response_text,
              });
              
              if (sent) {
                console.log(`[AI Agent] ✅ Auto-sent response to chat UI (sessionId: ${chatSessionId}): ${formattedOutput.response_text.substring(0, 100)}...`);
                // Add metadata to output
                formattedOutput._chatSent = true;
                formattedOutput._chatSessionId = chatSessionId;
              } else {
                console.warn(`[AI Agent] ⚠️ Failed to send response to chat UI. Session ${chatSessionId} may not be connected.`);
              }
            } catch (chatError: any) {
              console.error('[AI Agent] Error sending response to chat UI:', chatError?.message || chatError);
              // Don't fail the node execution if chat sending fails
            }
          } else {
            if (!chatSessionId) {
              console.warn('[AI Agent] ⚠️ Chatbot workflow detected but no sessionId found. Cannot auto-send to chat UI.');
              console.warn('[AI Agent] Input object keys:', inputObj && typeof inputObj === 'object' ? Object.keys(inputObj) : 'N/A');
            }
            if (!formattedOutput.response_text) {
              console.warn('[AI Agent] ⚠️ No response_text in AI agent output to send to chat UI.');
            }
          }
        } catch (error: any) {
          console.error('[AI Agent] Error in auto-chat sending logic:', error?.message || error);
          // Don't fail the node execution if chat sending fails
        }
      }
      
      return formattedOutput;
    }

    case 'memory': {
      // Memory node - provides memory context to AI Agent nodes.
      // For now, it's a passthrough container. Agent consumes `memory.messages` or `memory.context`.
      const sessionId = getStringProperty(config, 'sessionId', '') || getStringProperty(config, 'session_id', '');
      const context = getStringProperty(config, 'context', '');
      return {
        sessionId: sessionId || `mem_${node.id}`,
        context: context || (inputObj as any).context || null,
        messages: (inputObj as any).messages || [],
      };
    }

    case 'tool': {
      // Tool node - provides tool metadata to AI Agent nodes.
      // Execution engine does not run the tool here; AI Agent reads available tools.
      const toolName = getStringProperty(config, 'toolName', '') || getStringProperty(config, 'name', '');
      const description = getStringProperty(config, 'description', '');
      const schemaJson = getStringProperty(config, 'schema', '{}');
      let schema: any = {};
      try {
        schema = JSON.parse(schemaJson);
      } catch {
        schema = {};
      }
      return {
        toolName,
        description,
        schema,
      };
    }

    case 'schedule': {
      // ✅ OPTIMIZED: Schedule trigger - return clean output with just timestamp
      // Schedule triggers run at specific times, return execution timestamp
      return {
        executed_at: new Date().toISOString(),
        ...(inputObj && Object.keys(inputObj).length > 0 ? inputObj : {}),
      };
    }

    case 'interval': {
      // ✅ OPTIMIZED: Interval trigger - return clean output with just timestamp
      // Interval triggers run at fixed intervals, return execution timestamp
      return {
        executed_at: new Date().toISOString(),
        ...(inputObj && Object.keys(inputObj).length > 0 ? inputObj : {}),
      };
    }

    case 'form':
    case 'form_trigger': {
      // ✅ OPTIMIZED: Form trigger - return only the data object (form field values)
      // This matches the Form node implementation - return clean form data
      return inputObj.data || {};
    }

    case 'workflow_trigger': {
      // ✅ OPTIMIZED: Workflow trigger - return clean output with just the payload from source workflow
      // When triggered from another workflow, return the actual payload passed, not metadata
      // Remove trigger metadata and return just the data
      const { trigger, workflow_id, source_workflow_id, executed_at, ...payload } = inputObj;
      return payload && Object.keys(payload).length > 0 ? payload : {};
    }

    case 'error_trigger': {
      // ✅ OPTIMIZED: Error trigger - return clean output with just error details
      // Error triggers need error info, but return it in a clean format
      const errorOutput: Record<string, unknown> = {
        failed_node: inputObj.failed_node || null,
        error_message: inputObj.error_message || '',
        error_type: inputObj.error_type || 'unknown',
      };
      if (inputObj.error_stack) {
        errorOutput.error_stack = inputObj.error_stack;
      }
      if (inputObj.node_output) {
        errorOutput.node_output = inputObj.node_output;
      }
      return errorOutput;
    }

    case 'http_request': {
      // ✅ REFACTORED: HTTP Request node with typed resolution
      // HTTP Request node: Returns response object directly
      const method = getStringProperty(config, 'method', 'GET').toUpperCase();
      const url = getStringProperty(config, 'url', '');
      const headersJson = getStringProperty(config, 'headers', '{}');
      
      // ✅ CRITICAL FIX: Body can be an object (from PropertiesPanel JSON parsing) or a string
      // Don't use getStringProperty for body - it returns empty string for objects!
      // Directly access config.body to preserve object type
      let bodyJson: any = config.body;
      if (bodyJson === undefined || bodyJson === null) {
        bodyJson = '';
      } else if (typeof bodyJson === 'string') {
        // Already a string, keep it
      } else if (typeof bodyJson === 'object') {
        // Already an object, keep it (will be stringified later)
      } else {
        // Convert other types to string
        bodyJson = String(bodyJson);
      }
      
      const timeout = parseInt(getStringProperty(config, 'timeout', '30000'), 10) || 30000;
      
      if (!url) {
        return {
          ...inputObj,
          _error: 'HTTP Request node: URL is required',
        };
      }

      // Use typed execution context
      const execContext = createTypedContext();
      
      // URLs are always strings
      const resolvedUrl = typeof resolveWithSchema(url, execContext, 'string') === 'string'
        ? resolveWithSchema(url, execContext, 'string') as string
        : String(resolveTypedValue(url, execContext));
      
      let headers: Record<string, string> = {};
      let body: string | undefined;

      try {
        // Headers JSON resolution
        const resolvedHeadersStr = typeof resolveWithSchema(headersJson, execContext, 'string') === 'string'
          ? resolveWithSchema(headersJson, execContext, 'string') as string
          : String(resolveTypedValue(headersJson, execContext));
        headers = JSON.parse(resolvedHeadersStr);
      } catch {
        // If headers is not JSON, try as string
        const resolvedHeaders = typeof resolveWithSchema(headersJson, execContext, 'string') === 'string'
          ? resolveWithSchema(headersJson, execContext, 'string') as string
          : String(resolveTypedValue(headersJson, execContext));
        if (resolvedHeaders) {
          try {
            headers = JSON.parse(resolvedHeaders);
          } catch {
            // Default headers
            headers = { 'Content-Type': 'application/json' };
          }
        }
      }

      if (bodyJson && ['POST', 'PUT', 'PATCH'].includes(method)) {
        // ✅ CRITICAL FIX: Handle body as both object and string
        // Body can be:
        // 1. An object (from PropertiesPanel JSON parsing) - stringify directly
        // 2. A string (JSON string or template) - resolve templates then parse/stringify
        // 3. Empty/null - skip body
        
        if (typeof bodyJson === 'object' && bodyJson !== null && !Array.isArray(bodyJson)) {
          // Already an object - stringify directly (no template resolution needed for objects)
          body = JSON.stringify(bodyJson);
          console.log('[HTTP Request] ✅ Body is object, stringifying:', JSON.stringify(bodyJson).substring(0, 200));
        } else {
          // String or other type - resolve templates first
          const resolvedBodyRaw = resolveTypedValue(bodyJson, execContext);
          if (typeof resolvedBodyRaw === 'object' && resolvedBodyRaw !== null) {
            // Resolved to object - stringify
            body = JSON.stringify(resolvedBodyRaw);
            console.log('[HTTP Request] ✅ Body resolved to object, stringifying:', JSON.stringify(resolvedBodyRaw).substring(0, 200));
          } else {
            // Resolved to string - try to parse as JSON, then stringify
            const resolvedBody = String(resolvedBodyRaw);
            if (resolvedBody.trim() === '') {
              body = undefined; // Empty string = no body
            } else {
              try {
                // Try to parse as JSON first
                const parsed = JSON.parse(resolvedBody);
                body = JSON.stringify(parsed);
                console.log('[HTTP Request] ✅ Body parsed from JSON string:', JSON.stringify(parsed).substring(0, 200));
              } catch {
                // Not valid JSON - use as plain string
                body = resolvedBody;
                console.log('[HTTP Request] ⚠️ Body is plain string (not JSON):', resolvedBody.substring(0, 200));
              }
            }
          }
        }
      } else {
        console.log('[HTTP Request] ⚠️ Body not sent - method:', method, 'bodyJson:', bodyJson ? 'exists' : 'empty');
      }

      try {
        // ✅ Reliability: provider rate limiting (in-memory fallback if Redis not configured)
        try {
          const { rateLimitManager } = await import('../services/workflow-executor/distributed/reliability/rate-limiter');
          // Conservative default for generic HTTP calls
          rateLimitManager.configure('http_request', { maxRequests: 30, windowMs: 60_000, burst: 10 });
          await rateLimitManager.waitForLimit('http_request');
        } catch (e) {
          // Non-fatal: if reliability layer deps aren't available, proceed without throttling
          console.warn('[http_request] Rate limiter unavailable (non-fatal):', e instanceof Error ? e.message : String(e));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(resolvedUrl, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        let responseData: unknown;

        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        // ✅ REFACTORED: HTTP node returns response object directly (not wrapped)
        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
          url: resolvedUrl,
        };
      } catch (error) {
        console.error('[HTTP Request] ❌ Fetch error:', error);
        
        // ✅ ENHANCED: Provide detailed error messages for common issues
        let errorMessage = 'HTTP Request failed';
        let errorDetails: Record<string, any> = {
          url: resolvedUrl,
          method,
        };
        
        if (error instanceof Error) {
          errorMessage = error.message;
          
          // Provide helpful context for common errors
          if (error.message.includes('fetch failed') || error.name === 'TypeError') {
            errorMessage = 'fetch failed - Network error. Check: 1) Internet connection, 2) URL is reachable, 3) CORS settings (if client-side), 4) SSL certificate validity';
            errorDetails.networkError = true;
            errorDetails.originalError = error.message;
          } else if (error.name === 'AbortError') {
            errorMessage = `Request timeout after ${timeout}ms. The server took too long to respond. Try increasing the timeout value.`;
            errorDetails.timeout = true;
            errorDetails.timeoutMs = timeout;
          } else if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Connection refused - Server is not reachable. Check if the URL is correct and the server is running.';
            errorDetails.connectionRefused = true;
          } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
            errorMessage = 'DNS resolution failed - Cannot resolve the domain name. Check if the URL is correct.';
            errorDetails.dnsError = true;
          } else if (error.message.includes('CERT') || error.message.includes('certificate')) {
            errorMessage = 'SSL/TLS certificate error - The server certificate is invalid or expired.';
            errorDetails.sslError = true;
          } else if (error.message.includes('CORS')) {
            errorMessage = 'CORS error - The server does not allow requests from this origin. This usually happens when running client-side.';
            errorDetails.corsError = true;
          }
        }
        
        return {
          ...inputObj,
          _error: errorMessage,
          url: resolvedUrl,
          method,
          errorDetails,
        };
      }
    }

    case 'http_post': {
      // Alias for http_request with POST method
      const nextConfig = { ...config, method: 'POST' };
      // Avoid re-entering dynamic executor from legacy executor.
      // Rewrite both node.type and node.data.type to the canonical node type.
      const nextNode = {
        ...node,
        type: 'http_request',
        data: { ...node.data, type: 'http_request', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'graphql': {
      // GraphQL node - wraps http_request for GraphQL POST
      const url = getStringProperty(config, 'url', '');
      const query = getStringProperty(config, 'query', '');
      const variablesJson = getStringProperty(config, 'variables', '{}');
      const headersJson = getStringProperty(config, 'headers', '{}');
      const execContext = createTypedContext();

      const resolvedQuery = typeof resolveWithSchema(query, execContext, 'string') === 'string'
        ? (resolveWithSchema(query, execContext, 'string') as string)
        : String(resolveTypedValue(query, execContext));
      const resolvedUrl = typeof resolveWithSchema(url, execContext, 'string') === 'string'
        ? (resolveWithSchema(url, execContext, 'string') as string)
        : String(resolveTypedValue(url, execContext));
      const resolvedVarsRaw = resolveTypedValue(variablesJson, execContext);
      let variables: any = {};
      try {
        variables = typeof resolvedVarsRaw === 'object' && resolvedVarsRaw !== null
          ? resolvedVarsRaw
          : JSON.parse(String(resolvedVarsRaw));
      } catch {
        variables = {};
      }

      const body = JSON.stringify({ query: resolvedQuery, variables });
      const nextConfig = { ...config, method: 'POST', url: resolvedUrl, headers: headersJson, body };
      const nextNode = {
        ...node,
        type: 'http_request',
        data: { ...node.data, type: 'http_request', config: nextConfig },
      } as any;
      return await executeNodeLegacy(
        nextNode,
        input,
        nodeOutputs,
        supabase,
        workflowId,
        userId,
        currentUserId
      );
    }

    case 'javascript': {
      // JavaScript code execution node
      // SECURITY FIX: Replaced eval() with vm2 sandbox for secure execution
      const code = getStringProperty(config, 'code', '');
      
      if (!code) {
        return {
          ...inputObj,
          _error: 'JavaScript node: Code is required',
        };
      }

      // Security: Check if JavaScript execution is enabled
      if (process.env.DISABLE_JAVASCRIPT_NODE === 'true') {
        return {
          ...inputObj,
          _error: 'JavaScript node execution is disabled for security reasons',
        };
      }

      // Get timeout from config (default 5 seconds)
      const timeout = parseInt(getStringProperty(config, 'timeout', '5000'), 10) || 5000;
      
      // Enforce maximum timeout limit (30 seconds)
      const maxTimeout = 30000;
      const safeTimeout = Math.min(timeout, maxTimeout);

      try {
        // Import vm2 for secure sandboxing
        const { VM } = require('vm2');
        
        // Create vm2 sandbox with strict security settings
        const vm = new VM({
          timeout: safeTimeout, // Execution timeout in milliseconds
          sandbox: {
            // Safe context variables (read-only copies)
            input: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj)); // Deep clone
              } catch {
                return inputObj; // Fallback if cloning fails
              }
            })(),
            $json: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj)); // Deep clone
              } catch {
                return inputObj; // Fallback if cloning fails
              }
            })(),
            json: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj)); // Deep clone
              } catch {
                return inputObj; // Fallback if cloning fails
              }
            })(),
            
            // Read-only access to nodeOutputs via getter function
            // This prevents direct modification of nodeOutputs
            getNodeOutput: (nodeId: string) => {
              const output = nodeOutputs.get(nodeId);
              if (output === null || output === undefined) {
                return undefined;
              }
              try {
                // Return deep clone to prevent modification
                // Note: We keep the existing deep clone logic here even though cache has cloneOnGet option
                // This ensures consistent behavior and handles edge cases
                return JSON.parse(JSON.stringify(output));
              } catch {
                // If circular reference or non-serializable, return undefined
                return undefined;
              }
            },
            
            // Safe built-in objects
            Math: Math,
            JSON: JSON,
            Date: Date,
            Array: Array,
            Object: Object,
            String: String,
            Number: Number,
            Boolean: Boolean,
            RegExp: RegExp,
            
            // Limited console for debugging
            console: {
              log: (...args: unknown[]) => console.log('[JS Node]', ...args),
              error: (...args: unknown[]) => console.error('[JS Node]', ...args),
              warn: (...args: unknown[]) => console.warn('[JS Node]', ...args),
            },
          },
          
          // Additional security settings
          eval: false, // Disable eval() inside sandbox
          wasm: false, // Disable WebAssembly
          fixAsync: true, // Fix async/await support
        });

        // Wrap user code in IIFE to ensure proper return handling
        // Provide both 'input' and '$input' for compatibility
        const wrappedCode = `
          (function() {
            const $input = input; // Alias for $input (n8n-style)
            const $json = input;  // Alias for $json (n8n-style)
            
            ${code}
            
            // If code doesn't return anything, return input
            return typeof result !== 'undefined' ? result : input;
          })()
        `;

        // Execute code in sandbox
        const result = vm.run(wrappedCode);
        
        // ✅ REFACTORED: JavaScript node with output schema validation
        // Validate output matches expected schema if provided
        const outputSchema = getStringProperty(config, 'outputSchema', '');
        if (outputSchema) {
          try {
            const schema = JSON.parse(outputSchema);
            // Basic schema validation - check type matches
            if (schema.type) {
              const expectedType = schema.type;
              const actualType = typeof result;
              
              // Type validation
              if (expectedType === 'number' && actualType !== 'number') {
                console.warn(`[JavaScript Node] Output type mismatch: expected ${expectedType}, got ${actualType}`);
              } else if (expectedType === 'string' && actualType !== 'string') {
                console.warn(`[JavaScript Node] Output type mismatch: expected ${expectedType}, got ${actualType}`);
              } else if (expectedType === 'boolean' && actualType !== 'boolean') {
                console.warn(`[JavaScript Node] Output type mismatch: expected ${expectedType}, got ${actualType}`);
              } else if (expectedType === 'object' && (actualType !== 'object' || result === null || Array.isArray(result))) {
                console.warn(`[JavaScript Node] Output type mismatch: expected ${expectedType}, got ${actualType}`);
              } else if (expectedType === 'array' && !Array.isArray(result)) {
                console.warn(`[JavaScript Node] Output type mismatch: expected ${expectedType}, got ${actualType}`);
              }
            }
          } catch (schemaError) {
            console.warn('[JavaScript Node] Invalid output schema, skipping validation:', schemaError);
          }
        }
        
        // Log successful execution (for monitoring)
        console.log(`[Security] JavaScript node executed successfully (timeout: ${safeTimeout}ms)`);
        
        // ✅ REFACTORED: Return result directly - no wrapping
        return result;
      } catch (error) {
        // Provide detailed error information
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log security-related errors separately
        if (errorMessage.includes('require') || 
            errorMessage.includes('process') || 
            errorMessage.includes('global') ||
            errorMessage.includes('__dirname') ||
            errorMessage.includes('__filename')) {
          console.error('[Security] JavaScript node attempted to access restricted APIs:', errorMessage);
          return {
            ...inputObj,
            _error: `Security violation: Code attempted to access restricted Node.js APIs. ${errorMessage}`,
          };
        }
        
        // Log timeout errors
        if (errorMessage.includes('timeout') || errorMessage.includes('Script execution timed out')) {
          console.error('[Security] JavaScript node execution timed out');
          return {
            ...inputObj,
            _error: `Execution timeout: Code exceeded ${safeTimeout}ms execution limit`,
          };
        }
        
        // Handle other errors
        console.error('JavaScript execution error:', error);
        return {
          ...inputObj,
          _error: errorMessage,
        };
      }
    }

    case 'function': {
      // Function node - similar to javascript but with different default timeout
      const code = getStringProperty(config, 'code', '');
      
      if (!code) {
        return {
          ...inputObj,
          _error: 'Function node: Code is required',
        };
      }

      // Security: Check if JavaScript execution is enabled
      if (process.env.DISABLE_JAVASCRIPT_NODE === 'true') {
        return {
          ...inputObj,
          _error: 'Function node execution is disabled for security reasons',
        };
      }

      // Get timeout from config (default 10 seconds for function node)
      const timeout = parseInt(getStringProperty(config, 'timeout', '10000'), 10) || 10000;
      
      // Enforce maximum timeout limit (30 seconds)
      const maxTimeout = 30000;
      const safeTimeout = Math.min(timeout, maxTimeout);

      try {
        // Import vm2 for secure sandboxing
        const { VM } = require('vm2');
        
        // Create vm2 sandbox with strict security settings
        const vm = new VM({
          timeout: safeTimeout,
          sandbox: {
            // Safe context variables (read-only copies)
            input: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj));
              } catch {
                return inputObj;
              }
            })(),
            data: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj));
              } catch {
                return inputObj;
              }
            })(),
            $json: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj));
              } catch {
                return inputObj;
              }
            })(),
            json: (() => {
              try {
                return JSON.parse(JSON.stringify(inputObj));
              } catch {
                return inputObj;
              }
            })(),
            
            // Read-only access to nodeOutputs
            getNodeOutput: (nodeId: string) => {
              const output = nodeOutputs.get(nodeId);
              if (output === null || output === undefined) {
                return undefined;
              }
              try {
                return JSON.parse(JSON.stringify(output));
              } catch {
                return undefined;
              }
            },
            
            // Safe built-in objects
            Math: Math,
            JSON: JSON,
            Date: Date,
            Array: Array,
            Object: Object,
            String: String,
            Number: Number,
            Boolean: Boolean,
            RegExp: RegExp,
            
            // Limited console for debugging
            console: {
              log: (...args: unknown[]) => console.log('[Function Node]', ...args),
              error: (...args: unknown[]) => console.error('[Function Node]', ...args),
              warn: (...args: unknown[]) => console.warn('[Function Node]', ...args),
            },
          },
          
          // Additional security settings
          eval: false,
          wasm: false,
          fixAsync: true,
        });

        // Wrap user code in IIFE to ensure proper return handling
        const wrappedCode = `
          (function() {
            const $input = input;
            const $json = input;
            const $data = data;
            
            ${code}
            
            // If code doesn't return anything, return input
            return typeof result !== 'undefined' ? result : input;
          })()
        `;

        // Execute code in sandbox
        const result = vm.run(wrappedCode);
        
        // Log successful execution
        console.log(`[Security] Function node executed successfully (timeout: ${safeTimeout}ms)`);
        
        // Return result directly
        return result;
      } catch (error) {
        // Provide detailed error information
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log security-related errors separately
        if (errorMessage.includes('require') || 
            errorMessage.includes('process') || 
            errorMessage.includes('global') ||
            errorMessage.includes('__dirname') ||
            errorMessage.includes('__filename')) {
          console.error('[Security] Function node attempted to access restricted APIs:', errorMessage);
          return {
            ...inputObj,
            _error: `Security violation: Code attempted to access restricted Node.js APIs. ${errorMessage}`,
          };
        }
        
        // Log timeout errors
        if (errorMessage.includes('timeout') || errorMessage.includes('Script execution timed out')) {
          console.error('[Security] Function node execution timed out');
          return {
            ...inputObj,
            _error: `Execution timeout: Code exceeded ${safeTimeout}ms execution limit`,
          };
        }
        
        // Handle other errors
        console.error('Function execution error:', error);
        return {
          ...inputObj,
          _error: errorMessage,
        };
      }
    }

    case 'function_item': {
      // ✅ Function Item node - runs code for each item in input.items
      // Input:
      //   { items: [{...}, {...}], ... }
      // Config:
      //   code: JavaScript body; can set `result` per item (or return value)
      const code = getStringProperty(config, 'code', '');
      if (!code) {
        return {
          ...inputObj,
          _error: 'Function item node: Code is required',
        };
      }

      if (process.env.DISABLE_JAVASCRIPT_NODE === 'true') {
        return {
          ...inputObj,
          _error: 'Function item node execution is disabled for security reasons',
        };
      }

      const items = Array.isArray((inputObj as any).items) ? (inputObj as any).items : null;
      if (!items) {
        // Nothing to map; fall back to function semantics on whole object
        return inputObj;
      }

      const timeout = parseInt(getStringProperty(config, 'timeout', '10000'), 10) || 10000;
      const safeTimeout = Math.min(timeout, 30000);

      try {
        const { VM } = require('vm2');

        const wrappedPerItem = (item: any) => `
          (function() {
            const input = ${JSON.stringify(item)};
            const data = input;
            const $json = input;
            const json = input;
            const $input = input;
            ${code}
            return typeof result !== 'undefined' ? result : input;
          })()
        `;

        const vm = new VM({
          timeout: safeTimeout,
          sandbox: {
            Math,
            JSON,
            Date,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp,
            console: {
              log: (...args: unknown[]) => console.log('[Function Item]', ...args),
              error: (...args: unknown[]) => console.error('[Function Item]', ...args),
              warn: (...args: unknown[]) => console.warn('[Function Item]', ...args),
            },
          },
          eval: false,
          wasm: false,
          fixAsync: true,
        });

        const mapped = items.map((item: any) => vm.run(wrappedPerItem(item)));
        return { ...inputObj, items: mapped };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Function item error: ${errorMessage}` };
      }
    }

    case 'google_sheets': {
      // Google Sheets node
      const spreadsheetId = getStringProperty(config, 'spreadsheetId', '');
      const sheetName = getStringProperty(config, 'sheetName', 'Sheet1');
      const range = getStringProperty(config, 'range', '');
      const operation = getStringProperty(config, 'operation', 'read');
      const dataJson = getStringProperty(config, 'data', '[]');

      if (!spreadsheetId) {
        return {
          ...inputObj,
          _error: 'Google Sheets node: Spreadsheet ID is required',
        };
      }

      // ✅ REFACTORED: Google Sheets with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      
      // ✅ DEBUG: Log original config values BEFORE resolution
      console.log(`[Google Sheets] Original config (before resolution):`, {
        spreadsheetId: spreadsheetId?.substring(0, 50),
        sheetName: sheetName,
        range: range,
      });
      
      // ✅ CRITICAL FIX: Only resolve spreadsheet ID if it contains template syntax
      // If it's already a valid spreadsheet ID (no {{ }}), use it as-is
      // This prevents template resolution from changing valid IDs
      let resolvedSpreadsheetId: string;
      if (spreadsheetId.includes('{{') || spreadsheetId.includes('$json') || spreadsheetId.includes('json.')) {
        // Contains template syntax - resolve it
        resolvedSpreadsheetId = typeof resolveWithSchema(spreadsheetId, execContext, 'string') === 'string'
        ? resolveWithSchema(spreadsheetId, execContext, 'string') as string
        : String(resolveTypedValue(spreadsheetId, execContext));
      } else {
        // No template syntax - use as-is (trim whitespace)
        resolvedSpreadsheetId = spreadsheetId.trim();
      }
      const resolvedSheetName = typeof resolveWithSchema(sheetName, execContext, 'string') === 'string'
        ? resolveWithSchema(sheetName, execContext, 'string') as string
        : String(resolveTypedValue(sheetName, execContext));
      const resolvedRange = range ? (typeof resolveWithSchema(range, execContext, 'string') === 'string'
        ? resolveWithSchema(range, execContext, 'string') as string
        : String(resolveTypedValue(range, execContext))) : undefined;
      
      // ✅ DEBUG: Log resolved values AFTER resolution
      console.log(`[Google Sheets] Resolved config (after resolution):`, {
        spreadsheetId: resolvedSpreadsheetId?.substring(0, 50),
        sheetName: resolvedSheetName,
        range: resolvedRange,
      });
      
      // ✅ VALIDATION: Check if spreadsheet ID was changed by template resolution
      if (spreadsheetId && spreadsheetId.trim() !== '' && resolvedSpreadsheetId !== spreadsheetId.trim()) {
        console.warn(`[Google Sheets] ⚠️  Spreadsheet ID was changed by template resolution!`, {
          original: spreadsheetId.substring(0, 50),
          resolved: resolvedSpreadsheetId.substring(0, 50),
        });
      }

      try {
        // Get access token - try workflow owner first, then current user as fallback
        // Note: Credentials (GOOGLE_OAUTH_CLIENT_ID/SECRET) are only needed for token refresh
        // If tokens are already stored and valid, credentials are not required
        const userIdsToTry: string[] = [];
        if (userId) userIdsToTry.push(userId);
        if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
        
        const accessToken = userIdsToTry.length > 0 
          ? await getGoogleAccessToken(supabase, userIdsToTry) 
          : null;
        
        if (!accessToken) {
          const ownerMessage = userId 
            ? `The workflow owner (user ${userId}) does not have a Google account connected.`
            : 'No workflow owner found.';
          const currentUserMessage = currentUserId && currentUserId !== userId
            ? `The current user (user ${currentUserId}) also does not have a Google account connected.`
            : '';
          const solutionMessage = userId && currentUserId && currentUserId !== userId
            ? 'Please ensure either: 1) The workflow owner connects their Google account in settings, or 2) You connect your Google account (if you have permission to use it for this workflow).'
            : userId
            ? 'Please ensure the workflow owner has connected their Google account in settings. If you\'re running someone else\'s workflow, you need to either: 1) Have the workflow owner connect their Google account, or 2) Transfer the workflow ownership to your account.'
            : 'Please connect a Google account in settings.';
          
          return {
            ...inputObj,
            _error: `Google Sheets: OAuth token not found. ${ownerMessage} ${currentUserMessage} ${solutionMessage}`,
          };
        }

        // Build the API URL
        // ✅ CRITICAL: Google Sheets API requires URL-encoded range parameter
        // Format: SheetName!A1:B10 (exclamation mark separates sheet name from range)
        let rangeParam: string;
        if (resolvedRange) {
          rangeParam = `${resolvedSheetName}!${resolvedRange}`;
        } else {
          // If no range specified, use just the sheet name (gets all data)
          rangeParam = resolvedSheetName;
        }
        
        // URL encode the range parameter (required by Google Sheets API)
        // encodeURIComponent properly encodes special characters like !, :, etc.
        const encodedRange = encodeURIComponent(rangeParam);
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/${encodedRange}`;
        
        console.log(`[Google Sheets] Config values:`, {
          sheetName: resolvedSheetName,
          range: resolvedRange,
          rangeParam: rangeParam,
          encodedRange: encodedRange,
        });
        console.log(`[Google Sheets] API URL: ${apiUrl}`);

        if (operation === 'read') {
          const response = await fetch(`${apiUrl}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Google Sheets API error: ${errorText}`;
            
            // ✅ Better error handling: Check if sheet name doesn't exist
            try {
              const errorJson = JSON.parse(errorText);
              if (errorJson.error?.message?.includes('Unable to parse range')) {
                // This usually means the sheet name doesn't exist
                errorMessage = `Google Sheets: Sheet "${resolvedSheetName}" not found in spreadsheet. ` +
                  `Please verify the sheet name is correct. The sheet name must match exactly (case-sensitive). ` +
                  `Original error: ${errorJson.error.message}`;
              }
            } catch {
              // If error text isn't JSON, use original error message
            }
            
            throw new Error(errorMessage);
          }

          const result = await response.json() as { values?: unknown[][]; range?: string };

          // Normalize Sheets API values (array-of-arrays) into n8n-like row objects when possible.
          // n8n typically returns an array of objects keyed by header names, plus "row_number".
          const values = Array.isArray(result.values) ? result.values : [];

          const toHeaderStrings = (row: unknown[]): string[] =>
            row.map((c, idx) => {
              const raw = typeof c === 'string' ? c : String(c ?? '').trim();
              const base = raw.trim() || `col_${idx + 1}`;
              return base;
            });

          const isProbablyHeaderRow = (row: unknown[]): boolean => {
            if (!Array.isArray(row) || row.length === 0) return false;
            if (!row.every((c) => typeof c === 'string' && c.trim().length > 0)) return false;
            const normalized = row.map((c) => (c as string).trim().toLowerCase());
            const uniq = new Set(normalized);
            // Heuristic: avoid treating a data row as header if lots of duplicates.
            return uniq.size / normalized.length >= 0.6;
          };

          let headers: string[] = [];
          let dataRows: unknown[][] = values;
          if (values.length > 0 && isProbablyHeaderRow(values[0] as unknown[])) {
            headers = toHeaderStrings(values[0] as unknown[]);
            dataRows = values.slice(1);
          } else if (values.length > 0) {
            // No clear header row; generate generic column names.
            const width = Math.max(...values.map((r) => (Array.isArray(r) ? r.length : 0)), 0);
            headers = Array.from({ length: width }, (_, i) => `col_${i + 1}`);
            dataRows = values;
          }

          const itemsObjects = dataRows.map((row, idx) => {
            const r = Array.isArray(row) ? row : [];
            const obj: Record<string, unknown> = {
              row_number: headers.length > 0 && values.length > 0 && isProbablyHeaderRow(values[0] as unknown[])
                ? idx + 2 // header row is row 1
                : idx + 1,
            };
            headers.forEach((h, i) => {
              obj[h] = i < r.length ? r[i] : null;
            });
            return obj;
          });

          // ✅ Compatibility: Keep raw `values` (array-of-arrays) AND provide `items` (array-of-objects)
          // so UI + logic nodes can render cleanly like n8n.
          return {
            ...inputObj,
            items: itemsObjects,
            rows: itemsObjects,
            headers,
            values, // raw
            google_sheets: {
              headers,
              rows: itemsObjects,
              values,
            },
            range: result.range,
          };
        } else if (operation === 'write' || operation === 'append') {
          // ✅ REFACTORED: Preserve data types - parse only when needed
          let data: unknown[][];
          try {
            const resolvedDataRaw = resolveTypedValue(dataJson, execContext);
            // If it's already an array of arrays, use it
            if (Array.isArray(resolvedDataRaw) && Array.isArray(resolvedDataRaw[0])) {
              data = resolvedDataRaw as unknown[][];
            } else {
              // Otherwise parse as JSON string
              const resolvedDataStr = String(resolvedDataRaw);
              data = JSON.parse(resolvedDataStr);
            }
          } catch {
            // Try to extract data from input
            data = Array.isArray(inputObj.data) ? inputObj.data : [[inputObj]];
          }

          const method = operation === 'append' ? 'POST' : 'PUT';
          const url = operation === 'append' ? `${apiUrl}:append?valueInputOption=RAW` : `${apiUrl}?valueInputOption=RAW`;

          const response = await fetch(url, {
            method,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: data,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Sheets API error: ${errorText}`);
          }

          const result = await response.json() as {
            updates?: { updatedRange?: string; updatedRows?: number; updatedColumns?: number };
            updatedRange?: string;
            updatedRows?: number;
            updatedColumns?: number;
          };
          return {
            ...inputObj,
            updatedRange: result.updates?.updatedRange || result.updatedRange,
            updatedRows: result.updates?.updatedRows || result.updatedRows,
            updatedColumns: result.updates?.updatedColumns || result.updatedColumns,
          };
        } else {
          return {
            ...inputObj,
            _error: `Google Sheets node: Unsupported operation: ${operation}`,
          };
        }
      } catch (error) {
        // Only log unexpected errors, not configuration/auth issues
        const errorMessage = error instanceof Error ? error.message : 'Google Sheets operation failed';
        const isConfigError = errorMessage.includes('credentials') || errorMessage.includes('authenticate') || errorMessage.includes('OAuth');
        
        if (!isConfigError) {
          console.error('Google Sheets error:', error);
        }
        
        // ✅ CLEAN OUTPUT: Don't include config values in error output
        // Only include error message and input data, not config values like spreadsheetId, operation, outputFormat
        return {
          ...inputObj,
          _error: `Google Sheets node: ${errorMessage}`,
          // Explicitly exclude config values from output
          // Config values like spreadsheetId, operation, outputFormat should not appear in output JSON
        };
      }
    }

    case 'google_doc': {
      // Google Docs node
      const documentId = getStringProperty(config, 'documentId', '');
      const documentUrl = getStringProperty(config, 'documentUrl', '');
      const operation = getStringProperty(config, 'operation', 'read');
      const content = getStringProperty(config, 'content', '');
      const format = getStringProperty(config, 'format', 'text');

      // Extract document ID from URL if provided
      let resolvedDocumentId = documentId;
      if (!resolvedDocumentId && documentUrl) {
        const urlMatch = documentUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (urlMatch) {
          resolvedDocumentId = urlMatch[1];
        }
      }

      if (!resolvedDocumentId) {
        return {
          ...inputObj,
          _error: 'Google Docs node: Document ID or Document URL is required',
        };
      }

      // Build context
      const context = {
        input: inputObj,
        ...nodeOutputs.getAll(),
        ...inputObj,
        $json: inputObj,
        json: inputObj,
      };

      // ✅ REFACTORED: Google Docs with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedDocumentIdFinal = typeof resolveWithSchema(resolvedDocumentId, execContext, 'string') === 'string'
        ? resolveWithSchema(resolvedDocumentId, execContext, 'string') as string
        : String(resolveTypedValue(resolvedDocumentId, execContext));
      const resolvedContent = content ? (typeof resolveWithSchema(content, execContext, 'string') === 'string'
        ? resolveWithSchema(content, execContext, 'string') as string
        : String(resolveTypedValue(content, execContext))) : '';

      try {
        // Get access token - try workflow owner first, then current user as fallback
        const userIdsToTry: string[] = [];
        if (userId) userIdsToTry.push(userId);
        if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
        
        const accessToken = userIdsToTry.length > 0 
          ? await getGoogleAccessToken(supabase, userIdsToTry) 
          : null;
        
        if (!accessToken) {
          const ownerMessage = userId 
            ? `The workflow owner (user ${userId}) does not have a Google account connected.`
            : 'No workflow owner found.';
          const currentUserMessage = currentUserId && currentUserId !== userId
            ? `The current user (user ${currentUserId}) also does not have a Google account connected.`
            : '';
          const solutionMessage = userId && currentUserId && currentUserId !== userId
            ? 'Please ensure either: 1) The workflow owner connects their Google account in settings, or 2) You connect your Google account (if you have permission to use it for this workflow).'
            : userId
            ? 'Please ensure the workflow owner has connected their Google account in settings. If you\'re running someone else\'s workflow, you need to either: 1) Have the workflow owner connect their Google account, or 2) Transfer the workflow ownership to your account.'
            : 'Please connect a Google account in settings.';
          
          return {
            ...inputObj,
            _error: `Google Docs: OAuth token not found. ${ownerMessage} ${currentUserMessage} ${solutionMessage}`,
          };
        }

        if (operation === 'read') {
          // Use Google Docs API to read document content
          const apiUrl = `https://docs.googleapis.com/v1/documents/${resolvedDocumentIdFinal}`;
          
          const response = await fetch(apiUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Docs API error: ${errorText}`);
          }

          const result = await response.json() as {
            body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> };
          };

          // Extract text content from the document structure
          let extractedText = '';
          if (result.body?.content) {
            for (const element of result.body.content) {
              if (element.paragraph?.elements) {
                for (const textElement of element.paragraph.elements) {
                  if (textElement.textRun?.content) {
                    extractedText += textElement.textRun.content;
                  }
                }
              }
            }
          }

          return {
            ...inputObj,
            content: extractedText,
            format: format,
            documentId: resolvedDocumentIdFinal,
          };
        } else if (operation === 'write') {
          if (!resolvedContent) {
            return {
              ...inputObj,
              _error: 'Google Docs node: Content is required for write operation',
            };
          }

          // Use Google Docs API to write/update document content
          // Note: This is a simplified implementation - full implementation would use batchUpdate
          const apiUrl = `https://docs.googleapis.com/v1/documents/${resolvedDocumentIdFinal}:batchUpdate`;
          
          // Clear existing content and insert new content
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                {
                  deleteContentRange: {
                    range: {
                      startIndex: 1,
                      endIndex: 1, // Will be updated after reading document length
                    },
                  },
                },
                {
                  insertText: {
                    location: { index: 1 },
                    text: resolvedContent,
                  },
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Docs API error: ${errorText}`);
          }

          return {
            ...inputObj,
            success: true,
            documentId: resolvedDocumentIdFinal,
            content: resolvedContent,
          };
        } else {
          return {
            ...inputObj,
            _error: `Google Docs node: Unsupported operation: ${operation}`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Google Docs operation failed';
        const isConfigError = errorMessage.includes('credentials') || errorMessage.includes('authenticate') || errorMessage.includes('OAuth');
        
        if (!isConfigError) {
          console.error('Google Docs error:', error);
        }
        
        return {
          ...inputObj,
          _error: `Google Docs node: ${errorMessage}`,
        };
      }
    }

    case 'airtable': {
      // ✅ Airtable node with comprehensive operation support
      // Supports: list, get, create, update, upsert, delete operations
      const apiKey = getStringProperty(config, 'apiKey', '');
      const baseId = getStringProperty(config, 'baseId', '');
      const tableName = getStringProperty(config, 'table', '');
      const resource = getStringProperty(config, 'resource', 'Record');
      const operation = getStringProperty(config, 'operation', 'list');

      if (!apiKey) {
        return {
          ...inputObj,
          _error: 'Airtable node: API Key is required',
        };
      }
      if (!baseId) {
        return {
          ...inputObj,
          _error: 'Airtable node: Base ID is required',
        };
      }
      if (!tableName) {
        return {
          ...inputObj,
          _error: 'Airtable node: Table name is required',
        };
      }

      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedBaseId = typeof resolveWithSchema(baseId, execContext, 'string') === 'string'
        ? resolveWithSchema(baseId, execContext, 'string') as string
        : String(resolveTypedValue(baseId, execContext));
      const resolvedTableName = typeof resolveWithSchema(tableName, execContext, 'string') === 'string'
        ? resolveWithSchema(tableName, execContext, 'string') as string
        : String(resolveTypedValue(tableName, execContext));
      const resolvedApiKey = typeof resolveWithSchema(apiKey, execContext, 'string') === 'string'
        ? resolveWithSchema(apiKey, execContext, 'string') as string
        : String(resolveTypedValue(apiKey, execContext));

      try {
        // Initialize Airtable with API key
        const base = new Airtable({ apiKey: resolvedApiKey }).base(resolvedBaseId);
        const table = base(resolvedTableName);

        // Helper function to convert Airtable record to plain object
        const recordToObject = (record: any) => ({
          id: record.id,
          createdTime: record._rawJson.createdTime,
          fields: record.fields,
        });

        // Helper function to collect all records with pagination
        const collectAllRecords = async (
          query: any,
          maxRecords?: number
        ): Promise<any[]> => {
          const allRecords: any[] = [];
          let recordCount = 0;

          return new Promise((resolve, reject) => {
            query.eachPage(
              (records: any[], fetchNextPage: () => void) => {
                for (const record of records) {
                  if (maxRecords && recordCount >= maxRecords) {
                    resolve(allRecords);
                    return;
                  }
                  allRecords.push(recordToObject(record));
                  recordCount++;
                }
                if (!maxRecords || recordCount < maxRecords) {
                  fetchNextPage();
                } else {
                  resolve(allRecords);
                }
              },
              (err: Error | null) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(allRecords);
                }
              }
            );
          });
        };

        if (operation === 'list') {
          // List Records operation
          const filterByFormula = getStringProperty(config, 'filterByFormula', '');
          const maxRecords = parseInt(getStringProperty(config, 'maxRecords', '0'), 10) || 0;
          const pageSize = parseInt(getStringProperty(config, 'pageSize', '100'), 10) || 100;
          const sortJson = getStringProperty(config, 'sort', 'null');
          const view = getStringProperty(config, 'view', '');
          const fieldsJson = getStringProperty(config, 'fields', 'null');
          const typecast = getBooleanProperty(config, 'typecast', false);

          // Resolve template values
          const resolvedFilterByFormula = filterByFormula
            ? (typeof resolveWithSchema(filterByFormula, execContext, 'string') === 'string'
                ? resolveWithSchema(filterByFormula, execContext, 'string') as string
                : String(resolveTypedValue(filterByFormula, execContext)))
            : undefined;

          const resolvedView = view
            ? (typeof resolveWithSchema(view, execContext, 'string') === 'string'
                ? resolveWithSchema(view, execContext, 'string') as string
                : String(resolveTypedValue(view, execContext)))
            : undefined;

          // Parse sort configuration
          let sortConfig: Array<{ field: string; direction: 'asc' | 'desc' }> | undefined;
          try {
            const sortResolved = resolveTypedValue(sortJson, execContext);
            if (sortResolved && sortResolved !== 'null' && sortResolved !== null) {
              sortConfig = typeof sortResolved === 'string' ? JSON.parse(sortResolved) : sortResolved;
            }
          } catch {
            // Invalid sort config, ignore
          }

          // Parse fields array
          let fieldsArray: string[] | undefined;
          try {
            const fieldsResolved = resolveTypedValue(fieldsJson, execContext);
            if (fieldsResolved && fieldsResolved !== 'null' && fieldsResolved !== null) {
              fieldsArray = typeof fieldsResolved === 'string' ? JSON.parse(fieldsResolved) : fieldsResolved;
            }
          } catch {
            // Invalid fields config, ignore
          }

          // Build query options
          const queryOptions: any = {
            pageSize: Math.min(Math.max(1, pageSize), 100), // Clamp between 1 and 100
            typecast,
          };

          if (resolvedFilterByFormula) {
            queryOptions.filterByFormula = resolvedFilterByFormula;
          }
          if (resolvedView) {
            queryOptions.view = resolvedView;
          }
          if (sortConfig && Array.isArray(sortConfig) && sortConfig.length > 0) {
            queryOptions.sort = sortConfig.map((sort: any) => {
              if (typeof sort === 'string') {
                return { field: sort, direction: 'asc' as const };
              }
              return {
                field: sort.field,
                direction: (sort.direction || 'asc').toLowerCase() === 'desc' ? 'desc' as const : 'asc' as const,
              };
            });
          }
          if (fieldsArray && Array.isArray(fieldsArray) && fieldsArray.length > 0) {
            queryOptions.fields = fieldsArray;
          }

          // Execute query
          const query = table.select(queryOptions);
          const records = maxRecords > 0
            ? await collectAllRecords(query, maxRecords)
            : await collectAllRecords(query);

          return {
            ...inputObj,
            records,
            count: records.length,
          };
        } else if (operation === 'get') {
          // Get Record operation
          const recordId = getStringProperty(config, 'recordId', '');
          const fieldsJson = getStringProperty(config, 'fields', 'null');

          if (!recordId) {
            return {
              ...inputObj,
              _error: 'Airtable node: recordId is required for get operation',
            };
          }

          const resolvedRecordId = typeof resolveWithSchema(recordId, execContext, 'string') === 'string'
            ? resolveWithSchema(recordId, execContext, 'string') as string
            : String(resolveTypedValue(recordId, execContext));

          // Parse fields array
          let fieldsArray: string[] | undefined;
          try {
            const fieldsResolved = resolveTypedValue(fieldsJson, execContext);
            if (fieldsResolved && fieldsResolved !== 'null' && fieldsResolved !== null) {
              fieldsArray = typeof fieldsResolved === 'string' ? JSON.parse(fieldsResolved) : fieldsResolved;
            }
          } catch {
            // Invalid fields config, ignore
          }

          const getOptions: any = {};
          if (fieldsArray && Array.isArray(fieldsArray) && fieldsArray.length > 0) {
            getOptions.fields = fieldsArray;
          }

          const record = await table.find(resolvedRecordId);
          return {
            ...inputObj,
            ...recordToObject(record),
          };
        } else if (operation === 'create') {
          // Create Records operation
          const recordsJson = getStringProperty(config, 'records', '[]');
          const typecast = getBooleanProperty(config, 'typecast', false);

          // Resolve and parse records
          let recordsToCreate: Array<{ fields: Record<string, any> }>;
          try {
            const recordsResolved = resolveTypedValue(recordsJson, execContext);
            if (Array.isArray(recordsResolved)) {
              // If it's already an array, check if it's array of objects with fields
              if (recordsResolved.length > 0 && recordsResolved[0]?.fields) {
                recordsToCreate = recordsResolved;
              } else {
                // Assume it's an array of field objects
                recordsToCreate = recordsResolved.map((r: any) => ({ fields: r }));
              }
            } else if (typeof recordsResolved === 'object' && recordsResolved !== null) {
              // Single record object
              const recordObj = recordsResolved as Record<string, any>;
              if (recordObj.fields) {
                recordsToCreate = [recordObj as { fields: Record<string, any> }];
              } else {
                recordsToCreate = [{ fields: recordObj }];
              }
            } else {
              // Try parsing as JSON string
              const parsed = typeof recordsResolved === 'string' ? JSON.parse(recordsResolved) : recordsResolved;
              if (Array.isArray(parsed)) {
                recordsToCreate = parsed.map((r: any) => 
                  r.fields ? r : { fields: r }
                );
              } else {
                recordsToCreate = parsed.fields ? [parsed] : [{ fields: parsed }];
              }
            }
          } catch (error) {
            return {
              ...inputObj,
              _error: `Airtable node: Invalid records format: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }

          if (!recordsToCreate || recordsToCreate.length === 0) {
            return {
              ...inputObj,
              _error: 'Airtable node: At least one record is required for create operation',
            };
          }

          // Airtable SDK automatically batches requests (max 10 per batch)
          const createdRecords = await table.create(recordsToCreate, { typecast });
          const result = Array.isArray(createdRecords) 
            ? createdRecords.map(recordToObject)
            : [recordToObject(createdRecords)];

          return {
            ...inputObj,
            records: result,
            count: result.length,
          };
        } else if (operation === 'update') {
          // Update Records operation
          const recordsJson = getStringProperty(config, 'records', '[]');
          const typecast = getBooleanProperty(config, 'typecast', false);

          // Resolve and parse records
          let recordsToUpdate: Array<{ id: string; fields: Record<string, any> }>;
          try {
            const recordsResolved = resolveTypedValue(recordsJson, execContext);
            if (Array.isArray(recordsResolved)) {
              recordsToUpdate = recordsResolved.map((r: any) => ({
                id: r.id || r.recordId,
                fields: r.fields || r,
              }));
            } else if (typeof recordsResolved === 'object' && recordsResolved !== null) {
              const recordObj = recordsResolved as Record<string, any>;
              recordsToUpdate = [{
                id: recordObj.id || recordObj.recordId || '',
                fields: recordObj.fields || recordObj,
              }];
            } else {
              const parsed = typeof recordsResolved === 'string' ? JSON.parse(recordsResolved) : recordsResolved;
              if (Array.isArray(parsed)) {
                recordsToUpdate = parsed.map((r: any) => ({
                  id: r.id || r.recordId,
                  fields: r.fields || r,
                }));
              } else {
                recordsToUpdate = [{
                  id: parsed.id || parsed.recordId || '',
                  fields: parsed.fields || parsed,
                }];
              }
            }
          } catch (error) {
            return {
              ...inputObj,
              _error: `Airtable node: Invalid records format: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }

          if (!recordsToUpdate || recordsToUpdate.length === 0) {
            return {
              ...inputObj,
              _error: 'Airtable node: At least one record is required for update operation',
            };
          }

          // Validate all records have IDs
          for (const record of recordsToUpdate) {
            if (!record.id) {
              return {
                ...inputObj,
                _error: 'Airtable node: All records must have an id field for update operation',
              };
            }
          }

          // Airtable SDK automatically batches requests (max 10 per batch)
          const updatedRecords = await table.update(recordsToUpdate, { typecast });
          const result = Array.isArray(updatedRecords)
            ? updatedRecords.map(recordToObject)
            : [recordToObject(updatedRecords)];

          return {
            ...inputObj,
            records: result,
            count: result.length,
          };
        } else if (operation === 'upsert') {
          // Upsert Records operation (Update or Create)
          const recordsJson = getStringProperty(config, 'records', '[]');
          const matchField = getStringProperty(config, 'matchField', '');
          const typecast = getBooleanProperty(config, 'typecast', false);

          if (!matchField) {
            return {
              ...inputObj,
              _error: 'Airtable node: matchField is required for upsert operation',
            };
          }

          const resolvedMatchField = typeof resolveWithSchema(matchField, execContext, 'string') === 'string'
            ? resolveWithSchema(matchField, execContext, 'string') as string
            : String(resolveTypedValue(matchField, execContext));

          // Resolve and parse records
          let recordsToUpsert: Array<{ fields: Record<string, any> }>;
          try {
            const recordsResolved = resolveTypedValue(recordsJson, execContext);
            if (Array.isArray(recordsResolved)) {
              recordsToUpsert = recordsResolved.map((r: any) => ({
                fields: r.fields || r,
              }));
            } else if (typeof recordsResolved === 'object' && recordsResolved !== null) {
              const recordObj = recordsResolved as Record<string, any>;
              recordsToUpsert = [{ fields: recordObj.fields || recordObj }];
            } else {
              const parsed = typeof recordsResolved === 'string' ? JSON.parse(recordsResolved) : recordsResolved;
              if (Array.isArray(parsed)) {
                recordsToUpsert = parsed.map((r: any) => ({
                  fields: r.fields || r,
                }));
              } else {
                recordsToUpsert = [{ fields: parsed.fields || parsed }];
              }
            }
          } catch (error) {
            return {
              ...inputObj,
              _error: `Airtable node: Invalid records format: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }

          if (!recordsToUpsert || recordsToUpsert.length === 0) {
            return {
              ...inputObj,
              _error: 'Airtable node: At least one record is required for upsert operation',
            };
          }

          // Extract match values
          const matchValues = recordsToUpsert.map(r => r.fields[resolvedMatchField]).filter(v => v != null);

          if (matchValues.length === 0) {
            return {
              ...inputObj,
              _error: `Airtable node: No records have a value for match field "${resolvedMatchField}"`,
            };
          }

          // Build filter formula to find existing records
          const filterFormula = `OR(${matchValues.map((val: any) => {
            if (typeof val === 'string') {
              return `{${resolvedMatchField}} = "${val.replace(/"/g, '\\"')}"`;
            }
            return `{${resolvedMatchField}} = ${val}`;
          }).join(', ')})`;

          // Fetch existing records
          const existingRecords = await collectAllRecords(
            table.select({
              filterByFormula: filterFormula,
              fields: [resolvedMatchField],
            })
          );

          // Create a map of match value -> record ID
          const matchValueToId = new Map<string, string>();
          for (const record of existingRecords) {
            const matchValue = record.fields[resolvedMatchField];
            if (matchValue != null) {
              matchValueToId.set(String(matchValue), record.id);
            }
          }

          // Separate records into create and update batches
          const toCreate: Array<{ fields: Record<string, any> }> = [];
          const toUpdate: Array<{ id: string; fields: Record<string, any> }> = [];

          for (const record of recordsToUpsert) {
            const matchValue = record.fields[resolvedMatchField];
            if (matchValue == null) {
              // No match value, skip
              continue;
            }

            const existingId = matchValueToId.get(String(matchValue));
            if (existingId) {
              // Update existing record
              toUpdate.push({
                id: existingId,
                fields: record.fields,
              });
            } else {
              // Create new record
              toCreate.push(record);
            }
          }

          const results: any[] = [];

          // Perform updates
          if (toUpdate.length > 0) {
            const updated = await table.update(toUpdate, { typecast });
            const updatedArray = Array.isArray(updated) ? updated : [updated];
            results.push(...updatedArray.map(recordToObject));
          }

          // Perform creates
          if (toCreate.length > 0) {
            const created = await table.create(toCreate, { typecast });
            const createdArray = Array.isArray(created) ? created : [created];
            results.push(...createdArray.map(recordToObject));
          }

          return {
            ...inputObj,
            records: results,
            count: results.length,
            created: toCreate.length,
            updated: toUpdate.length,
          };
        } else if (operation === 'delete') {
          // Delete Records operation
          const recordIdsJson = getStringProperty(config, 'recordIds', '');

          // Resolve and parse record IDs
          let recordIds: string[];
          try {
            const recordIdsResolved = resolveTypedValue(recordIdsJson, execContext);
            if (Array.isArray(recordIdsResolved)) {
              recordIds = recordIdsResolved.map(id => String(id));
            } else if (typeof recordIdsResolved === 'string') {
              // Try parsing as JSON array
              try {
                const parsed = JSON.parse(recordIdsResolved);
                recordIds = Array.isArray(parsed) ? parsed.map(id => String(id)) : [String(parsed)];
              } catch {
                // Treat as single ID
                recordIds = [recordIdsResolved];
              }
            } else {
              recordIds = [String(recordIdsResolved)];
            }
          } catch (error) {
            return {
              ...inputObj,
              _error: `Airtable node: Invalid recordIds format: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }

          if (!recordIds || recordIds.length === 0) {
            return {
              ...inputObj,
              _error: 'Airtable node: At least one record ID is required for delete operation',
            };
          }

          // Airtable SDK automatically batches delete requests (max 10 per batch)
          const deletedRecords = await table.destroy(recordIds);
          const result = Array.isArray(deletedRecords)
            ? deletedRecords.map(recordToObject)
            : [recordToObject(deletedRecords)];

          return {
            ...inputObj,
            deletedRecords: result,
            count: result.length,
          };
        } else {
          return {
            ...inputObj,
            _error: `Airtable node: Unsupported operation: ${operation}`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Airtable operation failed';
        console.error('Airtable error:', error);
        
        // Extract Airtable-specific error details if available
        let statusCode: number | undefined;
        let errorType: string | undefined;
        
        if (error && typeof error === 'object' && 'statusCode' in error) {
          statusCode = error.statusCode as number;
        }
        if (error && typeof error === 'object' && 'error' in error) {
          const airtableError = (error as any).error;
          if (typeof airtableError === 'string') {
            errorType = airtableError;
          } else if (airtableError && typeof airtableError === 'object' && 'type' in airtableError) {
            errorType = airtableError.type;
          }
        }

        return {
          ...inputObj,
          _error: `Airtable node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            type: errorType,
          },
        };
      }
    }

    case 'pipedrive': {
      // ✅ Pipedrive node with comprehensive resource and operation support
      // Supports: deal, person, organization, activity, note, pipeline, stage, product, lead, file, webhook
      const apiToken = getStringProperty(config, 'apiToken', '');
      const resource = getStringProperty(config, 'resource', 'deal');
      const operation = getStringProperty(config, 'operation', 'list');

      if (!apiToken) {
        return {
          ...inputObj,
          _error: 'Pipedrive node: API Token is required',
        };
      }

      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedApiToken = typeof resolveWithSchema(apiToken, execContext, 'string') === 'string'
        ? resolveWithSchema(apiToken, execContext, 'string') as string
        : String(resolveTypedValue(apiToken, execContext));

      try {
        const client = new PipedriveApiClient(resolvedApiToken);

        // Helper to get number property
        const getNumberProp = (key: string, defaultValue: number | null = null): number | null => {
          const value = config[key];
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? defaultValue : parsed;
          }
          return defaultValue;
        };

        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          // If already a number, return it directly
          if (typeof value === 'number') return value;
          // If it's a string, check if it contains templates, otherwise parse it
          if (typeof value === 'string') {
            // Check if it's a template variable (contains {{)
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseInt(resolved, 10);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              // Not a template, just parse the string
              const parsed = parseInt(value, 10);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to merge additional fields
        const mergeAdditionalFields = (baseData: Record<string, any>): Record<string, any> => {
          const additionalFields = getJsonProp('additionalFields');
          if (additionalFields && typeof additionalFields === 'object') {
            return { ...baseData, ...additionalFields };
          }
          return baseData;
        };

        let result: any;

        // ==================== DEAL OPERATIONS ====================
        if (resource === 'deal') {
          if (operation === 'get') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for get operation' };
            }
            result = await client.getDeal(dealId);
          } else if (operation === 'list') {
            const params: any = {};
            const filterId = resolveNumber(getNumberProp('filterId'));
            const stageId = resolveNumber(getNumberProp('stageId'));
            const status = resolveString(getStringProperty(config, 'status', ''));
            const sort = resolveString(getStringProperty(config, 'sort', ''));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (filterId) params.filterId = filterId;
            if (stageId) params.stageId = stageId;
            if (status) params.status = status;
            if (sort) params.sort = sort;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listDeals(params);
          } else if (operation === 'create') {
            const title = resolveString(getStringProperty(config, 'dealTitle', ''));
            if (!title) {
              return { ...inputObj, _error: 'Pipedrive node: dealTitle is required for create operation' };
            }

            const dealData: any = {
              title,
              value: resolveNumber(getNumberProp('dealValue', 0)) || 0,
              currency: resolveString(getStringProperty(config, 'dealCurrency', 'USD')) || 'USD',
            };

            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const stageId = resolveNumber(getNumberProp('stageId'));
            const status = resolveString(getStringProperty(config, 'status', ''));
            const expectedCloseDate = resolveString(getStringProperty(config, 'expectedCloseDate', ''));

            if (personId) dealData.person_id = personId;
            if (orgId) dealData.org_id = orgId;
            if (stageId) dealData.stage_id = stageId;
            if (status) dealData.status = status;
            if (expectedCloseDate) dealData.expected_close_date = expectedCloseDate;

            result = await client.createDeal(mergeAdditionalFields(dealData) as any);
          } else if (operation === 'update') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for update operation' };
            }

            const updateData: any = {};
            const title = resolveString(getStringProperty(config, 'dealTitle', ''));
            const value = resolveNumber(getNumberProp('dealValue'));
            const currency = resolveString(getStringProperty(config, 'dealCurrency', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const stageId = resolveNumber(getNumberProp('stageId'));
            const status = resolveString(getStringProperty(config, 'status', ''));

            if (title) updateData.title = title;
            if (value !== null) updateData.value = value;
            if (currency) updateData.currency = currency;
            if (personId) updateData.person_id = personId;
            if (orgId) updateData.org_id = orgId;
            if (stageId) updateData.stage_id = stageId;
            if (status) updateData.status = status;

            result = await client.updateDeal(dealId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for delete operation' };
            }
            result = await client.deleteDeal(dealId);
          } else if (operation === 'duplicate') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for duplicate operation' };
            }
            const newTitle = resolveString(getStringProperty(config, 'newTitle', ''));
            result = await client.duplicateDeal(dealId, newTitle || undefined);
          } else if (operation === 'search') {
            const term = resolveString(getStringProperty(config, 'searchTerm', ''));
            if (!term) {
              return { ...inputObj, _error: 'Pipedrive node: searchTerm is required for search operation' };
            }
            const fields = getJsonProp('searchFields');
            const exactMatch = getBooleanProperty(config, 'exactMatch', false);
            result = await client.searchDeals({ term, fields: Array.isArray(fields) ? fields : undefined, exact_match: exactMatch });
          } else if (operation === 'getActivities') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for getActivities operation' };
            }
            result = await client.getDealActivities(dealId);
          } else if (operation === 'getProducts') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for getProducts operation' };
            }
            result = await client.getDealProducts(dealId);
          } else if (operation === 'addProduct') {
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const productId = resolveNumber(getNumberProp('productId'));
            const itemPrice = resolveNumber(getNumberProp('itemPrice', 0));
            const quantity = resolveNumber(getNumberProp('quantity', 1));

            if (!dealId) {
              return { ...inputObj, _error: 'Pipedrive node: dealId is required for addProduct operation' };
            }
            if (!productId) {
              return { ...inputObj, _error: 'Pipedrive node: productId is required for addProduct operation' };
            }
            if (itemPrice === null) {
              return { ...inputObj, _error: 'Pipedrive node: itemPrice is required for addProduct operation' };
            }

            const discount = resolveNumber(getNumberProp('discount', 0));
            const duration = resolveNumber(getNumberProp('duration', 1));

            result = await client.addProductToDeal(dealId, {
              product_id: productId,
              item_price: itemPrice || 0,
              quantity: quantity || 1,
              discount: discount || 0,
              duration: duration || 1,
            });
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "deal"` };
          }
        }
        // ==================== PERSON OPERATIONS ====================
        else if (resource === 'person') {
          if (operation === 'get') {
            const personId = resolveNumber(getNumberProp('personId'));
            if (!personId) {
              return { ...inputObj, _error: 'Pipedrive node: personId is required for get operation' };
            }
            result = await client.getPerson(personId);
          } else if (operation === 'list') {
            const params: any = {};
            const filterId = resolveNumber(getNumberProp('filterId'));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (filterId) params.filterId = filterId;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listPersons(params);
          } else if (operation === 'create') {
            const name = resolveString(getStringProperty(config, 'personName', ''));
            if (!name) {
              return { ...inputObj, _error: 'Pipedrive node: personName is required for create operation' };
            }

            const personData: any = { name };
            const email = resolveString(getStringProperty(config, 'personEmail', ''));
            const phone = resolveString(getStringProperty(config, 'personPhone', ''));
            const orgId = resolveNumber(getNumberProp('orgId'));

            if (email) personData.email = [email];
            if (phone) personData.phone = [phone];
            if (orgId) personData.org_id = orgId;

            result = await client.createPerson(mergeAdditionalFields(personData) as any);
          } else if (operation === 'update') {
            const personId = resolveNumber(getNumberProp('personId'));
            if (!personId) {
              return { ...inputObj, _error: 'Pipedrive node: personId is required for update operation' };
            }

            const updateData: any = {};
            const name = resolveString(getStringProperty(config, 'personName', ''));
            const email = resolveString(getStringProperty(config, 'personEmail', ''));
            const phone = resolveString(getStringProperty(config, 'personPhone', ''));

            if (name) updateData.name = name;
            if (email) updateData.email = [email];
            if (phone) updateData.phone = [phone];

            result = await client.updatePerson(personId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const personId = resolveNumber(getNumberProp('personId'));
            if (!personId) {
              return { ...inputObj, _error: 'Pipedrive node: personId is required for delete operation' };
            }
            result = await client.deletePerson(personId);
          } else if (operation === 'search') {
            const term = resolveString(getStringProperty(config, 'searchTerm', ''));
            if (!term) {
              return { ...inputObj, _error: 'Pipedrive node: searchTerm is required for search operation' };
            }
            const fields = getJsonProp('searchFields');
            const exactMatch = getBooleanProperty(config, 'exactMatch', false);
            result = await client.searchPersons({ term, fields: Array.isArray(fields) ? fields : undefined, exact_match: exactMatch });
          } else if (operation === 'getDeals') {
            const personId = resolveNumber(getNumberProp('personId'));
            if (!personId) {
              return { ...inputObj, _error: 'Pipedrive node: personId is required for getDeals operation' };
            }
            result = await client.getPersonDeals(personId);
          } else if (operation === 'getActivities') {
            const personId = resolveNumber(getNumberProp('personId'));
            if (!personId) {
              return { ...inputObj, _error: 'Pipedrive node: personId is required for getActivities operation' };
            }
            result = await client.getPersonActivities(personId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "person"` };
          }
        }
        // ==================== ORGANIZATION OPERATIONS ====================
        else if (resource === 'organization') {
          if (operation === 'get') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for get operation' };
            }
            result = await client.getOrganization(orgId);
          } else if (operation === 'list') {
            const params: any = {};
            const filterId = resolveNumber(getNumberProp('filterId'));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (filterId) params.filterId = filterId;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listOrganizations(params);
          } else if (operation === 'create') {
            const name = resolveString(getStringProperty(config, 'orgName', ''));
            if (!name) {
              return { ...inputObj, _error: 'Pipedrive node: orgName is required for create operation' };
            }

            const orgData: any = { name };
            const address = resolveString(getStringProperty(config, 'orgAddress', ''));
            const phone = resolveString(getStringProperty(config, 'personPhone', ''));

            if (address) orgData.address = address;
            if (phone) orgData.phone = [phone];

            result = await client.createOrganization(mergeAdditionalFields(orgData) as any);
          } else if (operation === 'update') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for update operation' };
            }

            const updateData: any = {};
            const name = resolveString(getStringProperty(config, 'orgName', ''));
            const address = resolveString(getStringProperty(config, 'orgAddress', ''));

            if (name) updateData.name = name;
            if (address) updateData.address = address;

            result = await client.updateOrganization(orgId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for delete operation' };
            }
            result = await client.deleteOrganization(orgId);
          } else if (operation === 'search') {
            const term = resolveString(getStringProperty(config, 'searchTerm', ''));
            if (!term) {
              return { ...inputObj, _error: 'Pipedrive node: searchTerm is required for search operation' };
            }
            const fields = getJsonProp('searchFields');
            const exactMatch = getBooleanProperty(config, 'exactMatch', false);
            result = await client.searchOrganizations({ term, fields: Array.isArray(fields) ? fields : undefined, exact_match: exactMatch });
          } else if (operation === 'getDeals') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for getDeals operation' };
            }
            result = await client.getOrganizationDeals(orgId);
          } else if (operation === 'getPersons') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for getPersons operation' };
            }
            result = await client.getOrganizationPersons(orgId);
          } else if (operation === 'getActivities') {
            const orgId = resolveNumber(getNumberProp('orgId'));
            if (!orgId) {
              return { ...inputObj, _error: 'Pipedrive node: orgId is required for getActivities operation' };
            }
            result = await client.getOrganizationActivities(orgId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "organization"` };
          }
        }
        // ==================== ACTIVITY OPERATIONS ====================
        else if (resource === 'activity') {
          if (operation === 'get') {
            const activityId = resolveNumber(getNumberProp('activityId'));
            if (!activityId) {
              return { ...inputObj, _error: 'Pipedrive node: activityId is required for get operation' };
            }
            result = await client.getActivity(activityId);
          } else if (operation === 'list') {
            const params: any = {};
            const userId = resolveNumber(getNumberProp('userId'));
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const type = resolveString(getStringProperty(config, 'activityType', ''));
            const startDate = resolveString(getStringProperty(config, 'startDate', ''));
            const endDate = resolveString(getStringProperty(config, 'endDate', ''));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (userId) params.userId = userId;
            if (dealId) params.dealId = dealId;
            if (personId) params.personId = personId;
            if (orgId) params.orgId = orgId;
            if (type) params.type = type;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listActivities(params);
          } else if (operation === 'create') {
            const subject = resolveString(getStringProperty(config, 'activitySubject', ''));
            const dueDate = resolveString(getStringProperty(config, 'dueDate', ''));

            if (!subject) {
              return { ...inputObj, _error: 'Pipedrive node: activitySubject is required for create operation' };
            }
            if (!dueDate) {
              return { ...inputObj, _error: 'Pipedrive node: dueDate is required for create operation' };
            }

            const activityData: any = {
              subject,
              due_date: dueDate,
              type: resolveString(getStringProperty(config, 'activityType', 'task')) || 'task',
            };

            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const note = resolveString(getStringProperty(config, 'noteContent', ''));

            if (dealId) activityData.deal_id = parseInt(dealId, 10);
            if (personId) activityData.person_id = personId;
            if (orgId) activityData.org_id = orgId;
            if (note) activityData.note = note;

            result = await client.createActivity(mergeAdditionalFields(activityData) as any);
          } else if (operation === 'update') {
            const activityId = resolveNumber(getNumberProp('activityId'));
            if (!activityId) {
              return { ...inputObj, _error: 'Pipedrive node: activityId is required for update operation' };
            }

            const updateData: any = {};
            const subject = resolveString(getStringProperty(config, 'activitySubject', ''));
            const dueDate = resolveString(getStringProperty(config, 'dueDate', ''));

            if (subject) updateData.subject = subject;
            if (dueDate) updateData.due_date = dueDate;

            result = await client.updateActivity(activityId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const activityId = resolveNumber(getNumberProp('activityId'));
            if (!activityId) {
              return { ...inputObj, _error: 'Pipedrive node: activityId is required for delete operation' };
            }
            result = await client.deleteActivity(activityId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "activity"` };
          }
        }
        // ==================== NOTE OPERATIONS ====================
        else if (resource === 'note') {
          if (operation === 'get') {
            const noteId = resolveNumber(getNumberProp('noteId'));
            if (!noteId) {
              return { ...inputObj, _error: 'Pipedrive node: noteId is required for get operation' };
            }
            result = await client.getNote(noteId);
          } else if (operation === 'list') {
            const params: any = {};
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (dealId) params.dealId = parseInt(dealId, 10);
            if (personId) params.personId = personId;
            if (orgId) params.orgId = orgId;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listNotes(params);
          } else if (operation === 'create') {
            const content = resolveString(getStringProperty(config, 'noteContent', ''));
            if (!content) {
              return { ...inputObj, _error: 'Pipedrive node: noteContent is required for create operation' };
            }

            const noteData: any = {
              content,
              pinned_to_deal_flag: getBooleanProperty(config, 'pinnedToDealFlag', false),
            };

            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));

            if (dealId) noteData.deal_id = parseInt(dealId, 10);
            if (personId) noteData.person_id = personId;
            if (orgId) noteData.org_id = orgId;

            result = await client.createNote(mergeAdditionalFields(noteData) as any);
          } else if (operation === 'update') {
            const noteId = resolveNumber(getNumberProp('noteId'));
            const content = resolveString(getStringProperty(config, 'noteContent', ''));

            if (!noteId) {
              return { ...inputObj, _error: 'Pipedrive node: noteId is required for update operation' };
            }
            if (!content) {
              return { ...inputObj, _error: 'Pipedrive node: noteContent is required for update operation' };
            }

            result = await client.updateNote(noteId, mergeAdditionalFields({ content }) as any);
          } else if (operation === 'delete') {
            const noteId = resolveNumber(getNumberProp('noteId'));
            if (!noteId) {
              return { ...inputObj, _error: 'Pipedrive node: noteId is required for delete operation' };
            }
            result = await client.deleteNote(noteId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "note"` };
          }
        }
        // ==================== PIPELINE OPERATIONS ====================
        else if (resource === 'pipeline') {
          if (operation === 'list') {
            result = await client.listPipelines();
          } else if (operation === 'get') {
            const pipelineId = resolveNumber(getNumberProp('pipelineId'));
            if (!pipelineId) {
              return { ...inputObj, _error: 'Pipedrive node: pipelineId is required for get operation' };
            }
            result = await client.getPipeline(pipelineId);
          } else if (operation === 'getStages') {
            const pipelineId = resolveNumber(getNumberProp('pipelineId'));
            if (!pipelineId) {
              return { ...inputObj, _error: 'Pipedrive node: pipelineId is required for getStages operation' };
            }
            result = await client.getPipelineStages(pipelineId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "pipeline"` };
          }
        }
        // ==================== STAGE OPERATIONS ====================
        else if (resource === 'stage') {
          if (operation === 'list') {
            const params: any = {};
            const pipelineId = resolveNumber(getNumberProp('pipelineId'));
            if (pipelineId) params.pipelineId = pipelineId;
            result = await client.listStages(params);
          } else if (operation === 'get') {
            const stageId = resolveNumber(getNumberProp('stageId'));
            if (!stageId) {
              return { ...inputObj, _error: 'Pipedrive node: stageId is required for get operation' };
            }
            result = await client.getStage(stageId);
          } else if (operation === 'update') {
            const stageId = resolveNumber(getNumberProp('stageId'));
            if (!stageId) {
              return { ...inputObj, _error: 'Pipedrive node: stageId is required for update operation' };
            }

            const updateData: any = {};
            const name = resolveString(getStringProperty(config, 'stageName', ''));
            const probability = resolveNumber(getNumberProp('dealProbability'));

            if (name) updateData.name = name;
            if (probability !== null) updateData.deal_probability = probability;

            result = await client.updateStage(stageId, mergeAdditionalFields(updateData));
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "stage"` };
          }
        }
        // ==================== PRODUCT OPERATIONS ====================
        else if (resource === 'product') {
          if (operation === 'get') {
            const productId = resolveNumber(getNumberProp('productId'));
            if (!productId) {
              return { ...inputObj, _error: 'Pipedrive node: productId is required for get operation' };
            }
            result = await client.getProduct(productId);
          } else if (operation === 'list') {
            const params: any = {};
            const filterId = resolveNumber(getNumberProp('filterId'));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (filterId) params.filterId = filterId;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listProducts(params);
          } else if (operation === 'create') {
            const name = resolveString(getStringProperty(config, 'productName', ''));
            const code = resolveString(getStringProperty(config, 'productCode', ''));

            if (!name) {
              return { ...inputObj, _error: 'Pipedrive node: productName is required for create operation' };
            }
            if (!code) {
              return { ...inputObj, _error: 'Pipedrive node: productCode is required for create operation' };
            }

            const productData: any = {
              name,
              code,
              unit: resolveString(getStringProperty(config, 'productUnit', '')) || undefined,
              tax: resolveNumber(getNumberProp('productTax', 0)) || 0,
            };

            result = await client.createProduct(mergeAdditionalFields(productData) as any);
          } else if (operation === 'update') {
            const productId = resolveNumber(getNumberProp('productId'));
            if (!productId) {
              return { ...inputObj, _error: 'Pipedrive node: productId is required for update operation' };
            }

            const updateData: any = {};
            const name = resolveString(getStringProperty(config, 'productName', ''));
            const code = resolveString(getStringProperty(config, 'productCode', ''));

            if (name) updateData.name = name;
            if (code) updateData.code = code;

            result = await client.updateProduct(productId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const productId = resolveNumber(getNumberProp('productId'));
            if (!productId) {
              return { ...inputObj, _error: 'Pipedrive node: productId is required for delete operation' };
            }
            result = await client.deleteProduct(productId);
          } else if (operation === 'search') {
            const term = resolveString(getStringProperty(config, 'searchTerm', ''));
            if (!term) {
              return { ...inputObj, _error: 'Pipedrive node: searchTerm is required for search operation' };
            }
            const fields = getJsonProp('searchFields');
            const exactMatch = getBooleanProperty(config, 'exactMatch', false);
            result = await client.searchProducts({ term, fields: Array.isArray(fields) ? fields : undefined, exact_match: exactMatch });
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "product"` };
          }
        }
        // ==================== LEAD OPERATIONS ====================
        else if (resource === 'lead') {
          if (operation === 'get') {
            const leadId = resolveNumber(getNumberProp('leadId'));
            if (!leadId) {
              return { ...inputObj, _error: 'Pipedrive node: leadId is required for get operation' };
            }
            result = await client.getLead(leadId);
          } else if (operation === 'list') {
            const params: any = {};
            const personId = resolveNumber(getNumberProp('personId'));
            const organizationId = resolveNumber(getNumberProp('orgId'));
            const status = resolveString(getStringProperty(config, 'status', ''));
            const limit = resolveNumber(getNumberProp('limit', 0));
            const start = resolveNumber(getNumberProp('start', 0));

            if (personId) params.personId = personId;
            if (organizationId) params.organizationId = organizationId;
            if (status) params.status = status;
            if (limit) params.limit = limit;
            if (start) params.start = start;

            result = await client.listLeads(params);
          } else if (operation === 'create') {
            const title = resolveString(getStringProperty(config, 'leadTitle', ''));
            if (!title) {
              return { ...inputObj, _error: 'Pipedrive node: leadTitle is required for create operation' };
            }

            const leadData: any = { title };
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const value = resolveNumber(getNumberProp('dealValue'));
            const expectedCloseDate = resolveString(getStringProperty(config, 'expectedCloseDate', ''));

            if (personId) leadData.person_id = personId;
            if (orgId) leadData.organization_id = orgId;
            if (value !== null) leadData.value = value;
            if (expectedCloseDate) leadData.expected_close_date = expectedCloseDate;

            result = await client.createLead(mergeAdditionalFields(leadData) as any);
          } else if (operation === 'update') {
            const leadId = resolveNumber(getNumberProp('leadId'));
            if (!leadId) {
              return { ...inputObj, _error: 'Pipedrive node: leadId is required for update operation' };
            }

            const updateData: any = {};
            const title = resolveString(getStringProperty(config, 'leadTitle', ''));

            if (title) updateData.title = title;

            result = await client.updateLead(leadId, mergeAdditionalFields(updateData));
          } else if (operation === 'delete') {
            const leadId = resolveNumber(getNumberProp('leadId'));
            if (!leadId) {
              return { ...inputObj, _error: 'Pipedrive node: leadId is required for delete operation' };
            }
            result = await client.deleteLead(leadId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "lead"` };
          }
        }
        // ==================== FILE OPERATIONS ====================
        else if (resource === 'file') {
          if (operation === 'list') {
            const params: any = {};
            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const activityId = resolveNumber(getNumberProp('activityId'));

            if (dealId) params.dealId = parseInt(dealId, 10);
            if (personId) params.personId = personId;
            if (orgId) params.orgId = orgId;
            if (activityId) params.activityId = activityId;

            result = await client.listFiles(params);
          } else if (operation === 'upload') {
            const fileUrl = resolveString(getStringProperty(config, 'fileUrl', ''));
            const fileName = resolveString(getStringProperty(config, 'fileName', 'file'));

            if (!fileUrl) {
              return { ...inputObj, _error: 'Pipedrive node: fileUrl is required for upload operation' };
            }

            const dealId = resolveString(getStringProperty(config, 'dealId', ''));
            const personId = resolveNumber(getNumberProp('personId'));
            const orgId = resolveNumber(getNumberProp('orgId'));
            const activityId = resolveNumber(getNumberProp('activityId'));

            if (!dealId && !personId && !orgId && !activityId) {
              return { ...inputObj, _error: 'Pipedrive node: At least one association (dealId, personId, orgId, or activityId) is required for upload operation' };
            }

            const associations: any = {};
            if (dealId) associations.dealId = parseInt(dealId, 10);
            if (personId) associations.personId = personId;
            if (orgId) associations.orgId = orgId;
            if (activityId) associations.activityId = activityId;

            result = await client.uploadFile(fileUrl, fileName, associations);
          } else if (operation === 'download') {
            const fileId = resolveString(getStringProperty(config, 'fileId', ''));
            if (!fileId) {
              return { ...inputObj, _error: 'Pipedrive node: fileId is required for download operation' };
            }
            result = await client.downloadFile(fileId);
          } else if (operation === 'delete') {
            const fileId = resolveString(getStringProperty(config, 'fileId', ''));
            if (!fileId) {
              return { ...inputObj, _error: 'Pipedrive node: fileId is required for delete operation' };
            }
            result = await client.deleteFile(fileId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "file"` };
          }
        }
        // ==================== WEBHOOK OPERATIONS ====================
        else if (resource === 'webhook') {
          if (operation === 'list') {
            result = await client.listWebhooks();
          } else if (operation === 'create') {
            const event = resolveString(getStringProperty(config, 'event', ''));
            const subscriptionUrl = resolveString(getStringProperty(config, 'subscriptionUrl', ''));

            if (!event) {
              return { ...inputObj, _error: 'Pipedrive node: event is required for create operation' };
            }
            if (!subscriptionUrl) {
              return { ...inputObj, _error: 'Pipedrive node: subscriptionUrl is required for create operation' };
            }

            result = await client.createWebhook({ event, subscription_url: subscriptionUrl });
          } else if (operation === 'delete') {
            const webhookId = resolveNumber(getNumberProp('webhookId'));
            if (!webhookId) {
              return { ...inputObj, _error: 'Pipedrive node: webhookId is required for delete operation' };
            }
            result = await client.deleteWebhook(webhookId);
          } else {
            return { ...inputObj, _error: `Pipedrive node: Unsupported operation "${operation}" for resource "webhook"` };
          }
        } else {
          return { ...inputObj, _error: `Pipedrive node: Unsupported resource "${resource}"` };
        }

        // Handle API response
        if (!result.success) {
          return {
            ...inputObj,
            _error: `Pipedrive API error: ${result.error || result.error_info || 'Unknown error'}`,
            _errorDetails: {
              error: result.error,
              error_info: result.error_info,
            },
          };
        }

        // Return successful result
        return {
          ...inputObj,
          data: result.data,
          success: result.success,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Pipedrive operation failed';
        console.error('Pipedrive error:', error);

        return {
          ...inputObj,
          _error: `Pipedrive node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'notion': {
      // ✅ Notion node with comprehensive resource and operation support
      // Supports: page, database, block, user, comment, search
      // Uses OAuth token from header (via Supabase)
      const resource = getStringProperty(config, 'resource', 'page');
      const operation = getStringProperty(config, 'operation', 'get');

      // Use typed execution context
      const execContext = createTypedContext();
      
      // Get OAuth token from Supabase
      const userIdsToTry: string[] = [];
      if (userId) userIdsToTry.push(userId);
      if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);

      const resolvedApiToken = userIdsToTry.length > 0 
        ? await getNotionAccessToken(supabase, userIdsToTry)
        : null;

      if (!resolvedApiToken) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have a Notion account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have a Notion account connected.`
          : '';
        
        return {
          ...inputObj,
          _error: `Notion node: OAuth connection required. ${ownerMessage} ${currentUserMessage} Please connect your Notion account in the Connections panel.`,
        };
      }

      try {
        // Initialize Notion client
        const notion = new Client({
          auth: resolvedApiToken,
        });

        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseInt(resolved, 10);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              const parsed = parseInt(value, 10);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to collect all paginated results
        const collectAllPages = async <T>(
          paginatedFn: (startCursor?: string) => Promise<{ results: T[]; next_cursor: string | null; has_more: boolean }>,
          maxResults?: number
        ): Promise<T[]> => {
          const allResults: T[] = [];
          let cursor: string | undefined = undefined;
          let hasMore = true;

          while (hasMore) {
            const response = await paginatedFn(cursor);
            allResults.push(...response.results);
            hasMore = response.has_more && response.next_cursor !== null;
            cursor = response.next_cursor || undefined;

            if (maxResults && allResults.length >= maxResults) {
              return allResults.slice(0, maxResults);
            }
          }

          return allResults;
        };

        let result: any;

        // ==================== PAGE OPERATIONS ====================
        if (resource === 'page') {
          if (operation === 'get') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            if (!pageId) {
              return { ...inputObj, _error: 'Notion node: pageId is required for get operation' };
            }
            result = await notion.pages.retrieve({ page_id: pageId });
          } else if (operation === 'create') {
            const databaseId = resolveString(getStringProperty(config, 'databaseId', ''));
            const parentPageId = resolveString(getStringProperty(config, 'parentPageId', ''));
            const properties = getJsonProp('properties');
            const children = getJsonProp('children');

            if (!databaseId && !parentPageId) {
              return { ...inputObj, _error: 'Notion node: Either databaseId or parentPageId is required for create operation' };
            }
            if (databaseId && parentPageId) {
              return { ...inputObj, _error: 'Notion node: Cannot specify both databaseId and parentPageId' };
            }

            const pageData: any = {};

            if (databaseId) {
              // Create page in database
              pageData.parent = { database_id: databaseId };
              if (!properties) {
                return { ...inputObj, _error: 'Notion node: properties is required when creating page in database' };
              }
              pageData.properties = properties;
            } else {
              // Create page as child
              pageData.parent = { page_id: parentPageId };
              if (!children || !Array.isArray(children) || children.length === 0) {
                return { ...inputObj, _error: 'Notion node: children (blocks array) is required when creating page as child' };
              }
              pageData.children = children;
            }

            result = await notion.pages.create(pageData);
          } else if (operation === 'update') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            if (!pageId) {
              return { ...inputObj, _error: 'Notion node: pageId is required for update operation' };
            }
            const properties = getJsonProp('properties');
            if (!properties) {
              return { ...inputObj, _error: 'Notion node: properties is required for update operation' };
            }
            result = await notion.pages.update({
              page_id: pageId,
              properties,
            });
          } else if (operation === 'archive') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            if (!pageId) {
              return { ...inputObj, _error: 'Notion node: pageId is required for archive operation' };
            }
            result = await notion.pages.update({
              page_id: pageId,
              archived: true,
            });
          } else if (operation === 'restore') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            if (!pageId) {
              return { ...inputObj, _error: 'Notion node: pageId is required for restore operation' };
            }
            result = await notion.pages.update({
              page_id: pageId,
              archived: false,
            });
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "page"` };
          }
        }
        // ==================== DATABASE OPERATIONS ====================
        else if (resource === 'database') {
          if (operation === 'get') {
            const databaseId = resolveString(getStringProperty(config, 'databaseId', ''));
            if (!databaseId) {
              return { ...inputObj, _error: 'Notion node: databaseId is required for get operation' };
            }
            result = await notion.databases.retrieve({ database_id: databaseId });
          } else if (operation === 'list') {
            // List databases using search endpoint
            const filter = getJsonProp('filter') || { property: 'object', value: 'database' };
            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;

            const searchFn = async (cursor?: string) => {
              return await notion.search({
                filter: filter as any,
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              });
            };

            if (returnAll) {
              const allResults = await collectAllPages(searchFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await searchFn();
            }
          } else if (operation === 'query') {
            const databaseId = resolveString(getStringProperty(config, 'databaseId', ''));
            if (!databaseId) {
              return { ...inputObj, _error: 'Notion node: databaseId is required for query operation' };
            }
            const query = getJsonProp('query') || {};
            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;
            // start_cursor can be included in query object if needed
            const startCursor = (query as any)?.start_cursor;

            const queryFn = async (cursor?: string) => {
              return await notion.databases.query({
                database_id: databaseId,
                ...query,
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              });
            };

            if (returnAll) {
              const allResults = await collectAllPages(queryFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await queryFn(startCursor || undefined);
            }
          } else if (operation === 'create') {
            const parentPageId = resolveString(getStringProperty(config, 'parentPageId', ''));
            const title = getJsonProp('title');
            const schema = getJsonProp('schema');
            const isInline = getBooleanProperty(config, 'isInline', false);

            if (!parentPageId) {
              return { ...inputObj, _error: 'Notion node: parentPageId is required for create database operation' };
            }
            if (!title) {
              return { ...inputObj, _error: 'Notion node: title is required for create database operation' };
            }
            if (!schema) {
              return { ...inputObj, _error: 'Notion node: schema is required for create database operation' };
            }

            result = await notion.databases.create({
              parent: { page_id: parentPageId },
              title: title as any,
              properties: schema as any,
              is_inline: isInline,
            });
          } else if (operation === 'update') {
            const databaseId = resolveString(getStringProperty(config, 'databaseId', ''));
            if (!databaseId) {
              return { ...inputObj, _error: 'Notion node: databaseId is required for update operation' };
            }
            const title = getJsonProp('title');
            const schema = getJsonProp('schema');

            const updateData: any = {};
            if (title) updateData.title = title;
            if (schema) updateData.properties = schema;

            if (Object.keys(updateData).length === 0) {
              return { ...inputObj, _error: 'Notion node: At least title or schema must be provided for update operation' };
            }

            result = await notion.databases.update({
              database_id: databaseId,
              ...updateData,
            });
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "database"` };
          }
        }
        // ==================== BLOCK OPERATIONS ====================
        else if (resource === 'block') {
          if (operation === 'get') {
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));
            if (!blockId) {
              return { ...inputObj, _error: 'Notion node: blockId is required for get operation' };
            }
            result = await notion.blocks.retrieve({ block_id: blockId });
          } else if (operation === 'listChildren') {
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));
            if (!blockId) {
              return { ...inputObj, _error: 'Notion node: blockId is required for listChildren operation' };
            }
            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;

            const listFn = async (cursor?: string) => {
              return await notion.blocks.children.list({
                block_id: blockId,
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              });
            };

            if (returnAll) {
              const allResults = await collectAllPages(listFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await listFn();
            }
          } else if (operation === 'appendChildren') {
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));
            if (!blockId) {
              return { ...inputObj, _error: 'Notion node: blockId is required for appendChildren operation' };
            }
            const children = getJsonProp('children');
            if (!children || !Array.isArray(children) || children.length === 0) {
              return { ...inputObj, _error: 'Notion node: children (blocks array) is required for appendChildren operation' };
            }
            result = await notion.blocks.children.append({
              block_id: blockId,
              children: children as any,
            });
          } else if (operation === 'update') {
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));
            if (!blockId) {
              return { ...inputObj, _error: 'Notion node: blockId is required for update operation' };
            }
            const children = getJsonProp('children');
            if (!children || typeof children !== 'object' || Array.isArray(children)) {
              return { ...inputObj, _error: 'Notion node: children (block content object, e.g., {"paragraph": {"rich_text": [...]}}) is required for update operation' };
            }

            result = await notion.blocks.update({
              block_id: blockId,
              ...(children as any),
            });
          } else if (operation === 'delete') {
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));
            if (!blockId) {
              return { ...inputObj, _error: 'Notion node: blockId is required for delete operation' };
            }
            result = await notion.blocks.update({
              block_id: blockId,
              archived: true,
            });
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "block"` };
          }
        }
        // ==================== USER OPERATIONS ====================
        else if (resource === 'user') {
          if (operation === 'get') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!userId) {
              return { ...inputObj, _error: 'Notion node: userId is required for get operation' };
            }
            result = await notion.users.retrieve({ user_id: userId });
          } else if (operation === 'list') {
            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;

            const listFn = async (cursor?: string) => {
              return await notion.users.list({
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              });
            };

            if (returnAll) {
              const allResults = await collectAllPages(listFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await listFn();
            }
          } else if (operation === 'getMe') {
            result = await notion.users.me({});
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "user"` };
          }
        }
        // ==================== COMMENT OPERATIONS ====================
        else if (resource === 'comment') {
          if (operation === 'get') {
            // Notion API does not support retrieving a single comment by ID
            // Comments can only be listed using the list operation
            return { ...inputObj, _error: 'Notion node: The Notion API does not support retrieving a single comment by ID. Please use the "list" operation to retrieve comments for a page or block.' };
          } else if (operation === 'list') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            const blockId = resolveString(getStringProperty(config, 'blockId', ''));

            if (!pageId && !blockId) {
              return { ...inputObj, _error: 'Notion node: Either pageId or blockId is required for list comments operation' };
            }

            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;

            const listFn = async (cursor?: string) => {
              const params: any = {
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              };
              if (pageId) {
                params.page_id = pageId;
              } else {
                params.block_id = blockId;
              }
              return await notion.comments.list(params);
            };

            if (returnAll) {
              const allResults = await collectAllPages(listFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await listFn();
            }
          } else if (operation === 'create') {
            const pageId = resolveString(getStringProperty(config, 'pageId', ''));
            const parentDiscussionId = resolveString(getStringProperty(config, 'parentDiscussionId', ''));
            const richText = getJsonProp('richText');

            if (!pageId && !parentDiscussionId) {
              return { ...inputObj, _error: 'Notion node: Either pageId or parentDiscussionId is required for create comment operation' };
            }
            if (!richText || !Array.isArray(richText) || richText.length === 0) {
              return { ...inputObj, _error: 'Notion node: richText array is required for create comment operation' };
            }

            const commentData: any = {
              rich_text: richText,
            };
            if (pageId) {
              commentData.parent = { page_id: pageId };
            } else {
              commentData.parent = { discussion_id: parentDiscussionId };
            }

            result = await notion.comments.create(commentData);
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "comment"` };
          }
        }
        // ==================== SEARCH OPERATIONS ====================
        else if (resource === 'search') {
          if (operation === 'search') {
            const searchQuery = resolveString(getStringProperty(config, 'searchQuery', ''));
            const filter = getJsonProp('filter');
            const sort = getJsonProp('sort');
            const returnAll = getBooleanProperty(config, 'returnAll', false);
            const pageSize = resolveNumber(getStringProperty(config, 'pageSize', '100'), 100) || 100;

            const searchFn = async (cursor?: string) => {
              const params: any = {
                start_cursor: cursor,
                page_size: Math.min(Math.max(1, pageSize), 100),
              };
              if (searchQuery) {
                params.query = searchQuery;
              }
              if (filter) {
                params.filter = filter;
              }
              if (sort) {
                params.sort = sort;
              }
              return await notion.search(params);
            };

            if (returnAll) {
              const allResults = await collectAllPages(searchFn);
              result = { results: allResults, object: 'list' };
            } else {
              result = await searchFn();
            }
          } else {
            return { ...inputObj, _error: `Notion node: Unknown operation "${operation}" for resource "search"` };
          }
        } else {
          return { ...inputObj, _error: `Notion node: Unknown resource "${resource}"` };
        }

        // Return successful result
        return {
          ...inputObj,
          data: result,
          success: true,
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Notion operation failed';
        const statusCode = error?.status || error?.code || 'unknown';
        console.error('Notion error:', error);

        return {
          ...inputObj,
          _error: `Notion node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            code: error?.code,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'twitter': {
      // ✅ Twitter/X node with comprehensive resource and operation support
      // Supports: tweet, user, timeline, search, list, media, directMessage, space
      // Uses OAuth token from header (via Supabase)
      const resource = getStringProperty(config, 'resource', 'tweet');
      const operation = getStringProperty(config, 'operation', 'create');

      // Use typed execution context
      const execContext = createTypedContext();
      
      // Get OAuth token from Supabase
      const userIdsToTry: string[] = [];
      if (userId) userIdsToTry.push(userId);
      if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);

      const resolvedAccessToken = userIdsToTry.length > 0 
        ? await getTwitterAccessToken(supabase, userIdsToTry)
        : null;

      if (!resolvedAccessToken) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have a Twitter account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have a Twitter account connected.`
          : '';
        
        return {
          ...inputObj,
          _error: `Twitter node: OAuth connection required. ${ownerMessage} ${currentUserMessage} Please connect your Twitter account in the Connections panel.`,
        };
      }

      try {
        // Initialize Twitter client
        const client = new TwitterApi(resolvedAccessToken);
        const twitter = client.readWrite;

        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseInt(resolved, 10);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              const parsed = parseInt(value, 10);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to resolve boolean
        const resolveBoolean = (value: any, defaultValue: boolean = false): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              return typeof resolved === 'boolean' ? resolved : defaultValue;
            }
            return value.toLowerCase() === 'true' || value === '1';
          }
          return defaultValue;
        };

        let result: any;

        // ==================== TWEET OPERATIONS ====================
        if (resource === 'tweet') {
          if (operation === 'create') {
            const text = resolveString(getStringProperty(config, 'text', ''));
            if (!text) {
              return { ...inputObj, _error: 'Twitter node: text is required for create operation' };
            }
            const mediaIds = getJsonProp('mediaIds');
            const replySettings = resolveString(getStringProperty(config, 'replySettings', 'everyone'));
            
            result = await twitter.v2.tweet({
              text,
              media: mediaIds ? { media_ids: mediaIds } : undefined,
              reply_settings: replySettings === 'everyone' ? undefined : replySettings as any,
            });
          } else if (operation === 'get') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for get operation' };
            }
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const userFields = getJsonProp('userFields');
            
            result = await twitter.v2.singleTweet(tweetId, {
              expansions,
              'tweet.fields': tweetFields,
              'user.fields': userFields,
            });
          } else if (operation === 'lookup') {
            const tweetIds = getJsonProp('tweetIds');
            if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
              return { ...inputObj, _error: 'Twitter node: tweetIds (array) is required for lookup operation' };
            }
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const userFields = getJsonProp('userFields');
            
            result = await twitter.v2.tweets(tweetIds, {
              expansions,
              'tweet.fields': tweetFields,
              'user.fields': userFields,
            });
          } else if (operation === 'delete') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for delete operation' };
            }
            result = await twitter.v2.deleteTweet(tweetId);
          } else if (operation === 'like') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for like operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.like((me.data as { id: string }).id, tweetId);
          } else if (operation === 'unlike') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for unlike operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.unlike((me.data as { id: string }).id, tweetId);
          } else if (operation === 'retweet') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for retweet operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.retweet((me.data as { id: string }).id, tweetId);
          } else if (operation === 'unretweet') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for unretweet operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.unretweet((me.data as { id: string }).id, tweetId);
          } else if (operation === 'quoteTweet') {
            const text = resolveString(getStringProperty(config, 'text', ''));
            const quoteTweetId = resolveString(getStringProperty(config, 'quoteTweetId', ''));
            if (!text || !quoteTweetId) {
              return { ...inputObj, _error: 'Twitter node: text and quoteTweetId are required for quoteTweet operation' };
            }
            const mediaIds = getJsonProp('mediaIds');
            
            result = await twitter.v2.tweet({
              text,
              quote_tweet_id: quoteTweetId,
              media: mediaIds ? { media_ids: mediaIds } : undefined,
            });
          } else if (operation === 'reply') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            const text = resolveString(getStringProperty(config, 'text', ''));
            if (!tweetId || !text) {
              return { ...inputObj, _error: 'Twitter node: tweetId and text are required for reply operation' };
            }
            const mediaIds = getJsonProp('mediaIds');
            
            result = await twitter.v2.reply(text, tweetId, {
              media: mediaIds ? { media_ids: mediaIds } : undefined,
            });
          } else if (operation === 'hideReply') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            const hidden = resolveBoolean(getStringProperty(config, 'hidden', 'false'), false);
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for hideReply operation' };
            }
            result = await twitter.v2.hideReply(tweetId, hidden);
          } else if (operation === 'bookmark') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for bookmark operation' };
            }
            result = await twitter.v2.bookmark(tweetId);
          } else if (operation === 'removeBookmark') {
            const tweetId = resolveString(getStringProperty(config, 'tweetId', ''));
            if (!tweetId) {
              return { ...inputObj, _error: 'Twitter node: tweetId is required for removeBookmark operation' };
            }
            result = await twitter.v2.deleteBookmark(tweetId);
          } else if (operation === 'getBookmarks') {
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const userFields = getJsonProp('userFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const bookmarks = await twitter.v2.bookmarks({
                max_results: 100,
                expansions,
                'tweet.fields': tweetFields,
                'user.fields': userFields,
              });
              result = bookmarks;
            } else {
              result = await twitter.v2.bookmarks({
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'tweet.fields': tweetFields,
                'user.fields': userFields,
              });
            }
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "tweet"` };
          }
        }
        // ==================== USER OPERATIONS ====================
        else if (resource === 'user') {
          if (operation === 'get') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            const username = resolveString(getStringProperty(config, 'username', ''));
            if (!userId && !username) {
              return { ...inputObj, _error: 'Twitter node: Either userId or username is required for get user operation' };
            }
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const tweetFields = getJsonProp('tweetFields');
            
            if (username) {
              result = await twitter.v2.userByUsername(username.replace('@', ''), {
                expansions,
                'user.fields': userFields,
                'tweet.fields': tweetFields,
              });
            } else {
              result = await twitter.v2.user(userId, {
                expansions,
                'user.fields': userFields,
                'tweet.fields': tweetFields,
              });
            }
          } else if (operation === 'lookup') {
            const userIds = getJsonProp('userIds');
            const usernames = getJsonProp('usernames');
            if ((!userIds || !Array.isArray(userIds) || userIds.length === 0) && 
                (!usernames || !Array.isArray(usernames) || usernames.length === 0)) {
              return { ...inputObj, _error: 'Twitter node: Either userIds or usernames (array) is required for lookup operation' };
            }
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const tweetFields = getJsonProp('tweetFields');
            
            if (usernames && usernames.length > 0) {
              const cleanUsernames = usernames.map((u: string) => u.replace('@', ''));
              result = await twitter.v2.usersByUsernames(cleanUsernames, {
                expansions,
                'user.fields': userFields,
                'tweet.fields': tweetFields,
              });
            } else {
              result = await twitter.v2.users(userIds, {
                expansions,
                'user.fields': userFields,
                'tweet.fields': tweetFields,
              });
            }
          } else if (operation === 'getMe') {
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const tweetFields = getJsonProp('tweetFields');
            
            result = await twitter.v2.me({
              expansions,
              'user.fields': userFields,
              'tweet.fields': tweetFields,
            });
          } else if (operation === 'follow') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for follow operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.follow((me.data as { id: string }).id, targetUserId);
          } else if (operation === 'unfollow') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for unfollow operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.unfollow((me.data as { id: string }).id, targetUserId);
          } else if (operation === 'getFollowers') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!userId) {
              return { ...inputObj, _error: 'Twitter node: userId is required for getFollowers operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const followers = await twitter.v2.followers(userId, {
                max_results: 100,
                expansions,
                'user.fields': userFields,
              });
              result = followers;
            } else {
              result = await twitter.v2.followers(userId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'user.fields': userFields,
              });
            }
          } else if (operation === 'getFollowing') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!userId) {
              return { ...inputObj, _error: 'Twitter node: userId is required for getFollowing operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const following = await twitter.v2.following(userId, {
                max_results: 100,
                expansions,
                'user.fields': userFields,
              });
              result = following;
            } else {
              result = await twitter.v2.following(userId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'user.fields': userFields,
              });
            }
          } else if (operation === 'block') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for block operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.block((me.data as { id: string }).id, targetUserId);
          } else if (operation === 'unblock') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for unblock operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.unblock((me.data as { id: string }).id, targetUserId);
          } else if (operation === 'mute') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for mute operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.mute((me.data as { id: string }).id, targetUserId);
          } else if (operation === 'unmute') {
            const targetUserId = resolveString(getStringProperty(config, 'targetUserId', ''));
            if (!targetUserId) {
              return { ...inputObj, _error: 'Twitter node: targetUserId is required for unmute operation' };
            }
            const me = await twitter.v2.me();
            result = await twitter.v2.unmute((me.data as { id: string }).id, targetUserId);
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "user"` };
          }
        }
        // ==================== TIMELINE OPERATIONS ====================
        else if (resource === 'timeline') {
          if (operation === 'userTimeline') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!userId) {
              return { ...inputObj, _error: 'Twitter node: userId is required for userTimeline operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const exclude = getJsonProp('exclude');
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const timeline = await twitter.v2.userTimeline(userId, {
                max_results: 100,
                exclude,
                expansions,
                'tweet.fields': tweetFields,
              });
              result = timeline;
            } else {
              result = await twitter.v2.userTimeline(userId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                exclude,
                expansions,
                'tweet.fields': tweetFields,
              });
            }
          } else if (operation === 'homeTimeline') {
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const timeline = await twitter.v2.homeTimeline({
                max_results: 100,
                expansions,
                'tweet.fields': tweetFields,
              });
              result = timeline;
            } else {
              result = await twitter.v2.homeTimeline({
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'tweet.fields': tweetFields,
              });
            }
          } else if (operation === 'mentions') {
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!userId) {
              return { ...inputObj, _error: 'Twitter node: userId is required for mentions operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const mentions = await twitter.v2.userMentionTimeline(userId, {
                max_results: 100,
                expansions,
                'tweet.fields': tweetFields,
              });
              result = mentions;
            } else {
              result = await twitter.v2.userMentionTimeline(userId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'tweet.fields': tweetFields,
              });
            }
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "timeline"` };
          }
        }
        // ==================== SEARCH OPERATIONS ====================
        else if (resource === 'search') {
          const query = resolveString(getStringProperty(config, 'query', ''));
          if (!query) {
            return { ...inputObj, _error: 'Twitter node: query is required for search operations' };
          }
          
          const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
          const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
          const startTime = resolveString(getStringProperty(config, 'startTime', ''));
          const endTime = resolveString(getStringProperty(config, 'endTime', ''));
          const sortOrder = resolveString(getStringProperty(config, 'sortOrder', 'relevancy'));
          const expansions = getJsonProp('expansions');
          const tweetFields = getJsonProp('tweetFields');
          const userFields = getJsonProp('userFields');
          const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
          
          if (operation === 'recent') {
            const searchOptions: any = {
              max_results: Math.min(Math.max(1, maxResults), 100),
              expansions,
              'tweet.fields': tweetFields,
              'user.fields': userFields,
            };
            if (startTime) searchOptions.start_time = startTime;
            if (endTime) searchOptions.end_time = endTime;
            if (sortOrder) searchOptions.sort_order = sortOrder;
            if (paginationToken) searchOptions.next_token = paginationToken;
            
            if (returnAll) {
              const search = await twitter.v2.search(query, {
                max_results: 100,
                ...searchOptions,
              });
              result = search;
            } else {
              result = await twitter.v2.search(query, searchOptions);
            }
          } else if (operation === 'tweetCounts') {
            const granularity = resolveString(getStringProperty(config, 'granularity', 'hour'));
            const countOptions: any = {
              granularity: granularity as any,
            };
            if (startTime) countOptions.start_time = startTime;
            if (endTime) countOptions.end_time = endTime;
            
            result = await twitter.v2.tweetCountRecent(query, countOptions);
          } else if (operation === 'all') {
            // Full archive search - requires Academic Research or Enterprise API access
            const searchOptions: any = {
              max_results: Math.min(Math.max(1, maxResults), 500),
              expansions,
              'tweet.fields': tweetFields,
              'user.fields': userFields,
            };
            if (startTime) searchOptions.start_time = startTime;
            if (endTime) searchOptions.end_time = endTime;
            if (sortOrder) searchOptions.sort_order = sortOrder;
            if (paginationToken) searchOptions.next_token = paginationToken;
            
            // Note: tweetCountAll requires Academic Research API access
            // This will fail with 403 if account doesn't have access
            try {
              if (returnAll) {
                const search = await twitter.v2.searchAll(query, {
                  max_results: 500,
                  ...searchOptions,
                });
                result = search;
              } else {
                result = await twitter.v2.searchAll(query, searchOptions);
              }
            } catch (error: any) {
              if (error?.code === 403 || error?.status === 403) {
                return { 
                  ...inputObj, 
                  _error: 'Twitter node: Full archive search requires Academic Research or Enterprise API access. Please upgrade your Twitter Developer account or use the "recent" operation instead.' 
                };
              }
              throw error;
            }
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "search"` };
          }
        }
        // ==================== LIST OPERATIONS ====================
        else if (resource === 'list') {
          if (operation === 'create') {
            const name = resolveString(getStringProperty(config, 'name', ''));
            if (!name) {
              return { ...inputObj, _error: 'Twitter node: name is required for create list operation' };
            }
            const description = resolveString(getStringProperty(config, 'description', ''));
            const isPrivate = resolveBoolean(getStringProperty(config, 'private', 'false'), false);
            const me = await twitter.v2.me();
            
            result = await twitter.v2.createList({
              name,
              description: description || undefined,
              private: isPrivate,
            });
          } else if (operation === 'get') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            if (!listId) {
              return { ...inputObj, _error: 'Twitter node: listId is required for get list operation' };
            }
            const expansions = getJsonProp('expansions');
            const listFields = getJsonProp('listFields');
            const userFields = getJsonProp('userFields');
            
            result = await twitter.v2.list(listId, {
              expansions,
              'list.fields': listFields,
              'user.fields': userFields,
            });
          } else if (operation === 'update') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            if (!listId) {
              return { ...inputObj, _error: 'Twitter node: listId is required for update list operation' };
            }
            const name = resolveString(getStringProperty(config, 'name', ''));
            const description = resolveString(getStringProperty(config, 'description', ''));
            const isPrivate = resolveBoolean(getStringProperty(config, 'private', 'false'), false);
            
            result = await twitter.v2.updateList(listId, {
              name: name || undefined,
              description: description || undefined,
              private: isPrivate,
            });
          } else if (operation === 'delete') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            if (!listId) {
              return { ...inputObj, _error: 'Twitter node: listId is required for delete list operation' };
            }
            result = await twitter.v2.removeList(listId);
          } else if (operation === 'addMember') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!listId || !userId) {
              return { ...inputObj, _error: 'Twitter node: listId and userId are required for addMember operation' };
            }
            result = await twitter.v2.addListMember(listId, userId);
          } else if (operation === 'removeMember') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            const userId = resolveString(getStringProperty(config, 'userId', ''));
            if (!listId || !userId) {
              return { ...inputObj, _error: 'Twitter node: listId and userId are required for removeMember operation' };
            }
            result = await twitter.v2.removeListMember(listId, userId);
          } else if (operation === 'getMembers') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            if (!listId) {
              return { ...inputObj, _error: 'Twitter node: listId is required for getMembers operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const userFields = getJsonProp('userFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const members = await twitter.v2.listMembers(listId, {
                max_results: 100,
                expansions,
                'user.fields': userFields,
              });
              result = members;
            } else {
              result = await twitter.v2.listMembers(listId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'user.fields': userFields,
              });
            }
          } else if (operation === 'getTweets') {
            const listId = resolveString(getStringProperty(config, 'listId', ''));
            if (!listId) {
              return { ...inputObj, _error: 'Twitter node: listId is required for getTweets operation' };
            }
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const expansions = getJsonProp('expansions');
            const tweetFields = getJsonProp('tweetFields');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const tweets = await twitter.v2.listTweets(listId, {
                max_results: 100,
                expansions,
                'tweet.fields': tweetFields,
              });
              result = tweets;
            } else {
              result = await twitter.v2.listTweets(listId, {
                max_results: Math.min(Math.max(1, maxResults), 100),
                pagination_token: paginationToken || undefined,
                expansions,
                'tweet.fields': tweetFields,
              });
            }
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "list"` };
          }
        }
        // ==================== MEDIA OPERATIONS ====================
        else if (resource === 'media') {
          if (operation === 'upload') {
            const mediaData = resolveString(getStringProperty(config, 'mediaData', ''));
            if (!mediaData) {
              return { ...inputObj, _error: 'Twitter node: mediaData is required for upload operation' };
            }
            const mediaType = resolveString(getStringProperty(config, 'mediaType', 'image/jpeg'));
            const mediaCategory = resolveString(getStringProperty(config, 'mediaCategory', 'tweet_image'));
            
            // Handle base64 or URL
            let buffer: Buffer;
            if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
              // Download from URL
              const response = await fetch(mediaData);
              const arrayBuffer = await response.arrayBuffer();
              buffer = Buffer.from(arrayBuffer);
            } else {
              // Assume base64
              buffer = Buffer.from(mediaData, 'base64');
            }
            
            result = await twitter.v1.uploadMedia(buffer, {
              mimeType: mediaType,
              additionalOwners: undefined,
              ...(mediaCategory && { media_category: mediaCategory }),
            });
          } else if (operation === 'get') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Twitter node: mediaId is required for get media operation' };
            }
            // Twitter API v2 doesn't have a direct get media endpoint
            // Media info is usually included in tweet expansions
            result = { media_id: mediaId, note: 'Use tweet expansions to get media details' };
          } else if (operation === 'metadata') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            const altText = resolveString(getStringProperty(config, 'altText', ''));
            if (!mediaId || !altText) {
              return { ...inputObj, _error: 'Twitter node: mediaId and altText are required for metadata operation' };
            }
            result = await twitter.v1.createMediaMetadata(mediaId, { alt_text: { text: altText } });
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "media"` };
          }
        }
        // ==================== DIRECT MESSAGE OPERATIONS ====================
        else if (resource === 'directMessage') {
          if (operation === 'send') {
            const recipientId = resolveString(getStringProperty(config, 'recipientId', ''));
            const text = resolveString(getStringProperty(config, 'text', ''));
            if (!recipientId || !text) {
              return { ...inputObj, _error: 'Twitter node: recipientId and text are required for send DM operation' };
            }
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            result = await (twitter.v1 as any).sendDm({
              recipient_id: recipientId,
              text,
              ...(mediaId && { media_id: mediaId }),
            });
          } else if (operation === 'get') {
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const paginationToken = resolveString(getStringProperty(config, 'paginationToken', ''));
            const eventTypes = getJsonProp('eventTypes');
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            if (returnAll) {
              const dms = await (twitter.v1 as any).listDmEvents({
                count: 50,
                event_types: eventTypes || undefined,
              });
              result = dms;
            } else {
              result = await (twitter.v1 as any).listDmEvents({
                count: Math.min(Math.max(1, maxResults), 50),
                next_cursor: paginationToken || undefined,
                event_types: eventTypes || undefined,
              });
            }
          } else if (operation === 'delete') {
            const dmEventId = resolveString(getStringProperty(config, 'dmEventId', ''));
            if (!dmEventId) {
              return { ...inputObj, _error: 'Twitter node: dmEventId is required for delete DM operation' };
            }
            result = await (twitter.v1 as any).deleteDm(dmEventId);
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "directMessage"` };
          }
        }
        // ==================== SPACE OPERATIONS ====================
        else if (resource === 'space') {
          if (operation === 'get') {
            const spaceId = resolveString(getStringProperty(config, 'spaceId', ''));
            if (!spaceId) {
              return { ...inputObj, _error: 'Twitter node: spaceId is required for get space operation' };
            }
            const expansions = getJsonProp('expansions');
            const spaceFields = getJsonProp('spaceFields');
            const userFields = getJsonProp('userFields');
            
            result = await twitter.v2.spaces([spaceId], {
              expansions,
              'space.fields': spaceFields,
              'user.fields': userFields,
            });
          } else if (operation === 'list') {
            const userIds = getJsonProp('userIds');
            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
              return { ...inputObj, _error: 'Twitter node: userIds (array) is required for list spaces operation' };
            }
            const expansions = getJsonProp('expansions');
            const spaceFields = getJsonProp('spaceFields');
            
            result = await twitter.v2.spacesByCreators(userIds, {
              expansions,
              'space.fields': spaceFields,
            });
          } else if (operation === 'search') {
            const query = resolveString(getStringProperty(config, 'query', ''));
            if (!query) {
              return { ...inputObj, _error: 'Twitter node: query is required for search spaces operation' };
            }
            const state = resolveString(getStringProperty(config, 'state', 'live'));
            const maxResults = resolveNumber(getStringProperty(config, 'maxResults', '10'), 10) || 10;
            const expansions = getJsonProp('expansions');
            const spaceFields = getJsonProp('spaceFields');
            
            result = await twitter.v2.searchSpaces({
              query,
              state: state as any,
              max_results: Math.min(Math.max(1, maxResults), 100),
              expansions,
              'space.fields': spaceFields,
            });
          } else if (operation === 'getParticipants') {
            // Note: spaceParticipants is not available in the current twitter-api-v2 SDK
            // The Twitter API v2 doesn't provide a direct endpoint for space participants
            // You can use spaceBuyers for ticketed spaces or get space details which includes participant_count
            return { ...inputObj, _error: 'Twitter node: getParticipants operation is not available. Use get operation to retrieve space details including participant_count, or use spaceBuyers for ticketed spaces.' };
          } else {
            return { ...inputObj, _error: `Twitter node: Unknown operation "${operation}" for resource "space"` };
          }
        }
        else {
          return { ...inputObj, _error: `Twitter node: Unknown resource "${resource}"` };
        }

        // Return result
        return {
          ...inputObj,
          ...result,
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Twitter operation failed';
        const statusCode = error?.status || error?.code || 'unknown';
        console.error('Twitter error:', error);

        return {
          ...inputObj,
          _error: `Twitter node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            code: error?.code,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'instagram': {
      // ✅ Instagram node with comprehensive resource and operation support
      // Supports: user, media, comment, hashtag, story, insights
      // Uses Facebook OAuth token with Instagram permissions (via Supabase)
      const resource = getStringProperty(config, 'resource', 'user');
      const operation = getStringProperty(config, 'operation', 'get');

      // Use typed execution context
      const execContext = createTypedContext();
      
      // Get OAuth token from Supabase
      const userIdsToTry: string[] = [];
      if (userId) userIdsToTry.push(userId);
      if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);

      const resolvedAccessToken = userIdsToTry.length > 0 
        ? await getInstagramAccessToken(supabase, userIdsToTry)
        : null;

      if (!resolvedAccessToken) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have an Instagram/Facebook account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have an Instagram/Facebook account connected.`
          : '';
        
        return {
          ...inputObj,
          _error: `Instagram node: OAuth connection required. ${ownerMessage} ${currentUserMessage} Please connect your Instagram/Facebook account in the Connections panel.`,
        };
      }

      try {
        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseInt(resolved, 10);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              const parsed = parseInt(value, 10);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to resolve boolean
        const resolveBoolean = (value: any, defaultValue: boolean = false): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              return typeof resolved === 'boolean' ? resolved : defaultValue;
            }
            return value.toLowerCase() === 'true' || value === '1';
          }
          return defaultValue;
        };

        // Helper to get Instagram Business Account ID
        const getIgAccountId = async (): Promise<string | null> => {
          const providedId = resolveString(getStringProperty(config, 'instagramBusinessAccountId', ''));
          if (providedId) return providedId;
          return await getInstagramBusinessAccountId(resolvedAccessToken);
        };

        // Helper to make Instagram Graph API requests
        const makeInstagramRequest = async (
          endpoint: string,
          method: 'GET' | 'POST' | 'DELETE' = 'GET',
          body?: any
        ): Promise<any> => {
          const url = `https://graph.facebook.com/v18.0${endpoint}`;
          const params = new URLSearchParams();
          params.append('access_token', resolvedAccessToken);
          
          if (method === 'GET' && body) {
            Object.entries(body).forEach(([key, value]) => {
              if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                  params.append(key, value.join(','));
                } else {
                  params.append(key, String(value));
                }
              }
            });
          }

          const options: RequestInit = {
            method,
            headers: {
              'Content-Type': 'application/json',
            },
          };

          if (method === 'POST' || method === 'DELETE') {
            if (body) {
              options.body = JSON.stringify(body);
            }
          }

          const fullUrl = method === 'GET' ? `${url}?${params.toString()}` : url;
          if (method === 'POST' || method === 'DELETE') {
            const postParams = new URLSearchParams();
            postParams.append('access_token', resolvedAccessToken);
            const response = await fetch(`${url}?${postParams.toString()}`, options);
            const data = await response.json() as any;
            if (!response.ok) {
              throw new Error((data as any)?.error?.message || `Instagram API error: ${response.statusText}`);
            }
            return data;
          } else {
            const response = await fetch(fullUrl, options);
            const data = await response.json() as any;
            if (!response.ok) {
              throw new Error((data as any)?.error?.message || `Instagram API error: ${response.statusText}`);
            }
            return data;
          }
        };

        let result: any;
        const igAccountId = await getIgAccountId();

        // ==================== USER OPERATIONS ====================
        if (resource === 'user') {
          if (operation === 'get') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID. Please provide instagramBusinessAccountId or ensure your Facebook Page is connected to an Instagram Business Account.' };
            }
            const fields = resolveString(getStringProperty(config, 'fields', 'id,username,account_type,media_count'));
            result = await makeInstagramRequest(`/${igAccountId}`, 'GET', {
              fields: fields || undefined,
            });
          } else if (operation === 'getMedia') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allMedia: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${igAccountId}/media`, 'GET', pageParams);
                if (pageResult.data) {
                  allMedia.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allMedia.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allMedia };
            } else {
              result = await makeInstagramRequest(`/${igAccountId}/media`, 'GET', params);
            }
          } else if (operation === 'getInsights') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const metric = resolveString(getStringProperty(config, 'metric', ''));
            if (!metric) {
              return { ...inputObj, _error: 'Instagram node: metric is required for getInsights operation.' };
            }
            const period = resolveString(getStringProperty(config, 'period', 'day'));
            const since = resolveString(getStringProperty(config, 'since', ''));
            const until = resolveString(getStringProperty(config, 'until', ''));
            
            const params: any = {
              metric,
              period,
            };
            if (since) params.since = since;
            if (until) params.until = until;

            result = await makeInstagramRequest(`/${igAccountId}/insights`, 'GET', params);
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "user"` };
          }
        }
        // ==================== MEDIA OPERATIONS ====================
        else if (resource === 'media') {
          if (operation === 'get') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for get operation' };
            }
            const fields = resolveString(getStringProperty(config, 'fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count'));
            result = await makeInstagramRequest(`/${mediaId}`, 'GET', {
              fields: fields || undefined,
            });
          } else if (operation === 'list') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allMedia: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${igAccountId}/media`, 'GET', pageParams);
                if (pageResult.data) {
                  allMedia.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allMedia.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allMedia };
            } else {
              result = await makeInstagramRequest(`/${igAccountId}/media`, 'GET', params);
            }
          } else if (operation === 'create') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const mediaType = resolveString(getStringProperty(config, 'media_type', 'IMAGE'));
            const mediaUrl = resolveString(getStringProperty(config, 'media_url', ''));
            const videoUrl = resolveString(getStringProperty(config, 'video_url', ''));
            const caption = resolveString(getStringProperty(config, 'caption', ''));
            const locationId = resolveString(getStringProperty(config, 'location_id', ''));
            const userTags = getJsonProp('user_tags');
            const productTags = getJsonProp('product_tags');
            const shareToFeed = resolveBoolean(getStringProperty(config, 'share_to_feed', 'true'), true);

            const finalMediaUrl = mediaUrl || videoUrl;
            if (!finalMediaUrl) {
              return { ...inputObj, _error: 'Instagram node: media_url or video_url is required for create operation' };
            }

            const params: any = {
              image_url: mediaType === 'IMAGE' ? finalMediaUrl : undefined,
              video_url: (mediaType === 'VIDEO' || mediaType === 'REELS') ? finalMediaUrl : undefined,
              caption: caption || undefined,
              location_id: locationId || undefined,
              user_tags: userTags ? JSON.stringify(userTags) : undefined,
              product_tags: productTags ? JSON.stringify(productTags) : undefined,
              share_to_feed: (mediaType === 'REELS' || mediaType === 'VIDEO') ? shareToFeed : undefined,
            };

            // Remove undefined values
            Object.keys(params).forEach(key => {
              if (params[key] === undefined) delete params[key];
            });

            result = await makeInstagramRequest(`/${igAccountId}/media`, 'POST', params);
          } else if (operation === 'publish') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const creationId = resolveString(getStringProperty(config, 'creation_id', ''));
            if (!creationId) {
              return { ...inputObj, _error: 'Instagram node: creation_id is required for publish operation' };
            }

            result = await makeInstagramRequest(`/${igAccountId}/media_publish`, 'POST', {
              creation_id: creationId,
            });
          } else if (operation === 'createAndPublish') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            // Create container first
            const mediaType = resolveString(getStringProperty(config, 'media_type', 'IMAGE'));
            const mediaUrl = resolveString(getStringProperty(config, 'media_url', ''));
            const videoUrl = resolveString(getStringProperty(config, 'video_url', ''));
            const caption = resolveString(getStringProperty(config, 'caption', ''));
            const locationId = resolveString(getStringProperty(config, 'location_id', ''));
            const userTags = getJsonProp('user_tags');
            const productTags = getJsonProp('product_tags');
            const shareToFeed = resolveBoolean(getStringProperty(config, 'share_to_feed', 'true'), true);

            const finalMediaUrl = mediaUrl || videoUrl;
            if (!finalMediaUrl) {
              return { ...inputObj, _error: 'Instagram node: media_url or video_url is required for createAndPublish operation' };
            }

            const createParams: any = {
              image_url: mediaType === 'IMAGE' ? finalMediaUrl : undefined,
              video_url: (mediaType === 'VIDEO' || mediaType === 'REELS') ? finalMediaUrl : undefined,
              caption: caption || undefined,
              location_id: locationId || undefined,
              user_tags: userTags ? JSON.stringify(userTags) : undefined,
              product_tags: productTags ? JSON.stringify(productTags) : undefined,
              share_to_feed: (mediaType === 'REELS' || mediaType === 'VIDEO') ? shareToFeed : undefined,
            };

            Object.keys(createParams).forEach(key => {
              if (createParams[key] === undefined) delete createParams[key];
            });

            const containerResult = await makeInstagramRequest(`/${igAccountId}/media`, 'POST', createParams);
            
            if (!containerResult.id) {
              return { ...inputObj, _error: 'Instagram node: Failed to create media container' };
            }

            // For videos, wait a bit and check status before publishing
            if (mediaType === 'VIDEO' || mediaType === 'REELS') {
              // Wait 2 seconds for video processing
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Check container status
              const statusResult = await makeInstagramRequest(`/${containerResult.id}`, 'GET', {
                fields: 'status_code',
              });
              
              if (statusResult.status_code !== 'FINISHED') {
                return { 
                  ...inputObj, 
                  _error: `Instagram node: Video is still processing. Status: ${statusResult.status_code}. Please use separate create and publish operations, or wait and retry.`,
                  container_id: containerResult.id,
                  status: statusResult.status_code,
                };
              }
            }

            // Publish the container
            result = await makeInstagramRequest(`/${igAccountId}/media_publish`, 'POST', {
              creation_id: containerResult.id,
            });
          } else if (operation === 'update') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for update operation' };
            }
            const caption = resolveString(getStringProperty(config, 'caption', ''));
            if (!caption) {
              return { ...inputObj, _error: 'Instagram node: caption is required for update operation' };
            }

            result = await makeInstagramRequest(`/${mediaId}`, 'POST', {
              caption,
            });
          } else if (operation === 'delete') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for delete operation' };
            }

            result = await makeInstagramRequest(`/${mediaId}`, 'DELETE');
          } else if (operation === 'getInsights') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for getInsights operation' };
            }
            const metric = resolveString(getStringProperty(config, 'metric', ''));
            if (!metric) {
              return { ...inputObj, _error: 'Instagram node: metric is required for getInsights operation' };
            }

            result = await makeInstagramRequest(`/${mediaId}/insights`, 'GET', {
              metric,
            });
          } else if (operation === 'getContainerStatus') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for getContainerStatus operation' };
            }

            result = await makeInstagramRequest(`/${mediaId}`, 'GET', {
              fields: 'id,status_code',
            });
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "media"` };
          }
        }
        // ==================== COMMENT OPERATIONS ====================
        else if (resource === 'comment') {
          if (operation === 'list') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for list comments operation' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,text,timestamp,username,like_count'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allComments: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${mediaId}/comments`, 'GET', pageParams);
                if (pageResult.data) {
                  allComments.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allComments.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allComments };
            } else {
              result = await makeInstagramRequest(`/${mediaId}/comments`, 'GET', params);
            }
          } else if (operation === 'get') {
            const commentId = resolveString(getStringProperty(config, 'commentId', ''));
            if (!commentId) {
              return { ...inputObj, _error: 'Instagram node: commentId is required for get operation' };
            }
            const fields = resolveString(getStringProperty(config, 'fields', 'id,text,timestamp,username,like_count'));
            result = await makeInstagramRequest(`/${commentId}`, 'GET', {
              fields: fields || undefined,
            });
          } else if (operation === 'create') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'Instagram node: mediaId is required for create comment operation' };
            }
            const message = resolveString(getStringProperty(config, 'message', ''));
            if (!message) {
              return { ...inputObj, _error: 'Instagram node: message is required for create comment operation' };
            }

            result = await makeInstagramRequest(`/${mediaId}/comments`, 'POST', {
              message,
            });
          } else if (operation === 'reply') {
            const commentId = resolveString(getStringProperty(config, 'commentId', ''));
            if (!commentId) {
              return { ...inputObj, _error: 'Instagram node: commentId is required for reply operation' };
            }
            const message = resolveString(getStringProperty(config, 'message', ''));
            if (!message) {
              return { ...inputObj, _error: 'Instagram node: message is required for reply operation' };
            }

            result = await makeInstagramRequest(`/${commentId}/replies`, 'POST', {
              message,
            });
          } else if (operation === 'delete') {
            const commentId = resolveString(getStringProperty(config, 'commentId', ''));
            if (!commentId) {
              return { ...inputObj, _error: 'Instagram node: commentId is required for delete operation' };
            }

            result = await makeInstagramRequest(`/${commentId}`, 'DELETE');
          } else if (operation === 'hide' || operation === 'unhide') {
            const commentId = resolveString(getStringProperty(config, 'commentId', ''));
            if (!commentId) {
              return { ...inputObj, _error: 'Instagram node: commentId is required for hide/unhide operation' };
            }
            const hide = resolveBoolean(getStringProperty(config, 'hide', 'true'), true);

            result = await makeInstagramRequest(`/${commentId}`, 'POST', {
              hide: operation === 'hide' ? hide : !hide,
            });
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "comment"` };
          }
        }
        // ==================== HASHTAG OPERATIONS ====================
        else if (resource === 'hashtag') {
          if (operation === 'search') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const hashtagName = resolveString(getStringProperty(config, 'hashtagName', ''));
            if (!hashtagName) {
              return { ...inputObj, _error: 'Instagram node: hashtagName is required for search operation' };
            }

            result = await makeInstagramRequest(`/ig_hashtag_search`, 'GET', {
              user_id: igAccountId,
              q: hashtagName,
            });
          } else if (operation === 'get') {
            const hashtagId = resolveString(getStringProperty(config, 'hashtagId', ''));
            if (!hashtagId) {
              return { ...inputObj, _error: 'Instagram node: hashtagId is required for get operation' };
            }

            result = await makeInstagramRequest(`/${hashtagId}`, 'GET');
          } else if (operation === 'getRecentMedia') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const hashtagId = resolveString(getStringProperty(config, 'hashtagId', ''));
            if (!hashtagId) {
              return { ...inputObj, _error: 'Instagram node: hashtagId is required for getRecentMedia operation' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              user_id: igAccountId,
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allMedia: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${hashtagId}/recent_media`, 'GET', pageParams);
                if (pageResult.data) {
                  allMedia.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allMedia.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allMedia };
            } else {
              result = await makeInstagramRequest(`/${hashtagId}/recent_media`, 'GET', params);
            }
          } else if (operation === 'getTopMedia') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const hashtagId = resolveString(getStringProperty(config, 'hashtagId', ''));
            if (!hashtagId) {
              return { ...inputObj, _error: 'Instagram node: hashtagId is required for getTopMedia operation' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              user_id: igAccountId,
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allMedia: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${hashtagId}/top_media`, 'GET', pageParams);
                if (pageResult.data) {
                  allMedia.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allMedia.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allMedia };
            } else {
              result = await makeInstagramRequest(`/${hashtagId}/top_media`, 'GET', params);
            }
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "hashtag"` };
          }
        }
        // ==================== STORY OPERATIONS ====================
        else if (resource === 'story') {
          if (operation === 'get') {
            const storyId = resolveString(getStringProperty(config, 'storyId', ''));
            if (!storyId) {
              return { ...inputObj, _error: 'Instagram node: storyId is required for get operation' };
            }

            result = await makeInstagramRequest(`/${storyId}`, 'GET');
          } else if (operation === 'list') {
            if (!igAccountId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine Instagram Business Account ID.' };
            }
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const fields = resolveString(getStringProperty(config, 'fields', 'id,media_type,media_url,permalink,timestamp'));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              fields: fields || undefined,
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allStories: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeInstagramRequest(`/${igAccountId}/stories`, 'GET', pageParams);
                if (pageResult.data) {
                  allStories.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allStories.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allStories };
            } else {
              result = await makeInstagramRequest(`/${igAccountId}/stories`, 'GET', params);
            }
          } else if (operation === 'getInsights') {
            const storyId = resolveString(getStringProperty(config, 'storyId', ''));
            if (!storyId) {
              return { ...inputObj, _error: 'Instagram node: storyId is required for getInsights operation' };
            }
            const metric = resolveString(getStringProperty(config, 'metric', ''));
            if (!metric) {
              return { ...inputObj, _error: 'Instagram node: metric is required for getInsights operation' };
            }

            result = await makeInstagramRequest(`/${storyId}/insights`, 'GET', {
              metric,
            });
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "story"` };
          }
        }
        // ==================== INSIGHTS OPERATIONS ====================
        else if (resource === 'insights') {
          if (operation === 'get') {
            // objectId can be instagramBusinessAccountId, mediaId, or storyId
            const objectId = igAccountId || resolveString(getStringProperty(config, 'mediaId', '')) || resolveString(getStringProperty(config, 'storyId', ''));
            if (!objectId) {
              return { ...inputObj, _error: 'Instagram node: Could not determine object ID. Please provide instagramBusinessAccountId, mediaId, or storyId.' };
            }
            const metric = resolveString(getStringProperty(config, 'metric', ''));
            if (!metric) {
              return { ...inputObj, _error: 'Instagram node: metric is required for insights operation' };
            }
            const period = resolveString(getStringProperty(config, 'period', 'day'));
            const since = resolveString(getStringProperty(config, 'since', ''));
            const until = resolveString(getStringProperty(config, 'until', ''));
            
            const params: any = {
              metric,
              period,
            };
            if (since) params.since = since;
            if (until) params.until = until;

            result = await makeInstagramRequest(`/${objectId}/insights`, 'GET', params);
          } else {
            return { ...inputObj, _error: `Instagram node: Unknown operation "${operation}" for resource "insights"` };
          }
        }
        else {
          return { ...inputObj, _error: `Instagram node: Unknown resource "${resource}"` };
        }

        // Return result
        return {
          ...inputObj,
          ...result,
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Instagram operation failed';
        const statusCode = error?.status || error?.code || 'unknown';
        console.error('Instagram error:', error);

        return {
          ...inputObj,
          _error: `Instagram node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            code: error?.code,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'whatsapp':
    case 'whatsapp_cloud': {
      // ✅ WhatsApp node with comprehensive resource and operation support
      // Supports: message, media, template, businessProfile, phoneNumber, webhook
      // Uses Facebook OAuth token with WhatsApp permissions (via Supabase)
      const resource = getStringProperty(config, 'resource', 'message');
      const operation = getStringProperty(config, 'operation', 'sendText');

      // Use typed execution context
      const execContext = createTypedContext();
      
      // Get OAuth token from Supabase
      const userIdsToTry: string[] = [];
      if (userId) userIdsToTry.push(userId);
      if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);

      const resolvedAccessToken = userIdsToTry.length > 0 
        ? await getWhatsAppAccessToken(supabase, userIdsToTry)
        : null;

      if (!resolvedAccessToken) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have a WhatsApp/Facebook account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have a WhatsApp/Facebook account connected.`
          : '';
        
        return {
          ...inputObj,
          _error: `WhatsApp node: OAuth connection required. ${ownerMessage} ${currentUserMessage} Please connect your WhatsApp/Facebook account in the Connections panel.`,
        };
      }

      try {
        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseFloat(resolved);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              const parsed = parseFloat(value);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to resolve boolean
        const resolveBoolean = (value: any, defaultValue: boolean = false): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              return typeof resolved === 'boolean' ? resolved : defaultValue;
            }
            return value.toLowerCase() === 'true' || value === '1';
          }
          return defaultValue;
        };

        // Helper to get WhatsApp Business Account ID
        const getWabaId = async (phoneNumberId: string): Promise<string | null> => {
          const providedId = resolveString(getStringProperty(config, 'businessAccountId', ''));
          if (providedId) return providedId;
          if (phoneNumberId) {
            return await getWhatsAppBusinessAccountId(resolvedAccessToken, phoneNumberId);
          }
          return null;
        };

        // Helper to make WhatsApp Cloud API requests
        const makeWhatsAppRequest = async (
          endpoint: string,
          method: 'GET' | 'POST' | 'DELETE' = 'GET',
          body?: any
        ): Promise<any> => {
          const url = `https://graph.facebook.com/v18.0${endpoint}`;
          const params = new URLSearchParams();
          params.append('access_token', resolvedAccessToken);
          
          if (method === 'GET' && body) {
            Object.entries(body).forEach(([key, value]) => {
              if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                  params.append(key, JSON.stringify(value));
                } else if (typeof value === 'object') {
                  params.append(key, JSON.stringify(value));
                } else {
                  params.append(key, String(value));
                }
              }
            });
          }

          const options: RequestInit = {
            method,
            headers: {
              'Content-Type': 'application/json',
            },
          };

          if (method === 'POST' || method === 'DELETE') {
            if (body) {
              options.body = JSON.stringify(body);
            }
          }

          const fullUrl = method === 'GET' ? `${url}?${params.toString()}` : url;
          if (method === 'POST' || method === 'DELETE') {
            const postParams = new URLSearchParams();
            postParams.append('access_token', resolvedAccessToken);
            const response = await fetch(`${url}?${postParams.toString()}`, options);
            const data = await response.json() as any;
            if (!response.ok) {
              throw new Error((data as any)?.error?.message || `WhatsApp API error: ${response.statusText}`);
            }
            return data;
          } else {
            const response = await fetch(fullUrl, options);
            const data = await response.json() as any;
            if (!response.ok) {
              throw new Error((data as any)?.error?.message || `WhatsApp API error: ${response.statusText}`);
            }
            return data;
          }
        };

        let result: any;
        const phoneNumberId = resolveString(getStringProperty(config, 'phoneNumberId', ''));

        // ==================== MESSAGE OPERATIONS ====================
        if (resource === 'message') {
          if (!phoneNumberId) {
            return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for message operations' };
          }

          if (operation === 'sendText') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const text = resolveString(getStringProperty(config, 'text', ''));
            if (!to || !text) {
              return { ...inputObj, _error: 'WhatsApp node: to and text are required for sendText operation' };
            }
            const previewUrl = resolveBoolean(getStringProperty(config, 'previewUrl', 'false'), false);

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'text',
              text: {
                preview_url: previewUrl,
                body: text,
              },
            });
          } else if (operation === 'sendMedia') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const mediaType = resolveString(getStringProperty(config, 'mediaType', 'image'));
            const mediaUrl = resolveString(getStringProperty(config, 'mediaUrl', ''));
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            const caption = resolveString(getStringProperty(config, 'caption', ''));
            const filename = resolveString(getStringProperty(config, 'filename', ''));

            if (!to) {
              return { ...inputObj, _error: 'WhatsApp node: to is required for sendMedia operation' };
            }
            if (!mediaUrl && !mediaId) {
              return { ...inputObj, _error: 'WhatsApp node: Either mediaUrl or mediaId is required for sendMedia operation' };
            }

            const mediaPayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: mediaType,
            };

            if (mediaId) {
              mediaPayload[mediaType] = { id: mediaId };
            } else {
              mediaPayload[mediaType] = { link: mediaUrl };
            }

            if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
              mediaPayload[mediaType].caption = caption;
            }
            if (filename && mediaType === 'document') {
              mediaPayload[mediaType].filename = filename;
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', mediaPayload);
          } else if (operation === 'sendLocation') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const latitude = resolveNumber(getStringProperty(config, 'latitude', ''), null);
            const longitude = resolveNumber(getStringProperty(config, 'longitude', ''), null);
            const locationName = resolveString(getStringProperty(config, 'locationName', ''));
            const address = resolveString(getStringProperty(config, 'address', ''));

            if (!to || latitude === null || longitude === null) {
              return { ...inputObj, _error: 'WhatsApp node: to, latitude, and longitude are required for sendLocation operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'location',
              location: {
                latitude,
                longitude,
                name: locationName || undefined,
                address: address || undefined,
              },
            });
          } else if (operation === 'sendContact') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const contacts = getJsonProp('contacts');

            if (!to || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
              return { ...inputObj, _error: 'WhatsApp node: to and contacts (array) are required for sendContact operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'contacts',
              contacts,
            });
          } else if (operation === 'sendReaction') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const messageId = resolveString(getStringProperty(config, 'messageId', ''));
            const emoji = resolveString(getStringProperty(config, 'emoji', ''));

            if (!to || !messageId || !emoji) {
              return { ...inputObj, _error: 'WhatsApp node: to, messageId, and emoji are required for sendReaction operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'reaction',
              reaction: {
                message_id: messageId,
                emoji,
              },
            });
          } else if (operation === 'sendTemplate') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const templateName = resolveString(getStringProperty(config, 'templateName', ''));
            const language = resolveString(getStringProperty(config, 'language', 'en_US'));
            const templateComponents = getJsonProp('templateComponents');
            const namespace = resolveString(getStringProperty(config, 'namespace', ''));

            if (!to || !templateName || !language) {
              return { ...inputObj, _error: 'WhatsApp node: to, templateName, and language are required for sendTemplate operation' };
            }

            const templatePayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'template',
              template: {
                name: templateName,
                language: {
                  code: language,
                },
              },
            };

            if (namespace) {
              templatePayload.template.namespace = namespace;
            }
            if (templateComponents && Array.isArray(templateComponents)) {
              templatePayload.template.components = templateComponents;
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', templatePayload);
          } else if (operation === 'sendInteractiveButtons') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const bodyText = resolveString(getStringProperty(config, 'bodyText', ''));
            const buttons = getJsonProp('buttons');
            const headerText = resolveString(getStringProperty(config, 'headerText', ''));
            const footerText = resolveString(getStringProperty(config, 'footerText', ''));

            if (!to || !bodyText || !buttons || !Array.isArray(buttons) || buttons.length === 0) {
              return { ...inputObj, _error: 'WhatsApp node: to, bodyText, and buttons (array) are required for sendInteractiveButtons operation' };
            }

            const interactivePayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: { text: bodyText },
                action: {
                  buttons: buttons.map((btn: any) => ({
                    type: btn.type || 'reply',
                    reply: {
                      id: btn.id,
                      title: btn.title,
                    },
                  })),
                },
              },
            };

            if (headerText) {
              interactivePayload.interactive.header = { type: 'text', text: headerText };
            }
            if (footerText) {
              interactivePayload.interactive.footer = { text: footerText };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', interactivePayload);
          } else if (operation === 'sendInteractiveList') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const bodyText = resolveString(getStringProperty(config, 'bodyText', ''));
            const buttonText = resolveString(getStringProperty(config, 'buttonText', ''));
            const sections = getJsonProp('sections');
            const headerText = resolveString(getStringProperty(config, 'headerText', ''));
            const footerText = resolveString(getStringProperty(config, 'footerText', ''));

            if (!to || !bodyText || !buttonText || !sections || !Array.isArray(sections) || sections.length === 0) {
              return { ...inputObj, _error: 'WhatsApp node: to, bodyText, buttonText, and sections (array) are required for sendInteractiveList operation' };
            }

            const interactivePayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'interactive',
              interactive: {
                type: 'list',
                body: { text: bodyText },
                action: {
                  button: buttonText,
                  sections,
                },
              },
            };

            if (headerText) {
              interactivePayload.interactive.header = { type: 'text', text: headerText };
            }
            if (footerText) {
              interactivePayload.interactive.footer = { text: footerText };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', interactivePayload);
          } else if (operation === 'sendInteractiveCTA') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const bodyText = resolveString(getStringProperty(config, 'bodyText', ''));
            const ctaUrl = getJsonProp('ctaUrl');
            const headerText = resolveString(getStringProperty(config, 'headerText', ''));
            const footerText = resolveString(getStringProperty(config, 'footerText', ''));

            if (!to || !bodyText || !ctaUrl) {
              return { ...inputObj, _error: 'WhatsApp node: to, bodyText, and ctaUrl are required for sendInteractiveCTA operation' };
            }

            const interactivePayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'interactive',
              interactive: {
                type: 'cta_url',
                body: { text: bodyText },
                action: {
                  name: 'cta_url',
                  parameters: {
                    display_text: ctaUrl.display_text || ctaUrl.displayText,
                    url: ctaUrl.url,
                  },
                },
              },
            };

            if (headerText) {
              interactivePayload.interactive.header = { type: 'text', text: headerText };
            }
            if (footerText) {
              interactivePayload.interactive.footer = { text: footerText };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', interactivePayload);
          } else if (operation === 'sendInteractiveCatalog') {
            const to = resolveString(getStringProperty(config, 'to', ''));
            const catalogId = resolveString(getStringProperty(config, 'catalogId', ''));
            const productSections = getJsonProp('productSections');

            if (!to || !catalogId) {
              return { ...inputObj, _error: 'WhatsApp node: to and catalogId are required for sendInteractiveCatalog operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              recipient_type: resolveString(getStringProperty(config, 'recipientType', 'individual')),
              to,
              type: 'interactive',
              interactive: {
                type: 'catalog_message',
                body: { text: resolveString(getStringProperty(config, 'bodyText', '')) },
                action: {
                  name: 'catalog',
                  parameters: {
                    thumbnail_product_retailer_id: catalogId,
                  },
                },
              },
            });
          } else if (operation === 'markAsRead') {
            const messageId = resolveString(getStringProperty(config, 'messageId', ''));
            if (!messageId) {
              return { ...inputObj, _error: 'WhatsApp node: messageId is required for markAsRead operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              status: 'read',
              message_id: messageId,
            });
          } else if (operation === 'get') {
            const messageId = resolveString(getStringProperty(config, 'messageId', ''));
            if (!messageId) {
              return { ...inputObj, _error: 'WhatsApp node: messageId is required for get operation' };
            }

            result = await makeWhatsAppRequest(`/${messageId}`, 'GET');
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "message"` };
          }
        }
        // ==================== MEDIA OPERATIONS ====================
        else if (resource === 'media') {
          if (operation === 'upload') {
            if (!phoneNumberId) {
              return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for upload operation' };
            }
            const fileUrl = resolveString(getStringProperty(config, 'fileUrl', ''));
            const fileData = resolveString(getStringProperty(config, 'fileData', ''));
            const mimeType = resolveString(getStringProperty(config, 'mimeType', ''));

            if ((!fileUrl && !fileData) || !mimeType) {
              return { ...inputObj, _error: 'WhatsApp node: Either fileUrl or fileData, and mimeType are required for upload operation' };
            }

            // If fileUrl is provided, download it first
            let fileBuffer: Buffer | null = null;
            if (fileUrl) {
              const fileResponse = await fetch(fileUrl);
              if (!fileResponse.ok) {
                return { ...inputObj, _error: `WhatsApp node: Failed to download file from URL: ${fileUrl}` };
              }
              const arrayBuffer = await fileResponse.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
            } else if (fileData) {
              // Decode base64
              fileBuffer = Buffer.from(fileData, 'base64');
            }

            // Upload to WhatsApp
            const formData = new FormData();
            formData.append('file', fileBuffer!, {
              filename: 'file',
              contentType: mimeType,
            });
            formData.append('messaging_product', 'whatsapp');
            formData.append('type', mimeType);

            const uploadUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/media?access_token=${resolvedAccessToken}`;
            
            // Get headers from form-data (includes Content-Type with boundary)
            const formHeaders = formData.getHeaders ? formData.getHeaders() : {};
            
            const uploadResponse = await fetch(uploadUrl, {
              method: 'POST',
              body: formData as any,
              headers: formHeaders,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json() as any;
              throw new Error((errorData as any)?.error?.message || 'Failed to upload media');
            }

            result = await uploadResponse.json();
          } else if (operation === 'get') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'WhatsApp node: mediaId is required for get operation' };
            }

            result = await makeWhatsAppRequest(`/${mediaId}`, 'GET');
          } else if (operation === 'delete') {
            const mediaId = resolveString(getStringProperty(config, 'mediaId', ''));
            if (!mediaId) {
              return { ...inputObj, _error: 'WhatsApp node: mediaId is required for delete operation' };
            }

            result = await makeWhatsAppRequest(`/${mediaId}`, 'DELETE');
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "media"` };
          }
        }
        // ==================== TEMPLATE OPERATIONS ====================
        else if (resource === 'template') {
          const wabaId = await getWabaId(phoneNumberId);
          if (!wabaId) {
            return { ...inputObj, _error: 'WhatsApp node: Could not determine WhatsApp Business Account ID. Please provide businessAccountId or ensure phoneNumberId is set.' };
          }

          if (operation === 'list') {
            const limit = resolveNumber(getStringProperty(config, 'limit', '25'), 25) || 25;
            const after = resolveString(getStringProperty(config, 'after', ''));
            const before = resolveString(getStringProperty(config, 'before', ''));
            const returnAll = resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false);
            
            const params: any = {
              limit: Math.min(Math.max(1, limit), 100),
            };
            if (after) params.after = after;
            if (before) params.before = before;

            if (returnAll) {
              const allTemplates: any[] = [];
              let nextCursor = after || undefined;
              while (true) {
                const pageParams = { ...params };
                if (nextCursor) pageParams.after = nextCursor;
                const pageResult = await makeWhatsAppRequest(`/${wabaId}/message_templates`, 'GET', pageParams);
                if (pageResult.data) {
                  allTemplates.push(...pageResult.data);
                }
                if (!pageResult.paging?.next || allTemplates.length >= 1000) break;
                nextCursor = pageResult.paging.cursors?.after;
              }
              result = { data: allTemplates };
            } else {
              result = await makeWhatsAppRequest(`/${wabaId}/message_templates`, 'GET', params);
            }
          } else if (operation === 'get') {
            const templateName = resolveString(getStringProperty(config, 'templateName', ''));
            if (!templateName) {
              return { ...inputObj, _error: 'WhatsApp node: templateName is required for get operation' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/message_templates/${templateName}`, 'GET');
          } else if (operation === 'create') {
            const templateName = resolveString(getStringProperty(config, 'templateName', ''));
            const language = resolveString(getStringProperty(config, 'language', ''));
            const templateCategory = resolveString(getStringProperty(config, 'templateCategory', 'UTILITY'));
            const templateComponents = getJsonProp('templateComponentsCreate');

            if (!templateName || !language || !templateCategory || !templateComponents) {
              return { ...inputObj, _error: 'WhatsApp node: templateName, language, templateCategory, and templateComponentsCreate are required for create operation' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/message_templates`, 'POST', {
              name: templateName,
              language,
              category: templateCategory,
              components: templateComponents,
            });
          } else if (operation === 'update') {
            const templateName = resolveString(getStringProperty(config, 'templateName', ''));
            const templateComponents = getJsonProp('templateComponentsCreate');

            if (!templateName || !templateComponents) {
              return { ...inputObj, _error: 'WhatsApp node: templateName and templateComponentsCreate are required for update operation' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/message_templates/${templateName}`, 'POST', {
              components: templateComponents,
            });
          } else if (operation === 'delete') {
            const templateName = resolveString(getStringProperty(config, 'templateName', ''));
            if (!templateName) {
              return { ...inputObj, _error: 'WhatsApp node: templateName is required for delete operation' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/message_templates/${templateName}`, 'DELETE');
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "template"` };
          }
        }
        // ==================== BUSINESS PROFILE OPERATIONS ====================
        else if (resource === 'businessProfile') {
          if (!phoneNumberId) {
            return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for businessProfile operations' };
          }

          if (operation === 'get') {
            const fields = resolveString(getStringProperty(config, 'profileFields', 'about,description,email,address,vertical,websites'));
            result = await makeWhatsAppRequest(`/${phoneNumberId}/whatsapp_business_profile`, 'GET', {
              fields: fields || undefined,
            });
          } else if (operation === 'update') {
            const updateData: any = {};
            const about = resolveString(getStringProperty(config, 'about', ''));
            const description = resolveString(getStringProperty(config, 'description', ''));
            const email = resolveString(getStringProperty(config, 'email', ''));
            const address = resolveString(getStringProperty(config, 'profileAddress', ''));
            const vertical = resolveString(getStringProperty(config, 'vertical', ''));
            const websites = getJsonProp('websites');

            if (about) updateData.about = about;
            if (description) updateData.description = description;
            if (email) updateData.email = email;
            if (address) updateData.address = address;
            if (vertical) updateData.vertical = vertical;
            if (websites) updateData.websites = websites;

            if (Object.keys(updateData).length === 0) {
              return { ...inputObj, _error: 'WhatsApp node: At least one field (about, description, email, address, vertical, websites) is required for update operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/whatsapp_business_profile`, 'POST', updateData);
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "businessProfile"` };
          }
        }
        // ==================== PHONE NUMBER OPERATIONS ====================
        else if (resource === 'phoneNumber') {
          if (operation === 'list') {
            const wabaId = await getWabaId(phoneNumberId);
            if (!wabaId) {
              return { ...inputObj, _error: 'WhatsApp node: Could not determine WhatsApp Business Account ID. Please provide businessAccountId.' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/phone_numbers`, 'GET');
          } else if (operation === 'get') {
            if (!phoneNumberId) {
              return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for get operation' };
            }
            const fields = resolveString(getStringProperty(config, 'phoneNumberFields', 'verified_name,display_phone_number,quality_rating,account_mode'));
            result = await makeWhatsAppRequest(`/${phoneNumberId}`, 'GET', {
              fields: fields || undefined,
            });
          } else if (operation === 'register') {
            if (!phoneNumberId) {
              return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for register operation' };
            }
            const pin = resolveString(getStringProperty(config, 'pin', ''));
            if (!pin) {
              return { ...inputObj, _error: 'WhatsApp node: pin is required for register operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/register`, 'POST', {
              pin,
            });
          } else if (operation === 'deregister') {
            if (!phoneNumberId) {
              return { ...inputObj, _error: 'WhatsApp node: phoneNumberId is required for deregister operation' };
            }

            result = await makeWhatsAppRequest(`/${phoneNumberId}/deregister`, 'POST');
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "phoneNumber"` };
          }
        }
        // ==================== WEBHOOK OPERATIONS ====================
        else if (resource === 'webhook') {
          const wabaId = await getWabaId(phoneNumberId);
          if (!wabaId) {
            return { ...inputObj, _error: 'WhatsApp node: Could not determine WhatsApp Business Account ID. Please provide businessAccountId.' };
          }

          if (operation === 'subscribe') {
            const webhookUrl = resolveString(getStringProperty(config, 'webhookUrl', ''));
            const webhookFields = resolveString(getStringProperty(config, 'webhookFields', 'messages,message_status,message_template_status_update'));

            if (!webhookUrl) {
              return { ...inputObj, _error: 'WhatsApp node: webhookUrl is required for subscribe operation' };
            }

            result = await makeWhatsAppRequest(`/${wabaId}/subscribed_apps`, 'POST', {
              subscribed_fields: webhookFields.split(',').map((f: string) => f.trim()),
            });
          } else if (operation === 'unsubscribe') {
            result = await makeWhatsAppRequest(`/${wabaId}/subscribed_apps`, 'DELETE');
          } else {
            return { ...inputObj, _error: `WhatsApp node: Unknown operation "${operation}" for resource "webhook"` };
          }
        }
        else {
          return { ...inputObj, _error: `WhatsApp node: Unknown resource "${resource}"` };
        }

        // Return result
        return {
          ...inputObj,
          ...result,
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'WhatsApp operation failed';
        const statusCode = error?.status || error?.code || 'unknown';
        console.error('WhatsApp error:', error);

        return {
          ...inputObj,
          _error: `WhatsApp node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            code: error?.code,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'google_calendar': {
      // ✅ Google Calendar node with comprehensive resource and operation support
      // Supports: calendar, event, calendarList, acl, settings, colors, freebusy, watch
      // Uses OAuth token from header (via Supabase)
      const resource = getStringProperty(config, 'resource', 'event');
      const operation = getStringProperty(config, 'operation', 'list');

      // Use typed execution context
      const execContext = createTypedContext();
      
      // Get OAuth token from Supabase
      const userIdsToTry: string[] = [];
      if (userId) userIdsToTry.push(userId);
      if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);

      if (userIdsToTry.length === 0) {
        return {
          ...inputObj,
          _error: 'Google Calendar node: OAuth connection required. Please connect your Google account in the Connections panel.',
        };
      }

      try {
        // Import the executor
        const { executeGoogleCalendarOperation } = await import('../shared/google-calendar-executor');

        // Helper to parse JSON property
        const getJsonProp = (key: string): any => {
          const value = config[key];
          if (!value) return null;
          if (typeof value === 'object') return value;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        };

        // Helper to resolve string with templates
        const resolveString = (value: any): string => {
          if (!value) return '';
          const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string') as string
            : String(resolveTypedValue(value, execContext));
          return resolved;
        };

        // Helper to resolve number with templates
        const resolveNumber = (value: any, defaultValue: number | null = null): number | null => {
          if (value === null || value === undefined) return defaultValue;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              if (typeof resolved === 'number') return resolved;
              if (typeof resolved === 'string') {
                const parsed = parseInt(resolved, 10);
                return isNaN(parsed) ? defaultValue : parsed;
              }
            } else {
              const parsed = parseInt(value, 10);
              return isNaN(parsed) ? defaultValue : parsed;
            }
          }
          return defaultValue;
        };

        // Helper to resolve boolean
        const resolveBoolean = (value: any, defaultValue: boolean = false): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            if (value.includes('{{')) {
              const resolved = resolveTypedValue(value, execContext);
              return typeof resolved === 'boolean' ? resolved : defaultValue;
            }
            return value.toLowerCase() === 'true' || value === '1';
          }
          return defaultValue;
        };

        // Build operation parameters
        const params: any = {
          resource,
          operation,
          calendarId: resolveString(getStringProperty(config, 'calendarId', 'primary')),
          summary: resolveString(getStringProperty(config, 'summary', '')),
          eventId: resolveString(getStringProperty(config, 'eventId', '')),
          start: getJsonProp('start'),
          end: getJsonProp('end'),
          eventData: getJsonProp('eventData'),
          text: resolveString(getStringProperty(config, 'text', '')),
          sendUpdates: resolveString(getStringProperty(config, 'sendUpdates', 'all')),
          destinationCalendarId: resolveString(getStringProperty(config, 'destinationCalendarId', '')),
          timeMin: resolveString(getStringProperty(config, 'timeMin', '')),
          timeMax: resolveString(getStringProperty(config, 'timeMax', '')),
          maxResults: resolveNumber(getStringProperty(config, 'maxResults', '250'), 250),
          q: resolveString(getStringProperty(config, 'q', '')),
          singleEvents: resolveBoolean(getStringProperty(config, 'singleEvents', 'false'), false),
          orderBy: resolveString(getStringProperty(config, 'orderBy', 'startTime')),
          returnAll: resolveBoolean(getStringProperty(config, 'returnAll', 'false'), false),
          ruleId: resolveString(getStringProperty(config, 'ruleId', '')),
          role: resolveString(getStringProperty(config, 'role', 'reader')),
          scope: getJsonProp('scope'),
          setting: resolveString(getStringProperty(config, 'setting', '')),
          items: getJsonProp('items'),
          channelId: resolveString(getStringProperty(config, 'channelId', '')),
          resourceId: resolveString(getStringProperty(config, 'resourceId', '')),
        };

        // Execute the operation
        const result = await executeGoogleCalendarOperation(supabase, userIdsToTry, params);

        // Return result
        return {
          ...inputObj,
          ...result,
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Google Calendar operation failed';
        const statusCode = error?.response?.status || error?.code || 'unknown';
        console.error('Google Calendar error:', error);

        return {
          ...inputObj,
          _error: `Google Calendar node: ${errorMessage}`,
          _errorDetails: {
            message: errorMessage,
            statusCode,
            code: error?.code,
            error: error instanceof Error ? error.stack : String(error),
          },
        };
      }
    }

    case 'github':
    case 'facebook': {
      // ✅ REFACTORED: Unified social media node handler
      // Uses centralized service layer with proper error handling, retry logic, and token management
      const provider = type as 'github' | 'facebook';
      const operation = getStringProperty(config, 'operation', provider === 'github' ? 'post_issue' : 'post');
      
      // Use typed execution context for template resolution
      const execContext = createTypedContext();
      
      // Resolve all config values with templates
      const resolvedConfig: Record<string, any> = {};
      Object.keys(config).forEach(key => {
        const value = config[key];
        if (typeof value === 'string' && value.includes('{{')) {
          resolvedConfig[key] = typeof resolveWithSchema(value, execContext, 'string') === 'string'
            ? resolveWithSchema(value, execContext, 'string')
            : String(resolveTypedValue(value, execContext));
        } else {
          resolvedConfig[key] = value;
        }
      });
      
      resolvedConfig.provider = provider;
      resolvedConfig.operation = operation;
      
      try {
        // Import and use centralized dispatcher
        const { executeSocialNode } = await import('../services/social/social-dispatcher');
        const result = await executeSocialNode(
          supabase,
          resolvedConfig as { provider: 'github' | 'facebook'; operation: string; [key: string]: any },
          userId,
          currentUserId
        );
        
        if (!result.success) {
          return {
            ...inputObj,
            _error: `${provider} node: ${result.error}`,
          };
        }
        
        // Return successful result
        return {
          ...inputObj,
          success: true,
          provider: result.provider,
          action: result.action,
          ...result.data,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`[${provider} Node] Error:`, error);
        return {
          ...inputObj,
          _error: `${provider} node: ${errorMessage}`,
        };
      }
    }

    case 'linkedin': {
      // LinkedIn API node - supports multiple operations
      const rawOperation = getStringProperty(config, 'operation', 'post').toLowerCase();

      // ✅ Normalize UI operation values to core backend operations
      // UI exposes richer labels like "create_post_media", "create_article", etc.
      // For now we map them to the core operations implemented below so existing
      // workflows don't break with "Unknown operation" errors.
      const operation =
        rawOperation === 'create_post_media' ||
        rawOperation === 'create_article' ||
        rawOperation === 'create_company_post'
          ? 'create_post'
          : rawOperation === 'get_org_updates' || rawOperation === 'get_engagement'
          ? 'get_posts'
          : rawOperation;

      const text = getStringProperty(config, 'text', '');
      
      // Build context
      const context = {
        input: inputObj,
        ...nodeOutputs.getAll(),
        ...inputObj,
        $json: inputObj,
        json: inputObj,
      };

      // ✅ REFACTORED: LinkedIn with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedText = typeof resolveWithSchema(text, execContext, 'string') === 'string'
        ? resolveWithSchema(text, execContext, 'string') as string
        : String(resolveTypedValue(text, execContext));

      // Get access token - try from config first, then from database (OAuth), then from env
      let accessToken = getStringProperty(config, 'accessToken', '');
      
      // If no token in config, try to get from database (OAuth tokens)
      if (!accessToken) {
        const { getLinkedInAccessToken } = await import('../shared/linkedin-oauth');
        const userIdsToTry: string[] = [];
        if (userId) userIdsToTry.push(userId);
        if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
        
        accessToken = userIdsToTry.length > 0 
          ? await getLinkedInAccessToken(supabase, userIdsToTry) || ''
          : '';
      }
      
      // Fallback to environment variable if still no token
      if (!accessToken) {
        accessToken = process.env.LINKEDIN_ACCESS_TOKEN || '';
      }

      if (!accessToken) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have a LinkedIn account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have a LinkedIn account connected.`
          : '';
        const solutionMessage = userId && currentUserId && currentUserId !== userId
          ? 'Please ensure either: 1) The workflow owner connects their LinkedIn account in settings, or 2) You connect your LinkedIn account (if you have permission to use it for this workflow).'
          : userId
          ? 'Please ensure the workflow owner has connected their LinkedIn account in settings. If you\'re running someone else\'s workflow, you need to either: 1) Have the workflow owner connect their LinkedIn account, or 2) Transfer the workflow ownership to your account.'
          : 'Please connect a LinkedIn account in settings or configure an access token in node settings.';
        
        return {
          ...inputObj,
          _error: `LinkedIn: Access token not found. ${ownerMessage} ${currentUserMessage} ${solutionMessage}`,
        };
      }

      // Import LinkedIn API helpers
      const {
        getLinkedInProfile,
        getLinkedInPosts,
        createLinkedInPost,
        deleteLinkedInPost,
        getPersonUrnFromToken,
        registerLinkedInUpload,
        uploadLinkedInMediaFromUrl,
        createLinkedInMediaPost,
      } = await import('../shared/linkedin-api');

      const dryRun = !!config.dryRun;

      // Handle different operations
      try {
        // Get personUrn - try from config, or fetch from token if not provided
        let personUrn = getStringProperty(config, 'personUrn', '');
        if (!personUrn && (operation === 'post' || operation === 'create_post' || operation === 'get_posts')) {
          // Try to get personUrn from token
          try {
            personUrn = await getPersonUrnFromToken(accessToken);
          } catch (err) {
            console.warn('[LinkedIn Node] Could not fetch personUrn from token:', err);
          }
        }

        switch (operation) {
          case 'get_profile':
          case 'get_me': {
            if (dryRun) {
              return {
                ...inputObj,
                success: true,
                dryRun: true,
                simulatedRequest: {
                  // OIDC: /v2/userinfo, legacy: /v2/me (we try both)
                  endpoint: 'https://api.linkedin.com/v2/userinfo',
                  method: 'GET (fallback: /v2/me)',
                },
              };
            }

            const profile = await getLinkedInProfile(accessToken);
            return {
              ...inputObj,
              success: true,
              profile: {
                id: profile.id,
                firstName: profile.localizedFirstName ?? profile.given_name,
                lastName: profile.localizedLastName ?? profile.family_name,
                headline: profile.localizedHeadline,
                name: profile.name,
                email: profile.email,
                personUrn: profile.id?.startsWith('urn:li:person:') 
                  ? profile.id.replace('urn:li:person:', '')
                  : profile.id,
              },
            };
          }

          case 'get_posts': {
            if (!personUrn) {
              return {
                ...inputObj,
                _error: 'LinkedIn node: personUrn is required for get_posts operation',
              };
            }

            // Support both legacy "count" and newer "limit" config keys
            const countStr =
              getStringProperty(config, 'count', '') ||
              getStringProperty(config, 'limit', '10');
            const count = parseInt(countStr, 10) || 10;
            
            if (dryRun) {
              return {
                ...inputObj,
                success: true,
                dryRun: true,
                simulatedRequest: {
                  endpoint: `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${personUrn})&count=${count}`,
                  method: 'GET',
                },
              };
            }

            const posts = await getLinkedInPosts(accessToken, personUrn, count);
            return {
              ...inputObj,
              success: true,
              posts: posts.map((post) => ({
                id: post.id,
                text: post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text,
                created: post.created?.time,
              })),
              postCount: posts.length,
            };
          }

          case 'post':
          case 'create_post': {
            const hasText =
              typeof resolvedText === 'string' && resolvedText.trim().length > 0;

            if (!personUrn) {
              return {
                ...inputObj,
                _error: 'LinkedIn node: personUrn is required to post on behalf of a member (missing personUrn in configuration)',
              };
            }

            const visibility = getStringProperty(
              config,
              'visibility',
              'PUBLIC'
            ) as 'PUBLIC' | 'CONNECTIONS';

            const mediaUrl = getStringProperty(config, 'mediaUrl', '').trim();
            const isMediaOperation =
              rawOperation === 'create_post_media' || !!mediaUrl;

            // Validation rules:
            // - Media operations: allow empty text as long as mediaUrl is provided.
            // - Text-only operations: require non-empty text.
            // - If neither text nor mediaUrl is provided, fail fast.
            if (!hasText && !isMediaOperation) {
              return {
                ...inputObj,
                _error:
                  'LinkedIn node: Text is required for post operation when no mediaUrl is provided.',
              };
            }

            if (dryRun) {
              if (isMediaOperation) {
                return {
                  ...inputObj,
                  success: true,
                  dryRun: true,
                  simulatedRequest: {
                    steps: [
                      {
                        endpoint:
                          'https://api.linkedin.com/v2/assets?action=registerUpload',
                        method: 'POST',
                        description:
                          'Register media upload for member profile (image/video).',
                      },
                      {
                        endpoint: '<uploadUrl from registerUpload>',
                        method: 'PUT',
                        description:
                          'Upload binary media bytes fetched from mediaUrl to LinkedIn.',
                      },
                      {
                        endpoint: 'https://api.linkedin.com/v2/ugcPosts',
                        method: 'POST',
                        description:
                          'Create UGC post referencing the uploaded media asset.',
                      },
                    ],
                    author: `urn:li:person:${personUrn}`,
                    text: resolvedText,
                    visibility,
                    mediaUrl: mediaUrl || '<required for media posts>',
                  },
                };
              }

              return {
                ...inputObj,
                success: true,
                dryRun: true,
                simulatedRequest: {
                  endpoint: 'https://api.linkedin.com/v2/ugcPosts',
                  method: 'POST',
                  body: {
                    author: `urn:li:person:${personUrn}`,
                    text: resolvedText,
                    visibility,
                  },
                },
              };
            }

            // Media posts (Create Post - Media)
            if (isMediaOperation) {
              if (!mediaUrl) {
                return {
                  ...inputObj,
                  _error:
                    'LinkedIn node: mediaUrl is required for media posts (Create Post - Media).',
                };
              }

              try {
                const lowerUrl = mediaUrl.toLowerCase();
                const kind =
                  lowerUrl.match(/\.(mp4|mov|avi|mkv|webm)$/) !== null
                    ? ('video' as const)
                    : ('image' as const);

                const ownerUrn = `urn:li:person:${personUrn}`;
                const { assetUrn, uploadUrl } = await registerLinkedInUpload(
                  accessToken,
                  ownerUrn,
                  kind
                );

                await uploadLinkedInMediaFromUrl(uploadUrl, mediaUrl);

                const result = await createLinkedInMediaPost(
                  accessToken,
                  personUrn,
                  resolvedText,
                  assetUrn,
                  kind,
                  visibility
                );

                console.log('[LinkedIn Node] Media post succeeded.', {
                  postId: result.id,
                  visibility,
                  kind,
                });

                return {
                  ...inputObj,
                  postId: result.id,
                  assetUrn,
                  success: true,
                };
              } catch (err: any) {
                const message =
                  err instanceof Error ? err.message : String(err);

                // Surface permission errors clearly
                if (message.includes('401') || message.includes('403')) {
                  const authMsg =
                    'LinkedIn authorization failed for media post. Check that w_member_social is granted and mediaUrl is publicly accessible.';
                  console.error('[LinkedIn Node] Media authorization error.', {
                    message,
                  });
                  return {
                    ...inputObj,
                    _error: `LinkedIn authorization error: ${authMsg}`,
                    _errorDetails: {
                      originalError: message,
                    },
                  };
                }

                console.error('[LinkedIn Node] Media post failed.', { message });
                return {
                  ...inputObj,
                  _error: `LinkedIn media post failed: ${message}`,
                };
              }
            }

            // Text-only posts (existing behavior)
            // Real API call with basic retry + rate-limit handling
            const maxRetries = 3;
            let attempt = 0;
            let lastError: any = null;

            while (attempt < maxRetries) {
              attempt += 1;
              try {
                const result = await createLinkedInPost(
                  accessToken,
                  personUrn,
                  resolvedText,
                  visibility
                );
                console.log('[LinkedIn Node] Post succeeded.', {
                  postId: result.id,
                  visibility,
                });
                return {
                  ...inputObj,
                  postId: result.id,
                  success: true,
                };
              } catch (err: any) {
                lastError = err;

                // Handle rate limiting
                if (err.message?.includes('429') && attempt < maxRetries) {
                  const delayMs = attempt * 1000;
                  console.warn(
                    '[LinkedIn Node] Rate limited (429). Retrying with backoff.',
                    {
                      attempt,
                      delayMs,
                    }
                  );
                  await new Promise((resolve) => setTimeout(resolve, delayMs));
                  continue;
                }

                // For permission / auth errors, fail fast
                if (err.message?.includes('401') || err.message?.includes('403')) {
                  const message =
                    'LinkedIn authorization failed. Check that required permissions (w_member_social, r_liteprofile, r_emailaddress) are granted.';
                  console.error('[LinkedIn Node] Authorization error.', {
                    message: err.message,
                  });
                  return {
                    ...inputObj,
                    _error: `LinkedIn authorization error: ${message}`,
                    _errorDetails: {
                      originalError: err.message,
                    },
                  };
                }

                // Other errors - break and return error
                break;
              }
            }

            return {
              ...inputObj,
              _error:
                lastError instanceof Error
                  ? `LinkedIn post failed: ${lastError.message}`
                  : 'LinkedIn post failed due to an unexpected error',
            };
          }

          case 'delete_post': {
            const postUrn = getStringProperty(config, 'postUrn', '') || getStringProperty(config, 'postId', '');
            if (!postUrn) {
              return {
                ...inputObj,
                _error: 'LinkedIn node: postUrn or postId is required for delete_post operation',
              };
            }

            if (dryRun) {
              return {
                ...inputObj,
                success: true,
                dryRun: true,
                simulatedRequest: {
                  endpoint: `https://api.linkedin.com/v2/ugcPosts/${postUrn}`,
                  method: 'DELETE',
                },
              };
            }

            await deleteLinkedInPost(accessToken, postUrn);
            return {
              ...inputObj,
              success: true,
              message: 'Post deleted successfully',
            };
          }

          default:
            return {
              ...inputObj,
              _error: `LinkedIn node: Unknown operation "${rawOperation}". Supported operations: get_profile, get_posts, post, create_post, delete_post (UI operations like create_post_media/create_article/create_company_post/get_org_updates/get_engagement are internally mapped to these).`,
            };
        }
      } catch (err) {
        console.error('[LinkedIn Node] Unexpected error:', err);
        return {
          ...inputObj,
          _error: err instanceof Error
            ? `LinkedIn operation failed: ${err.message}`
            : 'LinkedIn operation failed due to an unexpected error',
        };
      }
    }

    case 'form': {
      // Form node - check if this is a resume with form submission data
      // If input contains form submission data (submitted_at, form, data, etc.), return only the data object
      if (inputObj.submitted_at || inputObj.form || inputObj.data) {
        // ✅ FIX: Return only the data object (form field values), not the full submission metadata
        // The data object contains the actual form field values (e.g., { "name": "hii" })
        return inputObj.data || {};
      }
      
      // Initial execution - this will pause execution in the main handler
      // Just return input for now, the handler will detect form nodes and pause
      return {
        ...inputObj,
        _form_node: true,
        _node_id: node.id,
      };
    }

    case 'chat_model': {
      // Chat Model node - returns model configuration for AI Agent nodes
      // This node is typically connected to AI Agent nodes via the chat_model port
      const provider = getStringProperty(config, 'provider', 'ollama');
      const model = getStringProperty(config, 'model', 'qwen2.5:14b-instruct-q4_K_M');
      const temperature = parseFloat(getStringProperty(config, 'temperature', '0.7')) || 0.7;
      
      return {
        ...inputObj,
        provider,
        model,
        temperature,
        _chat_model_config: true,
      };
    }

    case 'switch': {
      // ✅ Switch node - routes execution based on value matching.
      // Frontend config (nodeTypes.ts):
      //   expression: '{{input.status}}'
      //   cases: [{ value: 'active', label: 'Active' }, ...]
      //
      // Routing contract (unified-execution-engine.ts):
      // - node output must contain `matchedCase` string|null
      // - edges from switch must have sourceHandle === matchedCase (case.value)

      // ✅ CORE ARCHITECTURE FIX: Preserve original input object BEFORE any extraction
      // This ensures ALL input fields (items, rows, headers, values, etc.) are preserved
      const originalInputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : inputObj;

      const execContext = createTypedContext();

      const expression =
        getStringProperty(config, 'expression', '') ||
        getStringProperty(config, 'routingExpression', '') ||
        getStringProperty(config, 'routingType', '');

      // Accept either `cases` (frontend) or `rules` (node-library schema)
      const casesRaw = (config as any).cases ?? (config as any).rules ?? [];

      let cases: Array<{ value: string; label?: string }> = [];
      try {
        if (typeof casesRaw === 'string') {
          cases = JSON.parse(casesRaw);
        } else if (Array.isArray(casesRaw)) {
          cases = casesRaw.map((c: any) => ({
            value: c?.value != null ? String(c.value) : '',
            label: c?.label != null ? String(c.label) : undefined,
          })).filter(c => c.value);
        }
      } catch (e) {
        // ignore parse errors; handled below
      }

      if (!expression) {
        return {
          ...inputObj,
          matchedCase: null,
          _error: 'Switch: expression is required',
        };
      }

      const expressionValue = resolveTypedValue(expression, execContext);
      const expressionValueStr = expressionValue == null ? '' : String(expressionValue);

      // Match by string equality (most deterministic given React handle IDs are strings)
      const matched = cases.find(c => c.value === expressionValueStr);

      const matchedCase = matched ? matched.value : null;

      // ✅ CORE ARCHITECTURE FIX: Return full input data with routing metadata
      // Switch nodes MUST forward ALL input data to the selected branch
      // This ensures downstream nodes receive the complete data structure
      return {
        ...originalInputObj,  // ✅ Preserve ALL input fields (items, rows, headers, values, etc.)
        expression,
        expressionValue,
        matchedCase,
        matchedLabel: matched?.label,
        // Convenience: expose for logs/debugging
        result: matchedCase,
      };
    }

    case 'if_else': {
      // ✅ REFACTORED: If/Else node with typed condition evaluation
      // Uses typed execution context and condition evaluator for proper type handling
      
      // ✅ CRITICAL DEBUG: Log raw input to understand what we're receiving
      console.log('[If/Else] 🔍 RAW INPUT RECEIVED:', {
        inputType: typeof input,
        isObject: typeof input === 'object' && input !== null && !Array.isArray(input),
        inputKeys: typeof input === 'object' && input !== null && !Array.isArray(input)
          ? Object.keys(input as Record<string, unknown>)
          : 'N/A',
        hasItems: typeof input === 'object' && input !== null && !Array.isArray(input) && 'items' in (input as Record<string, unknown>),
        itemsLength: typeof input === 'object' && input !== null && !Array.isArray(input) && Array.isArray((input as any).items)
          ? (input as any).items.length
          : 'N/A',
        inputSample: typeof input === 'object' && input !== null && !Array.isArray(input)
          ? JSON.stringify(Object.keys(input as Record<string, unknown>).reduce((acc, key) => {
              const val = (input as Record<string, unknown>)[key];
              if (key === 'items' && Array.isArray(val)) {
                acc[key] = `[Array(${val.length})]`;
              } else if (key === 'rows' && Array.isArray(val)) {
                acc[key] = `[Array(${val.length})]`;
              } else {
                acc[key] = typeof val === 'object' ? '[Object]' : String(val).substring(0, 50);
              }
              return acc;
            }, {} as Record<string, string>))
          : String(input).substring(0, 100),
      });
      
      // ✅ CORE ARCHITECTURE FIX: Preserve original input object BEFORE any extraction
      // This ensures ALL input fields (items, rows, headers, values, etc.) are preserved
      const originalInputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : extractInputObject(input);
      
      // ✅ CRITICAL DEBUG: Log originalInputObj after extraction
      console.log('[If/Else] 🔍 ORIGINAL INPUT OBJ:', {
        keys: Object.keys(originalInputObj),
        hasItems: 'items' in originalInputObj,
        itemsLength: Array.isArray(originalInputObj.items) ? originalInputObj.items.length : 'N/A',
        hasRows: 'rows' in originalInputObj,
        hasConditions: 'conditions' in originalInputObj,
        hasCombineOperation: 'combineOperation' in originalInputObj,
      });
      
      // ✅ CRITICAL FIX: Filter out node config fields from input
      // The input should ONLY contain upstream node outputs, NOT the node's own config
      // Node config fields like 'conditions' and 'combineOperation' should NOT be in input
      const filteredInput = { ...originalInputObj };
      // Remove node config fields that shouldn't be in input
      delete filteredInput.conditions;
      delete filteredInput.combineOperation;
      delete filteredInput.condition;
      delete filteredInput.condition_result;
      delete filteredInput.result;
      delete filteredInput.output;
      
      // ✅ DEBUG: Log input filtering to diagnose issues
      console.log('[If/Else] 🔍 FILTERED INPUT:', {
        originalInputKeys: Object.keys(originalInputObj),
        filteredInputKeys: Object.keys(filteredInput),
        hasItems: 'items' in filteredInput,
        itemsLength: Array.isArray(filteredInput.items) ? filteredInput.items.length : 'N/A',
        hasRows: 'rows' in filteredInput,
        hasConditions: 'conditions' in originalInputObj,
        removedKeys: Object.keys(originalInputObj).filter(k => !(k in filteredInput)),
      });
      
      // Create typed execution context from the filtered input
      // The input should contain only upstream node outputs (e.g., Google Sheets output)
      const execContext = createExecutionContext(filteredInput);
      
      // ✅ CORE ARCHITECTURE FIX: Ensure $json points to the filtered input (upstream outputs only)
      // The filtered input contains only upstream node outputs (items, rows, etc.)
      // We need to ensure $json.items.length resolves correctly
      const mergedInput = filteredInput;
      
      // ✅ FIX: Set $json and json to filtered input (contains items array from Google Sheets)
      execContext.variables.$json = mergedInput;
      execContext.variables.json = mergedInput;
      
      // ✅ FIX: Also ensure root-level properties (like items) are accessible directly
      // This ensures both $json.items and items resolve correctly
      Object.assign(execContext.variables, mergedInput);
      
      // Add all previous node outputs to context (for nodeId references)
      const allOutputs = nodeOutputs.getAll();
      Object.entries(allOutputs).forEach(([nodeId, output]) => {
        setNodeOutput(execContext, nodeId, output);
      });
      
      // ✅ FIX: Restore $json to point to merged input after setting node outputs
      // This ensures {{$json.items.length}} resolves correctly
      execContext.variables.$json = mergedInput;
      execContext.variables.json = mergedInput;
      execContext.lastOutput = mergedInput; // Also update lastOutput to merged input
      
      // ✅ DEBUG: Log context setup for condition evaluation
      if (process.env.DEBUG_DATA_FLOW === 'true') {
        console.log('[If/Else] Context setup:', {
          hasItems: 'items' in mergedInput,
          itemsIsArray: Array.isArray((mergedInput as any).items),
          itemsLength: Array.isArray((mergedInput as any).items) ? (mergedInput as any).items.length : 'N/A',
          $jsonKeys: Object.keys(mergedInput),
        });
      }
      
      // ✅ FIX: Handle both formats - normalize condition/conditions before extraction
      // Support: condition (string), conditions (array), or conditions (string - needs conversion)
      let condition: Condition | string | null = null;
      
      // Normalize: Convert condition (string) to conditions (array) format
      let normalizedConditions: any[] | null = null;
      if (config.conditions) {
        if (Array.isArray(config.conditions)) {
          normalizedConditions = config.conditions;
        } else if (typeof config.conditions === 'string') {
          // Frontend sometimes sends conditions as string - convert to array
          normalizedConditions = [{ expression: config.conditions }];
        } else if (typeof config.conditions === 'object' && config.conditions !== null) {
          const conditionsObj = config.conditions as Record<string, unknown>;
          if (conditionsObj.expression) {
            // Single condition object - wrap in array
            normalizedConditions = [config.conditions];
          }
        }
      } else if (config.condition) {
        // Old format: condition (string) -> convert to conditions array
        const conditionStr = typeof config.condition === 'string' ? config.condition : String(config.condition);
        if (conditionStr.trim()) {
          normalizedConditions = [{ expression: conditionStr.trim() }];
        }
      }
      
      // Extract condition from normalized array
      if (normalizedConditions && normalizedConditions.length > 0) {
        const firstCondition = normalizedConditions[0];
        if (typeof firstCondition === 'string') {
          condition = firstCondition;
        } else if (firstCondition && typeof firstCondition === 'object' && firstCondition.expression) {
          condition = firstCondition.expression;
        } else if (firstCondition && typeof firstCondition === 'object') {
          // Structured condition format - support both old (leftValue) and new (field) formats
          const validOperations: Condition['operation'][] = ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'contains', 'not_contains'];
          
          // New format: { field, operator, value }
          if ('field' in firstCondition && 'operator' in firstCondition) {
            const operation = firstCondition.operator || 'equals';
            const validOperation: Condition['operation'] = validOperations.includes(operation as Condition['operation']) 
              ? (operation as Condition['operation'])
              : 'equals';
            
            condition = {
              leftValue: firstCondition.field,
              operation: validOperation,
              rightValue: firstCondition.value,
            };
          }
          // Old format: { leftValue, operation, rightValue }
          else if ('leftValue' in firstCondition) {
            const operation = firstCondition.operation || 'equals';
            const validOperation: Condition['operation'] = validOperations.includes(operation as Condition['operation']) 
              ? (operation as Condition['operation'])
              : 'equals';
            
            condition = {
              leftValue: firstCondition.leftValue,
              operation: validOperation,
              rightValue: firstCondition.rightValue,
            };
          }
        }
      }
      
      if (!condition) {
        console.warn('[If/Else] Condition is empty, defaulting to false');
        const result = false;
        return {
          ...inputObj,
          condition: result,
          condition_result: result,
          result: result,
        };
      }
      
      // Evaluate condition with proper type handling
      let conditionResult: boolean;
      try {
        // ✅ DEBUG: Log condition evaluation details
        console.log('[If/Else] 🔍 Condition evaluation:', {
          nodeId: node.id,
          nodeLabel: node.data?.label,
          condition: typeof condition === 'string' ? condition : JSON.stringify(condition),
          inputKeys: Object.keys(inputObj),
          hasItems: 'items' in inputObj,
          itemsIsArray: Array.isArray((inputObj as any).items),
          itemsLength: Array.isArray((inputObj as any).items) ? (inputObj as any).items.length : 'N/A',
          contextVariables: Object.keys(execContext.variables),
          $json: execContext.variables.$json,
          json: execContext.variables.json,
          $jsonKeys: execContext.variables.$json && typeof execContext.variables.$json === 'object' 
            ? Object.keys(execContext.variables.$json as Record<string, unknown>)
            : [],
          lastOutput: execContext.lastOutput,
        });
        
        conditionResult = evaluateCondition(condition, execContext);
        
        // ✅ DEBUG: Log result with detailed context
        console.log('[If/Else] ✅ Condition result:', {
          nodeId: node.id,
          condition: typeof condition === 'string' ? condition : JSON.stringify(condition),
          result: conditionResult,
          $jsonItems: (execContext.variables.$json as any)?.items,
          $jsonItemsLength: Array.isArray((execContext.variables.$json as any)?.items) 
            ? (execContext.variables.$json as any).items.length 
            : 'N/A',
        });
      } catch (error) {
        console.error('[If/Else] ❌ Error evaluating condition:', error);
        conditionResult = false;
      }
      
      // ✅ CORE ARCHITECTURE FIX: Return full input data with condition metadata
      // If/Else nodes MUST forward ALL input data to the selected branch
      // This ensures downstream nodes receive the complete data structure (items, rows, etc.)
      // 
      // CRITICAL: Use originalInputObj which was preserved at the start of the function
      // This preserves ALL fields from the previous node (items, rows, headers, values, etc.)
      // The spread operator will merge all input fields with condition metadata
      const result = {
        ...originalInputObj,  // ✅ Preserve ALL input fields (items, rows, headers, values, google_sheets, etc.)
        condition: conditionResult,
        condition_result: conditionResult,
        result: conditionResult,
        output: conditionResult,
        // ✅ Also preserve conditions array for debugging (if it exists)
        ...(normalizedConditions ? { conditions: normalizedConditions } : {}),
        ...(config.combineOperation ? { combineOperation: config.combineOperation } : {}),
      };
      
      // ✅ DEBUG: Log to help diagnose data flow issues
      if (process.env.DEBUG_DATA_FLOW === 'true') {
        console.log('[If/Else] 🔍 Data forwarding check:', {
          inputType: typeof input,
          inputIsObject: typeof input === 'object' && input !== null,
          inputKeys: typeof input === 'object' && input !== null ? Object.keys(input as Record<string, unknown>) : [],
          inputObjKeys: Object.keys(inputObj),
          originalInputKeys: Object.keys(originalInputObj),
          hasItems: 'items' in originalInputObj,
          itemsIsArray: Array.isArray((originalInputObj as any).items),
          itemsLength: Array.isArray((originalInputObj as any).items) ? (originalInputObj as any).items.length : 'N/A',
          resultKeys: Object.keys(result),
          resultHasItems: 'items' in result,
          conditionResult,
        });
      }
      
      return result;
    }

    case 'chat_send': {
      // Chat Send node - sends message back to chat interface
      const message = getStringProperty(config, 'message', '');
      const sessionIdConfig = getStringProperty(config, 'sessionId', '');
      
      // Get sessionId from config, input, or execution context
      // Ensure it's always a string
      let sessionId: string = sessionIdConfig;
      if (!sessionId && inputObj.sessionId) {
        sessionId = String(inputObj.sessionId);
      }
      if (!sessionId && inputObj.executionId) {
        sessionId = String(inputObj.executionId);
      }

      if (!message) {
        return {
          ...inputObj,
          _error: 'Chat Send node: Message is required',
        };
      }

      // ✅ REFACTORED: Chat Send with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? resolveWithSchema(message, execContext, 'string') as string
        : String(resolveTypedValue(message, execContext));
      
      // Resolve sessionId template if it's not empty, otherwise try to get from context
      let resolvedSessionId: string = '';
      if (sessionId) {
        resolvedSessionId = typeof resolveWithSchema(sessionId, execContext, 'string') === 'string'
          ? resolveWithSchema(sessionId, execContext, 'string') as string
          : String(resolveTypedValue(sessionId, execContext));
      } else {
        // Try to get sessionId from chat_trigger node output
        const allOutputs = nodeOutputs.getAll();
        for (const [nodeId, output] of Object.entries(allOutputs)) {
          if (output && typeof output === 'object' && output !== null && 'sessionId' in output) {
            resolvedSessionId = String((output as any).sessionId);
            break;
          }
        }
      }
      
      if (!resolvedSessionId) {
        return {
          ...inputObj,
          _error: 'Chat Send node: Session ID is required. Connect this node to a Chat Trigger node to get the session ID, or provide it in the Session ID field.',
        };
      }

      try {
        // Get chat server instance
        const { getChatServer } = require('../services/chat/chat-server');
        const chatServer = getChatServer();

        // Send message to chat interface
        const sent = chatServer.sendToSession(resolvedSessionId, {
          type: 'chat',
          message: resolvedMessage,
        });

        if (!sent) {
          return {
            ...inputObj,
            _error: `Chat Send node: Failed to send message. Chat session ${resolvedSessionId} may not be connected.`,
            _warning: 'The chat interface may not be open or the session may have expired.',
          };
        }

        // ✅ REFACTORED: Return messaging result object
        return {
          id: resolvedSessionId,
          status: 'sent' as const,
          provider: 'chat',
          message: resolvedMessage,
          sessionId: resolvedSessionId,
          sentAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error('[Chat Send] Error sending message:', error);
        return {
          id: resolvedSessionId || '',
          status: 'failed' as const,
          provider: 'chat',
          error: error instanceof Error ? error.message : 'Chat Send failed',
        };
      }
    }

    case 'google_gmail': {
      // ✅ Gmail Node Execution - Complete implementation with credential resolution
      const operation = getStringProperty(config, 'operation', 'send');
      const to = getStringProperty(config, 'to', '');
      const subject = getStringProperty(config, 'subject', '');
      const body = getStringProperty(config, 'body', '');
      const messageId = getStringProperty(config, 'messageId', '');
      const query = getStringProperty(config, 'query', '');
      const maxResults = parseInt(getStringProperty(config, 'maxResults', '10'), 10) || 10;
      
      // ✅ REFACTORED: Gmail with typed resolution
      const execContext = createTypedContext();
      const resolvedTo = typeof resolveWithSchema(to, execContext, 'string') === 'string'
        ? resolveWithSchema(to, execContext, 'string') as string
        : String(resolveTypedValue(to, execContext));
      const resolvedSubject = typeof resolveWithSchema(subject, execContext, 'string') === 'string'
        ? resolveWithSchema(subject, execContext, 'string') as string
        : String(resolveTypedValue(subject, execContext));
      const resolvedBody = typeof resolveWithSchema(body, execContext, 'string') === 'string'
        ? resolveWithSchema(body, execContext, 'string') as string
        : String(resolveTypedValue(body, execContext));
      const resolvedMessageId = messageId ? (typeof resolveWithSchema(messageId, execContext, 'string') === 'string'
        ? resolveWithSchema(messageId, execContext, 'string') as string
        : String(resolveTypedValue(messageId, execContext))) : '';
      const resolvedQuery = query ? (typeof resolveWithSchema(query, execContext, 'string') === 'string'
        ? resolveWithSchema(query, execContext, 'string') as string
        : String(resolveTypedValue(query, execContext))) : '';
      
      try {
        // ✅ CRITICAL: Resolve Gmail credentials
        const { resolveGmailCredentials, sendGmailEmail, listGmailMessages, getGmailMessage } = await import('../shared/gmail-executor');
        
        const credential = await resolveGmailCredentials(
          supabase,
          workflowId,
          node.id,
          userId,
          currentUserId
        );
        
        if (!credential) {
          const ownerMessage = userId 
            ? `The workflow owner (user ${userId}) does not have a Google account connected.`
            : 'No workflow owner found.';
          const currentUserMessage = currentUserId && currentUserId !== userId
            ? `The current user (user ${currentUserId}) also does not have a Google account connected.`
            : '';
          const solutionMessage = userId && currentUserId && currentUserId !== userId
            ? 'Please ensure either: 1) The workflow owner connects their Google account in settings, or 2) You connect your Google account (if you have permission to use it for this workflow).'
            : userId
            ? 'Please ensure the workflow owner has connected their Google account in settings. If you\'re running someone else\'s workflow, you need to either: 1) Have the workflow owner connect their Google account, or 2) Transfer the workflow ownership to your account.'
            : 'Please connect a Google account in settings.';
          
          return {
            ...inputObj,
            _error: `Gmail: OAuth token not found. ${ownerMessage} ${currentUserMessage} ${solutionMessage}`,
          };
        }
        
        // ✅ CRITICAL: Validate scopes (warn but don't block - API will fail with proper error if missing)
        const scopes = credential.scopes || [];
        const hasRequiredScopes = REQUIRED_GMAIL_SCOPES.some(requiredScope =>
          scopes.some((scope: string) => scope === requiredScope || scope.includes('gmail'))
        );
        
        if (!hasRequiredScopes && scopes.length > 0) {
          console.warn(`[GmailNode] ⚠️ Missing required Gmail scopes. Found: ${scopes.join(', ')}. Required: ${REQUIRED_GMAIL_SCOPES.join(' or ')}. Execution will proceed but may fail.`);
        } else if (!hasRequiredScopes) {
          console.warn(`[GmailNode] ⚠️ No scopes found in token. Execution will proceed but may fail.`);
        }
        
        console.log(`[GmailNode] Using access token to send mail (operation: ${operation})`);
        
        // Execute operation
        if (operation === 'send') {
          // ✅ CRITICAL: Validate required fields
          if (!resolvedTo || !resolvedTo.trim()) {
            return {
              ...inputObj,
              _error: 'Gmail: "to" field is required for send operation',
            };
          }
          
          if (!resolvedSubject || !resolvedSubject.trim()) {
            return {
              ...inputObj,
              _error: 'Gmail: "subject" field is required for send operation',
            };
          }
          
          if (!resolvedBody || !resolvedBody.trim()) {
            return {
              ...inputObj,
              _error: 'Gmail: "body" field is required for send operation',
            };
          }
          
          const sendResult = await sendGmailEmail(credential, {
            to: resolvedTo,
            subject: resolvedSubject,
            body: resolvedBody,
          });
          
          if (!sendResult.success) {
            return {
              ...inputObj,
              _error: sendResult.error || 'Gmail: Failed to send email',
            };
          }
          
          return {
            ...inputObj,
            messageId: sendResult.messageId,
            to: resolvedTo,
            subject: resolvedSubject,
            success: true,
          };
        } else if (operation === 'list') {
          const listResult = await listGmailMessages(credential, {
            query: resolvedQuery,
            maxResults,
          });
          
          if (!listResult.success) {
            return {
              ...inputObj,
              _error: listResult.error || 'Gmail: Failed to list messages',
            };
          }
          
          return {
            ...inputObj,
            messages: listResult.messages || [],
            count: (listResult.messages || []).length,
          };
        } else if (operation === 'get') {
          if (!resolvedMessageId) {
            return {
              ...inputObj,
              _error: 'Gmail: "messageId" field is required for get operation',
            };
          }
          
          const getResult = await getGmailMessage(credential, {
            messageId: resolvedMessageId,
          });
          
          if (!getResult.success) {
            return {
              ...inputObj,
              _error: getResult.error || 'Gmail: Failed to get message',
            };
          }
          
          return {
            ...inputObj,
            message: getResult.message,
            messageId: resolvedMessageId,
          };
        } else if (operation === 'search') {
          // Search is same as list with query
          const searchResult = await listGmailMessages(credential, {
            query: resolvedQuery,
            maxResults,
          });
          
          if (!searchResult.success) {
            return {
              ...inputObj,
              _error: searchResult.error || 'Gmail: Failed to search messages',
            };
          }
          
          return {
            ...inputObj,
            messages: searchResult.messages || [],
            query: resolvedQuery,
            count: (searchResult.messages || []).length,
          };
        } else {
          return {
            ...inputObj,
            _error: `Gmail: Unsupported operation: ${operation}`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Gmail operation failed';
        console.error('[GmailNode] Error:', error);
        
        // Map common errors
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('invalid_token')) {
          return {
            ...inputObj,
            _error: 'Gmail: Authentication failed. Token invalid or expired. Please re-authenticate with Google.',
          };
        }
        if (errorMessage.includes('403') || errorMessage.includes('permission') || errorMessage.includes('scope')) {
          return {
            ...inputObj,
            _error: `Gmail: Permission denied. Missing required scope: ${REQUIRED_GMAIL_SCOPES.join(' or ')}. Please re-authenticate and grant Gmail permissions.`,
          };
        }
        if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
          return {
            ...inputObj,
            _error: `Gmail: Invalid request. ${errorMessage}`,
          };
        }
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          return {
            ...inputObj,
            _error: 'Gmail: Rate limit exceeded. Please try again later.',
          };
        }
        
        return {
          ...inputObj,
          _error: `Gmail: ${errorMessage}`,
        };
      }
    }

    case 'slack_message': {
      // Slack Message node - supports rich formatting and blocks
      const webhookUrl = getStringProperty(config, 'webhookUrl', '');
      const channel = getStringProperty(config, 'channel', '');
      const username = getStringProperty(config, 'username', 'CtrlChecks Bot');
      const iconEmoji = getStringProperty(config, 'iconEmoji', ':zap:');
      const message = getStringProperty(config, 'message', '');
      const blocksJson = getStringProperty(config, 'blocks', '[]');

      if (!webhookUrl) {
        return {
          ...inputObj,
          _error: 'Slack Message node: Webhook URL is required',
        };
      }

      if (!message && !blocksJson) {
        return {
          ...inputObj,
          _error: 'Slack Message node: Message or Blocks is required',
        };
      }

      // ✅ REFACTORED: Slack Message with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      
      // Resolve with type preservation - strings stay strings
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? resolveWithSchema(message, execContext, 'string') as string
        : String(resolveTypedValue(message, execContext));
      const resolvedChannel = channel ? (typeof resolveWithSchema(channel, execContext, 'string') === 'string'
        ? resolveWithSchema(channel, execContext, 'string') as string
        : String(resolveTypedValue(channel, execContext))) : '';
      const resolvedUsername = typeof resolveWithSchema(username, execContext, 'string') === 'string'
        ? resolveWithSchema(username, execContext, 'string') as string
        : String(resolveTypedValue(username, execContext));
      const resolvedIconEmoji = typeof resolveWithSchema(iconEmoji, execContext, 'string') === 'string'
        ? resolveWithSchema(iconEmoji, execContext, 'string') as string
        : String(resolveTypedValue(iconEmoji, execContext));

      // Parse blocks if provided - preserve structure
      let blocks: any[] = [];
      if (blocksJson && blocksJson.trim() !== '' && blocksJson !== '[]') {
        try {
          const resolvedBlocksRaw = resolveTypedValue(blocksJson, execContext);
          // If it's already an array, use it; otherwise parse JSON
          if (Array.isArray(resolvedBlocksRaw)) {
            blocks = resolvedBlocksRaw;
          } else {
            const resolvedBlocksStr = String(resolvedBlocksRaw);
            blocks = JSON.parse(resolvedBlocksStr);
            if (!Array.isArray(blocks)) {
              blocks = [];
            }
          }
        } catch (error) {
          console.warn('[Slack Message] Failed to parse blocks JSON, using empty blocks:', error);
          blocks = [];
        }
      }

      try {
        // Build Slack webhook payload
        const payload: any = {
          text: resolvedMessage || 'Message from CtrlChecks',
        };

        // Add optional fields
        if (resolvedChannel) {
          payload.channel = resolvedChannel;
        }
        if (resolvedUsername) {
          payload.username = resolvedUsername;
        }
        if (resolvedIconEmoji) {
          payload.icon_emoji = resolvedIconEmoji;
        }
        if (blocks.length > 0) {
          payload.blocks = blocks;
        }

        // Send to Slack webhook
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Slack API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const responseText = await response.text();
        
        // ✅ REFACTORED: Return messaging result object (not string, not wrapped)
        // Contract: { id, status, provider, message }
        return {
          id: responseText || 'unknown',
          status: 'sent' as const,
          provider: 'slack',
          message: resolvedMessage || 'Message sent successfully',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Slack message failed';
        console.error('[Slack Message] Error:', error);
        // Return error result object
        return {
          id: '',
          status: 'failed' as const,
          provider: 'slack',
          error: errorMessage,
        };
      }
    }

    case 'slack_webhook': {
      // Slack Webhook node - simplified webhook for basic messages
      const webhookUrl = getStringProperty(config, 'webhookUrl', '');
      const text = getStringProperty(config, 'text', '');

      if (!webhookUrl) {
        return {
          ...inputObj,
          _error: 'Slack Webhook node: Webhook URL is required',
        };
      }

      if (!text) {
        return {
          ...inputObj,
          _error: 'Slack Webhook node: Message text is required',
        };
      }

      // ✅ REFACTORED: Slack Webhook with typed resolution
      // Use typed execution context
      const execContext = createTypedContext();
      const resolvedText = typeof resolveWithSchema(text, execContext, 'string') === 'string'
        ? resolveWithSchema(text, execContext, 'string') as string
        : String(resolveTypedValue(text, execContext));

      try {
        // Send simple webhook payload
        const payload = {
          text: resolvedText,
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Slack API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const responseText = await response.text();
        
        // ✅ REFACTORED: Return messaging result object
        return {
          id: responseText || 'unknown',
          status: 'sent' as const,
          provider: 'slack_webhook',
          message: resolvedText,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Slack webhook failed';
        console.error('[Slack Webhook] Error:', error);
        return {
          id: '',
          status: 'failed' as const,
          provider: 'slack_webhook',
          error: errorMessage,
        };
      }
    }

    case 'merge': {
      // ✅ Merge node - combines multiple inputs from different sources
      // The execution engine already merges multiple inputs in the input building phase (lines 4528-4553)
      // This node just passes through the merged input, but we can add merge-specific logic here if needed
      // Config options: mode ('append' | 'overwrite' | 'deep_merge')
      const mergeMode = getStringProperty(config, 'mode', 'overwrite').toLowerCase();
      
      // For now, merge node just passes through the merged input (already merged by execution engine)
      // Future: Could implement different merge modes here (append arrays, deep merge objects, etc.)
      result = inputObj;
      break;
    }

    case 'merge_data': {
      // Merge Data - alias of merge behavior.
      // The unified execution engine already merges incoming edge outputs.
      // This node exists to express intent; treat it as passthrough.
      return inputObj;
    }

    case 'filter': {
      // Filter node - filters an array based on a JS condition expression.
      // Frontend config:
      // - array: '{{input.items}}' (optional; defaults to input.items)
      // - condition: 'item.active === true'
      const arrayExpr = getStringProperty(config, 'array', '').trim();
      const conditionExpr = getStringProperty(config, 'condition', '').trim();

      if (!conditionExpr) {
        return {
          ...inputObj,
          _error: 'Filter: condition is required',
        };
      }

      const execContext = createTypedContext();
      const resolvedArray = arrayExpr ? resolveTypedValue(arrayExpr, execContext) : (inputObj as any).items;
      const items = Array.isArray(resolvedArray)
        ? resolvedArray
        : Array.isArray((inputObj as any).items)
        ? (inputObj as any).items
        : null;

      if (!items) {
        return inputObj;
      }

      if (process.env.DISABLE_JAVASCRIPT_NODE === 'true') {
        return {
          ...inputObj,
          _error: 'Filter node execution is disabled for security reasons',
        };
      }

      try {
        const { VM } = require('vm2');
        const vm = new VM({
          timeout: 2000,
          sandbox: {
            Math,
            JSON,
            Date,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp,
            input: (() => {
              try { return JSON.parse(JSON.stringify(inputObj)); } catch { return inputObj; }
            })(),
          },
          eval: false,
          wasm: false,
          fixAsync: true,
        });

        const filtered = items.filter((item: any) => {
          const wrapped = `
            (function() {
              const item = ${JSON.stringify(item)};
              return (${conditionExpr});
            })()
          `;
          try {
            return Boolean(vm.run(wrapped));
          } catch {
            return false;
          }
        });

        return {
          ...inputObj,
          items: filtered,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Filter error: ${msg}` };
      }
    }

    case 'discord': {
      // Discord node - send message to a channel via Discord Bot API
      const channelId = getStringProperty(config, 'channelId', '');
      const message = getStringProperty(config, 'message', '');
      if (!channelId || !message) {
        return { ...inputObj, _error: 'Discord: channelId and message are required' };
      }

      const execContext = createTypedContext();
      const resolvedChannelId = typeof resolveWithSchema(channelId, execContext, 'string') === 'string'
        ? (resolveWithSchema(channelId, execContext, 'string') as string)
        : String(resolveTypedValue(channelId, execContext));
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? (resolveWithSchema(message, execContext, 'string') as string)
        : String(resolveTypedValue(message, execContext));

      // Token from config.botToken or vault key "discord"
      let botToken = getStringProperty(config, 'botToken', '') || getStringProperty(config, 'token', '');
      if (!botToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'discord');
            if (found) { botToken = found; break; }
          }
        } catch {
          // ignore
        }
      }

      if (!botToken) {
        return { ...inputObj, _error: 'Discord: bot token not found. Connect Discord or provide botToken.' };
      }

      try {
        const resp = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(resolvedChannelId)}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: resolvedMessage }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { ...inputObj, _error: `Discord send failed (${resp.status})`, _errorDetails: data };
        }
        return { ...inputObj, success: true, discord: data };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Discord error: ${msg}` };
      }
    }

    case 'discord_webhook': {
      const webhookUrl = getStringProperty(config, 'webhookUrl', '');
      const message = getStringProperty(config, 'message', '');
      if (!webhookUrl || !message) {
        return { ...inputObj, _error: 'Discord Webhook: webhookUrl and message are required' };
      }
      const execContext = createTypedContext();
      const resolvedWebhookUrl = typeof resolveWithSchema(webhookUrl, execContext, 'string') === 'string'
        ? (resolveWithSchema(webhookUrl, execContext, 'string') as string)
        : String(resolveTypedValue(webhookUrl, execContext));
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? (resolveWithSchema(message, execContext, 'string') as string)
        : String(resolveTypedValue(message, execContext));

      try {
        const resp = await fetch(resolvedWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: resolvedMessage }),
        });
        const text = await resp.text().catch(() => '');
        if (!resp.ok) {
          return { ...inputObj, _error: `Discord webhook failed (${resp.status})`, _errorDetails: text };
        }
        return { ...inputObj, success: true, discord_webhook: { status: resp.status, response: text } };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Discord webhook error: ${msg}` };
      }
    }

    case 'email': {
      // Generic SMTP email sender
      const to = getStringProperty(config, 'to', '');
      const subject = getStringProperty(config, 'subject', '');
      const text = getStringProperty(config, 'text', '');
      const html = getStringProperty(config, 'html', '');

      // Credentials: allow either workflow-injected fields (host/username/password/port)
      // or UI-style fields (smtpHost/smtpUser/smtpPassword/smtpPort)
      const host = getStringProperty(config, 'host', '') || getStringProperty(config, 'smtpHost', '');
      const portRaw = getStringProperty(config, 'port', '') || getStringProperty(config, 'smtpPort', '587');
      const user = getStringProperty(config, 'username', '') || getStringProperty(config, 'smtpUser', '');
      const pass = getStringProperty(config, 'password', '') || getStringProperty(config, 'smtpPassword', '');
      const from = getStringProperty(config, 'from', '') || user;

      if (!to || !subject || (!text && !html)) {
        return { ...inputObj, _error: 'Email (SMTP): to, subject, and text/html are required' };
      }
      if (!host || !user || !pass) {
        return { ...inputObj, _error: 'Email (SMTP): missing SMTP credentials (host/username/password)' };
      }

      const execContext = createTypedContext();
      const resolvedTo = typeof resolveWithSchema(to, execContext, 'string') === 'string'
        ? (resolveWithSchema(to, execContext, 'string') as string)
        : String(resolveTypedValue(to, execContext));
      const resolvedSubject = typeof resolveWithSchema(subject, execContext, 'string') === 'string'
        ? (resolveWithSchema(subject, execContext, 'string') as string)
        : String(resolveTypedValue(subject, execContext));
      const resolvedText = text
        ? (typeof resolveWithSchema(text, execContext, 'string') === 'string'
          ? (resolveWithSchema(text, execContext, 'string') as string)
          : String(resolveTypedValue(text, execContext)))
        : '';
      const resolvedHtml = html
        ? (typeof resolveWithSchema(html, execContext, 'string') === 'string'
          ? (resolveWithSchema(html, execContext, 'string') as string)
          : String(resolveTypedValue(html, execContext)))
        : '';

      try {
        const nodemailer = require('nodemailer');
        const port = Number(portRaw) || 587;
        const secure = port === 465;
        const transport = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });

        const info = await transport.sendMail({
          from,
          to: resolvedTo,
          subject: resolvedSubject,
          text: resolvedText || undefined,
          html: resolvedHtml || undefined,
        });

        return {
          ...inputObj,
          success: true,
          messageId: info?.messageId,
          accepted: info?.accepted,
          rejected: info?.rejected,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Email (SMTP) error: ${msg}` };
      }
    }

    case 'microsoft_teams': {
      // Microsoft Teams - send message via incoming webhook URL (recommended)
      const webhookUrl = getStringProperty(config, 'webhookUrl', '') || getStringProperty(config, 'webhook_url', '');
      const message = getStringProperty(config, 'message', '');
      if (!webhookUrl || !message) {
        return { ...inputObj, _error: 'Teams: webhookUrl and message are required' };
      }

      const execContext = createTypedContext();
      const resolvedWebhookUrl = typeof resolveWithSchema(webhookUrl, execContext, 'string') === 'string'
        ? (resolveWithSchema(webhookUrl, execContext, 'string') as string)
        : String(resolveTypedValue(webhookUrl, execContext));
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? (resolveWithSchema(message, execContext, 'string') as string)
        : String(resolveTypedValue(message, execContext));

      try {
        const resp = await fetch(resolvedWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: resolvedMessage }),
        });
        const text = await resp.text().catch(() => '');
        if (!resp.ok) {
          return { ...inputObj, _error: `Teams webhook failed (${resp.status})`, _errorDetails: text };
        }
        return { ...inputObj, success: true, teams: { status: resp.status, response: text } };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Teams error: ${msg}` };
      }
    }

    case 'split_in_batches': {
      // Split In Batches node - splits an array into batches.
      // Note: The current execution engine is DAG-based; this node exposes batches as data.
      const arrayExpr = getStringProperty(config, 'array', '').trim();
      const batchSizeRaw = (config as any).batchSize ?? getStringProperty(config, 'batchSize', '10');
      const batchSize = Math.max(1, Number(batchSizeRaw) || 10);

      const execContext = createTypedContext();
      const resolvedArray = arrayExpr ? resolveTypedValue(arrayExpr, execContext) : (inputObj as any).items;
      const items = Array.isArray(resolvedArray)
        ? resolvedArray
        : Array.isArray((inputObj as any).items)
        ? (inputObj as any).items
        : [];

      const batches: any[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      return {
        ...inputObj,
        batches,
        batchSize,
        totalBatches: batches.length,
        items: batches[0] || [],
        _warning: 'split_in_batches exposes batches; to iterate batches, use agent/loop mode (not yet enabled in DAG runtime).',
      };
    }

    case 'loop': {
      // Loop node - currently exposes the loop array and metadata.
      // Full subgraph-per-item looping requires agent/loop execution mode (pending).
      
      // ✅ CORE ARCHITECTURE FIX: Preserve original input object BEFORE any extraction
      // This ensures ALL input fields (items, rows, headers, values, etc.) are preserved
      const originalInputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : inputObj;

      const arrayExpr = getStringProperty(config, 'array', '').trim();
      const maxIterationsRaw = (config as any).maxIterations ?? getStringProperty(config, 'maxIterations', '100');
      const maxIterations = Math.max(1, Number(maxIterationsRaw) || 100);

      const execContext = createTypedContext();
      const resolvedArray = arrayExpr ? resolveTypedValue(arrayExpr, execContext) : (inputObj as any).items;
      const items = Array.isArray(resolvedArray)
        ? resolvedArray
        : Array.isArray((inputObj as any).items)
        ? (inputObj as any).items
        : [];

      const truncated = items.length > maxIterations;
      const loopItems = truncated ? items.slice(0, maxIterations) : items;

      // ✅ CORE ARCHITECTURE FIX: Return full input data with loop metadata
      // Loop nodes MUST forward ALL input data to downstream nodes
      // This ensures downstream nodes receive the complete data structure
      return {
        ...originalInputObj,  // ✅ Preserve ALL input fields (rows, headers, values, google_sheets, etc.)
        items: loopItems,      // ✅ Override items with looped array
        loop: {
          maxIterations,
          iterations: loopItems.length,
          truncated,
        },
        _warning: truncated
          ? `Loop: truncated to maxIterations=${maxIterations}`
          : 'Loop: iteration over downstream subgraph is not supported in DAG runtime yet; use function_item for per-item transforms.',
      };
    }

    case 'stop_and_error': {
      // Stop And Error - stops workflow execution with an error.
      const errorMessage = getStringProperty(config, 'errorMessage', 'Workflow stopped');
      const errorCode = getStringProperty(config, 'errorCode', 'STOPPED');
      throw new Error(`${errorCode}: ${errorMessage}`);
    }

    case 'error_handler': {
      // Error Handler node - best-effort compatibility.
      // In this runtime, retries/backoff are handled by the execution engine, not this node.
      // This node can optionally output a fallback when upstream sets `_error`.
      const fallbackValue = (config as any).fallbackValue;
      if ((inputObj as any)._error && fallbackValue !== undefined) {
        return {
          ...inputObj,
          handled: true,
          value: fallbackValue,
        };
      }
      return {
        ...inputObj,
        handled: false,
      };
    }

    case 'json_parser': {
      // JSON Parser - parse a JSON string into an object (and optionally extract fields)
      const jsonStr = getStringProperty(config, 'json', '');
      if (!jsonStr) {
        return { ...inputObj, _error: 'JSON Parser: json is required' };
      }
      const execContext = createTypedContext();
      const resolved = resolveTypedValue(jsonStr, execContext);
      let parsed: any;
      try {
        if (typeof resolved === 'object' && resolved !== null) {
          parsed = resolved;
        } else {
          parsed = JSON.parse(String(resolved));
        }
      } catch (e) {
        return { ...inputObj, _error: 'JSON Parser: invalid JSON' };
      }

      const extractFields = (config as any).extractFields;
      if (Array.isArray(extractFields) && extractFields.length > 0) {
        const out: Record<string, unknown> = {};
        extractFields.forEach((k: any) => {
          const key = String(k);
          out[key] = parsed?.[key];
        });
        return { ...inputObj, ...out, parsed };
      }

      return { ...inputObj, parsed };
    }

    case 'rename_keys': {
      // Rename Keys - rename object keys using mappings
      const mappings = (config as any).mappings || {};
      if (!mappings || typeof mappings !== 'object') {
        return { ...inputObj, _error: 'Rename Keys: mappings must be an object' };
      }
      const obj = { ...inputObj } as any;
      Object.entries(mappings).forEach(([from, to]) => {
        if (from in obj) {
          obj[String(to)] = obj[from];
          delete obj[from];
        }
      });
      return obj;
    }

    case 'edit_fields': {
      // Edit Fields - set/transform fields on the object
      const fields = (config as any).fields || {};
      if (!fields || typeof fields !== 'object') {
        return { ...inputObj, _error: 'Edit Fields: fields must be an object' };
      }
      const execContext = createTypedContext();
      const out: Record<string, unknown> = { ...inputObj };
      Object.entries(fields).forEach(([k, v]) => {
        if (typeof v === 'string') {
          out[k] = resolveTypedValue(v, execContext);
        } else {
          out[k] = v;
        }
      });
      return out;
    }

    case 'date_time': {
      // Date Time - minimal helpers: now, add, format (ISO)
      const operation = getStringProperty(config, 'operation', 'now').toLowerCase();
      const execContext = createTypedContext();
      const inputDateRaw = (config as any).date || (config as any).input || '';
      const baseDate = inputDateRaw
        ? new Date(String(resolveTypedValue(String(inputDateRaw), execContext)))
        : new Date();
      if (Number.isNaN(baseDate.getTime())) {
        return { ...inputObj, _error: 'DateTime: invalid date' };
      }
      if (operation === 'now') {
        return { ...inputObj, datetime: new Date().toISOString() };
      }
      if (operation === 'add') {
        const amount = Number((config as any).amount ?? 0);
        const unit = String((config as any).unit ?? 'minutes').toLowerCase();
        const ms =
          unit.startsWith('sec') ? amount * 1000 :
          unit.startsWith('hour') ? amount * 3600_000 :
          unit.startsWith('day') ? amount * 86_400_000 :
          amount * 60_000; // minutes default
        return { ...inputObj, datetime: new Date(baseDate.getTime() + ms).toISOString() };
      }
      if (operation === 'format') {
        return { ...inputObj, datetime: baseDate.toISOString() };
      }
      return { ...inputObj, _error: `DateTime: unsupported operation ${operation}` };
    }

    case 'csv': {
      // CSV - parse or generate. Minimal implementation without external libs.
      const operation = getStringProperty(config, 'operation', 'parse').toLowerCase();
      const execContext = createTypedContext();

      if (operation === 'parse') {
        const csvStr = getStringProperty(config, 'csv', '');
        const resolved = resolveTypedValue(csvStr, execContext);
        const text = String(resolved || '');
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { ...inputObj, items: [], rows: [] };
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => line.split(','));
        const items = rows.map(cols => {
          const obj: any = {};
          headers.forEach((h, i) => (obj[h] = (cols[i] ?? '').trim()));
          return obj;
        });
        return { ...inputObj, items, rows: items, headers };
      }

      if (operation === 'generate') {
        const dataRaw = (config as any).data ?? (inputObj as any).items ?? [];
        const data = Array.isArray(dataRaw) ? dataRaw : [];
        if (data.length === 0) return { ...inputObj, csv: '' };
        const headers = Object.keys(data[0] || {});
        const lines = [
          headers.join(','),
          ...data.map((row: any) => headers.map(h => JSON.stringify(row?.[h] ?? '')).join(',')),
        ];
        return { ...inputObj, csv: lines.join('\n') };
      }

      return { ...inputObj, _error: `CSV: unsupported operation ${operation}` };
    }

    case 'xml': {
      // XML - minimal passthrough parse placeholder (no external lib in deps)
      const xmlStr = getStringProperty(config, 'xml', '');
      if (!xmlStr) return { ...inputObj, _error: 'XML: xml is required' };
      const execContext = createTypedContext();
      const resolved = resolveTypedValue(xmlStr, execContext);
      return { ...inputObj, xml: String(resolved), _warning: 'XML parsing not implemented; returned raw xml string.' };
    }

    case 'html': {
      // HTML - minimal passthrough parse placeholder (no external lib in deps)
      const htmlStr = getStringProperty(config, 'html', '');
      if (!htmlStr) return { ...inputObj, _error: 'HTML: html is required' };
      const execContext = createTypedContext();
      const resolved = resolveTypedValue(htmlStr, execContext);
      return { ...inputObj, html: String(resolved), _warning: 'HTML parsing not implemented; returned raw html string.' };
    }

    case 'zoho':
    case 'zoho_crm': {
      // Zoho API node - supports all Zoho services (CRM, Books, Creator, Sheets, Tasks, Billing, Email, Tables)
      const service = getStringProperty(config, 'service', 'crm').toLowerCase();
      const resource = getStringProperty(config, 'resource', 'record');
      const operation = getStringProperty(config, 'operation', 'list');
      const region = (getStringProperty(config, 'region', 'US') || 'US') as 'US' | 'EU' | 'IN' | 'AU' | 'CN' | 'JP';

      // ✅ REFACTORED: Zoho with typed resolution
      const execContext = createTypedContext();

      // Get credentials - try from config first, then from database
      let accessToken = getStringProperty(config, 'accessToken', '');
      let refreshToken = getStringProperty(config, 'refreshToken', '');
      let clientId = getStringProperty(config, 'clientId', '');
      let clientSecret = getStringProperty(config, 'clientSecret', '');

      // If credentials not in config, try to get from database
      if (!accessToken || !clientId || !clientSecret) {
        const { getZohoCredentials } = await import('../shared/zoho-oauth');
        const credentials = await getZohoCredentials(
          supabase,
          config,
          userId,
          currentUserId
        );

        if (credentials) {
          accessToken = credentials.accessToken;
          refreshToken = credentials.refreshToken;
          clientId = credentials.clientId;
          clientSecret = credentials.clientSecret;
        }
      }

      if (!accessToken || !clientId || !clientSecret) {
        const ownerMessage = userId 
          ? `The workflow owner (user ${userId}) does not have a Zoho account connected.`
          : 'No workflow owner found.';
        const currentUserMessage = currentUserId && currentUserId !== userId
          ? `The current user (user ${currentUserId}) also does not have a Zoho account connected.`
          : '';
        const solutionMessage = userId && currentUserId && currentUserId !== userId
          ? 'Please ensure either: 1) The workflow owner connects their Zoho account in settings, or 2) You connect your Zoho account (if you have permission to use it for this workflow).'
          : userId
          ? 'Please ensure the workflow owner has connected their Zoho account in settings. If you\'re running someone else\'s workflow, you need to either: 1) Have the workflow owner connect their Zoho account, or 2) Transfer the workflow ownership to your account.'
          : 'Please connect a Zoho account in settings or provide credentials in node configuration.';
        
        return {
          ...inputObj,
          _error: `Zoho: Credentials not found. ${ownerMessage} ${currentUserMessage} ${solutionMessage}`,
        };
      }

      try {
        // Import Zoho API client
        const { createZohoApiClient } = await import('../shared/zoho-api-client');

        // Create Zoho API client
        const zohoClient = createZohoApiClient({
          accessToken,
          refreshToken: refreshToken || '',
          clientId,
          clientSecret,
          region,
        });

        // Build execution parameters from config
        const executeParams: any = {
          service,
          resource,
          operation,
        };

        // Add all other config fields as parameters
        Object.keys(config).forEach((key) => {
          if (!['service', 'resource', 'operation', 'region', 'accessToken', 'refreshToken', 'clientId', 'clientSecret'].includes(key)) {
            const value = config[key];
            // Resolve template variables if string
            if (typeof value === 'string') {
              const resolved = typeof resolveWithSchema(value, execContext, 'string') === 'string'
                ? resolveWithSchema(value, execContext, 'string') as string
                : String(resolveTypedValue(value, execContext));
              executeParams[key] = resolved;
            } else if (typeof value === 'object' && value !== null) {
              // For JSON fields, try to parse and resolve
              try {
                const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
                const parsed = JSON.parse(jsonStr);
                // Recursively resolve template variables in JSON
                const resolveJson = (obj: any): any => {
                  if (typeof obj === 'string') {
                    return typeof resolveWithSchema(obj, execContext, 'string') === 'string'
                      ? resolveWithSchema(obj, execContext, 'string') as string
                      : String(resolveTypedValue(obj, execContext));
                  } else if (Array.isArray(obj)) {
                    return obj.map(resolveJson);
                  } else if (obj && typeof obj === 'object') {
                    const resolved: any = {};
                    Object.keys(obj).forEach((k) => {
                      resolved[k] = resolveJson(obj[k]);
                    });
                    return resolved;
                  }
                  return obj;
                };
                executeParams[key] = resolveJson(parsed);
              } catch {
                executeParams[key] = value;
              }
            } else {
              executeParams[key] = value;
            }
          }
        });

        // Execute Zoho API call
        const response = await zohoClient.execute(executeParams);

        if (!response.success) {
          return {
            ...inputObj,
            _error: `Zoho API error: ${response.error?.message || 'Unknown error'}`,
            error: response.error,
          };
        }

        // Return successful response
        return {
          ...inputObj,
          success: true,
          data: response.data,
          service,
          resource,
          operation,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Zoho operation failed';
        console.error('[Zoho Node] Error:', error);
        
        return {
          ...inputObj,
          _error: `Zoho node: ${errorMessage}`,
        };
      }
    }

    // Database nodes
    case 'sql_server':
    case 'mssql':
    case 'mongodb':
    case 'mysql':
    case 'postgres':
    case 'postgresql':
    case 'redis':
    case 'snowflake':
    case 'sqlite':
    case 'supabase':
    case 'timescaledb':
    case 'timescale': {
      // Use typed execution context
      const execContext = createTypedContext();
      
      // Create NodeExecutionContext from current context
      const nodeContext = {
        inputs: normalizedConfig,
        previousOutputs: nodeOutputs.getAll(),
        workflowId,
        nodeId: node.id,
        userId: userId || currentUserId,
      };

      try {
        const dbResult = await executeDatabaseNode(type, nodeContext);
        
        // If the result has success: false, return error
        if (dbResult.success === false) {
          return {
            ...inputObj,
            _error: dbResult.error || 'Database operation failed',
          };
        }

        // Return the data from successful operation
        result = dbResult.data || dbResult;
      } catch (error: any) {
        const errorMessage = error.message || 'Database operation failed';
        console.error(`[Database Node ${type}] Error:`, error);
        return {
          ...inputObj,
          _error: `Database node error: ${errorMessage}`,
        };
      }
      break;
    }

    case 'hubspot': {
      // 🚨 CRITICAL: HubSpot CRM operations - create, update, retrieve, delete, search
      const resource = getStringProperty(config, 'resource', 'contact').toLowerCase();
      const operation = getStringProperty(config, 'operation', 'get').toLowerCase();
      
      // ✅ FIX 1: Get credentials - prefer accessToken (Private App token) over apiKey (deprecated)
      const accessToken = getStringProperty(config, 'accessToken', '').trim();
      const apiKey = getStringProperty(config, 'apiKey', '').trim();
      const token = accessToken || apiKey;
      
      if (!token) {
        throw new Error('HubSpot node requires either accessToken (Private App token) or apiKey in config');
      }
      
      // Validate token format (Private App tokens start with 'pat-', API keys are different)
      if (accessToken && !accessToken.startsWith('pat-') && !accessToken.startsWith('Bearer ')) {
        console.warn('[HubSpot] Access token format might be incorrect. Private App tokens typically start with "pat-"');
      }
      
      // ✅ REFACTORED: HubSpot with typed resolution
      const execContext = createTypedContext();
      
      // ✅ FIX 2: Improved properties parsing - resolve templates FIRST, then parse
      let properties: Record<string, any> = {};
      if (config.properties) {
        let propertiesValue = config.properties;
        
        // Step 1: If it's a string, resolve template expressions FIRST before parsing
        if (typeof propertiesValue === 'string') {
          // Check if it contains template expressions
          if (propertiesValue.includes('{{')) {
            // Resolve template expressions in the string first
            const resolved = resolveTypedValue(propertiesValue, execContext);
            // Resolved value might be a string or already an object
            if (typeof resolved === 'string') {
              properties = safeParse<Record<string, any>>(resolved, {}) || {};
            } else if (typeof resolved === 'object' && resolved !== null) {
              properties = resolved as Record<string, any>;
            } else {
              // Fallback: try to parse original string
              properties = safeParse<Record<string, any>>(propertiesValue, {}) || {};
            }
          } else {
            // No templates, parse the string directly
            properties = safeParse<Record<string, any>>(propertiesValue, {}) || {};
          }
        } else if (typeof propertiesValue === 'object' && propertiesValue !== null) {
          // If it's already an object, use it directly
          properties = propertiesValue as Record<string, any>;
        }
        
        // Step 2: Resolve template expressions in individual property values
        const resolvedProperties: Record<string, any> = {};
        for (const [key, value] of Object.entries(properties)) {
          if (typeof value === 'string' && value.includes('{{')) {
            // Resolve template expression
            const resolved = resolveTypedValue(value, execContext);
            resolvedProperties[key] = resolved;
          } else {
            // Use value as-is (already resolved or not a template)
            resolvedProperties[key] = value;
          }
        }
        properties = resolvedProperties;
        
        // ✅ FIX 3: Validate properties for create/update operations
        if ((operation === 'create' || operation === 'update') && Object.keys(properties).length === 0) {
          throw new Error(`HubSpot ${operation} operation requires at least one property. Properties field is empty.`);
        }
        
        // ✅ FIX 4: Validate required fields for contacts
        if (operation === 'create' && resource === 'contact') {
          if (!properties.email && !properties.firstname && !properties.lastname) {
            console.warn('[HubSpot] Creating contact without email, firstname, or lastname. At least one is recommended.');
          }
        }
      } else if (operation === 'create' || operation === 'update') {
        // Properties is required for create/update but missing
        throw new Error(`HubSpot ${operation} operation requires properties field, but it is missing or empty.`);
      }
      
      const baseUrl = 'https://api.hubapi.com';
      
      try {
        // ✅ FIX 5: Proper authentication header
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        // Use Bearer token (works for both Private App tokens and OAuth tokens)
        // Remove 'Bearer ' prefix if already present to avoid double prefix
        const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
        headers['Authorization'] = `Bearer ${cleanToken}`;
        
        if (operation === 'create') {
          // ✅ FIX 6: CREATE operation with proper validation
          const url = `${baseUrl}/crm/v3/objects/${resource}`;
          
          // Ensure properties is not empty
          if (!properties || Object.keys(properties).length === 0) {
            throw new Error(`Cannot create ${resource}: properties object is empty. At least one property is required.`);
          }
          
          const body = {
            properties: properties,
          };
          
          console.log(`[HubSpot] Creating ${resource} with properties:`, JSON.stringify(properties, null, 2));
          
          const fetchResponse = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
          
          const responseText = await fetchResponse.text();
          
          if (!fetchResponse.ok) {
            // ✅ FIX 7: Better error messages with API response details
            let errorDetails = responseText;
            try {
              const errorJson = JSON.parse(responseText);
              errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
            } catch {
              // Use raw text if not JSON
            }
            
            console.error(`[HubSpot] CREATE failed:`, {
              status: fetchResponse.status,
              statusText: fetchResponse.statusText,
              error: errorDetails,
              properties: properties,
            });
            
            throw new Error(`HubSpot CREATE failed (${fetchResponse.status}): ${errorDetails}`);
          }
          
          const responseData = JSON.parse(responseText);
          console.log(`[HubSpot] ✅ Created ${resource} successfully:`, responseData.id);
          
          // Return the created record
          result = {
            id: responseData.id,
            record: responseData,
            properties: responseData.properties || properties,
            createdAt: responseData.createdAt,
            updatedAt: responseData.updatedAt,
          };
        } else if (operation === 'get') {
          // ✅ GET operation - requires id
          const id = getStringProperty(config, 'id', '') || getStringProperty(config, 'objectId', '');
          if (!id) {
            throw new Error('HubSpot get operation requires id or objectId');
          }
          
          const url = `${baseUrl}/crm/v3/objects/${resource}/${id}`;
          
          const fetchResponse = await fetch(url, {
            method: 'GET',
            headers,
          });
          
          const responseText = await fetchResponse.text();
          
          if (!fetchResponse.ok) {
            let errorDetails = responseText;
            try {
              const errorJson = JSON.parse(responseText);
              errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
            } catch {
              // Use raw text if not JSON
            }
            
            throw new Error(`HubSpot GET failed (${fetchResponse.status}): ${errorDetails}`);
          }
          
          const responseData = JSON.parse(responseText);
          result = {
            id: responseData.id,
            record: responseData,
            properties: responseData.properties,
          };
        } else if (operation === 'update') {
          // ✅ FIX 8: UPDATE operation with proper validation
          const id = getStringProperty(config, 'id', '') || getStringProperty(config, 'objectId', '');
          if (!id) {
            throw new Error('HubSpot update operation requires id or objectId');
          }
          
          // Properties can be empty for partial updates, but warn if completely empty
          if (!properties || Object.keys(properties).length === 0) {
            console.warn('[HubSpot] UPDATE operation with empty properties - this will not update any fields');
          }
          
          const url = `${baseUrl}/crm/v3/objects/${resource}/${id}`;
          const body = {
            properties: properties || {},
          };
          
          console.log(`[HubSpot] Updating ${resource} ${id} with properties:`, JSON.stringify(properties, null, 2));
          
          const fetchResponse = await fetch(url, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
          });
          
          const responseText = await fetchResponse.text();
          
          if (!fetchResponse.ok) {
            let errorDetails = responseText;
            try {
              const errorJson = JSON.parse(responseText);
              errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
            } catch {
              // Use raw text if not JSON
            }
            
            console.error(`[HubSpot] UPDATE failed:`, {
              status: fetchResponse.status,
              statusText: fetchResponse.statusText,
              error: errorDetails,
              id: id,
              properties: properties,
            });
            
            throw new Error(`HubSpot UPDATE failed (${fetchResponse.status}): ${errorDetails}`);
          }
          
          const responseData = JSON.parse(responseText);
          console.log(`[HubSpot] ✅ Updated ${resource} ${id} successfully`);
          
          result = {
            id: responseData.id,
            record: responseData,
            properties: responseData.properties || properties,
          };
        } else if (operation === 'search') {
          // ✅ Search operation
          const searchQuery = getStringProperty(config, 'searchQuery', '');
          if (!searchQuery) {
            throw new Error('HubSpot search operation requires searchQuery');
          }
          
          const url = `${baseUrl}/crm/v3/objects/${resource}/search`;
          const body = {
            query: searchQuery,
            limit: parseInt(getStringProperty(config, 'limit', '100')) || 100,
          };
          
          const fetchResponse = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
          
          const responseText = await fetchResponse.text();
          
          if (!fetchResponse.ok) {
            let errorDetails = responseText;
            try {
              const errorJson = JSON.parse(responseText);
              errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
            } catch {
              // Use raw text if not JSON
            }
            
            throw new Error(`HubSpot SEARCH failed (${fetchResponse.status}): ${errorDetails}`);
          }
          
          const responseData = JSON.parse(responseText);
          result = {
            results: responseData.results || [],
            total: responseData.total || 0,
          };
        } else {
          throw new Error(`Unsupported HubSpot operation: ${operation}. Supported: create, get, update, search`);
        }
      } catch (error) {
        // ✅ FIX 9: Better error handling with full error details
        const errorMessage = error instanceof Error ? error.message : 'HubSpot operation failed';
        console.error(`[HubSpot] ${operation.toUpperCase()} operation failed:`, error);
        
        // Re-throw with more context
        if (error instanceof Error && error.message.includes('HubSpot')) {
          throw error; // Already has HubSpot error details
        } else {
          throw new Error(`HubSpot ${operation.toUpperCase()} failed: ${errorMessage}`);
        }
      }
      
      break;
    }

    case 'telegram': {
      // Telegram node - send messages via Telegram Bot API
      const messageType = getStringProperty(config, 'messageType', 'text').toLowerCase();
      const chatId = getStringProperty(config, 'chatId', '');
      const message = getStringProperty(config, 'message', '');
      const parseMode = getStringProperty(config, 'parseMode', 'HTML');
      const disableWebPagePreview = !!(config as any).disableWebPagePreview;
      const mediaUrl = getStringProperty(config, 'mediaUrl', '');
      const caption = getStringProperty(config, 'caption', '');

      if (!chatId) {
        return { ...inputObj, _error: 'Telegram: chatId is required' };
      }

      // Resolve templates
      const execContext = createTypedContext();
      const resolvedChatId = typeof resolveWithSchema(chatId, execContext, 'string') === 'string'
        ? (resolveWithSchema(chatId, execContext, 'string') as string)
        : String(resolveTypedValue(chatId, execContext));
      const resolvedMessage = typeof resolveWithSchema(message, execContext, 'string') === 'string'
        ? (resolveWithSchema(message, execContext, 'string') as string)
        : String(resolveTypedValue(message, execContext));
      const resolvedMediaUrl = mediaUrl
        ? (typeof resolveWithSchema(mediaUrl, execContext, 'string') === 'string'
          ? (resolveWithSchema(mediaUrl, execContext, 'string') as string)
          : String(resolveTypedValue(mediaUrl, execContext)))
        : '';
      const resolvedCaption = caption
        ? (typeof resolveWithSchema(caption, execContext, 'string') === 'string'
          ? (resolveWithSchema(caption, execContext, 'string') as string)
          : String(resolveTypedValue(caption, execContext)))
        : '';

      // Resolve token: config.botToken or vault key "telegram"
      let botToken = getStringProperty(config, 'botToken', '') || getStringProperty(config, 'token', '');
      if (!botToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'telegram');
            if (found) {
              botToken = found;
              break;
            }
          }
        } catch (e) {
          // ignore - handled below
        }
      }

      if (!botToken) {
        return { ...inputObj, _error: 'Telegram: bot token not found. Connect Telegram or provide botToken.' };
      }

      const baseUrl = `https://api.telegram.org/bot${botToken}`;

      try {
        if (messageType === 'text') {
          if (!resolvedMessage) return { ...inputObj, _error: 'Telegram: message is required for text messages' };
          const resp = await fetch(`${baseUrl}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: resolvedChatId,
              text: resolvedMessage,
              parse_mode: parseMode,
              disable_web_page_preview: disableWebPagePreview,
            }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            return { ...inputObj, _error: `Telegram sendMessage failed (${resp.status})`, _errorDetails: data };
          }
          return { ...inputObj, success: true, telegram: data };
        }

        // Minimal media support (photo/video/document) via URL
        if (!resolvedMediaUrl) {
          return { ...inputObj, _error: `Telegram: mediaUrl is required for messageType "${messageType}"` };
        }

        const endpoint =
          messageType === 'photo' ? 'sendPhoto'
          : messageType === 'video' ? 'sendVideo'
          : messageType === 'document' ? 'sendDocument'
          : null;

        if (!endpoint) {
          return { ...inputObj, _error: `Telegram: Unsupported messageType "${messageType}" (supported: text, photo, video, document)` };
        }

        const payload: any = { chat_id: resolvedChatId, caption: resolvedCaption };
        payload[messageType] = resolvedMediaUrl;

        const resp = await fetch(`${baseUrl}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { ...inputObj, _error: `Telegram ${endpoint} failed (${resp.status})`, _errorDetails: data };
        }
        return { ...inputObj, success: true, telegram: data };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Telegram error: ${msg}` };
      }
    }

    case 'outlook': {
      // Outlook node - minimal send email via Microsoft Graph API
      const operation = getStringProperty(config, 'operation', 'send_email').toLowerCase();
      if (operation !== 'send_email' && operation !== 'send') {
        return { ...inputObj, _error: `Outlook: Unsupported operation "${operation}". Supported: send_email` };
      }

      const to = getStringProperty(config, 'to', '');
      const subject = getStringProperty(config, 'subject', '');
      const body = getStringProperty(config, 'body', '');

      if (!to || !subject || !body) {
        return { ...inputObj, _error: 'Outlook: to, subject, and body are required' };
      }

      // Resolve templates
      const execContext = createTypedContext();
      const resolvedTo = typeof resolveWithSchema(to, execContext, 'string') === 'string'
        ? (resolveWithSchema(to, execContext, 'string') as string)
        : String(resolveTypedValue(to, execContext));
      const resolvedSubject = typeof resolveWithSchema(subject, execContext, 'string') === 'string'
        ? (resolveWithSchema(subject, execContext, 'string') as string)
        : String(resolveTypedValue(subject, execContext));
      const resolvedBody = typeof resolveWithSchema(body, execContext, 'string') === 'string'
        ? (resolveWithSchema(body, execContext, 'string') as string)
        : String(resolveTypedValue(body, execContext));

      // Token from config.accessToken or vault key "microsoft"
      let accessToken = getStringProperty(config, 'accessToken', '');
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'microsoft');
            if (found) {
              accessToken = found;
              break;
            }
          }
        } catch (e) {
          // ignore - handled below
        }
      }

      if (!accessToken) {
        return { ...inputObj, _error: 'Outlook: access token not found. Connect Microsoft or provide accessToken.' };
      }

      try {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              subject: resolvedSubject,
              body: {
                contentType: 'HTML',
                content: resolvedBody,
              },
              toRecipients: resolvedTo.split(',').map((email) => ({
                emailAddress: { address: email.trim() },
              })),
            },
            saveToSentItems: true,
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          return { ...inputObj, _error: `Outlook sendMail failed (${resp.status})`, _errorDetails: text };
        }

        return { ...inputObj, success: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `Outlook error: ${msg}` };
      }
    }

    case 'youtube': {
      // YouTube node - minimal token verification + channel discovery
      const operation = getStringProperty(config, 'operation', 'upload_video').toLowerCase();

      // Token from config.accessToken or vault key "youtube"
      let accessToken = getStringProperty(config, 'accessToken', '');
      if (!accessToken) {
        try {
          const { retrieveCredential } = await import('../core/utils/credential-retriever');
          const userIdsToTry: string[] = [];
          if (userId) userIdsToTry.push(userId);
          if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
          for (const uid of userIdsToTry) {
            const found = await retrieveCredential({ userId: uid, workflowId, nodeId: node.id, nodeType: type }, 'youtube');
            if (found) {
              accessToken = found;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (!accessToken) {
        return { ...inputObj, _error: 'YouTube: access token not found. Connect YouTube or provide accessToken.' };
      }

      // Always verify token by fetching the authenticated channel
      try {
        const resp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { ...inputObj, _error: `YouTube token verification failed (${resp.status})`, _errorDetails: data };
        }

        if (operation === 'upload_video' || operation === 'update_video' || operation === 'create_post') {
          // Video upload/update needs resumable upload + binary content; not implemented here yet.
          return {
            ...inputObj,
            youtube: data,
            _error: `YouTube operation "${operation}" is not implemented yet in execution engine. Token verified successfully.`,
          };
        }

        // Fallback: just return channel info
        return { ...inputObj, success: true, youtube: data };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ...inputObj, _error: `YouTube error: ${msg}` };
      }
    }

    case 'noop': {
      // NoOp node - passthrough
      return inputObj;
    }

    default: {
      // For unknown node types, return input as output
      console.warn(`Unknown node type: ${type}, returning input as output`);
      result = inputObj;
      break;
    }
  }

  // ✅ REFACTORED: Return result directly - no wrapping
  return normalizeNodeOutput(result, type);
}

/**
 * Main execute-workflow handler
 * 
 * ⚠️ CRITICAL ARCHITECTURE RULE:
 * This handler MUST ALWAYS fetch fresh workflow data from the database.
 * NEVER use cached workflows, in-memory objects, or normalized clones from previous requests.
 * 
 * Why: Users edit node configs and save → execution must reflect latest saved state.
 * 
 * Enforcement:
 * - Always call supabase.from('workflows').select().eq('id', workflowId).single()
 * - Never use workflowCache, Map<workflowId>, or any in-memory storage
 * - Normalization happens AFTER DB fetch, not before
 * - Log graph hash to verify fresh data
 */
export default async function executeWorkflowHandler(req: Request, res: Response) {
  const supabase = getSupabaseClient();
  const { workflowId, executionId: providedExecutionId, input = {}, useQueue } = req.body;

  // ✅ TEMP: Structured logging at endpoint start
  console.log('[ExecuteWorkflow] 🔵 ENDPOINT_START', JSON.stringify({
    workflowId,
    providedExecutionId,
    hasInput: !!input && Object.keys(input).length > 0,
    useQueue: useQueue !== undefined ? useQueue : 'auto',
    timestamp: new Date().toISOString(),
  }, null, 2));

  if (!workflowId) {
    return res.status(400).json({ error: 'workflowId is required' });
  }

  // 🆕 QUEUE: Check if queue should be used
  // Default: use queue if ENABLE_EXECUTION_QUEUE env var is set, or if useQueue is explicitly true
  const shouldUseQueue = useQueue === true || (useQueue === undefined && process.env.ENABLE_EXECUTION_QUEUE === 'true');
  
  if (shouldUseQueue) {
    try {
      const { getExecutionQueue } = await import('../services/execution-queue');
      const queue = await getExecutionQueue();
      
      // Extract user ID from auth header
      let userId: string | undefined;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.replace('Bearer ', '').trim();
          if (token) {
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) {
              userId = user.id;
            }
          }
        }
      } catch (error) {
        // Auth is optional
      }
      
      // Generate execution ID if not provided
      const executionId = providedExecutionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Enqueue job
      const jobId = await queue.enqueue(workflowId, executionId, input, {
        userId,
        metadata: {
          source: 'api',
          headers: {
            'x-internal-form-execution': req.headers['x-internal-form-execution'],
            'x-internal-chat-execution': req.headers['x-internal-chat-execution'],
            'x-internal-webhook-execution': req.headers['x-internal-webhook-execution'],
          },
        },
      });
      
      console.log(`[ExecuteWorkflow] Job queued: ${jobId} (execution: ${executionId})`);
      
      // Return job status immediately
      return res.status(202).json({
        status: 'queued',
        jobId,
        executionId,
        message: 'Workflow execution queued',
      });
      
    } catch (error: any) {
      console.error('[ExecuteWorkflow] Queue error:', error);
      // Fallback to direct execution if queue fails
      console.log('[ExecuteWorkflow] Falling back to direct execution');
    }
  }
  
  // Continue with direct execution (existing logic)

  // ✅ CRITICAL: Require Google OAuth connection for workflow execution
  // BUT: Bypass for internal trigger executions (form-trigger, chat-trigger, webhook - server-to-server)
  const isInternalFormExecution = req.headers['x-internal-form-execution'] === 'true';
  const isInternalChatExecution = req.headers['x-internal-chat-execution'] === 'true';
  const isInternalWebhookExecution = req.headers['x-internal-webhook-execution'] === 'true';
  const isInternalExecution = isInternalFormExecution || isInternalChatExecution || isInternalWebhookExecution;
  
  if (!isInternalExecution) {
    try {
      const { requireGoogleAuth } = await import('../core/utils/check-google-auth');
      await requireGoogleAuth(req);
    } catch (authError: any) {
      if (authError.code === ErrorCode.GOOGLE_AUTH_REQUIRED) {
        return res.status(403).json(authError);
      }
      return res.status(401).json(authError);
    }
  } else {
    const triggerType = isInternalFormExecution ? 'form-trigger' : 
                       isInternalChatExecution ? 'chat-trigger' : 
                       isInternalWebhookExecution ? 'webhook' : 'unknown';
    console.log(`[Execute Workflow] Bypassing Google OAuth for internal ${triggerType} execution`);
  }

  // ✅ CRITICAL: Import workflow cloner for immutable execution
  const { cloneWorkflowDefinition } = await import('../core/utils/workflow-cloner');

  let executionId: string | undefined;
  let logs: ExecutionLog[] = [];
  let currentUserId: string | undefined;

  // Extract current user from Authorization header (if available)
  // This is optional - workflow can execute without it
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            currentUserId = user.id;
            console.log(`[Execute Workflow] Current user: ${currentUserId}`);
          } else if (authError) {
            // Log auth error but don't fail - workflow can still execute
            console.log(`[Execute Workflow] Auth error (non-fatal): ${authError.message || 'Unknown auth error'}`);
          }
        } catch (authErr: any) {
          // Handle network/connection errors gracefully
          const errorMsg = authErr?.message || 'Unknown error';
          if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('fetch failed')) {
            console.log('[Execute Workflow] Supabase connection issue - continuing without current user ID');
          } else {
            console.log(`[Execute Workflow] Auth extraction error (non-fatal): ${errorMsg}`);
          }
        }
      }
    }
  } catch (error: any) {
    // Auth is optional - workflow can still execute without it
    const errorMsg = error?.message || 'Unknown error';
    console.log(`[Execute Workflow] Auth extraction failed (non-fatal): ${errorMsg}`);
  }

  try {
    // 🔒 STRUCTURAL FIX: Validate credentials BEFORE execution
    // Execution API must reject if any required credential is missing
    const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
    
    // ✅ CRITICAL: ALWAYS fetch fresh workflow from DB - NEVER use cache
    // This ensures execution always uses the latest saved configuration
    // ⚠️ DO NOT use any in-memory cache or cached workflow objects here
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();
    
    // ✅ SAFETY: Explicitly ensure we're not using cached data
    // Force fresh fetch by checking updated_at timestamp
    if (workflow && workflow.updated_at) {
      console.log(`[ExecuteWorkflow] 🔄 Fresh DB fetch confirmed - Workflow updated_at: ${workflow.updated_at}`);
    }

    // ✅ DEBUG: Log workflow fetch with hash for verification
    if (workflow) {
      const graphHash = JSON.stringify({ 
        nodes: workflow.nodes?.map((n: any) => ({ id: n.id, type: n.data?.type || n.type, config: n.data?.config })), 
        edges: workflow.edges?.map((e: any) => ({ source: e.source, target: e.target }))
      });
      const hash = require('crypto').createHash('md5').update(graphHash).digest('hex').substring(0, 8);
      console.log(`[ExecuteWorkflow] 📥 Fresh workflow fetched from DB - Graph hash: ${hash}, Updated at: ${workflow.updated_at || 'N/A'}`);
    }

    if (workflowError || !workflow) {
      console.error('Workflow fetch error:', workflowError);
      
      // Check if it's a Supabase connection error
      const errorMessage = workflowError?.message || String(workflowError || '');
      if (errorMessage.includes('ENOTFOUND') || 
          errorMessage.includes('fetch failed') || 
          errorMessage.includes('your-project-id')) {
        return res.status(500).json({ 
          error: 'Database configuration error',
          message: 'Supabase URL is not configured correctly. Please update SUPABASE_URL in your .env file with your actual Supabase project URL.',
          hint: 'Current URL appears to be a placeholder: your-project-id.supabase.co',
          details: 'The workflow cannot be fetched because the database connection is misconfigured.'
        });
      }
      
      return res.status(404).json({ 
        error: 'Workflow not found',
        message: workflowError?.message || 'The specified workflow could not be found.',
        workflowId 
      });
    }

    // ✅ EXECUTION GUARD: Workflow must be confirmed before execution
    // Check both confirmed field and status field for backward compatibility
    const isConfirmed = workflow.confirmed === true || workflow.status === 'active';
    if (!isConfirmed) {
      console.error(`[ExecuteWorkflow] ❌ Execution blocked - Workflow ${workflowId} is not confirmed`);
      return res.status(403).json({
        error: 'Workflow execution not allowed',
        message: 'Workflow must be confirmed before execution',
        code: 'WORKFLOW_NOT_CONFIRMED',
        workflowId,
        confirmed: workflow.confirmed,
        status: workflow.status,
        hint: 'Please confirm the workflow through the confirmation API before executing it.',
      });
    }

    // ✅ CRITICAL: Normalize workflow before cloning to ensure canonical graph structure
    // This removes duplicate triggers, invalid edges, and fixes structure issues
    // Same normalization used in save/attach-inputs ensures consistency
    const { normalizeWorkflowForSave } = await import('../core/validation/workflow-save-validator');
    const originalNodes = (workflow.nodes || []) as WorkflowNode[];
    const originalEdges = (workflow.edges || []) as WorkflowEdge[];
    const normalized = normalizeWorkflowForSave(originalNodes, originalEdges);
    
    // ✅ CRITICAL: Apply graph linearization (enforce single-trigger, single-chain)
    // This ensures workflows with multiple triggers or fan-out are converted to linear chains
    const { normalizeWorkflowGraph } = await import('../core/utils/workflow-graph-normalizer');
    const linearizedGraph = normalizeWorkflowGraph({ nodes: normalized.nodes, edges: normalized.edges });
    
    // ✅ TELEMETRY: Log normalization fixes for auditing
    if (normalized.migrationsApplied.length > 0 || linearizedGraph.nodes.length !== normalized.nodes.length) {
      const duplicateTriggersRemoved = originalNodes.filter(n => 
        (() => {
          const category = n.data?.category || '';
          const nodeType = n.data?.type || n.type || '';
          return category.toLowerCase() === 'triggers' || 
                 category.toLowerCase() === 'trigger' ||
                 nodeType.includes('trigger') ||
                 ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'form_trigger'].includes(nodeType);
        })()
      ).length - linearizedGraph.nodes.filter(n => 
        (() => {
          const category = n.data?.category || '';
          const nodeType = n.data?.type || n.type || '';
          return category.toLowerCase() === 'triggers' || 
                 category.toLowerCase() === 'trigger' ||
                 nodeType.includes('trigger') ||
                 ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'form_trigger'].includes(nodeType);
        })()
      ).length;
      
      console.log('[ExecuteWorkflow] 🔄 Normalization + Linearization applied before execution:', {
        workflowId,
        executionId,
        migrationsApplied: normalized.migrationsApplied,
        originalNodeCount: originalNodes.length,
        normalizedNodeCount: normalized.nodes.length,
        linearizedNodeCount: linearizedGraph.nodes.length,
        originalEdgeCount: originalEdges.length,
        normalizedEdgeCount: normalized.edges.length,
        linearizedEdgeCount: linearizedGraph.edges.length,
        duplicateTriggersRemoved,
        invalidEdgesRemoved: originalEdges.length - linearizedGraph.edges.length,
        nodeIds: linearizedGraph.nodes.map(n => n.id),
        removedNodeIds: originalNodes.filter(n => !linearizedGraph.nodes.some(nn => nn.id === n.id)).map(n => n.id),
      });
    }
    
    // ✅ CRITICAL: Clone workflow definition before execution
    // This ensures runtime never mutates the original workflow
    const clonedWorkflow = cloneWorkflowDefinition(linearizedGraph.nodes, linearizedGraph.edges, workflowId);
    const nodes = clonedWorkflow.nodes;
    const edges = clonedWorkflow.edges;
    
    console.log('[ExecuteWorkflow] ✅ Workflow normalized and cloned for immutable execution', {
      originalNodeCount: originalNodes.length,
      normalizedNodeCount: normalized.nodes.length,
      originalEdgeCount: originalEdges.length,
      normalizedEdgeCount: normalized.edges.length,
      clonedAt: clonedWorkflow.metadata.clonedAt,
    });

    // 🔒 STRUCTURAL FIX: Validate credentials are INJECTED into nodes BEFORE execution
    // Execution API must reject if credentials are not injected (not just in vault)
    const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
    
    // ✅ CRITICAL: Execution guard - validate workflow is ready
    // Use normalized/linearized nodes and edges for validation
    const workflowForValidation = { nodes, edges };
    
    // ✅ DEBUG: Log trigger count before validation
    const triggersBeforeValidation = nodes.filter((n: any) => {
      const nodeType = n.data?.type || n.type || '';
      const category = n.data?.category || '';
      return category.toLowerCase() === 'triggers' || 
             category.toLowerCase() === 'trigger' ||
             nodeType.includes('trigger') ||
             ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType);
    });
    console.log(`[ExecuteWorkflow] 🔍 Validation input: ${nodes.length} nodes, ${triggersBeforeValidation.length} trigger(s)`, {
      triggerIds: triggersBeforeValidation.map(t => t.id),
      nodeIds: nodes.map(n => n.id),
    });
    
    const executionValidation = await workflowLifecycleManager.validateExecutionReady(
      workflowForValidation,
      currentUserId
    );
    
    // ✅ CRITICAL: Check workflow phase/status
    // Use phase field for execution readiness (TEXT), status field for lifecycle (enum)
    // ✅ REFACTORED: Removed draft phase blocking - Save = Ready to Run
    let workflowStatus = workflow.status || 'active';
    let workflowPhase = workflow.phase || workflow.status || 'ready_for_execution';
    
    // ✅ CRITICAL: Re-run credential discovery to get accurate counts
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(
      { nodes, edges },
      currentUserId
    );
    const requiredCredentialsCount = credentialDiscovery.requiredCredentials?.length || 0;
    const missingCredentialsCount = credentialDiscovery.missingCredentials?.length || 0;
    
    // ✅ CRITICAL: Check if inputs are attached
    const nodeInputs = workflowLifecycleManager.discoverNodeInputs({ nodes, edges });
    
    // ✅ FIX: Also check for type mismatches in required fields
    // discoverNodeInputs only adds fields that are missing, but we need to check
    // if existing fields have the correct type (e.g., conditions should be array, not string)
    const { nodeDefinitionRegistry } = await import('../core/types/node-definition');
    const typeMismatchInputs: typeof nodeInputs.inputs = [];
    
    for (const node of nodes) {
      const nodeType = node.data?.type || node.type;
      const definition = nodeDefinitionRegistry.get(nodeType);
      if (!definition) continue;
      
      const config = node.data?.config || {};
      
      // ✅ FIX: Normalize If/Else conditions before validation
      const normalizedConfig = nodeType === 'if_else' 
        ? normalizeIfElseConditions(config)
        : config;
      
      // Check all required inputs for type mismatches
      for (const requiredField of definition.requiredInputs) {
        const value = normalizedConfig[requiredField];
        
        // Skip if value is missing (handled by discoverNodeInputs)
        if (value === undefined || value === null || value === '') {
          continue;
        }
        
        // Check if value matches expected type from schema
        const fieldSchema = definition.inputSchema[requiredField];
        if (fieldSchema) {
          const expectedType = fieldSchema.type;
          let typeMismatch = false;
          
          if (expectedType === 'array' && !Array.isArray(value)) {
            typeMismatch = true;
          } else if (expectedType === 'string' && typeof value !== 'string') {
            typeMismatch = true;
          } else if (expectedType === 'number' && typeof value !== 'number') {
            typeMismatch = true;
          } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
            typeMismatch = true;
          } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
            typeMismatch = true;
          }
          
          if (typeMismatch) {
            // Find the input info from nodeInputs or create a synthetic one
            const existingInput = nodeInputs.inputs.find(i => i.nodeId === node.id && i.fieldName === requiredField);
            if (existingInput) {
              typeMismatchInputs.push(existingInput);
            } else {
              // Create synthetic input info for type mismatch
              typeMismatchInputs.push({
                nodeId: node.id,
                nodeType,
                nodeLabel: node.data?.label || node.id,
                fieldName: requiredField,
                fieldType: expectedType,
                description: fieldSchema.description || requiredField,
                required: true,
              });
            }
          }
        }
      }
    }
    
    const missingInputs = nodeInputs.inputs.filter(input => {
      const node = nodes.find(n => n.id === input.nodeId);
      if (!node) return true;
      const config = node.data?.config || {};
      
      // ✅ FIX: Normalize If/Else conditions before validation
      // Frontend may send conditions as string, but backend expects array
      const normalizedConfig = node.data?.type === 'if_else' 
        ? normalizeIfElseConditions(config)
        : config;
      
      const value = normalizedConfig[input.fieldName];
      
      // For array fields (like conditions), check if it's a valid non-empty array
      if (input.fieldType === 'array') {
        return input.required && (!Array.isArray(value) || value.length === 0);
      }
      
      return input.required && (!value || value === '' || value === null || value === undefined);
    });
    
    // Combine missing inputs and type mismatch inputs
    const allMissingInputs = [...missingInputs, ...typeMismatchInputs];
    
    // ✅ CRITICAL: Structured logging before rejection
    const readinessCheck = {
      workflowId,
      phase: workflowStatus,
      requiredCredentialsCount,
      missingCredentialsCount,
      missingInputsCount: allMissingInputs.length,
      executionValidationReady: executionValidation.ready,
      executionValidationErrors: executionValidation.errors,
      executionValidationMissingCredentials: executionValidation.missingCredentials,
    };
    
    // ✅ TEMP: Structured logging after readiness validation
    console.log('[ExecuteWorkflow] 🟢 READINESS_CHECK', JSON.stringify({
      ...readinessCheck,
      timestamp: new Date().toISOString(),
    }, null, 2));
    
    // ✅ REFACTORED: Auto-prepare workflow if needed
    // If workflow is in draft, auto-update to active (Save = Ready to Run)
    if (workflowStatus === 'draft' || workflowStatus === 'ready') {
      console.log(`[ExecuteWorkflow] Workflow is in "${workflowStatus}" status - checking if we can auto-prepare...`);
      
      // Check if workflow actually needs inputs/credentials or if it's ready to run
      const hasAllInputs = allMissingInputs.length === 0;
      const hasAllCredentials = missingCredentialsCount === 0;
      const validationPasses = executionValidation.ready;
      
      if (hasAllInputs && hasAllCredentials && validationPasses) {
        console.log(`[ExecuteWorkflow] ✅ Workflow has all inputs and credentials - auto-updating status to active, phase to ready_for_execution`);
        
        // Auto-update status to 'active' (valid enum) and phase to 'ready_for_execution' (TEXT)
        const { data: statusUpdateData, error: statusUpdateError } = await supabase
          .from('workflows')
          .update({
            status: 'active', // Use valid enum value
            phase: 'ready_for_execution', // Use TEXT field for execution readiness
            updated_at: new Date().toISOString(),
          })
          .eq('id', workflowId)
          .select('id, status, phase')
          .single();

        if (statusUpdateError) {
          console.error('[ExecuteWorkflow] ❌ Failed to auto-update workflow status:', statusUpdateError);
          // Continue anyway - we'll try to execute
        } else {
          console.log(`[ExecuteWorkflow] ✅ Auto-updated workflow status to active, phase to ready_for_execution`);
          // Update local status and phase for rest of execution
          workflowStatus = 'active';
          workflowPhase = 'ready_for_execution';
        }
      } else {
        // Workflow needs inputs or credentials - provide helpful error
        const missingItems = [];
        if (allMissingInputs.length > 0) {
          missingItems.push(`${allMissingInputs.length} required input(s)`);
        }
        if (missingCredentialsCount > 0) {
          missingItems.push(`${missingCredentialsCount} credential(s)`);
        }
        
        return res.status(400).json({
          code: 'WORKFLOW_NOT_READY',
          error: 'Workflow not ready for execution',
          message: `Workflow is in "${workflowStatus}" status and missing: ${missingItems.join(', ')}. Please configure the workflow before executing.`,
          phase: workflowStatus,
          details: {
            missingInputsCount: allMissingInputs.length,
            missingCredentialsCount: missingCredentialsCount,
            missingInputs: allMissingInputs.map(i => `${i.nodeId}.${i.fieldName}`),
            missingCredentials: credentialDiscovery.missingCredentials?.map((c: any) => c.nodeId) || [],
          },
          hint: 'Configure the workflow nodes with required inputs and credentials, then try again.',
        });
      }
    }
    
    // ✅ OPTIMISTIC EXECUTION: Only block on HARD blockers, log warnings for soft blockers
    // HARD BLOCKERS (must reject):
    // - No trigger nodes
    // - No nodes at all
    // - Already executing (prevent double runs)
    // - Workflow structure completely broken
    
    // SOFT BLOCKERS (log warnings, continue execution):
    // - Missing credentials (nodes will fail at runtime)
    // - Missing optional inputs
    // - Validation warnings (multiple triggers will be normalized)
    // - Phase/status mismatches
    
    // Check for HARD blockers
    const triggerNodes = nodes.filter((n: any) => {
      const nodeType = n.data?.type || n.type || '';
      const category = n.data?.category || '';
      return category.toLowerCase() === 'triggers' || 
             category.toLowerCase() === 'trigger' ||
             nodeType.includes('trigger') ||
             ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType);
    });
    
    if (nodes.length === 0) {
      return res.status(400).json({
        code: ErrorCode.EXECUTION_NOT_READY,
        error: 'Workflow has no nodes',
        message: 'Cannot execute workflow with zero nodes',
        details: readinessCheck,
      });
    }
    
    if (triggerNodes.length === 0) {
      return res.status(400).json({
        code: ErrorCode.EXECUTION_NOT_READY,
        error: 'Workflow has no trigger',
        message: 'Workflow must have at least one trigger node to execute',
        details: readinessCheck,
      });
    }
    
    // Check if already executing (prevent double runs)
    if (workflowPhase === 'executing') {
      return res.status(409).json({
        code: ErrorCode.WORKFLOW_ALREADY_EXECUTING,
        error: 'Workflow is already executing',
        message: 'This workflow is currently running. Please wait for it to complete.',
        phase: workflowPhase,
        details: readinessCheck,
      });
    }
    
    // ✅ OPTIMISTIC: Log warnings for soft blockers but continue execution
    const warnings: string[] = [];
    
    if (missingCredentialsCount > 0) {
      const missingCreds = credentialDiscovery.missingCredentials?.map((c: any) => c.displayName || c.vaultKey).join(', ') || 'unknown';
      warnings.push(`⚠️ Missing ${missingCredentialsCount} credential(s): ${missingCreds}. Nodes requiring these credentials may fail at runtime.`);
    }
    
    if (allMissingInputs.length > 0) {
      warnings.push(`⚠️ Missing ${allMissingInputs.length} input(s): ${allMissingInputs.map(i => `${i.nodeLabel}.${i.fieldName}`).join(', ')}. Nodes may use default values or fail.`);
    }
    
    if (executionValidation.errors.length > 0) {
      // Filter out "multiple triggers" error if we've normalized (it's already fixed)
      const nonTriggerErrors = executionValidation.errors.filter((e: string) => 
        !e.includes('trigger nodes') || e.includes('should have exactly one')
      );
      if (nonTriggerErrors.length > 0) {
        warnings.push(`⚠️ Validation warnings: ${nonTriggerErrors.join('; ')}`);
      }
    }
    
    if (triggerNodes.length > 1) {
      warnings.push(`⚠️ Workflow has ${triggerNodes.length} trigger nodes (will use first one: ${triggerNodes[0].id})`);
    }
    
    // Log warnings but continue execution
    if (warnings.length > 0) {
      console.log('[ExecuteWorkflow] ⚠️ Execution warnings (continuing optimistically):', warnings);
    }
    
    // ✅ CRITICAL: Distributed execution locking - prevent double runs
    const { acquireExecutionLock, releaseExecutionLock } = await import('../services/execution/execution-lock');
    const { logExecutionEvent } = await import('../services/execution/execution-event-logger');

    // Handle execution ID (for resuming from webhook/form triggers)
    if (providedExecutionId) {
      const { data: existingExecution, error: fetchError } = await supabase
        .from('executions')
        .select('id, started_at, input, status')
        .eq('id', providedExecutionId)
        .single();

      if (fetchError || !existingExecution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      executionId = existingExecution.id;

      // ✅ CRITICAL: Type guard - ensure executionId and workflowId are defined
      if (!executionId || !workflowId) {
        return res.status(500).json({
          error: 'Invalid execution or workflow ID',
          executionId,
          workflowId,
        });
      }

      // Try to acquire lock for resume
      const lockResult = await acquireExecutionLock(supabase, workflowId, executionId);
      if (!lockResult.acquired) {
        return res.status(409).json({
          code: ErrorCode.RUN_ALREADY_ACTIVE,
          error: 'Workflow already has an active execution',
          message: `Cannot resume execution ${executionId} - workflow is locked by execution ${lockResult.existingExecutionId}`,
          details: {
            workflowId,
            executionId,
            existingExecutionId: lockResult.existingExecutionId,
          },
          recoverable: true,
        });
      }

      if (!existingExecution.started_at) {
        await supabase
          .from('executions')
          .update({ started_at: new Date().toISOString() })
          .eq('id', executionId);
      }

      await supabase
        .from('executions')
        .update({ 
          status: 'running',
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', executionId);

      // Log resume event (executionId and workflowId are guaranteed to be defined above)
      await logExecutionEvent(supabase, executionId!, workflowId!, 'RESUME_STARTED', {
        providedExecutionId,
        previousStatus: existingExecution.status,
      });
    } else {
      // Create new execution
      const startedAt = new Date().toISOString();
      const { data: newExecution, error: execError } = await supabase
        .from('executions')
        .insert({
          workflow_id: workflowId,
          user_id: workflow.user_id,
          status: 'running',
          trigger: 'manual',
          input,
          logs: [],
          started_at: startedAt,
          last_heartbeat: startedAt,
          timeout_seconds: 3600, // 1 hour default
        })
        .select()
        .single();

      if (execError || !newExecution) {
        // ✅ TEMP: Structured logging for execution creation failure
        console.error('[ExecuteWorkflow] ❌ EXECUTION_CREATE_FAILED', JSON.stringify({
          workflowId,
          error: execError?.message,
          errorCode: execError?.code,
          errorDetails: execError?.details,
          timestamp: new Date().toISOString(),
        }, null, 2));
        return res.status(500).json({ error: 'Failed to create execution' });
      }

      executionId = newExecution.id;

      // ✅ TEMP: Structured logging after execution row created
      console.log('[ExecuteWorkflow] 🟢 EXECUTION_ROW_CREATED', JSON.stringify({
        workflowId,
        executionId,
        status: newExecution.status,
        startedAt: newExecution.started_at,
        timestamp: new Date().toISOString(),
      }, null, 2));

      // ✅ CRITICAL: Type guard - ensure executionId and workflowId are defined
      if (!executionId || !workflowId) {
        return res.status(500).json({
          error: 'Invalid execution or workflow ID',
          executionId,
          workflowId,
        });
      }

      // ✅ CRITICAL: Acquire distributed execution lock (atomic)
      // ✅ TEMP: Structured logging before lock acquisition
      console.log('[ExecuteWorkflow] 🟡 LOCK_ACQUIRE_START', JSON.stringify({
        workflowId,
        executionId,
        timestamp: new Date().toISOString(),
      }, null, 2));

      const lockResult = await acquireExecutionLock(supabase, workflowId, executionId);
      
      // ✅ TEMP: Structured logging after lock acquisition
      console.log('[ExecuteWorkflow] 🟡 LOCK_ACQUIRE_RESULT', JSON.stringify({
        workflowId,
        executionId,
        lockAcquired: lockResult.acquired,
        existingExecutionId: lockResult.existingExecutionId,
        error: lockResult.error,
        timestamp: new Date().toISOString(),
      }, null, 2));

      if (!lockResult.acquired) {
        // Clean up execution record
        await supabase.from('executions').delete().eq('id', executionId);
        
        return res.status(409).json({
          code: ErrorCode.RUN_ALREADY_ACTIVE,
          error: 'Workflow already has an active execution',
          message: `Cannot start execution - workflow is locked by execution ${lockResult.existingExecutionId}`,
          details: {
            workflowId,
            executionId,
            existingExecutionId: lockResult.existingExecutionId,
          },
          recoverable: true,
        });
      }

      // ✅ TEMP: Structured logging before event logging
      console.log('[ExecuteWorkflow] 🟡 EVENT_LOG_START', JSON.stringify({
        workflowId,
        executionId,
        events: ['LOCK_ACQUIRED', 'RUN_STARTED'],
        timestamp: new Date().toISOString(),
      }, null, 2));

      // Log lock acquired and run started events (executionId and workflowId are guaranteed to be defined above)
      try {
        await logExecutionEvent(supabase, executionId!, workflowId!, 'LOCK_ACQUIRED', {
          workflowId,
          executionId,
        });
      } catch (err: any) {
        // ✅ CRITICAL: Log error but don't fail execution - event logging is non-critical
        console.error('[ExecuteWorkflow] ❌ LOCK_ACQUIRED event failed (non-fatal):', {
          error: err?.message || String(err),
          executionId,
          workflowId,
        });
        // Continue execution even if event logging fails
      }

      try {
        await logExecutionEvent(supabase, executionId!, workflowId!, 'RUN_STARTED', {
          workflowId,
          executionId,
          input,
          trigger: 'manual',
        });
        
        // ✅ OPTIMISTIC: Log warnings as execution events (non-blocking)
        if (warnings.length > 0) {
          for (const warning of warnings) {
            try {
              await logExecutionEvent(supabase, executionId!, workflowId!, 'WARNING', {
                message: warning,
                severity: 'warning',
              });
            } catch (warnErr: any) {
              console.warn('[ExecuteWorkflow] Warning log failed (non-fatal):', warnErr?.message);
            }
          }
        }
      } catch (err: any) {
        // ✅ CRITICAL: Log error but don't fail execution - event logging is non-critical
        console.error('[ExecuteWorkflow] ❌ RUN_STARTED event failed (non-fatal):', {
          error: err?.message || String(err),
          executionId,
          workflowId,
        });
        // Continue execution even if event logging fails
      }

      // ✅ TEMP: Structured logging after event logging
      console.log('[ExecuteWorkflow] 🟢 EVENT_LOG_COMPLETE', JSON.stringify({
        workflowId,
        executionId,
        eventsLogged: ['LOCK_ACQUIRED', 'RUN_STARTED'],
        timestamp: new Date().toISOString(),
      }, null, 2));
    }

    logs = [];
    
    // ✅ TEMP: Structured logging before execution setup
    console.log('[ExecuteWorkflow] 🟢 EXECUTION_SETUP_START', JSON.stringify({
      workflowId,
      executionId,
      providedExecutionId,
      timestamp: new Date().toISOString(),
    }, null, 2));
    
    // ============================================
    // ENTERPRISE ARCHITECTURE: Multi-Tier State Management
    // ============================================
    // Replaces in-memory LRU cache with enterprise-grade persistent layer
    // Architecture: Memory (Hot) → Database (Warm, ACID) → Object Storage (Cold)
    
    // Initialize persistent layer (ACID-compliant database persistence)
    const persistentLayer = new PersistentLayer(supabase);
    
    // Initialize object storage service (optional, for large payloads >1MB)
    const objectStorage = createObjectStorageService();
    
    // Initialize central execution state (coordinates all layers)
    // Ensure executionId and workflowId are defined
    if (!executionId || !workflowId) {
      return res.status(500).json({ 
        error: 'Missing execution ID or workflow ID',
        executionId,
        workflowId 
      });
    }
    
    const centralState = new CentralExecutionState(
      executionId,
      workflowId,
      persistentLayer,
      objectStorage
    );
    
    // Initialize state from database (source of truth)
    // This will load previous node outputs if resuming
    try {
      await centralState.initialize();
      console.log(`[EnterpriseState] ✅ Initialized execution state for ${executionId}`);
    } catch (error: any) {
      // If execution doesn't exist yet, that's fine - we'll create it
      if (!error.message?.includes('not found')) {
        console.error(`[EnterpriseState] ❌ Failed to initialize:`, error);
        // Continue anyway - will create new state
      }
    }
    
    // Set trigger input in central state
    // For backward compatibility, also maintain LRU cache for template resolution
    // (will be removed in future version)
    let cacheSize = parseInt(process.env.NODE_OUTPUTS_CACHE_SIZE || '100', 10);
    if (isNaN(cacheSize) || cacheSize <= 0) {
      cacheSize = 100;
    }
    const nodeOutputs = new LRUNodeOutputsCache(cacheSize, false);
    nodeOutputs.set('trigger', input, true);
    
    // Also set in central state
    await centralState.setNodeOutput('trigger', 'Trigger', 'trigger', {}, input, 0).catch(err => {
      console.warn(`[EnterpriseState] Failed to set trigger in central state:`, err);
    });
    
    // Warn if cache size may be too small for workflow
    if (nodes.length > 0 && cacheSize < nodes.length * 0.5) {
      console.warn(
        `[Memory] Cache size (${cacheSize}) may be too small for workflow with ${nodes.length} nodes. ` +
        `Consider increasing NODE_OUTPUTS_CACHE_SIZE to at least ${Math.ceil(nodes.length * 0.8)}`
      );
    }
    
    const ifElseResults: Record<string, boolean> = {};
    const switchResults: Record<string, string | null> = {};
    const skippedNodeIds = new Set<string>(); // ✅ CORE ARCHITECTURE FIX: Track skipped nodes for recursive skipping
    
    // Track memory usage for monitoring
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    // ✅ UNIFIED ENGINE: Use unified execution plan builder
    const { buildExecutionPlan } = await import('../core/execution/unified-execution-engine');
    const executionPlan = buildExecutionPlan(nodes, edges);
    
    // ✅ VALIDATION: Fail fast if execution plan has errors
    if (executionPlan.validationErrors.length > 0) {
      return res.status(400).json({
        code: ErrorCode.EXECUTION_NOT_READY,
        error: 'Workflow validation failed',
        message: `Workflow has validation errors: ${executionPlan.validationErrors.join('; ')}`,
        details: {
          validationErrors: executionPlan.validationErrors,
          validationWarnings: executionPlan.validationWarnings,
        },
        hint: 'Please fix the workflow validation errors before executing.',
      });
    }
    
    // ✅ VALIDATION: Warn about multiple triggers (should have been caught, but double-check)
    if (!executionPlan.triggerNode) {
      return res.status(400).json({
        code: ErrorCode.EXECUTION_NOT_READY,
        error: 'Workflow validation failed',
        message: 'Workflow must have exactly one trigger node',
        hint: 'Please add a trigger node to your workflow.',
      });
    }
    
    const executionOrder = executionPlan.executionOrder.filter(n => n.data.type !== 'error_trigger');
    const errorTriggerNodes = executionPlan.executionOrder.filter(n => n.data.type === 'error_trigger');
    
    // ✅ DEBUG: Log workflow structure
    console.log('[ExecuteWorkflow] 📊 Workflow structure:', {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      triggerNode: executionPlan.triggerNode ? { id: executionPlan.triggerNode.id, type: executionPlan.triggerNode.data.type, label: executionPlan.triggerNode.data.label } : null,
      ifElseNodes: nodes.filter(n => n.data.type === 'if_else').map(n => ({
        id: n.id,
        label: n.data.label,
        conditions: n.data.config?.conditions,
        condition: n.data.config?.condition,
      })),
      executionOrder: executionOrder.map(n => ({ id: n.id, type: n.data.type, label: n.data.label })),
      validationWarnings: executionPlan.validationWarnings,
    });

    // If resuming from form submission, find where we left off
    let startFromIndex = 0;
    // ✅ FIX: Use execution input when resuming (contains form submission data)
    let executionInput = input; // Default to request body input
    if (providedExecutionId) {
      const { data: execData } = await supabase
        .from('executions')
        .select('waiting_for_node_id, logs, input, trigger, status')
        .eq('id', executionId)
        .single();
      
      // ✅ CRITICAL: Use execution input when resuming (it contains form submission data)
      if (execData?.input) {
        executionInput = execData.input;
        console.log(`[Resume] Using execution input (contains form submission data):`, {
          hasFormData: !!(execData.input as any)?.form || !!(execData.input as any)?.submitted_at,
          inputKeys: Object.keys(execData.input as Record<string, unknown>),
        });
      }
      
      // Detect form submission resume: check if input has form submission structure
      // OR if waiting_for_node_id is set (for backward compatibility)
      // OR if status is "running" with form data (form was just submitted)
      const hasFormSubmissionData = execData?.input && 
        typeof execData.input === 'object' && 
        execData.input !== null &&
        ('form' in execData.input || 'submitted_at' in execData.input);
      
      const isResumingFromForm = hasFormSubmissionData && 
        (execData?.status === 'running' || execData?.trigger === 'form');
      
      const formNodeId = execData?.waiting_for_node_id || 
        (hasFormSubmissionData && execData.input && typeof execData.input === 'object' && 'form' in execData.input 
          ? (execData.input as any).form?.id 
          : null);

      // Chat trigger now works like webhook - each message creates a new execution
      // No resume logic needed for chat - workflow runs from start each time
      
      console.log(`[Resume] Checking for form resume:`, {
        hasFormSubmissionData,
        isResumingFromForm,
        formNodeId,
        waiting_for_node_id: execData?.waiting_for_node_id,
        status: execData?.status,
        trigger: execData?.trigger,
        inputKeys: execData?.input ? Object.keys(execData.input as Record<string, unknown>) : [],
        executionOrder: executionOrder.map(n => ({ id: n.id, type: n.data.type, label: n.data.label })),
      });
      
      if (formNodeId || isResumingFromForm) {
        // Find the form node index - try by ID first, then by type
        let formNodeIndex = -1;
        if (formNodeId) {
          formNodeIndex = executionOrder.findIndex(n => n.id === formNodeId);
        }
        if (formNodeIndex < 0 && hasFormSubmissionData) {
          // Find first form node in execution order
          formNodeIndex = executionOrder.findIndex(n => n.data.type === 'form');
        }
        
        if (formNodeIndex >= 0 && execData) {
          // ✅ FIX: Start execution AT the form node (not after it) so it gets executed
          // This ensures the form node updates the heartbeat and prevents stale_heartbeat timeout
          startFromIndex = formNodeIndex;
          const formNode = executionOrder[formNodeIndex];
          console.log(`[Resume] Resuming from node index ${startFromIndex} (at form node ${formNode.id})`);
          
          // ENTERPRISE ARCHITECTURE: Restore from database (source of truth)
          // CentralExecutionState already loaded state from database in initialize()
          // But we also restore from logs for backward compatibility
          if (execData.logs && Array.isArray(execData.logs)) {
            const restoredOutputs: Record<string, unknown> = {};
            execData.logs.forEach((log: any) => {
              if (log.output !== undefined && log.nodeId) {
                restoredOutputs[log.nodeId] = log.output;
              }
            });
            // Use warm() to restore all entries at once with same timestamp
            if (Object.keys(restoredOutputs).length > 0) {
              nodeOutputs.warm(restoredOutputs);
              console.log(`[Resume] Restored ${Object.keys(restoredOutputs).length} node outputs from logs (backward compatibility)`);
            }
          }
          
          // Set form node output to only the data object (form field values)
          // ✅ FIX: Return only the data object, not the full submission metadata
          if (execData.input && isResumingFromForm) {
            const formData = (execData.input as any).data || {};
            // Extract only the form field values (the data object)
            const formOutput = formData;
            nodeOutputs.set(formNode.id, formOutput);
            
            // ENTERPRISE ARCHITECTURE: Also persist to database
            await centralState.setNodeOutput(
              formNode.id,
              formNode.data.label || 'Form',
              formNode.data.type || 'form',
              execData.input,
              formOutput,
              formNodeIndex
            ).catch(err => {
              console.warn(`[EnterpriseState] Failed to persist form output:`, err);
            });
            
            // Create a log entry for the form node so it appears in execution logs
            const formNodeLog: ExecutionLog = {
              nodeId: formNode.id,
              nodeName: formNode.data.label || 'Form',
              status: 'success',
              startedAt: ((execData.input as any).meta && typeof (execData.input as any).meta === 'object' && 'submittedAt' in (execData.input as any).meta) 
                ? ((execData.input as any).meta as any).submittedAt 
                : (execData.input as any).submitted_at || new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              input: execData.input,
              output: formOutput,
            };
            logs.push(formNodeLog);
            
            console.log(`[Resume] Set form node output from submission data:`, {
              hasFormFields: !!(execData.input as any).data,
              hasTopLevelFields: Object.keys(execData.input as Record<string, unknown>).filter(k => !['submitted_at', 'form', 'data', 'files', 'meta'].includes(k)).length,
              formNodeId: formNode.id,
              outputKeys: Object.keys(formOutput),
            });
          }
        } else if (hasFormSubmissionData) {
          console.warn(`[Resume] Form submission data detected but form node not found in execution order`);
        }
      }

      // Chat trigger now works like webhook - each message creates a new execution
      // No resume logic needed - workflow runs from start each time
    }

    console.log('Execution order:', executionOrder.map(n => n.data.label));
    if (startFromIndex > 0) {
      console.log(`[Resume] Skipping first ${startFromIndex} nodes, starting from: ${executionOrder[startFromIndex]?.data.label}`);
    }

    // ✅ TEMP: Structured logging before execution loop
    console.log('[ExecuteWorkflow] 🟢 EXECUTION_LOOP_START', JSON.stringify({
      workflowId,
      executionId,
      totalNodes: executionOrder.length,
      startFromIndex,
      resumeFromNode: startFromIndex > 0 ? executionOrder[startFromIndex]?.id : null,
      executionOrder: executionOrder.map(n => ({ id: n.id, label: n.data.label, type: n.data.type })),
      timestamp: new Date().toISOString(),
    }, null, 2));

    // ✅ ARCHITECTURAL REFACTOR: Store user intent in global context for AI Input Resolver
    // This allows AI resolver to understand user's original intent when generating inputs.
    // IMPORTANT: Do not rely only on workflows.user_prompt (may not exist / may be empty).
    // Fallback to workflow.description and execution input (trigger/inputData) deterministically.
    try {
      const workflowData = await supabase
        .from('workflows')
        .select('user_prompt, description, name')
        .eq('id', workflowId)
        .single();

      const fromDb =
        (workflowData.data as any)?.user_prompt ||
        (workflowData.data as any)?.description ||
        (workflowData.data as any)?.name ||
        '';

      const fromInput =
        (executionInput as any)?.inputData?.workflowIntent ||
        (executionInput as any)?.inputData?.description ||
        (executionInput as any)?.description ||
        '';

      const userIntent = String(fromDb || fromInput || 'Process workflow data').trim();
        (global as any).currentWorkflowIntent = userIntent;
        console.log(`[ExecuteWorkflow] ✅ Stored user intent for AI Input Resolver: "${userIntent.substring(0, 100)}..."`);
    } catch (error) {
      const fromInput =
        (executionInput as any)?.inputData?.workflowIntent ||
        (executionInput as any)?.inputData?.description ||
        (executionInput as any)?.description ||
        '';
      const userIntent = String(fromInput || 'Process workflow data').trim();
      console.warn('[ExecuteWorkflow] ⚠️  Could not retrieve user intent from DB, using fallback');
      (global as any).currentWorkflowIntent = userIntent;
    }

    // ✅ FIX: Use executionInput (which may contain form submission data when resuming)
    let finalOutput: unknown = executionInput;
    let hasError = false;
    let errorMessage = '';

    // Execute nodes in order (starting from resume point if applicable)
    for (let i = startFromIndex; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      // PHASE 1: Normalize node type for consistent handling throughout execution
      const nodeType = unifiedNormalizeNodeType(node) || node.data?.type || node.type;
      const isTriggerNode = nodeType === 'manual_trigger' || 
                           nodeType === 'webhook' || 
                           nodeType === 'schedule' || 
                           nodeType === 'interval' || 
                           nodeType === 'form' || 
                           nodeType === 'form_trigger' || 
                           nodeType === 'chat_trigger' || 
                           nodeType === 'workflow_trigger' || 
                           nodeType === 'error_trigger';
      
      const log: ExecutionLog = {
        nodeId: node.id,
        nodeName: node.data?.label || node.id,
        status: 'running',
        startedAt: new Date().toISOString(),
      };
      
      // ✅ CRITICAL: Log trigger node execution start explicitly
      if (isTriggerNode) {
        console.log(`[ExecuteWorkflow] 🎯 Trigger node execution: ${node.data?.label || node.id} (${nodeType})`);
      }

      try {
        // ✅ UNIFIED ENGINE: Use unified skip logic and input building
        const { shouldSkipNode, buildNodeInput } = await import('../core/execution/unified-execution-engine');
        const incomingEdges = edges.filter(e => e.target === node.id);
        
        // ✅ CORE ARCHITECTURE FIX: Check if node should be skipped based on conditional branches
        // Pass skippedNodeIds to enable recursive skipping of downstream nodes
        const skipNode = shouldSkipNode(node, incomingEdges, nodes, ifElseResults, switchResults, skippedNodeIds);
        
        // ✅ CORE ARCHITECTURE FIX: Build node input from incoming edges FIRST
        // This merges outputs from all upstream nodes correctly
        let nodeInput = buildNodeInput(node, edges, nodeOutputs, input);

        // ✅ TEMPLATE CONTEXT (CORE CONTRACT)
        // Ensure {{$json}} / {{json}} always reference the *current node input*.
        // This prevents stale template resolution (e.g., AI prompt referencing {{google_sheets.rows}}
        // while $json points to an older node's output).
        if (nodeInput && typeof nodeInput === 'object' && nodeInput !== null && !Array.isArray(nodeInput)) {
          nodeOutputs.set('$json', nodeInput, true);
          nodeOutputs.set('json', nodeInput, true);
        } else {
          const wrapped = { value: nodeInput, data: nodeInput };
          nodeOutputs.set('$json', wrapped, true);
          nodeOutputs.set('json', wrapped, true);
        }
        
        // Skip this node if it's on the wrong conditional path
        if (skipNode) {
          // ✅ FIX: Track skipped node so downstream nodes are also skipped
          skippedNodeIds.add(node.id);
          
          log.status = 'skipped';
          log.finishedAt = new Date().toISOString();
          log.output = nodeInput;
          logs.push(log);
          
          console.log('[ExecuteWorkflow] ⏭️  Skipping node (wrong branch):', {
            nodeId: node.id,
            nodeLabel: node.data?.label,
            nodeType: nodeType,
            reason: 'On wrong conditional branch',
            skippedNodeIds: Array.from(skippedNodeIds),
          });
          
          continue; // Skip to next node
        }

        const inputEdges = edges.filter(e => e.target === node.id);
        
        // ✅ CRITICAL FIX: For most nodes, use buildNodeInput result directly
        // Only override for special cases (AI Agent with port-specific inputs)
        // This ensures If/Else and other nodes get the correct merged input from upstream nodes
        
        // Special handling for AI Agent node with port-specific connections
        // Use normalized nodeType (already computed at loop start)
        if (nodeType === 'ai_agent' && inputEdges.length > 0) {
          const portInputs: Record<string, unknown> = {};
          
          // Process edges sequentially to handle async database lookups
          for (const edge of inputEdges) {
            // ENTERPRISE ARCHITECTURE: Try memory cache first, then database
            let sourceOutput = nodeOutputs.get(edge.source);
            
            // If not in memory cache, try database (multi-tier lookup)
            if (sourceOutput === undefined) {
              try {
                sourceOutput = await centralState.getNodeOutput(edge.source);
                if (sourceOutput !== null) {
                  // Warm memory cache with database data
                  nodeOutputs.set(edge.source, sourceOutput);
                  if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
                    console.log(`[EnterpriseState] Loaded node ${edge.source} from database (cache miss)`);
                  }
                }
              } catch (dbError) {
                console.warn(`[EnterpriseState] Failed to load ${edge.source} from database:`, dbError);
              }
            }
            
            if (sourceOutput === undefined || sourceOutput === null) {
              const nodeExists = nodes.some(n => n.id === edge.source);
              if (nodeExists) {
                console.warn(
                  `[Memory] Output for node "${edge.source}" not found (may have been evicted). ` +
                  `Cache size: ${nodeOutputs.getStats().maxSize}, current size: ${nodeOutputs.getStats().size}`
                );
              }
              continue; // Skip this source
            }
            
            // Check if source node is Text Formatter
            const sourceNode = nodes.find(n => n.id === edge.source);
            const isTextFormatter = sourceNode?.data?.type === 'text_formatter';
            
            const targetHandle = edge.targetHandle || 'default';
            const sourceHandle = edge.sourceHandle;
            
            // Debug: Log edge connection details
            if (process.env.NODE_ENV === 'development') {
              console.log(`[AI Agent] Edge from ${edge.source} (${sourceNode?.data?.type}) to ${edge.target}:`, {
                sourceHandle,
                targetHandle,
                isTextFormatter,
                sourceOutputType: typeof sourceOutput,
                sourceOutputKeys: typeof sourceOutput === 'object' && sourceOutput !== null ? Object.keys(sourceOutput as Record<string, unknown>) : 'N/A'
              });
            }
            
            // Extract specific field from sourceOutput if sourceHandle is specified
            let fieldValue: unknown = sourceOutput;
            if (sourceHandle && typeof sourceOutput === 'object' && sourceOutput !== null) {
              const sourceObj = sourceOutput as Record<string, unknown>;
              const sourceNodeType = sourceNode?.data?.type || sourceNode?.type || '';
              
              // ✅ CRITICAL FIX: Handle chat_trigger special case
              // chat_trigger outputs 'message' field, but edge might have 'data' or 'output' as sourceHandle
              if (sourceNodeType === 'chat_trigger') {
                // chat_trigger always outputs { message, userId, sessionId, timestamp }
                // If sourceHandle is 'data' or 'output', use 'message' instead
                if (sourceHandle === 'data' || sourceHandle === 'output') {
                  if ('message' in sourceObj) {
                    fieldValue = sourceObj.message;
                  } else {
                    // Fallback: use first string field found
                    const stringFields = Object.entries(sourceObj).find(([_, v]) => typeof v === 'string');
                    if (stringFields) {
                      fieldValue = stringFields[1];
                      console.log(`[AI Agent] ⚠️ chat_trigger: sourceHandle '${sourceHandle}' not found, using '${stringFields[0]}' instead`);
                    }
                  }
                } else if (sourceHandle in sourceObj) {
                  fieldValue = sourceObj[sourceHandle] as unknown;
                } else {
                  // Try 'message' as fallback for chat_trigger
                  if ('message' in sourceObj) {
                    fieldValue = sourceObj.message;
                    console.log(`[AI Agent] ⚠️ chat_trigger: sourceHandle '${sourceHandle}' not found, using 'message' instead`);
                  }
                }
              } else {
                // For other nodes, use standard field extraction
                // Try to get the field specified by sourceHandle
                if (sourceHandle in sourceObj) {
                  fieldValue = sourceObj[sourceHandle] as unknown;
                } else {
                  // If field not found, try dot notation (e.g., "data.message")
                  const parts = sourceHandle.split('.');
                  let current: unknown = sourceObj;
                  for (const part of parts) {
                    if (current && typeof current === 'object' && current !== null && part in current) {
                      current = (current as Record<string, unknown>)[part];
                    } else {
                      current = undefined;
                      break;
                    }
                  }
                  if (current !== undefined) {
                    fieldValue = current;
                  }
                }
              }
            }
            
            // CRITICAL FIX: If source is Text Formatter and connecting to userInput,
            // always extract the 'data' field as string (even if sourceHandle extraction already happened)
            if (isTextFormatter && 
                (targetHandle === 'userInput' || targetHandle === 'default' || !targetHandle) &&
                typeof fieldValue === 'object' && fieldValue !== null) {
              const obj = fieldValue as Record<string, unknown>;
              // Text Formatter always outputs { data: string, formatted: string }
              if ('data' in obj && typeof obj.data === 'string') {
                fieldValue = obj.data;
                console.log(`[AI Agent] Extracted Text Formatter data field: "${obj.data.substring(0, 50)}..."`);
              } else if ('formatted' in obj && typeof obj.formatted === 'string') {
                fieldValue = obj.formatted;
                console.log(`[AI Agent] Extracted Text Formatter formatted field: "${obj.formatted.substring(0, 50)}..."`);
              }
            }
            
            // Additional fallback: If we still have an object and connecting to userInput, 
            // try to extract string fields (for Text Formatter and similar nodes)
            if (typeof fieldValue === 'object' && fieldValue !== null && 
                (targetHandle === 'userInput' || targetHandle === 'default' || !targetHandle)) {
              const obj = fieldValue as Record<string, unknown>;
              // Prefer 'data' field if it exists and is a string
              if ('data' in obj && typeof obj.data === 'string') {
                fieldValue = obj.data;
              } else if ('formatted' in obj && typeof obj.formatted === 'string') {
                fieldValue = obj.formatted;
              } else if ('output' in obj && typeof obj.output === 'string') {
                fieldValue = obj.output;
              } else if ('text' in obj && typeof obj.text === 'string') {
                fieldValue = obj.text;
              }
              // If none of the string fields found, keep the whole object
            }
            
            // Map port handles to input structure
            if (targetHandle === 'chat_model') {
              portInputs.chat_model = fieldValue;
            } else if (targetHandle === 'memory') {
              portInputs.memory = fieldValue;
            } else if (targetHandle === 'tool') {
              portInputs.tool = fieldValue;
            } else if (targetHandle === 'userInput' || targetHandle === 'default' || !targetHandle) {
              // Left-side input port (userInput) - for text/data input
              // CRITICAL: Ensure we extract string value if fieldValue is still an object
              // This handles Text Formatter output where we need to extract the 'data' field
              if (typeof fieldValue === 'object' && fieldValue !== null) {
                const obj = fieldValue as Record<string, unknown>;
                if ('data' in obj && typeof obj.data === 'string') {
                  portInputs.userInput = obj.data;
                } else if ('formatted' in obj && typeof obj.formatted === 'string') {
                  portInputs.userInput = obj.formatted;
                } else if ('output' in obj && typeof obj.output === 'string') {
                  portInputs.userInput = obj.output;
                } else if ('text' in obj && typeof obj.text === 'string') {
                  portInputs.userInput = obj.text;
                } else {
                  portInputs.userInput = fieldValue;
                }
              } else {
                portInputs.userInput = fieldValue;
              }
            } else {
              // Fallback: treat as user input
              // Also extract string if it's an object
              if (typeof fieldValue === 'object' && fieldValue !== null) {
                const obj = fieldValue as Record<string, unknown>;
                if ('data' in obj && typeof obj.data === 'string') {
                  portInputs.userInput = obj.data;
                } else if ('formatted' in obj && typeof obj.formatted === 'string') {
                  portInputs.userInput = obj.formatted;
                } else {
                  portInputs.userInput = fieldValue;
                }
              } else {
                portInputs.userInput = fieldValue;
              }
            }
          }
          
          // Merge with any existing input (use executionInput which may contain form submission data)
          nodeInput = { ...extractInputObject(executionInput), ...portInputs };
        } else {
          // ✅ CRITICAL FIX: For all other nodes, use buildNodeInput result directly
          // buildNodeInput already correctly merges outputs from all upstream nodes
          // DO NOT overwrite it - that breaks If/Else and other nodes that need merged input
          // The nodeInput from buildNodeInput (line 12475) is already correct and should be used as-is
          
          // ✅ DEBUG: Log to verify buildNodeInput result is being used
          if (process.env.DEBUG_DATA_FLOW === 'true') {
            const inputKeys = typeof nodeInput === 'object' && nodeInput !== null 
              ? Object.keys(nodeInput as Record<string, unknown>)
              : [];
            console.log('[ExecuteWorkflow] ✅ Using buildNodeInput result for node:', {
              nodeId: node.id,
              nodeLabel: node.data?.label,
              nodeType: nodeType,
              nodeInputKeys: inputKeys,
              hasItems: 'items' in (nodeInput as Record<string, unknown>),
              hasRows: 'rows' in (nodeInput as Record<string, unknown>),
              itemsLength: Array.isArray((nodeInput as any)?.items) 
                ? (nodeInput as any).items.length 
                : 'N/A',
            });
          }
          
          // nodeInput is already set correctly by buildNodeInput above (line 12475) - use it as-is
          // DO NOT overwrite with single-edge logic - that would break nodes that need merged input
        }

        log.input = nodeInput;
        
        // Update execution logs when node starts running so frontend can see it immediately
        if (executionId) {
          try {
            const runningLogs = [...logs, log];
            const { error: runningLogsError } = await supabase
              .from('executions')
              .update({ logs: runningLogs })
              .eq('id', executionId);
            if (runningLogsError) {
              throw runningLogsError;
            }
          } catch (logUpdateError) {
            // Log error but don't break execution
            console.error(`[Workflow ${workflowId}] [Node ${node.id}] Failed to update execution logs:`, logUpdateError);
          }
        }

        // Handle form nodes - pause execution and wait for form submission
        // Check BEFORE executing the node to avoid unnecessary work
        // BUT skip if we're resuming and form node output is already set
        // Use normalized nodeType (already computed at loop start)
        // Chat trigger now works like webhook - no pausing, just output the message and continue
        // The chat-trigger.ts API creates a new execution for each message

        if (nodeType === 'form') {
          // Check if we're resuming and form node output is already set
          const existingFormOutput = nodeOutputs.get(node.id);
          if (existingFormOutput !== undefined) {
            console.log(`[Form Node] Form node output already set (resuming), skipping pause and using existing output`);
            // Form node output is already set from resume logic, just use it
            log.status = 'success';
            log.finishedAt = new Date().toISOString();
            log.output = existingFormOutput;
            logs.push(log);
            finalOutput = existingFormOutput;
            continue; // Skip to next node
          }
          
          console.log(`[Form Node] Detected form node: ${node.id}, pausing execution...`);
          console.log(`[Form Node] Execution ID: ${executionId}, Workflow ID: ${workflowId}`);
          
          // Update execution status to "waiting" for form submission
          if (executionId) {
            const updateData = {
              status: 'waiting',
              trigger: 'form',
              waiting_for_node_id: node.id,
            };
            
            console.log(`[Form Node] Updating execution with:`, updateData);
            
            const { data: updatedExecution, error: updateError } = await supabase
              .from('executions')
              .update(updateData)
              .eq('id', executionId)
              .select()
              .single();
            
            if (updateError) {
              console.error('[Form Node] Failed to update execution status:', updateError);
              console.error('[Form Node] Update data attempted:', updateData);
              console.error('[Form Node] Execution ID:', executionId);
              
              // Check if it's a column/type error
              const errorMessage = updateError.message || String(updateError);
              const isColumnError = errorMessage.includes('column') || 
                                   errorMessage.includes('does not exist') ||
                                   errorMessage.includes('invalid input value');
              
              if (isColumnError) {
                return res.status(500).json({
                  error: 'Database migration required',
                  message: 'The database schema needs to be updated for form triggers to work.',
                  details: errorMessage,
                  migrationHint: 'Please run the form_trigger_setup.sql migration in your Supabase SQL Editor. This adds the "waiting" status, "form" trigger, and "waiting_for_node_id" column.',
                });
              }
              
              return res.status(500).json({
                error: 'Failed to pause workflow',
                message: 'Could not set execution to waiting status',
                details: errorMessage,
                code: updateError.code,
              });
            } else {
              console.log(`[Form Node] Execution ${executionId} successfully set to waiting for form node ${node.id}`);
              console.log(`[Form Node] Updated execution:`, {
                id: updatedExecution?.id,
                status: updatedExecution?.status,
                trigger: updatedExecution?.trigger,
                waiting_for_node_id: updatedExecution?.waiting_for_node_id,
              });
            }
          } else {
            console.error('[Form Node] No execution ID available!');
            return res.status(500).json({
              error: 'Execution error',
              message: 'No execution ID found. Cannot pause workflow.',
            });
          }
          
          // Return early - workflow is paused waiting for form submission
          log.status = 'success'; // Use 'success' instead of 'waiting' to match type
          log.finishedAt = new Date().toISOString();
          logs.push(log);
          
          // Update execution with logs before returning
          if (executionId) {
            const { error: logError } = await supabase
              .from('executions')
              .update({ logs })
              .eq('id', executionId);
            
            if (logError) {
              console.error('[Form Node] Failed to update execution logs:', logError);
            }
          }
          
          // ✅ CRITICAL: Release execution lock when form node pauses
          // This allows new executions to start while waiting for form submission
          // The lock will be re-acquired when the form is submitted and execution resumes
          if (executionId && workflowId) {
            try {
              const { releaseExecutionLock } = await import('../services/execution/execution-lock');
              await releaseExecutionLock(supabase, workflowId, executionId);
              console.log(`[Form Node] ✅ Released execution lock for execution ${executionId} (workflow paused waiting for form)`);
            } catch (lockError) {
              console.error('[Form Node] Failed to release execution lock:', lockError);
              // Non-fatal - continue anyway
            }
          }
          
          // Generate form URL - use frontend URL format, not backend API URL
          // The frontend will handle routing to the form page
          const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || (process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(':3001', ':8080').replace('/api', '') : '') || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8080');
          if (!frontendUrl && process.env.NODE_ENV === 'production') {
            console.error('[Form Node] FRONTEND_URL environment variable is required in production');
            return res.status(500).json({
              error: 'Configuration error',
              message: 'Frontend URL is not configured. Please set FRONTEND_URL environment variable.',
            });
          }
          const formUrl = `${frontendUrl}/form/${workflowId}/${node.id}`;
          if (process.env.NODE_ENV !== 'production') {
          console.log(`[Form Node] Returning form URL: ${formUrl}`);
          }
          
          return res.status(200).json({
            success: true,
            status: 'waiting',
            executionId,
            message: 'Workflow paused waiting for form submission',
            formNodeId: node.id,
            formUrl,
          });
        }

        // ✅ CRITICAL: Initialize retryAttempt before try block for catch block scope
        let retryAttempt = 0;
        let output: unknown;
        let lastError: any = null;

        try {
          // ✅ CRITICAL: Log node started event
          try {
            await logExecutionEvent(supabase, executionId, workflowId, 'NODE_STARTED', {
              nodeId: node.id,
              nodeName: node.data?.label || node.id,
              nodeType,
              sequence: i + 1,
            }, node.id, node.data?.label || node.id, i + 1);
          } catch (eventErr: any) {
            // Non-fatal - log but continue
            console.warn('[ExecuteWorkflow] ⚠️ NODE_STARTED event failed (non-fatal):', eventErr?.message);
          }

          // ✅ CRITICAL: Update heartbeat
          await supabase
            .from('executions')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('id', executionId);

          // ✅ CRITICAL: Check if node was already completed (resume logic)
          const { data: existingStep } = await supabase
            .from('execution_steps')
            .select('*')
            .eq('execution_id', executionId)
            .eq('node_id', node.id)
            .single();

          if (existingStep && existingStep.status === 'completed' && existingStep.output_json) {
            // Node already completed - use cached output (resume)
            console.log(`[Resume] Node ${node.id} (${node.data?.label || node.id}) already completed - using cached output`);
            output = existingStep.output_json;
            
            // Log resume event
            await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FINISHED', {
              nodeId: node.id,
              nodeName: node.data?.label || node.id,
              nodeType,
              sequence: i + 1,
              resumed: true,
              success: true,
            }, node.id, node.data?.label || node.id, i + 1);
            
            // Skip to next node
            nodeOutputs.set(node.id, output);
            // ✅ CORE DATAFLOW FIX: also store by node type so templates like {{google_sheets.rows}} resolve
            {
              const typeKey = node.data?.type || node.type;
              const reserved = new Set(['trigger', 'input', '$json', 'json']);
              if (typeKey && !reserved.has(typeKey)) {
                nodeOutputs.set(typeKey, output);
              }
            }
            finalOutput = output;
            log.output = output;
            log.status = 'success';
            log.finishedAt = new Date().toISOString();
            logs.push(log);
            continue;
          }

          // ✅ CORE FIX: Create execution_step with 'running' status BEFORE execution.
          // Without this, the frontend sees no step during long-running nodes and
          // defaults to "running / null output" indefinitely (especially visible on
          // manual_trigger which is the very first node polled by the UI).
          // Placed AFTER resume check so we never overwrite a completed step.
          try {
            await supabase
              .from('execution_steps')
              .upsert({
                execution_id: executionId,
                node_id: node.id,
                node_name: node.data?.label || node.id,
                node_type: nodeType,
                input_json: nodeInput,
                output_json: null,
                status: 'running',
                sequence: i + 1,
                state_snapshot: { nodeId: node.id, nodeType, startedAt: new Date().toISOString() },
              }, { onConflict: 'execution_id,node_id' });
          } catch (_e) { /* best-effort */ }

          // ✅ CRITICAL: Execute node with retry policy
          const { getRetryConfig, calculateBackoff, shouldRetry } = await import('../services/execution/retry-policy');
          const retryConfig = getRetryConfig(node.data?.config || {});

          while (retryAttempt <= retryConfig.maxRetries) {
            try {
              // ✅ HEARTBEAT KEEPALIVE (CORE RELIABILITY)
              // Long-running nodes (e.g., Ollama) can exceed stale_heartbeat threshold.
              // Keep heartbeat updated while the node is executing to prevent false timeouts.
              const heartbeatIntervalMs = 60_000;
              const heartbeatTimer = setInterval(() => {
                // Best-effort, fire-and-forget. Avoid chaining .catch() here because
                // supabase typings can surface as PromiseLike in ts-jest transforms.
                void supabase
                  .from('executions')
                  .update({ last_heartbeat: new Date().toISOString() })
                  .eq('id', executionId);
              }, heartbeatIntervalMs);

            try {
              // Execute node
              output = await executeNode(
                node,
                nodeInput,
                nodeOutputs, // Keep for backward compatibility, but also use centralState
                supabase,
                workflowId,
                workflow.user_id,
                currentUserId
              );
              } finally {
                clearInterval(heartbeatTimer);
              }

              // Success - break retry loop
              if (retryAttempt > 0) {
                // Log successful retry
                await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FINISHED', {
                  nodeId: node.id,
                  nodeName: node.data?.label || node.id,
                  retryAttempt,
                  success: true,
                }, node.id, node.data?.label || node.id, i + 1);
              }
              break;
            } catch (error: any) {
              lastError = error;
              retryAttempt++;
              // Best-effort stop heartbeat timer if executeNode throws synchronously
              // (Timer is function-scoped in try; if not created, this is a no-op)

              // Check if should retry
              if (!shouldRetry(error, retryAttempt - 1, retryConfig)) {
                // Don't retry - throw immediately
                throw error;
              }

              if (retryAttempt <= retryConfig.maxRetries) {
                // Calculate backoff and wait
                const backoffMs = calculateBackoff(retryAttempt - 1, retryConfig);
                
                // Log retry event
                await logExecutionEvent(supabase, executionId, workflowId, 'NODE_RETRY', {
                  nodeId: node.id,
                  nodeName: node.data?.label || node.id,
                  retryAttempt,
                  backoffMs,
                  error: error.message || String(error),
                }, node.id, node.data?.label || node.id, i + 1);

                // Update execution_steps with retry info
                try {
                  const { data: existingStep } = await supabase
                    .from('execution_steps')
                    .select('id')
                    .eq('execution_id', executionId)
                    .eq('node_id', node.id)
                    .single();

                  if (existingStep) {
                    await supabase
                      .from('execution_steps')
                      .update({
                        retry_count: retryAttempt,
                        last_error: error.message || String(error),
                        next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
                        backoff_ms: backoffMs,
                      })
                      .eq('id', existingStep.id);
                  }
                } catch (stepError) {
                  console.warn('[Retry] Failed to update execution_steps:', stepError);
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              } else {
                // Max retries exceeded - throw error
                throw error;
              }
            }
          }

          // ============================================
          // ENTERPRISE ARCHITECTURE: Multi-Tier Persistence
          // ============================================
          // Store output in multiple layers:
          // 1. Memory cache (fast access, backward compatibility)
          // 2. Database (ACID compliance, source of truth)
          // 3. Object storage (if payload >1MB)
          
          nodeOutputs.set(node.id, output); // Backward compatibility
          // ✅ CORE DATAFLOW FIX: also store by node type so templates like {{google_sheets.rows}} resolve
          {
            const typeKey = node.data?.type || node.type;
            const reserved = new Set(['trigger', 'input', '$json', 'json']);
            if (typeKey && !reserved.has(typeKey)) {
              nodeOutputs.set(typeKey, output);
            }
          }
          
          // ✅ CRITICAL: Persist node-level execution state for resume
          try {
            // Persist to execution_steps table (for resume)
            const { data: stepData, error: stepError } = await supabase
              .from('execution_steps')
            .upsert({
              execution_id: executionId,
              node_id: node.id,
              node_name: node.data?.label || node.id,
              node_type: nodeType,
              input_json: nodeInput,
              output_json: output,
              status: 'completed',
              sequence: i + 1,
              completed_at: new Date().toISOString(),
              state_snapshot: {
                nodeId: node.id,
                nodeType,
                config: node.data?.config || {},
                completedAt: new Date().toISOString(),
              },
              checkpoint_data: {
                sequence: i + 1,
                completedNodes: executionOrder.slice(0, i + 1).map(n => n.id),
              },
              retry_count: retryAttempt,
              max_retries: retryConfig.maxRetries,
            }, {
              onConflict: 'execution_id,node_id',
            })
            .select()
            .single();

            if (stepError) {
              console.warn(`[Resume] Failed to persist execution step for node ${node.id}:`, stepError);
            } else {
              console.log(`[Resume] ✅ Persisted execution step for node ${node.id} (${node.data?.label || node.id})`);
            }
          } catch (stepPersistError) {
            console.warn(`[Resume] Failed to persist execution step:`, stepPersistError);
          }
          
          // Persist to database with ACID guarantees (central state)
          try {
            await centralState.setNodeOutput(
              node.id,
              node.data.label || node.id,
              nodeType,
              nodeInput,
              output,
              i + 1 // sequence
            );
            console.log(`[EnterpriseState] ✅ Checkpointed node ${node.id} (${node.data.label})`);
          } catch (persistError: any) {
            console.error(`[EnterpriseState] ❌ Failed to checkpoint node ${node.id}:`, persistError);
            // Don't fail workflow - log error and continue
            // State is still in memory cache for this execution
          }
          
          finalOutput = output;

          // CRITICAL: Auto-forward AI agent responses to chat UI
          // Check if this is an AI agent node with a response and if workflow has chat trigger
          if (nodeType === 'ai_agent' && typeof output === 'object' && output !== null) {
            const outputObj = output as any;
            if (outputObj.response_text) {
              // Check if workflow has a chat trigger node
              const chatTriggerNode = nodes.find(n => {
                const nType = n.data?.type || n.type;
                return nType === 'chat_trigger';
              });
              
              if (chatTriggerNode) {
                // Use static sessionId format: ${workflowId}_${nodeId}
                const chatSessionId = `${workflowId}_${chatTriggerNode.id}`;
                
                try {
                  const { getChatServer } = require('../services/chat/chat-server');
                  const chatServer = getChatServer();
                  
                  const sent = chatServer.sendToSession(chatSessionId, {
                    type: 'chat',
                    message: outputObj.response_text,
                  });
                  
                  // Debug logging
                  if (process.env.CHAT_DEBUG === 'true') {
                    const { ChatDebugLogger } = require('../utils/chat-debug');
                    ChatDebugLogger.logAgentResponse(
                      chatSessionId,
                      outputObj.response_text,
                      sent
                    );
                  }
                  
                  if (sent) {
                    console.log(`[Workflow ${workflowId}] ✅ Auto-forwarded AI agent response to chat UI (sessionId: ${chatSessionId}): ${outputObj.response_text.substring(0, 100)}...`);
                  } else {
                    console.warn(`[Workflow ${workflowId}] ⚠️ Failed to forward AI agent response. Session ${chatSessionId} may not be connected.`);
                  }
                } catch (chatError: any) {
                  console.error(`[Workflow ${workflowId}] Error forwarding AI agent response to chat UI:`, chatError?.message || chatError);
                  
                  // Debug logging for errors
                  if (process.env.CHAT_DEBUG === 'true') {
                    const { ChatDebugLogger } = require('../utils/chat-debug');
                    ChatDebugLogger.logAgentResponse(
                      chatSessionId,
                      outputObj.response_text,
                      false,
                      chatError?.message || String(chatError)
                    );
                  }
                  
                  // Don't fail the workflow if chat forwarding fails
                }
              }
            }
          }

          // Handle If/Else and Switch nodes
          // Use normalized nodeType (already computed at loop start)
          if (nodeType === 'if_else' && typeof output === 'object' && output !== null) {
            const outputObj = output as Record<string, unknown>;
            if (typeof outputObj.condition === 'boolean') {
              ifElseResults[node.id] = outputObj.condition;
              // ✅ DEBUG: Log stored result
              console.log('[ExecuteWorkflow] 💾 Stored If/Else result:', {
                nodeId: node.id,
                nodeLabel: node.data.label,
                condition: outputObj.condition,
                condition_result: outputObj.condition_result,
                result: outputObj.result,
                output: outputObj.output,
                allResults: { ...ifElseResults },
              });
            } else {
              console.warn('[ExecuteWorkflow] ⚠️ If/Else output missing boolean condition:', {
                nodeId: node.id,
                outputKeys: Object.keys(outputObj),
                condition: outputObj.condition,
                conditionType: typeof outputObj.condition,
              });
            }
          }

          if (nodeType === 'switch' && typeof output === 'object' && output !== null) {
            const outputObj = output as Record<string, unknown>;
            if (outputObj.matchedCase !== undefined) {
              switchResults[node.id] = outputObj.matchedCase as string | null;
            }
          }

          // ============================================
          // ✅ CORE ARCHITECTURE FIX: Detect soft errors
          // ============================================
          // The dynamic executor returns { _error: "..." } instead of throwing.
          // Without this check, the loop treats it as success, downstream nodes
          // still execute, and overall status is "success" despite real failures.
          //
          // Fix: detect _error in output → mark node as failed →
          //       add to skippedNodeIds so shouldSkipNode() recursively
          //       prevents ALL downstream nodes from executing →
          //       set hasError so overall status = 'failed'.
          // ============================================
          if (output && typeof output === 'object' && !Array.isArray(output)) {
            const outputObj = output as Record<string, unknown>;
            if (typeof outputObj._error === 'string' && outputObj._error.length > 0) {
              const softErrorMsg = outputObj._error;
              console.error(
                `[ExecuteWorkflow] ❌ Node returned soft error: ${node.data.label} (${nodeType}): ${softErrorMsg}`
              );

              // 1. Add to skippedNodeIds → shouldSkipNode will recursively skip downstream
              skippedNodeIds.add(node.id);

              // 2. Mark overall workflow as failed
              hasError = true;
              errorMessage = `Node "${node.data.label}" failed: ${softErrorMsg}`;

              // 3. Persist step as 'error'
              try {
                await supabase
                  .from('execution_steps')
                  .update({ status: 'error', last_error: softErrorMsg })
                  .eq('execution_id', executionId)
                  .eq('node_id', node.id);
              } catch (_e) { /* best-effort */ }

              // 4. Log and push
              log.output = output;
              log.status = 'failed';
              log.error = softErrorMsg;
              log.finishedAt = new Date().toISOString();
              logs.push(log);

              await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FAILED', {
                nodeId: node.id,
                nodeName: node.data.label,
                nodeType,
                sequence: i + 1,
                error: softErrorMsg,
                softError: true,
              }, node.id, node.data.label, i + 1);

              // 5. Update incremental logs for real-time frontend progress
              if (executionId) {
                try {
                  await supabase.from('executions').update({ logs }).eq('id', executionId);
                } catch (_e) { /* best-effort */ }
              }

              continue; // Skip to next node - shouldSkipNode handles downstream
            }
          }

          log.output = output;
          log.status = 'success';
          log.finishedAt = new Date().toISOString();

          // ✅ CRITICAL: Log node finished event
          await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FINISHED', {
            nodeId: node.id,
            nodeName: node.data.label,
            nodeType,
            sequence: i + 1,
            success: true,
          }, node.id, node.data.label, i + 1);

          // ✅ CRITICAL: Update heartbeat
          await supabase
            .from('executions')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('id', executionId);
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          console.error(`[Workflow ${workflowId}] [Node ${node.id}] [${node.data.label}] ERROR:`, errorObj.message, errorObj);
          
          log.status = 'failed';
          log.error = errorObj.message;
          log.finishedAt = new Date().toISOString();
          hasError = true;
          errorMessage = log.error;

          // ✅ CRITICAL: Log node failed event
          await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FAILED', {
            nodeId: node.id,
            nodeName: node.data.label,
            nodeType,
            sequence: i + 1,
            error: errorObj.message,
            retryAttempt: retryAttempt || 0,
          }, node.id, node.data.label, i + 1);

          // Execute error trigger nodes if any
          if (errorTriggerNodes.length > 0) {
            for (const errorTriggerNode of errorTriggerNodes) {
              try {
                const errorInput = {
                  failed_node: node.data.label || node.id,
                  error_message: errorObj.message,
                  error_type: errorObj.constructor.name,
                  workflow_id: workflowId,
                  execution_id: executionId,
                };

                await executeNode(
                  errorTriggerNode,
                  errorInput,
                  nodeOutputs,
                  supabase,
                  workflowId,
                  workflow.user_id
                );
              } catch (errorTriggerError) {
                console.error(`[Workflow ${workflowId}] [Error Trigger ${errorTriggerNode.id}] Execution failed:`, errorTriggerError);
              }
            }
          }

          // Break execution on error (unless error handler continues)
          break;
        }
      } catch (nodeError) {
        // This catch handles errors from the outer try block (line 2853)
        // Errors from node execution (retry logic) are already handled in the inner try-catch
        const errorObj = nodeError instanceof Error ? nodeError : new Error(String(nodeError));
        console.error(`[Workflow ${workflowId}] [Node ${node.id}] [${node.data.label}] OUTER ERROR:`, errorObj.message, errorObj);
        
        log.status = 'failed';
        log.error = errorObj.message;
        log.finishedAt = new Date().toISOString();
        hasError = true;
        errorMessage = log.error;

        // Log node failed event
        await logExecutionEvent(supabase, executionId, workflowId, 'NODE_FAILED', {
          nodeId: node.id,
          nodeName: node.data.label,
          nodeType,
          sequence: i + 1,
          error: errorObj.message,
          retryAttempt: 0,
        }, node.id, node.data.label, i + 1);

        // Execute error trigger nodes if any
        if (errorTriggerNodes.length > 0) {
          for (const errorTriggerNode of errorTriggerNodes) {
            try {
              const errorInput = {
                failed_node: node.data.label || node.id,
                error_message: errorObj.message,
                error_type: errorObj.constructor.name,
                workflow_id: workflowId,
                execution_id: executionId,
              };

              await executeNode(
                errorTriggerNode,
                errorInput,
                nodeOutputs,
                supabase,
                workflowId,
                workflow.user_id
              );
            } catch (errorTriggerError) {
              console.error(`[Workflow ${workflowId}] [Error Trigger ${errorTriggerNode.id}] Execution failed:`, errorTriggerError);
            }
          }
        }

        // Break execution on error
        break;
      }

      logs.push(log);
      
      // Update execution logs incrementally so frontend can see progress in real-time
      if (executionId) {
        try {
          const { error: incrementalLogsError } = await supabase
            .from('executions')
            .update({ logs })
            .eq('id', executionId);
          if (incrementalLogsError) {
            throw incrementalLogsError;
          }
        } catch (logUpdateError) {
          // Log error but don't break execution - logs will be saved at the end anyway
          console.error('Failed to update execution logs incrementally:', logUpdateError);
        }
      }
    }

    // Log cache statistics and memory usage before cleanup
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    const memoryDelta = endMemory - startMemory;
    
    if (process.env.ENABLE_MEMORY_LOGGING === 'true') {
      const stats = nodeOutputs.getStats();
      const centralStats = centralState.getCacheStats();
      console.log(`[Memory] Workflow ${workflowId} cache stats:`, {
        size: stats.size,
        maxSize: stats.maxSize,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        evictions: stats.evictions,
      });
      console.log(`[EnterpriseState] Workflow ${workflowId} central state stats:`, {
        cacheSize: centralStats.size,
        maxSize: centralStats.maxSize,
        hitRate: `${(centralStats.hitRate * 100).toFixed(1)}%`,
      });
      console.log(`[Memory] Workflow ${workflowId} memory: ${startMemory.toFixed(2)}MB → ${endMemory.toFixed(2)}MB (Δ${memoryDelta.toFixed(2)}MB)`);
    }
    
    // Clear cache when workflow completes (success or failure)
    // This prevents memory leaks from long-running processes
    nodeOutputs.clear();

    // Update execution with final status
    const finishedAt = new Date().toISOString();
    
    // Calculate duration if started_at exists
    let durationMs: number | null = null;
    if (executionId) {
      const { data: execData } = await supabase
        .from('executions')
        .select('started_at')
        .eq('id', executionId)
        .single();
      
      if (execData?.started_at) {
        const startedAt = new Date(execData.started_at).getTime();
        const finishedAtTime = new Date(finishedAt).getTime();
        durationMs = finishedAtTime - startedAt;
      }
    }
    
    const finalStatus = hasError ? 'failed' : 'success';
    
    // ✅ CRITICAL: Log run finished/failed event
    if (hasError) {
      await logExecutionEvent(supabase, executionId, workflowId, 'RUN_FAILED', {
        error: errorMessage,
        durationMs,
        nodesExecuted: logs.length,
      });
    } else {
      await logExecutionEvent(supabase, executionId, workflowId, 'RUN_FINISHED', {
        durationMs,
        nodesExecuted: logs.length,
        success: true,
      });
    }

    // ✅ CRITICAL: Release execution lock
    await releaseExecutionLock(supabase, workflowId, executionId);
    await logExecutionEvent(supabase, executionId, workflowId, 'LOCK_RELEASED', {
      workflowId,
      executionId,
    });
    
    // ENTERPRISE ARCHITECTURE: Update status through central state
    try {
      await centralState.updateStatus(
        finalStatus,
        finalOutput,
        hasError ? errorMessage : undefined,
        {
          logs,
          durationMs,
          lastHeartbeat: finishedAt,
        }
      );
      console.log(`[EnterpriseState] ✅ Updated execution ${executionId} to ${finalStatus}`);
    } catch (updateError) {
      console.error(`[EnterpriseState] ❌ Failed to update final status, falling back to direct update:`, updateError);
      // Fallback to direct database update
      await supabase
        .from('executions')
        .update({
          status: finalStatus,
          output: finalOutput,
          logs,
          finished_at: finishedAt,
          duration_ms: durationMs,
          last_heartbeat: finishedAt,
          ...(hasError ? { error: errorMessage } : {}),
        })
        .eq('id', executionId);
    }

    // 🧠 MEMORY INTEGRATION: Store execution in memory system for analytics and learning
    try {
      const memoryManager = getMemoryManager();
      
      // Get started_at for execution tracking
      let startedAtDate: Date;
      if (executionId) {
        const { data: execData } = await supabase
          .from('executions')
          .select('started_at')
          .eq('id', executionId)
          .single();
        
        startedAtDate = execData?.started_at 
          ? new Date(execData.started_at)
          : new Date(Date.now() - (durationMs || 0));
      } else {
        startedAtDate = new Date(Date.now() - (durationMs || 0));
      }

      // Prepare node executions data
      const nodeExecutions = logs.map((log, index) => ({
        nodeId: log.nodeId,
        nodeType: nodes.find(n => n.id === log.nodeId)?.data?.type || 'unknown',
        inputData: log.input,
        outputData: log.output,
        status: log.status,
        error: log.error,
        duration: log.finishedAt && log.startedAt
          ? new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()
          : undefined,
        sequence: index + 1,
        metadata: {
          nodeName: log.nodeName,
        },
      }));

      await memoryManager.storeExecution({
        workflowId,
        status: finalStatus === 'success' ? 'success' : 'error',
        inputData: input,
        resultData: finalOutput,
        startedAt: startedAtDate,
        finishedAt: new Date(finishedAt),
        executionTime: durationMs || undefined,
        errorMessage: hasError ? errorMessage : undefined,
        context: {
          executionId,
          trigger: workflow.trigger || 'manual',
          userId: currentUserId || workflow.user_id,
        },
        nodeExecutions: nodeExecutions,
      });
      
      console.log(`✅ [Memory] Stored execution in memory system for workflow ${workflowId}`);
    } catch (memoryError) {
      // Graceful degradation: continue even if memory tracking fails
      console.warn('⚠️  [Memory] Failed to store execution in memory system:', memoryError instanceof Error ? memoryError.message : String(memoryError));
    }

    // Return response
    if (hasError) {
      return res.status(500).json({
        error: errorMessage,
        executionId,
        logs,
        output: finalOutput,
      });
    }

    return res.json({
      status: 'success',
      success: true,
      executionId,
      output: finalOutput,
      logs,
      durationMs,
    });
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    console.error(`[Workflow ${req.body.workflowId || 'unknown'}] Execute workflow error:`, errorObj.message, errorObj);
    const errorMessage = errorObj.message;
    
    // ✅ CRITICAL: Release lock on error
    if (executionId && workflowId) {
      try {
        const { releaseExecutionLock } = await import('../services/execution/execution-lock');
        const { logExecutionEvent } = await import('../services/execution/execution-event-logger');
        
        await releaseExecutionLock(supabase, workflowId, executionId);
        await logExecutionEvent(supabase, executionId, workflowId, 'RUN_FAILED', {
          error: errorMessage,
          fatal: true,
        });
        await logExecutionEvent(supabase, executionId, workflowId, 'LOCK_RELEASED', {
          workflowId,
          executionId,
          reason: 'error',
        });
      } catch (cleanupError) {
        console.error('[ExecuteWorkflow] Failed to cleanup on error:', cleanupError);
      }
    }
    
    return res.status(500).json({
      error: errorMessage,
      executionId: executionId ?? 'unknown',
      logs: logs ?? [],
    });
  }
}
