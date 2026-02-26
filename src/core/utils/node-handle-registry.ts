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
 * Validate if a handle ID is valid for a node type
 */
export function isValidHandle(nodeType: string, handleId: string, isSource: boolean): boolean {
  const contract = getNodeHandleContract(nodeType);
  
  if (isSource) {
    // For switch nodes, handles are dynamic (case values)
    if (nodeType === 'switch') {
      return true; // Accept any handle ID for switch (validated at runtime)
    }
    return contract.outputs.includes(handleId);
  } else {
    return contract.inputs.includes(handleId);
  }
}

/**
 * Normalize handle ID to a valid one for the node type
 * 
 * Maps common backend field names to React handle IDs
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
    
    // Source handle mappings (outputs) - only map if handle is NOT already valid
    const sourceMappings: Record<string, string> = {
      'data': 'output',
      'output': 'output',
      'result': 'output',
      'response': 'output',
      'response_text': 'output',
      'response_json': 'output',
      'formdata': 'output',
      'body': 'output',
      'triggertime': 'output',
      'inputdata': 'inputData', // ✅ CRITICAL: manual_trigger uses 'inputData', not 'output'
      'rows': 'output',
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
    // Target handle mappings (inputs)
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
    };

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
