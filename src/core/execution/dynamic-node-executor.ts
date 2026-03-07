/**
 * DYNAMIC NODE EXECUTOR
 * 
 * This replaces all hardcoded node-specific logic in the execution engine.
 * 
 * Architecture:
 * - Fetches node definition from UnifiedNodeRegistry
 * - Validates config against node schema
 * - Executes node using definition.execute()
 * - NO if/else logic for specific node types
 * - NO hardcoded node behavior
 * 
 * This ensures:
 * - All node behavior comes from registry
 * - Permanent fixes apply to all workflows
 * - Infinite scalability
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { NodeExecutionContext, NodeExecutionResult } from '../types/unified-node-contract';
import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { LRUNodeOutputsCache } from '../cache/lru-node-outputs-cache';
import { SupabaseClient } from '@supabase/supabase-js';
// ✅ PRODUCTION-GRADE: Removed normalizeNodeType - node types must be canonical before reaching executor
import { IntentDrivenJsonRouter, shouldActivateRouter } from '../intent-driven-json-router';
import { universalNodeAIContext } from '../../services/ai/universal-node-ai-context';
import { aiFieldDetector } from '../../services/ai/ai-field-detector';

export interface DynamicExecutionContext {
  node: WorkflowNode;
  input: unknown;
  nodeOutputs: LRUNodeOutputsCache;
  supabase: SupabaseClient;
  workflowId: string;
  userId?: string;
  currentUserId?: string;
}

/**
 * Execute node using dynamic definition from registry
 * 
 * This is the NEW execution path that replaces all hardcoded switch statements.
 * All node behavior comes from UnifiedNodeRegistry.
 */
