/**
 * Comprehensive Node Questions Generator
 * 
 * ✅ ARCHITECTURAL PRINCIPLE: Only asks for CREDENTIALS (API keys, OAuth tokens, URLs)
 * All other fields (operations, configuration, resources) are AI-generated automatically
 * 
 * Credentials asked from users:
 * - API keys (apiKey, api_key, apiToken, etc.)
 * - OAuth tokens (accessToken, refreshToken, clientId, clientSecret, etc.)
 * - URLs (baseUrl, apiUrl, endpoint, host, hostname, server)
 * 
 * NOT asked (AI-generated):
 * - Operations (create, read, update, delete, etc.)
 * - Configuration fields (prompts, conditions, messages, etc.)
 * - Resource fields (contacts, companies, deals, etc.)
 * 
 * This ensures that:
 * 1. Users only provide authentication credentials and URLs
 * 2. AI workflow builder generates all other required fields automatically
 * 3. No manual configuration questions are asked
 */

import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { getQuestionConfig, getOrderedQuestions } from './node-question-order';
import { isEmptyValue } from '../../core/utils/is-empty-value';

export interface ComprehensiveNodeQuestion {
  id: string;
  text: string;
  type: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  fieldName: string;
  category: 'credential' | 'operation' | 'configuration';
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  askOrder: number;
  example?: any;
  placeholder?: string;
  description?: string;
  // ✅ Optional: Skip checkbox for conditional questions
  skipIfManualEmailProvided?: boolean;
  skipLabel?: string;
}

export interface NodeQuestionsResult {
  questions: ComprehensiveNodeQuestion[];
  nodeQuestionsMap: Map<string, ComprehensiveNodeQuestion[]>; // nodeId -> questions
}

export interface GenerateQuestionsOptions {
  /** Only generate questions for these categories. If empty, generates all categories. */
  categories?: Array<'credential' | 'operation' | 'configuration' | 'resource'>;
}

/**
 * Generate comprehensive questions for ALL nodes in the workflow
 * This includes credentials, operations, and other required fields
 * 
 * By default, generates ALL question types. Use options.categories to filter.
 * For credential-only mode, pass: { categories: ['credential'] }
 */
export function generateComprehensiveNodeQuestions(
  workflow: Workflow,
  answeredFields: Record<string, any> = {},
  options: GenerateQuestionsOptions = {}
): NodeQuestionsResult {
  const allQuestions: ComprehensiveNodeQuestion[] = [];
  const nodeQuestionsMap = new Map<string, ComprehensiveNodeQuestion[]>();

  console.log(`[ComprehensiveQuestions] 🚀 START: Generating questions for ${workflow.nodes.length} nodes`);
  console.log(`[ComprehensiveQuestions] Workflow nodes:`, workflow.nodes.map(n => ({ id: n.id, type: unifiedNormalizeNodeType(n), label: n.data?.label })));

  // Process each node in the workflow
  for (const node of workflow.nodes) {
    const nodeType = unifiedNormalizeNodeType(node);
    const nodeId = node.id;
    const nodeLabel = node.data?.label || nodeType;
    const config = node.data?.config || {};
    const nodeQuestions: ComprehensiveNodeQuestion[] = [];

    console.log(`[ComprehensiveQuestions] Processing node ${nodeId} (type: ${nodeType})`);
    console.log(`[ComprehensiveQuestions] Node config:`, JSON.stringify(config, null, 2));

    // Get node schema
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema || !schema.configSchema) {
      console.warn(`[ComprehensiveQuestions] No schema found for node ${nodeType}, skipping`);
      continue;
    }
    
    // ✅ DEBUG: Log schema structure
    const requiredFields = schema.configSchema.required || [];
    const optionalFields = Object.keys(schema.configSchema.optional || {});
    console.log(`[ComprehensiveQuestions] ${nodeType} schema - Required: [${requiredFields.join(', ')}], Optional: [${optionalFields.join(', ')}]`);

    // ✅ ARCHITECTURAL FIX: Default to credential-only mode
    // Only credentials (API keys, OAuth) should be asked - everything else is AI-generated
    // If categories are explicitly provided, use them (for backward compatibility)
    const requestedCategories = options.categories || ['credential'];
    
    // STEP 1: Generate credential questions (askOrder: 0)
    if (requestedCategories.includes('credential')) {
      const credentialQuestions = generateCredentialQuestions(node, nodeType, nodeId, nodeLabel, config, answeredFields);
      nodeQuestions.push(...credentialQuestions);
    }

    // STEP 2: Generate resource questions (askOrder: 1) - BEFORE operations
    if (requestedCategories.includes('resource')) {
      const resourceQuestions = generateResourceQuestions(node, nodeType, nodeId, nodeLabel, config, schema);
      nodeQuestions.push(...resourceQuestions);
    }

    // STEP 3: Generate operation questions (askOrder: 2)
    if (requestedCategories.includes('operation')) {
      const operationQuestions = generateOperationQuestions(node, nodeType, nodeId, nodeLabel, config, schema);
      nodeQuestions.push(...operationQuestions);
    }

    // STEP 4: Generate other required field questions using node-question-order system
    if (requestedCategories.includes('configuration')) {
      const configQuestions = generateConfigurationQuestions(node, nodeType, nodeId, nodeLabel, config, schema, answeredFields);
      nodeQuestions.push(...configQuestions);
    }

    // Sort questions by askOrder
    nodeQuestions.sort((a, b) => a.askOrder - b.askOrder);

    // Add to maps
    nodeQuestionsMap.set(nodeId, nodeQuestions);
    allQuestions.push(...nodeQuestions);

    console.log(`[ComprehensiveQuestions] ✅ Generated ${nodeQuestions.length} questions for node ${nodeId} (${nodeType})`);
    if (nodeQuestions.length > 0) {
      console.log(`[ComprehensiveQuestions] 📋 Questions breakdown for ${nodeType}:`);
      nodeQuestions.forEach((q, idx) => {
        console.log(`[ComprehensiveQuestions]   ${idx + 1}. ${q.fieldName} (${q.category}, askOrder: ${q.askOrder}, type: ${q.type}, required: ${q.required})`);
      });
    } else {
      console.warn(`[ComprehensiveQuestions] ⚠️ NO QUESTIONS GENERATED for ${nodeType} node ${nodeId}!`);
      console.warn(`[ComprehensiveQuestions]   Config keys: [${Object.keys(config).join(', ')}]`);
      console.warn(`[ComprehensiveQuestions]   Config values:`, Object.entries(config).map(([k, v]) => `${k}=${typeof v === 'string' ? v.substring(0, 50) : v}`).join(', '));
      console.warn(`[ComprehensiveQuestions]   Required fields: [${requiredFields.join(', ')}]`);
      console.warn(`[ComprehensiveQuestions]   Optional fields: [${optionalFields.join(', ')}]`);
    }
  }

  // ✅ CRITICAL: Sort questions by NODE ORDER first, then by askOrder within each node
  // This ensures all questions for one node are asked before moving to the next node
  // Node order: Trigger → Logic → HTTP/AI → Integrations → Outputs
  
  // Get node execution order from workflow (use node position in array as fallback)
  const nodeOrderMap = new Map<string, number>();
  workflow.nodes.forEach((node, index) => {
    nodeOrderMap.set(node.id, index);
  });
  
  // Define node type priority for ordering (lower = earlier)
  const getNodeTypePriority = (nodeType: string): number => {
    const def = unifiedNodeRegistry.get(nodeType);
    const cat = def?.category;
    if (cat === 'trigger' || nodeType.includes('trigger')) return 0;
    if (cat === 'logic') return 1;
    if (cat === 'ai') return 2;
    if (cat === 'data' || cat === 'communication') return 3;
    return 4;
  };
  
  // ✅ CRITICAL: Deduplicate questions by fieldName within each node
  // This prevents the same field from being asked multiple times (e.g., as both credential and configuration)
  const seenQuestionKeys = new Map<string, ComprehensiveNodeQuestion>(); // nodeId_fieldName -> question
  
  for (const question of allQuestions) {
    const key = `${question.nodeId}_${question.fieldName}`;
    
    // If we've seen this field before for this node, keep the one with higher priority
    // Priority: credential (0) > resource (1) > operation (2) > configuration (3)
    const categoryPriority: Record<string, number> = { credential: 0, resource: 1, operation: 2, configuration: 3 };
    
    if (seenQuestionKeys.has(key)) {
      const existingQuestion = seenQuestionKeys.get(key)!;
      const existingPriority = categoryPriority[existingQuestion.category] ?? 999;
      const newPriority = categoryPriority[question.category] ?? 999;
      
      // Keep the question with higher priority (lower number = higher priority)
      if (newPriority < existingPriority) {
        console.log(`[ComprehensiveQuestions] 🔄 Replacing duplicate question for ${question.nodeId}.${question.fieldName}: ${existingQuestion.category} -> ${question.category} (higher priority)`);
        seenQuestionKeys.set(key, question);
      } else {
        console.log(`[ComprehensiveQuestions] ⏭️  Skipping duplicate question for ${question.nodeId}.${question.fieldName}: ${question.category} (lower priority than ${existingQuestion.category})`);
      }
    } else {
      seenQuestionKeys.set(key, question);
    }
  }
  
  // Rebuild the deduplicated questions array
  const deduplicatedQuestions = Array.from(seenQuestionKeys.values());
  allQuestions.length = 0;
  allQuestions.push(...deduplicatedQuestions);
  
  // ✅ CRITICAL: Update nodeQuestionsMap with deduplicated questions
  const deduplicatedNodeQuestionsMap = new Map<string, ComprehensiveNodeQuestion[]>();
  for (const question of deduplicatedQuestions) {
    if (!deduplicatedNodeQuestionsMap.has(question.nodeId)) {
      deduplicatedNodeQuestionsMap.set(question.nodeId, []);
    }
    deduplicatedNodeQuestionsMap.get(question.nodeId)!.push(question);
  }
  
  // Sort questions within each node by askOrder
  for (const [nodeId, questions] of deduplicatedNodeQuestionsMap.entries()) {
    questions.sort((a, b) => a.askOrder - b.askOrder);
  }
  
  // Update the map
  nodeQuestionsMap.clear();
  for (const [nodeId, questions] of deduplicatedNodeQuestionsMap.entries()) {
    nodeQuestionsMap.set(nodeId, questions);
  }

  // Sort all questions: first by node order, then by askOrder within each node
  allQuestions.sort((a, b) => {
    // First, compare by node type priority
    const aPriority = getNodeTypePriority(a.nodeType);
    const bPriority = getNodeTypePriority(b.nodeType);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // If same node type priority, compare by node position in workflow
    const aNodeOrder = nodeOrderMap.get(a.nodeId) ?? 999;
    const bNodeOrder = nodeOrderMap.get(b.nodeId) ?? 999;
    if (aNodeOrder !== bNodeOrder) {
      return aNodeOrder - bNodeOrder;
    }
    
    // If same node, sort by askOrder
    if (a.askOrder !== b.askOrder) {
      return a.askOrder - b.askOrder;
    }
    
    // If same askOrder, prioritize credentials, then operations, then configuration
    const categoryOrder = { credential: 0, resource: 1, operation: 2, configuration: 3 };
    return categoryOrder[a.category] - categoryOrder[b.category];
  });

  console.log(`[ComprehensiveQuestions] ✅ Generated ${allQuestions.length} total questions (after deduplication) for ${workflow.nodes.length} nodes`);
  console.log(`[ComprehensiveQuestions] 📋 Questions ordered by node (node-by-node):`);
  let currentNodeId: string | null = null;
  allQuestions.forEach((q, idx) => {
    if (q.nodeId !== currentNodeId) {
      currentNodeId = q.nodeId;
      console.log(`[ComprehensiveQuestions]   --- ${q.nodeType} (${q.nodeId}) ---`);
    }
    console.log(`[ComprehensiveQuestions]     ${idx + 1}. ${q.fieldName} (${q.category}, askOrder: ${q.askOrder})`);
  });

  return {
    questions: allQuestions,
    nodeQuestionsMap,
  };
}

