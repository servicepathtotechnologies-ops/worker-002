/**
 * ✅ ROOT-LEVEL ARCHITECTURE: Node Context System
 * 
 * EVERY node MUST have context. This is MANDATORY, not optional.
 * 
 * Architecture Rules:
 * 1. ALL nodes must define context
 * 2. Context is what AI reads to understand nodes
 * 3. AI matches user prompt context to node context
 * 4. No node can exist without context
 * 
 * This ensures:
 * - AI understands what each node does (semantic understanding)
 * - AI can match user intent to node capabilities
 * - AI can suggest alternatives based on context
 * - No patchwork - systematic context for all nodes
 */

/**
 * ✅ MANDATORY: Node Context Interface
 * 
 * Every node MUST implement this interface.
 * This is what AI reads to understand the node.
 */
export interface NodeContext {
  /**
   * What this node does (human-readable description)
   * AI uses this to understand the node's purpose
   */
  description: string;
  
  /**
   * When to use this node (use cases)
   * AI matches user intent to these use cases
   */
  useCases: string[];
  
  /**
   * When NOT to use this node
   * AI avoids this node in these scenarios
   */
  whenNotToUse: string[];
  
  /**
   * What this node can do (capabilities)
   * AI matches user intent to these capabilities
   */
  capabilities: string[];
  
  /**
   * Keywords that describe this node
   * AI uses these for semantic matching
   */
  keywords: string[];
  
  /**
   * Platform/provider information
   * AI uses this to suggest alternatives
   */
  platforms: string[];
  
  /**
   * Example scenarios where this node is used
   * AI learns from these examples
   */
  examples: string[];
  
  /**
   * Related nodes (alternatives or complementary)
   * AI can suggest these when appropriate
   */
  relatedNodes: string[];
  
  /**
   * Input context - what data this node expects
   * AI uses this to understand data flow
   */
  inputContext: {
    description: string;
    dataTypes: string[];
    examples: string[];
  };
  
  /**
   * Output context - what data this node produces
   * AI uses this to understand data flow
   */
  outputContext: {
    description: string;
    dataTypes: string[];
    examples: string[];
  };
  
  /**
   * Integration context - how this node connects to others
   * AI uses this to build workflows
   */
  integrationContext: {
    commonTriggers: string[];
    commonOutputs: string[];
    commonPatterns: string[];
  };
}

/**
 * ✅ MANDATORY: Context Validation
 * 
 * Ensures every node has complete context
 * ✅ ENHANCED: More lenient validation (warns instead of fails for missing fields)
 */