export async function executeNodeDynamically(
  context: DynamicExecutionContext
): Promise<unknown> {
  const { node, input, nodeOutputs, supabase, workflowId, userId, currentUserId } = context;
  
  // Step 1: Extract node type
  const nodeType = node.data?.type || node.type;
  
  // Step 2: ✅ PRODUCTION-GRADE: Strict validation BEFORE registry
  // This ensures only canonical node types reach the registry
  try {
    const { assertValidNodeType } = require('../utils/node-authority');
    assertValidNodeType(nodeType);
  } catch (error: any) {
    console.error(`[DynamicExecutor] ❌ ${error.message}`);
    return {
      _error: error.message,
      _nodeType: nodeType,
    };
  }
  
  // Step 3: Get node definition from registry (SINGLE SOURCE OF TRUTH)
  // At this point, nodeType is guaranteed to be canonical
  const definition = unifiedNodeRegistry.get(nodeType);
  
  if (!definition) {
    // This should NEVER happen if assertValidNodeType passed
    // If it does, it's an integrity issue
    const errorMsg = `[DynamicExecutor] ❌ Integrity error: Canonical node type '${nodeType}' not found in registry. This indicates a system initialization failure.`;
    console.error(errorMsg);
    return {
      _error: errorMsg,
      _nodeType: nodeType,
    };
  }
  
  console.log(`[DynamicExecutor] ✅ Executing ${nodeType} using definition from registry`);
  
  // Step 3: Migrate config to current schema version (backward compatibility)
  let config = node.data?.config || {};
  const migratedConfig = unifiedNodeRegistry.migrateConfig(nodeType, config);
  config = migratedConfig;
  
  // ✅ ROOT-LEVEL: Auto-fill text fields using AI before validation
  // This ensures message, subject, body, etc. are auto-generated if empty
  try {
    const aiFields = aiFieldDetector.detectAIFields(node);
    const emptyAIFields = aiFields
      .filter(f => f.shouldAutoGenerate)
      .map(f => f.fieldName)
      .filter(fieldName => {
        const currentValue = config[fieldName];
        return !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
      });
    
    if (emptyAIFields.length > 0) {
      console.log(`[DynamicExecutor] 🤖 Auto-generating ${emptyAIFields.length} text field(s) for ${nodeType}: ${emptyAIFields.join(', ')}`);
      
      // Get previous node outputs for context
      const previousOutputs: Record<string, any> = {};
      try {
        // Extract previous outputs from nodeOutputs cache
        const allOutputs = nodeOutputs.getAll();
        Object.assign(previousOutputs, allOutputs);
      } catch (e) {
        console.warn(`[DynamicExecutor] ⚠️ Could not get previous outputs for AI context:`, e);
      }
      
      // Get user prompt from workflow metadata (if available)
      const userPrompt = (global as any).currentWorkflowIntent || 'Process workflow data';
      
      // Create workflow context (minimal - just for AI context)
      const workflowContext: Workflow = {
        nodes: [node], // Minimal workflow for context
        edges: [],
        metadata: { workflowId },
      };
      
      // Auto-fill using AI
      const autoFilledNode = await universalNodeAIContext.autoFillNode(
        { ...node, data: { ...node.data, config } },
        workflowContext,
        userPrompt,
        previousOutputs
      );
      
      // Update config with AI-generated fields
      config = autoFilledNode.data?.config || config;
      console.log(`[DynamicExecutor] ✅ AI auto-filled ${emptyAIFields.length} field(s) for ${nodeType}`);
    }
  } catch (error) {
    console.warn(`[DynamicExecutor] ⚠️ AI auto-fill failed (non-blocking):`, error);
    // Continue without auto-fill - use existing config
  }
  
  // Step 4: Validate config against node schema
  const validation = unifiedNodeRegistry.validateConfig(nodeType, config);
  
  if (!validation.valid) {
    console.error(`[DynamicExecutor] ❌ Config validation failed for ${nodeType}:`, validation.errors);
    
    // ✅ DEFAULT: Strict mode enabled (production-grade)
    // Can be overridden with VALIDATION_STRICT=false if needed
    const isStrictMode = process.env.VALIDATION_STRICT !== 'false';
    
    if (isStrictMode) {
      return {
        _error: `Configuration validation failed: ${validation.errors.join(', ')}`,
        _validationErrors: validation.errors,
        _nodeType: nodeType,
      };
    }
    
    // In non-strict mode, log warnings and continue (backward compatibility - NOT RECOMMENDED)
    if (validation.warnings) {
      console.warn(`[DynamicExecutor] ⚠️  Config warnings for ${nodeType}:`, validation.warnings);
    }
  }
  
  // Step 5: Intent Router (Phase 2) - Conditional activation with skip logic
  // Only activates when: confidence < 0.85, schema drift, or explicit filtering
  const upstreamOutputs = nodeOutputs.getAll();
  const filteredOutputs: Record<string, any> = {};
  
  if (upstreamOutputs && typeof upstreamOutputs === 'object') {
    const userPrompt = (global as any).currentWorkflowIntent || '';
    
    // Process router for each upstream output (async)
    const routerPromises: Promise<void>[] = [];
    
    Object.entries(upstreamOutputs as Record<string, any>).forEach(([upstreamNodeId, output]) => {
      // Check if router should activate for this upstream node
      // For each field that needs input, check if we have metadata for that field
      // We need to check metadata per field, not just the first field
      const mappingMetadata = node.data?.config?._mappingMetadata;
      
      // Try to find metadata for any field that references this upstream node
      // For now, use the first available metadata as a proxy
      // In production, this would be field-specific
      let fieldMetadata: any = undefined;
      if (mappingMetadata && typeof mappingMetadata === 'object') {
        const metadataEntries = Object.entries(mappingMetadata);
        if (metadataEntries.length > 0) {
          // Use the first field's metadata as representative
          // TODO: Make this field-specific in future
          fieldMetadata = metadataEntries[0][1] as any;
        }
      }
      
      const shouldRoute = shouldActivateRouter(
        fieldMetadata,
        output,
        userPrompt
      );
      
      if (shouldRoute) {
        // Use router to filter/transform data
        const router = new IntentDrivenJsonRouter();
        const routingContext = {
          previousOutput: output,
          targetNodeInputSchema: definition.inputSchema,
          userIntent: userPrompt,
          sourceNodeType: 'unknown', // TODO: Get from upstream node
          targetNodeType: nodeType,
          sourceNodeId: upstreamNodeId,
          targetNodeId: node.id,
          mappingMetadata: fieldMetadata,
        };
        
        const routerPromise = router.route(routingContext).then((routingResult: any) => {
          filteredOutputs[upstreamNodeId] = routingResult.filteredPayload;
          console.log(`[DynamicExecutor] 🔄 Router activated for ${upstreamNodeId} → ${node.id}: ${routingResult.explanation}`);
        }).catch(() => {
          // Fallback to original output if routing fails
          filteredOutputs[upstreamNodeId] = output;
        });
        
        routerPromises.push(routerPromise);
      } else {
        // Skip router - use output as-is
        filteredOutputs[upstreamNodeId] = output;
        console.log(`[DynamicExecutor] ⏭️  Router skipped for ${upstreamNodeId} → ${node.id} (confidence: ${fieldMetadata?.confidence?.toFixed(3) || 'N/A'})`);
      }
    });
    
    // Wait for all router operations to complete
    await Promise.all(routerPromises);
  }
  
  // Step 6: Resolve input values using AI Input Resolver (NEW ARCHITECTURE)
  // This replaces static JSON dropdown logic
  // Use filtered outputs (router may have modified them)
  const resolvedInputs = await resolveInputsWithAI(
    definition.inputSchema as any,
    migratedConfig,
    nodeOutputs,
    node.id,
    nodeType,
    node.data?.label
  );
  
  // ✅ CRITICAL FIX: Store rawInput as 'input' in cache for {{input.*}} template resolution
  // This ensures templates like {{input.response.subject}} resolve correctly for ALL nodes
  if (input !== undefined && input !== null) {
    nodeOutputs.set('input', input, true);
    // Also set as $json for backward compatibility (if not already set)
    if (!nodeOutputs.get('$json')) {
      nodeOutputs.set('$json', input, true);
    }
    if (!nodeOutputs.get('json')) {
      nodeOutputs.set('json', input, true);
    }
  }

  // ✅ CRITICAL FIX: Merge AI-generated inputs back into config for UI display
  // This ensures AI-generated values (headers, body, prompts, etc.) are visible in Properties Panel
  // Only merge if the field is empty in config (don't overwrite user-provided values)
  const mergedConfig = { ...migratedConfig };
  for (const [fieldName, aiValue] of Object.entries(resolvedInputs)) {
    const currentValue = mergedConfig[fieldName];
    // Only merge if current value is empty/undefined/null
    if (!currentValue || 
        (typeof currentValue === 'string' && currentValue.trim() === '') ||
        (typeof currentValue === 'object' && Object.keys(currentValue).length === 0)) {
      mergedConfig[fieldName] = aiValue;
      console.log(`[DynamicExecutor] ✅ Merged AI-generated value for ${fieldName} into config`);
    }
  }

  // Step 7: Create execution context
  const execContext: NodeExecutionContext = {
    nodeId: node.id,
    nodeType,
    config: mergedConfig, // Use merged config (includes AI-generated values)
    inputs: resolvedInputs, // Use resolved inputs for execution
    rawInput: input,
    upstreamOutputs: new Map(),
    workflowId,
    userId,
    currentUserId,
    supabase,
  };
  
        // Populate upstreamOutputs map
        const allUpstreamOutputs = nodeOutputs.getAll();
        if (allUpstreamOutputs && typeof allUpstreamOutputs === 'object') {
          Object.entries(allUpstreamOutputs as Record<string, any>).forEach(([upstreamNodeId, output]) => {
            execContext.upstreamOutputs.set(upstreamNodeId, output);
          });
        }
  
  // Step 8: Execute node using definition.execute() (NO hardcoded logic)
  try {
    const result = await definition.execute(execContext);
    
    if (!result.success) {
      console.error(`[DynamicExecutor] ❌ Node execution failed:`, result.error);
      return {
        _error: result.error?.message || 'Node execution failed',
        _errorCode: result.error?.code,
        _errorDetails: result.error?.details,
        _nodeType: nodeType,
      };
    }
    
    // Step 9: Validate output against output schema
    const outputValidation = validateOutputAgainstSchema(result.output, definition.outputSchema);
    if (!outputValidation.valid) {
      console.warn(`[DynamicExecutor] ⚠️  Output validation warnings:`, outputValidation.warnings);
    }
    
    // ✅ CLEAN OUTPUT FROM CONFIG VALUES (CORE ARCHITECTURE FIX)
    // Remove config values from output to ensure only actual output data is returned
    // This prevents placeholder values and config fields from appearing in output JSON
    const { cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const cleanedOutput = cleanOutputFromConfig(result.output, migratedConfig);
    
    return cleanedOutput;
    
  } catch (error: any) {
    console.error(`[DynamicExecutor] ❌ Unhandled error during execution:`, error);
    
    // ✅ CLEAN ERROR OUTPUT: Don't include config values in error output
    const errorOutput = {
      _error: error.message || 'Unhandled execution error',
      _errorDetails: error,
      _nodeType: nodeType,
    };
    
    // Clean output to remove any config values that might have been added
    const { cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const cleanedErrorOutput = cleanOutputFromConfig(errorOutput, migratedConfig);
    
    return cleanedErrorOutput;
  }
}

/**
 * Resolve input values using AI Input Resolver (NEW ARCHITECTURE)
 * 
 * This replaces static JSON dropdown logic with AI-driven input generation.
 * AI analyzes previous outputs and generates appropriate inputs dynamically.
 */
async function resolveInputsWithAI(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache,
  currentNodeId: string,
  nodeType: string,
  nodeLabel?: string
): Promise<Record<string, any>> {
  // Get previous node output (from upstream nodes)
  const previousOutput = getPreviousNodeOutput(nodeOutputs);
  
  // ✅ CRITICAL: Store previous output globally for body mapping
  (global as any).lastPreviousOutput = previousOutput;
  
  // Get user intent from workflow context (if available)
  const userIntent = (global as any).currentWorkflowIntent || 'Process workflow data';
  
  // Import AI Input Resolver
  const { aiInputResolver } = await import('../ai-input-resolver');
  
  // Resolve inputs using AI
  try {
    // ✅ DEBUG: Log AI input resolution for Ollama/AI nodes and HTTP Request nodes
    if (nodeType === 'ollama' || nodeType === 'ai_chat_model' || nodeType === 'http_request') {
      console.log('[DynamicExecutor] 🔍 Starting AI input resolution for node:', {
        nodeId: currentNodeId,
        nodeType,
        nodeLabel,
        hasPreviousOutput: previousOutput !== undefined,
        previousOutputKeys: previousOutput && typeof previousOutput === 'object' 
          ? Object.keys(previousOutput as Record<string, unknown>)
          : [],
        previousOutputSample: previousOutput && typeof previousOutput === 'object'
          ? JSON.stringify(previousOutput).substring(0, 200)
          : String(previousOutput).substring(0, 200),
        inputSchemaKeys: Object.keys(inputSchema || {}),
        userIntent,
      });
    }
    
    const resolved = await aiInputResolver.resolveInput({
      previousOutput,
      nodeInputSchema: inputSchema,
      userIntent,
      nodeType,
      nodeLabel,
    });
    
    // ✅ DEBUG: Log resolved input for Ollama/AI nodes and HTTP Request nodes
    if (nodeType === 'ollama' || nodeType === 'ai_chat_model' || nodeType === 'http_request') {
      console.log('[DynamicExecutor] ✅ AI input resolution result:', {
        nodeId: currentNodeId,
        nodeType,
        mode: resolved.mode,
        resolvedValueType: typeof resolved.value,
        resolvedValueKeys: resolved.value && typeof resolved.value === 'object'
          ? Object.keys(resolved.value as Record<string, unknown>)
          : [],
        resolvedValueSample: resolved.value && typeof resolved.value === 'object'
          ? JSON.stringify(resolved.value).substring(0, 300)
          : String(resolved.value).substring(0, 300),
        hasPrompt: resolved.value && typeof resolved.value === 'object' && 'prompt' in (resolved.value as Record<string, unknown>),
        hasBody: resolved.value && typeof resolved.value === 'object' && 'body' in (resolved.value as Record<string, unknown>),
        hasHeaders: resolved.value && typeof resolved.value === 'object' && 'headers' in (resolved.value as Record<string, unknown>),
        explanation: resolved.explanation,
      });
    }
    
    // Map resolved value to input schema fields
    const mapped = mapResolvedValueToSchema(resolved.value, inputSchema, resolved.mode);
    
    // ✅ DEBUG: Log mapped result for Ollama/AI nodes and HTTP Request nodes
    if (nodeType === 'ollama' || nodeType === 'ai_chat_model' || nodeType === 'http_request') {
      console.log('[DynamicExecutor] ✅ Mapped resolved input to schema:', {
        nodeId: currentNodeId,
        mappedKeys: Object.keys(mapped),
        mappedSample: JSON.stringify(mapped).substring(0, 300),
        hasPrompt: 'prompt' in mapped,
        hasBody: 'body' in mapped,
        hasHeaders: 'headers' in mapped,
        bodyType: mapped.body ? typeof mapped.body : 'N/A',
        bodySample: mapped.body ? JSON.stringify(mapped.body).substring(0, 200) : 'N/A',
        headersSample: mapped.headers ? JSON.stringify(mapped.headers).substring(0, 200) : 'N/A',
      });
    }
    
    return mapped;
  } catch (error: any) {
    console.warn(`[DynamicExecutor] ⚠️  AI input resolution failed, using fallback: ${error.message}`);
    
    // Fallback: Use config values as-is (backward compatibility)
    return resolveInputsFromConfig(inputSchema, config, nodeOutputs);
  }
}

/**
 * Get previous node output from nodeOutputs cache
 */
function getPreviousNodeOutput(nodeOutputs: LRUNodeOutputsCache): any {
  // ✅ Use timestamp-based most-recent output and ignore meta keys.
  // This makes AI input resolution deterministic and ensures it sees the actual
  // upstream node output (e.g., Limit output), not $json/json/trigger/input.
  return nodeOutputs.getMostRecentOutput(['$json', 'json', 'trigger', 'input']);
}

/**
 * Map resolved AI value to input schema fields
 */
function mapResolvedValueToSchema(
  resolvedValue: any,
  inputSchema: any,
  mode: 'message' | 'message+json' | 'json'
): Record<string, any> {
  const mapped: Record<string, any> = {};
  
  if (mode === 'message') {
    // For message mode, find the message/text/body field in schema
    const messageField = Object.keys(inputSchema).find(field => 
      field.toLowerCase().includes('message') ||
      field.toLowerCase().includes('text') ||
      field.toLowerCase().includes('body') ||
      field.toLowerCase().includes('content')
    );
    
    if (messageField) {
      mapped[messageField] = resolvedValue;
    } else {
      // Use first required field or first field
      const firstField = Object.keys(inputSchema)[0];
      if (firstField) {
        mapped[firstField] = resolvedValue;
      }
    }
  } else if (mode === 'message+json') {
    // For message+json mode, map message and data fields
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      // Map message field
      const messageField = Object.keys(inputSchema).find(field => 
        field.toLowerCase().includes('message') ||
        field.toLowerCase().includes('text') ||
        field.toLowerCase().includes('body')
      );
      
      if (messageField && resolvedValue.message) {
        mapped[messageField] = resolvedValue.message;
      }
      
      // Map data fields
      if (resolvedValue.data && typeof resolvedValue.data === 'object') {
        Object.assign(mapped, resolvedValue.data);
      }
    }
  } else {
    // For json mode, map all fields from resolved value
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      Object.assign(mapped, resolvedValue);
      
      // ✅ CRITICAL FIX: Special handling for HTTP Request body field
      // If previous output has a "response" field (from AI Chat Model), use it as body
      // This ensures AI Chat Model output is properly sent in HTTP POST body
      if (inputSchema.body && !mapped.body) {
        // Check if resolved value has a response field that should be used as body
        const previousOutput = (global as any).lastPreviousOutput;
        if (previousOutput && typeof previousOutput === 'object' && 'response' in previousOutput) {
          // Use the response field as the body
          mapped.body = { message: previousOutput.response };
          console.log('[DynamicExecutor] ✅ Mapped previous output.response to HTTP Request body');
        } else if (resolvedValue.response) {
          // If AI generated a response field, use it as body
          mapped.body = typeof resolvedValue.response === 'string' 
            ? { message: resolvedValue.response }
            : resolvedValue.response;
          console.log('[DynamicExecutor] ✅ Mapped resolved response to HTTP Request body');
        } else if (resolvedValue.body) {
          // If AI already generated body, use it
          mapped.body = resolvedValue.body;
        } else if (previousOutput && typeof previousOutput === 'object') {
          // Fallback: Use entire previous output as body
          mapped.body = previousOutput;
          console.log('[DynamicExecutor] ✅ Using entire previous output as HTTP Request body');
        }
      }
    }
  }
  
  // Fill in any missing required fields with defaults
  for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
    const field = fieldDef as any; // Type assertion for NodeInputField
    if (!(fieldName in mapped)) {
      if (field.required && field.default !== undefined) {
        mapped[fieldName] = field.default;
      }
    }
  }
  
  return mapped;
}