/**
 * Generate credential questions for a node
 * ✅ ENHANCED: Asks for credential type (API Key OR OAuth Access Token) when both are available
 */
function generateCredentialQuestions(
  node: WorkflowNode,
  nodeType: string,
  nodeId: string,
  nodeLabel: string,
  config: Record<string, any>,
  answeredFields: Record<string, any> = {}
): ComprehensiveNodeQuestion[] {
  const questions: ComprehensiveNodeQuestion[] = [];
  const seenFieldNames = new Set<string>(); // Track seen fields to prevent duplicates
  const schema = nodeLibrary.getSchema(nodeType);
  if (!schema || !schema.configSchema) {
    return questions;
  }

  const requiredFields = schema.configSchema.required || [];
  const optionalFields = Object.keys(schema.configSchema.optional || {});
  const allFields = [...requiredFields, ...optionalFields];

  // ✅ ENHANCED: Check if node supports multiple credential types (API Key + OAuth)
  const hasApiKey = allFields.some(f => f.toLowerCase() === 'apikey' || f.toLowerCase() === 'api_key');
  const hasAccessToken = allFields.some(f => f.toLowerCase() === 'accesstoken' || f.toLowerCase() === 'access_token');
  const hasCredentialId = allFields.some(f => f.toLowerCase() === 'credentialid' || f.toLowerCase() === 'credential_id');

  // ✅ CRITICAL: If node supports both API Key and OAuth, ask for credential type first
  if ((hasApiKey && hasAccessToken) || (hasApiKey && hasCredentialId) || (hasAccessToken && hasCredentialId)) {
    const apiKeyValue = config.apiKey || config.api_key || '';
    const accessTokenValue = config.accessToken || config.access_token || '';
    const credentialIdValue = config.credentialId || config.credential_id || '';

    // If none of the credential fields are populated, ask for credential type
    if ((!apiKeyValue || apiKeyValue.trim() === '') && 
        (!accessTokenValue || accessTokenValue.trim() === '') && 
        (!credentialIdValue || credentialIdValue.trim() === '')) {
      
      // Ask for credential type selection
      const credentialTypeQuestion: ComprehensiveNodeQuestion = {
        id: `cred_${nodeId}_authType`,
        text: `Which authentication method should we use for "${nodeLabel}"?`,
        type: 'select',
        nodeId,
        nodeType,
        nodeLabel,
        fieldName: 'authType', // Special field name for credential type selection
        category: 'credential',
        required: true,
        askOrder: 0, // Credentials are asked first
        options: [
          ...(hasCredentialId ? [{ label: 'Use Stored Credential', value: 'credentialId' }] : []),
          ...(hasApiKey ? [{ label: 'API Key', value: 'apiKey' }] : []),
          ...(hasAccessToken ? [{ label: 'OAuth Access Token', value: 'accessToken' }] : []),
        ],
        description: `Select authentication method for ${nodeLabel} node`,
      };

      questions.push(credentialTypeQuestion);
      console.log(`[ComprehensiveQuestions] Added credential type question for ${nodeType} (supports multiple auth methods)`);
    }
  }

  // ✅ ROOT-LEVEL: Get optional schema for field type detection
  const optionalSchema: any = (schema.configSchema as any).optional || {};
  
  // ✅ ROOT-LEVEL: Also check for resource and operation fields in credentials
  // These should be asked in credentials section with dropdowns (matching node properties)
  const resourceField = allFields.find(f => {
    const fLower = f.toLowerCase();
    return fLower === 'resource' || fLower === 'module' || fLower === 'object';
  });
  const operationField = allFields.find(f => {
    const fLower = f.toLowerCase();
    return fLower === 'operation' || fLower === 'action' || fLower === 'method';
  });
  
  // ✅ ROOT-LEVEL: Add resource/operation to credential questions if missing and required
  if (resourceField && isEmptyValue(config[resourceField])) {
    const fieldSchema = optionalSchema[resourceField] || {};
    // ✅ WORLD-CLASS: Only use explicit options, NOT examples
    const fieldOptions = fieldSchema.options || []; // ✅ CRITICAL: Don't use examples as options
    const hasOptions = Array.isArray(fieldOptions) && fieldOptions.length > 0;
    
    if (hasOptions || requiredFields.includes(resourceField)) {
      const question: ComprehensiveNodeQuestion = {
        id: `cred_${nodeId}_${resourceField}`, // ✅ Node-specific
        text: `Which ${getProviderName(nodeType)} ${resourceField} should "${nodeLabel}" use?`,
        type: hasOptions ? 'select' : 'text',
        nodeId,
        nodeType,
        nodeLabel,
        fieldName: resourceField,
        category: 'credential', // ✅ ROOT-LEVEL: Resource is part of credentials
        required: requiredFields.includes(resourceField),
        askOrder: 0.6, // After API keys/OAuth
        description: `${resourceField} for ${nodeLabel} node`,
        options: hasOptions ? fieldOptions.map((opt: any) => ({
          label: typeof opt === 'string' ? opt : (opt.label || opt.value),
          value: typeof opt === 'string' ? opt : opt.value,
        })) : undefined,
      };
      questions.push(question);
      seenFieldNames.add(resourceField);
      console.log(`[ComprehensiveQuestions] ✅ Added resource question to credentials for ${nodeType}.${resourceField} (dropdown: ${hasOptions})`);
    }
  }
  
  if (operationField && isEmptyValue(config[operationField])) {
    const fieldSchema = optionalSchema[operationField] || {};
    // ✅ WORLD-CLASS: Only use explicit options, NOT examples
    // Examples are just hints, not selectable dropdown options
    const fieldOptions = fieldSchema.options || []; // ✅ CRITICAL: Don't use examples as options
    const hasExplicitOptions = Array.isArray(fieldOptions) && fieldOptions.length > 0;
    
    if (hasExplicitOptions || requiredFields.includes(operationField)) {
      const question: ComprehensiveNodeQuestion = {
        id: `cred_${nodeId}_${operationField}`, // ✅ Node-specific
        text: `What ${getProviderName(nodeType)} operation should "${nodeLabel}" perform?`,
        type: hasExplicitOptions ? 'select' : 'text', // ✅ Only dropdown if explicit options exist
        nodeId,
        nodeType,
        nodeLabel,
        fieldName: operationField,
        category: 'credential', // ✅ ROOT-LEVEL: Operation is part of credentials
        required: requiredFields.includes(operationField),
        askOrder: 0.7, // After resources
        description: `Operation for ${nodeLabel} node`,
        options: hasExplicitOptions ? fieldOptions.map((opt: any) => ({
          label: typeof opt === 'string' ? opt : (opt.label || opt.value),
          value: typeof opt === 'string' ? opt : opt.value,
        })) : undefined,
      };
      questions.push(question);
      seenFieldNames.add(operationField);
      console.log(`[ComprehensiveQuestions] ✅ Added operation question to credentials for ${nodeType}.${operationField} (dropdown: ${hasExplicitOptions})`);
    }
  }

  // Check for credential fields and generate questions
  for (const fieldName of allFields) {
    const fieldLower = fieldName.toLowerCase();

    // ✅ IMPORTANT: Some nodes (especially triggers) have boolean flags that contain "auth"
    // e.g. form.requireAuthentication (boolean). These are NOT credentials and should not
    // generate "connection" questions.
    const optionalSchema: any = (schema.configSchema as any).optional || {};
    const fieldSchema = optionalSchema[fieldName];
    const fieldType = fieldSchema?.type;
    if (fieldType === 'boolean') {
      continue;
    }

    // Explicitly exclude known non-credential fields that include auth-like words
    // (keeps heuristic credential detection accurate)
    if (fieldLower === 'requireauthentication' || fieldLower === 'authenticationrequired') {
      continue;
    }

    // ✅ CRITICAL: Exclude known configuration fields that are NOT credentials
    // These fields contain credential-like words but are actually configuration
    // NOTE: URLs are now treated as credentials (baseUrl, apiUrl, endpoint, etc.)
    // Only specific URL types (webhook, callback, redirect) remain as configuration
    // ✅ SPECIAL: Gmail "to" field is handled as credential with dropdown (excluded from this check)
    const isConfigurationField = 
      fieldLower === 'webhookurl' || fieldLower === 'webhook_url' || // Slack webhook URL is configuration, not credential
      fieldLower === 'callbackurl' || fieldLower === 'callback_url' || // OAuth callback URL is configuration
      fieldLower === 'redirecturl' || fieldLower === 'redirect_url' || // OAuth redirect URL is configuration
      fieldLower.includes('message') || // Message fields are not credentials
      fieldLower.includes('channel') || // Channel fields are not credentials
      fieldLower.includes('text') || // Text fields are not credentials
      fieldLower.includes('subject') || // Subject fields are not credentials
      fieldLower.includes('body') || // Body fields are not credentials
      (fieldLower.includes('to') && nodeType !== 'google_gmail') || // To fields are not credentials (except Gmail)
      fieldLower.includes('from'); // From fields are not credentials
    
    if (isConfigurationField) {
      continue; // Skip configuration fields - they should be asked as configuration questions, not credentials
    }

    // ✅ STRICT: Only detect ACTUAL credential fields
    // APIs, OAuths, Secrets, Passwords, Tokens, Keys, URLs (base URLs, API URLs, endpoints)
    // ✅ ENHANCED: Also detect resource identifiers (spreadsheetId, documentId, etc.) and user-provided fields (recipientEmails, to, from)
    const isCredentialField = 
      // Credential IDs (stored credentials)
      fieldLower.includes('credentialid') || fieldLower.includes('credential_id') ||
      // API Keys
      fieldLower === 'apikey' || fieldLower === 'api_key' ||
      fieldLower === 'apitoken' || fieldLower === 'api_token' ||
      fieldLower === 'apisecret' || fieldLower === 'api_secret' ||
      // OAuth tokens and credentials
      fieldLower === 'accesstoken' || fieldLower === 'access_token' ||
      fieldLower === 'refreshtoken' || fieldLower === 'refresh_token' ||
      fieldLower === 'clientid' || fieldLower === 'client_id' ||
      fieldLower === 'clientsecret' || fieldLower === 'client_secret' ||
      fieldLower === 'oauth' || fieldLower.includes('oauth_token') ||
      // Bot tokens
      fieldLower === 'bottoken' || fieldLower === 'bot_token' ||
      // Keys (private/public keys for authentication)
      fieldLower === 'privatekey' || fieldLower === 'private_key' ||
      fieldLower === 'publickey' || fieldLower === 'public_key' ||
      // Secrets and passwords
      (fieldLower.includes('secret') && !fieldLower.includes('webhook') && !fieldLower.includes('url')) ||
      fieldLower.includes('password') ||
      // Consumer keys (OAuth 1.0)
      fieldLower === 'consumerkey' || fieldLower === 'consumer_key' ||
      fieldLower === 'consumersecret' || fieldLower === 'consumer_secret' ||
      // Bearer tokens
      fieldLower === 'bearer' || fieldLower === 'bearertoken' || fieldLower === 'bearer_token' ||
      // Authorization headers
      fieldLower === 'authorization' || fieldLower === 'authorizationheader' ||
      // Secret tokens (for webhook verification, not webhook URLs)
      (fieldLower.includes('secrettoken') || fieldLower.includes('secret_token')) ||
      // Generic token (but exclude message tokens, webhook tokens that are URLs)
      (fieldLower.includes('token') && 
       !fieldLower.includes('message') && 
       !fieldLower.includes('messagetype') &&
       !fieldLower.includes('webhook') &&
       !fieldLower.includes('url')) ||
      // ✅ URLs are now credentials (base URLs, API URLs, endpoints)
      // Exclude: webhook_url, callback_url, redirect_url (handled above as configuration)
      (fieldLower.includes('url') && 
       !fieldLower.includes('webhook') && 
       !fieldLower.includes('callback') && 
       !fieldLower.includes('redirect')) ||
      fieldLower === 'baseurl' || fieldLower === 'base_url' ||
      fieldLower === 'apiurl' || fieldLower === 'api_url' ||
      fieldLower.includes('endpoint') ||
      fieldLower === 'host' || fieldLower === 'hostname' ||
      fieldLower === 'server' || fieldLower === 'serverurl' || fieldLower === 'server_url' ||
      // ✅ NEW: Resource identifiers (user-provided IDs for external resources)
      fieldLower === 'spreadsheetid' || fieldLower === 'spreadsheet_id' ||
      fieldLower === 'documentid' || fieldLower === 'document_id' ||
      fieldLower === 'sheetname' || fieldLower === 'sheet_name' ||
      fieldLower === 'tableid' || fieldLower === 'table_id' ||
      fieldLower === 'baseid' || fieldLower === 'base_id' ||
      // ✅ NEW: User-provided email addresses (not AI-generated)
      // ✅ SIMPLIFIED: Gmail recipient fields - manual email and URL
      fieldLower === 'recipientemails' || fieldLower === 'recipient_emails' ||
      fieldLower === 'recipienturl' || fieldLower === 'recipient_url' || // Gmail URL field for extracting emails
      (fieldLower === 'to' && nodeType === 'google_gmail') || // Gmail "to" field
      (fieldLower === 'from' && (nodeType.includes('gmail') || nodeType.includes('email')));

    if (isCredentialField) {
      // ✅ CRITICAL: Skip if we've already seen this field (prevent duplicates)
      if (seenFieldNames.has(fieldName)) {
        console.log(`[ComprehensiveQuestions] Skipping duplicate credential field: ${nodeType}.${fieldName}`);
        continue;
      }
      
      // ✅ FIX: Skip recipientEmails for Gmail nodes - handled via special "to" field case
      if (nodeType === 'google_gmail' && (fieldLower === 'recipientemails' || fieldLower === 'recipient_emails')) {
        console.log(`[ComprehensiveQuestions] Skipping recipientEmails for Gmail - handled via special "to" field case`);
        continue;
      }
      
      const fieldValue = config[fieldName];
      // ✅ FIX: Use universal isEmpty check
      if (isEmptyValue(fieldValue)) {
        // Mark field as seen to prevent duplicates
        seenFieldNames.add(fieldName);
        
        // Generate credential question
        // ✅ ENHANCED: Handle URL fields with appropriate question text
        const isUrlField = fieldLower.includes('url') || 
                          fieldLower.includes('endpoint') || 
                          fieldLower === 'baseurl' || 
                          fieldLower === 'base_url' ||
                          fieldLower === 'apiurl' ||
                          fieldLower === 'api_url' ||
                          fieldLower === 'host' ||
                          fieldLower === 'hostname' ||
                          fieldLower === 'server';
        
        let questionText: string;
        let placeholder: string;
        
        if (hasCredentialId && fieldLower.includes('credentialid')) {
          questionText = `Which ${getProviderName(nodeType)} connection should we use for "${nodeLabel}"?`;
          placeholder = 'Select credential';
        } else if (isUrlField) {
          questionText = `What is the ${fieldName} for "${nodeLabel}"?`;
          placeholder = fieldLower.includes('base') ? 'Enter base URL (e.g., https://api.example.com)' :
                       fieldLower.includes('api') ? 'Enter API URL' :
                       fieldLower.includes('endpoint') ? 'Enter endpoint URL' :
                       'Enter URL';
        } else if (hasApiKey && fieldLower.includes('api')) {
          questionText = `What is your ${getProviderName(nodeType)} API Key for "${nodeLabel}"?`;
          placeholder = 'Enter API Key';
        } else if (hasAccessToken && fieldLower.includes('access')) {
          questionText = `What is your ${getProviderName(nodeType)} OAuth Access Token for "${nodeLabel}"?`;
          placeholder = 'Enter OAuth Access Token';
        } else {
          questionText = `Which ${getProviderName(nodeType)} connection should we use for "${nodeLabel}"?`;
          placeholder = 'Select credential';
        }
        
        // ✅ SIMPLIFIED: Gmail recipient - two separate input fields (no dropdown)
        if (nodeType === 'google_gmail' && fieldLower === 'to') {
          // Field 1: Enter email manually
          const manualEmailQuestion: ComprehensiveNodeQuestion = {
            id: `cred_${nodeId}_recipientEmails`,
            text: `Enter recipient email address(es) manually for "${nodeLabel}"?`,
            type: 'text',
            nodeId,
            nodeType,
            nodeLabel,
            fieldName: 'recipientEmails',
            category: 'credential',
            required: false, // Optional - user can leave empty for AI to handle
            askOrder: 0.5,
            description: `Enter recipient email address(es) manually (comma-separated for multiple). Leave empty if you want AI to handle it or if using URL option.`,
            placeholder: 'user@example.com, another@example.com',
          };
          questions.push(manualEmailQuestion);
          
          // Field 2: Enter URL to extract email from (with skip option if manual email already provided)
          // Check if manual email was already provided (from config or previous answers)
          const manualEmailQuestionId = `cred_${nodeId}_recipientEmails`;
          const manualEmailValue = config.recipientEmails || 
                                   answeredFields[`${nodeId}_recipientEmails`] || 
                                   answeredFields[manualEmailQuestionId] ||
                                   answeredFields[`cred_${nodeId}_recipientEmails_manual`]; // Legacy format
          const hasManualEmail = manualEmailValue && typeof manualEmailValue === 'string' && manualEmailValue.trim() !== '';
          
          const urlQuestion: ComprehensiveNodeQuestion = {
            id: `cred_${nodeId}_recipientUrl`,
            text: `Enter URL to extract recipient email for "${nodeLabel}"?`,
            type: 'text',
            nodeId,
            nodeType,
            nodeLabel,
            fieldName: 'recipientUrl',
            category: 'credential',
            required: false, // Optional - user can leave empty for AI to handle
            askOrder: 0.6,
            description: hasManualEmail 
              ? `✅ You've already entered an email manually (${manualEmailValue.substring(0, 30)}${manualEmailValue.length > 30 ? '...' : ''}). You can skip this by checking the box below, or enter a URL to extract additional emails.`
              : `Enter URL (Google Sheet, Word doc, PowerPoint, Slack, screenshot, image, etc.) to extract email from. Leave empty if entering email manually or if you want AI to handle it.`,
            placeholder: hasManualEmail 
              ? 'Leave empty if you already entered email manually, or enter URL here'
              : 'https://docs.google.com/spreadsheets/d/...',
            // ✅ Add skip option metadata for frontend - checkbox will appear if manual email was provided
            skipIfManualEmailProvided: true,
            skipLabel: 'I already filled email manually - skip this step',
          };
          questions.push(urlQuestion);
          console.log(`[ComprehensiveQuestions] Added Gmail recipient fields (manual email + URL) for ${nodeType}`);
          // ✅ CRITICAL: Skip normal question generation for "to" field - we've handled it specially
          continue;
        } 
        // ✅ SIMPLIFIED: Google Sheets spreadsheetId - single input field (no dropdown)
        else if ((nodeType === 'google_sheets' || nodeType === 'google_sheets_read' || nodeType === 'google_sheets_write') && fieldLower === 'spreadsheetid') {
          const spreadsheetIdQuestion: ComprehensiveNodeQuestion = {
            id: `cred_${nodeId}_${fieldName}`,
            text: `Enter Google Sheets spreadsheet ID or URL for "${nodeLabel}"?`,
            type: 'text',
            nodeId,
            nodeType,
            nodeLabel,
            fieldName: 'spreadsheetId',
            category: 'credential',
            required: true,
            askOrder: 0.5, // After credential type selection
            description: `Enter the Google Sheets spreadsheet ID or full URL. Both formats work.`,
            placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or https://docs.google.com/spreadsheets/d/...',
          };
          questions.push(spreadsheetIdQuestion);
          console.log(`[ComprehensiveQuestions] Added Google Sheets spreadsheetId input field (no dropdown) for ${nodeType}.${fieldName}`);
        }
        // ✅ SPECIAL HANDLING: Google Docs "documentId" field with dropdown options
        else if ((nodeType === 'google_docs' || nodeType === 'google_doc') && fieldLower === 'documentid') {
          const documentIdQuestion: ComprehensiveNodeQuestion = {
            id: `cred_${nodeId}_${fieldName}`,
            text: `How should we get the Google Docs document ID or URL for "${nodeLabel}"?`,
            type: 'select',
            nodeId,
            nodeType,
            nodeLabel,
            fieldName: 'documentId',
            category: 'credential',
            required: true,
            askOrder: 0.5, // After credential type selection
            description: `Select how to provide the document ID or URL for ${nodeLabel} node`,
            options: [
              { label: 'Enter URL', value: 'url' },
              { label: 'Enter ID', value: 'id' },
            ],
          };
          questions.push(documentIdQuestion);
          console.log(`[ComprehensiveQuestions] Added Google Docs "documentId" field question with dropdown options for ${nodeType}.${fieldName}`);
        } else {
          // ✅ ROOT-LEVEL FIX: Use node schema to determine field type (matches node properties)
          const optionalSchema: any = (schema.configSchema as any).optional || {};
          const fieldSchema = optionalSchema[fieldName] || {};
          const fieldType = fieldSchema.type || 'string';
          
          // ✅ WORLD-CLASS FIX: Only use explicit options, NOT examples
          // Examples are just hints for users, not selectable dropdown options
          // Only operations/resources with explicit options should be dropdowns
          const fieldOptions = fieldSchema.options || []; // ✅ CRITICAL: Don't use examples as options
          const hasExplicitOptions = Array.isArray(fieldOptions) && fieldOptions.length > 0;
          
          // ✅ WORLD-CLASS: Identify fields that MUST be text input (user-provided values)
          // These should NEVER be dropdowns, even if they have examples
          const isUserProvidedTextField = 
            fieldLower.includes('url') || // webhookUrl, apiUrl, baseUrl, endpoint, etc.
            fieldLower.includes('api') && (fieldLower.includes('key') || fieldLower.includes('token')) || // apiKey, api_key, apiToken
            fieldLower.includes('spreadsheet') || // spreadsheetId
            fieldLower.includes('table') && fieldLower.includes('name') || // tableName
            fieldLower.includes('file') && fieldLower.includes('name') || // fileName
            fieldLower.includes('database') && fieldLower.includes('name') || // databaseName
            fieldLower.includes('id') && !fieldLower.includes('credential'); // Any ID field (but not credentialId)
          
          // ✅ WORLD-CLASS: Identify fields that SHOULD be dropdowns (predefined options)
          // Operations and resources have explicit options from schema
          const isOperationOrResourceField = 
            fieldLower.includes('operation') || // operation field
            fieldLower.includes('resource') || // resource field
            fieldLower.includes('action'); // action field
          
          // ✅ ROOT-LEVEL: If field has options in schema → use dropdown (same as node properties)
          // This ensures resources/operations are dropdowns in credentials too
          let questionType: string;
          let questionOptions: Array<{ label: string; value: string }> | undefined;
          
          if (hasCredentialId && fieldLower.includes('credentialid')) {
            questionType = 'credential';
          } else if (isUserProvidedTextField) {
            // ✅ WORLD-CLASS: Force text input for user-provided fields (URLs, API keys, IDs, etc.)
            // These should NEVER be dropdowns, even if they have examples
            questionType = 'text';
            console.log(`[ComprehensiveQuestions] ✅ Using text input for ${nodeType}.${fieldName} (user-provided field: URL/API key/ID)`);
          } else if (hasExplicitOptions && isOperationOrResourceField) {
            // ✅ WORLD-CLASS: Only use dropdown for operations/resources with explicit options
            questionType = 'select';
            questionOptions = fieldOptions.map((opt: any) => {
              if (typeof opt === 'string') {
                return { label: opt, value: opt };
              } else if (typeof opt === 'object' && opt.label && opt.value) {
                return { label: opt.label, value: opt.value };
              } else {
                return { label: String(opt), value: String(opt) };
              }
            });
            console.log(`[ComprehensiveQuestions] ✅ Using dropdown for ${nodeType}.${fieldName} (${questionOptions.length} explicit options from schema)`);
          } else {
            // ✅ ROOT-LEVEL: Text fields → use text input (same as node properties)
            questionType = mapQuestionType(fieldType);
            console.log(`[ComprehensiveQuestions] ✅ Using ${questionType} for ${nodeType}.${fieldName} (from schema type: ${fieldType})`);
          }
          
          const question: ComprehensiveNodeQuestion = {
            id: `cred_${nodeId}_${fieldName}`, // ✅ Node-specific: includes nodeId
            text: questionText,
            type: questionType,
            nodeId, // ✅ Node-specific: ensures credentials go to correct node
            nodeType,
            nodeLabel,
            fieldName,
            category: 'credential',
            required: requiredFields.includes(fieldName),
            askOrder: 0.5, // After credential type selection (0.5 so it comes after authType question)
            description: `Credential required for ${nodeLabel} node`,
            placeholder,
            options: questionOptions, // ✅ ROOT-LEVEL: Dropdown options for resources/operations
          };

          questions.push(question);
          console.log(`[ComprehensiveQuestions] ✅ Added credential question for ${nodeType}.${fieldName} (type: ${questionType}, nodeId: ${nodeId})`);
        }
      }
    }
  }

  return questions;
}

