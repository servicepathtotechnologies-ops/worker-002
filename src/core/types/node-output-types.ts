/**
 * Node Output Type System
 * Defines the expected output types for all node types in the workflow system
 * This ensures proper data flow between nodes and enables type validation
 */

export type NodeOutputType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'object' 
  | 'array'
  | 'file'
  | 'void';

export interface NodeOutputSchema {
  type: NodeOutputType;
  structure?: {
    // For object types, define the structure
    fields?: Record<string, NodeOutputType>;
  };
  // For array types, define the item type
  itemType?: NodeOutputType;
  // Whether this output can be converted to other types
  convertible?: NodeOutputType[];
  // Default value if output is empty
  defaultValue?: any;
}

export const NODE_OUTPUT_SCHEMAS: Record<string, NodeOutputSchema> = {
  // ============================================
  // TRIGGER NODES
  // ============================================
  manual_trigger: {
    type: 'object',
    structure: {
      fields: {
        timestamp: 'string',
        triggerType: 'string',
        inputData: 'object'
      }
    },
    defaultValue: { timestamp: new Date().toISOString(), triggerType: 'manual' }
  },
  schedule: {
    type: 'object',
    structure: {
      fields: {
        cronExpression: 'string',
        executionTime: 'string',
        timezone: 'string'
      }
    }
  },
  webhook: {
    type: 'object',
    structure: {
      fields: {
        headers: 'object',
        body: 'object',
        queryParams: 'object',
        method: 'string'
      }
    }
  },
  form: {
    type: 'object',
    structure: {
      fields: {
        fields: 'object',
        submittedAt: 'string',
        formId: 'string'
      }
    }
  },
  chat_trigger: {
    type: 'object',
    structure: {
      fields: {
        message: 'string',
        userId: 'string',
        sessionId: 'string',
        timestamp: 'string'
      }
    }
  },
  interval: {
    type: 'object',
    structure: {
      fields: {
        interval: 'number',
        unit: 'string',
        executionTime: 'string'
      }
    }
  },
  error_trigger: {
    type: 'object',
    structure: {
      fields: {
        error: 'object',
        timestamp: 'string',
        source: 'string'
      }
    }
  },
  workflow_trigger: {
    type: 'object',
    structure: {
      fields: {
        workflowId: 'string',
        inputData: 'object',
        timestamp: 'string'
      }
    }
  },

  // ============================================
  // DATA SOURCE NODES (ARRAY OUTPUTS)
  // ============================================
  google_sheets: {
    type: 'array',
    itemType: 'object',
    convertible: ['object', 'string'],
    defaultValue: []
  },
  database_read: {
    type: 'array',
    itemType: 'object',
    convertible: ['object', 'string'],
    defaultValue: []
  },
  database_write: {
    type: 'object',
    structure: {
      fields: {
        rowsAffected: 'number',
        result: 'array'
      }
    }
  },
  supabase: {
    type: 'array',
    itemType: 'object',
    convertible: ['object', 'string'],
    defaultValue: []
  },
  google_drive: {
    type: 'array',
    itemType: 'object',
    convertible: ['object', 'string'],
    defaultValue: []
  },
  http_request: {
    type: 'object',
    structure: {
      fields: {
        status: 'number',
        headers: 'object',
        body: 'object',
        responseTime: 'number'
      }
    },
    convertible: ['string', 'array']
  },

  // ============================================
  // PROCESSING NODES
  // ============================================
  set_variable: {
    type: 'object',
    convertible: ['string', 'array']
  },
  javascript: {
    type: 'object', // Can return any type, but defaults to object
    convertible: ['string', 'array', 'number', 'boolean']
  },
  text_formatter: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  json_parser: {
    type: 'object',
    convertible: ['string', 'array']
  },
  date_time: {
    type: 'string',
    convertible: ['object', 'number'],
    defaultValue: ''
  },
  math: {
    type: 'number',
    convertible: ['string'],
    defaultValue: 0
  },
  html: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  xml: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  csv: {
    type: 'array',
    itemType: 'object',
    convertible: ['string', 'object'],
    defaultValue: []
  },

  // ============================================
  // LOGIC NODES
  // ============================================
  if_else: {
    type: 'object',
    convertible: ['string', 'array']
  },
  switch: {
    type: 'object',
    convertible: ['string', 'array']
  },
  filter: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },
  loop: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },
  merge: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },
  split_in_batches: {
    type: 'array',
    itemType: 'array',
    defaultValue: []
  },
  wait: {
    type: 'object',
    structure: {
      fields: {
        waitedUntil: 'string',
        duration: 'number'
      }
    }
  },
  error_handler: {
    type: 'object',
    convertible: ['string', 'array']
  },
  stop_and_error: {
    type: 'void'
  },
  noop: {
    type: 'object',
    convertible: ['string', 'array']
  },
  limit: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },
  aggregate: {
    type: 'object',
    structure: {
      fields: {
        groups: 'array',
        totals: 'object',
        count: 'number'
      }
    },
    convertible: ['array', 'string']
  },
  sort: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },
  function: {
    type: 'object',
    convertible: ['string', 'array', 'number', 'boolean']
  },
  function_item: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },

  // ============================================
  // AI NODES (TEXT OUTPUTS)
  // ============================================
  ai_agent: {
    type: 'string', // Default to text output
    convertible: ['object', 'array'],
    defaultValue: ''
  },
  openai_gpt: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  anthropic_claude: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  google_gemini: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  ollama: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  text_summarizer: {
    type: 'string',
    convertible: ['object'],
    defaultValue: ''
  },
  sentiment_analyzer: {
    type: 'object',
    structure: {
      fields: {
        sentiment: 'string',
        score: 'number',
        emotions: 'object'
      }
    },
    convertible: ['string']
  },
  chat_model: {
    type: 'object', // Configuration object, not output
    structure: {
      fields: {
        provider: 'string',
        model: 'string',
        apiKey: 'string'
      }
    }
  },
  memory: {
    type: 'object', // Memory state object
    structure: {
      fields: {
        messages: 'array',
        context: 'object'
      }
    }
  },
  tool: {
    type: 'object', // Tool configuration
    structure: {
      fields: {
        name: 'string',
        description: 'string',
        parameters: 'object'
      }
    }
  },

  // ============================================
  // OUTPUT NODES (STRING OUTPUTS)
  // ============================================
  slack_message: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  email: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  discord: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  log_output: {
    type: 'void'
  },
  respond_to_webhook: {
    type: 'void'
  },
  webhook_response: {
    type: 'void'
  },
  telegram: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  microsoft_teams: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  whatsapp_cloud: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  twilio: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },

  // ============================================
  // GOOGLE SERVICES
  // ============================================
  google_gmail: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  google_calendar: {
    type: 'object',
    structure: {
      fields: {
        eventId: 'string',
        success: 'boolean'
      }
    }
  },
  google_tasks: {
    type: 'array',
    itemType: 'object',
    convertible: ['object'],
    defaultValue: []
  },

  // ============================================
  // SOCIAL MEDIA NODES (STRING OUTPUTS)
  // ============================================
  linkedin: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  twitter: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  instagram: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  facebook: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
  youtube: {
    type: 'string', // CRITICAL: Output nodes return strings, not JSON objects
    convertible: ['object'],
    defaultValue: ''
  },
};