/**
 * Fallback: Resolve inputs from config (backward compatibility)
 */
function resolveInputsFromConfig(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  // For each field in input schema, resolve from config
  for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
    const field = fieldDef as any; // Type assertion for NodeInputField
    const configValue = config[fieldName];
    
    if (configValue === undefined || configValue === null) {
      // Use default if available
      if (field.default !== undefined) {
        resolved[fieldName] = field.default;
      }
      continue;
    }
    
    // If it's a template expression, resolve it (legacy support)
    if (typeof configValue === 'string' && configValue.includes('{{')) {
      resolved[fieldName] = resolveTemplateExpression(configValue, nodeOutputs);
    } else {
      resolved[fieldName] = configValue;
    }
  }
  
  return resolved;
}

/**
 * Resolve input values from upstream nodes using template expressions (LEGACY - kept for fallback)
 */
function resolveInputsFromUpstream(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache,
  currentNodeId: string
): Record<string, any> {
  return resolveInputsFromConfig(inputSchema, config, nodeOutputs);
}

/**
 * Resolve template expression like {{$json.field}} or {{$json.items[].Column}}
 * 
 * ✅ CORE ARCHITECTURE: Uses universal template resolver
 * This ensures consistent template resolution across ALL nodes
 */
function resolveTemplateExpression(
  template: string,
  nodeOutputs: LRUNodeOutputsCache
): any {
  // ✅ Use universal template resolver (single source of truth)
  const { resolveUniversalTemplate } = require('../utils/universal-template-resolver');
  return resolveUniversalTemplate(template, nodeOutputs);
}