/**
 * Generate resource questions for a node (e.g., HubSpot resource: contact, company, deal)
 */
function generateResourceQuestions(
  node: WorkflowNode,
  nodeType: string,
  nodeId: string,
  nodeLabel: string,
  config: Record<string, any>,
  schema: any
): ComprehensiveNodeQuestion[] {
  const questions: ComprehensiveNodeQuestion[] = [];

  // Check if node has a resource field (common in CRM nodes)
  const requiredFields = schema.configSchema.required || [];
  const optionalFields = Object.keys(schema.configSchema.optional || {});
  const allFields = [...requiredFields, ...optionalFields];

  console.log(`[ComprehensiveQuestions] 🔍 Checking for resource field in ${nodeType}`);
  console.log(`[ComprehensiveQuestions]   Required fields: [${requiredFields.join(', ')}]`);
  console.log(`[ComprehensiveQuestions]   Optional fields: [${optionalFields.join(', ')}]`);

  // ✅ WORLD-CLASS: Check for resource fields (predefined choices, NOT user-provided IDs)
  // Resource fields are dropdowns with predefined options (e.g., HubSpot: contact, company, deal)
  // ID fields (spreadsheetId, tableId, documentId) are NOT resources - they're user-provided text inputs
  const hasResourceField = allFields.some(field => {
    const fieldLower = field.toLowerCase();
    return fieldLower === 'resource' || 
           fieldLower === 'module' ||
           fieldLower === 'object' ||
           fieldLower === 'table' && !fieldLower.includes('id') && !fieldLower.includes('name'); // table (resource), not tableId or tableName
           // ✅ EXCLUDED: ID fields are NOT resources (they're user-provided text inputs)
           // spreadsheetId, tableId, documentId, calendarId, etc. should be text inputs
  });

  console.log(`[ComprehensiveQuestions]   Has resource field: ${hasResourceField}`);

  if (hasResourceField) {
    // ✅ WORLD-CLASS: Find resource field (predefined choices, NOT user-provided IDs)
    // Resource fields are dropdowns with predefined options (e.g., HubSpot: contact, company, deal)
    // ID fields (spreadsheetId, tableId, documentId) are NOT resources - they're user-provided text inputs
    const resourceField = allFields.find(field => {
      const fieldLower = field.toLowerCase();
      return fieldLower === 'resource' || 
             fieldLower === 'module' ||
             fieldLower === 'object' ||
             (fieldLower === 'table' && !fieldLower.includes('id') && !fieldLower.includes('name')); // table (resource), not tableId or tableName
             // ✅ EXCLUDED: ID fields are NOT resources (they're user-provided text inputs)
             // spreadsheetId, tableId, documentId, calendarId, etc. should be text inputs
    });

    if (resourceField) {
      const resourceValue = config[resourceField];
      const isRequired = requiredFields.includes(resourceField);
      
      // ✅ FIX: Use universal isEmpty check
      const isEmpty = isEmptyValue(resourceValue);

      // ✅ ARCHITECTURAL FIX: Resource fields should NOT be asked - they're AI-generated
      // Only credentials are asked. This check should never be reached if categories=['credential'] is used
      // But keeping for backward compatibility if someone explicitly requests resource questions
      if (isEmpty || isRequired) {
        console.log(`[ComprehensiveQuestions] ✅ Generating resource question for ${resourceField} (required: ${isRequired}, isEmpty: ${isEmpty}, value: ${resourceValue})`);
        // Get resource options from schema or node-question-order
        const fieldInfo = schema.configSchema.optional?.[resourceField];
        
        let options: Array<{ label: string; value: string }> = [];
        
        // Try to get options from node-question-order system
        const questionConfig = getQuestionConfig(nodeType);
        if (questionConfig) {
          const resourceQuestion = questionConfig.questions.find(q => 
            q.field === resourceField || 
            q.field.toLowerCase().includes('resource') ||
            q.field.toLowerCase().includes('module')
          );
          if (resourceQuestion?.options) {
            options = resourceQuestion.options.map(opt => ({
              label: typeof opt === 'string' ? opt : (opt.label || opt.value),
              value: typeof opt === 'string' ? opt : opt.value,
            }));
          }
        }

        // ✅ WORLD-CLASS: Don't use examples as options - they're just hints
        // Only use explicit options from schema
        // Examples are not selectable dropdown options

        // ✅ ENHANCED: Fallback options based on node type
        if (options.length === 0) {
          // Node-specific fallback options
          if (nodeType.includes('hubspot') || nodeType.includes('zoho') || nodeType.includes('pipedrive')) {
            // CRM nodes
            options = [
              { label: 'Contact', value: 'contact' },
              { label: 'Company', value: 'company' },
              { label: 'Deal', value: 'deal' },
              { label: 'Ticket', value: 'ticket' },
              { label: 'Lead', value: 'lead' },
            ];
          } else if (nodeType.includes('airtable')) {
            // Airtable - baseId and tableId are separate fields, handled individually
            options = [];
          } else if (nodeType.includes('google_sheets')) {
            // Google Sheets - spreadsheetId is handled separately
            options = [];
          } else if (nodeType.includes('google_doc')) {
            // Google Docs - documentId is handled separately
            options = [];
          } else if (nodeType.includes('google_calendar')) {
            // Google Calendar - calendarId is handled separately
            options = [];
          } else if (nodeType.includes('slack')) {
            // Slack - channel is a resource
            options = [
              { label: 'General', value: 'general' },
              { label: 'Random', value: 'random' },
            ];
          } else if (nodeType.includes('github')) {
            // GitHub - repo is a resource
            options = [];
          } else if (nodeType.includes('facebook')) {
            // Facebook - pageId is a resource
            options = [];
          } else {
            // Generic fallback for other nodes
            options = [
              { label: 'Resource', value: 'resource' },
              { label: 'Item', value: 'item' },
              { label: 'Record', value: 'record' },
            ];
          }
        }

        // Ensure all options have both label and value
        const validOptions = options
          .filter(opt => opt && opt.value)
          .map(opt => ({
            label: opt.label || opt.value,
            value: opt.value,
          }));

        // ✅ ENHANCED: Determine question type based on field name
        // ID fields (baseId, tableId, spreadsheetId, etc.) should be text inputs, not selects
        const isIdField = resourceField.toLowerCase().includes('id') || 
                         resourceField.toLowerCase().includes('url');
        const questionType = isIdField ? 'text' : (validOptions.length > 0 ? 'select' : 'text');
        
        const question: ComprehensiveNodeQuestion = {
          id: `resource_${nodeId}_${resourceField}`,
          text: isIdField 
            ? `What is the ${getProviderName(nodeType)} ${resourceField} for "${nodeLabel}"?`
            : `Which ${getProviderName(nodeType)} ${resourceField} are we working with?`,
          type: questionType,
          nodeId,
          nodeType,
          nodeLabel,
          fieldName: resourceField,
          category: 'configuration',
          required: requiredFields.includes(resourceField),
          options: questionType === 'select' && validOptions.length > 0 ? validOptions : undefined,
          askOrder: 1, // Resources are asked after credentials, before operations
          description: isIdField 
            ? `${resourceField} identifier for ${nodeLabel} node`
            : `${resourceField} type for ${nodeLabel} node`,
          placeholder: isIdField ? `Enter ${resourceField}` : undefined,
        };

        questions.push(question);
        console.log(`[ComprehensiveQuestions] Added resource question for ${nodeType}.${resourceField}`);
      }
    }
  }

  return questions;
}

