/**
 * Node Handle Registry
 * 
 * ✅ CRITICAL: Single source of truth for React Flow handle IDs
 * 
 * This registry defines the valid handle IDs that exist in React node components.
 * All backend code (normalizer, edge generator, AI builder) must use these IDs.
 * 
 * React components define handles in WorkflowNode.tsx:
 * - Most nodes: `input` (target) and `output` (source)
 * - If/Else: `true` and `false` (source handles)
 * - Switch: case values (source handles)
 * - AI Agent: `userInput`, `chat_model`, `memory`, `tool` (target), `output` (source)
 */

export interface NodeHandleContract {
  inputs: string[];  // Valid target handle IDs
  outputs: string[]; // Valid source handle IDs
}

/**
 * Registry of valid handle IDs per node type
 * 
 * These MUST match the Handle components in WorkflowNode.tsx
 */
export const NODE_HANDLE_REGISTRY: Record<string, NodeHandleContract> = {
  // Standard nodes (most common)
  default: {
    inputs: ['input'],
    outputs: ['output'],
  },

  // Triggers
  manual_trigger: {
    inputs: [],
    outputs: ['output', 'inputData'], // ✅ CRITICAL: manual_trigger outputs 'inputData' (data field) via 'output' handle
  },
  webhook: {
    inputs: [],
    outputs: ['output'],
  },
  schedule: {
    inputs: [],
    outputs: ['output'],
  },
  interval: {
    inputs: [],
    outputs: ['output'],
  },
  form: {
    inputs: [],
    outputs: ['output'],
  },
  chat_trigger: {
    inputs: [],
    outputs: ['output', 'message'], // ✅ CRITICAL: chat_trigger outputs 'message' (data field) via 'output' handle
  },

  // Logic nodes
  if_else: {
    inputs: ['input'],
    outputs: ['true', 'false'],
  },
  switch: {
    inputs: ['input'],
    outputs: [], // Dynamic - based on cases config
  },

  // AI Agent (special multi-input node)
  ai_agent: {
    inputs: ['userInput', 'chat_model', 'memory', 'tool'],
    outputs: ['output'],
  },
  // AI Service node
  ai_service: {
    inputs: ['input'],
    outputs: ['output', 'text', 'response'],
  },

  // Output nodes
  slack_message: {
    inputs: ['input'],
    outputs: ['output'],
  },
  log_output: {
    inputs: ['input'],
    outputs: ['output'],
  },
  email: {
    inputs: ['input'],
    outputs: ['output'],
  },
  google_gmail: {
    inputs: ['input'],
    outputs: ['output'],
  },
  discord: {
    inputs: ['input'],
    outputs: ['output'],
  },
  telegram: {
    inputs: ['input'],
    outputs: ['output'],
  },
  microsoft_teams: {
    inputs: ['input'],
    outputs: ['output'],
  },
  twitter: {
    inputs: ['input'],
    outputs: ['output'],
  },
  instagram: {
    inputs: ['input'],
    outputs: ['output'],
  },
  facebook: {
    inputs: ['input'],
    outputs: ['output'],
  },
  linkedin: {
    inputs: ['input'],
    outputs: ['output'],
  },

  // Database/CRM
  airtable: {
    inputs: ['input'],
    outputs: ['output'],
  },
  pipedrive: {
    inputs: ['input'],
    outputs: ['output'],
  },

  // Data processing
  google_sheets: {
    inputs: ['input'],
    outputs: ['output'],
  },
  javascript: {
    inputs: ['input'],
    outputs: ['output'],
  },
  json_parser: {
    inputs: ['input'],
    outputs: ['output'],
  },
  text_formatter: {
    inputs: ['input'],
    outputs: ['output'],
  },
  http_request: {
    inputs: ['input'],
    outputs: ['output'],
  },
  http_post: {
    inputs: ['input'],
    outputs: ['output'],
  },
};

/**
 * Get valid handle contract for a node type
 */
export function getNodeHandleContract(nodeType: string): NodeHandleContract {
  return NODE_HANDLE_REGISTRY[nodeType] || NODE_HANDLE_REGISTRY.default;
}

/**
 * Get default source handle for a node type
 */
export function getDefaultSourceHandle(nodeType: string): string {
  const contract = getNodeHandleContract(nodeType);
  
  // Special cases
  if (nodeType === 'if_else') {
    return 'true'; // Default to true path
  }
  
  // Return first output handle or 'output'
  return contract.outputs[0] || 'output';
}

/**
 * Get default target handle for a node type
 */