export function validateNodeContext(context: NodeContext): {
  valid: boolean;
  errors: string[];
  warnings?: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // ✅ CRITICAL: Description is mandatory (cannot be inferred)
  if (!context.description || context.description.trim().length === 0) {
    errors.push('Node context must have description');
  }
  
  // ✅ WARNINGS: These can be inferred, so warn but don't fail
  if (!context.useCases || context.useCases.length === 0) {
    warnings.push('Node context should have at least one use case (will be inferred)');
  }
  
  if (!context.capabilities || context.capabilities.length === 0) {
    warnings.push('Node context should have at least one capability (will be inferred)');
  }
  
  if (!context.keywords || context.keywords.length === 0) {
    warnings.push('Node context should have at least one keyword (will be inferred)');
  }
  
  if (!context.examples || context.examples.length === 0) {
    warnings.push('Node context should have at least one example (will be inferred)');
  }
  
  // ✅ VALID: If only warnings (no errors), context is valid
  // Errors are critical failures, warnings are missing fields that can be inferred
  return {
    valid: errors.length === 0, // Only fail on critical errors (description)
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * ✅ MANDATORY: Context Extraction from NodeSchema
 * 
 * Converts NodeLibrary schema to NodeContext
 * This ensures all nodes have context
 * 
 * ✅ ENHANCED: Provides intelligent defaults for missing fields
 * ✅ WORLD-CLASS: Includes enhanced examples, integration patterns, and best practices
 */
export function extractNodeContext(schema: any): NodeContext {
  // Extract base fields
  const description = schema.description || '';
  const useCases = schema.aiSelectionCriteria?.useCases || schema.aiSelectionCriteria?.whenToUse || [];
  const whenNotToUse = schema.aiSelectionCriteria?.whenNotToUse || [];
  const keywords = schema.keywords || schema.aiSelectionCriteria?.keywords || [];
  const platforms = schema.providers || [];
  const commonPatterns = schema.commonPatterns || [];
  
  // ✅ INTELLIGENT DEFAULTS: Generate capabilities if missing
  let capabilities = schema.capabilities || [];
  if (capabilities.length === 0) {
    // Generate capabilities from node type, category, and description
    capabilities = inferCapabilities(schema.type, schema.category, description, keywords);
  }
  
  // ✅ INTELLIGENT DEFAULTS: Generate examples if missing
  let examples = commonPatterns.map((p: any) => p.description || p.name);
  if (examples.length === 0) {
    // Generate examples from node type, category, and use cases
    examples = inferExamples(schema.type, schema.category, description, useCases);
  }
  
  // ✅ INTELLIGENT DEFAULTS: Generate use cases if missing
  let finalUseCases = useCases;
  if (finalUseCases.length === 0) {
    finalUseCases = inferUseCases(schema.type, schema.category, description);
  }
  
  // ✅ WORLD-CLASS: Add real-world examples
  const realWorldExamples = generateRealWorldExamples(schema.type, schema.category, description, finalUseCases);
  if (realWorldExamples.length > 0) {
    examples = [...examples, ...realWorldExamples].slice(0, 10);
  }
  
  // ✅ WORLD-CLASS: Add integration examples to use cases
  const integrationExamples = generateIntegrationExamples(schema.type, schema.category, description);
  if (integrationExamples.length > 0) {
    finalUseCases = [...finalUseCases, ...integrationExamples].slice(0, 10);
  }
  
  // ✅ INTELLIGENT DEFAULTS: Generate keywords if missing
  let finalKeywords = keywords;
  if (finalKeywords.length === 0) {
    finalKeywords = inferKeywords(schema.type, schema.category, description);
  }
  
  // ✅ WORLD-CLASS: Enhanced description with category-specific details
  let enhancedDescription = description || `${schema.type} node`;
  if (schema.category === 'triggers') {
    enhancedDescription += ` This is a trigger node that starts workflow execution.`;
  } else if (schema.category === 'ai') {
    enhancedDescription += ` This is an AI-powered node that processes data using machine learning.`;
  } else if (schema.category === 'output') {
    enhancedDescription += ` This is an output node that sends data to external systems.`;
  } else if (schema.category === 'database') {
    enhancedDescription += ` This is a database node that reads or writes data.`;
  } else if (schema.category === 'logic') {
    enhancedDescription += ` This is a logic node that controls workflow flow.`;
  }
  if (schema.nodeCapability) {
    enhancedDescription += ` Accepts ${schema.nodeCapability.inputType} input and produces ${schema.nodeCapability.outputType} output.`;
  }
  
  return {
    description: enhancedDescription,
    useCases: finalUseCases,
    whenNotToUse: whenNotToUse,
    capabilities: capabilities,
    keywords: finalKeywords,
    platforms: platforms,
    examples: examples,
    relatedNodes: [], // Will be populated by context registry
    inputContext: {
      description: `Accepts ${schema.nodeCapability?.inputType || 'data'} input`,
      dataTypes: Array.isArray(schema.nodeCapability?.inputType) 
        ? schema.nodeCapability.inputType 
        : [schema.nodeCapability?.inputType || 'object'],
      examples: [],
    },
    outputContext: {
      description: `Produces ${schema.nodeCapability?.outputType || 'data'} output`,
      dataTypes: [schema.nodeCapability?.outputType || 'object'],
      examples: [],
    },
    integrationContext: {
      commonTriggers: [],
      commonOutputs: [],
      commonPatterns: commonPatterns.map((p: any) => p.name) || [],
    },
  };
}

/**
 * ✅ INTELLIGENT INFERENCE: Generate capabilities from node metadata
 */
function inferCapabilities(nodeType: string, category: string, description: string, keywords: string[]): string[] {
  const capabilities: string[] = [];
  
  // Category-based capabilities
  if (category === 'triggers') {
    capabilities.push(`${nodeType}.trigger`, 'workflow.start', 'event.trigger');
  } else if (category === 'ai') {
    capabilities.push(`${nodeType}.process`, 'ai.execute', 'ai.analyze');
  } else if (category === 'output' || category === 'social') {
    capabilities.push(`${nodeType}.send`, 'message.send', 'notification.send');
  } else if (category === 'database') {
    capabilities.push(`${nodeType}.query`, 'data.read', 'data.write');
  } else if (category === 'logic') {
    capabilities.push(`${nodeType}.process`, 'data.transform', 'flow.control');
  } else if (category === 'data') {
    capabilities.push(`${nodeType}.transform`, 'data.process', 'data.format');
  } else {
    capabilities.push(`${nodeType}.execute`, 'operation.perform');
  }
  
  // Type-based capabilities
  if (nodeType.includes('trigger')) {
    capabilities.push('trigger.workflow');
  }
  if (nodeType.includes('gmail') || nodeType.includes('email')) {
    capabilities.push('email.send', 'message.email');
  }
  if (nodeType.includes('slack')) {
    capabilities.push('slack.send', 'message.slack');
  }
  if (nodeType.includes('http')) {
    capabilities.push('http.request', 'api.call');
  }
  if (nodeType.includes('database') || nodeType.includes('sql')) {
    capabilities.push('database.query', 'data.store');
  }
  
  // Keyword-based capabilities
  keywords.forEach(keyword => {
    if (keyword.includes('send') || keyword.includes('message')) {
      capabilities.push('message.send');
    }
    if (keyword.includes('read') || keyword.includes('get')) {
      capabilities.push('data.read');
    }
    if (keyword.includes('write') || keyword.includes('create')) {
      capabilities.push('data.write');
    }
  });
  
  // Remove duplicates and return
  return Array.from(new Set(capabilities));
}

/**
 * ✅ INTELLIGENT INFERENCE: Generate examples from node metadata
 */
function inferExamples(nodeType: string, category: string, description: string, useCases: string[]): string[] {
  const examples: string[] = [];
  
  // Use cases as examples
  if (useCases.length > 0) {
    examples.push(...useCases.slice(0, 3));
  }
  
  // Category-based examples
  if (category === 'triggers') {
    examples.push(`Trigger workflow using ${nodeType}`);
    examples.push(`Start workflow when ${nodeType} event occurs`);
  } else if (category === 'ai') {
    examples.push(`Process data using ${nodeType}`);
    examples.push(`Analyze content with ${nodeType}`);
  } else if (category === 'output' || category === 'social') {
    examples.push(`Send message via ${nodeType}`);
    examples.push(`Notify user through ${nodeType}`);
  } else if (category === 'database') {
    examples.push(`Query database using ${nodeType}`);
    examples.push(`Store data in ${nodeType}`);
  } else if (category === 'logic') {
    examples.push(`Process data with ${nodeType}`);
    examples.push(`Control flow using ${nodeType}`);
  } else if (category === 'data') {
    examples.push(`Transform data with ${nodeType}`);
    examples.push(`Format data using ${nodeType}`);
  } else {
    examples.push(`Execute ${nodeType} operation`);
  }
  
  // Type-based examples
  if (nodeType === 'manual_trigger') {
    examples.push('Manually trigger workflow execution');
    examples.push('Run workflow on demand');
  }
  if (nodeType === 'webhook') {
    examples.push('Receive webhook from external service');
    examples.push('Process incoming HTTP request');
  }
  if (nodeType === 'schedule') {
    examples.push('Run workflow daily at 9 AM');
    examples.push('Execute workflow every hour');
  }
  if (nodeType === 'if_else') {
    examples.push('Conditionally branch workflow execution');
    examples.push('Execute different paths based on condition');
  }
  if (nodeType === 'google_gmail') {
    examples.push('Send email via Gmail');
    examples.push('Send notification email');
  }
  
  // Remove duplicates and ensure at least one
  const uniqueExamples = Array.from(new Set(examples));
  if (uniqueExamples.length === 0) {
    uniqueExamples.push(`Use ${nodeType} to ${description.toLowerCase()}`);
  }
  
  return uniqueExamples.slice(0, 5); // Limit to 5 examples
}

/**
 * ✅ INTELLIGENT INFERENCE: Generate keywords from node metadata
 */
function inferKeywords(nodeType: string, category: string, description: string): string[] {
  const keywords: string[] = [];
  
  // Add node type as keyword
  keywords.push(nodeType);
  
  // Add category as keyword
  keywords.push(category);
  
  // Extract keywords from description
  const descriptionWords = description.toLowerCase().split(/\s+/);
  descriptionWords.forEach(word => {
    if (word.length > 3 && !['this', 'that', 'with', 'from', 'when', 'what'].includes(word)) {
      keywords.push(word);
    }
  });
  
  // Category-based keywords
  if (category === 'triggers') {
    keywords.push('trigger', 'start', 'event');
  } else if (category === 'ai') {
    keywords.push('ai', 'artificial intelligence', 'machine learning');
  } else if (category === 'output') {
    keywords.push('output', 'send', 'notify');
  } else if (category === 'database') {
    keywords.push('database', 'data', 'store', 'query');
  } else if (category === 'logic') {
    keywords.push('logic', 'control', 'flow');
  } else if (category === 'data') {
    keywords.push('data', 'transform', 'process');
  }
  
  // Type-based keywords
  if (nodeType.includes('trigger')) {
    keywords.push('trigger', 'start');
  }
  if (nodeType.includes('gmail') || nodeType.includes('email')) {
    keywords.push('email', 'mail', 'send');
  }
  if (nodeType.includes('slack')) {
    keywords.push('slack', 'message', 'notification');
  }
  if (nodeType.includes('http')) {
    keywords.push('http', 'api', 'request');
  }
  if (nodeType.includes('database') || nodeType.includes('sql')) {
    keywords.push('database', 'sql', 'query');
  }
  
  // Remove duplicates and return
  return Array.from(new Set(keywords)).slice(0, 10); // Limit to 10 keywords
}

/**
 * ✅ INTELLIGENT INFERENCE: Generate use cases from node metadata
 */
function inferUseCases(nodeType: string, category: string, description: string): string[] {
  const useCases: string[] = [];
  
  // Category-based use cases
  if (category === 'triggers') {
    useCases.push(`Start workflow when ${nodeType} event occurs`);
    useCases.push(`Trigger workflow using ${nodeType}`);
  } else if (category === 'ai') {
    useCases.push(`Process data using ${nodeType}`);
    useCases.push(`Analyze content with ${nodeType}`);
  } else if (category === 'output' || category === 'social') {
    useCases.push(`Send message via ${nodeType}`);
    useCases.push(`Notify user through ${nodeType}`);
  } else if (category === 'database') {
    useCases.push(`Query database using ${nodeType}`);
    useCases.push(`Store data in ${nodeType}`);
  } else if (category === 'logic') {
    useCases.push(`Process data with ${nodeType}`);
    useCases.push(`Control flow using ${nodeType}`);
  } else if (category === 'data') {
    useCases.push(`Transform data with ${nodeType}`);
    useCases.push(`Format data using ${nodeType}`);
  } else {
    useCases.push(`Execute ${nodeType} operation`);
  }
  
  // Type-based use cases
  if (nodeType === 'manual_trigger') {
    useCases.push('Manually trigger workflow execution');
    useCases.push('Run workflow on demand');
  }
  if (nodeType === 'webhook') {
    useCases.push('Receive webhook from external service');
    useCases.push('Process incoming HTTP request');
  }
  if (nodeType === 'schedule') {
    useCases.push('Run workflow on schedule');
    useCases.push('Execute workflow at specific times');
  }
  if (nodeType === 'if_else') {
    useCases.push('Conditionally branch workflow execution');
    useCases.push('Execute different paths based on condition');
  }
  if (nodeType === 'google_gmail') {
    useCases.push('Send email via Gmail');
    useCases.push('Send notification email');
  }
  
  // Remove duplicates and ensure at least one
  const uniqueUseCases = Array.from(new Set(useCases));
  if (uniqueUseCases.length === 0) {
    uniqueUseCases.push(`Use ${nodeType} to ${description.toLowerCase()}`);
  }
  
  return uniqueUseCases.slice(0, 5); // Limit to 5 use cases
}

/**
 * ✅ WORLD-CLASS: Generate real-world examples
 */
function generateRealWorldExamples(nodeType: string, category: string, description: string, useCases: string[]): string[] {
  const examples: string[] = [];
  
  // Use existing use cases as examples
  if (useCases.length > 0) {
    examples.push(...useCases.slice(0, 3));
  }
  
  // Category-specific examples
  if (nodeType === 'google_gmail') {
    examples.push('Send email notification when a new order is placed');
    examples.push('Send weekly report email to team members');
    examples.push('Send confirmation email after form submission');
  } else if (nodeType === 'slack_message') {
    examples.push('Send Slack notification when error occurs');
    examples.push('Post daily standup summary to Slack channel');
    examples.push('Alert team when deployment completes');
  } else if (nodeType === 'if_else') {
    examples.push('Branch workflow based on order status');
    examples.push('Conditionally send email based on user type');
    examples.push('Route data based on condition');
  } else if (nodeType === 'google_sheets') {
    examples.push('Read customer data from Google Sheets');
    examples.push('Write form submissions to spreadsheet');
    examples.push('Update inventory tracking sheet');
  } else if (nodeType === 'schedule') {
    examples.push('Run workflow daily at 9 AM');
    examples.push('Execute workflow every hour');
  } else if (nodeType === 'webhook') {
    examples.push('Receive webhook from external service');
    examples.push('Process incoming HTTP request');
  }
  
  return Array.from(new Set(examples)).slice(0, 5); // Limit to 5 unique examples
}

/**
 * ✅ WORLD-CLASS: Generate integration examples
 */
function generateIntegrationExamples(nodeType: string, category: string, description: string): string[] {
  const examples: string[] = [];
  
  // Common integration patterns
  if (category === 'triggers') {
    examples.push(`Trigger → ${nodeType} → Process Data → Send Output`);
  } else if (category === 'output') {
    examples.push(`Read Data → Process → ${nodeType} → Notify`);
  } else if (category === 'ai') {
    examples.push(`Trigger → Read Data → ${nodeType} → Analyze → Send Results`);
  } else if (category === 'database') {
    examples.push(`Trigger → ${nodeType} → Process Results → Send Output`);
  }
  
  // Specific integrations
  if (nodeType === 'google_gmail') {
    examples.push('Webhook → Process Form → Gmail → Send Confirmation');
    examples.push('Schedule → Read Data → Gmail → Send Report');
  } else if (nodeType === 'slack_message') {
    examples.push('Error Trigger → Slack → Alert Team');
    examples.push('Database Update → Slack → Notify Channel');
  } else if (nodeType === 'if_else') {
    examples.push('Read Data → If/Else → Branch → Process');
  } else if (nodeType === 'google_sheets') {
    examples.push('Webhook → Gmail → Sheets → Store Data');
  }
  
  return examples.slice(0, 3); // Limit to 3 examples
}