/**
 * Generate operation questions for a node
 */
function generateOperationQuestions(
  node: WorkflowNode,
  nodeType: string,
  nodeId: string,
  nodeLabel: string,
  config: Record<string, any>,
  schema: any
): ComprehensiveNodeQuestion[] {
  const questions: ComprehensiveNodeQuestion[] = [];

  // Check if node has an operation field
  const requiredFields = schema.configSchema.required || [];
  const optionalFields = Object.keys(schema.configSchema.optional || {});
  const allFields = [...requiredFields, ...optionalFields];

  console.log(`[ComprehensiveQuestions] 🔍 Checking for operation field in ${nodeType}`);
  console.log(`[ComprehensiveQuestions]   Required fields: [${requiredFields.join(', ')}]`);
  console.log(`[ComprehensiveQuestions]   Optional fields: [${optionalFields.join(', ')}]`);

  // ✅ CRITICAL: Check node-question-order FIRST for operation field
  // Some nodes (like LinkedIn) have operation in node-question-order but not in schema
  const questionConfig = getQuestionConfig(nodeType);
  let operationFieldFromConfig: string | null = null;
  let operationQuestionFromConfig: any = null;
  
  if (questionConfig) {
    operationQuestionFromConfig = questionConfig.questions.find(q => 
      q.field === 'operation' || q.field.toLowerCase().includes('operation')
    );
    if (operationQuestionFromConfig) {
      operationFieldFromConfig = operationQuestionFromConfig.field;
      console.log(`[ComprehensiveQuestions] ✅ Found operation field in node-question-order: ${operationFieldFromConfig}`);
    }
  }

  // ✅ ENHANCED: Check for operation fields with more variations
  // Some nodes use 'action', 'method', 'type' instead of 'operation'
  const hasOperationFieldInSchema = allFields.some(field => {
    const fieldLower = field.toLowerCase();
    return fieldLower === 'operation' || 
           fieldLower.includes('operation') ||
           (fieldLower === 'action' && nodeType.includes('http')) || // HTTP methods
           (fieldLower === 'method' && nodeType.includes('http')); // HTTP methods
  });

  const hasOperationField = hasOperationFieldInSchema || !!operationFieldFromConfig;
  console.log(`[ComprehensiveQuestions]   Has operation field in schema: ${hasOperationFieldInSchema}`);
  console.log(`[ComprehensiveQuestions]   Has operation field in node-question-order: ${!!operationFieldFromConfig}`);
  console.log(`[ComprehensiveQuestions]   Has operation field (combined): ${hasOperationField}`);

  if (hasOperationField) {
    // ✅ CRITICAL: Use operation field from node-question-order if available, otherwise from schema
    const operationField =
      operationFieldFromConfig ||
      allFields.find((field) => {
        const fieldLower = field.toLowerCase();
        return (
          fieldLower === 'operation' ||
          fieldLower.includes('operation') ||
          (fieldLower === 'method' && nodeType.includes('http')) ||
          (fieldLower === 'action' && nodeType.includes('http'))
        );
      });

    if (operationField) {
      const operationValue = config[operationField];
      // ✅ CRITICAL: Check if required in schema OR in node-question-order
      const isRequiredInSchema = requiredFields.includes(operationField);
      const isRequiredInConfig = operationQuestionFromConfig?.required || false;
      const isRequired = isRequiredInSchema || isRequiredInConfig;
      
      console.log(`[ComprehensiveQuestions]   Operation field: ${operationField}`);
      console.log(`[ComprehensiveQuestions]   Required in schema: ${isRequiredInSchema}`);
      console.log(`[ComprehensiveQuestions]   Required in config: ${isRequiredInConfig}`);
      console.log(`[ComprehensiveQuestions]   Is required (combined): ${isRequired}`);
      
      // ✅ FIX: Use universal isEmpty check
      const isEmpty = isEmptyValue(operationValue);

      // ✅ ARCHITECTURAL FIX: Operation fields should NOT be asked - they're AI-generated
      // Only credentials are asked. This check should never be reached if categories=['credential'] is used
      // But keeping for backward compatibility if someone explicitly requests operation questions
      if (isEmpty || isRequired) {
        console.log(`[ComprehensiveQuestions] ✅ Generating operation question for ${operationField} (required: ${isRequired}, isEmpty: ${isEmpty}, value: ${operationValue})`);
        console.log(`[ComprehensiveQuestions]   Field is in required array: ${requiredFields.includes(operationField)}`);
        console.log(`[ComprehensiveQuestions]   Will generate question: ${isEmpty || isRequired}`);
        // Get operation options from schema or node-question-order
        const fieldInfo = schema.configSchema.optional?.[operationField] || 
                         schema.configSchema.required?.find((f: string) => f === operationField);
        
        let options: Array<{ label: string; value: string }> = [];
        
        // ✅ CRITICAL: Try to get options from node-question-order system FIRST
        // This ensures we get the correct options even if field is not in schema
        if (operationQuestionFromConfig?.options) {
          options = operationQuestionFromConfig.options.map((opt: any) => ({
            label: typeof opt === 'string' ? opt : (opt.label || opt.value),
            value: typeof opt === 'string' ? opt : opt.value,
          }));
          console.log(`[ComprehensiveQuestions]   Got options from node-question-order: [${options.map(o => o.value).join(', ')}]`);
        } else if (questionConfig) {
          const operationQuestion = questionConfig.questions.find(q => 
            q.field === operationField || q.field.toLowerCase().includes('operation')
          );
          if (operationQuestion?.options) {
            options = operationQuestion.options.map((opt: any) => ({
              label: typeof opt === 'string' ? opt : (opt.label || opt.value),
              value: typeof opt === 'string' ? opt : opt.value,
            }));
            console.log(`[ComprehensiveQuestions]   Got options from node-question-order (fallback): [${options.map(o => o.value).join(', ')}]`);
          }
        }

        // Fallback: Try to get options from schema
        if (options.length === 0 && fieldInfo?.options) {
          options = fieldInfo.options.map((opt: any) => ({
            label: typeof opt === 'string' ? opt : (opt.label || opt.value),
            value: typeof opt === 'string' ? opt : opt.value,
          }));
        }

        // Fallback: Use common operations if no options found
        if (options.length === 0) {
          const opLower = operationField.toLowerCase();
          if (opLower === 'method' && nodeType.includes('http')) {
            options = [
              { label: 'GET', value: 'GET' },
              { label: 'POST', value: 'POST' },
              { label: 'PUT', value: 'PUT' },
              { label: 'PATCH', value: 'PATCH' },
              { label: 'DELETE', value: 'DELETE' },
            ];
          } else {
            options = [
              { label: 'Get', value: 'get' },
              { label: 'Get Many', value: 'getMany' },
              { label: 'Create', value: 'create' },
              { label: 'Update', value: 'update' },
              { label: 'Delete', value: 'delete' },
              { label: 'Search', value: 'search' },
            ];
          }
        }
        
        // ✅ CRITICAL: If still no options and operation is required, use node-question-order default
        if (options.length === 0 && isRequired && operationQuestionFromConfig?.default) {
          // Don't add default as option, but log it for debugging
          console.log(`[ComprehensiveQuestions]   Operation has default value: ${operationQuestionFromConfig.default}`);
        }

        // Ensure all options have both label and value
        const validOptions = options
          .filter(opt => opt && opt.value)
          .map(opt => ({
            label: opt.label || opt.value,
            value: opt.value,
          }));

        // ✅ ENHANCED: Context-aware operation question text based on node type
        let operationQuestionText = `What operation should "${nodeLabel}" perform?`;
        if (nodeType.includes('crm') || nodeType.includes('hubspot') || nodeType.includes('zoho') || nodeType.includes('pipedrive')) {
          operationQuestionText = `What ${getProviderName(nodeType)} operation should "${nodeLabel}" perform?`;
        } else if (nodeType.includes('http')) {
          operationQuestionText = `What HTTP method should "${nodeLabel}" use?`;
        } else if (nodeType.includes('google') || nodeType.includes('airtable') || nodeType.includes('notion')) {
          operationQuestionText = `What ${getProviderName(nodeType)} operation should "${nodeLabel}" perform?`;
        } else if (nodeType.includes('social') || nodeType.includes('linkedin') || nodeType.includes('twitter') || nodeType.includes('facebook') || nodeType.includes('instagram')) {
          operationQuestionText = `What action should "${nodeLabel}" perform?`;
        }
        
        const question: ComprehensiveNodeQuestion = {
          id: `op_${nodeId}_${operationField}`,
          text: operationQuestionText,
          type: 'select',
          nodeId,
          nodeType,
          nodeLabel,
          fieldName: operationField,
          category: 'operation',
          required: isRequired, // ✅ CRITICAL: Use combined isRequired (schema OR config)
          options: validOptions.length > 0 ? validOptions : undefined,
          askOrder: 2, // Operations are asked after credentials and resources
          description: `Operation to perform in ${nodeLabel} node`,
        };

        questions.push(question);
        console.log(`[ComprehensiveQuestions] ✅ SUCCESS: Added operation question for ${nodeType}.${operationField}`);
        console.log(`[ComprehensiveQuestions]   Question ID: op_${nodeId}_${operationField}`);
        console.log(`[ComprehensiveQuestions]   Question text: "${question.text}"`);
        console.log(`[ComprehensiveQuestions]   Options count: ${validOptions.length}`);
        console.log(`[ComprehensiveQuestions]   Options: [${validOptions.map(o => o.value).join(', ')}]`);
      } else {
        console.warn(`[ComprehensiveQuestions] ⚠️ SKIPPED operation question for ${nodeType}.${operationField}`);
        console.warn(`[ComprehensiveQuestions]   Reason: isEmpty=${isEmpty}, isRequired=${isRequired}`);
        console.warn(`[ComprehensiveQuestions]   Condition: isEmpty || isRequired = ${isEmpty || isRequired}`);
        console.warn(`[ComprehensiveQuestions]   Current value: "${operationValue}"`);
      }
    } else {
      console.warn(`[ComprehensiveQuestions] ⚠️ Operation field variable found but field not in allFields`);
      console.warn(`[ComprehensiveQuestions]   allFields: [${allFields.join(', ')}]`);
    }
  } else {
    console.log(`[ComprehensiveQuestions] ℹ️ ${nodeType} does not have an operation field`);
    console.log(`[ComprehensiveQuestions]   allFields checked: [${allFields.join(', ')}]`);
  }

  console.log(`[ComprehensiveQuestions] 📊 Operation questions generated: ${questions.length} for ${nodeType}`);
  return questions;
}