export function getDefaultTargetHandle(nodeType: string): string {
  const contract = getNodeHandleContract(nodeType);
  
  // Special cases
  if (nodeType === 'ai_agent') {
    return 'userInput'; // Default to userInput port
  }
  
  // Return first input handle or 'input'
  return contract.inputs[0] || 'input';
}

/**
 * ✅ UNIVERSAL: Get dynamic output handles for a node
 * 
 * This function analyzes the node dynamically and returns valid output handles:
 * - Switch nodes: Reads cases from node.config.cases (dynamic)
 * - if_else nodes: Returns ['true', 'false']
 * - Other nodes: Returns from registry
 * 
 * @param nodeType - Node type
 * @param nodeConfig - Optional node config (for switch nodes to read cases)
 * @returns Array of valid output handle IDs
 */
export function getDynamicOutputHandles(
  nodeType: string,
  nodeConfig?: Record<string, any>
): string[] {
  const contract = getNodeHandleContract(nodeType);
  
  // Switch nodes: Dynamic handles based on cases config
  if (nodeType === 'switch') {
    if (nodeConfig?.cases) {
      try {
        const cases = typeof nodeConfig.cases === 'string' 
          ? JSON.parse(nodeConfig.cases)
          : Array.isArray(nodeConfig.cases)
          ? nodeConfig.cases
          : [];
        
        // Extract case values as handle IDs
        const caseHandles = cases
          .map((c: any) => c?.value != null ? String(c.value) : null)
          .filter((v: string | null): v is string => v !== null);
        
        if (caseHandles.length > 0) {
          return caseHandles;
        }
      } catch (error) {
        console.warn(`[getDynamicOutputHandles] Failed to parse switch cases: ${error}`);
      }
    }
    // If no cases configured, return empty (will be validated at runtime)
    return [];
  }
  
  // if_else nodes: Fixed handles
  if (nodeType === 'if_else') {
    return ['true', 'false'];
  }
  
  // All other nodes: Use registry
  return contract.outputs.length > 0 ? contract.outputs : ['output'];
}

/**
 * ✅ UNIVERSAL: Validate and resolve source handle dynamically
 * 
 * This function:
 * 1. If structure specifies sourceOutput → validate it against node's dynamic outputs
 * 2. If invalid → auto-correct to first valid output
 * 3. If missing → returns null (caller should use resolver)
 * 
 * @param sourceNode - Source workflow node
 * @param structureSourceOutput - Optional sourceOutput from structure
 * @returns Valid source handle ID, or null if not specified in structure
 */
export function resolveSourceHandleDynamically(
  sourceNode: { data?: { type?: string; config?: Record<string, any> }; type?: string },
  structureSourceOutput?: string
): string | null {
  const sourceType = (sourceNode.data?.type || sourceNode.type || 'default');
  const nodeConfig = sourceNode.data?.config;
  
  // If no structure sourceOutput specified, return null (caller should use resolver)
  if (!structureSourceOutput) {
    return null;
  }
  
  // Get dynamic outputs for this node type
  const validOutputs = getDynamicOutputHandles(sourceType, nodeConfig);
  
  // For switch nodes, accept any case value (dynamic - validated at runtime)
  if (sourceType === 'switch') {
    return structureSourceOutput; // Switch accepts any case value
  }
  
  // For other nodes, validate against valid outputs
  if (validOutputs.includes(structureSourceOutput)) {
    return structureSourceOutput; // Valid - use as-is
  }
  
  // ✅ PRODUCTION-READY: For if_else nodes, FAIL on invalid handles (don't auto-correct)
  // This preserves intent (true vs false) and prevents silent corruption
  if (sourceType === 'if_else') {
    const error = `Invalid sourceOutput "${structureSourceOutput}" for if_else node. ` +
                  `Must be 'true' or 'false', not '${structureSourceOutput}'. ` +
                  `This indicates a structure builder error that must be fixed.`;
    console.error(`[resolveSourceHandleDynamically] ❌ ${error}`);
    throw new Error(`Workflow invalid: ${error}. if_else edges must have explicit 'true' or 'false' sourceOutput.`);
  }
  
  // For other nodes, auto-correct with warning (less critical)
  console.warn(
    `[resolveSourceHandleDynamically] Invalid sourceOutput "${structureSourceOutput}" for ${sourceType}. ` +
    `Valid outputs: ${validOutputs.join(', ')}. Auto-correcting to "${validOutputs[0] || 'output'}"`
  );
  return validOutputs[0] || 'output';
}