/**
 * Get output schema for a node type
 */
export function getNodeOutputSchema(nodeType: string): NodeOutputSchema | null {
  return NODE_OUTPUT_SCHEMAS[nodeType] || null;
}

/**
 * Get the expected output type for a node
 */
export function getNodeOutputType(nodeType: string): NodeOutputType {
  const schema = getNodeOutputSchema(nodeType);
  return schema?.type || 'object'; // Default to object for backward compatibility
}

/**
 * Check if a source output type is compatible with target input type
 */
export function areTypesCompatible(
  sourceType: NodeOutputType,
  targetType: NodeOutputType,
  sourceNodeType?: string,
  targetNodeType?: string
): boolean {
  // Same types are always compatible
  if (sourceType === targetType) return true;
  
  // Any type can accept 'object' (most flexible)
  if (targetType === 'object') return true;
  
  // Check if source type is in convertible list
  if (sourceNodeType) {
    const sourceSchema = getNodeOutputSchema(sourceNodeType);
    if (sourceSchema?.convertible?.includes(targetType)) {
      return true;
    }
  }
  
  // Special compatibility rules
  const compatibilityMatrix: Record<NodeOutputType, NodeOutputType[]> = {
    'string': ['object'],
    'number': ['string', 'object'],
    'boolean': ['string', 'object'],
    'array': ['object', 'string'],
    'object': ['string', 'array'],
    'file': ['object', 'string'],
    'void': []
  };
  
  return compatibilityMatrix[sourceType]?.includes(targetType) || false;
}