/**
 * Generate configuration questions for other required fields
 */
function generateConfigurationQuestions(
  node: WorkflowNode,
  nodeType: string,
  nodeId: string,
  nodeLabel: string,
  config: Record<string, any>,
  schema: any,
  answeredFields: Record<string, any>
): ComprehensiveNodeQuestion[] {
  const questions: ComprehensiveNodeQuestion[] = [];

  // Use node-question-order system if available
  const questionConfig = getQuestionConfig(nodeType);
  if (questionConfig) {
    const orderedQuestions = getOrderedQuestions(nodeType, answeredFields);
    
    for (const qDef of orderedQuestions) {
      // Skip if already asked (credential or operation)
      if (qDef.type === 'credential' || qDef.field.toLowerCase().includes('operation')) {
        continue;
      }

      // Check if field is already populated
      const fieldValue = config[qDef.field];
      // ✅ FIX: Use universal isEmpty check
      const isEmpty = isEmptyValue(fieldValue);

      // ✅ ARCHITECTURAL FIX: Configuration fields should NOT be asked - they're AI-generated
      // Only credentials are asked. This check should never be reached if categories=['credential'] is used
      // But keeping for backward compatibility if someone explicitly requests configuration questions
      const shouldAsk = isEmpty && (qDef.required || qDef.askOrder >= 2);
      
      if (shouldAsk) {
        // ✅ ARCHITECTURAL REFACTOR: Filter out JSON template expression options
        // AI Input Resolver will generate inputs dynamically - no manual JSON selection
        let validOptions: Array<{ label: string; value: string }> | undefined = undefined;
        if (qDef.options && qDef.options.length > 0) {
          validOptions = qDef.options
            .filter(opt => {
              if (!opt) return false;
              const optValue = typeof opt === 'string' ? opt : opt.value;
              // Filter out any options containing {{$json.*}} template expressions
              if (typeof optValue === 'string' && optValue.includes('{{$json.')) {
                return false; // Remove JSON template options
              }
              return true;
            })
            .map(opt => ({
              label: typeof opt === 'string' ? opt : (opt.label || opt.value),
              value: typeof opt === 'string' ? opt : opt.value,
            }));
          
          // If all options were filtered out (were JSON templates), set to undefined
          // This will show "AI will generate this dynamically" in UI
          if (validOptions.length === 0) {
            validOptions = undefined;
          }
        }

        const question: ComprehensiveNodeQuestion = {
          id: `config_${nodeId}_${qDef.field}`,
          text: qDef.prompt || `Please provide ${qDef.field} for "${nodeLabel}"`,
          type: mapQuestionType(qDef.type),
          nodeId,
          nodeType,
          nodeLabel,
          fieldName: qDef.field,
          category: 'configuration',
          required: qDef.required,
          options: validOptions,
          askOrder: qDef.askOrder >= 2 ? qDef.askOrder : 3, // Configuration fields come after operations
          example: qDef.example,
          placeholder: qDef.placeholder,
          description: qDef.description,
        };

        questions.push(question);
        console.log(`[ComprehensiveQuestions] Added configuration question for ${nodeType}.${qDef.field} (required: ${qDef.required}, askOrder: ${qDef.askOrder})`);
      }
    }
  } else {
    // Fallback: Generate questions from schema
    const requiredFields = schema.configSchema.required || [];
    
    for (const fieldName of requiredFields) {
      // Skip credential and operation fields (already handled)
      const fieldLower = fieldName.toLowerCase();
      if (fieldLower.includes('credential') || 
          fieldLower.includes('operation') ||
          fieldLower.includes('apikey') ||
          fieldLower.includes('token')) {
        continue;
      }

      const fieldValue = config[fieldName];
      // ✅ FIX: Use universal isEmpty check
      if (isEmptyValue(fieldValue)) {
        const fieldInfo = schema.configSchema.optional?.[fieldName];
        
        // ✅ ENHANCED: Generate context-aware question text based on field name and node type
        let questionText = `Please provide ${fieldName} for "${nodeLabel}"`;
        const fieldLower = fieldName.toLowerCase();
        
        // Field-specific question text
        if (fieldLower === 'path' || fieldLower === 'url') {
          questionText = `What is the ${fieldName} for "${nodeLabel}"?`;
        } else if (fieldLower === 'cron') {
          questionText = `What is the schedule (cron expression) for "${nodeLabel}"?`;
        } else if (fieldLower === 'formtitle' || fieldLower === 'form_title') {
          questionText = `What is the form title for "${nodeLabel}"?`;
        } else if (fieldLower === 'fields') {
          questionText = `What fields should "${nodeLabel}" have?`;
        } else if (fieldLower === 'message' || fieldLower === 'text' || fieldLower === 'body') {
          questionText = `What ${fieldName} should "${nodeLabel}" send?`;
        } else if (fieldLower === 'to' || fieldLower === 'email') {
          questionText = `What is the recipient email for "${nodeLabel}"?`;
        } else if (fieldLower === 'subject') {
          questionText = `What is the email subject for "${nodeLabel}"?`;
        } else if (fieldLower === 'channel' || fieldLower === 'channelid') {
          questionText = `What is the ${getProviderName(nodeType)} channel for "${nodeLabel}"?`;
        } else if (fieldLower === 'chatid') {
          questionText = `What is the Telegram chat ID for "${nodeLabel}"?`;
        } else if (fieldLower === 'conditions') {
          questionText = `What conditions should "${nodeLabel}" check?`;
        } else if (fieldLower === 'code' || fieldLower === 'javascript') {
          questionText = `What code should "${nodeLabel}" execute?`;
        } else if (fieldLower.includes('id') && !fieldLower.includes('credential')) {
          questionText = `What is the ${fieldName} for "${nodeLabel}"?`;
        } else if (fieldLower.includes('properties') || fieldLower.includes('data')) {
          questionText = `What ${fieldName} should "${nodeLabel}" use?`;
        }

        // Decide input type and options
        let type = determineInputType(fieldName, fieldInfo);
        let options: Array<{ label: string; value: string }> | undefined;

        // ✅ WORLD-CLASS: Only use explicit options for select fields, NOT examples
        // Examples are just hints for users, not selectable dropdown options
        if (type === 'select') {
          if (Array.isArray(fieldInfo?.options) && fieldInfo.options.length > 0) {
            options = fieldInfo.options.map((opt: any) =>
              typeof opt === 'string'
                ? { label: opt, value: opt }
                : { label: opt.label || opt.value, value: opt.value }
            );
          } else {
            // ✅ If no explicit options, change to text input (not select)
            // Don't use examples as dropdown options
            type = 'text';
            console.log(`[ComprehensiveQuestions] ⚠️  Field ${fieldName} marked as select but has no explicit options - changing to text input`);
          }

          // ✅ REMOVED: Don't use examples as options
          // Examples are just hints, not selectable dropdown options
          // Previously: examples were used as fallback options - this is WRONG
          // Now: Only explicit options create dropdowns, otherwise use text input

          // If we ended up with no options, fall back to text input
          if (!options || options.length === 0) {
            type = 'text';
            options = undefined;
          }
        }
        
        const question: ComprehensiveNodeQuestion = {
          id: `config_${nodeId}_${fieldName}`,
          text: questionText,
          type,
          nodeId,
          nodeType,
          nodeLabel,
          fieldName,
          category: 'configuration',
          required: true,
          askOrder: 3, // Configuration fields come after operations
          description: fieldInfo?.description,
          placeholder: fieldInfo?.placeholder || (fieldLower.includes('id') ? `Enter ${fieldName}` : undefined),
          options,
        };

        questions.push(question);
      }
    }
  }

  return questions;
}