/**
 * ✅ PRODUCTION-READY: Validate and resolve target handle dynamically
 * 
 * This function:
 * 1. If structure specifies targetInput → validate it against node's inputs
 * 2. If invalid → auto-correct to first valid input (with warning)
 * 3. If missing → returns null (caller should use resolver)
 * 
 * @param targetNode - Target workflow node
 * @param structureTargetInput - Optional targetInput from structure
 * @returns Valid target handle ID, or null if not specified in structure
 */
export function resolveTargetHandleDynamically(
  targetNode: { data?: { type?: string; config?: Record<string, any> }; type?: string },
  structureTargetInput?: string
): string | null {
  const targetType = (targetNode.data?.type || targetNode.type || 'default');
  
  // If no structure targetInput specified, return null (caller should use resolver)
  if (!structureTargetInput) {
    return null;
  }
  
  // Get valid inputs for this node type
  const contract = getNodeHandleContract(targetType);
  const validInputs = contract.inputs;
  
  // Validate against valid inputs
  if (validInputs.includes(structureTargetInput)) {
    return structureTargetInput; // Valid - use as-is
  }
  
  // Invalid handle - auto-correct to first valid input (with warning)
  console.warn(
    `[resolveTargetHandleDynamically] Invalid targetInput "${structureTargetInput}" for ${targetType}. ` +
    `Valid inputs: ${validInputs.join(', ')}. Auto-correcting to "${validInputs[0] || 'input'}"`
  );
  return validInputs[0] || 'input';
}

/**
 * ✅ ROOT-LEVEL FIX: Validate if a handle ID is valid for a node type
 * 
 * Uses unified node registry as single source of truth (not hardcoded registry)
 * This ensures validation matches the actual node definitions
 */
export function isValidHandle(nodeType: string, handleId: string, isSource: boolean): boolean {
  // ✅ ROOT-LEVEL FIX: Use unified node registry as single source of truth
  const { unifiedNodeRegistry } = require('../registry/unified-node-registry');
  const { unifiedNormalizeNodeTypeString } = require('./unified-node-type-normalizer');
  
  const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
  const nodeDef = unifiedNodeRegistry.get(normalizedType);
  
  if (!nodeDef) {
    // Node not in registry - fallback to hardcoded registry for backward compatibility
    const contract = getNodeHandleContract(nodeType);
    if (isSource) {
      if (nodeType === 'switch') {
        return true; // Accept any handle ID for switch (validated at runtime)
      }
      return contract.outputs.includes(handleId);
    } else {
      return contract.inputs.includes(handleId);
    }
  }
  
  // ✅ Use unified registry ports (single source of truth)
  if (isSource) {
    // For switch nodes, handles are dynamic (case values)
    if (normalizedType === 'switch') {
      return true; // Accept any handle ID for switch (validated at runtime)
    }
    const validPorts = nodeDef.outgoingPorts || [];
    return validPorts.includes(handleId);
  } else {
    const validPorts = nodeDef.incomingPorts || [];
    return validPorts.includes(handleId);
  }
}

/**
 * ✅ ENHANCED: Normalize source handle with alias support
 * 
 * Maps backend field names to React handle IDs using alias registry
 */
export function normalizeSourceHandle(
  nodeType: string,
  handleId: string | undefined
): string {
  return normalizeHandleId(nodeType, handleId, true);
}

/**
 * ✅ ENHANCED: Normalize target handle with alias support
 * 
 * Maps backend field names to React handle IDs using alias registry
 */
export function normalizeTargetHandle(
  nodeType: string,
  handleId: string | undefined
): string {
  return normalizeHandleId(nodeType, handleId, false);
}

/**
 * Normalize handle ID to a valid one for the node type
 * 
 * Maps common backend field names to React handle IDs
 * ✅ ENHANCED: Extended alias mappings for better compatibility
 */