/**
 * Get nested value from object using dot notation or array access
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array access: items[].Column
    if (part.includes('[]')) {
      const [arrayKey, ...rest] = part.split('[]');
      if (Array.isArray(current[arrayKey])) {
        // For array access, return the array itself (filtering handled separately)
        current = current[arrayKey];
        if (rest.length > 0) {
          // Continue with remaining path on first element
          const remainingPath = rest.join('[]') + (parts.slice(parts.indexOf(part) + 1).join('.'));
          if (current.length > 0) {
            return getNestedValue(current[0], remainingPath);
          }
        }
        return current;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Validate output against output schema
 */
function validateOutputAgainstSchema(
  output: any,
  outputSchema: any
): { valid: boolean; warnings?: string[] } {
  const warnings: string[] = [];
  
  if (!outputSchema || typeof outputSchema !== 'object') {
    return { valid: true }; // No schema to validate against
  }
  
  const defaultPort = (outputSchema as any).default;
  if (!defaultPort || typeof defaultPort !== 'object') {
    return { valid: true }; // No default port schema
  }
  
  const expectedType = defaultPort.schema?.type;
  if (!expectedType) {
    return { valid: true }; // No type in schema
  }
  
  const actualType = Array.isArray(output) ? 'array' : typeof output;
  
  if (expectedType === 'object' && actualType !== 'object') {
    warnings.push(`Expected object output, got ${actualType}`);
  } else if (expectedType === 'array' && !Array.isArray(output)) {
    warnings.push(`Expected array output, got ${actualType}`);
  }
  
  return {
    valid: warnings.length === 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