/**
 * Get provider name from node type
 */
function getProviderName(nodeType: string): string {
  // ✅ COMPREHENSIVE: Extract provider name from node type for ALL nodes
  const providerMap: Record<string, string> = {
    // Triggers
    'webhook': 'Webhook',
    'chat_trigger': 'Chat',
    'form': 'Form',
    'schedule': 'Schedule',
    'manual_trigger': 'Manual',
    'interval': 'Interval',
    
    // HTTP/AI
    'http_request': 'HTTP Request',
    'ai_agent': 'AI Agent',
    'ai_chat_model': 'AI Chat Model',
    
    // Logic
    'if_else': 'If/Else',
    'switch': 'Switch',
    'set_variable': 'Set Variable',
    'function': 'Function',
    'merge': 'Merge',
    'wait': 'Wait',
    'limit': 'Limit',
    'aggregate': 'Aggregate',
    'sort': 'Sort',
    'javascript': 'JavaScript',
    'code': 'Code',
    'function_item': 'Function Item',
    'noop': 'NoOp',
    
    // CRM/Productivity
    'hubspot': 'HubSpot',
    'zoho_crm': 'Zoho CRM',
    'zoho': 'Zoho CRM',
    'salesforce': 'Salesforce',
    'pipedrive': 'Pipedrive',
    'notion': 'Notion',
    'airtable': 'Airtable',
    'clickup': 'ClickUp',
    'click_up': 'ClickUp',
    
    // Communication
    'google_gmail': 'Gmail',
    'gmail': 'Gmail',
    'slack_message': 'Slack',
    'slack': 'Slack',
    'telegram': 'Telegram',
    'outlook': 'Outlook',
    'google_calendar': 'Google Calendar',
    'calendar': 'Calendar',
    'email': 'Email',
    
    // Social
    'linkedin': 'LinkedIn',
    'github': 'GitHub',
    'whatsapp_cloud': 'WhatsApp',
    'whatsapp': 'WhatsApp',
    'instagram': 'Instagram',
    'facebook': 'Facebook',
    'twitter': 'Twitter',
    'youtube': 'YouTube',
    
    // Google Services
    'google_sheets': 'Google Sheets',
    'google_doc': 'Google Docs',
    'google_docs': 'Google Docs',
    'google_drive': 'Google Drive',
    'google_contacts': 'Google Contacts',
    'google_tasks': 'Google Tasks',
    'google_bigquery': 'BigQuery',
    
    // Other
    'discord': 'Discord',
    'twilio': 'Twilio',
    'stripe': 'Stripe',
    'shopify': 'Shopify',
  };

  const normalized = nodeType.toLowerCase().replace(/_/g, '');
  for (const [key, value] of Object.entries(providerMap)) {
    const keyNormalized = key.toLowerCase().replace(/_/g, '');
    if (normalized.includes(keyNormalized) || normalized === keyNormalized) {
      return value;
    }
  }

  // Default: capitalize first letter and replace underscores with spaces
  return nodeType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Map question type from node-question-order to comprehensive format
 */
function mapQuestionType(type: string): string {
  const typeMap: Record<string, string> = {
    'string': 'text',
    'number': 'number',
    'boolean': 'select',
    'select': 'select',
    'email': 'text',
    'json': 'textarea',
    'code': 'textarea',
    'datetime': 'text',
    'credential': 'credential',
  };

  return typeMap[type] || 'text';
}

/**
 * Determine input type from field name and info
 * ✅ WORLD-CLASS: Only use explicit options for dropdowns, not examples
 * URLs, API keys, spreadsheet IDs, etc. should ALWAYS be text inputs
 */
function determineInputType(fieldName: string, fieldInfo?: any): string {
  // If schema explicitly marks this as array/object, use JSON editor rather than select
  // (e.g. loop.items, fields configs, generic data payloads)
  if (fieldInfo?.type === 'array' || fieldInfo?.type === 'object') {
    return 'json';
  }

  const fieldLower = fieldName.toLowerCase();
  
  // ✅ WORLD-CLASS: Identify fields that MUST be text input (user-provided values)
  // These should NEVER be dropdowns, even if they have examples or options
  const isUserProvidedTextField = 
    fieldLower.includes('url') || // webhookUrl, apiUrl, baseUrl, endpoint, etc.
    fieldLower.includes('endpoint') ||
    (fieldLower.includes('api') && (fieldLower.includes('key') || fieldLower.includes('token'))) || // apiKey, api_key, apiToken
    fieldLower.includes('spreadsheet') || // spreadsheetId
    fieldLower.includes('table') && fieldLower.includes('name') || // tableName
    fieldLower.includes('file') && fieldLower.includes('name') || // fileName
    fieldLower.includes('database') && fieldLower.includes('name') || // databaseName
    (fieldLower.includes('id') && !fieldLower.includes('credential')); // Any ID field (but not credentialId)
  
  if (isUserProvidedTextField) {
    return 'text'; // ✅ Force text input for user-provided fields
  }

  // ✅ WORLD-CLASS: Only use explicit options (not examples) for dropdowns
  // Examples are just hints for users, not selectable dropdown options
  // Only operations/resources with explicit options should be dropdowns
  if (fieldInfo?.options && Array.isArray(fieldInfo.options) && fieldInfo.options.length > 0) {
    // Check if this is an operation/resource field (should be dropdown)
    const isOperationOrResourceField = 
      fieldLower.includes('operation') ||
      fieldLower.includes('resource') ||
      fieldLower.includes('action');
    
    if (isOperationOrResourceField) {
      return 'select'; // ✅ Use dropdown for operations/resources with explicit options
    }
  }

  // Default to text for everything else
  if (fieldLower.includes('email')) {
    return 'text';
  }
  if (fieldLower.includes('message') || fieldLower.includes('text') || fieldLower.includes('body') || fieldLower.includes('content')) {
    return 'textarea';
  }
  if (fieldLower.includes('properties') || fieldLower.includes('data') || fieldLower.includes('json')) {
    return 'json'; // JSON input with proper formatting
  }

  return 'text';
}

/**
 * Format JSON field value properly
 * Ensures JSON fields are properly formatted and arranged
 */
export function formatJsonFieldValue(value: any, fieldName: string): any {
  if (value === null || value === undefined) {
    return value;
  }

  // If it's already a properly formatted object/array, return as-is
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    // Ensure proper JSON structure
    return JSON.parse(JSON.stringify(value));
  }

  // If it's a string, try to parse as JSON
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      // Re-stringify to ensure proper formatting
      return parsed;
    } catch (e) {
      // If not valid JSON, return as string
      return value;
    }
  }

  return value;
}