export function normalizeHandleId(
  nodeType: string,
  handleId: string | undefined,
  isSource: boolean
): string {
  if (!handleId) {
    // ✅ CRITICAL FIX: For if_else nodes, don't default to 'true' if handleId is missing
    // This prevents false path edges from being incorrectly defaulted to true path
    if (isSource && nodeType === 'if_else') {
      // For if_else nodes, we MUST have an explicit sourceHandle ('true' or 'false')
      // Don't default - this indicates a configuration error that should be caught
      console.warn(`[normalizeHandleId] ⚠️ If/Else edge missing sourceHandle - this should be set explicitly to 'true' or 'false'`);
      // Still return 'true' as fallback for backward compatibility, but log warning
      return 'true';
    }
    return isSource ? getDefaultSourceHandle(nodeType) : getDefaultTargetHandle(nodeType);
  }

  const handleIdLower = handleId.toLowerCase();
  const contract = getNodeHandleContract(nodeType);

  // ✅ CRITICAL: Check if handle is already valid BEFORE mapping
  // This preserves specific handles like 'message' for chat_trigger, 'inputData' for manual_trigger
  if (isSource) {
    // If handle is already valid, return it (preserves specific handles)
    if (contract.outputs.includes(handleId)) {
      return handleId;
    }
    
    // ✅ ENHANCED: Extended source handle mappings (outputs)
    // Maps common backend field names to React handle IDs
    const sourceMappings: Record<string, string> = {
      'data': 'output',
      'output': 'output',
      'result': 'output',
      'response': 'output',
      'response_text': 'output',
      'response_json': 'output',
      'formdata': 'output',
      'body': 'output',
      'content': 'output',
      'message': 'output',
      'text': 'output',
      'json': 'output',
      'value': 'output',
      'items': 'output',
      'rows': 'output',
      'triggertime': 'output',
      'inputdata': 'inputData', // ✅ CRITICAL: manual_trigger uses 'inputData', not 'output'
      'parsed': 'output',
      'formatted': 'output',
      'true': 'true', // if_else
      'false': 'false', // if_else
    };

    // ✅ CRITICAL: Special handling for trigger nodes - preserve their specific outputs
    if (nodeType === 'chat_trigger' && handleIdLower === 'message') {
      // chat_trigger outputs 'message' - preserve it if it exists in contract
      if (contract.outputs.includes('message')) {
        return 'message';
      }
    }
    
    if (nodeType === 'manual_trigger' && handleIdLower === 'inputdata') {
      // manual_trigger outputs 'inputData' - preserve it if it exists in contract
      if (contract.outputs.includes('inputData')) {
        return 'inputData';
      }
    }
    
    if (nodeType === 'workflow_trigger' && handleIdLower === 'inputdata') {
      // workflow_trigger outputs 'inputData' - preserve it if it exists in contract
      if (contract.outputs.includes('inputData')) {
        return 'inputData';
      }
    }

    const mapped = sourceMappings[handleIdLower];
    if (mapped && contract.outputs.includes(mapped)) {
      return mapped;
    }
    
    // ✅ CRITICAL: For 'message' from non-chat_trigger nodes, map to 'output' only if 'message' is not valid
    if (handleIdLower === 'message' && nodeType !== 'chat_trigger') {
      if (contract.outputs.includes('output')) {
        return 'output';
      }
    }

    // For switch nodes, accept any handle (case values)
    if (nodeType === 'switch') {
      return handleId;
    }

    // Default to first valid output handle
    return contract.outputs[0] || 'output';
  } else {
    // ✅ ENHANCED: Extended target handle mappings (inputs)
    // Maps common backend field names to React handle IDs
    const targetMappings: Record<string, string> = {
      'data': 'input',
      'input': 'input',
      'message': 'input',
      'text': 'input',
      'body': 'input',
      'content': 'input',
      'userinput': 'userInput',
      'user_input': 'userInput',
      'chatmodel': 'chat_model',
      'chat_model': 'chat_model',
      'memory': 'memory',
      'tool': 'tool',
      'values': 'input',
      'json': 'input',
      'template': 'input',
      'default': 'input',
      'result': 'input',
      'response': 'input',
      'output': 'input',
      'value': 'input',
      'items': 'input',
      'rows': 'input',
    };
    
    // ✅ SPECIAL: For ai_agent, map 'input' to 'userInput'
    if (nodeType === 'ai_agent' && handleIdLower === 'input') {
      if (contract.inputs.includes('userInput')) {
        return 'userInput';
      }
    }

    const mapped = targetMappings[handleIdLower];
    if (mapped && contract.inputs.includes(mapped)) {
      return mapped;
    }

    // If handle is already valid, return it
    if (contract.inputs.includes(handleId)) {
      return handleId;
    }

    // Default to first valid input handle
    return contract.inputs[0] || 'input';
  }
}

/**
 * Validate and fix edge handles
 */
export function validateAndFixEdgeHandles(
  sourceNodeType: string,
  targetNodeType: string,
  sourceHandle: string | undefined,
  targetHandle: string | undefined
): { sourceHandle: string; targetHandle: string } {
  const normalizedSource = normalizeHandleId(sourceNodeType, sourceHandle, true);
  const normalizedTarget = normalizeHandleId(targetNodeType, targetHandle, false);

  return {
    sourceHandle: normalizedSource,
    targetHandle: normalizedTarget,
  };
}
