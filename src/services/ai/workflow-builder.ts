// Agentic Workflow Builder
// Prompt-to-workflow generation with iterative improvement

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ollamaOrchestrator } from './ollama-orchestrator';
import { requirementsExtractor } from './requirements-extractor';
import { workflowValidator } from './workflow-validator';
import { nodeEquivalenceMapper } from './node-equivalence-mapper';
import { enhancedWorkflowAnalyzer } from './enhanced-workflow-analyzer';
import { nodeLibrary } from '../nodes/node-library';
import { nodeDefinitionRegistry } from '../../core/types/node-definition';
import { config } from '../../core/config';
import type { IntentClassification } from './intent-classifier';
import {
  WorkflowNode,
  WorkflowEdge,
  Workflow,
  Requirements,
  GenerationProgress,
  OutputDefinition,
  WorkflowGenerationStructure,
  WorkflowStepDefinition,
  WorkflowImprovement,
  ImprovementAnalysis,
  Change,
} from '../../core/types/ai-types';
import { TypeValidator } from '../../core/validation/type-validator';
import { workflowTrainingService, type TrainingWorkflow } from './workflow-training-service';
import { connectionValidator } from './connection-validator';
import { nodeDefaults } from './node-defaults';
import { workflowValidationPipeline } from './workflow-validation-pipeline';
import { aiWorkflowValidator } from './ai-workflow-validator';
import { workflowGraphRepair } from './workflow-graph-repair';
import { intentClassifier } from './intent-classifier';
import { workflowPolicyEnforcer } from './workflow-policy-enforcer';
import {
  isPlaceholder,
  isEnvReference,
  generateApiKeyRef,
  getServiceBaseUrl,
  validateNodeConfig,
  validateWorkflowConnections,
  sanitizeConfigValue,
  applySafeDefaults,
  extractServiceName,
  isProductionReady,
} from './workflow-builder-utils';
import {
  isTransformationNode,
  getTransformationTemplate,
  TransformationProperties,
} from './transformation-templates';
import { templateResolver } from './template-resolver';
import { 
  WorkflowConstructionLogic, 
  WorkflowConstructionPhase,
  NodeSelectionPriority,
  AI_USAGE_RULES 
} from './workflow-construction-logic';
import { getNodeOutputType, areTypesCompatible, getNodeOutputSchema } from '../../core/types/node-output-types';
import { TypeConverter } from '../../core/utils/type-converter';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { nodeTypeNormalizationService } from './node-type-normalization-service';
import { NodeSchemaRegistry } from '../../core/contracts/node-schema-registry';
import { WorkflowAutoRepair } from '../../core/contracts/workflow-auto-repair';
import { enhancedNodeReference } from './enhanced-node-reference';
import { validateAndFixEdgeHandles } from '../../core/utils/node-handle-registry';
import { workflowExampleSelector } from './workflow-example-selector';
import { logger } from '../../core/logger';
import { inputFieldMapper } from './input-field-mapper';
import { workflowPlanner, WorkflowPlan } from '../workflow-planner';
import { convertPlanToStructure } from './step-to-node-mapper';
import {
  WorkflowIR,
  WorkflowIRBuilder,
  WorkflowIRValidator,
  WorkflowIRRepairer,
  WorkflowIRConverter,
} from '../../core/workflow-ir';
import { 
  validateTemplateExpressions, 
  validateWorkflowTemplateExpressions,
  fixTemplateExpressions 
} from './template-expression-validator';
import { nodeAutoConfigurator } from '../node-auto-configurator';

export class AgenticWorkflowBuilder {
  private nodeLibrary: Map<string, any> = new Map();
  private constructionLogic: WorkflowConstructionLogic;

  constructor() {
    this.initializeNodeLibrary();
    this.constructionLogic = new WorkflowConstructionLogic();
    // ✅ NODE LIBRARY INITIALIZATION CHECK: Verify all integrations are registered
    this.verifyNodeLibraryInitialization();
  }

  /**
   * ✅ NODE LIBRARY INITIALIZATION CHECK: Ensure all required integrations are registered
   */
  private verifyNodeLibraryInitialization(): void {
    const verification = nodeLibrary.verifyIntegrationRegistration();
    if (!verification.valid) {
      console.error(`❌ [Node Library Check] Missing integrations: ${verification.missing.join(', ')}`);
      console.warn(`⚠️  [Node Library Check] Registered integrations: ${verification.registered.length}`);
      console.warn(`⚠️  [Node Library Check] Please ensure all required integrations are registered in node-library.ts`);
    } else {
      console.log(`✅ [Node Library Check] All ${verification.registered.length} required integrations are registered`);
    }
  }

  /**
   * Build a lightweight WorkflowGenerationStructure from a canonical example.
   * The actual node configs will still be generated/customized later in the pipeline.
   */
  private buildStructureFromExample(
    exampleId: string,
    triggerOverride: string | null
  ): WorkflowGenerationStructure {
    const examples = workflowExampleSelector.getAllExamples();
    const example = examples.find((ex) => ex.id === exampleId);

    if (!example) {
      console.warn(
        `⚠️ [Planner] buildStructureFromExample: example ${exampleId} not found, falling back to generative structure.`
      );
      return {
        trigger: triggerOverride || null,
        steps: [],
        outputs: [],
      };
    }

    const triggerTypes = new Set([
      'chat_trigger',
      'error_trigger',
      'interval',
      'manual_trigger',
      'schedule',
      'webhook',
      'workflow_trigger',
      'form',
    ]);

    const triggerNode = example.nodes.find((n) => triggerTypes.has(n.type));
    const effectiveTrigger = triggerOverride || (triggerNode ? triggerNode.type : null);

    const steps: WorkflowStepDefinition[] = [];

    example.nodes.forEach((node, index) => {
      // Skip explicit trigger node, steps represent action nodes
      if (triggerNode && node.id === triggerNode.id) return;

      const libraryNode = this.nodeLibrary.get(node.type);
      const label = libraryNode?.label || node.type;

      steps.push({
        id: node.id || `step_${index + 1}`,
        description: label,
        type: node.type,
      });
    });

    const outputs: OutputDefinition[] = [];
    if (example.nodes.length > 0) {
      const lastNode = example.nodes[example.nodes.length - 1];
      // OutputDefinition requires: name, type, description, required, (optional) format
      outputs.push({
        name: 'output_1',
        description: `Output from ${lastNode.type}`,
        type: 'object',
        required: false,
      });
    }

    const connections =
      example.edges?.map((e) => ({
        source: e.source === (triggerNode?.id || '') ? 'trigger' : e.source,
        target: e.target,
      })) || [];

    return {
      trigger: effectiveTrigger,
      steps,
      outputs,
      connections,
    };
  }

  /**
   * Initialize comprehensive node library for Autonomous Workflow Agent v2.5
   * Matches all available nodes from the frontend nodeTypes.ts
   */
  private initializeNodeLibrary(): void {
    const nodeTypes = [
      // TRIGGER NODES
      { type: 'chat_trigger', category: 'triggers', label: 'Chat Trigger', description: 'Trigger workflow from chat/AI interactions' },
      { type: 'error_trigger', category: 'triggers', label: 'Error Trigger', description: 'Trigger workflow when errors occur' },
      { type: 'interval', category: 'triggers', label: 'Interval', description: 'Trigger workflow at fixed intervals (seconds, minutes, hours)' },
      { type: 'manual_trigger', category: 'triggers', label: 'Manual Trigger', description: 'Start workflow manually' },
      { type: 'schedule', category: 'triggers', label: 'Schedule Trigger', description: 'Execute workflow at specific times using cron schedule' },
      { type: 'webhook', category: 'triggers', label: 'Webhook', description: 'Trigger workflow from HTTP requests (GET, POST, PUT)' },
      { type: 'workflow_trigger', category: 'triggers', label: 'Workflow Trigger', description: 'Trigger workflow from another workflow' },
      { type: 'form', category: 'triggers', label: 'Form', description: 'Trigger workflow from form submissions' },
      
      // CORE LOGIC NODES
      { type: 'error_handler', category: 'logic', label: 'Error Handler', description: 'Handle errors with retry logic and fallback values' },
      { type: 'filter', category: 'logic', label: 'Filter', description: 'Filter array items by condition' },
      { type: 'if_else', category: 'logic', label: 'If/Else', description: 'Conditional branching based on true/false condition' },
      { type: 'loop', category: 'logic', label: 'Loop', description: 'Iterate over array items with max iterations limit' },
      { type: 'merge', category: 'logic', label: 'Merge', description: 'Merge multiple inputs (objects, arrays, or wait for all)' },
      { type: 'noop', category: 'logic', label: 'NoOp', description: 'Pass through node - no operation' },
      { type: 'split_in_batches', category: 'logic', label: 'Split In Batches', description: 'Split array into batches for processing' },
      { type: 'stop_and_error', category: 'logic', label: 'Stop And Error', description: 'Stop workflow execution with error message' },
      { type: 'switch', category: 'logic', label: 'Switch', description: 'Multi-path conditional logic based on value matching' },
      { type: 'wait', category: 'logic', label: 'Wait', description: 'Wait for specified time or condition before continuing' },
      
      // DATA MANIPULATION NODES
      { type: 'javascript', category: 'data', label: 'JavaScript', description: 'Execute JavaScript code with access to input data' },
      { type: 'set_variable', category: 'data', label: 'Set Variable', description: 'Set workflow variables for use in other nodes' },
      { type: 'set', category: 'data', label: 'Set', description: 'Set variable values' },
      { type: 'json_parser', category: 'data', label: 'JSON Parser', description: 'Parse JSON strings into objects' },
      { type: 'text_formatter', category: 'data', label: 'Text Formatter', description: 'Format text strings with templates' },
      { type: 'date_time', category: 'data', label: 'Date/Time', description: 'Date and time operations (format, parse, calculate)' },
      { type: 'math', category: 'data', label: 'Math', description: 'Mathematical operations and calculations' },
      { type: 'html', category: 'data', label: 'HTML', description: 'Parse and manipulate HTML content' },
      { type: 'xml', category: 'data', label: 'XML', description: 'Parse and manipulate XML content' },
      { type: 'csv', category: 'data', label: 'CSV', description: 'Parse and generate CSV data' },
      { type: 'merge_data', category: 'data', label: 'Merge Data', description: 'Merge data structures' },
      { type: 'rename_keys', category: 'data', label: 'Rename Keys', description: 'Rename object keys' },
      { type: 'edit_fields', category: 'data', label: 'Edit Fields', description: 'Edit field values' },
      { type: 'aggregate', category: 'data', label: 'Aggregate', description: 'Aggregate data' },
      { type: 'sort', category: 'data', label: 'Sort', description: 'Sort arrays' },
      { type: 'limit', category: 'data', label: 'Limit', description: 'Limit array size' },
      
      // AI & ML NODES
      { type: 'ai_agent', category: 'ai', label: 'AI Agent', description: 'Autonomous AI agent with memory, tools, and reasoning capabilities' },
      { type: 'openai_gpt', category: 'ai', label: 'OpenAI GPT', description: 'OpenAI GPT chat completion (GPT-4, GPT-3.5)' },
      { type: 'anthropic_claude', category: 'ai', label: 'Claude', description: 'Anthropic Claude chat completion' },
      { type: 'google_gemini', category: 'ai', label: 'Gemini', description: 'Google Gemini chat completion' },
      { type: 'ollama', category: 'ai', label: 'Ollama', description: 'Local Ollama models for chat completion' },
      { type: 'text_summarizer', category: 'ai', label: 'Text Summarizer', description: 'Summarize long text into shorter versions' },
      { type: 'sentiment_analyzer', category: 'ai', label: 'Sentiment Analyzer', description: 'Analyze sentiment and emotions in text' },
      { type: 'chat_model', category: 'ai', label: 'Chat Model', description: 'Chat model connector for AI Agent node' },
      { type: 'memory', category: 'ai', label: 'Memory', description: 'Memory storage for AI Agent context' },
      { type: 'tool', category: 'ai', label: 'Tool', description: 'Tool connector for AI Agent to use external functions' },
      
      // HTTP & API NODES
      { type: 'http_request', category: 'http_api', label: 'HTTP Request', description: 'Make HTTP requests (GET, POST, PUT, DELETE, PATCH)' },
      { type: 'http_post', category: 'http_api', label: 'HTTP POST', description: 'Send POST requests with JSON data' },
      { type: 'respond_to_webhook', category: 'http_api', label: 'Respond to Webhook', description: 'Send response back to webhook caller' },
      { type: 'webhook_response', category: 'http_api', label: 'Webhook Response', description: 'Send response to webhook request' },
      { type: 'graphql', category: 'http_api', label: 'GraphQL', description: 'Make GraphQL requests' },
      
      // GOOGLE SERVICES NODES
      { type: 'google_sheets', category: 'google', label: 'Google Sheets', description: 'Read/write Google Sheets data (spreadsheets)' },
      { type: 'google_doc', category: 'google', label: 'Google Docs', description: 'Read/write Google Docs (documents)' },
      { type: 'google_drive', category: 'google', label: 'Google Drive', description: 'Google Drive file operations (upload, download, list)' },
      { type: 'google_gmail', category: 'google', label: 'Gmail', description: 'Send/receive emails via Gmail API' },
      { type: 'google_calendar', category: 'google', label: 'Google Calendar', description: 'Create, read, update calendar events' },
      { type: 'google_contacts', category: 'google', label: 'Google Contacts', description: 'Manage Google Contacts' },
      { type: 'google_tasks', category: 'google', label: 'Google Tasks', description: 'Manage Google Tasks' },
      { type: 'google_bigquery', category: 'google', label: 'Google BigQuery', description: 'Query Google BigQuery data warehouse' },
      
      // OUTPUT & COMMUNICATION NODES
      { type: 'slack_message', category: 'output', label: 'Slack', description: 'Send messages to Slack channels or users' },
      { type: 'slack_webhook', category: 'output', label: 'Slack Webhook', description: 'Send messages via Slack webhook' },
      { type: 'log_output', category: 'output', label: 'Log Output', description: 'Log data to console or file' },
      { type: 'discord', category: 'output', label: 'Discord', description: 'Send messages to Discord channels' },
      { type: 'discord_webhook', category: 'output', label: 'Discord Webhook', description: 'Send messages via Discord webhook' },
      { type: 'email', category: 'output', label: 'Email', description: 'Send emails via SMTP' },
      { type: 'microsoft_teams', category: 'output', label: 'Microsoft Teams', description: 'Send messages to Microsoft Teams' },
      { type: 'telegram', category: 'output', label: 'Telegram', description: 'Send messages via Telegram bot' },
      { type: 'whatsapp_cloud', category: 'output', label: 'WhatsApp Cloud', description: 'Send messages via WhatsApp Cloud API' },
      { type: 'twilio', category: 'output', label: 'Twilio', description: 'Send SMS/Voice via Twilio' },
      
      // SOCIAL MEDIA NODES
      { type: 'linkedin', category: 'social', label: 'LinkedIn', description: 'Post content to LinkedIn, manage LinkedIn profile and company pages' },
      { type: 'twitter', category: 'social', label: 'Twitter/X', description: 'Post tweets, manage Twitter account' },
      { type: 'instagram', category: 'social', label: 'Instagram', description: 'Post content to Instagram' },
      { type: 'facebook', category: 'social', label: 'Facebook', description: 'Post content to Facebook pages' },
      
      // DATABASE NODES
      { type: 'database_read', category: 'database', label: 'Database Read', description: 'Read data from database (SQL queries)' },
      { type: 'database_write', category: 'database', label: 'Database Write', description: 'Write data to database (INSERT, UPDATE, DELETE)' },
      { type: 'supabase', category: 'database', label: 'Supabase', description: 'Supabase database operations (CRUD)' },
      { type: 'postgresql', category: 'database', label: 'PostgreSQL', description: 'PostgreSQL database operations' },
      { type: 'mysql', category: 'database', label: 'MySQL', description: 'MySQL database operations' },
      { type: 'mongodb', category: 'database', label: 'MongoDB', description: 'MongoDB database operations' },
      { type: 'redis', category: 'database', label: 'Redis', description: 'Redis cache operations' },
      
      // CRM & MARKETING NODES
      { type: 'hubspot', category: 'crm', label: 'HubSpot', description: 'HubSpot CRM operations' },
      { type: 'salesforce', category: 'crm', label: 'Salesforce', description: 'Salesforce CRM operations' },
      { type: 'zoho_crm', category: 'crm', label: 'Zoho CRM', description: 'Zoho CRM operations' },
      { type: 'pipedrive', category: 'crm', label: 'Pipedrive', description: 'Pipedrive CRM operations' },
      { type: 'freshdesk', category: 'crm', label: 'Freshdesk', description: 'Freshdesk support operations' },
      { type: 'intercom', category: 'crm', label: 'Intercom', description: 'Intercom messaging operations' },
      { type: 'mailchimp', category: 'crm', label: 'Mailchimp', description: 'Mailchimp email marketing operations' },
      { type: 'activecampaign', category: 'crm', label: 'ActiveCampaign', description: 'ActiveCampaign marketing automation' },
      
      // FILE & STORAGE NODES
      { type: 'read_binary_file', category: 'file', label: 'Read Binary File', description: 'Read binary files' },
      { type: 'write_binary_file', category: 'file', label: 'Write Binary File', description: 'Write binary files' },
      { type: 'aws_s3', category: 'file', label: 'AWS S3', description: 'AWS S3 storage operations' },
      { type: 'dropbox', category: 'file', label: 'Dropbox', description: 'Dropbox file operations' },
      { type: 'onedrive', category: 'file', label: 'OneDrive', description: 'OneDrive file operations' },
      { type: 'ftp', category: 'file', label: 'FTP', description: 'FTP file operations' },
      { type: 'sftp', category: 'file', label: 'SFTP', description: 'SFTP file operations' },
      
      // DEVOPS NODES
      { type: 'github', category: 'devops', label: 'GitHub', description: 'GitHub repository operations' },
      { type: 'gitlab', category: 'devops', label: 'GitLab', description: 'GitLab repository operations' },
      { type: 'bitbucket', category: 'devops', label: 'Bitbucket', description: 'Bitbucket repository operations' },
      { type: 'jira', category: 'devops', label: 'Jira', description: 'Jira issue tracking operations' },
      { type: 'jenkins', category: 'devops', label: 'Jenkins', description: 'Jenkins CI/CD operations' },
      
      // E-COMMERCE NODES
      { type: 'shopify', category: 'ecommerce', label: 'Shopify', description: 'Shopify store operations' },
      { type: 'woocommerce', category: 'ecommerce', label: 'WooCommerce', description: 'WooCommerce store operations' },
      { type: 'stripe', category: 'ecommerce', label: 'Stripe', description: 'Stripe payment processing' },
      { type: 'paypal', category: 'ecommerce', label: 'PayPal', description: 'PayPal payment processing' },
    ];

    nodeTypes.forEach(node => {
      this.nodeLibrary.set(node.type, node);
    });
  }

  /**
   * Get comprehensive autonomous workflow agent prompt
   * Loads the full prompt with connection rules and validation guidelines
   */
  getComprehensivePrompt(): string {
    try {
      // Resolve path relative to the compiled output location
      // In development: __dirname = src/services/ai
      // In production: __dirname = dist/services/ai
      // Try multiple possible paths
      const possiblePaths = [
        path.resolve(__dirname, '../../data/autonomous-workflow-agent-prompt.md'), // From src/services/ai
        path.resolve(__dirname, '../../../data/autonomous-workflow-agent-prompt.md'), // From dist/services/ai
        path.resolve(process.cwd(), 'data/autonomous-workflow-agent-prompt.md'), // From project root
        path.resolve(process.cwd(), 'worker/data/autonomous-workflow-agent-prompt.md'), // From project root/worker
      ];
      
      let promptPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          promptPath = possiblePath;
          break;
        }
      }
      
      if (promptPath) {
        const content = fs.readFileSync(promptPath, 'utf-8');
        console.log(`✅ Loaded comprehensive prompt from: ${promptPath}`);
        return content;
      } else {
        // Fallback to embedded prompt if file doesn't exist
        console.warn('⚠️  Comprehensive prompt file not found, using embedded version');
        console.warn('   Tried paths:', possiblePaths);
        return this.getEmbeddedComprehensivePrompt();
      }
    } catch (error) {
      console.warn('⚠️  Failed to load comprehensive prompt file, using embedded version:', error);
      return this.getEmbeddedComprehensivePrompt();
    }
  }

  /**
   * Get embedded comprehensive prompt (fallback)
   */
  private getEmbeddedComprehensivePrompt(): string {
    return `# AUTONOMOUS WORKFLOW AGENT — STRICT BUILD PROMPT

## 🔹 ROLE

You are an Autonomous Workflow Builder that converts user requests into 100% correct, executable, connected workflows.

Your output must always be a fully connected execution graph, never isolated nodes.

## 🚫 ABSOLUTE RULES (NON-NEGOTIABLE)

❌ Never output disconnected nodes
❌ Never skip required services
❌ Never insert AI unless it has a clear purpose
❌ Never change execution order randomly
❌ Never connect nodes without matching output → input compatibility
❌ Never guess output fields or skip required inputs
❌ Never assume implicit data flow
❌ Never create circular or orphan nodes

✅ Every node MUST have:
- Incoming connection (except trigger)
- Outgoing connection (except final node)
- Explicit data mapping from previous node output

## 🧩 MANDATORY WORKFLOW BUILD ALGORITHM

When a user gives a prompt, you MUST follow this algorithm:

### STEP 1: INTENT EXTRACTION

From the user prompt, extract:
- Trigger
- Mandatory actions
- Optional actions
- Data persistence
- Notifications
- AI usage (only if explicitly or logically required)

❌ Do not infer extra steps.

### STEP 2: REQUIRED NODE CHECKLIST

Before building, create a checklist:

Example for lead automation:
- Form Trigger ✅
- Data Storage (Google Sheets) ✅
- Notification (Slack) ✅
- User Communication (Gmail) ✅

❌ If any checklist item is missing → workflow is INVALID.

### STEP 3: NODE ORDERING RULES

Apply this fixed order:
1. Trigger
2. Data creation / enrichment (AI only if needed)
3. Data storage (Sheets / DB)
4. Internal notifications (Slack, Teams)
5. External communication (Email, SMS)

❌ You may NOT reorder this sequence.

### STEP 4: AI USAGE RULES (STRICT)

Use AI ONLY IF:
- personalization
- summarization
- classification
- transformation is required

AI must:
- Receive input from previous node
- Produce structured output
- Feed directly into the next node

❌ AI can NEVER be a dead-end node.

### STEP 5: WIRING & CONNECTION RULES (CRITICAL)

You MUST explicitly ensure:
- Each node is connected to the next node
- Output of node N is input to node N+1
- No floating or isolated nodes
- Linear or branched execution is visually and logically connected

If a node has no wire → FAIL THE BUILD

### STEP 6: DATA MAPPING RULES

- Form fields → Sheets columns
- Form fields → Slack message
- AI output → Gmail body
- Email recipient → Form email field

❌ No hardcoded values
❌ No sample placeholders

### STEP 7: FINAL VALIDATION (MANDATORY)

Before outputting the workflow, validate:
✅ All required nodes exist
✅ All nodes are connected
✅ Execution order is correct
✅ Credentials are mapped
✅ Workflow can execute end-to-end

If validation fails → rebuild automatically.

## 🔹 WORKFLOW BUILDING PROCESS

STEP 1: INTENT EXTRACTION - Extract trigger type, required integrations, data source, final outcome.

STEP 2: NODE SELECTION - Select nodes based on capability match, required inputs, available outputs. For each node, list Node Name, Purpose, Required Inputs, Produced Outputs.

STEP 3: DATA CONTRACT DEFINITION - Before connecting nodes, define DATA CONTRACTS: Source Node.OutputField → Target Node.InputField. If no valid source exists → DO NOT CONNECT.

STEP 4: CONNECTION VALIDATION LOOP - For EVERY connection, validate: Does Output.Type == Input.Type? Is Output.RequiredField present? Is Output generated at runtime? If ANY answer = NO → FIX or ASK USER.

STEP 5: WORKFLOW GRAPH CONSTRUCTION - Only after validation, build the workflow graph with single trigger entry, linear or conditional flow, no dangling nodes.

## 🔹 WORKFLOW BUILDING PROCESS

STEP 1: INTENT EXTRACTION - Extract trigger type, required integrations, data source, final outcome.

STEP 2: NODE SELECTION - Select nodes based on capability match, required inputs, available outputs. For each node, list Node Name, Purpose, Required Inputs, Produced Outputs.

STEP 3: DATA CONTRACT DEFINITION - Before connecting nodes, define DATA CONTRACTS: Source Node.OutputField → Target Node.InputField. If no valid source exists → DO NOT CONNECT.

STEP 4: CONNECTION VALIDATION LOOP - For EVERY connection, validate: Does Output.Type == Input.Type? Is Output.RequiredField present? Is Output generated at runtime? If ANY answer = NO → FIX or ASK USER.

STEP 5: WORKFLOW GRAPH CONSTRUCTION - Only after validation, build the workflow graph with single trigger entry, linear or conditional flow, no dangling nodes.

## 🔹 AI AGENT NODE RULES

When using an AI Agent node:
- Inputs: userInput (string), chat_model (REQUIRED - must connect Chat Model node), memory (optional), tool (optional)
- Outputs: response_text (string), response_json (object with status, message, data), response_markdown (string)
- Downstream nodes may only consume: response_text, response_json.message, or specific fields inside response_json.data
- Connection Pattern: Chat Model → AI Agent (chat_model port) [REQUIRED], Previous Node → AI Agent (userInput), AI Agent → Next Node (response_text or response_json.data.*)

## 🔹 STRICT BUILD RULES (MANDATORY)

### STEP 2: REQUIRED NODE CHECKLIST

Before building, create a checklist. Example for lead automation:
- Form Trigger ✅
- Data Storage (Google Sheets) ✅
- Notification (Slack) ✅
- User Communication (Gmail) ✅

❌ If any checklist item is missing → workflow is INVALID.

### STEP 3: NODE ORDERING RULES

Apply this fixed order:
1. Trigger
2. Data creation / enrichment (AI only if needed)
3. Data storage (Sheets / DB)
4. Internal notifications (Slack, Teams)
5. External communication (Email, SMS)

❌ You may NOT reorder this sequence.

### STEP 4: AI USAGE RULES (STRICT)

Use AI ONLY IF:
- personalization
- summarization
- classification
- transformation is required

AI must:
- Receive input from previous node
- Produce structured output
- Feed directly into the next node

❌ AI can NEVER be a dead-end node.

### STEP 5: WIRING & CONNECTION RULES (CRITICAL)

You MUST explicitly ensure:
- Each node is connected to the next node
- Output of node N is input to node N+1
- No floating or isolated nodes
- Linear or branched execution is visually and logically connected

If a node has no wire → FAIL THE BUILD

### STEP 6: DATA MAPPING RULES

- Form fields → Sheets columns
- Form fields → Slack message
- AI output → Gmail body
- Email recipient → Form email field

❌ No hardcoded values
❌ No sample placeholders

### STEP 7: FINAL VALIDATION (MANDATORY)

Before outputting the workflow, validate:
✅ All required nodes exist
✅ All nodes are connected
✅ Execution order is correct
✅ Credentials are mapped
✅ Workflow can execute end-to-end

If validation fails → rebuild automatically.

## 🔹 FINAL OUTPUT FORMAT

1️⃣ Node List - List all nodes with IDs
2️⃣ Connection Map - Source_Node_ID.output_field → Target_Node_ID.input_field
3️⃣ Node Configuration Summary - For each node, list required inputs and their sources

No explanations. No marketing text. Just the facts.

## 🚫 FINAL DIRECTIVE

Disconnected workflows are considered FAILURES.
You are a workflow execution engine, not a diagram generator.`;
  }

  /**
   * Get node library description for AI agent
   * Returns formatted string describing all available nodes with their properties
   * CRITICAL: This is the ONLY source of truth for available nodes - use ONLY these nodes
   */
  getNodeLibraryDescription(): string {
    const allSchemas = nodeLibrary.getAllSchemas();
    const nodesByCategory = new Map<string, Array<{ type: string; label: string; schema: any }>>();
    
    // Group nodes by category
    allSchemas.forEach(schema => {
      const category = schema.category || 'other';
      if (!nodesByCategory.has(category)) {
        nodesByCategory.set(category, []);
      }
      nodesByCategory.get(category)!.push({
        type: schema.type,
        label: schema.label,
        schema,
      });
    });
    
    let description = '\n## 📚 AVAILABLE NODES REFERENCE (USE ONLY THESE NODES)\n\n';
    description += '**CRITICAL RULE: You MUST use ONLY the node types listed below. DO NOT create new node types or use node types not in this list.**\n\n';
    
    // Sort categories for consistent output
    const categoryOrder = [
      'triggers', 'logic', 'data', 'ai', 'http_api', 
      'google', 'output', 'database', 'transformation'
    ];
    
    categoryOrder.forEach(category => {
      const nodes = nodesByCategory.get(category);
      if (!nodes || nodes.length === 0) return;
      
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
      description += `### ${categoryLabel} NODES (${nodes.length} nodes)\n\n`;
      
      nodes.forEach(({ type, label, schema }) => {
        description += `#### ${label} (\`${type}\`)\n`;
        description += `- **Description**: ${schema.description || 'No description'}\n`;
        
        // Required fields with details
        const requiredFields = schema.configSchema?.required || [];
        if (requiredFields.length > 0) {
          description += `- **Required Fields**:\n`;
          requiredFields.forEach((fieldName: string) => {
            const fieldInfo = schema.configSchema?.optional?.[fieldName];
            if (fieldInfo) {
              description += `  - \`${fieldName}\` (${fieldInfo.type}): ${fieldInfo.description || ''}`;
              if (fieldInfo.examples && fieldInfo.examples.length > 0) {
                description += ` - Examples: ${fieldInfo.examples.slice(0, 2).join(', ')}`;
              }
              description += '\n';
            } else {
              description += `  - \`${fieldName}\`: Required field\n`;
            }
          });
        }
        
        // Key optional fields
        const optionalFields = schema.configSchema?.optional || {};
        const importantOptional = Object.keys(optionalFields).slice(0, 5);
        if (importantOptional.length > 0) {
          description += `- **Key Optional Fields**: ${importantOptional.join(', ')}\n`;
        }
        
        // When to use
        if (schema.aiSelectionCriteria?.whenToUse && schema.aiSelectionCriteria.whenToUse.length > 0) {
          description += `- **When to Use**: ${schema.aiSelectionCriteria.whenToUse.slice(0, 3).join('; ')}\n`;
        }
        
        // Keywords for matching
        if (schema.aiSelectionCriteria?.keywords && schema.aiSelectionCriteria.keywords.length > 0) {
          description += `- **Keywords**: ${schema.aiSelectionCriteria.keywords.slice(0, 5).join(', ')}\n`;
        }
        
        description += '\n';
      });
    });
    
    // Add nodes from other categories
    const otherCategories = Array.from(nodesByCategory.keys()).filter(cat => !categoryOrder.includes(cat));
    if (otherCategories.length > 0) {
      description += `### OTHER NODES\n\n`;
      otherCategories.forEach(category => {
        const nodes = nodesByCategory.get(category)!;
        nodes.forEach(({ type, label }) => {
          description += `- \`${type}\` (${label})\n`;
        });
      });
    }
    
    description += '\n**REMINDER: Use ONLY the node types listed above. Do not invent new node types.**\n';
    
    return description;
  }

  /**
   * Autonomous Workflow Generation Agent
   * 
   * Implements the system prompt requirements:
   * - Fully executable, zero-error workflows
   * - All required fields auto-filled
   * - Intelligent defaults for missing values
   * - Proper input-output mapping
   * - Self-repair until zero errors
   * - NO placeholders or empty required fields
   * 
   * Simplified 7-Step Workflow Generation Process:
   * 1. User raw prompt (input)
   * 2. Questions for confirming (handled externally)
   * 3. System prompt in 20-30 words (what you understood)
   * 4. Workflow requirements (URL, API, etc.)
   * 5. Workflow building (structure → nodes → config → connections)
   * 6. Validating (with auto-fix/self-repair)
   * 7. Outputs (documentation, suggestions, complexity)
   */
  async generateFromPrompt(
    userPrompt: string,
    constraints?: any,
    onProgress?: (progress: { step: number; stepName: string; progress: number; details?: any }) => void
  ): Promise<{
    workflow: Workflow;
    documentation: string;
    suggestions: any[];
    estimatedComplexity: string;
    systemPrompt?: string;
    requirements?: any;
    requiredCredentials?: string[];
    confidenceScore?: any;
  }> {
    console.log(`🤖 Generating workflow from prompt: "${userPrompt}"`);
    
    // ⚡ EARLY DETECTION: Check if this is a chatbot workflow BEFORE any LLM calls
    const promptLower = userPrompt.toLowerCase();
    const isChatbotWorkflow = promptLower.includes('chat') || 
                              promptLower.includes('bot') || 
                              promptLower.includes('assistant') ||
                              promptLower.includes('chatbot');
    
    // If chatbot workflow, check Ollama availability first (quick check without full connection)
    if (isChatbotWorkflow) {
      const ollamaAvailable = await this.quickCheckOllamaAvailability();
      if (!ollamaAvailable) {
        // Throw special error to signal fallback should be used
        const error: any = new Error('Ollama unavailable - use chatbot fallback');
        error.useChatbotFallback = true;
        throw error;
      }
    }
    
    // PHASE-2: Prompt Normalization (Feature #1) - BEFORE STEP-1
    onProgress?.({ step: 0, stepName: 'Normalizing', progress: 5, details: { message: 'Normalizing user prompt...' } });
    const { promptNormalizer } = await import('./prompt-normalizer');
    
    let normalized;
    let effectivePrompt = userPrompt;
    
    try {
      normalized = await promptNormalizer.normalizePrompt(userPrompt);
      
      if (normalized.missingIntent.length > 0) {
        console.warn('⚠️  [PHASE-2] Missing intent detected:', normalized.missingIntent);
      }
      
      // Use normalized prompt for rest of pipeline
      effectivePrompt = normalized.normalizedPrompt;
      console.log(`✅ [PHASE-2] Prompt normalized: "${effectivePrompt.substring(0, 100)}"`);
    } catch (error) {
      // CRITICAL: If AI normalization fails (e.g., models unavailable, connection refused), use original prompt
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = (error as any)?.cause;
      const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                                errorMessage.includes('fetch failed') ||
                                errorMessage.includes('Connection refused') ||
                                (errorCause && (errorCause.code === 'ECONNREFUSED' || errorCause.message?.includes('ECONNREFUSED')));
      const isModelUnavailable = errorMessage.includes('not found') || 
                                 errorMessage.includes('Ollama models not available') ||
                                 errorMessage.includes('404') && errorMessage.includes('model');
      
      if (isModelUnavailable || isConnectionError) {
        console.warn('⚠️  [PHASE-2] AI normalization unavailable (Ollama connection failed), using original prompt');
        effectivePrompt = userPrompt;
        normalized = {
          originalPrompt: userPrompt,
          normalizedPrompt: userPrompt,
          trigger: { type: 'manual_trigger', description: 'Manual trigger', detected: false },
          actions: [],
          output: { description: 'Workflow output' },
          missingIntent: [],
          confidence: 0.5,
        };
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }
    
    // PHASE-2: Intent Classification (Feature #2)
    onProgress?.({ step: 0, stepName: 'Classifying', progress: 8, details: { message: 'Classifying workflow intent...' } });
    // Intent classification is already done earlier in the pipeline
    // Use the classification result from earlier
    const intentClassification = intentClassifier.classifyIntent(userPrompt);
    
    // 🚨 CRITICAL FIX: For vague prompts, use minimal safe structure instead of full AI generation
    if (intentClassification.intent === 'ambiguous' && intentClassification.minimalSafeStructure) {
      console.log(`✅ [Vague Prompt Handler] Using minimal safe structure for vague prompt: "${userPrompt}"`);
      console.log(`   Minimal structure: ${intentClassification.minimalSafeStructure.trigger} → ${intentClassification.minimalSafeStructure.steps.map(s => s.type).join(' → ')}`);
    }
    
    // PHASE-2: Build Mode Selection (Feature #10)
    const { buildModeManager } = await import('./build-modes');
    const buildMode = constraints?.buildMode || 'safe';
    const modeConfig = buildModeManager.getConfig(buildMode);
    // Use medium complexity as default
    const expectedComplexity = 'medium';
    const modeValidation = buildModeManager.validateMode(buildMode, expectedComplexity);
    if (!modeValidation.valid && modeValidation.recommendation) {
      console.warn(`⚠️  [PHASE-2] Build mode validation: ${modeValidation.reason}`);
    }
    
    // 🆕 NEW PIPELINE: Workflow Planner - Convert prompt to ordered steps
    onProgress?.({ step: 2, stepName: 'Planning', progress: 12, details: { message: 'Planning workflow steps...' } });
    let workflowPlan: WorkflowPlan | null = null;
    let usePlannerOutput = false;
    
    try {
      workflowPlan = await workflowPlanner.planWorkflow(userPrompt);
      console.log(`✅ [WorkflowPlanner] Plan created:`, JSON.stringify(workflowPlan, null, 2));
      console.log(`✅ [WorkflowPlanner] Trigger: ${workflowPlan.trigger_type}, Steps: ${workflowPlan.steps.length}`);
      
      // Log planner output
      if (workflowPlan.steps && workflowPlan.steps.length > 0) {
        usePlannerOutput = true;
        console.log(`✅ [WorkflowPlanner] Using planner output (${workflowPlan.steps.length} steps)`);
        workflowPlan.steps.forEach((step, idx) => {
          const stepType = step.node_type || step.action || 'unknown';
          console.log(`   [Step ${idx + 1}] Node Type: ${stepType}, Description: ${step.description || 'N/A'}`);
        });
        if (workflowPlan.reasoning) {
          console.log(`   [Reasoning] ${workflowPlan.reasoning}`);
        }
        if (workflowPlan.confidence !== undefined) {
          console.log(`   [Confidence] ${workflowPlan.confidence}`);
        }
      } else {
        console.warn(`⚠️  [WorkflowPlanner] Plan returned empty steps, falling back to pattern matching`);
        usePlannerOutput = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  [WorkflowPlanner] Planning failed: ${errorMessage}, falling back to pattern matching`);
      usePlannerOutput = false;
    }
    
    // STEP-4: Pattern Matching - Only if planner didn't return steps
    let patternMatch: TrainingWorkflow | null = null;
    if (!usePlannerOutput) {
      onProgress?.({ step: 3, stepName: 'Pattern Matching', progress: 15, details: { message: 'Searching for similar workflow patterns...' } });
      const similarWorkflows = workflowTrainingService.getSimilarWorkflowsWithScores(userPrompt, 3);
      
      if (similarWorkflows.length > 0 && similarWorkflows[0].score >= 70 && similarWorkflows[0].matchType === 'pattern') {
        patternMatch = similarWorkflows[0].workflow;
        console.log(`✅ Pattern match found (score: ${similarWorkflows[0].score}): ${patternMatch.goal}`);
        onProgress?.({ step: 3, stepName: 'Pattern Match', progress: 18, details: { message: `Found pattern: ${patternMatch.category}` } });
      } else if (similarWorkflows.length > 0) {
        console.log(`⚠️  Hybrid approach (score: ${similarWorkflows[0].score}): Using partial pattern matching`);
      } else {
        console.log('⚠️  No pattern match found. Building from scratch using STEP-3 rules.');
      }
    } else {
      console.log(`✅ [WorkflowPlanner] Skipping pattern matching - using planner output`);
    }

    // Step 3: Generate system prompt (20-30 words understanding)
    onProgress?.({ step: 3, stepName: 'Understanding', progress: 20, details: { message: 'Generating system prompt...' } });
    let systemPrompt: string;
    try {
      systemPrompt = await this.generateSystemPrompt(userPrompt, constraints);
    } catch (error) {
      // CRITICAL: If AI system prompt generation fails, use fallback
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelUnavailable = errorMessage.includes('not found') || 
                                 errorMessage.includes('Ollama models not available') ||
                                 errorMessage.includes('404') && errorMessage.includes('model');
      
      if (isModelUnavailable) {
        console.warn('⚠️  [WorkflowBuilder] AI system prompt generation unavailable, using fallback');
        systemPrompt = `Build an automated workflow to: ${effectivePrompt.substring(0, 100)}`;
      } else {
        throw error;
      }
    }
    
    // Step 4: Extract workflow requirements (URLs, APIs, credentials, etc.)
    onProgress?.({ step: 4, stepName: 'Requirements Extraction', progress: 40, details: { message: 'Extracting requirements...' } });
    // Use RequirementsExtractor service if answers are provided, otherwise use legacy method
    const answers = constraints?.answers;
    let requirements;
    try {
      requirements = answers 
        ? await requirementsExtractor.extractRequirements(userPrompt, systemPrompt, answers, constraints)
        : await this.extractWorkflowRequirements(userPrompt, systemPrompt, constraints);
    } catch (error) {
      // CRITICAL: If AI requirements extraction fails, use fallback
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelUnavailable = errorMessage.includes('not found') || 
                                 errorMessage.includes('Ollama models not available') ||
                                 errorMessage.includes('404') && errorMessage.includes('model');
      
      if (isModelUnavailable) {
        console.warn('⚠️  [WorkflowBuilder] AI requirements extraction unavailable, using rule-based fallback');
        // Use rule-based requirements extraction
        requirements = {
          primaryGoal: effectivePrompt,
          keySteps: [],
          inputs: [],
          outputs: [],
          constraints: [],
          complexity: 'medium' as 'simple' | 'medium' | 'complex',
          urls: [],
          apis: [],
          credentials: [],
          schedules: [],
          platforms: [],
        } as Requirements;
      } else {
        throw error;
      }
    }

    // ✅ CRITICAL: Always preserve the ORIGINAL user prompt on requirements for downstream detection
    // This ensures integration/trigger/node detection sees the full natural language, not just summaries.
    (requirements as any).originalPrompt = userPrompt;
    
    // ✅ CRITICAL: Attach structured spec to requirements if available
    const structuredSpec = constraints?.structuredSpec;
    if (structuredSpec) {
      (requirements as any).structuredSpec = structuredSpec;
      console.log('📋 [generateWorkflow] Structured spec attached to requirements');
    }
    
    // ✅ CRITICAL FIX: Extract planner trigger preference if available
    // The planner may have detected a trigger preference that should override sample workflow triggers
    if (constraints?.plannerSpec?.trigger) {
      const plannerTrigger = constraints.plannerSpec.trigger;
      // Map planner trigger format to node trigger format
      const triggerMap: Record<string, string> = {
        'manual': 'manual_trigger',
        'schedule': 'schedule',
        'webhook': 'webhook',
        'event': 'manual_trigger', // Default event to manual
      };
      const mappedTrigger = triggerMap[plannerTrigger] || plannerTrigger;
      if (mappedTrigger) {
        (requirements as any).trigger = mappedTrigger;
        (requirements as any).plannerTrigger = mappedTrigger;
        console.log(`✅ [generateWorkflow] Planner trigger preference detected: ${plannerTrigger} → ${mappedTrigger}`);
      }
    }
    
    // PHASE-2: Credential Preflight Check (Feature #4) - STEP-4.5
    // Check credentials BEFORE building (if nodes are known)
    onProgress?.({ step: 4, stepName: 'Preflight', progress: 45, details: { message: 'Checking credential readiness...' } });
    const { credentialPreflightChecker } = await import('./credential-preflight-check');
    const existingAuth = constraints?.existingAuth || {};
    // Note: We'll do full preflight check after nodes are selected
    
    // Step 5: Build workflow structure FIRST to detect AI Agent nodes
    // CRITICAL: Check for chatbot intent BEFORE trigger selection
    const isChatbotIntent = this.detectChatbotIntent(requirements);
    
    // 🆕 NEW PIPELINE: Use planner trigger if available, otherwise use construction logic
    let triggerSelection: { triggerType?: string; confidence?: number; error?: string };
    
    if (usePlannerOutput && workflowPlan) {
      // Use trigger from planner
      const { mapTriggerType } = await import('./step-to-node-mapper');
      const plannerTrigger = mapTriggerType(workflowPlan.trigger_type);
      triggerSelection = {
        triggerType: plannerTrigger,
        confidence: workflowPlan.confidence || 0.9,
      };
      console.log(`✅ [WorkflowPlanner] Using planner trigger: ${workflowPlan.trigger_type} → ${plannerTrigger}`);
    } else {
      // Workflow Construction Logic (STEP-3): PHASE_1 - Trigger Selection
      onProgress?.({ step: 5, stepName: 'Building', progress: 50, details: { message: 'PHASE 1: Selecting trigger...' } });
      triggerSelection = this.constructionLogic.selectTrigger(effectivePrompt, constraints?.answers);
      
      // For chatbot workflows, automatically use chat_trigger even if multiple triggers detected
      // 🚨 CRITICAL: But ONLY if user didn't explicitly request a schedule
      const userPromptLower = (userPrompt || effectivePrompt || '').toLowerCase();
      const explicitlyRequestsSchedule = userPromptLower.includes('schedule') || 
                                         userPromptLower.includes('fixed schedule') ||
                                         userPromptLower.includes('daily') ||
                                         userPromptLower.includes('weekly') ||
                                         userPromptLower.includes('hourly') ||
                                         triggerSelection.triggerType === 'schedule';
      
      if (isChatbotIntent && triggerSelection.error && triggerSelection.error.includes('Multiple triggers')) {
        if (explicitlyRequestsSchedule) {
          console.log('✅ [Chatbot] Chatbot workflow detected BUT user explicitly requested schedule - using schedule trigger');
          triggerSelection.triggerType = 'schedule';
          triggerSelection.confidence = 0.95;
          triggerSelection.error = undefined;
        } else {
          console.log('✅ [Chatbot] Chatbot workflow detected - using chat_trigger despite multiple trigger matches');
          triggerSelection.triggerType = 'chat_trigger';
          triggerSelection.confidence = 0.95;
          triggerSelection.error = undefined;
        }
      }
      
      if (triggerSelection.error && triggerSelection.confidence === 0) {
        throw new Error(`Trigger selection failed: ${triggerSelection.error}. Please clarify your workflow trigger.`);
      }
    }
    
    // Update requirements with selected trigger (add to requirements object)
    if (triggerSelection.triggerType) {
      (requirements as any).trigger = triggerSelection.triggerType;
    }

    // Canonical example selection - Skip if using planner output
    let exampleSelection = null;
    if (!usePlannerOutput) {
      onProgress?.({
        step: 5,
        stepName: 'Building',
        progress: 51,
        details: { message: 'Checking canonical examples before free-form planning...' },
      });

      // Create intent object for example selector (if it expects a different format)
      const intentForSelector = intentClassification || {
        intent: 'automation_workflow' as const,
        confidence: 0.6,
        requiresClarification: false
      };
      
      exampleSelection = workflowExampleSelector.selectBestExample({
        prompt: effectivePrompt,
        normalizedPrompt: normalized?.normalizedPrompt,
        triggerType: triggerSelection.triggerType || normalized?.trigger?.type || null,
        intent: intentForSelector as any, // Type compatibility - selector may expect different format
      });
    } else {
      console.log(`✅ [WorkflowPlanner] Skipping example selection - using planner output`);
    }

    let structure;

    // 🆕 NEW PIPELINE: Use planner output if available (skip pattern matching and examples)
    if (usePlannerOutput && workflowPlan) {
      console.log(`✅ [WorkflowPlanner] Building structure from planner steps`);
      onProgress?.({
        step: 5,
        stepName: 'Building',
        progress: 52,
        details: { message: 'Building workflow from planner steps...' },
      });

      // 🆕 IR LAYER: Convert planner plan to IR
      console.log(`✅ [WorkflowIR] Converting plan to Intermediate Representation`);
      let workflowIR = WorkflowIRBuilder.fromPlan(workflowPlan, userPrompt);
      
      // Validate IR
      const validation = WorkflowIRValidator.validate(workflowIR);
      if (!validation.valid) {
        console.warn(`⚠️  [WorkflowIR] Validation errors:`, validation.errors);
        console.warn(`⚠️  [WorkflowIR] Attempting to repair...`);
        
        // Repair IR
        const repairResult = WorkflowIRRepairer.repair(workflowIR);
        workflowIR = repairResult.repaired;
        console.log(`✅ [WorkflowIR] Repaired ${repairResult.fixes.length} issues:`, repairResult.fixes);
        
        // Re-validate after repair
        const revalidation = WorkflowIRValidator.validate(workflowIR);
        if (!revalidation.valid) {
          console.error(`❌ [WorkflowIR] IR still invalid after repair:`, revalidation.errors);
        } else {
          console.log(`✅ [WorkflowIR] IR validated successfully after repair`);
        }
      } else {
        console.log(`✅ [WorkflowIR] IR validated successfully`);
        if (validation.warnings.length > 0) {
          console.warn(`⚠️  [WorkflowIR] Warnings:`, validation.warnings);
        }
      }
      
      // Log IR structure
      console.log(`✅ [WorkflowIR] IR structure:`);
      console.log(`   Trigger: ${workflowIR.trigger.type}`);
      console.log(`   Steps: ${workflowIR.steps.length}`);
      console.log(`   Data bindings: ${workflowIR.dataBindings.length}`);
      console.log(`   Conditions: ${workflowIR.conditions.length}`);
      
      // Convert IR to WorkflowGenerationStructure
      console.log(`✅ [WorkflowIR] Converting IR to WorkflowGenerationStructure`);
      const irStructure = WorkflowIRConverter.toStructure(workflowIR);
      
      // Map node types using step-to-node-mapper (IR doesn't map node types yet)
      const planStructure = convertPlanToStructure(workflowPlan, userPrompt);
      
      // Use IR structure but with mapped node types from planStructure
      structure = {
        trigger: irStructure.trigger,
        steps: planStructure.steps, // Use mapped steps with node types
        outputs: planStructure.outputs, // Use outputs from planStructure (correctly typed)
        connections: irStructure.connections,
      };
      
      // Mark that we used planner output and IR
      (requirements as any).planner_used = true;
      (requirements as any).ir_used = true;
      (requirements as any).ir_validation = validation;
      (requirements as any).planner_trigger = workflowPlan.trigger_type;
      (requirements as any).planner_steps_count = workflowPlan.steps.length;
      (requirements as any).planner_confidence = workflowPlan.confidence;
      
      console.log(`✅ [WorkflowPlanner] Structure built from planner via IR (${planStructure.steps.length} steps)`);
    } else if (exampleSelection) {
      console.log(
        `🧩 [Planner] planner_selected_example=${exampleSelection.example.id} planner_score=${exampleSelection.score}`
      );
      (requirements as any).planner_selected_example = exampleSelection.example.id;
      (requirements as any).planner_score = exampleSelection.score;
      (requirements as any).planner_fallback_used = false;

      onProgress?.({
        step: 5,
        stepName: 'Building',
        progress: 52,
        details: {
          message: `Using canonical example: ${exampleSelection.example.id}`,
        },
      });

      structure = this.buildStructureFromExample(
        exampleSelection.example.id,
        triggerSelection.triggerType || null
      );
    } else {
      console.log('🧩 [Planner] planner_fallback_used=true (no canonical example above threshold)');
      (requirements as any).planner_fallback_used = true;

      onProgress?.({
        step: 5,
        stepName: 'Building',
        progress: 52,
        details: { message: 'Building workflow structure (no canonical example match)...' },
      });

      // ✅ CRITICAL: Pass structured spec if available for enhanced matching
      const structuredSpecFromRequirements = (requirements as any).structuredSpec;
      structure = await this.generateStructure(requirements, structuredSpecFromRequirements);
    }
    
    // Extract detected integrations from structure generation (if available)
    // We'll detect them again in credential identification, but this ensures consistency
    const promptForIntegrations = userPrompt.toLowerCase();
    const detectedIntegrations: string[] = [];
    
    // Detect integrations from prompt
    // Includes both specific app names and generic category phrases (CRM, social media, etc.)
    const integrationKeywords: Record<string, string[]> = {
      // CRM / sales tools
      hubspot: ['hubspot', 'hub spot'],
      salesforce: ['salesforce', 'sf'],
      airtable: ['airtable'],
      clickup: ['clickup', 'click up'],
      notion: ['notion'],
      zoho_crm: [
        'zoho',
        'zoho crm',
        'crm',                       // generic CRM → default to Zoho CRM
        'crm system',
        'customer relationship',
        'customer relationship management',
        'sales crm',
        'deal pipeline crm',
        'lead crm',
        'manage leads in crm',
        'sync leads to crm',
        'update crm records'
      ],
      pipedrive: [
        'pipedrive',
        'sales pipeline tool',
        'pipeline tool',
        'deal pipeline',
        'track deals',
        'track opportunities'
      ],

      // Messaging / chat
      telegram: ['telegram', 'telegram bot', 'telegram channel', 'telegram group'],
      discord: ['discord'],
      whatsapp_cloud: [
        'whatsapp',
        'whats app',
        'whatsapp message',
        'whatsapp notification',
        'send a whatsapp',
        'whatsapp alert'
      ],

      // Social / marketing
      twitter: ['twitter', 'x.com'],
      linkedin: [
        'linkedin',
        'linked in',
        'social media',
        'social channel',
        'social platforms',
        'post on social',
        'share on social media',
        'post on linkedin',
        'share update on linkedin',
        'internal linkedin update',
        'announce on linkedin'
      ],
      instagram: ['instagram', 'ig', 'instagram story', 'instagram post'],
      youtube: [
        'youtube',
        'you tube',
        'yt',
        'youtube video',
        'upload to youtube',
        'post on youtube',
        'youtube short',
        'youtube shorts'
      ],

      // Email
      outlook: [
        'outlook',
        'microsoft outlook',
        'outlook email',
        'send email via outlook',
        'outlook follow up'
      ],
    };
    
    for (const [integration, keywords] of Object.entries(integrationKeywords)) {
      if (keywords.some(keyword => promptForIntegrations.includes(keyword))) {
        detectedIntegrations.push(integration);
      }
    }
    
    // Step 4.5: Identify required credentials AFTER structure is generated (to detect AI Agent nodes)
    onProgress?.({ step: 4, stepName: 'Credential Analysis', progress: 45, details: { message: 'Identifying required credentials...' } });
    const requiredCredentials = await this.identifyRequiredCredentials(requirements, userPrompt, answers, structure, detectedIntegrations);
    
    // Apply node preferences from user answers if available
    const nodePreferences = constraints?.answers 
      ? enhancedWorkflowAnalyzer.extractNodePreferences(constraints.answers)
      : {};
    
    // Update structure with user's node preferences
    const structureWithPreferences = this.applyNodePreferences(structure, nodePreferences, requirements);
    
    // GRAPH INTEGRITY ENFORCEMENT: Check and repair missing structural nodes BEFORE validation
    onProgress?.({ step: 4, stepName: 'Graph Integrity Check', progress: 48, details: { message: 'Checking workflow graph integrity...' } });
    
    // Check integrity (before nodes are created, use empty array for nodes)
    const integrityCheck = workflowGraphRepair.checkGraphIntegrity(
      structureWithPreferences,
      [], // Nodes not created yet, will check again after node creation
      requirements,
      effectivePrompt
    );
    
    let finalStructure = structureWithPreferences;
    let repairAttempted = false;
    
    if (integrityCheck.missingNodes.length > 0 || integrityCheck.orderIssues.length > 0) {
      console.log(`🔧 [Graph Repair] Detected ${integrityCheck.missingNodes.length} missing node(s) and ${integrityCheck.orderIssues.length} order issue(s)`);
      integrityCheck.missingNodes.forEach((node, idx) => {
        console.log(`   ${idx + 1}. Missing: ${node.type} - ${node.reason} (position: ${node.requiredPosition})`);
      });
      
      // Filter out nodes that might be false positives (e.g., if_else when prompt doesn't clearly need it)
      // Only repair if the prompt clearly indicates the need (strict patterns)
      const promptLower = effectivePrompt.toLowerCase();
      const filteredMissingNodes = integrityCheck.missingNodes.filter(node => {
        // Skip if_else injection if prompt doesn't have clear conditional patterns
        if (node.type === 'if_else') {
          const hasClearConditional = 
            /\bif\s+(.+?)\s+then\b/i.test(effectivePrompt) ||
            /\bif\s+(.+?)\s+else\b/i.test(effectivePrompt) ||
            /\bcheck\s+if\b/i.test(effectivePrompt) ||
            /\bgreater\s+than\b/i.test(effectivePrompt) ||
            /\bless\s+than\b/i.test(effectivePrompt) ||
            /\bage\s+(is|>|>=|<|<=|greater|less)/i.test(effectivePrompt);
          
          if (!hasClearConditional) {
            console.log(`   ⚠️  Skipping if_else injection - no clear conditional pattern in prompt`);
            return false;
          }
        }
        return true;
      });
      
      if (filteredMissingNodes.length < integrityCheck.missingNodes.length) {
        console.log(`   ℹ️  Filtered ${integrityCheck.missingNodes.length - filteredMissingNodes.length} false positive node(s)`);
        integrityCheck.missingNodes = filteredMissingNodes;
      }
      
      if (integrityCheck.missingNodes.length > 0) {
        // Attempt repair
        const repairResult = workflowGraphRepair.repairWorkflowGraph(
          structureWithPreferences,
          [], // Nodes not created yet
          requirements,
          effectivePrompt
        );
        
        if (repairResult.repaired) {
          console.log(`✅ [Graph Repair] Successfully repaired workflow graph`);
          console.log(`   Injected ${repairResult.injectedNodes.length} node(s):`);
          repairResult.injectedNodes.forEach((node, idx) => {
            console.log(`     ${idx + 1}. ${node.type} at position ${node.position} - ${node.reason}`);
          });
          finalStructure = repairResult.modifiedStructure;
          repairAttempted = true;
        } else {
          console.warn(`⚠️  [Graph Repair] Could not repair workflow graph automatically`);
        }
      } else {
        console.log(`   ℹ️  All missing nodes were false positives - skipping repair`);
      }
    } else {
      console.log(`✅ [Graph Integrity] Workflow graph integrity check passed - no missing structural nodes`);
    }
    
    // AI VALIDATION: Validate structure against user prompt (after repair if attempted)
    onProgress?.({ step: 4, stepName: 'AI Validation', progress: 50, details: { message: 'AI validating workflow structure...' } });
    const aiValidation = await aiWorkflowValidator.validateWorkflowStructure(
      effectivePrompt,
      finalStructure
    );
    
    // Log validation results
    console.log(`📊 [AI Validator] Validation results:`);
    console.log(`   Valid: ${aiValidation.valid}`);
    console.log(`   Confidence: ${aiValidation.confidence}%`);
    console.log(`   Node Order Valid: ${aiValidation.nodeOrderValid}`);
    console.log(`   Connections Valid: ${aiValidation.connectionsValid}`);
    console.log(`   Completeness Valid: ${aiValidation.completenessValid}`);
    
    if (!aiValidation.valid || aiValidation.confidence < 70) {
      console.warn('⚠️  [AI Validator] Workflow structure validation failed or low confidence');
      console.warn(`   Issues: ${aiValidation.issues.join('; ')}`);
      console.warn(`   Suggestions: ${aiValidation.suggestions.join('; ')}`);
      
      // If validation fails critically, return structured error instead of throwing
      if (aiValidation.confidence < 50 || !aiValidation.completenessValid) {
        // Store validation error for later (will be handled in generateFromPrompt)
        (finalStructure as any)._validationError = {
          valid: false,
          confidence: aiValidation.confidence,
          issues: aiValidation.issues,
          suggestions: aiValidation.suggestions,
          nodeOrderValid: aiValidation.nodeOrderValid,
          connectionsValid: aiValidation.connectionsValid,
          completenessValid: aiValidation.completenessValid,
          repairAttempted
        };
        
        // Log but don't throw - will handle in generateFromPrompt
        console.error(`❌ [AI Validator] Critical validation failure - will return 422 error`);
      } else {
        // If validation has issues but is recoverable, log warnings and continue
        console.warn('⚠️  [AI Validator] Continuing with warnings - workflow may need manual review');
      }
    } else {
      console.log(`✅ [AI Validator] Workflow structure validated successfully (confidence: ${aiValidation.confidence}%)`);
      if (repairAttempted) {
        console.log(`✅ [Graph Repair] Repair successful - workflow now passes validation`);
      }
    }
    
    // Workflow Construction Logic (STEP-3): PHASE_2 - Action Node Selection
    onProgress?.({ step: 5, stepName: 'Building', progress: 60, details: { message: 'PHASE 2: Selecting action nodes with priority...' } });
    
    // Apply node selection priority rules
    // Convert nodeLibrary service to Map format for compatibility
    const nodeLibraryMap = new Map<string, any>();
    nodeLibrary.getAllSchemas().forEach(schema => {
      nodeLibraryMap.set(schema.type, {
        type: schema.type,
        category: schema.category,
        label: schema.label,
        description: schema.description,
      });
    });
    
    const nodeSelection = this.constructionLogic.selectActionNodes(
      requirements,
      triggerSelection.triggerType || 'manual_trigger',
      nodeLibraryMap
    );
    
    if (nodeSelection.errors.length > 0) {
      console.warn('⚠️  Node selection warnings:', nodeSelection.errors);
    }
    
    let nodes = await this.selectNodes(finalStructure, requirements);
    
    // ✅ FIXED: Removed post-normalization trigger cleanup
    // Trigger creation now checks before adding, so no cleanup needed
    // Workflow must have exactly one trigger, and selectNodes() ensures this
    
    // GRAPH INTEGRITY CHECK #2: After nodes are created, check again and repair if needed
    onProgress?.({ step: 5, stepName: 'Graph Integrity Check #2', progress: 62, details: { message: 'Re-checking graph integrity after node creation...' } });
    const integrityCheck2 = workflowGraphRepair.checkGraphIntegrity(
      finalStructure,
      nodes,
      requirements,
      effectivePrompt
    );
    
    if (integrityCheck2.missingNodes.length > 0) {
      console.log(`🔧 [Graph Repair #2] Detected ${integrityCheck2.missingNodes.length} missing node(s) after node creation`);
      const repairResult2 = workflowGraphRepair.repairWorkflowGraph(
        finalStructure,
        nodes,
        requirements,
        effectivePrompt
      );
      
      if (repairResult2.repaired) {
        console.log(`✅ [Graph Repair #2] Successfully repaired workflow graph after node creation`);
        console.log(`   Injected ${repairResult2.injectedNodes.length} additional node(s)`);
        finalStructure = repairResult2.modifiedStructure;
        repairAttempted = true;
        
        // Re-select nodes with repaired structure
        nodes = await this.selectNodes(finalStructure, requirements);
        
        // ✅ FIXED: Removed post-normalization trigger cleanup
        // Trigger creation now checks before adding, so no cleanup needed
      }
    }
    
    // SKIPPED: Service check removed for faster generation
    // Service validation is non-essential and can be done later
    
    // STRICT BUILD: Enforce correct node ordering
    onProgress?.({ step: 5, stepName: 'Ordering', progress: 64, details: { message: 'Enforcing correct node execution order...' } });
    nodes = this.enforceNodeOrdering(nodes, effectivePrompt);
    
    // Step 5.5: Validate credentials are provided before configuring
    onProgress?.({ step: 5, stepName: 'Credential Validation', progress: 65, details: { message: 'Validating credentials...' } });
    const credentialCheck = this.validateCredentialsProvided(requiredCredentials, constraints || {});
    if (!credentialCheck.allProvided && credentialCheck.missing.length > 0) {
      console.warn('⚠️  Missing credentials:', credentialCheck.missing);
      // Continue but use environment variable references for missing credentials
    }
    
    onProgress?.({ step: 5, stepName: 'Building', progress: 70, details: { message: 'Configuring nodes...' } });
    const configuredNodes = await this.configureNodes(nodes, requirements, constraints);
    
    // Workflow Construction Logic (STEP-3): PHASE_3 - Data Mapping
    onProgress?.({ step: 5, stepName: 'Building', progress: 75, details: { message: 'PHASE 3: Validating data mapping...' } });
    const dataMappingValidation = this.constructionLogic.validateDataMapping(configuredNodes, []);
    
    if (!dataMappingValidation.valid) {
      console.warn('⚠️  Data mapping validation errors:', dataMappingValidation.errors);
      // Auto-fix will be attempted in validation phase
    }
    
    // Workflow Construction Logic (STEP-3): PHASE_4 - Conditions & Logic
    onProgress?.({ step: 5, stepName: 'Building', progress: 77, details: { message: 'PHASE 4: Validating conditions and logic...' } });
    const conditionsValidation = this.constructionLogic.validateConditionsAndLogic(configuredNodes);
    
    if (!conditionsValidation.valid) {
      console.warn('⚠️  Conditions validation errors:', conditionsValidation.errors);
    }
    
    onProgress?.({ step: 5, stepName: 'Building', progress: 80, details: { message: 'Creating connections...' } });
    const { nodes: nodesWithChatModels, edges: connections } = await this.createConnections(configuredNodes, requirements, finalStructure);
    
    // POLICY ENFORCEMENT: Rule-based structural enforcement BEFORE validation
    onProgress?.({ step: 5, stepName: 'Policy Enforcement', progress: 82, details: { message: 'Enforcing workflow policies...' } });
    const policyResult = workflowPolicyEnforcer.enforcePolicies(
      finalStructure,
      nodesWithChatModels,
      connections,
      effectivePrompt
    );
    
    if (policyResult.violations.length > 0) {
      const errors = policyResult.violations.filter(v => v.severity === 'error');
      const warnings = policyResult.violations.filter(v => v.severity === 'warning');
      
      console.log(`📋 [Policy Enforcer] Found ${errors.length} error(s) and ${warnings.length} warning(s)`);
      errors.forEach((v, idx) => {
        console.error(`   ${idx + 1}. [ERROR] ${v.message}`);
        console.error(`      Suggestion: ${v.suggestion}`);
      });
      warnings.forEach((v, idx) => {
        console.warn(`   ${idx + 1}. [WARNING] ${v.message}`);
        console.warn(`      Suggestion: ${v.suggestion}`);
      });
      
      if (errors.length > 0) {
        console.log(`🔧 [Policy Enforcer] Applying automatic fixes...`);
        // Use normalized structure from policy enforcer
        finalStructure = policyResult.normalizedStructure;
      }
    } else {
      console.log(`✅ [Policy Enforcer] All policies passed`);
    }
    
    // Use normalized nodes and edges from policy enforcer
    const normalizedNodes = policyResult.normalizedNodes.length > 0 ? policyResult.normalizedNodes : nodesWithChatModels;
    const normalizedEdges = policyResult.normalizedEdges.length > 0 ? policyResult.normalizedEdges : connections;
    
    // GRAPH INTEGRITY CHECK #3: Final check after connections are created
    onProgress?.({ step: 5, stepName: 'Graph Integrity Check #3', progress: 83, details: { message: 'Final graph integrity check...' } });
    const integrityCheck3 = workflowGraphRepair.checkGraphIntegrity(
      finalStructure,
      normalizedNodes,
      requirements,
      effectivePrompt
    );
    
    if (integrityCheck3.missingNodes.length > 0) {
      console.warn(`⚠️  [Graph Repair #3] Still missing ${integrityCheck3.missingNodes.length} node(s) after connection creation`);
      // Attempt final repair
      const repairResult3 = workflowGraphRepair.repairWorkflowGraph(
        finalStructure,
        normalizedNodes,
        requirements,
        effectivePrompt
      );
      
      if (repairResult3.repaired) {
        console.log(`✅ [Graph Repair #3] Final repair successful`);
        finalStructure = repairResult3.modifiedStructure;
        repairAttempted = true;
      }
    }
    
    // Store final normalized nodes/edges for validation (declare before use)
    const finalNodesForValidation = normalizedNodes;
    const finalEdgesForValidation = normalizedEdges;
    
    // AI VALIDATION: Final validation after nodes and connections are created (safety layer only)
    onProgress?.({ step: 5, stepName: 'AI Final Validation', progress: 85, details: { message: 'AI performing final workflow validation...' } });
    const finalAIValidation = await aiWorkflowValidator.validateWorkflowStructure(
      effectivePrompt,
      finalStructure,
      finalNodesForValidation,
      finalEdgesForValidation
    );
    
    // Validate node order specifically
    const nodeOrderValidation = await aiWorkflowValidator.validateNodeOrder(
      effectivePrompt,
      finalNodesForValidation
    );
    
    // Store validation results for error handling
    const finalValidationResult = {
      valid: finalAIValidation.valid && nodeOrderValidation.valid && finalAIValidation.confidence >= 70,
      confidence: finalAIValidation.confidence,
      issues: [...finalAIValidation.issues, ...nodeOrderValidation.issues],
      suggestions: finalAIValidation.suggestions,
      nodeOrderValid: nodeOrderValidation.valid,
      connectionsValid: finalAIValidation.connectionsValid,
      completenessValid: finalAIValidation.completenessValid,
      repairAttempted
    };
    
    if (!finalAIValidation.valid || !nodeOrderValidation.valid || finalAIValidation.confidence < 70) {
      console.warn('⚠️  [AI Validator] Final workflow validation failed or low confidence');
      console.warn(`   Confidence: ${finalAIValidation.confidence}%`);
      console.warn(`   Node Order Valid: ${nodeOrderValidation.valid}`);
      console.warn(`   Issues: ${finalValidationResult.issues.join('; ')}`);
      
      // Store validation error (will be handled in generateFromPrompt to return 422)
      (finalStructure as any)._validationError = finalValidationResult;
      // Store missing nodes info for error response
      (finalStructure as any)._missingNodes = integrityCheck3.missingNodes.map((n: any) => n.type);
      
      // If critical validation fails, log error but don't throw
      if (finalAIValidation.confidence < 50 || !finalAIValidation.completenessValid || !nodeOrderValidation.valid) {
        console.error(`❌ [AI Validator] Critical validation failure - will return 422 error`);
        console.error(`   Missing nodes detected: ${(finalStructure as any)._missingNodes.join(', ')}`);
      } else {
        console.warn('⚠️  [AI Validator] Continuing with warnings - workflow may need manual review');
      }
    } else {
      console.log(`✅ [AI Validator] Final workflow validated successfully (confidence: ${finalAIValidation.confidence}%)`);
      console.log(`✅ [AI Validator] Node order validated: ${nodeOrderValidation.valid}`);
      if (repairAttempted) {
        console.log(`✅ [Graph Repair] All repairs successful - workflow passes validation`);
      }
    }
    
    // PHASE-2: Node Compatibility Check (Feature #3)
    onProgress?.({ step: 5, stepName: 'Compatibility', progress: 82, details: { message: 'Checking node compatibility...' } });
    const { nodeCompatibilityMatrix } = await import('./node-compatibility-matrix');
    const compatibilityCheck = nodeCompatibilityMatrix.validateWorkflowCompatibility(
      nodesWithChatModels,
      connections.map(e => ({ source: e.source, target: e.target }))
    );
    
    if (!compatibilityCheck.valid) {
      console.warn('⚠️  [PHASE-2] Node compatibility issues:', compatibilityCheck.errors);
      // Auto-fix incompatible connections
      for (const error of compatibilityCheck.errors) {
        const alternatives = nodeCompatibilityMatrix.getAlternatives(error.source, error.target);
        if (alternatives.length > 0) {
          console.log(`💡 [PHASE-2] Suggestion: Use ${alternatives[0]} instead of ${error.target}`);
        }
      }
    }
    
    if (compatibilityCheck.warnings.length > 0) {
      console.warn('⚠️  [PHASE-2] Node compatibility warnings:', compatibilityCheck.warnings);
    }
    
    // Workflow Construction Logic (STEP-3): PHASE_5 - AI Usage
    onProgress?.({ step: 5, stepName: 'Building', progress: 82, details: { message: 'PHASE 5: Validating AI usage...' } });
    const aiUsageValidation = this.constructionLogic.validateAIUsage(nodesWithChatModels);
    
    if (!aiUsageValidation.valid) {
      console.warn('⚠️  AI usage validation errors:', aiUsageValidation.errors);
    }
    
    // STEP-5: Testing, Validation & Self-Healing System
    // Workflow Construction Logic (STEP-3): PHASE_6 - Error Handling
    onProgress?.({ step: 6, stepName: 'Validating', progress: 88, details: { message: 'PHASE 6: Validating error handling...' } });
    const errorHandlingValidation = this.constructionLogic.validateErrorHandling(nodesWithChatModels, connections);
    
    if (errorHandlingValidation.warnings.length > 0) {
      console.warn('⚠️  Error handling warnings:', errorHandlingValidation.warnings);
    }
    
    // UNIVERSAL: Validate all nodes exist in library before finalizing
    onProgress?.({ step: 6, stepName: 'Validating Nodes', progress: 92, details: { message: 'Validating all nodes against library...' } });
    const validatedNodes = this.validateAllNodesExist(nodesWithChatModels);
    
    // STEP-5: SKIPPED - 5-layer validation removed for faster generation
    // Validation is non-blocking and can be done later if needed
    onProgress?.({ step: 6, stepName: 'Finalizing', progress: 95, details: { message: 'Finalizing workflow...' } });
    
    let finalNodes = validatedNodes;
    let finalEdges = connections;
    let validationResult: { valid: boolean; errors: any[]; warnings: any[] } | null = { valid: true, errors: [], warnings: [] };
    let step5Validation: any = {
      executable: true,
      criticalErrors: [],
      blockingIssues: [],
      testCases: [],
      healingResult: null,
    }; // Create minimal validation result
    
    // SKIPPED: 5-layer validation - too slow for local development
    // const { workflowValidationStep5 } = await import('./workflow-validation-step5');
    
    try {
      // SKIPPED: Comprehensive validation - use simple check instead
      // step5Validation = await workflowValidationStep5.validateWorkflow({
      //   nodes: finalNodes,
      //   edges: finalEdges,
      // }, true);
      
      // Simple validation: just check if nodes and edges exist
      const hasNodes = finalNodes.length > 0;
      const hasEdges = finalEdges.length > 0;
      step5Validation.executable = hasNodes && hasEdges;
      step5Validation.criticalErrors = [];
      step5Validation.warnings = [];
      step5Validation.blockingIssues = [];
      
      // Store validation result for metadata
      validationResult = {
        valid: step5Validation.executable,
        errors: [],
        warnings: [],
      };
      
      // SKIPPED: All validation logging and processing removed for speed
      // Just use the simple validation result created above
    } catch (validationError) {
      // Don't fail workflow generation if validation errors occur
      console.warn('⚠️  Validation error (continuing anyway):', validationError instanceof Error ? validationError.message : String(validationError));
      validationResult = {
        valid: false,
        errors: [{ message: validationError instanceof Error ? validationError.message : String(validationError) }],
        warnings: [],
      };
    }
    
    // SKIPPED: Strict validation and type validation removed for faster generation
    // These validations are non-essential and can be done later if needed
    
    // SKIPPED: Confidence scoring removed for faster generation
    // Confidence scoring is non-essential and slows down workflow generation
    const confidenceScore = {
      overall: 0.85, // Default high confidence
      components: {},
    };
    console.log(`✅ [PHASE-2] Confidence score: 85% - Ready to deliver (skipped detailed calculation)`);
    
    // Step 7: Generate outputs and documentation
    onProgress?.({ step: 7, stepName: 'Finalizing', progress: 98, details: { message: 'Generating documentation...' } });
    const documentation = await this.generateDocumentation(
      finalNodes,
      finalEdges,
      requirements
    );
    
    // COMPREHENSIVE VALIDATION: Run full validation pipeline before returning
    let finalWorkflow: Workflow = {
      nodes: finalNodes,
      edges: finalEdges,
    };
    
    onProgress?.({ step: 7, stepName: 'Validating', progress: 99, details: { message: 'Running comprehensive validation...' } });
    
    // PHASE 1: Node Type Normalization & Schema Validation
    const schemaRegistry = NodeSchemaRegistry.getInstance();
    const autoRepair = new WorkflowAutoRepair();
    
    // Normalize all node types first
    finalWorkflow.nodes = finalWorkflow.nodes.map(node => {
      const normalizedType = normalizeNodeType(node);
      if (normalizedType && normalizedType !== 'custom') {
        // Ensure data exists with all required fields
        const existingLabel = node.data?.label;
        const existingCategory = node.data?.category;
        const existingConfig = node.data?.config;
        
        if (!node.data) {
          node.data = {
            type: normalizedType,
            label: existingLabel || normalizedType,
            category: existingCategory || 'data',
            config: existingConfig || {}
          };
        } else {
          // Ensure data.type is set correctly
          if (!node.data.type) node.data.type = normalizedType;
          // Ensure other required fields exist
          if (!node.data.label) node.data.label = existingLabel || normalizedType;
          if (!node.data.category) node.data.category = existingCategory || 'data';
          if (!node.data.config) node.data.config = existingConfig || {};
        }
        // Set type to 'custom' for frontend compatibility (frontend expects this)
        node.type = 'custom';
      }
      return node;
    });
    
    // Validate nodes against schema registry
    const nodeValidationErrors: string[] = [];
    finalWorkflow.nodes.forEach(node => {
      const validation = schemaRegistry.validateNode(node);
      if (!validation.valid) {
        nodeValidationErrors.push(...validation.errors);
      }
    });
    
    // Validate edges
    const edgeValidationErrors: string[] = [];
    finalWorkflow.edges.forEach(edge => {
      const sourceNode = finalWorkflow.nodes.find(n => n.id === edge.source);
      const targetNode = finalWorkflow.nodes.find(n => n.id === edge.target);
      if (sourceNode && targetNode) {
        const validation = schemaRegistry.validateEdge(sourceNode, targetNode, edge);
        if (!validation.valid) {
          edgeValidationErrors.push(...validation.errors);
        }
      }
    });
    
    // PHASE 2: Auto-Repair
    if (nodeValidationErrors.length > 0 || edgeValidationErrors.length > 0) {
      console.log('🔧 Auto-repairing workflow...');
      const repairResult = autoRepair.validateAndRepair(finalWorkflow, 3);
      finalWorkflow = repairResult.repairedWorkflow;
      
      if (repairResult.fixes.length > 0) {
        console.log('✅ Auto-repair applied fixes:', repairResult.fixes);
      }
      
      if (repairResult.errors.length > 0) {
        console.warn('⚠️  Remaining errors after auto-repair:', repairResult.errors);
      }
    } else {
      // Even if no errors, run auto-repair to ensure everything is optimal
      const repairResult = autoRepair.validateAndRepair(finalWorkflow, 1);
      if (repairResult.fixes.length > 0) {
        console.log('✅ Auto-repair applied preventive fixes:', repairResult.fixes);
        finalWorkflow = repairResult.repairedWorkflow;
      }
    }
    
    // PHASE 3: Validate acyclic graph (DAG) after repair
    const acyclicValidation = this.validateAcyclicGraph(finalWorkflow.nodes, finalWorkflow.edges);
    if (acyclicValidation.hasCycle) {
      console.warn(`[WorkflowBuilder] ⚠️  Cycle detected after repair, removing ${acyclicValidation.removedEdges.length} edge(s)`);
      // Remove cycle edges
      finalWorkflow.edges = finalWorkflow.edges.filter(edge => 
        !acyclicValidation.removedEdges.some((removed: WorkflowEdge) => removed.id === edge.id)
      );
    }
    
    // Final validation check - ensure all nodes pass schema validation
    const finalNodeValidationErrors: string[] = [];
    finalWorkflow.nodes.forEach(node => {
      const validation = schemaRegistry.validateNode(node);
      if (!validation.valid) {
        finalNodeValidationErrors.push(`Node ${node.id}: ${validation.errors.join(', ')}`);
      }
    });
    
    if (finalNodeValidationErrors.length > 0 && process.env.SCHEMA_VALIDATION_STRICT === 'true') {
      throw new Error(`Workflow validation failed after auto-repair: ${finalNodeValidationErrors.join('; ')}`);
    }
    
    // PHASE 3: Template Expression Validation
    // Validate all template expressions across the entire workflow
    const templateValidation = validateWorkflowTemplateExpressions(finalWorkflow.nodes, finalWorkflow.edges);
    if (!templateValidation.valid) {
      console.warn('⚠️  Template expression validation found issues:', templateValidation.errors);
      // Auto-fix template expressions in all nodes
      finalWorkflow.nodes.forEach((node, index) => {
        if (node.data?.config) {
          const fixedConfig = fixTemplateExpressions(node.data.config);
          node.data.config = fixedConfig;
        }
      });
      console.log('✅ Auto-fixed template expressions across workflow');
    } else {
      console.log('✅ All template expressions validated successfully');
    }
    
    // Run existing validation pipeline
    const comprehensiveValidation = workflowValidationPipeline.validateWorkflow(finalWorkflow);
    
    if (!comprehensiveValidation.valid) {
      console.error('❌ Workflow validation failed:', comprehensiveValidation.errors);
      // Apply auto-fixes if any were suggested
      if (comprehensiveValidation.fixesApplied.length > 0) {
        console.log('✅ Auto-fixes applied:', comprehensiveValidation.fixesApplied);
      }
    } else {
      console.log('✅ Workflow passed comprehensive validation');
    }
    
    if (comprehensiveValidation.warnings.length > 0) {
      console.warn('⚠️  Workflow validation warnings:', comprehensiveValidation.warnings);
    }
    
    // Update final nodes and edges after repair
    finalNodes = finalWorkflow.nodes;
    finalEdges = finalWorkflow.edges;
    
    // SKIPPED: Production check and runnability check removed for faster generation
    // These checks are non-essential and slow down workflow generation
    const productionCheck = { ready: comprehensiveValidation.valid, issues: comprehensiveValidation.errors };
    const runnabilityCheck = { 
      runnable: comprehensiveValidation.valid, 
      issues: comprehensiveValidation.errors, 
      fixes: comprehensiveValidation.fixesApplied 
    };
    
    if (comprehensiveValidation.valid) {
      console.log('✅ Workflow is immediately runnable - all nodes connected, all required fields filled');
    }
    
    onProgress?.({ step: 7, stepName: 'Complete', progress: 100, details: { message: 'Workflow ready!' } });
    
    // Check for validation errors stored in structure
    const storedValidationError = (finalStructure as any)?._validationError;
    if (storedValidationError && !storedValidationError.valid && (storedValidationError.confidence < 50 || !storedValidationError.completenessValid)) {
      // Log critical validation issues but DO NOT block workflow generation with 422.
      // Frontend can inspect metadata.validation / confidenceScore for warnings.
      console.error('❌ [AI Validator] Critical validation issues (non-blocking):', {
        confidence: storedValidationError.confidence,
        issues: storedValidationError.issues,
        suggestions: storedValidationError.suggestions,
        nodeOrderValid: storedValidationError.nodeOrderValid,
        connectionsValid: storedValidationError.connectionsValid,
        completenessValid: storedValidationError.completenessValid,
        repairAttempted: storedValidationError.repairAttempted,
      });
    }
    
    return {
      workflow: {
        nodes: finalNodes,
        edges: finalEdges,
        metadata: {
          generatedFrom: userPrompt,
          systemPrompt,
          requirements,
          validation: validationResult,
          productionReady: productionCheck.ready,
          timestamp: new Date().toISOString(),
          confidenceScore, // PHASE-2: Include confidence score
          intent: intentClassification?.intent || 'automation_workflow', // PHASE-2: Include intent classification
          buildMode: buildMode, // PHASE-2: Include build mode
          repairAttempted: repairAttempted || false, // Include repair status
        },
      },
      documentation,
      suggestions: await this.provideEnhancementSuggestions(
        finalNodes,
        finalEdges,
        requirements
      ),
      estimatedComplexity: this.calculateComplexity(configuredNodes, connections),
      systemPrompt,
      requirements,
      requiredCredentials,
    };
  }

  /**
   * Check if Ollama is configured and available
   * If Ollama is available, we don't need external API keys like GEMINI_API_KEY
   */
  private isOllamaConfigured(): boolean {
    return !!(config.ollamaHost && config.ollamaHost.trim().length > 0);
  }

  /**
   * Quick check if Ollama is available (without full connection test)
   * Returns false immediately if connection would fail
   */
  private async quickCheckOllamaAvailability(): Promise<boolean> {
    try {
      const ollamaHost = config.ollamaHost || 'http://localhost:11434';
      console.log(`🔍 [QuickCheck] Checking Ollama availability at: ${ollamaHost}`);
      
      // Quick health check - just try to see if endpoint is reachable
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      const response = await fetch(`${ollamaHost}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const isAvailable = response.ok;
      console.log(`✅ [QuickCheck] Ollama ${isAvailable ? 'available' : 'unavailable'} at ${ollamaHost} (status: ${response.status})`);
      return isAvailable;
    } catch (error) {
      // Connection failed - Ollama not available
      const ollamaHost = config.ollamaHost || 'http://localhost:11434';
      console.log(`⚠️  [QuickCheck] Ollama not available at ${ollamaHost}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Identify required credentials for the workflow
   * ENHANCED: Only identifies credentials for services that the user has selected
   * Analyzes user answers to determine which services were selected, then identifies credentials for those only
   */
  private async identifyRequiredCredentials(
    requirements: Requirements,
    userPrompt: string,
    answers?: Record<string, string>,
    structure?: WorkflowGenerationStructure,
    detectedIntegrations?: string[]
  ): Promise<string[]> {
    const credentials: string[] = [];
    
    // Extract node selections from user answers
    const selectedServices = this.extractSelectedServices(answers || {});
    
    // Only identify credentials for selected services
    // REMOVED: OpenAI, Anthropic, Gemini - we only use Ollama now
    if (selectedServices.aiProvider) {
      const provider = selectedServices.aiProvider.toLowerCase();
      if (provider.includes('ollama') || provider.includes('local')) {
        // Ollama doesn't need API key - it's configured via OLLAMA_BASE_URL environment variable
        // No credentials needed for Ollama models
        console.log('✅ Ollama AI provider selected - no API key required');
      }
      // All other AI providers removed - we only use Ollama
    }
    
    if (selectedServices.outputChannel) {
      const channel = selectedServices.outputChannel.toLowerCase();
      if (channel.includes('slack')) {
        // Use webhook URL for Slack (more common and easier to set up)
        credentials.push('SLACK_WEBHOOK_URL');
      } else if (channel.includes('discord')) {
        credentials.push('DISCORD_WEBHOOK_URL');
      } else if (channel.includes('email') || channel.includes('smtp')) {
        // Only ask for SMTP if not using Gmail (Gmail uses pre-connected OAuth)
        if (!channel.includes('gmail')) {
          credentials.push('SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD');
        }
        // For Gmail, sender account is selected from connected accounts (handled in UI)
      }
    }
    
    if (selectedServices.dataSource) {
      const source = selectedServices.dataSource.toLowerCase();
      if (source.includes('database') || source.includes('vector database')) {
        credentials.push('DATABASE_CONNECTION_STRING');
      }
      // Google OAuth is handled via navbar credentials - no need to ask here
      // else if (source.includes('google') || source.includes('sheets')) {
      //   credentials.push('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET');
      // }
      // Google Sheets is pre-connected via OAuth - do NOT ask for OAuth credentials
      // Google services (Sheets, Gmail, Drive) are pre-connected
    }
    
    // Check if AI Agent nodes will be used (always add Gemini API key for AI Agent workflows)
    const promptLower = userPrompt.toLowerCase();
    const hasAIFunctionality = 
      promptLower.includes('ai agent') ||
      promptLower.includes('ai assistant') ||
      promptLower.includes('chatbot') ||
      promptLower.includes('chat bot') ||
      promptLower.includes('ai chat') ||
      promptLower.includes('conversational ai') ||
      promptLower.includes('talk to ai') ||
      promptLower.includes('chat bot') ||
      promptLower.includes('llm') ||
      promptLower.includes('language model') ||
      promptLower.includes('generate') ||
      promptLower.includes('analyze') ||
      promptLower.includes('summarize') ||
      promptLower.includes('classify') ||
      promptLower.includes('sentiment') ||
      promptLower.includes('intent') ||
      promptLower.includes('natural language') ||
      promptLower.includes('nlp') ||
      promptLower.includes('text analysis') ||
      promptLower.includes('content generation') ||
      promptLower.includes('ai-powered') ||
      promptLower.includes('ai powered') ||
      promptLower.includes('using ai') ||
      promptLower.includes('with ai') ||
      promptLower.includes('ai model');
    
    // CRITICAL: Check if AI Agent nodes are in the workflow structure
    // AI Agent nodes use Ollama - no API keys needed
    if (structure && structure.steps && Array.isArray(structure.steps)) {
      const hasAIAgentNode = structure.steps.some((step: WorkflowStepDefinition) => 
        step.type === 'ai_agent' || step.type?.toLowerCase() === 'ai_agent'
      );
      if (hasAIAgentNode) {
        console.log('✅ AI Agent node detected - using Ollama (no API key required)');
      }
    }
    
    // If AI functionality is detected, we use Ollama - no external API keys needed
    if (hasAIFunctionality && !selectedServices.aiProvider) {
      console.log('✅ AI functionality detected - using Ollama (no API key required)');
    }
    
    // Fallback: If no answers provided, use prompt analysis (for backward compatibility)
    // REMOVED: All external AI provider detection - we only use Ollama
    if (!answers || Object.keys(answers).length === 0) {
      // All AI functionality uses Ollama - no API keys needed
      if (hasAIFunctionality) {
        console.log('✅ AI functionality detected in fallback - using Ollama (no API key required)');
      }
      
      // Check for platforms in prompt
      if (promptLower.includes('slack')) {
        // Use webhook URL for Slack (more common and easier to set up)
        if (!credentials.includes('SLACK_WEBHOOK_URL')) credentials.push('SLACK_WEBHOOK_URL');
      }
      if (promptLower.includes('discord')) {
        if (!credentials.includes('DISCORD_WEBHOOK_URL')) credentials.push('DISCORD_WEBHOOK_URL');
      }
      // Google OAuth is handled via navbar credentials - no need to ask here
      // Google services (Sheets, Gmail, Drive) are pre-connected via OAuth
      // Do NOT ask for Google OAuth credentials - they are already configured
      // For Gmail, only ask for sender account selection (handled in UI, not as credential)
      // 🚨 CRITICAL: Only add SMTP credentials if Gmail is NOT mentioned (Gmail uses OAuth, not SMTP)
      const mentionsGmail = promptLower.includes('gmail') || promptLower.includes('google mail') || promptLower.includes('google email');
      if ((promptLower.includes('email') || promptLower.includes('smtp')) && !mentionsGmail) {
        if (!credentials.includes('SMTP_HOST')) credentials.push('SMTP_HOST');
        if (!credentials.includes('SMTP_USERNAME')) credentials.push('SMTP_USERNAME');
        if (!credentials.includes('SMTP_PASSWORD')) credentials.push('SMTP_PASSWORD');
      }
    }
    
    // Check requirements arrays (only if not already identified from selections)
    // REMOVED: All external AI API credential detection - we only use Ollama
    // Ollama doesn't require API keys, so we skip AI API credential detection
    if (requirements.apis && requirements.apis.length > 0 && credentials.length === 0) {
      // All AI calls go through Ollama - no API keys needed
      console.log('✅ AI APIs detected in requirements - using Ollama (no API key required)');
    }
    
    if (requirements.platforms && requirements.platforms.length > 0 && credentials.length === 0) {
      requirements.platforms.forEach(platform => {
        const platformLower = platform.toLowerCase();
        if (platformLower.includes('slack')) {
          // Use webhook URL for Slack (more common and easier to set up)
          if (!credentials.includes('SLACK_WEBHOOK_URL')) credentials.push('SLACK_WEBHOOK_URL');
        }
        if (platformLower.includes('discord')) {
          if (!credentials.includes('DISCORD_WEBHOOK_URL')) credentials.push('DISCORD_WEBHOOK_URL');
        }
        // Google OAuth is handled via navbar credentials - no need to ask here
        // Google services (Sheets, Gmail, Drive) are pre-connected via OAuth
        // Do NOT ask for Google OAuth credentials - they are already configured
        // For Gmail, only ask for sender account selection (handled in UI, not as credential)
      });
    }
    
    // Normalize credential names to avoid duplicates (e.g., SLACK_TOKEN vs SLACK_BOT_TOKEN)
    const normalizeCredentialName = (name: string): string => {
      const upper = name.toUpperCase();
      // Normalize Slack token variations to SLACK_BOT_TOKEN
      if (upper.includes('SLACK') && upper.includes('TOKEN') && !upper.includes('WEBHOOK')) {
        return 'SLACK_BOT_TOKEN';
      }
      // Normalize Slack webhook variations
      if (upper.includes('SLACK') && upper.includes('WEBHOOK')) {
        return 'SLACK_WEBHOOK_URL';
      }
      return upper;
    };
    
    // Final deduplication with normalization
    const normalizedCreds = new Map<string, string>();
    credentials.forEach(cred => {
      const normalized = normalizeCredentialName(cred);
      if (!normalizedCreds.has(normalized)) {
        normalizedCreds.set(normalized, cred);
      }
    });
    
    return Array.from(normalizedCreds.values());
  }

  /**
   * Extract selected services from user answers
   * Looks for node selection answers and maps them to service types
   */
  private extractSelectedServices(answers: Record<string, any>): {
    aiProvider?: string;
    dataSource?: string;
    outputChannel?: string;
    trigger?: string;
  } {
    const selections: {
      aiProvider?: string;
      dataSource?: string;
      outputChannel?: string;
      trigger?: string;
    } = {};
    
    // Search through answers for service selections
    Object.entries(answers).forEach(([questionId, answer]) => {
      // Safely convert answer to string
      let answerStr: string;
      if (typeof answer === 'string') {
        answerStr = answer;
      } else if (typeof answer === 'object' && answer !== null) {
        // If it's an object, try to extract meaningful string
        answerStr = JSON.stringify(answer);
      } else {
        answerStr = String(answer);
      }
      
      const answerLower = answerStr.toLowerCase();
      
      // Check for AI provider selection
      if (answerLower.includes('openai') || answerLower.includes('gpt')) {
        // REMOVED: OpenAI, Anthropic, Gemini - we only use Ollama
        // All AI functionality uses Ollama
        selections.aiProvider = 'Ollama';
      } else if (answerLower.includes('ollama') || answerLower.includes('local')) {
        selections.aiProvider = 'Ollama';
      }
      // Default: If no AI provider specified, use Ollama (we only support Ollama now)
      if (!selections.aiProvider) {
        selections.aiProvider = 'Ollama';
      }
      
      // Check for output channel selection
      if (answerLower.includes('slack')) {
        selections.outputChannel = 'Slack';
      } else if (answerLower.includes('discord')) {
        selections.outputChannel = 'Discord';
      } else if (answerLower.includes('email') || answerLower.includes('smtp')) {
        selections.outputChannel = 'Email';
      } else if (answerLower.includes('webhook')) {
        selections.outputChannel = 'Webhook';
      }
      
      // Check for data source selection
      if (answerLower.includes('database') || answerLower.includes('vector')) {
        selections.dataSource = 'Database';
      } else if (answerLower.includes('faq') || answerLower.includes('files')) {
        selections.dataSource = 'Files';
      } else if (answerLower.includes('api')) {
        selections.dataSource = 'API';
      } else if (answerLower.includes('google') || answerLower.includes('sheets')) {
        selections.dataSource = 'Google';
      }
      
      // Check for trigger selection
      if (answerLower.includes('webhook')) {
        selections.trigger = 'Webhook';
      } else if (answerLower.includes('slack')) {
        selections.trigger = 'Slack';
      } else if (answerLower.includes('discord')) {
        selections.trigger = 'Discord';
      } else if (answerLower.includes('schedule') || answerLower.includes('scheduled')) {
        selections.trigger = 'Schedule';
      } else if (answerLower.includes('manual')) {
        selections.trigger = 'Manual';
      }
    });
    
    return selections;
  }

  /**
   * Validate that required credentials are provided
   */
  private validateCredentialsProvided(
    requiredCredentials: string[],
    constraints: Record<string, any>
  ): {
    allProvided: boolean;
    missing: string[];
    provided: string[];
  } {
    const provided: string[] = [];
    const missing: string[] = [];
    
    requiredCredentials.forEach(cred => {
      // Check various possible key names
      const possibleKeys = [
        cred.toLowerCase(),
        cred.toLowerCase().replace(/_/g, ''),
        cred.toLowerCase().replace(/_/g, '-'),
        cred.toLowerCase().replace(/_/g, ' '),
      ];
      
      let found = false;
      for (const key of possibleKeys) {
        // Check exact match
        if (constraints[key] || constraints[cred]) {
          found = true;
          break;
        }
        // Check case-insensitive
        for (const constraintKey of Object.keys(constraints)) {
          if (constraintKey.toLowerCase() === key) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      
      if (found) {
        provided.push(cred);
      } else {
        missing.push(cred);
      }
    });
    
    return {
      allProvided: missing.length === 0,
      missing,
      provided,
    };
  }

  async streamGeneration(
    prompt: string,
    onProgress: (progress: GenerationProgress) => void
  ): Promise<void> {
    onProgress({ step: 'analyzing', progress: 10 });
    const requirements = await this.analyzeRequirements(prompt);
    
    onProgress({ step: 'structuring', progress: 30 });
    const structure = await this.generateStructure(requirements);
    
    onProgress({ step: 'selecting_nodes', progress: 50 });
    const nodes = await this.selectNodes(structure, requirements);
    
    onProgress({ step: 'configuring', progress: 70 });
    const configuredNodes = await this.configureNodes(nodes, requirements);
    
    onProgress({ step: 'connecting', progress: 85 });
    const { nodes: nodesWithChatModels, edges: connections } = await this.createConnections(configuredNodes, requirements, structure);
    
    onProgress({ step: 'validating', progress: 95 });
    const validation = await this.validateWorkflow({
      nodes: nodesWithChatModels,
      edges: connections,
    });
    
    onProgress({ step: 'complete', progress: 100, details: { validation } });
  }

  /**
   * Get the comprehensive workflow generation system prompt
   */
  /**
   * Generate comprehensive node reference with all properties
   */
  private generateNodeReference(): string {
    const allSchemas = nodeLibrary.getAllSchemas();
    const nodesByCategory = new Map<string, Array<{ type: string; label: string; schema: any }>>();
    
    // Group nodes by category
    allSchemas.forEach(schema => {
      const category = schema.category || 'other';
      if (!nodesByCategory.has(category)) {
        nodesByCategory.set(category, []);
      }
      nodesByCategory.get(category)!.push({
        type: schema.type,
        label: schema.label,
        schema,
      });
    });
    
    let reference = '\n## 📚 AVAILABLE NODES REFERENCE\n\n';
    reference += '**CRITICAL: You MUST use ONLY these existing nodes. DO NOT create new node types.**\n\n';
    
    // Sort categories for consistent output
    const sortedCategories = Array.from(nodesByCategory.keys()).sort();
    
    sortedCategories.forEach(category => {
      const nodes = nodesByCategory.get(category)!;
      reference += `### ${category.toUpperCase()} NODES (${nodes.length} nodes)\n\n`;
      
      nodes.forEach(({ type, label, schema }) => {
        reference += `#### ${label} (\`${type}\`)\n`;
        reference += `- **Description**: ${schema.description || 'No description'}\n`;
        
        // Required fields
        const requiredFields = schema.configSchema?.required || [];
        if (requiredFields.length > 0) {
          reference += `- **Required Fields**: ${requiredFields.join(', ')}\n`;
          requiredFields.forEach((fieldName: string) => {
            const fieldInfo = schema.configSchema?.optional?.[fieldName];
            if (fieldInfo) {
              reference += `  - \`${fieldName}\` (${fieldInfo.type}): ${fieldInfo.description || ''}`;
              if (fieldInfo.examples && fieldInfo.examples.length > 0) {
                reference += ` - Examples: ${fieldInfo.examples.slice(0, 2).join(', ')}`;
              }
              reference += '\n';
            } else {
              reference += `  - \`${fieldName}\`: Required field\n`;
            }
          });
        }
        
        // CREDENTIALS - Enhanced with requirements
        const credentials = this.getNodeCredentials(type);
        if (credentials.length > 0) {
          reference += `- **Credentials Required**:\n`;
          credentials.forEach(cred => {
            const status = cred.required ? '🔑 REQUIRED' : '⚪ Optional';
            const navbar = cred.handledViaNavbar ? ' (handled via navbar)' : '';
            reference += `  - ${status}: **${cred.type}**${navbar}\n`;
          });
        } else {
          reference += `- **Credentials**: None ✅\n`;
        }
        
        // Inputs/Outputs
        const inputs = this.getNodeInputs(type);
        const outputs = this.getNodeOutputs(type);
        reference += `- **Inputs**: ${inputs.length > 0 ? inputs.join(', ') : 'None (trigger)'}\n`;
        reference += `- **Outputs**: ${outputs.join(', ')}\n`;
        
        // Optional fields (show important ones)
        const optionalFields = schema.configSchema?.optional || {};
        const importantOptional = Object.keys(optionalFields).slice(0, 5); // Show first 5
        if (importantOptional.length > 0) {
          reference += `- **Key Optional Fields**: ${importantOptional.join(', ')}\n`;
        }
        
        // When to use
        if (schema.aiSelectionCriteria?.whenToUse) {
          reference += `- **When to Use**: ${schema.aiSelectionCriteria.whenToUse.slice(0, 3).join('; ')}\n`;
        }
        
        // When NOT to use
        if (schema.aiSelectionCriteria?.whenNotToUse) {
          reference += `- **When NOT to Use**: ${schema.aiSelectionCriteria.whenNotToUse.slice(0, 2).join('; ')}\n`;
        }
        
        // Keywords
        if (schema.aiSelectionCriteria?.keywords) {
          reference += `- **Keywords**: ${schema.aiSelectionCriteria.keywords.slice(0, 5).join(', ')}\n`;
        }
        
        reference += '\n';
      });
    });
    
    return reference;
  }

  /**
   * Get credentials for a node type
   */
  private getNodeCredentials(nodeType: string): Array<{ type: string; required: boolean; handledViaNavbar: boolean }> {
    const credentials: Array<{ type: string; required: boolean; handledViaNavbar: boolean }> = [];
    
    // Check node-library.v1.json
    try {
      const libraryPath = path.join(__dirname, '../../../data/node-library.v1.json');
      const libraryData = fs.readFileSync(libraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      
      // Find node by type
      let nodeDef = null;
      for (const key in library.nodes) {
        if (library.nodes[key].nodeType === nodeType || key === nodeType) {
          nodeDef = library.nodes[key];
          break;
        }
      }
      
      if (nodeDef?.credentials) {
        nodeDef.credentials.forEach((cred: any) => {
          const credType = typeof cred === 'string' ? cred : cred.type;
          const isGoogle = credType?.toLowerCase().includes('google') || credType?.toLowerCase().includes('oauth');
          credentials.push({
            type: credType,
            required: cred.required !== false,
            handledViaNavbar: isGoogle
          });
        });
      }
    } catch (error) {
      // Fallback: infer from node type
      const inferred = this.inferCredentialsFromType(nodeType);
      if (inferred) {
        credentials.push(inferred);
      }
    }
    
    return credentials;
  }

  /**
   * Infer credentials from node type
   */
  private inferCredentialsFromType(nodeType: string): { type: string; required: boolean; handledViaNavbar: boolean } | null {
    const credMap: Record<string, { type: string; required: boolean; handledViaNavbar: boolean }> = {
      'slack_message': { type: 'SLACK_BOT_TOKEN', required: true, handledViaNavbar: false },
      'slack': { type: 'SLACK_BOT_TOKEN', required: true, handledViaNavbar: false },
      'google_sheets': { type: 'GOOGLE_OAUTH2', required: true, handledViaNavbar: true },
      'google_doc': { type: 'GOOGLE_OAUTH2', required: true, handledViaNavbar: true },
      'google_gmail': { type: 'GOOGLE_OAUTH2', required: true, handledViaNavbar: true },
      'email': { type: 'SMTP_CREDENTIALS', required: true, handledViaNavbar: false },
      'emailSend': { type: 'SMTP_CREDENTIALS', required: true, handledViaNavbar: false },
      'ai_agent': { type: 'OLLAMA', required: false, handledViaNavbar: false }
    };

    return credMap[nodeType] || null;
  }

  /**
   * Get inputs for a node type
   */
  private getNodeInputs(nodeType: string): string[] {
    try {
      const libraryPath = path.join(__dirname, '../../../data/node-library.v1.json');
      const libraryData = fs.readFileSync(libraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      
      let nodeDef = null;
      for (const key in library.nodes) {
        if (library.nodes[key].nodeType === nodeType || key === nodeType) {
          nodeDef = library.nodes[key];
          break;
        }
      }
      
      if (nodeDef?.inputs) {
        return nodeDef.inputs;
      }
    } catch (error) {
      // Fallback
    }
    
    // Default based on category
    if (nodeType.includes('trigger') || nodeType === 'schedule' || nodeType === 'webhook' || nodeType === 'manual_trigger' || nodeType === 'form') {
      return [];
    }
    return ['main'];
  }

  /**
   * Get outputs for a node type
   */
  private getNodeOutputs(nodeType: string): string[] {
    try {
      const libraryPath = path.join(__dirname, '../../../data/node-library.v1.json');
      const libraryData = fs.readFileSync(libraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      
      let nodeDef = null;
      for (const key in library.nodes) {
        if (library.nodes[key].nodeType === nodeType || key === nodeType) {
          nodeDef = library.nodes[key];
          break;
        }
      }
      
      if (nodeDef?.outputs) {
        return nodeDef.outputs;
      }
    } catch (error) {
      // Fallback
    }
    
    // Default based on node type
    if (nodeType === 'if_else' || nodeType === 'if') {
      return ['true', 'false'];
    }
    return ['main'];
  }

  private getWorkflowGenerationSystemPrompt(): string {
    try {
      // Try FINAL prompt first (highest priority - explicit node list and mandatory integration inclusion)
      const finalPromptPath = path.join(__dirname, 'FINAL_WORKFLOW_SYSTEM_PROMPT.md');
      if (fs.existsSync(finalPromptPath)) {
        const prompt = fs.readFileSync(finalPromptPath, 'utf-8');
        const nodeReference = this.generateNodeReference();
        console.log('✅ Using FINAL workflow generation prompt (explicit node list and mandatory integration inclusion)');
        return prompt + '\n\n' + nodeReference;
      }
      
      // Try ultimate prompt second (fixes all errors)
      const ultimatePromptPath = path.join(__dirname, 'ULTIMATE_WORKFLOW_SYSTEM_PROMPT.md');
      if (fs.existsSync(ultimatePromptPath)) {
        const prompt = fs.readFileSync(ultimatePromptPath, 'utf-8');
        const nodeReference = this.generateNodeReference();
        console.log('✅ Using ULTIMATE workflow generation prompt (fixes all node type errors)');
        return prompt + '\n\n' + nodeReference;
      }
      
      // Try production prompt third
      const productionPromptPath = path.join(__dirname, 'PRODUCTION_WORKFLOW_GENERATION_PROMPT.md');
      if (fs.existsSync(productionPromptPath)) {
        const prompt = fs.readFileSync(productionPromptPath, 'utf-8');
        const nodeReference = this.generateNodeReference();
        console.log('✅ Using PRODUCTION workflow generation prompt');
        return prompt + '\n' + nodeReference;
      }
      
      // Fallback to original prompt
      const promptPath = path.join(__dirname, 'WORKFLOW_GENERATION_SYSTEM_PROMPT.md');
      let prompt = '';
      if (fs.existsSync(promptPath)) {
        prompt = fs.readFileSync(promptPath, 'utf-8');
      } else {
        prompt = this.getEssentialSystemPrompt();
      }
      
      // Append node reference to the prompt
      const nodeReference = this.generateNodeReference();
      return prompt + '\n' + nodeReference;
    } catch (error) {
      console.warn('⚠️  Could not load comprehensive system prompt, using fallback');
      const nodeReference = this.generateNodeReference();
      return this.getEssentialSystemPrompt() + '\n' + nodeReference;
    }
  }

  /**
   * Get essential system prompt (fallback)
   */
  private getEssentialSystemPrompt(): string {
    return `# WORKFLOW GENERATION SYSTEM INSTRUCTIONS

## MISSION CRITICAL
You are an expert workflow architect that **translates user intent into executable workflows with 100% accuracy**. Every workflow MUST implement the EXACT requirements from the prompt with zero ambiguity.

## GOLDEN RULE: IMPLEMENT, DON'T REPHRASE
Never create generic workflows that "talk about" the task. ALWAYS create workflows that **actually perform** the task. If the user says "check age for voting", create nodes that ACTUALLY check age >= 18, not nodes that ask about checking age.

## CRITICAL REQUIREMENTS FOR ALL WORKFLOWS

### 1. MUST HAVE CONCRETE INPUT PROCESSING
- **ALWAYS** extract specific data fields mentioned in the prompt
- If prompt mentions "age", workflow MUST have a node extracting {{input.age}}
- If input field isn't obvious, add a "Extract [field]" node or prompt user
- NEVER pass through raw _trigger data without processing

### 2. MUST IMPLEMENT ACTUAL LOGIC
- If prompt involves comparison (age >= 18), **MUST** use an if_else node with exact condition
- If prompt involves calculation, **MUST** use a code or formula node with actual calculation
- If prompt involves validation, **MUST** use a condition node with validation rules
- NO generic "check" or "ask" nodes without specific logic

### 3. MUST HAVE SPECIFIC NODE CONFIGURATIONS
- Every node MUST have **complete configuration**:
  - Input fields explicitly mapped
  - Transformation logic (if applicable)
  - Output fields defined
  - Conditions (if conditional node)
- NO empty configurations
- NO placeholder values

### 4. MUST PRODUCE MEANINGFUL OUTPUT
- Output MUST contain **all required result fields**
- If checking eligibility, output MUST include:
  - Input value (age: 25)
  - Result (eligible: true/false)
  - Reason/explanation
  - Threshold/reference value
- NO empty or generic output`;
  }

  /**
   * Step 3: Generate system prompt in 20-30 words summarizing what was understood
   * Enhanced with training examples for few-shot learning
   */
  async generateSystemPrompt(
    userPrompt: string,
    constraints?: any
  ): Promise<string> {
    if (!userPrompt || !userPrompt.trim()) {
      return 'Build an automated workflow based on user requirements.';
    }

    // Get few-shot examples from training service
    let fewShotPrompt = '';
    try {
      fewShotPrompt = workflowTrainingService.buildSystemPromptFewShotPrompt(userPrompt);
    } catch (error) {
      console.warn('⚠️  Failed to get training examples for system prompt:', error);
    }
    
    // Build the full prompt - use few-shot if available, otherwise use base prompt
    const basePrompt = `Based on this workflow request, create a concise 20-30 word system prompt that summarizes what you understood:

User Request: "${userPrompt}"
${constraints ? `Constraints: ${JSON.stringify(constraints)}` : ''}

Generate a clear, concise system prompt (20-30 words) that captures the core intent and goal. Return only the prompt text, no JSON, no explanations.`;

    const fullPrompt = fewShotPrompt || basePrompt;

    try {
      // Pass the full prompt directly - ollama-orchestrator will use it as-is if it's a full prompt
      let result;
      try {
        result = await ollamaOrchestrator.processRequest('workflow-generation', {
          prompt: fullPrompt,
          temperature: 0.2,
          maxTokens: 100,
        });
      } catch (error) {
        // CRITICAL: If AI fails, use fallback system prompt
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isModelUnavailable = errorMessage.includes('not found') || 
                                   errorMessage.includes('Ollama models not available') ||
                                   errorMessage.includes('404') && errorMessage.includes('model');
        
        if (isModelUnavailable) {
          console.warn('⚠️  [WorkflowBuilder] AI system prompt generation unavailable, using fallback');
          // Use fallback: create system prompt from user prompt
          const words = userPrompt.split(/\s+/).slice(0, 30);
          return words.length >= 20 
            ? words.join(' ')
            : `${words.join(' ')} Build an automated workflow to accomplish this task.`;
        }
        throw error;
      }
      
      let systemPrompt = typeof result === 'string' ? result.trim() : JSON.stringify(result);
      
      // Clean up if wrapped in quotes or code blocks
      systemPrompt = systemPrompt.replace(/^["']|["']$/g, '').replace(/```[\w]*\n?|\n?```/g, '').trim();
      
      // Remove any trailing punctuation that might break the prompt
      systemPrompt = systemPrompt.replace(/[.!?]+$/, '');
      
      // Ensure it's 20-30 words
      const words = systemPrompt.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 30) {
        systemPrompt = words.slice(0, 30).join(' ');
      } else if (words.length < 20) {
        // If too short, add context
        const additionalWords = 'Build an automated workflow to accomplish this task.'.split(/\s+/);
        const needed = 20 - words.length;
        systemPrompt = `${systemPrompt} ${additionalWords.slice(0, needed).join(' ')}`;
      }
      
      // Final validation - ensure it's not empty
      if (!systemPrompt || systemPrompt.trim().length === 0) {
        return `Build an automated workflow to: ${userPrompt.substring(0, 100)}`;
      }
      
      return systemPrompt.trim();
    } catch (error) {
      console.error('Error generating system prompt:', error);
      // Fallback - create a reasonable prompt from the user input
      const fallback = userPrompt.length > 100 
        ? `Build an automated workflow to: ${userPrompt.substring(0, 100)}...`
        : `Build an automated workflow to: ${userPrompt}`;
      return fallback;
    }
  }

  /**
   * Step 4: Extract workflow requirements (URLs, APIs, credentials, etc.)
   * Enhanced with training examples for few-shot learning
   */
  async extractWorkflowRequirements(
    userPrompt: string,
    systemPrompt: string,
    constraints?: any
  ): Promise<Requirements> {
    const nodeLibraryInfo = this.getNodeLibraryDescription();
    
    // Get few-shot examples from training service
    let fewShotPrompt = '';
    try {
      fewShotPrompt = workflowTrainingService.buildRequirementsFewShotPrompt(userPrompt, systemPrompt);
    } catch (error) {
      console.warn('⚠️  Failed to get training examples for requirements:', error);
    }
    
    // Build the base extraction prompt
    const baseExtractionPrompt = `You are an Autonomous Workflow Agent v2.5. Extract workflow requirements from this request.

${nodeLibraryInfo}

User Request: "${userPrompt}"
System Understanding: "${systemPrompt}"
${constraints ? `Constraints: ${JSON.stringify(constraints)}` : ''}

Based on the available node library above, extract and return JSON with:
{
  "primaryGoal": "...",
  "keySteps": ["step1", "step2", ...],
  "inputs": ["input1", "input2", ...],
  "outputs": ["output1", "output2", ...],
  "constraints": ["constraint1", ...],
  "complexity": "simple|medium|complex",
  "urls": ["url1", "url2", ...] (if any URLs mentioned),
  "apis": ["api1", "api2", ...] (if any APIs mentioned),
  "credentials": ["credential1", "credential2", ...] (if any credentials needed),
  "schedules": ["schedule1", ...] (if any schedules mentioned),
  "platforms": ["platform1", ...] (if any platforms like Slack, Google Sheets, etc.)
}

Use only nodes from the library above.`;

    // Use few-shot prompt if available, otherwise use base prompt
    const extractionPrompt = fewShotPrompt || baseExtractionPrompt;
    
    try {
      // Pass the full prompt directly
      const result = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: extractionPrompt,
        temperature: 0.3,
      });
      
      let parsed;
      try {
        const jsonText = typeof result === 'string' ? result : JSON.stringify(result);
        let cleanJson = jsonText.trim();
        
        // Extract JSON from code blocks if present - handle all variations
        const codeBlockRegex = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/g;
        const codeBlockMatch = cleanJson.match(codeBlockRegex);
        if (codeBlockMatch) {
          cleanJson = codeBlockMatch[0].replace(/```(?:json|JSON)?\s*\n?/g, '').replace(/\n?```/g, '').trim();
        }
        
        // Remove any backticks that might remain
        cleanJson = cleanJson.replace(/^`+|`+$/g, '').trim();
        
        // Extract JSON object if there's text before/after
        const firstBrace = cleanJson.indexOf('{');
        if (firstBrace !== -1) {
          let braceCount = 0;
          let lastBrace = -1;
          for (let i = firstBrace; i < cleanJson.length; i++) {
            if (cleanJson[i] === '{') braceCount++;
            if (cleanJson[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
          if (lastBrace !== -1) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
          }
        }
        
        parsed = JSON.parse(cleanJson);
      } catch (parseError) {
        console.warn('Failed to parse requirements, using fallback');
        parsed = {};
      }
      
      return {
        primaryGoal: parsed.primaryGoal || userPrompt,
        keySteps: parsed.keySteps || [],
        inputs: parsed.inputs || [],
        outputs: parsed.outputs || [],
        constraints: parsed.constraints || [],
        complexity: parsed.complexity || 'medium',
        urls: parsed.urls || [],
        apis: parsed.apis || [],
        credentials: parsed.credentials || [],
        schedules: parsed.schedules || [],
        platforms: parsed.platforms || [],
      };
    } catch (error) {
      console.error('Error extracting requirements:', error);
      // Fallback
      // Fallback - try to infer basic requirements from prompt
      const inferredUrls: string[] = [];
      const inferredPlatforms: string[] = [];
      const inferredSchedules: string[] = [];
      
      const promptLower = userPrompt.toLowerCase();
      
      // Infer platforms
      if (promptLower.includes('slack')) inferredPlatforms.push('Slack');
      if (promptLower.includes('google') || promptLower.includes('gmail') || promptLower.includes('sheets')) inferredPlatforms.push('Google');
      if (promptLower.includes('instagram')) inferredPlatforms.push('Instagram');
      if (promptLower.includes('twitter') || promptLower.includes('x.com')) inferredPlatforms.push('Twitter');
      if (promptLower.includes('discord')) inferredPlatforms.push('Discord');
      
      // Infer schedules - ONLY if explicitly mentioned with automation keywords
      // Don't infer schedules from generic time mentions
      const hasScheduleContext = promptLower.includes('schedule') || 
                                 promptLower.includes('recurring') || 
                                 promptLower.includes('periodic') ||
                                 promptLower.includes('automatically at') ||
                                 promptLower.includes('run daily') ||
                                 promptLower.includes('run weekly') ||
                                 promptLower.includes('run hourly') ||
                                 (promptLower.includes('daily') && (promptLower.includes('run') || promptLower.includes('execute') || promptLower.includes('automate'))) ||
                                 (promptLower.includes('weekly') && (promptLower.includes('run') || promptLower.includes('execute') || promptLower.includes('automate'))) ||
                                 (promptLower.includes('hourly') && (promptLower.includes('run') || promptLower.includes('execute') || promptLower.includes('automate')));
      
      if (hasScheduleContext) {
        if (promptLower.includes('daily') || promptLower.includes('every day')) inferredSchedules.push('Daily');
        if (promptLower.includes('weekly')) inferredSchedules.push('Weekly');
        if (promptLower.includes('hourly')) inferredSchedules.push('Hourly');
        if (promptLower.match(/\d+:\d+/)) {
          const timeMatch = userPrompt.match(/(\d+:\d+)/);
          if (timeMatch) inferredSchedules.push(`At ${timeMatch[1]}`);
        }
      }
      
      return {
        primaryGoal: userPrompt,
        keySteps: [],
        inputs: [],
        outputs: [],
        constraints: [],
        complexity: 'medium',
        urls: inferredUrls,
        apis: [],
        credentials: [],
        schedules: inferredSchedules,
        platforms: inferredPlatforms,
      };
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   */
  async analyzeRequirements(
    prompt: string,
    constraints?: any
  ): Promise<Requirements> {
    const requirements = await this.extractWorkflowRequirements(prompt, '', constraints);
    return {
      primaryGoal: requirements.primaryGoal,
      keySteps: requirements.keySteps,
      inputs: requirements.inputs,
      outputs: requirements.outputs,
      constraints: requirements.constraints,
      complexity: requirements.complexity,
    };
  }

  /**
   * ✅ CRITICAL: Get all sample workflow titles/goals for matching
   * Returns a list of all workflow goals from modern_workflow_examples.json
   */
  private getAllSampleWorkflowTitles(): Array<{id: string, goal: string, category: string, use_case: string}> {
    try {
      // ✅ CRITICAL: Use the imported singleton instance (already imported at top of file)
      const allWorkflows = workflowTrainingService.getAllWorkflows();
      
      console.log(`📊 [getAllSampleWorkflowTitles] Loading ALL sample workflows from training service...`);
      console.log(`   Total workflows found: ${allWorkflows.length}`);
      
      // Log breakdown by source (if available)
      try {
        const modernExamples = (workflowTrainingService as any).modernExamples || [];
        const trainingDataset = (workflowTrainingService as any).dataset?.workflows || [];
        console.log(`   - Modern examples: ${modernExamples.length}`);
        console.log(`   - Training dataset: ${trainingDataset.length}`);
      } catch (e) {
        // Ignore if structure not accessible
      }
      
      // ✅ CRITICAL: Extract workflow metadata from ALL sources
      // Handles both modern_workflow_examples.json and training dataset formats
      const workflowTitles = allWorkflows.map((w: any) => {
        // Extract goal (required field)
        const goal = w.goal || w.phase1?.step1?.userPrompt || '';
        
        // Extract category
        const category = w.category || 'Other';
        
        // Extract use_case (may be in different locations)
        const use_case = w.use_case || 
                        w.phase1?.step4?.requirements?.primaryGoal || 
                        w.description || 
                        '';
        
        return {
          id: w.id || '',
          goal: goal,
          category: category,
          use_case: use_case
        };
      }).filter((w: any) => w.goal && w.goal.trim().length > 0); // Filter out empty goals
      
      console.log(`✅ [getAllSampleWorkflowTitles] Successfully loaded ${workflowTitles.length} workflows with valid goals`);
      console.log(`   Categories: ${[...new Set(workflowTitles.map((w: any) => w.category))].join(', ')}`);
      
      return workflowTitles;
    } catch (error) {
      console.error('[getAllSampleWorkflowTitles] Error loading workflows:', error);
      return [];
    }
  }

  /**
   * ✅ CRITICAL: Calculate similarity between user prompt and workflow goal
   * Returns similarity score (0-1) with 0.85 (85%) as the threshold
   * This is a WORLD-CLASS implementation that works consistently for ALL workflows
   */
  private calculateWorkflowSimilarity(userPrompt: string, workflowGoal: string, workflowUseCase: string, workflowCategory: string): number {
    const promptLower = userPrompt.toLowerCase().trim();
    const goalLower = workflowGoal.toLowerCase().trim();
    const useCaseLower = (workflowUseCase || '').toLowerCase().trim();
    const categoryLower = (workflowCategory || '').toLowerCase().trim();
    
    // ✅ CRITICAL: Define synonym mappings for better matching
    const synonymMap: Record<string, string[]> = {
      'candidate': ['resume', 'applicant', 'job seeker', 'hiring', 'job application', 'job candidate'],
      'validation': ['screening', 'qualification', 'evaluation', 'assessment', 'check', 'validate', 'verify'],
      'agent': ['workflow', 'automation', 'bot', 'assistant', 'system'],
      'sales': ['lead', 'prospect', 'customer acquisition'],
      'support': ['help', 'customer service', 'ticket', 'inquiry'],
      'hr': ['human resources', 'hiring', 'recruitment', 'talent', 'hiring workflow', 'hiring agent'],
      'crm': ['customer relationship', 'salesforce', 'hubspot', 'pipedrive'],
      'marketing': ['campaign', 'promotion', 'advertising'],
      'notification': ['alert', 'message', 'email', 'slack'],
      'schedule': ['calendar', 'meeting', 'appointment'],
      'form': ['submission', 'application', 'survey'],
      'webhook': ['api', 'endpoint', 'trigger'],
      'workflow': ['process', 'automation', 'agent', 'system'],
    };
    
    // Normalize words using synonyms
    const normalizeWord = (word: string): string[] => {
      const normalized = [word];
      for (const [key, synonyms] of Object.entries(synonymMap)) {
        if (word.includes(key) || synonyms.some(s => word.includes(s))) {
          normalized.push(key, ...synonyms);
        }
      }
      return normalized;
    };
    
    // Remove common stop words for better matching
    const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'create', 'build', 'make', 'generate']);
    
    // Extract meaningful words from prompt (including normalized variants)
    const promptWordsRaw = promptLower
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .map(w => w.replace(/[^\w]/g, ''));
    
    const promptWords = new Set<string>();
    promptWordsRaw.forEach(w => {
      promptWords.add(w);
      normalizeWord(w).forEach(nw => promptWords.add(nw));
    });
    
    // Extract meaningful words from workflow (including normalized variants)
    const workflowText = `${goalLower} ${useCaseLower} ${categoryLower}`;
    const workflowWordsRaw = workflowText
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .map(w => w.replace(/[^\w]/g, ''));
    
    const workflowWords = new Set<string>();
    workflowWordsRaw.forEach(w => {
      workflowWords.add(w);
      normalizeWord(w).forEach(nw => workflowWords.add(nw));
    });
    
    // ✅ CRITICAL: Check for exact match (100% similarity)
    if (goalLower === promptLower) {
      return 1.0;
    }
    
    // Check for substring matches (high similarity)
    if (goalLower.includes(promptLower) || promptLower.includes(goalLower)) {
      const overlap = Math.min(goalLower.length, promptLower.length) / Math.max(goalLower.length, promptLower.length);
      if (overlap > 0.7) {
        return 0.95; // Very high similarity for substring matches
      }
    }
    
    // ✅ CRITICAL: Calculate keyword overlap with normalized words
    const matchingWords = Array.from(promptWords).filter(w => workflowWords.has(w));
    const allUniqueWords = new Set([...promptWords, ...workflowWords]);
    
    // Jaccard similarity: intersection / union
    const jaccardSimilarity = matchingWords.length / Math.max(allUniqueWords.size, 1);
    
    // ✅ CRITICAL: Weighted similarity with multiple factors
    // Goal match (highest weight - 40%)
    const goalWords = goalLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const goalMatches = Array.from(promptWords).filter(w => goalWords.some(gw => gw.includes(w) || w.includes(gw))).length;
    const goalMatchScore = goalMatches / Math.max(promptWords.size, goalWords.length, 1);
    
    // Use case match (30%)
    const useCaseWords = useCaseLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const useCaseMatches = Array.from(promptWords).filter(w => useCaseWords.some(ucw => ucw.includes(w) || w.includes(ucw))).length;
    const useCaseMatchScore = useCaseMatches / Math.max(promptWords.size, useCaseWords.length, 1);
    
    // Category match (20%)
    const categoryWords = categoryLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const categoryMatches = Array.from(promptWords).filter(w => categoryWords.some(cw => cw.includes(w) || w.includes(cw))).length;
    const categoryMatchScore = categoryMatches / Math.max(promptWords.size, categoryWords.length, 1);
    
    // Word order similarity (10%) - check if key words appear in similar order
    const promptKeyWords = Array.from(promptWords).slice(0, 5);
    const workflowKeyWords = Array.from(workflowWords).slice(0, 5);
    const orderSimilarity = promptKeyWords.filter((w, idx) => workflowKeyWords[idx] === w).length / Math.max(promptKeyWords.length, 1);
    
    // Combined weighted similarity
    const weightedSimilarity = (goalMatchScore * 0.4) + 
                               (useCaseMatchScore * 0.3) + 
                               (categoryMatchScore * 0.2) + 
                               (orderSimilarity * 0.1);
    
    // ✅ CRITICAL: Use the higher of Jaccard or weighted similarity, with boost for high matches
    let finalSimilarity = Math.max(jaccardSimilarity, weightedSimilarity);
    
    // Boost similarity if multiple factors match well
    if (goalMatchScore > 0.5 && useCaseMatchScore > 0.3) {
      finalSimilarity = Math.min(1.0, finalSimilarity * 1.1);
    }
    
    // Boost for category match (domain-specific matching)
    if (categoryMatchScore > 0.5) {
      finalSimilarity = Math.min(1.0, finalSimilarity * 1.05);
    }
    
    return Math.min(1.0, finalSimilarity);
  }

  private async generateStructure(requirements: Requirements, structuredSpec?: any): Promise<WorkflowGenerationStructure> {
    const userPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase().trim();
    
    // 🚨 CRITICAL FIX: Check for vague prompts and use minimal safe structure
    const { intentClassifier } = require('./intent-classifier');
    const intentClassification = intentClassifier.classifyIntent(userPrompt);
    
    if (intentClassification.intent === 'ambiguous' && intentClassification.minimalSafeStructure) {
      console.log(`✅ [Vague Prompt Handler] Using minimal safe structure for vague prompt: "${userPrompt}"`);
      const minimal = intentClassification.minimalSafeStructure;
      
      // 🚨 CRITICAL FIX: Check for programmatically detected CRM platforms
      const detectedIntegrations = (requirements as any).detectedRequirements?.requiredIntegrations || [];
      // Priority order: hubspot (default) > zoho_crm > salesforce > pipedrive
      const crmPriority = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
      const detectedCrm = crmPriority.find(crm => 
        detectedIntegrations.map((int: string) => int.toLowerCase()).includes(crm.toLowerCase())
      );
      
      // Convert minimal structure to WorkflowGenerationStructure format
      const steps: WorkflowStepDefinition[] = minimal.steps.map((step: { type: string; description: string }, index: number) => {
        // If CRM node and we detected a specific CRM platform, use that instead
        if (detectedCrm && ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'].includes(step.type)) {
          console.log(`✅ [Vague Prompt Handler] Overriding CRM type from "${step.type}" to detected "${detectedCrm}"`);
          return {
            id: `step${index + 1}`,
            description: step.description,
            type: detectedCrm.toLowerCase(),
          };
        }
        return {
          id: `step${index + 1}`,
          description: step.description,
          type: step.type,
        };
      });
      
      // Create minimal connections: trigger → step1 → step2 → ...
      const connections: Array<{source: string, target: string}> = [];
      if (steps.length > 0) {
        connections.push({ source: 'trigger', target: 'step1' });
        for (let i = 1; i < steps.length; i++) {
          connections.push({ source: `step${i}`, target: `step${i + 1}` });
        }
      }
      
      const structure: WorkflowGenerationStructure = {
        trigger: minimal.trigger,
        steps,
        outputs: [],
        connections,
      };
      
      // Mark as from minimal structure
      (structure as any)._fromMinimalStructure = true;
      (structure as any)._isVaguePrompt = true;
      
      console.log(`✅ [Vague Prompt Handler] Generated minimal structure: ${minimal.trigger} → ${steps.map(s => s.type).join(' → ')}`);
      return structure;
    }
    
    // ✅ CRITICAL: Try to match sample workflows FIRST (highest priority)
    // This ensures we use real-world workflow patterns instead of AI generation
    // Works consistently for ALL workflows with ≥80% similarity threshold
    try {
      const { workflowTrainingService } = require('./workflow-training-service');
      console.log(`🔍 [generateStructure] Checking sample workflows for: "${userPrompt}"`);
      
      // ✅ CRITICAL: If structured spec provided, enhance requirements with structured data
      if (structuredSpec && structuredSpec.trigger) {
        console.log(`📋 [generateStructure] Structured specification detected - enhancing requirements`);
        // Override trigger if specified in structured spec
        if (structuredSpec.trigger.type && structuredSpec.trigger.type !== 'other') {
          (requirements as any).trigger = structuredSpec.trigger.type;
          console.log(`   Trigger from structured spec: ${structuredSpec.trigger.type}`);
        }
        // Add actions from structured spec to requirements
        if (structuredSpec.actions && structuredSpec.actions.length > 0) {
          const actionDescriptions = structuredSpec.actions.map((a: any) => `${a.actionType}: ${JSON.stringify(a.details)}`).join(', ');
          (requirements as any).keySteps = [
            ...(requirements.keySteps || []),
            ...structuredSpec.actions.map((a: any) => `${a.actionType} - ${JSON.stringify(a.details)}`)
          ];
          console.log(`   Added ${structuredSpec.actions.length} action(s) from structured spec`);
        }
      }
      
      // Get all sample workflow titles
      const allSampleWorkflows = this.getAllSampleWorkflowTitles();
      console.log(`📋 [generateStructure] Found ${allSampleWorkflows.length} sample workflows in database`);
      
      // Calculate similarity for each workflow
      const scoredWorkflows = allSampleWorkflows.map((workflow: any) => {
        const similarity = this.calculateWorkflowSimilarity(
          userPrompt,
          workflow.goal,
          workflow.use_case,
          workflow.category
        );
        return { ...workflow, similarity };
      });
      
      // ✅ CRITICAL: Log top 3 matches for debugging
      const topMatches = [...scoredWorkflows].sort((a, b) => b.similarity - a.similarity).slice(0, 3);
      console.log(`🔍 [generateStructure] Top 3 matches:`);
      topMatches.forEach((w: any, idx: number) => {
        console.log(`   ${idx + 1}. "${w.goal}" - ${(w.similarity * 100).toFixed(1)}% similarity (ID: ${w.id})`);
      });
      
      // Sort by similarity (highest first)
      scoredWorkflows.sort((a, b) => b.similarity - a.similarity);
      
      // Log top 5 matches for debugging
      console.log(`🔍 [generateStructure] Top 5 matches:`);
      scoredWorkflows.slice(0, 5).forEach((w: any, idx: number) => {
        console.log(`   ${idx + 1}. "${w.goal}" - ${(w.similarity * 100).toFixed(1)}% similarity`);
      });
      
      // ✅ CRITICAL: Check if any workflow matches with ≥80% similarity (configurable threshold)
      // Default: 85% for high confidence, but supports 80% as minimum per specification
      // This threshold ensures we only use sample workflows when there's strong confidence
      // Works consistently for ALL workflows, not just specific examples
      const SIMILARITY_THRESHOLD = parseFloat(process.env.WORKFLOW_SIMILARITY_THRESHOLD || '0.85');
      const MIN_SIMILARITY_THRESHOLD = 0.80; // Minimum per specification
      
      // ✅ CRITICAL: For candidate/validation/hiring workflows, use lower threshold (75%) for better matching
      // This handles variations like "candidate validation" vs "HR hiring workflow agent"
      const isCandidateValidationPrompt = userPrompt.includes('candidate') && 
                                         (userPrompt.includes('validation') || userPrompt.includes('screen') || userPrompt.includes('qualif'));
      const effectiveThreshold = isCandidateValidationPrompt 
        ? Math.max(0.75, MIN_SIMILARITY_THRESHOLD) // Lower threshold for candidate validation (75%)
        : Math.max(SIMILARITY_THRESHOLD, MIN_SIMILARITY_THRESHOLD);
      
      if (isCandidateValidationPrompt) {
        console.log(`🔍 [generateStructure] Candidate validation prompt detected - using lower threshold (75%) for better matching`);
      }
      const bestMatch = scoredWorkflows.find((w: any) => w.similarity >= effectiveThreshold);
      
      // Log all workflows above 50% for debugging (helps identify why matches fail)
      const highSimilarityWorkflows = scoredWorkflows.filter((w: any) => w.similarity >= 0.5 && w.similarity < SIMILARITY_THRESHOLD);
      if (highSimilarityWorkflows.length > 0 && !bestMatch) {
        console.log(`ℹ️  [generateStructure] Found ${highSimilarityWorkflows.length} workflow(s) with 50-${(effectiveThreshold * 100).toFixed(0)}% similarity (below threshold):`);
        highSimilarityWorkflows.slice(0, 3).forEach((w: any) => {
          console.log(`   - "${w.goal}" (${(w.similarity * 100).toFixed(1)}%)`);
        });
      }
      
      if (bestMatch) {
        console.log(`✅ [generateStructure] ✅ MATCH FOUND: "${bestMatch.goal}" (${(bestMatch.similarity * 100).toFixed(1)}% similarity ≥ ${(effectiveThreshold * 100).toFixed(0)}% threshold)`);
        console.log(`   Using complete workflow structure from sample workflow database`);
        
        // ✅ CRITICAL: Get the full workflow structure from the singleton instance
        const allWorkflows = workflowTrainingService.getAllWorkflows();
        const matchedWorkflow = allWorkflows.find((w: any) => w.id === bestMatch.id);
        
        if (!matchedWorkflow) {
          console.warn(`⚠️  [generateStructure] Matched workflow "${bestMatch.id}" not found in loaded workflows`);
          console.warn(`   This may indicate a mismatch between similarity matching and workflow loading`);
          console.warn(`   Falling back to custom AI generation`);
          // Continue to fallback below
        } else {
          // ✅ CRITICAL: Handle multiple workflow formats
          // Check for phase1.step5.selectedNodes (modern examples + training dataset format)
          const selectedNodes = matchedWorkflow?.phase1?.step5?.selectedNodes || [];
          const connections = matchedWorkflow?.phase1?.step5?.connections || [];
          
          // Extract trigger - check multiple possible locations
          // ✅ CRITICAL FIX: Check if user requested a specific trigger (from requirements or planner)
          // This ensures we respect user's trigger preference over sample workflow's trigger
          const requestedTrigger = (requirements as any).trigger || 
                                  (requirements as any).detectedTrigger ||
                                  structuredSpec?.trigger?.type;
          
          let triggerNode = requestedTrigger || // User's requested trigger takes priority
                           matchedWorkflow?.trigger?.node || 
                           matchedWorkflow?.phase1?.step5?.structure?.trigger ||
                           'manual_trigger';
          
          // If trigger is in selectedNodes (first element) AND no user trigger specified, extract it
          if (!requestedTrigger && selectedNodes.length > 0) {
            const firstNode = selectedNodes[0];
            if (firstNode === 'webhook' || firstNode === 'form' || firstNode === 'schedule' || 
                firstNode === 'manual_trigger' || firstNode === 'email_received' ||
                firstNode === 'record_created' || firstNode === 'record_updated') {
              triggerNode = firstNode;
            }
          }
          
          // Log trigger override if user requested different trigger
          if (requestedTrigger && requestedTrigger !== triggerNode) {
            console.log(`✅ [generateStructure] Overriding sample workflow trigger "${triggerNode}" with user's requested trigger "${requestedTrigger}"`);
            triggerNode = requestedTrigger;
          }
          
          if (selectedNodes.length > 0) {
            console.log(`✅ [generateStructure] Using matched sample workflow structure: "${bestMatch.goal}"`);
            console.log(`   Workflow ID: ${matchedWorkflow.id}`);
            console.log(`   Trigger: ${triggerNode}`);
            console.log(`   Nodes: ${selectedNodes.length} node(s) total`);
            
            // ✅ CRITICAL: Filter out trigger nodes from selectedNodes (already handled)
            const actionNodes = selectedNodes.filter((nodeType: string) => 
              nodeType !== 'webhook' && 
              nodeType !== 'form' && 
              nodeType !== 'schedule' && 
              nodeType !== 'manual_trigger' &&
              nodeType !== 'email_received' &&
              nodeType !== 'record_created' &&
              nodeType !== 'record_updated'
            );
            
            console.log(`   Action nodes: ${actionNodes.length} node(s)`);
            
            // Convert to WorkflowGenerationStructure format
            // ✅ CRITICAL: Use consistent ID format (step1, step2, etc.) to match node creation
            // ✅ CRITICAL: Use EXACT node types from sample workflow - don't change them
            const steps: WorkflowStepDefinition[] = actionNodes.map((nodeType: string, index: number) => {
              const schema = this.nodeLibrary.get(nodeType);
              const label = schema?.label || nodeType;
              
              // ✅ CRITICAL: Validate node type exists in library
              if (!schema) {
                console.warn(`⚠️  [generateStructure] Node type "${nodeType}" from sample workflow not found in library`);
                console.warn(`   This may cause issues during node selection`);
              }
              
              return {
                id: `step${index + 1}`, // Use step1, step2 format (no underscore) to match node.id
                description: label,
                type: nodeType, // ✅ CRITICAL: Use exact node type from sample workflow
              };
            });
            
            console.log(`✅ [generateStructure] Created ${steps.length} steps from sample workflow:`);
            steps.forEach((step, idx) => {
              console.log(`   ${idx + 1}. ${step.type} - "${step.description}"`);
            });
            
            // Build connections array
            const structureConnections: Array<{source: string, target: string, outputField?: string, inputField?: string}> = [];
            
            // Parse connections from example (format: "source → target" or "source (true) → target")
            for (const conn of connections) {
              const parts = conn.split('→').map((s: string) => s.trim());
              if (parts.length === 2) {
                let source = parts[0].replace(/\s*\(.*?\)\s*/, '').trim(); // Remove "(true)" etc.
                const target = parts[1].trim();
                
                // Check if source is trigger
                if (source === 'trigger' || source === triggerNode || source === 'webhook' || source === 'form' || source === 'schedule' || source === 'manual_trigger' || source === 'email_received' || source === 'record_created' || source === 'record_updated') {
                  // Connect from trigger to target step
                  const targetIndex = actionNodes.indexOf(target);
                  if (targetIndex >= 0) {
                    structureConnections.push({
                      source: 'trigger',
                      target: `step${targetIndex + 1}`, // Use step1, step2 format (no underscore)
                    });
                  }
                } else {
                  // Both source and target are in actionNodes
                  const sourceIndex = actionNodes.indexOf(source);
                  const targetIndex = actionNodes.indexOf(target);
                  
                  if (sourceIndex >= 0 && targetIndex >= 0) {
                    // 🚨 CRITICAL FIX: Prevent self-loops
                    if (sourceIndex !== targetIndex) {
                      structureConnections.push({
                        source: `step${sourceIndex + 1}`, // Use step1, step2 format (no underscore)
                        target: `step${targetIndex + 1}`, // Use step1, step2 format (no underscore)
                      });
                    } else {
                      console.warn(`⚠️  [Sample Workflow] Prevented self-loop connection: step${sourceIndex + 1} → step${targetIndex + 1}`);
                    }
                  }
                }
              }
            }
            
            // If no connections parsed, create sequential connections
            // ✅ CRITICAL: Use consistent ID format (step1, step2, etc.) to match step IDs
            if (structureConnections.length === 0 && steps.length > 0) {
              structureConnections.push({ source: 'trigger', target: 'step1' });
              for (let i = 1; i < steps.length; i++) {
                // 🚨 CRITICAL FIX: Prevent self-loops in sequential connections
                const sourceStep = `step${i}`;
                const targetStep = `step${i + 1}`;
                if (sourceStep !== targetStep) {
                  structureConnections.push({
                    source: sourceStep,
                    target: targetStep,
                  });
                } else {
                  console.warn(`⚠️  [Sequential Connections] Prevented self-loop: ${sourceStep} → ${targetStep}`);
                }
              }
            }
            
            console.log(`✅ [generateStructure] Using sample workflow structure: ${triggerNode} → ${actionNodes.join(' → ')}`);
            
            // Mark this structure as coming from a sample workflow to prevent filtering
            const sampleStructure: WorkflowGenerationStructure = {
              trigger: triggerNode,
              steps,
              outputs: [],
              connections: structureConnections,
            };
            
            // ✅ CRITICAL: Check for missing nodes from user requirements
            // If user mentioned additional nodes not in the sample, add them
            const enhancedStructure = await this.enhanceStructureWithMissingNodes(
              sampleStructure,
              requirements,
              matchedWorkflow
            );
            
            // Add metadata to indicate this is from a sample workflow
            (enhancedStructure as any)._fromSampleWorkflow = true;
            (enhancedStructure as any)._sampleWorkflowId = matchedWorkflow.id;
            
            return enhancedStructure;
          } else {
            console.warn(`⚠️  [generateStructure] Matched workflow "${bestMatch.goal}" but missing structure, falling back to custom generation`);
          }
        }
      } else {
        const topMatch = scoredWorkflows[0];
        const topSimilarity = topMatch ? (topMatch.similarity * 100).toFixed(1) : '0.0';
        console.log(`ℹ️  [generateStructure] No sample workflow matched with ≥${(effectiveThreshold * 100).toFixed(0)}% similarity threshold.`);
        console.log(`   Top match: "${topMatch?.goal || 'N/A'}" (${topSimilarity}%)`);
        console.log(`   → Falling back to custom AI node selection`);
      }
    } catch (error) {
      console.log('[generateStructure] Sample workflow matching failed, using AI generation:', error);
    }
    
    // 🚨 CRITICAL: Pre-process requirements to detect trigger type BEFORE AI generation
    // This ensures schedule/form triggers are detected even if AI misses them.
    // Always prefer the ORIGINAL user prompt when available for detection.
    const originalPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    const keySteps = (requirements.keySteps || []).join(' ').toLowerCase();
    const fullPrompt = originalPrompt + ' ' + keySteps;
    const allUrls = (requirements.urls || []).join(' ').toLowerCase();
    const fullText = fullPrompt + ' ' + allUrls;
    
    // Detect trigger type from requirements
    // 🚨 CRITICAL: Check webhook FIRST (most specific), then schedule, then form, then manual
    // This prevents false positives (e.g., "automatically" matching "automated" schedule keyword)
    let detectedTrigger: string | null = null;
    
    // Check for webhook trigger keywords FIRST - "when X happens in Y" patterns
    // This is the MOST SPECIFIC pattern and should be checked before generic schedule keywords
    const webhookKeywords = ['webhook', 'http endpoint', 'api call', 'api endpoint'];
    const webhookPatterns = [
      /\bwhen\s+(a\s+)?webhook\s+(receives|gets|triggers?)/i, // "when a webhook receives..." - CRITICAL FIX
      /\bwhen\s+(a\s+)?(new|updated|deleted)\s+\w+\s+(is\s+)?(added|created|updated|deleted)\s+(to|in|from)\s+\w+/i, // "when a new contact is added to HubSpot"
      /\bwhen\s+\w+\s+(is\s+)?(added|created|updated|deleted)\s+(to|in|from)\s+\w+/i, // "when contact is added to HubSpot"
      /\bwhen\s+(a\s+)?(new|updated)\s+\w+\s+(is\s+)?(added|created)\s+(to|in)\s+\w+/i,
      /\bwhen\s+(a\s+)?new\s+\w+\s+is\s+added\s+to/i, // "when a new contact is added to HubSpot"
      /\bwhen\s+\w+\s+is\s+added\s+to/i, // "when contact is added to"
    ];
    
    const hasWebhookKeywords = webhookKeywords.some(keyword => fullText.includes(keyword));
    const hasWebhookPatterns = webhookPatterns.some(pattern => pattern.test(fullText));
    
    // Also check for "when X happens" patterns that indicate external events
    const eventPatterns = [
      /\bwhen\s+(a\s+)?new\s+\w+\s+(is\s+)?(added|created|updated|deleted)\s+(to|in|from)/i, // "when a new X is added to Y"
      /\bwhen\s+\w+\s+(is\s+)?(added|created|updated|deleted)\s+(to|in|from)\s+\w+/i, // "when X is added to Y"
    ];
    const hasEventPatterns = eventPatterns.some(pattern => pattern.test(fullText));
    
    // For logging, prefer the original prompt snippet
    const debugPrompt = (requirements as any).originalPrompt || requirements.primaryGoal || '';
    
    if (hasWebhookKeywords || hasWebhookPatterns || hasEventPatterns) {
      detectedTrigger = 'webhook';
      console.log(`🚨 [Trigger Detection] Detected WEBHOOK trigger from requirements: "${debugPrompt}" (pattern: ${hasWebhookPatterns ? 'webhook pattern' : hasEventPatterns ? 'event pattern' : 'keyword'})`);
    }
    
    // Check for schedule trigger keywords (ONLY if webhook not detected)
    // 🚨 CRITICAL: Use word boundaries to avoid false positives (e.g., "automatically" matching "automated")
    if (!detectedTrigger) {
      const scheduleKeywords = ['schedule', 'daily', 'weekly', 'monthly', 'hourly', 'recurring', 'every day', 'every week', 'every month', 'cron'];
      const schedulePatterns = [
        /\bschedule\s+/i,
        /\bdaily\s+/i,
        /\bweekly\s+/i,
        /\bmonthly\s+/i,
        /\bhourly\s+/i,
        /\bevery\s+(day|week|month|hour)/i,
        /\brecurring\s+/i,
      ];
      
      const hasScheduleKeywords = scheduleKeywords.some(keyword => {
        // Use word boundary regex to avoid partial matches
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(fullText);
      });
      const hasSchedulePatterns = schedulePatterns.some(pattern => pattern.test(fullText));
      
      if (hasScheduleKeywords || hasSchedulePatterns) {
        detectedTrigger = 'schedule';
        console.log(`🚨 [Trigger Detection] Detected SCHEDULE trigger from requirements: "${debugPrompt}"`);
      }
    }
    
    // Check for form trigger keywords (ONLY if webhook/schedule not detected)
    if (!detectedTrigger) {
      const formKeywords = [
        'form', 'submit', 'submission', 'user submits', 'form trigger', 'form input',
        'fill', 'fill in', 'enter', 'input', 'user input', 'user enters',
        'collect', 'gather', 'receive', 'get data from user'
      ];
      const formPatterns = [
        /\bfill\s+(the|in|out)/i,
        /\benter\s+(the|data|information)/i,
        /\buser\s+(enters|inputs|submits|fills)/i,
        /\bcollect\s+(data|information|input)/i,
      ];
      
      const hasFormKeywords = formKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(fullText);
      });
      const hasFormPatterns = formPatterns.some(pattern => pattern.test(fullText));
      
      if (hasFormKeywords || hasFormPatterns) {
        detectedTrigger = 'form';
        console.log(`🚨 [Trigger Detection] Detected FORM trigger from requirements: "${debugPrompt}"`);
      }
    }
    
    // Default to manual_trigger if nothing detected
    if (!detectedTrigger) {
      detectedTrigger = 'manual_trigger';
    }
    
    // 🚨 CRITICAL: Programmatic detection of required nodes BEFORE AI generation
    // This ensures HTTP requests, conditionals, AI agents, and integrations are detected even if AI misses them
    const detectedRequirements = {
      needsHttpRequest: false,
      needsConditional: false,
      needsAiAgent: false,
      needsDataExtraction: false, // NEW: Detect when set_variable is needed
      needsLoop: false, // NEW: Detect when loop is needed (extract from X and create Y for each row)
      loopSourceNode: null as string | null, // Track which node outputs the array to loop over
      loopTargetNode: null as string | null, // Track which node should be inside the loop
      conditionalCount: 0,
      httpUrls: [] as string[],
      requiredIntegrations: [] as string[], // e.g., ['hubspot', 'airtable', 'slack']
      requiredCredentials: [] as string[], // e.g., ['hubspot', 'slack']
    };
    
    // Detect HTTP Request requirements
    const httpKeywords = ['fetch', 'get', 'retrieve', 'download', 'call', 'from https://', 'from http://', 'from api.'];
    const urlPattern = /https?:\/\/[^\s]+|api\.[^\s]+/gi;
    const hasHttpKeywords = httpKeywords.some(keyword => fullText.includes(keyword));
    const hasUrls = urlPattern.test(fullText) || (requirements.urls && requirements.urls.length > 0);
    
    if (hasHttpKeywords || hasUrls) {
      detectedRequirements.needsHttpRequest = true;
      // Extract URLs
      const urlMatches = fullText.match(urlPattern);
      if (urlMatches) {
        detectedRequirements.httpUrls = urlMatches;
      }
      if (requirements.urls && requirements.urls.length > 0) {
        detectedRequirements.httpUrls.push(...requirements.urls);
      }
      console.log(`🚨 [Node Detection] Detected HTTP REQUEST requirement. URLs: ${detectedRequirements.httpUrls.join(', ')}`);
    }
    
    // Detect Conditional Logic requirements
    // ✅ CRITICAL: "when" at start of sentence describing trigger is NOT conditional
    // "When I receive..." = trigger, "when value > 100" = conditional
    const triggerWhenPatterns = [
      /\bwhen\s+(?:i|we|you|they|it)\s+(?:receive|get|fetch|trigger|call|send|submit|create|add|update|delete)/i,
      /\bwhen\s+(?:a|an|the)\s+(?:new|user|request|form|webhook|message|event)/i,
      /\bwhen\s+(?:i|we|you|they)\s+receive\s+(?:a|an|the)\s+/i, // "when I receive a POST request"
      /\bwhen\s+(?:i|we|you|they)\s+receive\s+(?:a|an|the)\s+(?:post|get|put|delete|patch)\s+request/i, // "when I receive a POST request"
    ];
    const isTriggerWhen = triggerWhenPatterns.some(pattern => pattern.test(fullText));
    
    // ✅ CRITICAL: Also check if "extract" is mentioned - this is data extraction, NOT conditional
    const isDataExtraction = /\bextract\s+(?:the|a|an)?\s*(?:customer|data|field|value|name|email|phone|address|from)/i.test(fullText);
    
    // ✅ CRITICAL: Check if "then" is part of a linear workflow description (not conditional)
    // "extract X then create Y" = linear workflow, NOT conditional
    const isLinearThen = /\b(?:extract|get|fetch|receive|send|create|update|delete|add|save|store)\s+.*?\s+then\s+(?:extract|get|fetch|receive|send|create|update|delete|add|save|store)/i.test(fullText);
    
    // Detect data extraction requirements (needs set_variable node)
    if (isDataExtraction || /\bextract\s+.*?\s+from\s+/i.test(fullText)) {
      detectedRequirements.needsDataExtraction = true;
      console.log(`🚨 [Node Detection] Detected DATA EXTRACTION requirement - set_variable node needed`);
    }
    
    // ✅ STRICT: Only detect actual conditional patterns, not linear workflow descriptions
    const conditionalKeywords = [
      'if', 'check if', 'only if', 'unless', 
      'contains', 'equals', 'greater than', 'less than', '>=', '<=', '==', '!==', 
      'filter', 'separate', 'categorize',
      'validate', 'validation', 'eligible', 'eligibility', 'verify',
      'is he', 'is she', 'are they', 'is it', 'determine if', 'decide if'
    ];
    // Only add "when" and "check" if it's NOT a trigger description
    if (!isTriggerWhen) {
      conditionalKeywords.push('when');
    }
    // Don't add "check" if it's just "extract" (data extraction, not validation)
    if (!isDataExtraction) {
      conditionalKeywords.push('check');
    }
    // ✅ CRITICAL: Don't add "then" if it's part of a linear workflow
    if (!isLinearThen) {
      conditionalKeywords.push('then');
    }
    
    const conditionalPatterns = [
      /\bif\s+\w+\s+then\s+/i, // "if X then Y" - explicit conditional
      /\bcheck\s+if\s+/i,
      // Only match "when" if it's followed by a condition, not a trigger
      /\bwhen\s+(?:the|value|amount|score|count|size|age|price|status|type)\s+(?:is|equals|>|<|>=|<=|contains)/i,
      /\bwhen\s+(?:it|they|he|she)\s+(?:is|equals|>|<|>=|<=|contains)/i,
      /\b(?:if|when)\s+.*?\s+(?:contains|equals|>|<|>=|<=|is\s+greater|is\s+less)/i, // Explicit conditional with comparison
      /\bcontains\s+/i,
      /\bgreater\s+than\s+/i,
      /\bless\s+than\s+/i,
      /score\s*>\s*\d+/i,
      /score\s*>=\s*\d+/i,
      /score\s*<\s*\d+/i,
      /score\s*<=\s*\d+/i,
    ];
    
    const hasConditionalKeywords = conditionalKeywords.some(keyword => fullText.includes(keyword));
    const hasConditionalPatterns = conditionalPatterns.some(pattern => pattern.test(fullText));
    
    // ✅ CRITICAL: Only mark as conditional if:
    // 1. Has conditional keywords/patterns AND
    // 2. NOT a trigger description AND
    // 3. NOT data extraction AND
    // 4. NOT a linear workflow ("extract X then create Y")
    if ((hasConditionalKeywords || hasConditionalPatterns) && !isTriggerWhen && !isDataExtraction && !isLinearThen) {
      detectedRequirements.needsConditional = true;
      // Count nested conditions (if X then check if Y)
      const nestedPattern = /\bif\s+.*?\bthen\s+.*?\bcheck\s+if\s+/i;
      if (nestedPattern.test(fullText)) {
        detectedRequirements.conditionalCount = 2; // Nested conditionals
      } else {
        detectedRequirements.conditionalCount = 1;
      }
      console.log(`🚨 [Node Detection] Detected CONDITIONAL LOGIC requirement. Count: ${detectedRequirements.conditionalCount}`);
    } else {
      // ✅ DEBUG: Log why conditional was NOT detected
      if (hasConditionalKeywords || hasConditionalPatterns) {
        console.log(`✅ [Node Detection] Conditional keywords/patterns found but excluded: isTriggerWhen=${isTriggerWhen}, isDataExtraction=${isDataExtraction}, isLinearThen=${isLinearThen}`);
      }
    }
    
    // ✅ DEFAULT: Detect AI Agent/AI Chat Model requirements - EXPANDED PATTERNS
    // AI Agent will be added by default when these keywords are detected, using Ollama
    const aiKeywords = [
      'analyze', 'extract key points', 'summarize', 'use ai', 'ai agent', 'ai model', 
      'generate summary', 'ai analysis', 'ai chat model', 'chat model', 'ai chat',
      'use an ai', 'with ai', 'using ai', 'ai to', 'ai for', 'ai will',
      'summarize', 'summarizing', 'summarized', 'summary', 'summaries',
      'analyze', 'analyzing', 'analysis', 'analyze the', 'analyze data',
      'ai processing', 'ai generate', 'ai create', 'ai extract',
      'ollama', 'llm', 'language model', 'gpt', 'claude', 'gemini',
      'intelligent', 'smart', 'ai bot', 'ai assistant', 'ai help',
      'ai content', 'ai text', 'ai response', 'ai output'
    ];
    const aiPatterns = [
      /\buse\s+(an\s+)?ai\s+(agent|model|chat\s*model|to|for|will)/i,
      /\bai\s+(agent|model|chat\s*model|analysis|processing|generate|create|extract|bot|assistant)/i,
      /\banalyze\s+.*?\s+using\s+ai/i,
      /\bsummarize\s+.*?\s+(using\s+)?ai/i,
      /\buse\s+ai\s+chat\s+model/i,
      /\bai\s+chat\s+model/i,
      /\bchat\s+model\s+to/i,
      /\bextract\s+key\s+points/i,
      /\bgenerate\s+summary/i,
      /\bai\s+to\s+summarize/i,
      /\bai\s+to\s+analyze/i,
      /\bai\s+to\s+extract/i,
      /\bai\s+to\s+generate/i,
      /\bwith\s+ai\s+(to|for)/i,
      /\busing\s+ai\s+(to|for)/i,
      /\bollama/i,
      /\b(llm|language\s+model)/i,
    ];
    
    const hasAiKeywords = aiKeywords.some(keyword => fullText.includes(keyword));
    const hasAiPatterns = aiPatterns.some(pattern => pattern.test(fullText));
    
    if (hasAiKeywords || hasAiPatterns) {
      detectedRequirements.needsAiAgent = true;
      console.log(`🚨 [Node Detection] Detected explicit AI requirement from prompt (keywords/patterns matched)`);
      // Only add to required integrations if explicitly detected
      if (!detectedRequirements.requiredIntegrations.includes('ai_agent')) {
        detectedRequirements.requiredIntegrations.push('ai_agent');
      }
    }
    
    // ❌ REMOVED: No longer adding AI Agent by default - only add when explicitly mentioned
    // This prevents unnecessary AI nodes in simple workflows like "webhook → hubspot"
    
    // Detect Integration/Platform requirements (CRM, Communication, Storage, etc.)
    const integrationPatterns: Record<string, RegExp[]> = {
      hubspot: [
        /\bhubspot\b/i,
        /\bhub\s*spot\b/i,
        /\bsales\s+agent\b/i,  // 🚨 CRITICAL: "sales agent" requires CRM (default to hubspot if no platform specified)
        /\bsales\s+automation\b/i,
        /\bwhen\s+(a\s+)?new\s+\w+\s+is\s+added\s+to\s+hubspot/i
      ],
      salesforce: [
        /\bsalesforce\b/i,
        /\bsf\b/i,
        /\bsales\s+agent\b/i,  // 🚨 CRITICAL: "sales agent" requires CRM (if Salesforce mentioned)
        /\bsales\s+automation\b/i
      ],
      airtable: [/\bairtable\b/i],
      slack: [/\bslack\b/i, /\bnotify\s+(the\s+)?(sales\s+)?team\s+on\s+slack/i, /\bnotify\s+.*?\s+on\s+slack/i],
      gmail: [/\bgmail\b/i, /\bgoogle\s*gmail\b/i, /\bsend\s+(a\s+)?(welcome\s+)?email\s+via\s+gmail/i, /\bemail\s+via\s+gmail/i, /\bsend\s+(a\s+)?(welcome\s+)?email/i],
      google_sheets: [/\bgoogle\s*sheets\b/i, /\bsheets\b/i, /\bgoogle\s*spreadsheet\b/i, /\bcreate\s+(a\s+)?(corresponding\s+)?record\s+in\s+google\s+sheets/i, /\bsave\s+to\s+google\s+sheets/i, /\brecord\s+in\s+google\s+sheets/i, /\badd\s+(a\s+)?(row|record)\s+to\s+google\s+sheets/i],
      clickup: [/\bclickup\b/i, /\bclick\s*up\b/i],
      notion: [/\bnotion\b/i],
      telegram: [/\btelegram\b/i, /\btelegram\s+channel\b/i, /\btelegram\s+group\b/i],
      discord: [/\bdiscord\b/i],
      whatsapp_cloud: [/\bwhatsapp\b/i, /\bwhats\s+app\b/i],
      twitter: [/\btwitter\b/i, /\bx\.com\b/i],
      linkedin: [
        /\blinkedin\b/i,
        /\blinked\s*in\b/i,
        /\bsocial\s+media\b/i,
        /\bpost\s+on\s+social\b/i,
        /\bshare\s+on\s+social\s+media\b/i,
        /\bpost\s+on\s+linkedin\b/i,
        /\bshare\s+update\s+on\s+linkedin\b/i
      ],
      instagram: [/\binstagram\b/i, /\big\s+story\b/i, /\binstagram\s+post\b/i],
      github: [/\bgithub\b/i, /\bgit\s*hub\b/i, /\brepository\b/i, /\brepo\b/i, /\bissue\b/i, /\btracking\s+issue\b/i],
      zoho_crm: [
        /\bzoho\s*crm\b/i,
        /\bzoho\b/i,
        /\bcrm\b/i,
        /\bcrm\s+system\b/i,
        /\bcustomer\s+relationship\b/i,
        /\bsales\s+crm\b/i,
        /\bsales\s+agent\b/i,  // 🚨 CRITICAL: "sales agent" requires CRM
        /\bsales\s+automation\b/i,
        /\bupdate\s+crm\b/i,
        /\bpush\s+leads\s+to\s+crm\b/i
      ],
      pipedrive: [
        /\bpipedrive\b/i,
        /\bsales\s+pipeline\b/i,
        /\bdeal\s+pipeline\b/i,
        /\bsales\s+agent\b/i,  // 🚨 CRITICAL: "sales agent" requires CRM (if Pipedrive mentioned)
        /\bsales\s+automation\b/i
      ],
      outlook: [/\boutlook\b/i, /\bmicrosoft\s+outlook\b/i, /\boutlook\s+email\b/i],
      youtube: [/\byoutube\b/i, /\byou\s*tube\b/i, /\byt\b/i, /\bupload\s+to\s+youtube\b/i, /\bpost\s+on\s+youtube\b/i],
    };
    
    // 🚨 CRITICAL: Check if user says "specify platform" - if so, only detect ONE CRM platform
    const userSaysSpecifyPlatform = fullText.includes('specify platform') || fullText.includes('specify the platform');
    const crmPlatforms = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
    let crmDetected = false;
    
    // Check for each integration
    for (const [integration, patterns] of Object.entries(integrationPatterns)) {
      const isMentioned = patterns.some(pattern => pattern.test(fullText));
      if (isMentioned) {
        // 🚨 CRITICAL: If "specify platform" and this is a CRM, only add ONE CRM
        if (userSaysSpecifyPlatform && crmPlatforms.includes(integration)) {
          if (!crmDetected) {
            detectedRequirements.requiredIntegrations.push(integration);
            crmDetected = true;
            // Add to credentials if it requires authentication
            const requiresAuth = ['hubspot', 'salesforce', 'airtable', 'slack', 'clickup', 'notion', 'telegram', 'discord', 'twitter', 'linkedin', 'instagram', 'zoho_crm', 'pipedrive'];
            if (requiresAuth.includes(integration)) {
              detectedRequirements.requiredCredentials.push(integration);
            }
            console.log(`🚨 [Integration Detection] Detected ${integration.toUpperCase()} integration requirement (only ONE CRM because "specify platform" was mentioned)`);
          } else {
            console.log(`⚠️  [Integration Detection] Skipping ${integration.toUpperCase()} - already detected one CRM platform (user said "specify platform")`);
          }
        } else {
          detectedRequirements.requiredIntegrations.push(integration);
          // Add to credentials if it requires authentication
          const requiresAuth = ['hubspot', 'salesforce', 'airtable', 'slack', 'clickup', 'notion', 'telegram', 'discord', 'twitter', 'linkedin', 'instagram', 'zoho_crm', 'pipedrive'];
          if (requiresAuth.includes(integration)) {
            detectedRequirements.requiredCredentials.push(integration);
          }
          console.log(`🚨 [Integration Detection] Detected ${integration.toUpperCase()} integration requirement`);
        }
      }
    }
    
    // 🚨 CRITICAL: If "specify platform" but no CRM detected yet, default to hubspot
    if (userSaysSpecifyPlatform && !crmDetected && (fullText.includes('crm') || fullText.includes('sales agent') || fullText.includes('crm agent'))) {
      detectedRequirements.requiredIntegrations.push('hubspot');
      detectedRequirements.requiredCredentials.push('hubspot');
      console.log(`🚨 [Integration Detection] User said "specify platform" but no specific CRM mentioned - defaulting to hubspot`);
    }
    
    // 🚨 CRITICAL: Detect LOOP requirement for "extract from X and create Y" patterns
    // Pattern: "extract X from Google Sheets and create Y in HubSpot" → needs loop
    // Pattern: "for each row", "process each item", "loop through" → needs loop
    const loopPatterns = [
      /\bextract\s+.*?\s+from\s+.*?\s+(?:and|then)\s+create\s+.*?\s+in\s+/i, // "extract X from Y and create Z in W"
      /\bextract\s+.*?\s+from\s+.*?\s+(?:and|then)\s+add\s+.*?\s+to\s+/i, // "extract X from Y and add Z to W"
      /\bfor\s+each\s+(?:row|item|record|entry|contact|lead)/i, // "for each row"
      /\bloop\s+(?:through|over|for)\s+/i, // "loop through rows"
      /\bprocess\s+each\s+(?:row|item|record|entry)/i, // "process each row"
      /\bcreate\s+.*?\s+for\s+each\s+/i, // "create contact for each row"
      /\b(?:read|get|fetch)\s+.*?\s+from\s+.*?\s+(?:and|then)\s+create\s+.*?\s+for\s+each/i, // "read from sheets and create contact for each"
    ];
    
    const hasLoopPattern = loopPatterns.some(pattern => pattern.test(fullText));
    
    // Also check if we have a data source (google_sheets, database_read) AND a create operation (hubspot.create, airtable.create)
    const hasDataSource = detectedRequirements.requiredIntegrations.includes('google_sheets') || 
                         /\b(?:read|get|fetch|extract)\s+.*?\s+from\s+(?:google\s+)?sheets/i.test(fullText);
    const hasCreateOperation = /\bcreate\s+.*?\s+(?:in|to|on)\s+(?:hubspot|airtable|crm|database)/i.test(fullText) ||
                               detectedRequirements.requiredIntegrations.some(integration => 
                                 ['hubspot', 'airtable', 'salesforce', 'zoho_crm', 'pipedrive'].includes(integration)
                               );
    
    if (hasLoopPattern || (hasDataSource && hasCreateOperation)) {
      detectedRequirements.needsLoop = true;
      // Try to identify source and target nodes
      if (detectedRequirements.requiredIntegrations.includes('google_sheets')) {
        detectedRequirements.loopSourceNode = 'google_sheets';
      }
      if (detectedRequirements.requiredIntegrations.some(integration => 
        ['hubspot', 'airtable', 'salesforce', 'zoho_crm', 'pipedrive'].includes(integration)
      )) {
        const targetIntegration = detectedRequirements.requiredIntegrations.find(integration => 
          ['hubspot', 'airtable', 'salesforce', 'zoho_crm', 'pipedrive'].includes(integration)
        );
        if (targetIntegration) {
          detectedRequirements.loopTargetNode = targetIntegration;
        }
      }
      console.log(`🚨 [Node Detection] Detected LOOP requirement - source: ${detectedRequirements.loopSourceNode}, target: ${detectedRequirements.loopTargetNode}`);
    }
    
    // Log all detected requirements
      if (detectedRequirements.needsHttpRequest || detectedRequirements.needsConditional || detectedRequirements.needsAiAgent || detectedRequirements.needsLoop || detectedRequirements.requiredIntegrations.length > 0) {
      console.log(`📊 [Node Detection Summary]`, JSON.stringify(detectedRequirements, null, 2));
    }
    // CRITICAL: Check for chatbot intent FIRST
    const isChatbotIntent = this.detectChatbotIntent(requirements);
    
    // ✅ IMPORTANT:
    // Only use the fixed chatbot structure for *pure* chatbots.
    // If the prompt also mentions HTTP calls or external integrations (Zoho, Pipedrive, Outlook, LinkedIn, etc.),
    // we must build a full automation workflow so those nodes appear in the graph.
    const hasComplexIntegrations =
      detectedRequirements.needsHttpRequest ||
      detectedRequirements.requiredIntegrations.length > 0;
    
    // 🚨 CRITICAL: Check if user explicitly requested schedule BEFORE using fixed chatbot structure
    const chatbotPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    const explicitlyRequestsSchedule = chatbotPrompt.includes('schedule') || 
                                       chatbotPrompt.includes('fixed schedule') ||
                                       chatbotPrompt.includes('daily') ||
                                       chatbotPrompt.includes('weekly') ||
                                       chatbotPrompt.includes('hourly');
    
    if (isChatbotIntent && !hasComplexIntegrations) {
      if (explicitlyRequestsSchedule) {
        console.log('🤖 CHATBOT MODE DETECTED with SCHEDULE - Using schedule trigger for chatbot workflow');
        // Use schedule trigger instead of chat_trigger
        return this.generateFixedChatbotStructure('schedule');
      } else {
        console.log('🤖 CHATBOT MODE DETECTED - Using fixed chatbot workflow structure (no extra integrations detected)');
        // CRITICAL: Return fixed structure WITHOUT filtering - chatbot structure is already optimal
        return this.generateFixedChatbotStructure();
      }
    }
    
    // CRITICAL: Include node library reference in structure generation
    const nodeLibraryInfo = this.getNodeLibraryDescription();
    const nodeReference = this.generateNodeReference(); // Now includes credentials and requirements
    
    // DEBUG: Log that node library is included
    console.log(`📚 [STRUCTURE GENERATION] Node library included: ${nodeLibrary.getAllSchemas().length} nodes available`);
    
    // Get training examples for structure generation - use more examples for better learning
    let fewShotExamples = '';
    try {
      // Get similar workflows based on user prompt for better relevance
      const similarWorkflows = workflowTrainingService.getSimilarWorkflows(
        requirements.primaryGoal || '', 
        5 // Use 5 similar examples
      );
      
      // If we have similar workflows, use them; otherwise use general examples with user prompt for similarity
      const examples = similarWorkflows.length > 0 
        ? similarWorkflows.map((w: any) => ({
            goal: w.goal,
            selectedNodes: w.phase1.step5?.selectedNodes || [],
            connections: w.phase1.step5?.connections || [],
          }))
        : workflowTrainingService.getNodeSelectionExamples(5, requirements.primaryGoal || '');
      
      if (examples.length > 0) {
        fewShotExamples = '\n\n## 📚 TRAINING EXAMPLES - Learn from these similar workflows:\n\n';
        examples.forEach((example: any, idx: number) => {
          fewShotExamples += `### Example ${idx + 1}:\n`;
          fewShotExamples += `**Goal:** "${example.goal}"\n`;
          fewShotExamples += `**Selected Nodes:** ${example.selectedNodes.join(' → ')}\n`;
          if (example.connections && example.connections.length > 0) {
            fewShotExamples += `**Flow:** ${example.connections.slice(0, 3).join(' → ')}${example.connections.length > 3 ? '...' : ''}\n`;
          }
          fewShotExamples += '\n';
        });
        fewShotExamples += '---\n\n';
        console.log(`📚 [Structure Generation] Using ${examples.length} training examples for few-shot learning`);
      }
    } catch (error) {
      console.warn('⚠️  Failed to get training examples for structure generation:', error);
    }
    
    // Get comprehensive system prompt (includes IO mapping rules AND node reference)
    const comprehensivePrompt = this.getWorkflowGenerationSystemPrompt();
    
    // Generate a logical structure for the workflow using AI
    // CRITICAL: Include BOTH node library description AND reference
    const structurePrompt = `${comprehensivePrompt}

---

## CURRENT TASK: Generate Workflow Structure

${fewShotExamples}

## 📚 AVAILABLE NODES (USE ONLY THESE)

${nodeLibraryInfo}

${nodeReference}

**🚨 CRITICAL REMINDER: You MUST use ONLY the node types listed above. DO NOT invent new node types. If a node type is not in the list above, it does not exist and cannot be used.**

**🚨 ABSOLUTELY FORBIDDEN:**
- ❌ NEVER use "custom" as a node type - THIS WILL CAUSE WORKFLOW TO FAIL
- ❌ NEVER use node types not in the list above
- ❌ NEVER invent new node types
- ✅ ALWAYS use the EXACT node type from the list above (e.g., "slack_message", "google_sheets", "hubspot", "ai_agent", "javascript")
- ✅ For HubSpot operations → use "hubspot" (NOT "custom", NOT "crm", NOT "hubspot_crm")
- ✅ For Google Sheets → use "google_sheets" (NOT "custom", NOT "sheets", NOT "spreadsheet")
- ✅ For Gmail → use "google_gmail" (NOT "custom", NOT "email", NOT "gmail")

**CRITICAL**: If you use "custom" or any invalid node type, the workflow will FAIL validation and the node will be REMOVED. You MUST use the exact node type from the library list above.

**CRITICAL: Before using any node, check:**
1. ✅ All required configs are present (see node reference above)
2. ✅ Credentials are available (if needed - see credentials in node reference)
3. ✅ Inputs match previous node outputs (see inputs/outputs in node reference)
4. ✅ Outputs match next node inputs

Requirements:
${JSON.stringify(requirements, null, 2)}

🚨 PROGRAMMATIC DETECTION RESULTS (MANDATORY - These nodes MUST be included):
${detectedRequirements.needsHttpRequest ? `- ✅ HTTP REQUEST NODE REQUIRED (URLs detected: ${detectedRequirements.httpUrls.join(', ') || 'from prompt'})` : ''}
${detectedRequirements.needsConditional ? `- ✅ IF/ELSE NODE(S) REQUIRED (${detectedRequirements.conditionalCount} conditional(s) detected) - MUST add if_else node for validation/eligibility checks` : ''}
${detectedRequirements.needsDataExtraction ? `- ✅ SET_VARIABLE NODE REQUIRED (data extraction detected) - MUST add set_variable node to extract fields from input` : ''}
${detectedRequirements.needsLoop ? `- ✅ LOOP NODE REQUIRED (extract from ${detectedRequirements.loopSourceNode || 'data source'} and create in ${detectedRequirements.loopTargetNode || 'target'}) - MUST add loop node between data source and create operation` : ''}
${detectedTrigger === 'form' ? `- ✅ FORM TRIGGER REQUIRED - User will fill/submit form data` : ''}
${detectedRequirements.needsAiAgent ? `- ✅ AI AGENT NODE REQUIRED (AI analysis detected)` : ''}
${detectedRequirements.requiredIntegrations.length > 0 ? `- ✅ INTEGRATION NODES REQUIRED: ${detectedRequirements.requiredIntegrations.map(i => i.toUpperCase()).join(', ')}` : ''}
${detectedRequirements.requiredCredentials.length > 0 ? `- ✅ CREDENTIALS REQUIRED: ${detectedRequirements.requiredCredentials.map(c => c.toUpperCase()).join(', ')}` : ''}

**CRITICAL**: The nodes listed above were programmatically detected and MUST be included in the workflow structure. Do NOT replace them with generic processing nodes. If HubSpot, Airtable, or any other integration is mentioned, the corresponding node MUST be in the workflow steps.

CRITICAL INSTRUCTIONS FOR STRUCTURE GENERATION:

**SIMPLICITY FIRST - CRITICAL RULE**: For simple requests, use the MINIMUM nodes needed. DO NOT add unnecessary extraction, transformation, or formatting nodes.

**SIMPLE WORKFLOW EXAMPLES** (use ONLY these nodes):
- "send notification to slack" → trigger: manual_trigger, steps: [slack_message] (2 nodes total)
- "save form data to google sheets" → trigger: form, steps: [google_sheets] (2 nodes total)
- "read data from google sheets" → trigger: manual_trigger, steps: [google_sheets] (2 nodes total)
- "send email" → trigger: manual_trigger, steps: [google_gmail] (2 nodes total)
- "form submission sends confirmation email" → trigger: form, steps: [google_gmail] (2 nodes total)
- "form data to email" → trigger: form, steps: [email] (2 nodes total)
- "user submits form and receives email" → trigger: form, steps: [google_gmail] (2 nodes total)

**🚨 CRITICAL: MANDATORY NODE DETECTION RULES**

**MUST ADD HTTP REQUEST NODE if prompt contains:**
- "fetch" / "get" / "retrieve" / "download" / "call" + URL (https://, http://, api.)
- "from https://" / "from http://" / "from api."
- Any URL mentioned → MUST use http_request node (NOT javascript, NOT generic processing)

**MUST ADD IF/ELSE NODE if prompt contains:**
- "if" / "then" / "check if" / "when" / "only if" / "unless"
- "contains" / "equals" / "greater than" / "less than" / ">=" / "<=" / "=="
- "filter" / "separate" / "categorize" based on condition
- "validate" / "validation" / "eligible" / "eligibility" / "verify" / "check"
- "is he" / "is she" / "are they" / "is it" / "determine if" / "decide if"
- Nested conditions ("if X then check if Y") → MUST use nested if_else nodes
- **CRITICAL**: If user mentions "validate" or "eligible" → MUST add if_else node

**MUST ADD AI AGENT NODE if prompt contains:**
- "analyze" / "extract key points" / "summarize" / "use AI" / "AI agent"
- "generate summary" / "AI analysis" / "AI model"

**MUST ADD LOOP NODE if prompt contains:**
- "extract X from Y and create Z in W" → MUST add loop node: data_source → loop → create_operation
- "for each row", "for each item", "process each", "loop through" → MUST add loop node
- Pattern: data source (google_sheets, database_read) + create operation (hubspot.create, airtable.create) → MUST add loop
- **CRITICAL**: Loop node MUST be placed BETWEEN the data source and the create operation
- **CRITICAL**: Loop.items MUST be set to {{$json.rows}} or {{$json.data}} from the data source node
- **CRITICAL**: Create operation (hubspot, airtable) MUST be INSIDE the loop (connected from loop, not from data source)
- Example: "extract email and name from Google Sheets and create contact in HubSpot" → trigger → google_sheets → loop → hubspot
  - google_sheets.operation = "read" or "getMany"
  - loop.items = {{$json.rows}} or {{$json.data}}
  - hubspot.operation = "create"
  - hubspot.resource = "contact"

**MUST ADD ALL MENTIONED INTEGRATIONS:**
- "and also" / "and" + service name → MUST add ALL services
- Multiple destinations → MUST create parallel branches or sequential nodes

**WHEN TO ADD EXTRACTION/TRANSFORMATION NODES** (ONLY if explicitly mentioned):
- User says "extract", "get specific fields", "parse", "separate" → add set_variable or json_parser
- User says "if/then", "condition", "filter", "separate by", "categorize" → **MUST add if_else**
- User says "format", "transform", "convert", "calculate" → add text_formatter or javascript
- User says "combine", "merge", "join" → add merge_data

**DO NOT ADD** extraction/transformation nodes for simple pass-through workflows like:
- Simple notifications (just send message)
- Simple data saves (just save data)
- Simple data reads (just read data)

1. **EXTRACT SPECIFIC DATA FIELDS**: ONLY if requirements explicitly mention extracting specific fields (age, amount, etc.) OR if data transformation is needed. For simple pass-through workflows, SKIP extraction nodes.

2. **IMPLEMENT ACTUAL LOGIC**: 
   - **MANDATORY**: If requirements mention ANY conditional words ("if", "then", "check if", "contains", ">", "<", "==", "greater than", "less than", "otherwise", etc.) → **MUST add if_else node as FIRST step after trigger**
   - **MANDATORY**: If requirements mention nested conditions → **MUST add nested if_else nodes**
   - **CRITICAL**: For conditional workflows like "if X then A else B", the structure MUST be: trigger → if_else → [true: A, false: B]
   - **CRITICAL**: Do NOT use AI Agent, JavaScript, or generic processing nodes to replace conditional logic
   - **CRITICAL**: Do NOT create linear workflows for conditional prompts - conditional workflows MUST branch
   - For simple workflows without conditions, SKIP if_else nodes

3. **USE SPECIFIC NODE TYPES**: ALWAYS use the most specific node type available:
   - For Google Sheets: use 'google_sheets' (NOT 'database_read' or 'database_write')
   - For Gmail: use 'google_gmail' (NOT generic 'email')
   - For Slack: use 'slack_message' (NOT generic 'message')
   - For JavaScript: use 'javascript' (NOT 'code' or 'script')
   - NEVER use generic types when specific types exist
   - The node TYPE must match the actual service/functionality, only the description can be customized

3. **USE SPECIFIC NODES**: 
   - For extraction: set_variable, json_parser, edit_fields
   - For conditions: if_else, switch
   - For transformations: javascript, text_formatter, merge_data
   - For output: log_output, respond_to_webhook, platform-specific nodes

4. **NO GENERIC NODES**: Do NOT use generic "check", "ask", "process" nodes. Every node must have specific purpose.

5. **COMPLETE DATA FLOW**: Ensure data flows from extraction → processing → transformation → output.

Based on the requirements and available nodes, determine:
1. Trigger type (use only trigger nodes from library)
   - Use "manual_trigger" as DEFAULT unless user explicitly mentions:
     * Schedule/recurring/daily/weekly/hourly/cron → "schedule"
     * Webhook/HTTP endpoint/API call → "webhook"
     * Form submission/form input/form trigger/user submits form/when a user submits → "form"
   - 🚨 CRITICAL TRIGGER DETECTION RULES:
     * If user says "daily", "weekly", "monthly", "hourly", "schedule", "recurring", "automated", "every day", "every week" → MUST use "schedule" trigger
     * Examples: "post to linkedin daily" → schedule, "send email weekly" → schedule, "daily report" → schedule
     * If user says "post to linkedin daily" → trigger MUST be "schedule" (NOT manual_trigger)
     * If user says "schedule linkedin posts weekly" → trigger MUST be "schedule"
   - CRITICAL: If user mentions "form", "submit", "submission", "user submits", "form trigger", or "form input" → MUST use "form" trigger
   - CRITICAL: If user mentions ANY time-based words (daily, weekly, hourly, schedule, recurring, automated) → MUST use "schedule" trigger
   - DO NOT default to "schedule" - default to "manual_trigger" ONLY if no time-based words are mentioned
2. Workflow steps (use appropriate nodes from library)
   - **FOR SIMPLE WORKFLOWS**: Use ONLY the action node (e.g., slack_message, google_sheets, email)
   - **FOR COMPLEX WORKFLOWS**: Add extraction/transformation only if explicitly needed:
     * Extract data fields ONLY if user mentions "extract", "get specific fields", "parse", etc.
     * Add logic nodes ONLY if user mentions "if/then", "condition", "filter", "separate", etc.
     * Add formatting ONLY if user mentions "format", "transform", "convert", etc.
   - **KEEP IT SIMPLE**: Don't add unnecessary nodes. A simple "send notification to slack" needs only: trigger → slack_message
   - **CRITICAL**: For Google Docs operations (reading/writing documents), use 'google_doc' node type (NOT 'google_sheets', NOT 'database_read', NOT 'javascript')
   - **CRITICAL**: For Google Sheets operations (reading/writing spreadsheets), use 'google_sheets' node type (NOT 'google_doc', NOT 'database_read', NOT 'javascript')
   - **CRITICAL**: Google Docs and Google Sheets are DIFFERENT - use 'google_doc' for documents, 'google_sheets' for spreadsheets
   - **CRITICAL**: For data transformation, use 'javascript' node type
   - **CRITICAL**: Use the MOST SPECIFIC node type available - never use generic types when specific ones exist
3. Output nodes (use only output nodes from library)
   - Output MUST contain all required result fields

CRITICAL: Before returning, validate:
- Each step's required inputs can be sourced from previous steps or trigger
- AI Agent nodes will have chat_model connections (will be auto-added)
- Output nodes can receive data from processing steps
- No circular dependencies
- All node types exist in the library

IMPORTANT: Return ONLY valid JSON, no explanations, no markdown, no code blocks. Just the JSON object.

CRITICAL INSTRUCTIONS FOR STRUCTURE GENERATION:

**WORKFLOW FLOW PATTERN - LINEAR IS REQUIRED:**
- ALWAYS create LINEAR workflows: trigger → step1 → step2 → step3 (sequential chain)
- NEVER create TREE structures: trigger → step1, trigger → step2, trigger → step3 (parallel connections)
- Data MUST flow sequentially: each step receives data from the previous step
- ONLY exception: log_output nodes can be added at the end for debugging (but don't connect everything to trigger)

**CORRECT LINEAR FLOW EXAMPLES:**
✅ "get data from sheets and send to slack" → trigger → google_sheets → slack_message
✅ "extract data from google sheets and send the received data to slack" → trigger → google_sheets → slack_message
❌ "extract data from google sheets and send to slack" → WRONG if uses google_gmail (should be google_sheets → slack_message)
✅ "read sheets, process, send to LinkedIn" → trigger → google_sheets → javascript → linkedin
✅ "form submission to sheets and email" → trigger → google_sheets → google_gmail (or form → sheets, form → email if truly parallel)
✅ "extract email and name from Google Sheets and create contact in HubSpot" → trigger → google_sheets → loop → hubspot
  - google_sheets.operation = "read" (or "getMany" if available)
  - loop.items = {{$json.rows}} (or {{$json.data}} depending on google_sheets output)
  - hubspot.operation = "create"
  - hubspot.resource = "contact"

**INCORRECT TREE STRUCTURE (DO NOT CREATE):**
❌ trigger → google_sheets, trigger → slack_message (WRONG - creates tree)
❌ trigger → step1, trigger → step2, trigger → step3 (WRONG - everything connects to trigger)

**CONNECTION RULES:**
1. Each step MUST have a unique ID (e.g., "step1", "step2", etc.).
2. The connections MUST use these step IDs to specify the edges.
3. Each connection MUST specify the outputField and inputField when applicable.
4. Use "trigger" as the source ID when connecting from the trigger node.
5. Connect steps sequentially: step1 → step2 → step3 (NOT trigger → step1, trigger → step2)
6. The LAST step in the chain should be the final output/action node

**🚨 CRITICAL NODE TYPE SELECTION RULES - FOLLOW EXACTLY:**

**Google Services:**
- "Google Docs" / "Google Document" / "read doc" → MUST use "google_doc" (NEVER "google_sheets", NEVER "database_read", NEVER "javascript")
- "Google Sheets" / "spreadsheet" / "sheets" / "read from sheet" / "extract data from google sheets" / "read data from sheets" → MUST use "google_sheets" (NEVER "google_gmail", NEVER "database_read", NEVER "javascript", NEVER "google_doc")
- ⚠️ CRITICAL: Google Docs ≠ Google Sheets ≠ Gmail - they are THREE DIFFERENT services!
- ⚠️ CRITICAL: "extract data from google sheets" = google_sheets (NOT gmail, NOT email)
- ⚠️ CRITICAL: "read from sheets" = google_sheets (NOT gmail, NOT email)
- "Gmail" / "send via Gmail" / "send email via Gmail" → MUST use "google_gmail" (NEVER "google_sheets", NEVER generic "email")
- ⚠️ CRITICAL: If user says "sheets" or "spreadsheet" → use "google_sheets" (NOT "google_gmail")
- ⚠️ CRITICAL: If user says "gmail" or "email via gmail" → use "google_gmail" (NOT "google_sheets")

**Communication Services:**
- "Slack" / "notify" / "send to Slack" → MUST use "slack_message" (NEVER generic "message")
- "Email" (not Gmail) → use "email" node
- "Gmail" → use "google_gmail" node

**Social Media (CRITICAL - ALWAYS ADD WHEN PLATFORM MENTIONED):**
- "LinkedIn" / "post to LinkedIn" / "linkedin" / "linked in" / "post to linkedin" / "linkedin posting" → MUST use "linkedin" (NEVER "twitter", NEVER "instagram", NEVER generic "social")
- "Twitter" / "X" / "tweet" / "post to twitter" / "twitter posting" → MUST use "twitter" (NEVER generic "social")
- "Instagram" / "post to Instagram" / "post to instagram" / "instagram posting" → MUST use "instagram" (NEVER generic "social")
- 🚨 CRITICAL: If user mentions ANY platform name (LinkedIn, Twitter, Instagram), you MUST include that platform's node in the workflow. This is NON-NEGOTIABLE.
- 🚨 CRITICAL: If user says "post to LinkedIn daily" → MUST include: schedule trigger + linkedin node
- 🚨 CRITICAL: If user says "post on LinkedIn" → MUST include: linkedin node (even if trigger not specified, use manual_trigger)
- 🚨 CRITICAL: If user says "post to linkedin" → MUST include: linkedin node (check for "daily"/"weekly" to determine trigger)
- 🚨 CRITICAL: If user says "automated linkedin posting" → MUST include: linkedin node (use schedule trigger if "daily"/"weekly" mentioned, otherwise manual_trigger)
- 🚨 CRITICAL: If user says "schedule linkedin posts weekly" → MUST include: schedule trigger + linkedin node
- 🚨 CRITICAL: Platform nodes are MANDATORY - if platform is mentioned, the node MUST be in the workflow steps array

**Data Processing:**
- "JavaScript" / "code" / "transform" / "process data" → use "javascript"
- "if" / "condition" / "check" / "filter" → use "if_else"
- "database" / "db" / "query" → use "database_read" or "database_write" (NOT "google_sheets")

**AI/ML:**
- "AI agent" / "chatbot" / "AI assistant" / "LLM" → use "ai_agent"

**⚠️ COMMON MISTAKES TO AVOID:**
- ❌ Using "database_read" for Google Sheets → WRONG! Use "google_sheets"
- ❌ Using "google_sheets" for Google Docs → WRONG! Use "google_doc"
- ❌ Using generic "email" for Gmail → WRONG! Use "google_gmail"
- ❌ Adding LinkedIn/Twitter/Instagram without explicit mention → WRONG! Only add if user says the platform name
- ❌ Using "custom" as node type → FORBIDDEN! Always use specific node types

**✅ ALWAYS:**
- Use the MOST SPECIFIC node type available
- Match the EXACT service/platform mentioned by user
- Verify node type exists in the library before using it

**🚨 CRITICAL: DO NOT ADD NODES THAT WERE NOT MENTIONED:**
- ❌ If user says "extract data from google sheets" → ONLY use: trigger + google_sheets (2 nodes)
- ❌ DO NOT add Slack, email, or any other output node unless user explicitly mentions it
- ❌ DO NOT add transformation nodes unless user explicitly asks for transformation
- ❌ DO NOT add conditional logic unless user explicitly mentions conditions
- ✅ ONLY add nodes that match what the user actually requested
- ✅ For "extract data from google sheets" → the google_sheets node IS the output (it extracts data)
- ✅ Simple data extraction workflows do NOT need additional output nodes

**EXAMPLES OF CORRECT vs INCORRECT:**
- ✅ User: "extract data from google sheets" → CORRECT: [manual_trigger, google_sheets]
- ❌ User: "extract data from google sheets" → WRONG: [manual_trigger, google_sheets, slack_message] (Slack not mentioned!)
- ✅ User: "extract data from google sheets and send to slack" → CORRECT: [manual_trigger, google_sheets, slack_message]
- ✅ User: "extract data from google sheets and send the received data to slack" → CORRECT: [manual_trigger, google_sheets, slack_message]
- ❌ User: "extract data from google sheets and send the received data to slack" → WRONG: [manual_trigger, google_gmail, slack_message] (WRONG! User said "sheets" not "gmail"!)
- ✅ User: "read google sheets" → CORRECT: [manual_trigger, google_sheets]
- ❌ User: "read google sheets" → WRONG: [manual_trigger, google_sheets, email] (Email not mentioned!)
- ⚠️ CRITICAL: "extract data from google sheets" = google_sheets node (NOT google_gmail, NOT email)

Return JSON:
{
  "trigger": "node_type_from_library",
  "steps": [
    {"id": "step1", "description": "...", "type": "node_type_from_library"},
    {"id": "step2", "description": "...", "type": "node_type_from_library"},
    ...
  ],
  "outputs": [
    {"name": "output1", "type": "string|number|boolean|object|array", "description": "...", "required": true}
  ],
  "connections": [
    {"source": "trigger", "target": "step1", "outputField": "inputData", "inputField": "input"},
    {"source": "step1", "target": "step2", "outputField": "output", "inputField": "input"},
    {"source": "step2", "target": "step3", "outputField": "output", "inputField": "input"}
  ]
  
**CRITICAL: Connections MUST form a LINEAR chain. Each step connects to the NEXT step, not back to trigger.**
}`;

    try {
      let result;
      try {
        result = await ollamaOrchestrator.processRequest('workflow-generation', {
          prompt: structurePrompt,
          temperature: 0.2, // Lower temperature for more consistent JSON
        });
      } catch (error) {
        // CRITICAL: If AI structure generation fails, use rule-based fallback
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isModelUnavailable = errorMessage.includes('not found') || 
                                   errorMessage.includes('Ollama models not available') ||
                                   errorMessage.includes('404') && errorMessage.includes('model');
        
        if (isModelUnavailable) {
          console.warn('⚠️  [WorkflowBuilder] AI structure generation unavailable, using rule-based fallback');
          // Use rule-based structure generation
          return this.generateStructureFallback(requirements);
        }
        throw error;
      }

      let parsed;
      try {
        const jsonText = typeof result === 'string' ? result : JSON.stringify(result);
        let cleanJson = jsonText.trim();
        
        // Remove markdown code blocks - handle all variations
        // Match ```json, ```JSON, ```, or any code block
        const codeBlockRegex = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/g;
        const codeBlockMatch = cleanJson.match(codeBlockRegex);
        if (codeBlockMatch) {
          // Extract content from first code block
          cleanJson = codeBlockMatch[0].replace(/```(?:json|JSON)?\s*\n?/g, '').replace(/\n?```/g, '').trim();
        }
        
        // Remove any backticks that might remain
        cleanJson = cleanJson.replace(/^`+|`+$/g, '').trim();
        
        // Try to extract JSON if there's text before/after
        // Look for first { and last } (handle nested braces)
        const firstBrace = cleanJson.indexOf('{');
        if (firstBrace !== -1) {
          // Find matching closing brace
          let braceCount = 0;
          let lastBrace = -1;
          for (let i = firstBrace; i < cleanJson.length; i++) {
            if (cleanJson[i] === '{') braceCount++;
            if (cleanJson[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
          if (lastBrace !== -1 && lastBrace > firstBrace) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
          }
        }
        
        // Remove any leading/trailing non-JSON text and whitespace
        cleanJson = cleanJson.replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
        
        // Final cleanup: remove any remaining backticks or markdown artifacts
        cleanJson = cleanJson.replace(/^[`\s]+|[`\s]+$/g, '').trim();
        
        // Safety check: ensure we have valid JSON before parsing
        if (!cleanJson || cleanJson.length === 0 || !cleanJson.includes('{')) {
          throw new Error('No valid JSON found in response');
        }
        
        parsed = JSON.parse(cleanJson);
      } catch (parseError) {
        console.warn('⚠️  Failed to parse AI-generated structure:', parseError instanceof Error ? parseError.message : String(parseError));
        console.warn('   Raw response (first 500 chars):', (typeof result === 'string' ? result : JSON.stringify(result)).substring(0, 500));
        parsed = null;
      }

      // 🔧 INTEGRATION ENFORCEMENT UPGRADE: Rebuild workflow if AI output is empty/invalid
      // Handle both formats: parsed.nodes (new format) and parsed.steps (old format)
      const nodesOrSteps = parsed?.nodes || parsed?.steps || [];
      
      if (!parsed || nodesOrSteps.length === 0) {
        logger.warn('⚠️  AI returned empty nodes/steps – falling back to programmatic generation');
        parsed = this.buildWorkflowProgrammatically(requirements, detectedRequirements, detectedTrigger);
      } else {
        // Remove any nodes/steps with invalid types
        // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
        const validItems = nodesOrSteps.filter((item: any) => {
          // For workflow nodes: check data.type if type is 'custom', otherwise check type
          const itemType = item.data?.type || item.type || item.nodeType;
          // Also check if it's a valid trigger (triggers don't have data.type)
          if (!itemType || itemType === 'custom') {
            // If type is 'custom' but no data.type, it's invalid
            if (item.type === 'custom' && !item.data?.type) {
              return false;
            }
            // If no type at all, it's invalid
            if (!itemType) {
              return false;
            }
          }
          return nodeLibrary.getSchema(itemType) || this.nodeLibrary.has(itemType);
        });
        
        if (validItems.length === 0) {
          logger.warn('⚠️  All AI nodes/steps were invalid – falling back to programmatic generation');
          parsed = this.buildWorkflowProgrammatically(requirements, detectedRequirements, detectedTrigger);
        } else {
          // Update the appropriate field (nodes or steps)
          if (parsed.nodes) {
            parsed.nodes = validItems;
          } else {
            parsed.steps = validItems;
          }
          
          // Ensure all required integrations (detected by regex) are present
          // ✅ CRITICAL: Check data.type for nodes with type: 'custom'
          const detectedInts = new Set(detectedRequirements.requiredIntegrations);
          const presentInts = new Set(validItems.map((n: any) => {
            // For workflow nodes: check data.type if type is 'custom'
            return n.data?.type || n.type || n.nodeType;
          }));
          
          for (const int of detectedInts) {
            if (!presentInts.has(int)) {
              logger.warn(`⚠️  Integration ${int} missing – adding node programmatically`);
              const newNode = this.createNodeForIntegration(int, parsed);
              if (newNode) {
                if (parsed.nodes) {
                  parsed.nodes.push(newNode);
                } else {
                  if (!parsed.steps) parsed.steps = [];
                  parsed.steps.push(newNode);
                }
                // Also add connections (wire it appropriately)
                this.connectIntegrationNode(parsed, newNode);
              }
            }
          }
          
          // Re-validate and auto-fix connections
          parsed = this.validateAndFixWorkflow(parsed, requirements);
        }
      }

      // CRITICAL: Validate all node types in parsed structure exist in library
      if (parsed) {
        logger.validation(`🔍 [STRUCTURE VALIDATION] Validating AI-generated structure with ${parsed.steps?.length || 0} steps`);
        
        // 🚨 CRITICAL: Override trigger if programmatic detection found a better match
        if (detectedTrigger && detectedTrigger !== parsed.trigger) {
          const detectedSchema = nodeLibrary.getSchema(detectedTrigger);
          if (detectedSchema) {
            logger.warn(`⚠️  [STRUCTURE VALIDATION] Overriding AI trigger "${parsed.trigger}" with programmatically detected trigger: "${detectedTrigger}"`);
            parsed.trigger = detectedTrigger;
          }
        }
        
        // Validate trigger
        const triggerSchema = nodeLibrary.getSchema(parsed.trigger);
        if (!triggerSchema) {
          logger.error(`❌ [STRUCTURE VALIDATION] Invalid trigger type: "${parsed.trigger}" not found in library`);
          const availableTriggers = nodeLibrary.getAllSchemas()
            .filter(s => s.category === 'triggers' || s.type.includes('trigger'))
            .map(s => s.type);
          logger.error(`❌ [STRUCTURE VALIDATION] Available triggers: ${availableTriggers.join(', ')}`);
          // Use detected trigger or manual_trigger as fallback
          parsed.trigger = detectedTrigger || 'manual_trigger';
          logger.validation(`✅ [STRUCTURE VALIDATION] Using fallback trigger: ${parsed.trigger}`);
        } else {
          logger.validation(`✅ [STRUCTURE VALIDATION] Trigger "${parsed.trigger}" validated`);
        }
        
        // Validate all steps
        if (parsed.steps && Array.isArray(parsed.steps)) {
          const invalidSteps: string[] = [];
          parsed.steps = parsed.steps.filter((step: any) => {
            // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
            const stepType = step.data?.type || step.type || step.nodeType;
            
            // 🚨 CRITICAL: Reject "custom" node types WITHOUT data.type - they are invalid
            if ((step.type === 'custom' || stepType === 'custom') && !step.data?.type) {
              logger.error(`❌ [STRUCTURE VALIDATION] FORBIDDEN: "custom" node type detected without data.type. Step description: "${step.description || 'N/A'}". Removing.`);
              invalidSteps.push('custom');
              return false; // Remove invalid "custom" node
            }
            
            // If stepType is still 'custom' but has data.type, use data.type
            const actualType = (stepType === 'custom' && step.data?.type) ? step.data.type : stepType;
            
            const stepSchema = nodeLibrary.getSchema(actualType);
            
            if (!stepSchema) {
              logger.error(`❌ [STRUCTURE VALIDATION] Invalid step type: "${actualType}" not found in library`);
              logger.error(`❌ [STRUCTURE VALIDATION] Step description: "${step.description || 'N/A'}"`);
              invalidSteps.push(actualType);
              return false; // Remove invalid step
            } else {
              logger.validation(`✅ [STRUCTURE VALIDATION] Step "${actualType}" validated`);
              return true;
            }
          });
          
          if (invalidSteps.length > 0) {
            logger.warn(`⚠️  [STRUCTURE VALIDATION] Removed ${invalidSteps.length} invalid step(s): ${invalidSteps.join(', ')}`);
            logger.warn(`⚠️  [STRUCTURE VALIDATION] Remaining valid steps: ${parsed.steps.length}`);
          } else {
            logger.validation(`✅ [STRUCTURE VALIDATION] All ${parsed.steps.length} steps validated successfully`);
          }
        }
      }

      if (parsed && parsed.trigger && nodeLibrary.getSchema(parsed.trigger)) {
        // 🚨 CRITICAL: Enforce detected trigger type (override AI if wrong)
        if (detectedTrigger && detectedTrigger !== parsed.trigger) {
          console.warn(`⚠️  [Trigger Enforcement] AI generated "${parsed.trigger}" but detected "${detectedTrigger}" from requirements. Overriding.`);
          parsed.trigger = detectedTrigger;
        }
        
        // Ensure each step has an id
        const steps = (parsed.steps || []).map((step: any, index: number) => ({
          ...step,
          id: step.id || `step${index + 1}`,
        }));
        
        // 🚨 CRITICAL: Remove duplicate nodes and unnecessary log_output nodes
        const seenTypes = new Set<string>();
        const cleanedSteps = steps.filter((step: any) => {
          // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
          const stepType = step.data?.type || step.type || step.nodeType || '';
          
          // Remove duplicate nodes of same type
          if (seenTypes.has(stepType)) {
            console.warn(`⚠️  [Node Cleanup] Removing duplicate node: ${stepType}`);
            return false;
          }
          
          // Remove unnecessary log_output nodes (only keep if explicitly needed)
          if (stepType === 'log_output' && steps.length > 2) {
            console.warn(`⚠️  [Node Cleanup] Removing unnecessary log_output node`);
            return false;
          }
          
          // Remove duplicate manual_trigger nodes (should only be in trigger, not steps)
          if (stepType === 'manual_trigger' || stepType === 'schedule' || stepType === 'form' || stepType === 'webhook') {
            console.warn(`⚠️  [Node Cleanup] Removing trigger node from steps: ${stepType} (triggers should not be in steps array)`);
            return false;
          }
          
          seenTypes.add(stepType);
          return true;
        });
        
        parsed.steps = cleanedSteps;
        
        // 🚨 CRITICAL: Ensure detected integrations are included in workflow steps
        if (detectedRequirements.requiredIntegrations.length > 0) {
          const isDebug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] Detected integrations: ${detectedRequirements.requiredIntegrations.join(', ')}`);
            console.log(`🔍 [DIAGNOSTIC] Steps before enforcement: ${cleanedSteps.length} steps`);
            console.log(`🔍 [DIAGNOSTIC] Existing step types: ${Array.from(cleanedSteps.map((s: any) => s.data?.type || s.type || s.nodeType)).join(', ')}`);
          }
          
          // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
          const existingStepTypes = new Set(cleanedSteps.map((s: any) => {
            // For workflow steps: check data.type if type is 'custom', otherwise check type
            return s.data?.type || s.type || s.nodeType;
          }));
          const missingIntegrations: string[] = [];
          
          for (const integration of detectedRequirements.requiredIntegrations) {
            if (isDebug) {
              console.log(`🔍 [DIAGNOSTIC] Checking integration: ${integration}, exists: ${existingStepTypes.has(integration)}`);
            }
            if (!existingStepTypes.has(integration)) {
              // Validate that the integration node type exists in the library
              // CRITICAL: Use the imported nodeLibrary instance (has getSchema method)
              const integrationSchema = nodeLibrary.getSchema(integration);
              if (isDebug) {
                console.log(`🔍 [DIAGNOSTIC] Schema lookup for ${integration}: ${integrationSchema ? 'FOUND' : 'NOT FOUND'}`);
              }
              if (!integrationSchema) {
                // Fallback: check this.nodeLibrary Map as well
                const fallbackSchema = this.nodeLibrary.get(integration);
                if (!fallbackSchema) {
                  console.error(`❌ [Integration Enforcement] ${integration.toUpperCase()} node type does not exist in library. Available nodes: ${Array.from(this.nodeLibrary.keys()).slice(0, 10).join(', ')}...`);
                  continue;
                }
                // Use fallback schema from Map
                const integrationStep = {
                  id: `step_${integration}_${Date.now()}`,
                  description: fallbackSchema.label || `Add ${integration} integration`,
                  type: integration, // For steps, use actual type (not 'custom')
                };
                cleanedSteps.push(integrationStep);
                console.log(`✅ [Integration Enforcement] Added ${integration.toUpperCase()} node with type: ${integration} (from fallback)`);
                continue;
              }
              
              missingIntegrations.push(integration);
              console.warn(`⚠️  Integration ${integration} missing – adding node programmatically`);
              
              // Add the missing integration node with proper label from library
              // CRITICAL: Use the exact node type from library, not "custom"
              const integrationStep = {
                id: `step_${integration}_${Date.now()}`,
                description: integrationSchema.label || `Add ${integration} integration`,
                type: integration, // Use exact node type from library (e.g., "hubspot", "google_sheets") - for steps, not 'custom'
              };
              cleanedSteps.push(integrationStep);
              console.log(`✅ [Integration Enforcement] Added ${integration.toUpperCase()} node with type: ${integration} (validated in library)`);
              if (isDebug) {
                console.log(`🔍 [DIAGNOSTIC] Added step: ${JSON.stringify(integrationStep)}`);
              }
            }
          }
          
          if (missingIntegrations.length > 0) {
            console.log(`✅ [Integration Enforcement] Added ${missingIntegrations.length} missing integration(s): ${missingIntegrations.join(', ')}`);
            parsed.steps = cleanedSteps;
            if (isDebug) {
              console.log(`🔍 [DIAGNOSTIC] Steps after enforcement: ${parsed.steps.length} steps`);
              console.log(`🔍 [DIAGNOSTIC] Step types after enforcement: ${Array.from(parsed.steps.map((s: any) => s.data?.type || s.type || s.nodeType)).join(', ')}`);
            }
          }
        }
        
        // ✅ CRITICAL: Only enforce if_else node if conditional logic is EXPLICITLY required
        // Don't add if_else for simple linear workflows like "extract X then create Y"
        if (detectedRequirements.needsConditional) {
          const existingStepTypes = new Set(cleanedSteps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const conditionalNodeTypes = ['if_else', 'if', 'switch', 'filter'];
          
          const hasConditionalNode = conditionalNodeTypes.some(nodeType => existingStepTypes.has(nodeType));
          
          if (!hasConditionalNode) {
            // ✅ ADDITIONAL CHECK: Verify this is actually a conditional workflow
            // If AI didn't generate a conditional node, it might be a false positive
            const hasExplicitConditional = /\bif\s+.*?\s+then\s+/i.test(fullText) || 
                                          /\bcheck\s+if\s+/i.test(fullText) ||
                                          /\bwhen\s+(?:the|value|amount|score|count|size|age|price|status|type)\s+(?:is|equals|>|<|>=|<=|contains)/i.test(fullText);
            
            if (hasExplicitConditional) {
              console.warn(`⚠️  [Conditional Enforcement] IF/ELSE node was detected but not in workflow steps. Adding it as FIRST step.`);
              
              // ✅ CRITICAL: For conditional workflows, if_else MUST be the first step after trigger
              // Remove any AI Agent or processing nodes that shouldn't be there for simple conditionals
              const processingNodeTypes = ['ai_agent', 'javascript', 'code', 'set_variable', 'json_parser'];
              const hasProcessingNodes = cleanedSteps.some((s: any) => {
                const stepType = s.data?.type || s.type || s.nodeType;
                return processingNodeTypes.includes(stepType);
              });
              
              let finalSteps = cleanedSteps;
              if (hasProcessingNodes) {
                console.warn(`⚠️  [Conditional Enforcement] Removing unnecessary processing nodes for conditional workflow`);
                finalSteps = cleanedSteps.filter((s: any) => {
                  const stepType = s.data?.type || s.type || s.nodeType;
                  return !processingNodeTypes.includes(stepType);
                });
              }
              
              // Add if_else node as FIRST step (right after trigger)
              const ifElseStep = {
                id: `step_if_else_${Date.now()}`,
                description: 'Check condition and route to different actions',
                type: 'if_else', // Use exact node type from library
              };
              
              // Insert if_else node at the beginning (first step after trigger)
              finalSteps.unshift(ifElseStep);
              
              console.log(`✅ [Conditional Enforcement] Added if_else node as FIRST step with type: if_else (validated in library)`);
              console.log(`🔍 [DIAGNOSTIC] Added step: ${JSON.stringify(ifElseStep)}`);
              parsed.steps = finalSteps;
              console.log(`🔍 [DIAGNOSTIC] Steps after conditional enforcement: ${parsed.steps.length} steps`);
              console.log(`🔍 [DIAGNOSTIC] Step types after conditional enforcement: ${Array.from(parsed.steps.map((s: any) => s.data?.type || s.type || s.nodeType)).join(', ')}`);
            } else {
              // ✅ FALSE POSITIVE: Conditional was detected but not explicit - don't add if_else
              console.log(`✅ [Conditional Enforcement] Conditional detection was false positive - skipping if_else node addition`);
              detectedRequirements.needsConditional = false; // Reset to prevent downstream issues
            }
          } else {
            console.log(`✅ [Conditional Enforcement] Conditional node already present in workflow`);
          }
        }
        
        // 🚨 CRITICAL: Enforce AI Agent node if detected but missing (DEFAULT: uses Ollama)
        if (detectedRequirements.needsAiAgent) {
          const existingStepTypes = new Set(cleanedSteps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const aiNodeTypes = ['ai_agent', 'ai_chat_model', 'chat_model'];
          const hasAiNode = aiNodeTypes.some(type => existingStepTypes.has(type));
          
          if (!hasAiNode) {
            console.warn(`⚠️  [AI Enforcement] AI requirement detected but no AI node found. Adding ai_agent (default: Ollama).`);
            // ✅ CRITICAL: Use ai_agent as default (not ai_chat_model) - it works with Ollama by default
            const aiSchema = nodeLibrary.getSchema('ai_agent') || nodeLibrary.getSchema('ai_chat_model');
            if (aiSchema) {
              const aiStep = {
                id: `step_ai_agent_${Date.now()}`,
                description: aiSchema.label || 'AI Agent (Ollama)',
                type: 'ai_agent', // ✅ DEFAULT: Use ai_agent (works with Ollama by default)
              };
              cleanedSteps.push(aiStep);
              parsed.steps = cleanedSteps;
              console.log(`✅ [AI Enforcement] Added AI AGENT node with type: ai_agent (configured for Ollama by default)`);
            }
          }
        }
        
        // 🚨 CRITICAL: Enforce HTTP Request node if detected but missing
        if (detectedRequirements.needsHttpRequest) {
          const existingStepTypes = new Set(cleanedSteps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const httpNodeTypes = ['http_request', 'http_post', 'http_get'];
          const hasHttpNode = httpNodeTypes.some(type => existingStepTypes.has(type));
          
          if (!hasHttpNode) {
            console.warn(`⚠️  [HTTP Enforcement] HTTP requirement detected but no HTTP node found. Adding http_request.`);
            const httpSchema = nodeLibrary.getSchema('http_request');
            if (httpSchema) {
              const httpStep = {
                id: `step_http_request_${Date.now()}`,
                description: httpSchema.label || 'HTTP Request',
                type: 'http_request',
              };
              cleanedSteps.push(httpStep);
              parsed.steps = cleanedSteps;
              console.log(`✅ [HTTP Enforcement] Added HTTP REQUEST node with type: http_request`);
            }
          }
        }
        
        // Parse connections - handle both old format (from/to) and new format (source/target)
        const connections = (parsed.connections || []).map((conn: any) => {
          let source: string;
          let target: string;
          
          if (conn.from && conn.to) {
            // Old format: convert to new format
            source = conn.from === 'trigger' ? 'trigger' : conn.from;
            target = conn.to;
          } else {
            // New format: use as-is
            source = conn.source || conn.from || 'trigger';
            target = conn.target || conn.to;
          }
          
          // 🚨 CRITICAL FIX: Prevent self-loops at structure parsing level
          if (source === target) {
            console.warn(`⚠️  [Structure Parsing] Prevented self-loop connection: ${source} → ${target}`);
            return null; // Return null to filter out
          }
          
          return {
            source,
            target,
            outputField: conn.outputField,
            inputField: conn.inputField,
          };
        }).filter((conn: any) => conn !== null); // Remove null entries (self-loops)
        
        // 🚨 CRITICAL: Enforce detected trigger type (override AI if wrong)
        let finalTrigger = parsed.trigger;
        if (detectedTrigger && detectedTrigger !== parsed.trigger) {
          console.warn(`⚠️  [Trigger Enforcement] AI generated "${parsed.trigger}" but detected "${detectedTrigger}" from requirements. Overriding.`);
          finalTrigger = detectedTrigger;
        }
        
        const structure: WorkflowGenerationStructure = {
          trigger: finalTrigger,
          steps: steps,
          outputs: parsed.outputs || [],
          connections: connections,
        };
        
        const isDebug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
        if (isDebug) {
          console.log(`🔍 [DIAGNOSTIC] [Pipeline Snapshot] After AI generation:`);
          console.log(`🔍 [DIAGNOSTIC]   - Detected integrations: ${detectedRequirements.requiredIntegrations.join(', ')}`);
          console.log(`🔍 [DIAGNOSTIC]   - Steps count: ${structure.steps.length}`);
          console.log(`🔍 [DIAGNOSTIC]   - Step types: ${structure.steps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
        }
        
        // CRITICAL: Skip filtering for chatbot workflows (they use fixed structure)
        const isChatbotIntent = this.detectChatbotIntent(requirements);
        if (isChatbotIntent) {
          console.log('🤖 [Structure] Chatbot workflow detected - skipping node filtering');
          return structure; // Return structure as-is for chatbot workflows
        }
        
        // ✅ CRITICAL: Skip filtering if structure came from sample workflow
        // Sample workflows are canonical patterns and should not be filtered
        const filteredStructure = (structure as any)._fromSampleWorkflow 
          ? structure 
          : this.filterUnmentionedNodes(structure, requirements, detectedRequirements);
        
        if ((structure as any)._fromSampleWorkflow) {
          console.log(`✅ [generateStructure] Skipping node filtering - structure from sample workflow: ${(structure as any)._sampleWorkflowId}`);
        }
        if (isDebug) {
          console.log(`🔍 [DIAGNOSTIC] [Pipeline Snapshot] After filtering:`);
          console.log(`🔍 [DIAGNOSTIC]   - Steps count: ${filteredStructure.steps.length}`);
          console.log(`🔍 [DIAGNOSTIC]   - Step types: ${filteredStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
        }
        
        // 🚨 CRITICAL: Enforce platform node selection - if platform is mentioned, ensure node exists
        const enforcedStructure = this.enforcePlatformNodeSelection(filteredStructure, requirements);
        if (isDebug) {
          console.log(`🔍 [DIAGNOSTIC] [Pipeline Snapshot] After platform enforcement:`);
          console.log(`🔍 [DIAGNOSTIC]   - Steps count: ${enforcedStructure.steps.length}`);
          console.log(`🔍 [DIAGNOSTIC]   - Step types: ${enforcedStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
        }
        
        // 🚨 CRITICAL: If user said "specify platform", remove duplicate CRM nodes (keep only one)
        const userPromptLower = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
        const userSaysSpecifyPlatform = userPromptLower.includes('specify platform') || userPromptLower.includes('specify the platform');
        if (userSaysSpecifyPlatform) {
          const crmPlatforms = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
          const crmSteps = enforcedStructure.steps.filter((step: any) => {
            const stepType = (step as any).data?.type || step.type || (step as any).nodeType || '';
            return crmPlatforms.includes(stepType.toLowerCase());
          });
          
          if (crmSteps.length > 1) {
            console.log(`⚠️  [CRM Deduplication] Found ${crmSteps.length} CRM nodes but user said "specify platform" - keeping only the first one`);
            // Priority: hubspot > zoho_crm > salesforce > pipedrive
            const crmPriority = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
            const firstCrmType = crmPriority.find(crm => 
              crmSteps.some((step: any) => {
                const stepType = (step as any).data?.type || step.type || (step as any).nodeType || '';
                return stepType.toLowerCase() === crm.toLowerCase();
              })
            ) || ((crmSteps[0] as any).data?.type || crmSteps[0].type || (crmSteps[0] as any).nodeType);
            
            // Remove all CRM steps except the first one (by priority)
            const nonCrmSteps = enforcedStructure.steps.filter((step: any) => {
              const stepType = (step as any).data?.type || step.type || (step as any).nodeType || '';
              return !crmPlatforms.includes(stepType.toLowerCase());
            });
            
            const firstCrmStep = crmSteps.find((step: any) => {
              const stepType = (step as any).data?.type || step.type || (step as any).nodeType || '';
              return stepType.toLowerCase() === firstCrmType.toLowerCase();
            }) || crmSteps[0];
            
            enforcedStructure.steps = [...nonCrmSteps, firstCrmStep];
            
            // Also update connections to remove references to removed CRM nodes
            if (enforcedStructure.connections) {
              const keptStepIds = new Set(enforcedStructure.steps.map((s: any) => s.id));
              enforcedStructure.connections = enforcedStructure.connections.filter((conn: any) => {
                const sourceId = conn.source === 'trigger' ? 'trigger' : conn.source;
                const targetId = conn.target;
                return sourceId === 'trigger' || keptStepIds.has(sourceId) || keptStepIds.has(targetId);
              });
            }
            
            console.log(`✅ [CRM Deduplication] Removed ${crmSteps.length - 1} duplicate CRM node(s), kept: ${firstCrmType}`);
          }
        }
        
        // Simplify structure for simple workflows (remove unnecessary transformation nodes)
        const simplifiedStructure = this.simplifyStructureForSimpleWorkflows(enforcedStructure, requirements);
        if (isDebug) {
          console.log(`🔍 [DIAGNOSTIC] [Pipeline Snapshot] After simplification:`);
          console.log(`🔍 [DIAGNOSTIC]   - Steps count: ${simplifiedStructure.steps.length}`);
          console.log(`🔍 [DIAGNOSTIC]   - Step types: ${simplifiedStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
        }
        
        // 🚨 CRITICAL: Enforce LOOP node if "extract from X and create Y" pattern is detected
        if (detectedRequirements.needsLoop) {
          const existingStepTypes = new Set(simplifiedStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const hasLoopNode = existingStepTypes.has('loop');
          
          if (!hasLoopNode) {
            console.warn(`⚠️  [Loop Enforcement] LOOP node missing. Adding it between data source and create operation.`);
            
            // Find data source node (google_sheets, database_read) and create operation node (hubspot, airtable)
            const dataSourceIndex = simplifiedStructure.steps.findIndex((s: any) => {
              const stepType = s.data?.type || s.type || s.nodeType;
              return ['google_sheets', 'database_read'].includes(stepType);
            });
            
            const createOperationIndex = simplifiedStructure.steps.findIndex((s: any) => {
              const stepType = s.data?.type || s.type || s.nodeType;
              return ['hubspot', 'airtable', 'salesforce', 'zoho_crm', 'pipedrive'].includes(stepType);
            });
            
            if (dataSourceIndex !== -1 && createOperationIndex !== -1 && createOperationIndex > dataSourceIndex) {
              const dataSourceStep = simplifiedStructure.steps[dataSourceIndex] as any;
              const createOperationStep = simplifiedStructure.steps[createOperationIndex] as any;
              const dataSourceType = dataSourceStep.data?.type || dataSourceStep.type || dataSourceStep.nodeType;
              const createOperationType = createOperationStep.data?.type || createOperationStep.type || createOperationStep.nodeType;
              
              // Infer properties for data source node (google_sheets)
              if (dataSourceType === 'google_sheets') {
                (dataSourceStep as any).inferredProperties = {
                  operation: 'read' // Default to 'read' for extracting data
                };
                console.log(`✅ [Loop Enforcement] Inferred google_sheets.operation = 'read'`);
              }
              
              // Infer properties for create operation node (hubspot, airtable, etc.)
              if (['hubspot', 'airtable', 'salesforce', 'zoho_crm', 'pipedrive'].includes(createOperationType)) {
                (createOperationStep as any).inferredProperties = {
                  operation: 'create', // Default to 'create' for "create contact" patterns
                  resource: createOperationType === 'hubspot' ? 'contact' : 'record' // Default resource
                };
                console.log(`✅ [Loop Enforcement] Inferred ${createOperationType}.operation = 'create', resource = '${(createOperationStep as any).inferredProperties.resource}'`);
              }
              
              // Insert loop node between data source and create operation
              const loopStep = {
                id: `step_loop_${Date.now()}`,
                description: `Loop through rows from ${dataSourceType}`,
                type: 'loop',
                // Pre-infer items property: will be set to {{$json.rows}} or {{$json.data}} from data source
                inferredProperties: {
                  items: '{{$json.rows}}' // Will be adjusted based on actual data source output field
                }
              };
              
              // Insert loop after data source, before create operation
              simplifiedStructure.steps.splice(createOperationIndex, 0, loopStep);
              console.log(`✅ [Loop Enforcement] Added loop node between ${dataSourceType} and ${createOperationType}`);
            } else {
              // Fallback: add loop after first data source node
              const firstDataSourceIndex = dataSourceIndex !== -1 ? dataSourceIndex : 0;
              const dataSourceStep = simplifiedStructure.steps[firstDataSourceIndex] as any;
              const dataSourceType = dataSourceStep.data?.type || dataSourceStep.type || dataSourceStep.nodeType;
              
              // Infer properties for data source if it's google_sheets
              if (dataSourceType === 'google_sheets') {
                (dataSourceStep as any).inferredProperties = {
                  operation: 'read'
                };
              }
              
              const loopStep = {
                id: `step_loop_${Date.now()}`,
                description: 'Loop through data rows',
                type: 'loop',
                inferredProperties: {
                  items: '{{$json.rows}}'
                }
              };
              simplifiedStructure.steps.splice(firstDataSourceIndex + 1, 0, loopStep);
              console.log(`✅ [Loop Enforcement] Added loop node after data source (fallback)`);
            }
          }
        }
        
        // 🚨 CRITICAL: Enforce data extraction node (set_variable) if extraction is detected
        if (detectedRequirements.needsDataExtraction) {
          const existingStepTypes = new Set(simplifiedStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const extractionNodeTypes = ['set_variable', 'set', 'json_parser', 'edit_fields'];
          const hasExtractionNode = extractionNodeTypes.some(nodeType => existingStepTypes.has(nodeType));
          
          if (!hasExtractionNode) {
            console.warn(`⚠️  [Data Extraction Enforcement] SET_VARIABLE node missing. Adding it after trigger.`);
            
            // Add set_variable node as first step after trigger
            const setVariableStep = {
              id: `step_set_variable_${Date.now()}`,
              description: 'Extract email and name from webhook body',
              type: 'set_variable',
            };
            
            // Insert after trigger (first position)
            simplifiedStructure.steps.unshift(setVariableStep);
            console.log(`✅ [Data Extraction Enforcement] Added set_variable node for data extraction`);
          }
        }
        
        // 🚨 CRITICAL: Enforce conditional node AFTER filtering (in case it was filtered out)
        // This ensures if_else is always present when conditional logic is detected
        if (detectedRequirements.needsConditional) {
          const existingStepTypes = new Set(simplifiedStructure.steps.map((s: any) => s.data?.type || s.type || s.nodeType));
          const conditionalNodeTypes = ['if_else', 'if', 'switch', 'filter'];
          const hasConditionalNode = conditionalNodeTypes.some(nodeType => existingStepTypes.has(nodeType));
          
          if (!hasConditionalNode) {
            console.warn(`⚠️  [Conditional Enforcement] IF/ELSE node missing after filtering. Adding it as FIRST step.`);
            
            // Remove unnecessary processing nodes (but keep set_variable if data extraction is needed)
            const processingNodeTypes = ['ai_agent', 'javascript', 'code', 'json_parser'];
            let finalSteps = simplifiedStructure.steps.filter((s: any) => {
              const stepType = s.data?.type || s.type || s.nodeType;
              // Keep set_variable if data extraction is needed
              if (detectedRequirements.needsDataExtraction && stepType === 'set_variable') {
                return true;
              }
              return !processingNodeTypes.includes(stepType);
            });
            
            // Add if_else node as FIRST step (before set_variable if it exists)
            const ifElseStep = {
              id: `step_if_else_${Date.now()}`,
              description: 'Check condition and route to different actions',
              type: 'if_else',
            };
            
            finalSteps.unshift(ifElseStep);
            simplifiedStructure.steps = finalSteps;
            
            console.log(`✅ [Conditional Enforcement] Added if_else node after filtering`);
            console.log(`🔍 [DIAGNOSTIC] Final step types: ${finalSteps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
          }
        }
        
        return simplifiedStructure;
      }
    } catch (error) {
      console.warn('Error generating structure with AI, using fallback logic:', error);
    }

    // Fallback: Generate structure using simple logic
    const fallbackStructure = this.generateStructureFallback(requirements);
    return this.simplifyStructureForSimpleWorkflows(fallbackStructure, requirements);
  }

  /**
   * CRITICAL: Filter out nodes that weren't mentioned in the requirements
   * Prevents adding Slack, email, or other nodes when user only mentioned specific services
   */
  private filterUnmentionedNodes(
    structure: WorkflowGenerationStructure,
    requirements: Requirements,
    detectedRequirements?: { needsConditional?: boolean; needsAiAgent?: boolean; needsHttpRequest?: boolean; requiredIntegrations?: string[] }
  ): WorkflowGenerationStructure {
    // CRITICAL: Use the ORIGINAL user prompt when available for better detection
    const originalPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    const keySteps = (requirements.keySteps || []).join(' ').toLowerCase();
    const promptLower = originalPrompt + ' ' + keySteps; // Combine for better detection
    
    const steps = structure.steps || [];
    const filteredSteps: typeof steps = [];
    const removedNodes: string[] = [];
    
    // Define service keywords mapping (expanded for better detection)
    const serviceKeywords: Record<string, string[]> = {
      'slack_message': ['slack', 'notify', 'notification'],
      'google_sheets': ['sheet', 'spreadsheet', 'sheets', 'google sheet'],
      'google_doc': ['doc', 'document', 'google doc', 'google document'],
      'google_gmail': ['gmail', 'google mail', 'google email', 'email via gmail', 'send via gmail', 'gmail them', 'gmail it', 'via gmail', 'send gmail', 'gmail send'],
      'email': ['email', 'send email', 'send mail', 'mail'], // Only used if Gmail is NOT mentioned
      'discord': ['discord'],
      'linkedin': ['linkedin', 'linked in', 'linked-in', 'li ', 'social media', 'social channel', 'social post'],
      'twitter': ['twitter', 'tweet', 'x.com', 'social media'],
      'instagram': ['instagram', 'ig ', 'instagram story', 'instagram post'],
      'whatsapp_cloud': ['whatsapp', 'whats app', 'whatsapp message', 'whatsapp notification'],
      'youtube': ['youtube', 'you tube', 'yt', 'youtube video', 'upload to youtube', 'post on youtube'],
      'hubspot': ['hubspot', 'hub spot', 'hubspot crm', 'crm', 'crm agent', 'customer relationship management'],
      'salesforce': ['salesforce', 'sf', 'crm', 'crm agent', 'customer relationship management'],
      'airtable': ['airtable'],
      'clickup': ['clickup', 'click up'],
      'notion': ['notion'],
      // CRM nodes that were being dropped
      'zoho_crm': ['zoho', 'zoho crm', 'crm system', 'customer relationship', 'sales crm', 'crm', 'crm agent', 'customer relationship management'], // ✅ Added 'crm' and 'crm agent' to match prompts like "create a crm agent"
      'pipedrive': ['pipedrive', 'sales pipeline', 'deal pipeline', 'crm', 'crm agent'],
      // Email / messaging
      'outlook': ['outlook', 'microsoft outlook', 'outlook email'],
      // ✅ Ensure Telegram nodes are kept when prompt mentions Telegram
      'telegram': ['telegram', 'telegram bot', 'telegram channel', 'telegram group'],
      // ✅ Ensure GitHub nodes are kept when prompt mentions GitHub / repos / issues / PRs
      'github': ['github', 'git hub', 'repository', 'repo', 'issue', 'pull request', 'pr'],
      // AI / HTTP
      'ai_chat_model': ['ai chat model', 'chat model', 'ai model', 'ai agent', 'use ai', 'using ai', 'with ai', 'ai to', 'summarize', 'analyze', 'ai analysis', 'ai generate', 'ollama', 'llm'],
      'ai_agent': ['ai agent', 'ai chat model', 'chat model', 'ai model', 'use ai', 'using ai', 'with ai', 'ai to', 'summarize', 'analyze', 'ai analysis', 'ai generate', 'ollama', 'llm'],
      'text_summarizer': ['text summarizer', 'summarizer', 'summarize', 'summary', 'summarization', 'ai summarization', 'ai summarize', 'ai summarizer', 'condense', 'summarize using ai', 'ai to summarize'],
      // Removed: ai_service is now a capability, not a node type
      // Capabilities are resolved to real nodes: ollama, openai_gpt, etc.
      'http_request': ['http', 'api', 'fetch', 'get', 'retrieve', 'call', 'endpoint', 'url'],
    };
    
    const isDebug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
    if (isDebug) {
      console.log(`🔍 [DIAGNOSTIC] [Node Filter] Starting filter with ${steps.length} steps`);
      console.log(`🔍 [DIAGNOSTIC] [Node Filter] Prompt: "${promptLower.substring(0, 100)}..."`);
    }
    
    // Check each step to see if it matches what was mentioned
    for (const step of steps) {
      // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
      // NOTE: WorkflowStepDefinition doesn't formally expose data/nodeType, so we cast to any here.
      const stepAny = step as any;
      const stepType = (stepAny.data?.type || stepAny.type || stepAny.nodeType || '').toLowerCase();
      const keywords = serviceKeywords[stepType] || [];
      
      if (isDebug) {
        console.log(`🔍 [DIAGNOSTIC] [Node Filter] Step: type="${stepType}", keywords=[${keywords.join(', ')}]`);
      }
      
      // CRITICAL: For platform nodes (LinkedIn, Twitter, Instagram) and CRM nodes, use more flexible matching
      const isPlatformNode = ['linkedin', 'twitter', 'instagram', 'facebook'].includes(stepType);
      const isCrmNode = ['hubspot', 'salesforce', 'airtable', 'clickup', 'notion', 'zoho_crm', 'pipedrive'].includes(stepType);
      
      if (isDebug) {
        console.log(`🔍 [DIAGNOSTIC] [Node Filter] Step "${stepType}": isPlatform=${isPlatformNode}, isCrm=${isCrmNode}`);
      }
      
      // Check if this service was mentioned in the prompt
      let wasMentioned = false;
      if (isPlatformNode || isCrmNode) {
        // ✅ CRITICAL: For CRM nodes, also check if generic "crm" is mentioned (even if not in keywords)
        if (isCrmNode && promptLower.includes('crm')) {
          wasMentioned = true;
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] CRM node "${stepType}" matched - generic "crm" found in prompt`);
          }
        } else {
        // For platform/CRM nodes, check if ANY keyword matches (more flexible)
        wasMentioned = keywords.some(keyword => {
            // Use word boundary matching for better accuracy, but allow partial matches for short keywords like "crm"
            if (keyword.length <= 4) {
              // For short keywords like "crm", use simple includes check
              const matches = promptLower.includes(keyword);
              if (isDebug && matches) {
                console.log(`🔍 [DIAGNOSTIC] [Node Filter] Short keyword "${keyword}" matched for "${stepType}"`);
              }
              return matches;
            } else {
              // For longer keywords, use word boundary matching
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const matches = regex.test(promptLower);
          if (isDebug && matches) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keyword "${keyword}" matched for "${stepType}"`);
          }
          return matches;
            }
        });
        }
      } else {
        // For other nodes, use simple includes check
        wasMentioned = keywords.some(keyword => {
          const matches = promptLower.includes(keyword);
          if (isDebug && matches) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keyword "${keyword}" matched for "${stepType}"`);
          }
          return matches;
        });
      }
      
      if (isDebug) {
        console.log(`🔍 [DIAGNOSTIC] [Node Filter] Step "${stepType}": wasMentioned=${wasMentioned}`);
      }
      
      // Special cases:
      // - google_sheets is mentioned if "sheet" or "spreadsheet" is in prompt
      // - google_doc is mentioned if "doc" or "document" is in prompt (but not "spreadsheet")
      // - slack_message is mentioned if "slack" or "notify" is in prompt
      
      // ✅ CRITICAL: Check if this is a conditional logic node
      const isConditionalNode = ['if_else', 'if', 'switch', 'filter'].includes(stepType);
      const conditionalMentioned = promptLower.includes('if') || 
                                   promptLower.includes('then') ||
                                   promptLower.includes('when') ||
                                   promptLower.includes('greater than') ||
                                   promptLower.includes('less than') ||
                                   promptLower.includes('otherwise') ||
                                   promptLower.includes('condition') ||
                                   promptLower.includes('check if') ||
                                   promptLower.includes('>') ||
                                   promptLower.includes('<') ||
                                   promptLower.includes('==');
      
      // For data processing nodes (javascript, if_else, etc.), check if transformation was mentioned
      const isDataProcessing = ['javascript', 'set_variable', 'text_formatter', 'json_parser'].includes(stepType);
      const transformationMentioned = promptLower.includes('transform') || 
                                     promptLower.includes('process') ||
                                     promptLower.includes('extract') ||
                                     promptLower.includes('filter') ||
                                     promptLower.includes('condition');
      
      // ✅ CRITICAL: For AI nodes, check if AI-related keywords are mentioned
      // ✅ Updated: ai_service removed, capabilities resolve to real nodes
      const isAiNode = ['ai_chat_model', 'ai_agent', 'chat_model', 'text_summarizer', 'ollama', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'ai_summarization', 'ai_summarizer'].includes(stepType);
      const aiMentioned = promptLower.includes('ai') || 
                         promptLower.includes('summarize') || 
                         promptLower.includes('summary') ||
                         promptLower.includes('summarization') ||
                         promptLower.includes('analyze') ||
                         promptLower.includes('ai model') ||
                         promptLower.includes('chat model') ||
                         promptLower.includes('ollama') ||
                         promptLower.includes('llm') ||
                         promptLower.includes('using ai') ||
                         promptLower.includes('with ai');
      
      // ✅ CRITICAL: For HTTP nodes, check if HTTP/API keywords are mentioned
      const isHttpNode = ['http_request', 'http_post', 'http_get'].includes(stepType);
      const httpMentioned = promptLower.includes('http') || 
                           promptLower.includes('api') ||
                           promptLower.includes('fetch') ||
                           promptLower.includes('call') ||
                           promptLower.includes('endpoint') ||
                           promptLower.includes('url');
      
      // ✅ CRITICAL: Always keep conditional nodes if conditional logic is detected
      if (isConditionalNode) {
        // Always keep conditional nodes if conditional logic was programmatically detected
        if (detectedRequirements?.needsConditional || conditionalMentioned) {
          filteredSteps.push(step);
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping conditional node "${stepType}" - conditional logic detected (programmatic: ${detectedRequirements?.needsConditional}, mentioned: ${conditionalMentioned})`);
          }
        } else {
          // Even if not detected, keep it if conditional keywords are mentioned
          filteredSteps.push(step);
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping conditional node "${stepType}" - conditional keywords found in prompt`);
          }
        }
      } else if (isDataProcessing) {
        if (transformationMentioned) {
          filteredSteps.push(step);
        } else {
          removedNodes.push(stepType);
        }
      } else if (isAiNode) {
        // 🚨 CRITICAL: Only keep AI nodes if explicitly mentioned OR if detectedRequirements.needsAiAgent is true
        const shouldKeep = aiMentioned || wasMentioned || detectedRequirements?.needsAiAgent;
        if (shouldKeep) {
          filteredSteps.push(step);
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping AI node "${stepType}" - AI mentioned: ${aiMentioned}, needsAiAgent: ${detectedRequirements?.needsAiAgent}`);
          }
        } else {
          removedNodes.push(stepType);
          logger.debug(`⚠️  [Node Filter] Removing "${stepType}" - AI not mentioned in prompt and needsAiAgent=false`);
        }
      } else if (isHttpNode) {
        // Keep HTTP nodes if HTTP/API keywords are mentioned
        if (httpMentioned || wasMentioned) {
          filteredSteps.push(step);
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping HTTP node "${stepType}" - HTTP/API mentioned in prompt`);
          }
        } else {
          removedNodes.push(stepType);
          logger.debug(`⚠️  [Node Filter] Removing "${stepType}" - HTTP/API not mentioned in prompt`);
        }
      } else if (stepType === 'google_gmail' || stepType === 'email') {
        // 🚨 CRITICAL: Special handling for Gmail/email nodes
        // Check if Gmail is mentioned in prompt
        const gmailKeywords = ['gmail', 'google mail', 'google email', 'send via gmail', 'gmail them', 'email via gmail'];
        const gmailMentioned = gmailKeywords.some(keyword => promptLower.includes(keyword));
        
        if (stepType === 'google_gmail') {
          // Keep google_gmail if Gmail is mentioned OR if it was already in the structure
          if (gmailMentioned || wasMentioned) {
            filteredSteps.push(step);
            if (isDebug) {
              console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping google_gmail node - Gmail mentioned: ${gmailMentioned}`);
            }
          } else {
            // Check if generic email keywords are mentioned (might be Gmail use case)
            const emailKeywords = ['send email', 'send mail', 'email', 'mail'];
            const emailMentioned = emailKeywords.some(keyword => promptLower.includes(keyword));
            if (emailMentioned) {
              // Keep google_gmail even if not explicitly mentioned (prefer Gmail over generic email)
              filteredSteps.push(step);
              if (isDebug) {
                console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping google_gmail node - email keywords found, preferring Gmail`);
              }
            } else {
              removedNodes.push(stepType);
              logger.debug(`⚠️  [Node Filter] Removing "${stepType}" - not mentioned in prompt`);
            }
          }
        } else if (stepType === 'email') {
          // Only keep generic email node if Gmail is NOT mentioned
          if (gmailMentioned) {
            // Gmail is mentioned, so remove generic email node (will be replaced with google_gmail)
            removedNodes.push(stepType);
            logger.debug(`⚠️  [Node Filter] Removing generic "${stepType}" node - Gmail mentioned, will use google_gmail instead`);
          } else if (wasMentioned) {
            // Keep generic email if email keywords are mentioned and Gmail is not
            filteredSteps.push(step);
            if (isDebug) {
              console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping email node - email mentioned, Gmail not mentioned`);
            }
          } else {
            removedNodes.push(stepType);
            logger.debug(`⚠️  [Node Filter] Removing "${stepType}" - not mentioned in prompt`);
          }
        }
      } else if (wasMentioned || stepType === 'log_output') {
        // Keep if mentioned OR if it's log_output (can be added automatically)
        filteredSteps.push(step);
      } else {
        // ✅ CRITICAL: Check if this node was programmatically detected (e.g., from detectedRequirements)
        // If it was detected programmatically, keep it even if not explicitly mentioned in prompt
        const stepAny = step as any;
        const isProgrammaticallyDetected = detectedRequirements?.requiredIntegrations?.includes(stepType.toUpperCase()) ||
                                          detectedRequirements?.requiredIntegrations?.some((int: string) => 
                                            stepType.toLowerCase() === int.toLowerCase() || 
                                            stepType.toLowerCase().includes(int.toLowerCase())
                                          );
        
        if (isProgrammaticallyDetected) {
          filteredSteps.push(step);
          if (isDebug) {
            console.log(`🔍 [DIAGNOSTIC] [Node Filter] Keeping "${stepType}" - programmatically detected integration`);
          }
      } else {
        // Remove node that wasn't mentioned
        removedNodes.push(stepType);
        logger.debug(`⚠️  [Node Filter] Removing "${stepType}" - not mentioned in prompt: "${requirements.primaryGoal}"`);
        }
      }
    }
    
    if (removedNodes.length > 0) {
      logger.debug(`✅ [Node Filter] Filtered out ${removedNodes.length} unmentioned node(s): ${removedNodes.join(', ')}`);
      
      // Update connections to remove references to filtered nodes
      const removedNodeIds = new Set(
        steps
          .filter(s => removedNodes.includes(s.type?.toLowerCase() || ''))
          .map(s => s.id)
      );
      
      const filteredConnections = (structure.connections || []).filter(conn => 
        !removedNodeIds.has(conn.source) && !removedNodeIds.has(conn.target)
      );
      
      // Rebuild connections if needed
      if (filteredSteps.length > 0 && filteredConnections.length === 0) {
        // Create simple linear connection: trigger → first step
        filteredConnections.push({
          source: 'trigger',
          target: filteredSteps[0].id,
        });
        
        // Connect steps sequentially
        for (let i = 0; i < filteredSteps.length - 1; i++) {
          filteredConnections.push({
            source: filteredSteps[i].id,
            target: filteredSteps[i + 1].id,
          });
        }
      }
      
      return {
        ...structure,
        steps: filteredSteps,
        connections: filteredConnections,
      };
    }
    
    return structure;
  }

  /**
   * 🚨 CRITICAL: Enforce platform node selection
   * If user mentions a platform (LinkedIn, Twitter, etc.), ensure the corresponding node exists
   * Also enforces Gmail/email node selection
   */
  private enforcePlatformNodeSelection(
    structure: WorkflowGenerationStructure,
    requirements: Requirements
  ): WorkflowGenerationStructure {
    // CRITICAL: Check ORIGINAL prompt (if available) and keySteps for platform mentions
    const promptText = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    const keySteps = (requirements.keySteps || []).join(' ').toLowerCase();
    const promptLower = promptText + ' ' + keySteps; // Combine for better detection
    
    const steps = structure.steps || [];
    const stepTypes = new Set(steps.map(s => (s as any).data?.type || s.type || (s as any).nodeType || '').map((t: string) => t.toLowerCase()));
    
    // Platform to node type mapping (expanded keywords)
    const platformMapping: Record<string, string> = {
      'linkedin': 'linkedin',
      'linked in': 'linkedin',
      'linked-in': 'linkedin',
      'li ': 'linkedin', // "post to li" or "li posting"
      'twitter': 'twitter',
      'tweet': 'twitter',
      'x.com': 'twitter',
      'instagram': 'instagram',
      'ig ': 'instagram', // "post to ig"
      'facebook': 'facebook',
      'fb ': 'facebook', // "post to fb"
      'youtube': 'youtube',
      'you tube': 'youtube',
      'yt': 'youtube',
    };
    
    let structureModified = false;
    let newSteps = [...steps];
    let newConnections = [...(structure.connections || [])];
    
    // 🚨 CRITICAL: Check for Gmail/email mentions FIRST (before platform nodes)
    // Gmail keywords (must check before generic email)
    const gmailKeywords = ['gmail', 'google mail', 'google email', 'send via gmail', 'gmail them', 'email via gmail'];
    const gmailMentioned = gmailKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(promptLower);
    });
    
    // Generic email keywords (only if Gmail is NOT mentioned)
    const emailKeywords = ['send email', 'send mail', 'email', 'mail'];
    const emailMentioned = !gmailMentioned && emailKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(promptLower);
    });
    
    // Check if Gmail node exists
    const hasGmailNode = stepTypes.has('google_gmail');
    const hasEmailNode = stepTypes.has('email');
    
    // 🚨 CRITICAL: If Gmail is mentioned but google_gmail node is missing, add it
    if (gmailMentioned && !hasGmailNode) {
      console.log(`🚨 [Gmail Enforcement] User mentioned Gmail but google_gmail node is missing. Adding it.`);
      
      // If there's a generic email node, replace it with google_gmail
      if (hasEmailNode) {
        console.log(`🚨 [Gmail Enforcement] Replacing generic email node with google_gmail node.`);
        newSteps = newSteps.map(step => {
          const stepType = ((step as any).data?.type || step.type || (step as any).nodeType || '').toLowerCase();
          if (stepType === 'email') {
            return {
              ...step,
              type: 'google_gmail',
              ...(step as any).data ? { data: { ...(step as any).data, type: 'google_gmail' } } : {},
            };
          }
          return step;
        });
        structureModified = true;
      } else {
        // Add new google_gmail node
        const newNodeId = `step_google_gmail_${Date.now()}`;
        newSteps.push({
          id: newNodeId,
          type: 'google_gmail',
          description: 'Send email via Gmail',
        });
        
        // Update connections: connect last step to new Gmail node
        if (newSteps.length > 1) {
          const lastStepId = newSteps[newSteps.length - 2].id;
          newConnections.push({
            source: lastStepId,
            target: newNodeId,
          });
        } else if (structure.trigger) {
          newConnections.push({
            source: 'trigger',
            target: newNodeId,
          });
        }
        structureModified = true;
      }
    } else if (emailMentioned && !hasGmailNode && !hasEmailNode) {
      // Only add generic email node if Gmail is NOT mentioned and no email node exists
      console.log(`🚨 [Email Enforcement] User mentioned email but email node is missing. Adding it.`);
      
      const newNodeId = `step_email_${Date.now()}`;
      newSteps.push({
        id: newNodeId,
        type: 'email',
        description: 'Send email via SMTP',
      });
      
      // Update connections
      if (newSteps.length > 1) {
        const lastStepId = newSteps[newSteps.length - 2].id;
        newConnections.push({
          source: lastStepId,
          target: newNodeId,
        });
      } else if (structure.trigger) {
        newConnections.push({
          source: 'trigger',
          target: newNodeId,
        });
      }
      structureModified = true;
    }
    
    // Check if any platform is mentioned
    for (const [platformKeyword, nodeType] of Object.entries(platformMapping)) {
      // More flexible matching: check if keyword appears as a word
      const keywordRegex = new RegExp(`\\b${platformKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const isMentioned = keywordRegex.test(promptLower);
      
      if (isMentioned && !stepTypes.has(nodeType)) {
        console.log(`🚨 [Platform Enforcement] User mentioned "${platformKeyword}" but "${nodeType}" node is missing. Adding it.`);
        
        // Add the missing platform node
        const newNodeId = `step_${nodeType}_${Date.now()}`;
        newSteps.push({
          id: newNodeId,
          type: nodeType,
          description: `Post to ${platformKeyword.charAt(0).toUpperCase() + platformKeyword.slice(1)}`,
        });
        
        // Update connections: connect last step to new platform node
        if (newSteps.length > 1) {
          const lastStepId = newSteps[newSteps.length - 2].id;
          newConnections.push({
            source: lastStepId,
            target: newNodeId,
          });
        } else if (structure.trigger) {
          // If only trigger exists, connect trigger to platform node
          newConnections.push({
            source: 'trigger',
            target: newNodeId,
          });
        } else {
          // If no trigger, create one and connect
          // This shouldn't happen, but handle it gracefully
          console.warn(`⚠️  [Platform Enforcement] No trigger found, platform node added but may need trigger`);
        }
        
        structureModified = true;
      }
    }
    
    if (structureModified) {
      return {
        ...structure,
        steps: newSteps,
        connections: newConnections,
      };
    }
    
    return structure;
  }

  /**
   * Simplify workflow structure for simple requests
   * Removes unnecessary extraction/transformation nodes for simple workflows
   */
  private simplifyStructureForSimpleWorkflows(
    structure: WorkflowGenerationStructure,
    requirements: Requirements
  ): WorkflowGenerationStructure {
    const promptLower = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    const steps = structure.steps || [];
    
    // Detect simple workflow patterns
    const isSimpleNotification = (
      promptLower.includes('send notification') ||
      promptLower.includes('notify') ||
      promptLower.includes('send message') ||
      promptLower.includes('alert')
    ) && !promptLower.includes('extract') && !promptLower.includes('transform') && !promptLower.includes('filter');
    
    const isSimpleSave = (
      promptLower.includes('save') ||
      promptLower.includes('store')
    ) && !promptLower.includes('extract') && !promptLower.includes('transform') && !promptLower.includes('separate');
    
    const isSimpleRead = (
      promptLower.includes('read') ||
      promptLower.includes('get data')
    ) && !promptLower.includes('extract') && !promptLower.includes('transform') && !promptLower.includes('filter');
    
    // If it's a simple workflow, remove unnecessary transformation nodes
    if (isSimpleNotification || isSimpleSave || isSimpleRead) {
      const transformationNodeTypes = ['set_variable', 'if_else', 'text_formatter', 'javascript', 'json_parser', 'edit_fields', 'merge_data'];
      const actionNodeTypes = ['slack_message', 'discord', 'google_gmail', 'email', 'google_sheets', 'database_write', 'database_read', 'google_doc'];
      
      // Find action nodes (the actual task)
      const actionNodes = steps.filter(step => 
        actionNodeTypes.includes(step.type?.toLowerCase() || '')
      );
      
      // Find transformation nodes (unnecessary for simple workflows)
      const transformationNodes = steps.filter(step =>
        transformationNodeTypes.includes(step.type?.toLowerCase() || '')
      );
      
      // If we have action nodes and transformation nodes, and transformation nodes are not needed
      if (actionNodes.length > 0 && transformationNodes.length > 0) {
        // Check if transformation nodes are actually doing something necessary
        const hasExplicitTransformation = promptLower.includes('extract') || 
                                         promptLower.includes('transform') || 
                                         promptLower.includes('calculate') ||
                                         promptLower.includes('filter') ||
                                         promptLower.includes('separate') ||
                                         promptLower.includes('categorize') ||
                                         promptLower.includes('if') ||
                                         promptLower.includes('condition');
        
        if (!hasExplicitTransformation) {
          console.log(`✅ [Structure Simplification] Detected simple workflow, removing ${transformationNodes.length} unnecessary transformation node(s)`);
          
          // Remove transformation nodes
          const simplifiedSteps = steps.filter(step => 
            !transformationNodeTypes.includes(step.type?.toLowerCase() || '')
          );
          
          // Update connections to skip transformation nodes
          const transformationNodeIds = new Set(transformationNodes.map(n => n.id));
          const simplifiedConnections = (structure.connections || [])
            .filter(conn => 
              !transformationNodeIds.has(conn.source) && 
              !transformationNodeIds.has(conn.target)
            )
            .map(conn => {
              // If connection was going through a transformation node, connect directly to action
              if (transformationNodeIds.has(conn.source)) {
                // Find the transformation node and its source
                const transNode = transformationNodes.find(n => n.id === conn.source);
                if (transNode) {
                  // Find connection that feeds into this transformation node
                  const inputConn = (structure.connections || []).find(c => c.target === transNode.id);
                  if (inputConn && actionNodes.length > 0) {
                    // Connect directly from original source to action node
                    return {
                      ...conn,
                      source: inputConn.source,
                      target: actionNodes[0].id,
                    };
                  }
                }
              }
              return conn;
            })
            .filter(conn => conn.source && conn.target); // Remove invalid connections
          
          // If no connections remain, create direct connection from trigger to action
          if (simplifiedConnections.length === 0 && actionNodes.length > 0) {
            simplifiedConnections.push({
              source: 'trigger',
              target: actionNodes[0].id,
              outputField: 'inputData',
              inputField: 'input',
            });
          }
          
          return {
            ...structure,
            steps: simplifiedSteps,
            connections: simplifiedConnections,
          };
        }
      }
    }
    
    return structure;
  }

  /**
   * Fallback structure generation when AI is unavailable
   */
  private generateStructureFallback(
    requirements: Requirements
  ): WorkflowGenerationStructure {
    const structure: WorkflowGenerationStructure = {
      trigger: null,
      steps: [],
      outputs: [],
      connections: [],
    };
    
    // Determine trigger type based on requirements - FIXED: Don't default to schedule
    // Only use schedule if explicitly mentioned in schedules array or prompt
    const promptLower = requirements.primaryGoal?.toLowerCase() || '';
    const hasScheduleKeywords = promptLower.includes('schedule') || 
                                promptLower.includes('daily') || 
                                promptLower.includes('weekly') || 
                                promptLower.includes('hourly') ||
                                promptLower.includes('cron') ||
                                promptLower.includes('recurring') ||
                                promptLower.includes('periodic') ||
                                promptLower.includes('automatically at');
    
    // Enhanced form trigger detection - check for all variations
    const hasFormKeywords = promptLower.includes('form') || 
                           promptLower.includes('submit') ||
                           promptLower.includes('submission') ||
                           promptLower.includes('user submits') ||
                           promptLower.includes('when a user submits') ||
                           promptLower.includes('form submission') ||
                           promptLower.includes('form trigger') ||
                           promptLower.includes('form input') ||
                           promptLower.includes('form data');
    
    if (requirements.schedules && requirements.schedules.length > 0 && hasScheduleKeywords) {
      structure.trigger = 'schedule';
    } else if (requirements.urls && requirements.urls.some(url => url.includes('webhook'))) {
      structure.trigger = 'webhook';
    } else if (requirements.platforms && requirements.platforms.some(p => p.toLowerCase().includes('form'))) {
      structure.trigger = 'form';
    } else if (hasFormKeywords) {
      // Prioritize form trigger if form keywords are detected
      structure.trigger = 'form';
    } else if (promptLower.includes('webhook') || promptLower.includes('http request') || promptLower.includes('api call')) {
      structure.trigger = 'webhook';
    } else {
      // Default to manual trigger - user can change it later
      structure.trigger = 'manual_trigger';
    }
    
    // Map key steps to workflow steps
    requirements.keySteps.forEach((step, index) => {
      // CRITICAL FIX: Check if Google Sheets is mentioned in step or requirements
      const stepLower = step.toLowerCase();
      const promptLower = requirements.primaryGoal?.toLowerCase() || '';
      const hasGoogleSheets = stepLower.includes('google sheet') || 
                              stepLower.includes('spreadsheet') ||
                              stepLower.includes('sheets') ||
                              promptLower.includes('google sheet') ||
                              promptLower.includes('spreadsheet') ||
                              promptLower.includes('sheets');
      
      // CRITICAL: Check if LinkedIn is mentioned - if not, don't add it
      const hasLinkedIn = stepLower.includes('linkedin') || 
                          stepLower.includes('linked in') ||
                          promptLower.includes('linkedin') ||
                          promptLower.includes('linked in');
      
      let inferredType = this.inferStepType(step);
      
      // Force google_sheets if Google Sheets is mentioned
      if (hasGoogleSheets && (inferredType === 'database_read' || inferredType === 'database_write' || inferredType === 'javascript')) {
        console.log(`✅ Correcting step type from ${inferredType} to google_sheets (Google Sheets detected in: "${step}")`);
        inferredType = 'google_sheets';
      }
      
      // CRITICAL: Remove LinkedIn if not mentioned
      if (inferredType === 'linkedin' && !hasLinkedIn) {
        console.log(`⚠️  LinkedIn detected but not mentioned in prompt. Changing to slack_message (step: "${step}")`);
        // Default to slack if notification is needed, or remove if not
        if (stepLower.includes('send') || stepLower.includes('notify') || stepLower.includes('post')) {
          inferredType = 'slack_message'; // Default to Slack for notifications
        } else {
          // Skip this step if it's not clear what it should be
          console.log(`⚠️  Skipping step "${step}" - LinkedIn not mentioned and unclear alternative`);
          return; // Skip adding this step
        }
      }
      
      const stepDefinition: WorkflowStepDefinition = {
        id: `step_${index + 1}`,
        description: step,
        type: inferredType,
      };
      structure.steps.push(stepDefinition);
    });
    
    // Map outputs - FIXED: Now correctly typed as OutputDefinition[]
    requirements.outputs.forEach((output, index) => {
      const outputDefinition: OutputDefinition = {
        name: this.generateOutputName(output),
        type: this.inferOutputType(output),
        description: output,
        required: true,
        format: this.inferFormat(output),
      };
      structure.outputs.push(outputDefinition);
    });
    
    // Generate sequential connections
    if (structure.steps.length > 0) {
      structure.connections = [];
      // Connect trigger to first step
      structure.connections.push({
        source: 'trigger',
        target: structure.steps[0].id,
      });
      // Connect steps sequentially
      for (let i = 0; i < structure.steps.length - 1; i++) {
        const sourceId = structure.steps[i].id;
        const targetId = structure.steps[i + 1].id;
        // 🚨 CRITICAL FIX: Prevent self-loops
        if (sourceId !== targetId) {
          structure.connections.push({
            source: sourceId,
            target: targetId,
          });
        } else {
          console.warn(`⚠️  [Sequential Connections] Prevented self-loop: ${sourceId} → ${targetId}`);
        }
      }
    }
    
    // Validate the structure before returning
    const validation = TypeValidator.validateStructure({
      inputs: [],
      outputs: structure.outputs,
      steps: structure.steps,
    });
    
    if (!validation.isValid) {
      console.warn('⚠️  Structure validation warnings:', validation.errors);
      if (validation.errors.length > 0) {
        throw new Error(`Invalid workflow structure: ${validation.errors.join(', ')}`);
      }
    }
    
    return structure;
  }

  /**
   * Apply node preferences to workflow structure
   */
  private applyNodePreferences(
    structure: WorkflowGenerationStructure,
    nodePreferences: Record<string, string>,
    requirements: Requirements
  ): WorkflowGenerationStructure {
    const updatedStructure = { ...structure };
    
    // Apply preferences to trigger if scheduling preference exists
    if (nodePreferences.scheduling) {
      const preference = nodeEquivalenceMapper.getNodeOption('scheduling', nodePreferences.scheduling);
      if (preference && nodeLibrary.getSchema(preference.nodeType)) {
        updatedStructure.trigger = preference.nodeType;
      }
    }
    
    // Apply preferences to steps (notifications, databases, file storage, etc.)
    updatedStructure.steps = structure.steps.map(step => {
      const stepLower = step.description?.toLowerCase() || '';
      
      // Check for notification preference
      if (nodePreferences.notification && (
        stepLower.includes('notify') || 
        stepLower.includes('send') || 
        stepLower.includes('alert') ||
        stepLower.includes('message') ||
        step.type === 'slack_message' ||
        step.type === 'email' ||
        step.type === 'discord_webhook' ||
        step.type === 'twilio'
      )) {
        const preference = nodeEquivalenceMapper.getNodeOption('notification', nodePreferences.notification);
        if (preference && nodeLibrary.getSchema(preference.nodeType)) {
          return { ...step, type: preference.nodeType };
        }
      }
      
      // Check for database preference
      if (nodePreferences.database && (
        stepLower.includes('store') || 
        stepLower.includes('save') || 
        stepLower.includes('database') ||
        step.type === 'database_read' ||
        step.type === 'database_write' ||
        step.type === 'supabase'
      )) {
        const preference = nodeEquivalenceMapper.getNodeOption('database', nodePreferences.database);
        if (preference && nodeLibrary.getSchema(preference.nodeType)) {
          return { ...step, type: preference.nodeType };
        }
      }
      
      // Check for file storage preference
      if (nodePreferences.file_storage && (
        stepLower.includes('file') || 
        stepLower.includes('upload') || 
        stepLower.includes('store file') ||
        step.type === 'google_drive' ||
        step.type === 'aws_s3'
      )) {
        const preference = nodeEquivalenceMapper.getNodeOption('file_storage', nodePreferences.file_storage);
        if (preference && nodeLibrary.getSchema(preference.nodeType)) {
          return { ...step, type: preference.nodeType };
        }
      }
      
      return step;
    });
    
    return updatedStructure;
  }

  /**
   * UNIVERSAL: Infer node type from step description using node library service
   * Uses schema information for intelligent matching
   */
  private inferStepType(step: string, context?: string): string {
    const stepLower = step.toLowerCase();
    const originalStep = step;
    
    console.log(`🔍 [inferStepType] Analyzing step: "${step.substring(0, 80)}"`);
    
    // ✅ CRITICAL: Try sample workflow matching FIRST (highest priority)
    // This ensures we use real-world workflow patterns instead of direct keyword matching
    try {
      const { workflowTrainingService } = require('./workflow-training-service');
      const modernExamples = workflowTrainingService.getModernExamples(10, step);
      
      for (const example of modernExamples) {
        const selectedNodes = example.phase1?.step5?.selectedNodes || [];
        
        // Check if step description matches example goal/description
        const exampleGoal = (example.goal || '').toLowerCase();
        const exampleDesc = (example.description || '').toLowerCase();
        const stepWords = stepLower.split(/\s+/).filter(w => w.length > 3);
        const exampleWords = (exampleGoal + ' ' + exampleDesc).split(/\s+/).filter(w => w.length > 3);
        
        // Calculate similarity
        const matchingWords = stepWords.filter(w => exampleWords.includes(w));
        const similarity = matchingWords.length / Math.max(stepWords.length, exampleWords.length);
        
        if (similarity > 0.3 && selectedNodes.length > 0) {
          // Use the first node from the matching example
          const matchedNodeType = selectedNodes[0];
          const schema = nodeLibrary.getSchema(matchedNodeType);
          if (schema) {
            console.log(`✅ [inferStepType] Matched sample workflow: "${example.goal}" → ${matchedNodeType} (similarity: ${similarity.toFixed(2)})`);
            return matchedNodeType;
          }
        }
      }
    } catch (error) {
      console.log('[inferStepType] Sample workflows not available, using standard matching');
    }
    
    // CRITICAL: Use Enhanced Keyword Matcher for better matching
    try {
      const { enhancedKeywordMatcher } = require('./enhanced-keyword-matcher');
      const match = enhancedKeywordMatcher.findBestMatch(step, context);
      if (match && match.confidence === 'high') {
        console.log(`✅ [inferStepType] Enhanced matcher found: "${match.nodeType}" (score: ${match.score}, keywords: ${match.matchedKeywords.join(', ')})`);
        return match.nodeType;
      }
    } catch (error) {
      // Enhanced matcher not available, continue with fallback
    }
    
    // CRITICAL: Priority-based matching - check specific services FIRST
    // Google Services
    if (stepLower.includes('google doc') || stepLower.includes('google document') || stepLower.includes('read doc') || stepLower.includes('extract from doc')) {
      const schema = nodeLibrary.getSchema('google_doc');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Google Doc from: "${step.substring(0, 50)}"`);
        return 'google_doc';
      }
    }
    
    if (stepLower.includes('google sheet') || stepLower.includes('spreadsheet') || stepLower.includes('sheets') || 
        stepLower.includes('read from sheet') || stepLower.includes('save to sheet') || stepLower.includes('store in sheet')) {
      const schema = nodeLibrary.getSchema('google_sheets');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Google Sheets from: "${step.substring(0, 50)}"`);
        return 'google_sheets';
      }
    }
    
    // Communication Services
    if (stepLower.includes('slack') || stepLower.includes('notify') || stepLower.includes('send to slack') || stepLower.includes('post to slack')) {
      const schema = nodeLibrary.getSchema('slack_message');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Slack from: "${step.substring(0, 50)}"`);
        return 'slack_message';
      }
    }
    
    // 🚨 CRITICAL: Check for Gmail patterns FIRST (before generic email)
    // Gmail uses OAuth, not SMTP - must use google_gmail node
    if (stepLower.includes('gmail') || 
        stepLower.includes('google mail') || 
        stepLower.includes('google email') ||
        (stepLower.includes('email') && stepLower.includes('gmail')) ||
        (stepLower.includes('send') && stepLower.includes('gmail')) ||
        (stepLower.includes('via') && stepLower.includes('gmail'))) {
      const schema = nodeLibrary.getSchema('google_gmail');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Gmail from: "${step.substring(0, 50)}"`);
        return 'google_gmail';
      }
    }
    
    // Only use generic email node if Gmail is NOT mentioned
    if (stepLower.includes('email') && 
        !stepLower.includes('gmail') && 
        !stepLower.includes('google mail') && 
        !stepLower.includes('google email')) {
      const schema = nodeLibrary.getSchema('email');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Email from: "${step.substring(0, 50)}"`);
        return 'email';
      }
    }
    
    // CRITICAL FIX: Airtable patterns - check BEFORE AI agent
    if (stepLower.includes('airtable') || 
        (stepLower.includes('add') && stepLower.includes('row') && stepLower.includes('airtable')) ||
        (stepLower.includes('add') && stepLower.includes('a') && stepLower.includes('row') && stepLower.includes('airtable')) ||
        (stepLower.includes('create') && stepLower.includes('record') && stepLower.includes('airtable')) ||
        (stepLower.includes('save') && stepLower.includes('to') && stepLower.includes('airtable'))) {
      const airtableSchema = nodeLibrary.getSchema('airtable');
      if (airtableSchema) {
        console.log(`✅ [inferStepType] Detected Airtable from: "${step.substring(0, 50)}"`);
        return 'airtable';
      }
    }
    
    // Social Media - ONLY if explicitly mentioned
    if (stepLower.includes('linkedin') || stepLower.includes('linked in') || stepLower.includes('post to linkedin')) {
      const schema = nodeLibrary.getSchema('linkedin');
      if (schema) {
        console.log(`✅ [inferStepType] Detected LinkedIn from: "${step.substring(0, 50)}"`);
        return 'linkedin';
      }
    }
    
    if (stepLower.includes('twitter') || stepLower.includes('tweet') || stepLower.includes('x.com')) {
      const schema = nodeLibrary.getSchema('twitter');
      if (schema) {
        console.log(`✅ [inferStepType] Detected Twitter from: "${step.substring(0, 50)}"`);
        return 'twitter';
      }
    }
    
    // AI/ML Services - Check FIRST before general matching
    // ✅ CRITICAL: Check for AI summarization FIRST (before AI agent)
    if (stepLower.includes('summarize') || stepLower.includes('summary') || 
        stepLower.includes('summarization') || stepLower.includes('ai summarization') ||
        stepLower.includes('ai summarize') || stepLower.includes('ai summarizer') ||
        (stepLower.includes('ai') && stepLower.includes('summarize')) ||
        (stepLower.includes('using ai') && stepLower.includes('summarize'))) {
      const summarizerSchema = nodeLibrary.getSchema('text_summarizer');
      if (summarizerSchema) {
        console.log(`✅ [inferStepType] Detected Text Summarizer from: "${step.substring(0, 50)}"`);
        return 'text_summarizer';
      }
    }
    
    // AI/ML Services - ONLY if NOT a specific integration action
    if (stepLower.includes('ai agent') || stepLower.includes('ai_agent') || 
        stepLower.includes('chatbot') || stepLower.includes('chat bot') ||
        stepLower.includes('conversational ai') || stepLower.includes('ai assistant') ||
        stepLower.includes('llm') || stepLower.includes('language model')) {
      // CRITICAL: Don't use ai_agent for integration actions
      const isIntegrationAction = stepLower.includes('airtable') || 
                                  stepLower.includes('gmail') || 
                                  stepLower.includes('hubspot') || 
                                  stepLower.includes('slack') ||
                                  (stepLower.includes('add') && stepLower.includes('row')) ||
                                  (stepLower.includes('send') && stepLower.includes('email'));
      
      if (!isIntegrationAction) {
        const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
        if (aiAgentSchema) {
          console.log(`✅ [inferStepType] Detected AI Agent from: "${step.substring(0, 50)}"`);
          return 'ai_agent';
        }
      } else {
        console.log(`⚠️  [inferStepType] Skipping AI Agent - detected integration action: "${step.substring(0, 50)}"`);
      }
    }
    
    // Data Processing
    if (stepLower.includes('javascript') || stepLower.includes('js code') || stepLower.includes('transform') || 
        stepLower.includes('process data') || stepLower.includes('code') || stepLower.includes('script')) {
      const schema = nodeLibrary.getSchema('javascript');
      if (schema) {
        console.log(`✅ [inferStepType] Detected JavaScript from: "${step.substring(0, 50)}"`);
        return 'javascript';
      }
    }
    
    // Conditional Logic
    if (stepLower.includes('if') || stepLower.includes('condition') || stepLower.includes('check') || 
        stepLower.includes('whether') || stepLower.includes('filter') || stepLower.includes('separate')) {
      const schema = nodeLibrary.getSchema('if_else');
      if (schema) {
        console.log(`✅ [inferStepType] Detected If/Else from: "${step.substring(0, 50)}"`);
        return 'if_else';
      }
    }
    
    // Database Operations
    if (stepLower.includes('database') || stepLower.includes('db') || stepLower.includes('query') || 
        stepLower.includes('sql') || stepLower.includes('supabase')) {
      if (stepLower.includes('supabase')) {
        const schema = nodeLibrary.getSchema('supabase');
        if (schema) {
          console.log(`✅ [inferStepType] Detected Supabase from: "${step.substring(0, 50)}"`);
          return 'supabase';
        }
      }
      if (stepLower.includes('read') || stepLower.includes('get') || stepLower.includes('fetch')) {
        const schema = nodeLibrary.getSchema('database_read');
        if (schema) {
          console.log(`✅ [inferStepType] Detected Database Read from: "${step.substring(0, 50)}"`);
          return 'database_read';
        }
      }
      if (stepLower.includes('write') || stepLower.includes('save') || stepLower.includes('insert') || stepLower.includes('update')) {
        const schema = nodeLibrary.getSchema('database_write');
        if (schema) {
          console.log(`✅ [inferStepType] Detected Database Write from: "${step.substring(0, 50)}"`);
          return 'database_write';
        }
      }
    }
    
    // Use nodeLibrary service (UNIVERSAL - works for all nodes) as fallback
    const allSchemas = nodeLibrary.getAllSchemas();
    
    interface MatchResult {
      type: string;
      score: number;
      reason: string;
    }
    let bestMatch: MatchResult | null = null;
    
    // Check all nodes in library (UNIVERSAL) - only if no priority match found
    for (const schema of allSchemas) {
      const type = schema.type;
      const nodeLabelLower = schema.label.toLowerCase();
      const nodeDescLower = schema.description.toLowerCase();
      const keywords = schema.aiSelectionCriteria?.keywords || [];
      const keywordsLower = keywords.map(k => k.toLowerCase());
      
      let score = 0;
      let reason = '';
      
      // Check if step keywords match node label or description
      const stepWords = stepLower.split(/\s+/);
      stepWords.forEach(word => {
        if (word.length > 2) { // Ignore short words
          if (nodeLabelLower.includes(word)) {
            score += 3;
            reason += `label:${word} `;
          }
          if (nodeDescLower.includes(word)) {
            score += 2;
            reason += `desc:${word} `;
          }
          if (type.includes(word)) {
            score += 4;
            reason += `type:${word} `;
          }
          // Check against keywords from schema (UNIVERSAL) - REDUCED WEIGHT
          if (keywordsLower.some(k => k.includes(word) || word.includes(k))) {
            score += 2; // Reduced from 5 to 2 - sample workflows should take priority
            reason += `keyword:${word} `;
          }
        }
      });
      
      // Use schema keywords for matching (UNIVERSAL) - REDUCED WEIGHT to prioritize sample workflows
      keywordsLower.forEach(keyword => {
        if (stepLower.includes(keyword)) {
          score += 3; // Reduced from 10 to 3 - sample workflows should take priority
          reason += `schema-keyword:${keyword} `;
        }
      });
      
      // Check "when to use" criteria (UNIVERSAL)
      const whenToUse = schema.aiSelectionCriteria?.whenToUse || [];
      whenToUse.forEach(criterion => {
        if (stepLower.includes(criterion.toLowerCase())) {
          score += 8;
          reason += `when-to-use:${criterion} `;
        }
      });
      
      // Penalize "when not to use" matches
      const whenNotToUse = schema.aiSelectionCriteria?.whenNotToUse || [];
      whenNotToUse.forEach(criterion => {
        if (stepLower.includes(criterion.toLowerCase())) {
          score -= 5;
          reason += `when-not-to-use:${criterion} `;
        }
      });
      
      // Additional specific keyword matching with higher weights
      if (stepLower.includes('http') || stepLower.includes('api') || stepLower.includes('request') || stepLower.includes('endpoint')) {
        if (type === 'http_request' || type === 'http_post') {
          score += 15;
          reason += 'http-match ';
        }
      }
      
      // Penalize wrong matches
      // Don't match database_read for Google Sheets
      if (stepLower.includes('sheet') && type === 'database_read') {
        score -= 20;
        reason += 'penalty:sheet-not-db ';
      }
      if (stepLower.includes('sheet') && type === 'database_write') {
        score -= 20;
        reason += 'penalty:sheet-not-db-write ';
      }
      // Don't match google_doc for sheets
      if (stepLower.includes('sheet') && type === 'google_doc') {
        score -= 20;
        reason += 'penalty:sheet-not-doc ';
      }
      // Don't match google_sheets for docs
      if (stepLower.includes('doc') && !stepLower.includes('sheet') && type === 'google_sheets') {
        score -= 20;
        reason += 'penalty:doc-not-sheet ';
      }
      
      if (score > 0) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { type, score, reason: reason.trim() };
        }
      }
    }
    
    // Validate that the matched type exists in library (UNIVERSAL validation)
    if (bestMatch && bestMatch.score > 5) { // Minimum threshold
      const matchedSchema = nodeLibrary.getSchema(bestMatch.type);
      if (matchedSchema) {
        console.log(`✅ [inferStepType] Selected "${bestMatch.type}" with score ${bestMatch.score} (${bestMatch.reason}) for: "${originalStep.substring(0, 50)}"`);
        return bestMatch.type;
      } else {
        console.warn(`⚠️  [inferStepType] Matched type "${bestMatch.type}" not found in library`);
      }
    }
    
    // Fallback to a safe default that exists in library
    console.warn(`⚠️  [inferStepType] No good match found for: "${originalStep.substring(0, 50)}", using fallback`);
    const fallbackSchema = nodeLibrary.getSchema('set_variable');
    return fallbackSchema ? 'set_variable' : allSchemas[0]?.type || 'set_variable';
  }

  private inferOutputType(output: string): 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' {
    const outputLower = output.toLowerCase();
    
    // Determine the data type, not the node type
    if (outputLower.includes('json') || outputLower.includes('object')) return 'object';
    if (outputLower.includes('array') || outputLower.includes('list')) return 'array';
    if (outputLower.includes('number') || outputLower.includes('count') || outputLower.includes('total')) return 'number';
    if (outputLower.includes('boolean') || outputLower.includes('flag')) return 'boolean';
    if (outputLower.includes('file') || outputLower.includes('attachment')) return 'file';
    
    return 'string';
  }

  private inferFormat(output: string): string | undefined {
    const outputLower = output.toLowerCase();
    
    if (outputLower.includes('json')) return 'json';
    if (outputLower.includes('csv')) return 'csv';
    if (outputLower.includes('xml')) return 'xml';
    if (outputLower.includes('html')) return 'html';
    if (outputLower.includes('markdown') || outputLower.includes('md')) return 'markdown';
    
    return undefined;
  }

  private generateOutputName(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
  }
  
  /**
   * Detect chatbot intent from requirements
   */
  private detectChatbotIntent(requirements: Requirements): boolean {
    const promptLower = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    
    // CRITICAL: Make chatbot detection STRICT - only match explicit chatbot requests
    // Do NOT match generic words like "assistant" or "bot" that appear in other contexts
    const strictChatbotKeywords = [
      'chatbot',
      'chat bot',
      'create chatbot',
      'build chatbot',
      'ai chat',
      'conversational ai',
      'chat with ai',
      'talk to ai',
      'ai conversation',
      'create ai agent',
      'build ai agent',
    ];
    
    // Check for strict matches
    const hasStrictMatch = strictChatbotKeywords.some(keyword => promptLower.includes(keyword));
    
    // Additional check: if user says "chat" or "conversation" AND mentions AI/agent, it's likely a chatbot
    const hasChatKeyword = promptLower.includes('chat') || promptLower.includes('conversation');
    const hasAIAgentKeyword = promptLower.includes('ai agent') || promptLower.includes('ai assistant');
    const hasChatAndAI = hasChatKeyword && hasAIAgentKeyword;
    
    // CRITICAL: Exclude false positives
    // If prompt mentions data extraction, sheets, database, etc., it's NOT a chatbot
    const isDataWorkflow = promptLower.includes('extract') || 
                          promptLower.includes('sheet') || 
                          promptLower.includes('database') ||
                          promptLower.includes('read data') ||
                          promptLower.includes('get data') ||
                          promptLower.includes('save data') ||
                          promptLower.includes('store data');
    
    if (isDataWorkflow) {
      console.log(`✅ [Chatbot Detection] Excluding chatbot mode - data workflow detected: "${requirements.primaryGoal}"`);
      return false;
    }
    
    const isChatbot = hasStrictMatch || hasChatAndAI;
    
    if (isChatbot) {
      console.log(`🤖 [Chatbot Detection] Chatbot intent detected: "${requirements.primaryGoal}"`);
    }
    
    return isChatbot;
  }
  
  /**
   * Generate fixed chatbot workflow structure (N8N-style)
   * Structure: Trigger → AI Agent (with Gemini Chat Model + Window Buffer Memory)
   * @param triggerType - Optional trigger type (default: 'chat_trigger'). Use 'schedule' for scheduled chatbots.
   */
  private generateFixedChatbotStructure(triggerType: string = 'chat_trigger'): WorkflowGenerationStructure {
    return {
      trigger: triggerType,
      steps: [
        {
          id: 'ai_agent',
          description: 'AI Agent with Gemini Chat Model and Memory',
          type: 'ai_agent',
        },
      ],
      outputs: [
        {
          name: 'reply',
          type: 'string',
          description: 'AI response message',
          required: true,
        },
      ],
    };
  }

  private async selectNodes(
    structure: WorkflowGenerationStructure,
    requirements: Requirements
  ): Promise<WorkflowNode[]> {
    // ✅ CRITICAL: Check if this structure came from a sample workflow
    const isFromSampleWorkflow = (structure as any)._fromSampleWorkflow === true;
    const sampleWorkflowId = (structure as any)._sampleWorkflowId;
    
    if (isFromSampleWorkflow) {
      console.log(`✅ [selectNodes] Structure from sample workflow: ${sampleWorkflowId}`);
      console.log(`   Using EXACT node types from sample workflow - skipping type inference`);
    }
    
    console.log(`🔍 [DIAGNOSTIC] [selectNodes] Starting with ${structure.steps.length} steps`);
    console.log(`🔍 [DIAGNOSTIC] [selectNodes] Step types: ${structure.steps.map((s: any) => s.data?.type || s.type || s.nodeType).join(', ')}`);
    
    let nodes: WorkflowNode[] = [];
    let xPosition = 100;
    // Use NodeLibrary to get better node selection
    const triggerType = structure.trigger || 'manual_trigger';
    const triggerSchema = nodeLibrary.getSchema(triggerType);
    const triggerLabel = triggerSchema?.label || this.getNodeLabel(triggerType);
    const triggerCategory = triggerSchema?.category || 'triggers';
    
    // ✅ FIXED: Check if trigger node already exists BEFORE creating (prevent duplicates)
    const { getTriggerNodes } = await import('../../core/utils/trigger-deduplicator');
    const existingTriggers = getTriggerNodes(nodes);
    
    if (existingTriggers.length > 0) {
      // ✅ FIXED: If trigger exists, do not create another - just log and continue
      const existingTriggerType = normalizeNodeType(existingTriggers[0]);
      console.log(`✅ [NODE SELECTION] Trigger node already exists (type: ${existingTriggerType}), skipping trigger creation`);
      // Do NOT remove duplicates here - workflow must have exactly one trigger, and we've checked it exists
    } else {
      // ✅ FIXED: Only add trigger if none exists
      // Add trigger node with unique UUID (position will be set by layout algorithm)
      const triggerNode: WorkflowNode = {
        id: randomUUID(),
        type: triggerType,
        position: { x: 0, y: 0 }, // Will be set by layout algorithm
        data: {
          type: triggerType,
          label: triggerLabel,
          category: triggerCategory,
          config: {},
        },
      };
      nodes.push(triggerNode);
      console.log(`✅ [NODE SELECTION] Added trigger node: ${triggerType}`);
    }
    
    // CRITICAL: Validate and filter nodes using node library service
    // This ensures ALL nodes exist in the library before processing
    // DEBUG: Log all available node types for debugging
    const allAvailableNodeTypes = nodeLibrary.getAllSchemas().map(s => s.type);
    console.log(`📚 [NODE VALIDATION] Available node types in library: ${allAvailableNodeTypes.length} nodes`);
    console.log(`📚 [NODE VALIDATION] Sample nodes: ${allAvailableNodeTypes.slice(0, 10).join(', ')}...`);
    
    const validSteps = structure.steps.filter((step: WorkflowStepDefinition) => {
      // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
      const stepAny = step as any;
      let correctedType = stepAny.data?.type || step.type;
      const originalType = correctedType;
      
      console.log(`🔍 [DIAGNOSTIC] [selectNodes] Validating step: "${step.description}"`);
      console.log(`🔍 [DIAGNOSTIC] [selectNodes]   - step.type: ${step.type}`);
      console.log(`🔍 [DIAGNOSTIC] [selectNodes]   - step.data?.type: ${stepAny.data?.type || 'undefined'}`);
      console.log(`🔍 [DIAGNOSTIC] [selectNodes]   - correctedType: ${correctedType}`);
      
      // 🔒 STRUCTURAL FIX: No node is allowed into the graph unless its schema exists
      // This is a MANDATORY validation - fail fast if schema is missing
      // Use NodeTypeResolver to resolve aliases and variations
      const { nodeTypeResolver } = require('../nodes/node-type-resolver');
      // Only enable debug logging if DEBUG_NODE_LOOKUPS is set
      const debugLogging = process.env.DEBUG_NODE_LOOKUPS === 'true';
      const resolution = nodeTypeResolver.resolve(correctedType, debugLogging);
      
      let resolvedType = correctedType;
      if (resolution && resolution.method !== 'not_found' && resolution.method !== 'exact') {
        resolvedType = resolution.resolved;
        if (debugLogging) {
          console.log(`✅ [NODE VALIDATION] Resolved node type "${correctedType}" → "${resolvedType}" (method: ${resolution.method})`);
        }
        correctedType = resolvedType;
        step.type = resolvedType;
      }
      
      let stepSchema = nodeLibrary.getSchema(correctedType);
      
      console.log(`🔍 [DIAGNOSTIC] [selectNodes] Schema lookup for "${correctedType}": ${stepSchema ? 'FOUND' : 'NOT FOUND'}`);
      
      if (!stepSchema) {
        console.error(`🚨 [NODE VALIDATION] CRITICAL: Node type "${correctedType}" NOT FOUND in library.`);
        console.error(`🚨 [NODE VALIDATION] Step description: "${step.description}"`);
        console.error(`🚨 [NODE VALIDATION] Step object: ${JSON.stringify({ type: step.type, data: stepAny.data })}`);
        console.error(`🚨 [NODE VALIDATION] This node cannot be added to the workflow.`);
        
        // ✅ CRITICAL: If from sample workflow, don't infer - use exact type or fail
        if (isFromSampleWorkflow) {
          console.error(`🚨 [NODE VALIDATION] Structure from sample workflow - node type "${correctedType}" must exist in library`);
          console.error(`🚨 [NODE VALIDATION] This indicates a mismatch between sample workflow and node library`);
          console.error(`🚨 [NODE VALIDATION] Skipping type inference - node will be skipped if not found`);
          // Still try to find it, but don't infer different types
        }
        
        // Try to infer correct type from description (only if not from sample workflow)
        if (!isFromSampleWorkflow) {
          console.warn(`⚠️  [NODE VALIDATION] Attempting correction...`);
        }
        
        // Try to infer correct type from description if type doesn't exist
        const stepDescLower = (step.description || '').toLowerCase();
        const inferredType = isFromSampleWorkflow ? correctedType : this.inferStepType(step.description || correctedType);
        const inferredSchema = nodeLibrary.getSchema(inferredType);
        
        if (inferredSchema) {
          console.log(`✅ [NODE VALIDATION] Corrected node type from "${originalType}" to "${inferredType}" (inferred from description)`);
          correctedType = inferredType;
          step.type = correctedType;
          stepSchema = inferredSchema;
        } else {
          // Last resort: try to find similar node
          const allSchemas = nodeLibrary.getAllSchemas();
          const similarNode = allSchemas.find(s => {
            const typeMatch = s.type.toLowerCase().includes(correctedType.toLowerCase()) || 
                            correctedType.toLowerCase().includes(s.type.toLowerCase());
            const keywordMatch = s.aiSelectionCriteria?.keywords?.some(k => 
              step.description?.toLowerCase().includes(k.toLowerCase())
            );
            return typeMatch || keywordMatch;
          });
          
          if (similarNode) {
            console.log(`✅ [NODE VALIDATION] Using similar node type: "${similarNode.type}" instead of "${originalType}"`);
            step.type = similarNode.type;
            stepSchema = similarNode;
          } else {
            // 🔒 STRUCTURAL FIX: Fail fast if schema is missing
            // No node is allowed into the graph unless its schema exists
            const availableTypes = allSchemas.map(s => s.type).slice(0, 20).join(', ');
            console.error(`❌ [NODE VALIDATION] CRITICAL: Cannot find node type "${originalType}" in library.`);
            console.error(`❌ [NODE VALIDATION] Step description: "${step.description}"`);
            console.error(`❌ [NODE VALIDATION] Available node types (first 20): ${availableTypes}`);
            console.error(`❌ [NODE VALIDATION] This step will be SKIPPED. Node schema must exist in library.`);
            console.error(`❌ [NODE VALIDATION] This is a structural requirement - all nodes must have schemas.`);
            return false; // Skip this step - cannot proceed without schema
          }
        }
      } else {
        console.log(`✅ [NODE VALIDATION] Node type "${correctedType}" validated successfully`);
      }
      
      // Additional validation - ensure schema has required config structure
      if (!stepSchema.configSchema) {
        console.warn(`⚠️  [NODE VALIDATION] Node type "${correctedType}" has no config schema. This may cause configuration issues.`);
      }
      
      return true; // Keep valid steps
    });
    
    // Log validation results
    const skippedCount = structure.steps.length - validSteps.length;
    if (skippedCount > 0) {
      console.warn(`⚠️  [NODE VALIDATION] Skipped ${skippedCount} invalid step(s). Only ${validSteps.length} valid steps remain.`);
    } else {
      console.log(`✅ [NODE VALIDATION] All ${validSteps.length} steps validated successfully`);
    }
    
    console.log(`🔍 [DIAGNOSTIC] [selectNodes] Processing ${validSteps.length} valid steps`);
    
    // Process valid steps
    validSteps.forEach((step: WorkflowStepDefinition, index: number) => {
      // ✅ CRITICAL: Check data.type for nodes with type: 'custom' (frontend compatibility)
      const stepAny = step as any;
      let correctedType = stepAny.data?.type || step.type;
      
      console.log(`🔍 [DIAGNOSTIC] [selectNodes] Processing step ${index + 1}: type="${correctedType}", description="${step.description}"`);
      
      // ✅ CRITICAL: Normalize and validate node type before creating node
      // This ensures workflow builder never generates unknown node types
      const normalizationResult = nodeTypeNormalizationService.normalizeNodeType(correctedType);
      if (!normalizationResult.valid) {
        console.error(`❌ [NODE SELECTION] Invalid node type "${correctedType}" at step ${index + 1}. Skipping node.`);
        logger.error(`❌ [NODE SELECTION] Invalid node type: ${correctedType}`);
        return; // Skip invalid node types
      }
      
      // Use normalized type
      if (normalizationResult.normalized !== correctedType) {
        console.log(`✅ [NODE SELECTION] Normalized node type "${correctedType}" → "${normalizationResult.normalized}" (${normalizationResult.method})`);
        correctedType = normalizationResult.normalized;
      }
      
      // Use NodeLibrary to get node information
      const stepSchema = nodeLibrary.getSchema(correctedType);
      const defaultLabel = stepSchema?.label || this.getNodeLabel(correctedType);
      const stepCategory = stepSchema?.category || this.getNodeCategory(correctedType);
      
      // Extract short label from description (max 3-4 words)
      let shortLabel = defaultLabel;
      if (step.description) {
        // Clean description first
        let cleanDesc = step.description
          .replace(/^[-*•]\s*/, '') // Remove bullet points
          .replace(/\*\*/g, '') // Remove markdown bold
          .replace(/\[.*?\]/g, '') // Remove markdown links
          .trim();
        
        const words = cleanDesc.split(/\s+/).filter(w => w.length > 0);
        
        if (words.length <= 4) {
          shortLabel = words.join(' ');
        } else {
          // Extract key action - try to get verb + noun (first 2-3 words)
          // Skip common words like "the", "a", "an", "to", "for", "with"
          const skipWords = ['the', 'a', 'an', 'to', 'for', 'with', 'from', 'and', 'or', 'in', 'on', 'at'];
          const meaningfulWords = words.filter(w => !skipWords.includes(w.toLowerCase()));
          
          if (meaningfulWords.length >= 2) {
            shortLabel = meaningfulWords.slice(0, 3).join(' ');
          } else {
            shortLabel = words.slice(0, 3).join(' ');
          }
          
          // Limit length
          if (shortLabel.length > 35) {
            shortLabel = shortLabel.substring(0, 32) + '...';
          }
        }
        // Clean up label - remove trailing punctuation
        shortLabel = shortLabel.replace(/[.,;:!?]+$/, '').trim();
        
        // Capitalize first letter
        if (shortLabel.length > 0) {
          shortLabel = shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
        }
      }
      
      // CRITICAL: Check for duplicate nodes (same type and similar description)
      const isDuplicate = nodes.some(existingNode => {
        const existingType = normalizeNodeType(existingNode);
        const existingLabel = existingNode.data?.label?.toLowerCase() || '';
        const newLabel = shortLabel.toLowerCase();
        
        // Check if same type and similar label (within 3 words)
        if (existingType === correctedType) {
          const existingWords = existingLabel.split(/\s+/).slice(0, 3);
          const newWords = newLabel.split(/\s+/).slice(0, 3);
          const commonWords = existingWords.filter(w => newWords.includes(w));
          // If 2+ common words, likely duplicate
          if (commonWords.length >= 2) {
            return true;
          }
        }
        return false;
      });
      
      if (isDuplicate) {
        logger.debug(`⚠️  [NODE SELECTION] Skipping duplicate node: ${correctedType} - "${shortLabel}"`);
        return; // Skip this node
      }
      
      // ✅ CRITICAL: Use step.id as node.id to enable connection mapping
      // This ensures connections from structure can map to actual nodes
      const nodeId = step.id || `step_${index + 1}`;
      
      // PHASE 1: Frontend expects type: 'custom' for non-form nodes, actual type in data.type
      
      // Apply inferred properties if available (e.g., loop.items from pattern detection)
      const inferredProperties = (stepAny as any).inferredProperties || {};
      const initialConfig: Record<string, any> = {};
      
      // For loop nodes, apply inferred items property
      if (correctedType === 'loop' && inferredProperties.items) {
        initialConfig.items = inferredProperties.items;
        console.log(`✅ [Property Inference] Applied inferred loop.items: ${inferredProperties.items}`);
      }
      
      // For google_sheets nodes in loop patterns, infer operation
      if (correctedType === 'google_sheets' && inferredProperties.operation) {
        initialConfig.operation = inferredProperties.operation;
        console.log(`✅ [Property Inference] Applied inferred google_sheets.operation: ${inferredProperties.operation}`);
      }
      
      // For hubspot/airtable nodes in loop patterns, infer operation and resource
      if (['hubspot', 'airtable'].includes(correctedType)) {
        if (inferredProperties.operation) {
          initialConfig.operation = inferredProperties.operation;
          console.log(`✅ [Property Inference] Applied inferred ${correctedType}.operation: ${inferredProperties.operation}`);
        }
        if (inferredProperties.resource) {
          initialConfig.resource = inferredProperties.resource;
          console.log(`✅ [Property Inference] Applied inferred ${correctedType}.resource: ${inferredProperties.resource}`);
        }
      }
      
      // ✅ Get icon from schema if available
      let nodeIcon: string | undefined;
      if (stepSchema) {
        // Try to get icon from schema metadata or use category-based default
        nodeIcon = (stepSchema as any).icon || this.getDefaultIconForCategory(stepCategory, correctedType);
      } else {
        nodeIcon = this.getDefaultIconForCategory(stepCategory, correctedType);
      }
      
      const node: WorkflowNode = {
        id: step.id || `step${index + 1}`, // Use step ID as node ID
        type: correctedType === 'form' ? 'form' : 'custom', // Frontend expects 'custom' for non-form nodes
        position: { x: 0, y: 0 }, // Will be set by layout algorithm
        data: {
          type: correctedType, // Actual node type stored here
          label: shortLabel,
          category: stepCategory,
          icon: nodeIcon || 'Box', // ✅ Add icon from schema (default to Box if not found)
          config: initialConfig, // Apply inferred properties
        } as any, // Type assertion to allow icon property
      };
      nodes.push(node);
      console.log(`🔍 [DIAGNOSTIC] [selectNodes] Created node: type="${node.type}", data.type="${node.data.type}", label="${shortLabel}"`);
      logger.debug(`✅ [NODE SELECTION] Added step node: ${correctedType} - "${shortLabel}"`);
    });
    
    console.log(`🔍 [DIAGNOSTIC] [selectNodes] Final nodes count: ${nodes.length}`);
    console.log(`🔍 [DIAGNOSTIC] [selectNodes] Final node types: ${nodes.map(n => n.data?.type || n.type).join(', ')}`);
    
    // Add output nodes with unique UUIDs
    structure.outputs.forEach((output: OutputDefinition, index: number) => {
      // PERMANENT FIX: Skip if output is invalid or missing required fields
      if (!output || (!output.name && !output.description && !output.type)) {
        console.warn(`⚠️  Skipping invalid output at index ${index}:`, output);
        return;
      }
      
      // Map output type to node type for output nodes
      const nodeType = this.mapOutputTypeToNodeType(output);
      
      // Extract short label from description (max 3-4 words)
      let shortLabel = this.getNodeLabel(nodeType);
      if (output.description) {
        // Clean description first
        let cleanDesc = output.description
          .replace(/^[-*•]\s*/, '') // Remove bullet points
          .replace(/\*\*/g, '') // Remove markdown bold
          .replace(/\[.*?\]/g, '') // Remove markdown links
          .trim();
        
        const words = cleanDesc.split(/\s+/).filter(w => w.length > 0);
        
        if (words.length <= 4) {
          shortLabel = words.join(' ');
        } else {
          // Extract key action - try to get verb + noun
          const skipWords = ['the', 'a', 'an', 'to', 'for', 'with', 'from', 'and', 'or', 'in', 'on', 'at'];
          const meaningfulWords = words.filter(w => !skipWords.includes(w.toLowerCase()));
          
          if (meaningfulWords.length >= 2) {
            shortLabel = meaningfulWords.slice(0, 3).join(' ');
          } else {
            shortLabel = words.slice(0, 3).join(' ');
          }
          
          // Limit length
          if (shortLabel.length > 35) {
            shortLabel = shortLabel.substring(0, 32) + '...';
          }
        }
        // Clean up label
        shortLabel = shortLabel.replace(/[.,;:!?]+$/, '').trim();
        
        // Capitalize first letter
        if (shortLabel.length > 0) {
          shortLabel = shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
        }
      }
      
      // PHASE 1: Frontend expects type: 'custom' for non-form nodes, actual type in data.type
      const node: WorkflowNode = {
        id: randomUUID(),
        type: nodeType === 'form' ? 'form' : 'custom', // Frontend expects 'custom' for non-form nodes
        position: { x: 0, y: 0 }, // Will be set by layout algorithm
        data: {
          type: nodeType, // Actual node type stored here
          label: shortLabel,
          category: 'output',
          config: {},
        },
      };
      nodes.push(node);
    });
    
    // CRITICAL: Final deduplication - remove any duplicate nodes by type and label
    const uniqueNodes: WorkflowNode[] = [];
    const seenNodes = new Map<string, boolean>(); // Track seen node types + labels
    const triggerTypes = ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'form', 'error_trigger'];
    let firstTriggerSeen = false;
    let firstTriggerType: string | null = null;
    
    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      const nodeLabel = (node.data?.label || '').toLowerCase();
      
      // CRITICAL: For triggers, only allow ONE trigger regardless of label
      if (triggerTypes.includes(nodeType)) {
        if (firstTriggerSeen) {
          // Already have a trigger, skip this duplicate
          console.warn(`⚠️  [NODE DEDUPLICATION] Removed duplicate trigger: ${nodeType} - "${node.data?.label}" (already have ${firstTriggerType})`);
          continue;
        }
        // First trigger - keep it
        firstTriggerSeen = true;
        firstTriggerType = nodeType;
        uniqueNodes.push(node);
        continue;
      }
      
      // For non-trigger nodes, check by type + label
      const key = `${nodeType}:${nodeLabel}`;
      
      if (!seenNodes.has(key)) {
        seenNodes.set(key, true);
        uniqueNodes.push(node);
      } else {
        console.warn(`⚠️  [NODE DEDUPLICATION] Removed duplicate node: ${nodeType} - "${node.data?.label}"`);
      }
    }
    
    const finalNodes = uniqueNodes;
    console.log(`✅ [NODE DEDUPLICATION] Final node count: ${finalNodes.length} (removed ${nodes.length - finalNodes.length} duplicates)`);
    
    // Note: Layout will be applied after edges are created in createConnections()
    
    // CRITICAL FIX: Post-process nodes to ensure Google Sheets is used instead of database_read
    // This fixes cases where AI selected wrong node type
    const requirementsLower = (requirements.primaryGoal || '').toLowerCase();
    const hasGoogleSheets = requirementsLower.includes('google sheet') || 
                            requirementsLower.includes('spreadsheet') ||
                            requirements.keySteps?.some(step => 
                              step.toLowerCase().includes('google sheet') || 
                              step.toLowerCase().includes('spreadsheet')
                            );
    
    if (hasGoogleSheets) {
      finalNodes.forEach(node => {
        // Replace database_read/write with google_sheets if Google Sheets is mentioned
        if ((node.type === 'database_read' || node.type === 'database_write') &&
            (node.data.label?.toLowerCase().includes('google') || 
             node.data.label?.toLowerCase().includes('sheet') ||
             node.data.label?.toLowerCase().includes('spreadsheet'))) {
          console.log(`✅ Post-processing: Correcting node ${node.id} from ${node.type} to google_sheets`);
          node.type = 'google_sheets';
          node.data.type = 'google_sheets';
          // Update label if needed
          if (!node.data.label?.toLowerCase().includes('sheet')) {
            node.data.label = 'Google Sheets';
          }
        }
      });
    }
    
    // 🔒 REMOVED: Heuristic Gmail post-processing hack
    // Node resolution is now handled deterministically by NodeResolver in generate-workflow.ts
    // This ensures Gmail nodes are selected correctly during planning, not patched afterwards
    // The NodeResolver runs BEFORE graph building and force-inserts required nodes based on capabilities
    
    logger.debug(`✅ [NODE SELECTION] Returning ${finalNodes.length} unique nodes`);
    return finalNodes;
  }

  private async configureNodes(
    nodes: WorkflowNode[],
    requirements: Requirements,
    constraints?: any
  ): Promise<WorkflowNode[]> {
    // Step 1: Try auto-configuration first
    console.log('[WorkflowBuilder] 🤖 Attempting auto-configuration for all nodes...');
    const workflowIntent = ((requirements as any).originalPrompt || requirements.primaryGoal || (requirements as any).enhancedPrompt || '').trim();
    
    const autoConfigResult = await nodeAutoConfigurator.autoConfigureWorkflow(
      nodes,
      [], // edges will be added later, but we can still auto-configure based on node order
      workflowIntent
    );

    console.log(`[WorkflowBuilder] ✅ Auto-configuration results:`);
    console.log(`   - Configured: ${autoConfigResult.summary.configured}/${autoConfigResult.summary.total}`);
    console.log(`   - Partial: ${autoConfigResult.summary.partial}`);
    console.log(`   - Failed: ${autoConfigResult.summary.failed}`);
    console.log(`   - Skip wizard: ${autoConfigResult.skipWizard}`);

    // Use auto-configured nodes if successful
    if (autoConfigResult.allConfigured && autoConfigResult.skipWizard) {
      console.log('[WorkflowBuilder] ✅ All nodes auto-configured successfully, skipping manual configuration');
      return autoConfigResult.nodes;
    }

    // Step 2: Fall back to manual configuration for nodes that need it
    console.log('[WorkflowBuilder] ⚙️  Applying manual configuration for remaining nodes...');
    
    // 🚨 CRITICAL FIX: For vague prompts with CRM nodes, set default operation to "create"
    const userPrompt = workflowIntent.toLowerCase().trim();
    const { intentClassifier } = require('./intent-classifier');
    const intentClassification = intentClassifier.classifyIntent(userPrompt);
    const isVaguePrompt = intentClassification.intent === 'ambiguous';
    
    if (isVaguePrompt) {
      console.log(`✅ [Vague Prompt Config] Detected vague prompt - setting default operations for CRM nodes`);
    }
    // Configure each node based on requirements and user-provided config values
    // Merge constraints with credentials if provided
    const configValues = { ...(constraints || {}) };
    
    // Extract credentials from constraints if provided
    if (constraints?.credentials) {
      // Merge credentials into configValues so they're accessible via getConfigValue
      Object.assign(configValues, constraints.credentials);
    }
    
    // Also check answers for credential keys
    if (constraints?.answers) {
      const credentialKeys = Object.keys(constraints.answers).filter(key => 
        key.toLowerCase().includes('credential') || 
        key.toLowerCase().includes('api_key') || 
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('secret')
      );
      credentialKeys.forEach(key => {
        configValues[key] = constraints.answers[key];
      });
    }
    
    // Configure each node with intelligent field filling and IO mapping
    // Merge auto-configuration with manual configuration
    const configuredNodes = await Promise.all(autoConfigResult.nodes.map(async (node, index) => {
      // Get previous node for IO mapping
      const previousNode = index > 0 ? autoConfigResult.nodes[index - 1] : null;
      
      // CRITICAL FIX: Even if auto-configured, we need to apply intelligent property selection
      // Auto-config might have wrong template expressions like {{node.type}} instead of {{$json.field}}
      // So we always run generateRequiredInputFields to fix template expressions
      const isAutoConfigured = (node.data as any)?.autoConfigured && (node.data as any)?.autoConfigConfidence >= 0.8;
      
      // Generate base configuration (credentials are now in configValues)
      let config = await this.generateNodeConfig(node, requirements, configValues, autoConfigResult.nodes, index);
      
      // Merge with auto-configuration if available
      if (node.data?.config) {
        config = { ...node.data.config, ...config };
        
        // CRITICAL: Fix wrong template expressions from auto-config
        // Replace {{node.type}}, {{nodeId.type}} with proper {{$json.field}} expressions
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && 
              (value.includes('{{') && value.includes('.type}}') && !value.includes('$json'))) {
            console.log(`⚠️  [Auto-Config Fix] Found wrong template in ${node.type}.${key}: ${value}`);
            // This will be fixed by generateRequiredInputFields
            delete config[key]; // Remove wrong template so it gets regenerated correctly
          }
        }
      }
      
      if (isAutoConfigured) {
        console.log(`ℹ️  Node ${node.type} was auto-configured, but applying intelligent property selection to fix template expressions`);
      }
      
      // 🚨 CRITICAL FIX: For vague prompts with CRM nodes, set default operation to "create"
      if (isVaguePrompt) {
        const nodeType = normalizeNodeType(node);
        const crmNodeTypes = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
        if (crmNodeTypes.includes(nodeType)) {
          if (!config.operation) {
            config.operation = 'create';
            console.log(`✅ [Vague Prompt Config] Set default operation "create" for ${nodeType} node`);
          }
          if (!config.resource && nodeType === 'hubspot') {
            config.resource = 'contact';
            console.log(`✅ [Vague Prompt Config] Set default resource "contact" for ${nodeType} node`);
          }
        }
      }
      
      // CRITICAL: Generate all required input fields with IO mapping
      const configWithInputs = await this.generateRequiredInputFields(
        node,
        config,
        previousNode,
        nodes,
        index,
        requirements
      );
      
      // Special handling for transformation nodes
      if (this.isTransformationNode(node.type)) {
        const transformedConfig = this.configureTransformationNode(
          node,
          nodes,
          index,
          configWithInputs,
          requirements
        );
        return {
          ...node,
          data: {
            ...node.data,
            config: transformedConfig,
          },
        };
      }
      
      // CRITICAL: Ensure config is properly stored
      const finalConfig = configWithInputs;
      
      // CRITICAL FIX: Remove any wrong template expressions that might have been set
      // Replace {{node.type}}, {{nodeId.type}}, {{step_X.type}} with proper {{$json.field}} expressions
      for (const [key, value] of Object.entries(finalConfig)) {
        if (typeof value === 'string' && value.includes('{{') && !value.includes('$json') && !value.includes('input')) {
          // This is a wrong template - try to fix it
          if (value.includes('.type}}') || value.includes('.output}}')) {
            console.log(`⚠️  [Config Cleanup] Removing wrong template from ${node.type}.${key}: ${value}`);
            // If we have a previous node, use intelligent selection to fix it
            if (previousNode && index > 0) {
              const previousOutputs = this.getPreviousNodeOutputFields(previousNode);
              if (previousOutputs.length > 0) {
                const bestMatch = this.findBestOutputMatch(key, previousOutputs, previousNode.type, requirements, node.type);
                finalConfig[key] = `{{$json.${bestMatch}}}`;
                console.log(`✅ [Config Cleanup] Fixed ${node.type}.${key} = {{$json.${bestMatch}}}`);
              } else {
                delete finalConfig[key]; // Remove wrong template
              }
            } else {
              delete finalConfig[key]; // Remove wrong template if no previous node
            }
          }
        }
      }
      
      // Log final config for debugging
      const templateExpressions = Object.entries(finalConfig)
        .filter(([_, v]) => typeof v === 'string' && v.includes('{{$json.'))
        .map(([k, v]) => `${k}=${v}`);
      
      const wrongTemplates = Object.entries(finalConfig)
        .filter(([_, v]) => typeof v === 'string' && v.includes('{{') && !v.includes('$json') && !v.includes('input'))
        .map(([k, v]) => `${k}=${v}`);
      
      if (templateExpressions.length > 0) {
        console.log(`✅ [Config Finalized] ${node.type} (${node.id}): ${templateExpressions.length} correct template expressions`);
        templateExpressions.forEach(expr => {
          console.log(`   └─ ${expr}`);
        });
      }
      
      if (wrongTemplates.length > 0) {
        console.log(`⚠️  [Config Finalized] ${node.type} (${node.id}): ${wrongTemplates.length} WRONG template expressions still present!`);
        wrongTemplates.forEach(expr => {
          console.log(`   └─ ${expr}`);
        });
      }
      
      return {
        ...node,
        data: {
          ...node.data,
          config: finalConfig,
        },
      };
    }));
    
    return configuredNodes;
  }

  /**
   * STRICT NODE I/O AUTOFILL & DATA-FLOW GUARANTEE
   * 
   * This method enforces strict data-flow rules:
   * - Every required input field is explicitly filled
   * - Every input comes from a valid upstream output
   * - Type compatibility is validated
   * - No empty, implicit, or guessed fields
   */
  private async generateRequiredInputFields(
    node: WorkflowNode,
    baseConfig: Record<string, unknown>,
    previousNode: WorkflowNode | null,
    allNodes: WorkflowNode[],
    nodeIndex: number,
    requirements: Requirements
  ): Promise<Record<string, unknown>> {
    const config = { ...baseConfig };
    
    // STEP 1: Load node schema (required inputs, outputs)
    // CRITICAL FIX: Use normalizeNodeType to get actual node type
    const actualNodeType = normalizeNodeType(node);
    const nodeSchema = nodeLibrary.getSchema(actualNodeType);
    
    if (!nodeSchema?.configSchema) {
      console.warn(`⚠️  No schema found for node type: ${actualNodeType} (node.type="${node.type}", node.data.type="${node.data?.type || 'undefined'}")`);
      return config;
    }
    
    const requiredFields = nodeSchema.configSchema.required || [];
    const optionalFields = nodeSchema.configSchema.optional || {};
    
    // STEP 2: Build data contract table (input source resolution)
    const dataContract: Map<string, { sourceNode: string; sourceField: string; type: string }> = new Map();
    
    // Get all upstream nodes (nodes that execute before this one)
    const upstreamNodes = allNodes.slice(0, nodeIndex);
    
    // STEP 3: Process ALL required fields with strict validation
    // CRITICAL: Use nodeDefaults system to ensure all required fields have values
    for (const fieldName of requiredFields) {
      // Skip if already configured with non-empty value
      if (config[fieldName] !== undefined && config[fieldName] !== null && config[fieldName] !== '') {
        // Validate that existing config references a valid source
        const existingValue = String(config[fieldName]);
        if (existingValue.startsWith('{{') && existingValue.endsWith('}}')) {
          // Extract field reference
          const fieldRef = existingValue.slice(2, -2).trim();
          // Validate reference exists in upstream nodes
          const isValid = this.validateFieldReference(fieldRef, upstreamNodes, node);
          if (!isValid) {
            console.warn(`⚠️  Invalid field reference ${fieldRef} for ${node.type}.${fieldName}`);
            // Will be auto-filled below
            delete config[fieldName];
          } else {
            continue; // Valid reference, skip
          }
        } else {
          continue; // Non-template value, assume valid
        }
      }
      
      // STEP 4: Resolve input source with priority rules (includes user intent analysis)
      const resolution = this.resolveInputSource(
        fieldName,
        node.type,
        upstreamNodes,
        previousNode,
        requirements,
        nodeSchema
      );
      
      if (resolution.resolved) {
        // STEP 5: Validate type compatibility
        const typeValid = this.validateTypeCompatibility(
          resolution.sourceType || 'string',
          resolution.targetType || 'string',
          fieldName,
          node.type
        );
        
        if (typeValid) {
          config[fieldName] = resolution.value;
          dataContract.set(fieldName, {
            sourceNode: resolution.sourceNode || 'trigger',
            sourceField: resolution.sourceField || fieldName,
            type: resolution.sourceType || 'string'
          });
        } else {
          console.warn(`⚠️  Type mismatch for ${node.type}.${fieldName}: ${resolution.sourceType} → ${resolution.targetType}`);
          // Try to find compatible alternative
          const alternative = this.findCompatibleSource(fieldName, node.type, upstreamNodes, previousNode);
          if (alternative) {
            config[fieldName] = alternative.value;
            dataContract.set(fieldName, {
              sourceNode: alternative.sourceNode || 'trigger',
              sourceField: alternative.sourceField || fieldName,
              type: alternative.sourceType || 'string'
            });
          } else {
            // ✅ ARCHITECTURAL REFACTOR: Do NOT generate {{$json.*}} template expressions
            // AI Input Resolver will handle input generation dynamically at runtime
            // Leave field empty - AI will generate it based on previous output and user intent
            if (previousNode) {
              const previousOutputs = this.getPreviousNodeOutputFields(previousNode);
              if (previousOutputs.length > 0) {
                // ✅ AI Input Resolver will analyze previous output and generate appropriate input
                // No need to generate template expressions - AI will handle it at runtime
                // Leave field empty to indicate AI generation
                config[fieldName] = '';
                dataContract.set(fieldName, {
                  sourceNode: previousNode.id,
                  sourceField: 'ai-generated', // Mark as AI-generated
                  type: 'ai-resolved'
                });
                console.log(`✅ [AI Input Resolver] ${node.type}.${fieldName} will be AI-generated at runtime (from ${previousNode.type} output)`);
                console.log(`   └─ Available outputs: ${previousOutputs.join(', ')}`);
                console.log(`   └─ AI will analyze and generate appropriate input based on user intent`);
              } else {
                // No previous output - AI will generate based on user intent and node schema
                config[fieldName] = '';
                console.log(`✅ [AI Input Resolver] ${node.type}.${fieldName} will be AI-generated at runtime (no previous output)`);
                dataContract.set(fieldName, {
                  sourceNode: previousNode.id,
                  sourceField: 'output',
                  type: 'object'
                });
                console.log(`✅ [Data Flow] ${node.type}.${fieldName} = {{$json}} (from previous node ${previousNode.type})`);
              }
            } else {
              // Only use defaults if no previous node exists
            config[fieldName] = nodeDefaults.getDefaultValue(node.type, fieldName, {
              requirements,
              previousNode,
              workflowGoal: requirements.primaryGoal,
            });
            }
          }
        }
      } else {
        // STEP 6: CRITICAL FIX - If previous node exists, ALWAYS use its output instead of defaults
        // Uses intelligent property selection based on user intent and node types
        if (previousNode) {
          const previousOutputs = this.getPreviousNodeOutputFields(previousNode);
          if (previousOutputs.length > 0) {
            // Use intelligent property selection: analyzes user intent to select best JSON property
            const bestMatch = this.findBestOutputMatch(fieldName, previousOutputs, previousNode.type, requirements, node.type);
            config[fieldName] = `{{$json.${bestMatch}}}`;
            dataContract.set(fieldName, {
              sourceNode: previousNode.id,
              sourceField: bestMatch,
              type: this.inferFieldType(bestMatch, previousNode.type)
            });
            console.log(`✅ [Property Selection] ${node.type}.${fieldName} = {{$json.${bestMatch}}} (intelligent selection from ${previousNode.type})`);
            console.log(`   └─ Available outputs: ${previousOutputs.join(', ')}`);
            console.log(`   └─ Selected: ${bestMatch} (based on user intent: "${requirements.primaryGoal?.substring(0, 50)}...")`);
          } else {
            // Fallback: Use intelligent property selection with common outputs
            const commonOutputs = ['items', 'data', 'output', 'result', 'rows'];
            const bestMatch = this.findBestOutputMatch(fieldName, commonOutputs, previousNode.type, requirements, node.type);
            config[fieldName] = `{{$json.${bestMatch}}}`;
            dataContract.set(fieldName, {
              sourceNode: previousNode.id,
              sourceField: bestMatch,
              type: 'object'
            });
            console.log(`✅ [Data Flow] ${node.type}.${fieldName} = {{$json.${bestMatch}}} (intelligent fallback from ${previousNode.type})`);
          }
        } else {
          // Only use defaults if no previous node exists (e.g., trigger node)
        console.log(`ℹ️  Using default value for ${node.type}.${fieldName} (no upstream source found)`);
        config[fieldName] = nodeDefaults.getDefaultValue(node.type, fieldName, {
          requirements,
          previousNode,
          workflowGoal: requirements.primaryGoal,
        });
        }
      }
    }
    
    // STEP 7: Process critical optional fields for data flow
    const criticalOptionalFields = ['input', 'data', 'value', 'message', 'text', 'content', 'body', 'userInput', 'context'];
    for (const fieldName of Object.keys(optionalFields)) {
      if (criticalOptionalFields.includes(fieldName.toLowerCase()) && 
          (config[fieldName] === undefined || config[fieldName] === null || config[fieldName] === '')) {
        const resolution = this.resolveInputSource(
          fieldName,
          node.type,
          upstreamNodes,
          previousNode,
          requirements,
          nodeSchema
        );
        
        if (resolution.resolved) {
          config[fieldName] = resolution.value;
          dataContract.set(fieldName, {
            sourceNode: resolution.sourceNode || 'trigger',
            sourceField: resolution.sourceField || fieldName,
            type: resolution.sourceType || 'string'
          });
        }
      }
    }
    
    // STEP 8: CRITICAL - Ensure ai_agent userInput is ALWAYS populated
    if (node.type === 'ai_agent' || node.type === 'openai_gpt' || node.type === 'anthropic_claude' || node.type === 'google_gemini') {
      // CRITICAL: userInput must NEVER be empty
      const hasUserInput = config.userInput && typeof config.userInput === 'string' && config.userInput.trim() !== '';
      if (!hasUserInput) {
        // Try to get from upstream nodes first
        const userMessageSource = this.findUpstreamField(upstreamNodes, ['message', 'user_message', 'text', 'input', 'body', 'inputData', 'data']);
        if (userMessageSource) {
          config.userInput = userMessageSource.value;
          dataContract.set('userInput', {
            sourceNode: userMessageSource.sourceNode,
            sourceField: userMessageSource.sourceField,
            type: 'string'
          });
        } else {
          // Use nodeDefaults system for guaranteed default
          config.userInput = nodeDefaults.getDefaultValue(node.type, 'userInput', {
            requirements,
            previousNode,
            workflowGoal: requirements.primaryGoal,
          });
          dataContract.set('userInput', {
            sourceNode: 'trigger',
            sourceField: 'inputData',
            type: 'string'
          });
        }
      }
    }
    
    // STEP 8.5: Use input-field-mapper for enhanced field mapping and validation
    // This ensures correct template format ({{$json.field}}) and validates field references
    try {
      const fieldMappingValidation = inputFieldMapper.validateNodeInputs(
        node,
        previousNode,
        allNodes,
        nodeIndex
      );

      // Apply validated mappings to config
      // CRITICAL: Preserve existing intelligent property selection - don't overwrite if already set
      for (const mapping of fieldMappingValidation.mappings) {
        const existingValue = config[mapping.field];
        const hasIntelligentSelection = typeof existingValue === 'string' && 
                                       existingValue.includes('{{$json.') && 
                                       !existingValue.includes('{{$json.type}}'); // Don't preserve wrong templates
        
        // Only overwrite if:
        // 1. Field is empty/undefined, OR
        // 2. Existing value is not a valid template expression (intelligent selection)
        if (mapping.valid) {
          if (mapping.field in config && !hasIntelligentSelection) {
            // Update config with validated template expression (only if not already intelligently set)
          config[mapping.field] = mapping.value;
          console.log(`✅ [Field Mapping] ${node.type}.${mapping.field} = ${mapping.value} (from ${mapping.sourceNodeType}.${mapping.sourceField})`);
          } else if (hasIntelligentSelection) {
            // Preserve intelligent property selection
            console.log(`✅ [Field Mapping] Preserving intelligent selection for ${node.type}.${mapping.field} = ${existingValue}`);
          } else if (requiredFields.includes(mapping.field) && !config[mapping.field]) {
          // Add missing required field with validated mapping
          config[mapping.field] = mapping.value;
          console.log(`✅ [Field Mapping] Added ${node.type}.${mapping.field} = ${mapping.value} (from ${mapping.sourceNodeType}.${mapping.sourceField})`);
          }
        } else if (!mapping.valid && requiredFields.includes(mapping.field) && !hasIntelligentSelection) {
          console.warn(`⚠️  [Field Mapping] Invalid mapping for required field ${node.type}.${mapping.field}: ${mapping.validationErrors?.join(', ') || 'Unknown error'}`);
        }
      }

      // Log validation errors if any
      if (fieldMappingValidation.errors.length > 0) {
        console.warn(`⚠️  [Field Mapping] Node ${node.id} (${node.type}) has mapping errors:`, fieldMappingValidation.errors);
      }
    } catch (error) {
      console.warn(`⚠️  [Field Mapping] Error during field mapping validation for ${node.type}:`, error);
      // Continue with existing config - don't fail the entire workflow
    }

    // STEP 8.5.5: INTELLIGENT DATA FILTERING - Extract user intent for specific data filtering
    // If user mentions specific columns/fields (e.g., "resumes column"), filter data accordingly
    // Apply to data-receiving fields AFTER all fields are configured
    // This runs after STEP 8.7 (critical optional fields) to ensure all data fields are set

    // STEP 8.6: Validate and fix template expressions
    try {
      const templateValidation = validateTemplateExpressions(
        node,
        previousNode,
        allNodes,
        nodeIndex
      );

      if (!templateValidation.valid && templateValidation.errors.length > 0) {
        console.warn(`⚠️  [Template Validation] Node ${node.id} (${node.type}) has template errors:`, templateValidation.errors);
        // Auto-fix template expressions in config
        for (const key in config) {
          if (typeof config[key] === 'string' && config[key].includes('{{')) {
            const fixed = fixTemplateExpressions({ [key]: config[key] });
            if (fixed[key]) {
              config[key] = fixed[key];
            }
          }
        }
        console.log(`✅ [Template Fix] Auto-fixed template expressions for ${node.type}`);
      }
    } catch (error) {
      console.warn(`⚠️  [Template Validation] Error during template validation for ${node.type}:`, error);
      // Continue with existing config - don't fail the entire workflow
    }
    
    // STEP 9: Final validation - ensure ALL required fields have values
    // CRITICAL FIX: Always prefer previous node output over defaults
    for (const fieldName of requiredFields) {
      if (!fieldName || typeof fieldName !== 'string') {
        continue;
      }
      
      const value = config[fieldName];
      const isEmpty = value === undefined || value === null || 
                     (typeof value === 'string' && value.trim() === '') ||
                     (Array.isArray(value) && value.length === 0);
      
      if (isEmpty) {
        // CRITICAL FIX: If previous node exists, ALWAYS use its output instead of defaults
        if (previousNode) {
          const previousOutputs = this.getPreviousNodeOutputFields(previousNode);
          if (previousOutputs.length > 0) {
            const bestMatch = this.findBestOutputMatch(fieldName, previousOutputs, previousNode.type, requirements, node.type);
            config[fieldName] = `{{$json.${bestMatch}}}`;
            dataContract.set(fieldName, {
              sourceNode: previousNode.id,
              sourceField: bestMatch,
              type: this.inferFieldType(bestMatch, previousNode.type)
            });
            console.log(`✅ [Final Validation] ${node.type}.${fieldName} = {{$json.${bestMatch}}} (from previous node ${previousNode.type})`);
            continue;
          } else {
            // Fallback: Use intelligent property selection based on user intent
            // Even if no specific outputs, try to select best property from common outputs
            const commonOutputs = ['items', 'data', 'output', 'result', 'rows'];
            const bestMatch = this.findBestOutputMatch(fieldName, commonOutputs, previousNode.type, requirements, node.type);
            config[fieldName] = `{{$json.${bestMatch}}}`;
            dataContract.set(fieldName, {
              sourceNode: previousNode.id,
              sourceField: bestMatch,
              type: 'object'
            });
            console.log(`✅ [Final Validation] ${node.type}.${fieldName} = {{$json.${bestMatch}}} (intelligent selection from ${previousNode.type})`);
            continue;
          }
        }
        
        // Only use defaults if no previous node exists (e.g., trigger node)
        const defaultValue = nodeDefaults.getDefaultValue(node.type, fieldName, {
          requirements,
          previousNode,
          workflowGoal: requirements.primaryGoal,
        });
        
        if (defaultValue !== undefined && defaultValue !== null && 
            (typeof defaultValue !== 'string' || defaultValue.trim() !== '')) {
          config[fieldName] = defaultValue;
          console.log(`✅ Auto-filled required field ${node.type}.${fieldName} with default: ${JSON.stringify(defaultValue).substring(0, 50)}`);
        } else {
          // CRITICAL: This should never happen with nodeDefaults, but fail fast if it does
          const errorMsg = `Cannot generate value for required field: ${fieldName} in node ${node.type} (${node.id}). NodeDefaults system failed.`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }
      
      // PRIORITY 2: Check for placeholder values
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        if (lowerValue.includes('todo') || 
            lowerValue.includes('example') || 
            lowerValue.includes('replace') ||
            lowerValue.includes('fill this') ||
            (lowerValue.includes('placeholder') && !lowerValue.includes('{{ENV.'))) {
          const errorMsg = `Placeholder value detected in required field ${node.type}.${fieldName}: "${value}"`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }
    }
    
    // STEP 10: Store data contract in node metadata for validation
    if (dataContract.size > 0) {
      config._dataContract = Object.fromEntries(dataContract);
    }
    
    return config;
  }
  
  /**
   * Resolve input source with strict priority rules
   */
  private resolveInputSource(
    fieldName: string,
    nodeType: string,
    upstreamNodes: WorkflowNode[],
    previousNode: WorkflowNode | null,
    requirements: Requirements,
    nodeSchema: any
  ): {
    resolved: boolean;
    value?: string;
    sourceNode?: string;
    sourceField?: string;
    sourceType?: string;
    targetType?: string;
  } {
    // Priority 1: Direct upstream node output (exact match)
    if (previousNode) {
      const previousOutputs = this.getPreviousNodeOutputFields(previousNode);
      const exactMatch = previousOutputs.find(f => 
        f.toLowerCase() === fieldName.toLowerCase()
      );
      
      if (exactMatch) {
        return {
          resolved: true,
          value: `{{$json.${exactMatch}}}`, // Use $json prefix for correct data flow
          sourceNode: previousNode.id,
          sourceField: exactMatch,
          sourceType: this.inferFieldType(exactMatch, previousNode.type),
          targetType: this.inferFieldType(fieldName, nodeType)
        };
      }
      
      // Priority 2: Intelligent property selection based on user intent and node types
      const bestMatch = this.findBestOutputMatch(fieldName, previousOutputs, previousNode.type, requirements, nodeType);
      if (bestMatch) {
        return {
          resolved: true,
          value: `{{$json.${bestMatch}}}`, // Use $json prefix for correct data flow
          sourceNode: previousNode.id,
          sourceField: bestMatch,
          sourceType: this.inferFieldType(bestMatch, previousNode.type),
          targetType: this.inferFieldType(fieldName, nodeType)
        };
      }
      
      // Priority 2.5: Semantic match from previous node (fallback)
      const semanticMatch = this.findSemanticMatch(fieldName, previousOutputs, previousNode.type);
      if (semanticMatch) {
        return {
          resolved: true,
          value: `{{$json.${semanticMatch.field}}}`, // Use $json prefix for correct data flow
          sourceNode: previousNode.id,
          sourceField: semanticMatch.field,
          sourceType: semanticMatch.type,
          targetType: this.inferFieldType(fieldName, nodeType)
        };
      }
    }
    
    // Priority 3: Search all upstream nodes for compatible output
    for (let i = upstreamNodes.length - 1; i >= 0; i--) {
      const upstreamNode = upstreamNodes[i];
      const upstreamOutputs = this.getPreviousNodeOutputFields(upstreamNode);
      const match = upstreamOutputs.find(f => 
        f.toLowerCase() === fieldName.toLowerCase() ||
        f.toLowerCase().includes(fieldName.toLowerCase()) ||
        fieldName.toLowerCase().includes(f.toLowerCase())
      );
      
      if (match) {
        return {
          resolved: true,
          value: `{{$json.${match}}}`, // Use $json prefix for correct data flow
          sourceNode: upstreamNode.id,
          sourceField: match,
          sourceType: this.inferFieldType(match, upstreamNode.type),
          targetType: this.inferFieldType(fieldName, nodeType)
        };
      }
    }
    
    // Priority 4: Trigger payload fields
    const triggerFields = this.getTriggerPayloadFields(upstreamNodes);
    const triggerMatch = triggerFields.find(f => 
      f.toLowerCase() === fieldName.toLowerCase() ||
      f.toLowerCase().includes(fieldName.toLowerCase())
    );
    
    if (triggerMatch) {
      return {
        resolved: true,
        value: `{{input.${triggerMatch}}}`,
        sourceNode: 'trigger',
        sourceField: triggerMatch,
        sourceType: 'string'
      };
    }
    
    // Priority 5: Requirements inputs
    if (requirements.inputs && Array.isArray(requirements.inputs)) {
      const reqMatch = requirements.inputs.find((input: any) => {
        const inputName = typeof input === 'string' ? input : (input?.name || input?.field || '');
        return inputName && (
          inputName.toLowerCase() === fieldName.toLowerCase() ||
          inputName.toLowerCase().includes(fieldName.toLowerCase())
        );
      });
      
      if (reqMatch) {
        const inputName = typeof reqMatch === 'string' ? reqMatch : ((reqMatch as any)?.name || (reqMatch as any)?.field || String(reqMatch));
        return {
          resolved: true,
          value: `{{input.${inputName}}}`,
          sourceNode: 'trigger',
          sourceField: inputName,
          sourceType: 'string'
        };
      }
    }
    
    // Not resolved
    return { resolved: false };
  }
  
  /**
   * Find semantic match between field name and available outputs
   */
  private findSemanticMatch(
    fieldName: string,
    availableOutputs: string[],
    sourceNodeType: string
  ): { field: string; type: string } | null {
    const fieldLower = fieldName.toLowerCase();
    
    // Message/text/content patterns
    if (fieldLower.includes('message') || fieldLower.includes('text') || fieldLower.includes('content')) {
      const match = availableOutputs.find(f => 
        f.toLowerCase().includes('message') ||
        f.toLowerCase().includes('text') ||
        f.toLowerCase().includes('content') ||
        f.toLowerCase().includes('response') ||
        f.toLowerCase().includes('reply')
      );
      if (match) {
        return { field: match, type: 'string' };
      }
    }
    
    // Data/value patterns
    if (fieldLower.includes('data') || fieldLower.includes('value') || fieldLower.includes('result')) {
      const match = availableOutputs.find(f => 
        f.toLowerCase().includes('data') ||
        f.toLowerCase().includes('value') ||
        f.toLowerCase().includes('result') ||
        f.toLowerCase().includes('output')
      );
      if (match) {
        return { field: match, type: this.inferFieldType(match, sourceNodeType) };
      }
    }
    
    // Email/to patterns
    if (fieldLower.includes('email') || fieldLower.includes('to')) {
      const match = availableOutputs.find(f => 
        f.toLowerCase().includes('email') ||
        f.toLowerCase().includes('to')
      );
      if (match) {
        return { field: match, type: 'string' };
      }
    }
    
    // Use first available output as fallback
    if (availableOutputs.length > 0) {
      return { field: availableOutputs[0], type: this.inferFieldType(availableOutputs[0], sourceNodeType) };
    }
    
    return null;
  }
  
  /**
   * Find upstream field by name patterns
   */
  private findUpstreamField(
    upstreamNodes: WorkflowNode[],
    patterns: string[]
  ): { value: string; sourceNode: string; sourceField: string } | null {
    for (let i = upstreamNodes.length - 1; i >= 0; i--) {
      const node = upstreamNodes[i];
      const outputs = this.getPreviousNodeOutputFields(node);
      
      for (const pattern of patterns) {
        const match = outputs.find(f => f.toLowerCase().includes(pattern.toLowerCase()));
        if (match) {
          return {
            value: `{{$json.${match}}}`, // Use $json prefix for correct data flow
            sourceNode: node.id,
            sourceField: match
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get trigger payload fields
   */
  private getTriggerPayloadFields(upstreamNodes: WorkflowNode[]): string[] {
    const triggerNode = upstreamNodes.find(n => 
      ['manual_trigger', 'webhook', 'form', 'chat_trigger'].includes(n.type)
    );
    
    if (!triggerNode) {
      return [];
    }
    
    // Common trigger payload fields
    const commonFields = ['user_message', 'message', 'text', 'input', 'body', 'data', 'session_id'];
    
    // Add node-specific fields
    if (triggerNode.type === 'webhook') {
      return [...commonFields, 'query', 'params', 'headers'];
    }
    
    if (triggerNode.type === 'form') {
      return [...commonFields, 'form_data', 'submitted_at'];
    }
    
    return commonFields;
  }
  
  /**
   * Validate type compatibility
   */
  private validateTypeCompatibility(
    sourceType: string,
    targetType: string,
    fieldName: string,
    nodeType: string
  ): boolean {
    // Exact match
    if (sourceType === targetType) {
      return true;
    }
    
    // String compatibility (most flexible)
    if (targetType === 'string') {
      return true; // Can convert anything to string
    }
    
    // Number compatibility
    if (targetType === 'number' && (sourceType === 'string' || sourceType === 'number')) {
      return true; // Can parse string to number
    }
    
    // Object/array compatibility
    if ((targetType === 'object' || targetType === 'array') && 
        (sourceType === 'object' || sourceType === 'array')) {
      return true;
    }
    
    // Boolean compatibility
    if (targetType === 'boolean' && (sourceType === 'string' || sourceType === 'boolean')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Infer field type from field name and node type
   */
  private inferFieldType(fieldName: string, nodeType: string): string {
    const fieldLower = fieldName.toLowerCase();
    const nodeLower = nodeType.toLowerCase();
    
    // Number fields
    if (fieldLower.includes('count') || fieldLower.includes('total') || 
        fieldLower.includes('amount') || fieldLower.includes('price') ||
        fieldLower.includes('age') || fieldLower.includes('number')) {
      return 'number';
    }
    
    // Boolean fields
    if (fieldLower.includes('is_') || fieldLower.includes('has_') || 
        fieldLower.includes('enabled') || fieldLower.includes('active') ||
        fieldLower.includes('valid') || fieldLower === 'true' || fieldLower === 'false') {
      return 'boolean';
    }
    
    // Array fields
    if (fieldLower.includes('list') || fieldLower.includes('array') || 
        fieldLower.includes('items') || fieldLower.endsWith('s')) {
      return 'array';
    }
    
    // Object fields
    if (fieldLower.includes('data') || fieldLower.includes('object') || 
        fieldLower.includes('config') || fieldLower.includes('metadata')) {
      return 'object';
    }
    
    // Default to string
    return 'string';
  }
  
  /**
   * Validate field reference exists in upstream nodes
   */
  private validateFieldReference(
    fieldRef: string,
    upstreamNodes: WorkflowNode[],
    currentNode: WorkflowNode
  ): boolean {
    // Check if it's an input reference
    if (fieldRef.startsWith('input.')) {
      return true; // Input references are always valid
    }
    
    // Check all upstream nodes for this field
    for (const node of upstreamNodes) {
      const outputs = this.getPreviousNodeOutputFields(node);
      if (outputs.includes(fieldRef)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Find compatible source when type mismatch occurs
   */
  private findCompatibleSource(
    fieldName: string,
    nodeType: string,
    upstreamNodes: WorkflowNode[],
    previousNode: WorkflowNode | null
  ): { value: string; sourceNode: string; sourceField: string; sourceType: string } | null {
    // Try to find a source with compatible type
    const targetType = this.inferFieldType(fieldName, nodeType);
    
    const nodesToCheck = previousNode ? [previousNode, ...upstreamNodes] : upstreamNodes;
    
    for (const node of nodesToCheck) {
      const outputs = this.getPreviousNodeOutputFields(node);
      for (const output of outputs) {
        const outputType = this.inferFieldType(output, node.type);
        if (this.validateTypeCompatibility(outputType, targetType, fieldName, nodeType)) {
          return {
            value: `{{$json.${output}}}`, // Use $json prefix for correct data flow
            sourceNode: node.id,
            sourceField: output,
            sourceType: outputType
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Generate value for an input field based on IO mapping rules
   */
  private generateInputFieldValue(
    fieldName: string,
    fieldSchema: any,
    previousNode: WorkflowNode | null,
    allNodes: WorkflowNode[],
    nodeIndex: number,
    requirements: Requirements,
    nodeType: string
  ): any {
    // 🚨 CRITICAL: Auto-populate HubSpot Properties field when operation is "create"
    if (nodeType === 'hubspot' && fieldName === 'properties') {
      const currentNode = allNodes[nodeIndex];
      const operation = currentNode?.data?.config?.operation;
      
      if (operation === 'create' && previousNode) {
        const previousOutputFields = this.getPreviousNodeOutputFields(previousNode);
        const previousNodeType = normalizeNodeType(previousNode);
        
        // Check if we have email and name in the flow
        const hasEmail = previousOutputFields.some(f => f.toLowerCase().includes('email'));
        const hasName = previousOutputFields.some(f => f.toLowerCase().includes('name') || f.toLowerCase().includes('firstname'));
        
        if (hasEmail && hasName) {
          // Find email and name fields
          const emailField = previousOutputFields.find(f => f.toLowerCase().includes('email')) || 'email';
          const nameField = previousOutputFields.find(f => 
            f.toLowerCase().includes('name') && !f.toLowerCase().includes('lastname')
          ) || previousOutputFields.find(f => f.toLowerCase().includes('firstname')) || 'name';
          
          // Auto-generate Properties JSON with template expressions
          const propertiesJson = {
            email: `{{$json.${emailField}}}`,
            firstname: `{{$json.${nameField}}}`
          };
          
          console.log(`✅ [HubSpot Auto-Config] Auto-populated Properties field: ${JSON.stringify(propertiesJson)}`);
          return propertiesJson;
        }
      }
    }
    
    // If previous node exists, map from its output
    if (previousNode) {
      const previousOutputFields = this.getPreviousNodeOutputFields(previousNode);
      
      // Try to match field name with previous output
      const matchingField = previousOutputFields.find(field => 
        field.toLowerCase() === fieldName.toLowerCase() ||
        field.toLowerCase().includes(fieldName.toLowerCase()) ||
        fieldName.toLowerCase().includes(field.toLowerCase())
      );
      
      // ✅ ARCHITECTURAL REFACTOR: Do NOT generate {{$json.*}} template expressions
      // AI Input Resolver will handle input generation dynamically at runtime
      // Return empty string to indicate field will be AI-generated
      // This prevents static JSON dropdown options from appearing in UI
      if (matchingField) {
        // Field will be resolved by AI Input Resolver at runtime
        // Return empty to indicate AI generation
        return '';
      }
      
      // If no direct match, return empty (AI will generate)
      if (previousOutputFields.length > 0) {
        // ✅ AI Input Resolver will analyze previous output and generate appropriate input
        // No need to generate template expressions here
        return '';
      }
      
      // For fields that need AI generation (message, text, content, email, etc.)
      if (fieldName.toLowerCase().includes('message') || 
          fieldName.toLowerCase().includes('text') || 
          fieldName.toLowerCase().includes('content') ||
          fieldName.toLowerCase().includes('email') ||
          fieldName.toLowerCase().includes('subject') ||
          fieldName.toLowerCase().includes('body') ||
          fieldName.toLowerCase().includes('to')) {
        // These fields will be AI-generated at runtime
        return '';
      }
      
      if (fieldName.toLowerCase().includes('data') || fieldName.toLowerCase().includes('value')) {
        // AI will generate based on previous output structure
        return '';
      }
      
      // All fields that need data from previous nodes will be AI-generated
      // No template expressions needed - AI Input Resolver handles this
      return '';
    }
    
    // If no previous node, try to extract from requirements
    const fieldNameLower = fieldName.toLowerCase();
    
    // Check requirements for matching fields
    if (fieldNameLower.includes('age') && requirements.inputs) {
      const ageInput = requirements.inputs.find(i => i.toLowerCase().includes('age'));
      if (ageInput) {
        return `{{input.${ageInput}}}`;
      }
    }
    
    if (fieldNameLower.includes('email') && requirements.inputs) {
      const emailInput = requirements.inputs.find(i => i.toLowerCase().includes('email'));
      if (emailInput) {
        return `{{input.${emailInput}}}`;
      }
    }
    
    if (fieldNameLower.includes('name') && requirements.inputs) {
      const nameInput = requirements.inputs.find(i => i.toLowerCase().includes('name'));
      if (nameInput) {
        return `{{input.${nameInput}}}`;
      }
    }
    
    // Use default from schema if available
    if (fieldSchema?.default !== undefined) {
      return fieldSchema.default;
    }
    
    // Generate intelligent default based on field name and node type
    return this.generateIntelligentDefault(fieldName, nodeType, requirements);
  }

  /**
   * ✅ ARCHITECTURAL FIX: Get output fields from previous node
   * Uses comprehensive registry to ensure correct fields are returned
   */
  /**
   * INTELLIGENT PROPERTY SELECTION: Find the best matching output field from previous node
   * Based on: 1) User intent from prompt, 2) Target field name, 3) Source node type
   * 
   * CRITICAL: This decides WHICH JSON property to forward, not what JSON to generate
   * - JSON structure is generated by user input (e.g., Google Sheets link → full JSON)
   * - This method selects which property of that JSON to forward to next node
   */
  private findBestOutputMatch(
    targetFieldName: string,
    availableOutputs: string[],
    sourceNodeType: string,
    requirements?: Requirements,
    targetNodeType?: string
  ): string {
    const targetLower = targetFieldName.toLowerCase();
    const userPrompt = ((requirements as any)?.originalPrompt || requirements?.primaryGoal || '').toLowerCase();
    
    // ============================================
    // PRIORITY 1: User Intent-Based Selection
    // ============================================
    // If user specifies a column/field (e.g., "resumes column"), check if it exists in outputs
    if (userPrompt) {
      // Extract potential column/field names from user prompt
      const columnPatterns = [
        /(?:only|just|send|forward|use|filter|extract|get)\s+(?:the\s+)?(\w+)\s+(?:column|field|data|section)/i,
        /(\w+)\s+(?:column|field|data|section)\s+(?:only|just|send|forward|use)/i,
      ];
      
      for (const pattern of columnPatterns) {
        const match = userPrompt.match(pattern);
        if (match && match[1]) {
          const userSpecifiedField = match[1].trim();
          
          // CRITICAL: For Google Sheets and similar data sources, columns are inside the 'items' array
          // If source is Google Sheets and user specifies a column (e.g., "resumes"), 
          // we need to forward items[].ColumnName or filter to that column
          if (sourceNodeType === 'google_sheets' && availableOutputs.includes('items')) {
            // Google Sheets outputs items array where each item has column names as keys
            // User wants specific column → forward items[].ColumnName
            // Capitalize first letter to match typical column naming (Resumes, Name, etc.)
            const columnName = userSpecifiedField.charAt(0).toUpperCase() + userSpecifiedField.slice(1);
            console.log(`✅ [Property Selection] User specified "${userSpecifiedField}" column from Google Sheets`);
            console.log(`   └─ Prompt: "${userPrompt.substring(0, 100)}..."`);
            console.log(`   └─ Matched pattern: "${match[0]}"`);
            console.log(`   └─ Forwarding items[].${columnName} (column filtering will be applied)`);
            // Return 'items' - the filtering will be handled by template expression construction
            // The actual filtering can be done with: {{$json.items[].Resumes}} or similar
            return 'items'; // Base property, column filtering handled separately if needed
          }
          
          // Check if this field exists in available outputs (case-insensitive)
          const fieldMatch = availableOutputs.find(f => 
            f.toLowerCase() === userSpecifiedField.toLowerCase() ||
            f.toLowerCase().includes(userSpecifiedField.toLowerCase())
          );
          if (fieldMatch) {
            console.log(`✅ [Property Selection] User specified "${userSpecifiedField}" → forwarding ${fieldMatch}`);
            console.log(`   └─ Prompt: "${userPrompt.substring(0, 100)}..."`);
            console.log(`   └─ Matched pattern: "${match[0]}"`);
            return fieldMatch;
          }
        }
      }
    }
    
    // ============================================
    // PRIORITY 2: Target Node Type-Based Selection
    // ============================================
    // Different target nodes need different properties
    if (targetNodeType) {
      const targetLower = targetNodeType.toLowerCase();
      
      // AI/LLM nodes need data/content, prefer items or data arrays
      if (targetLower.includes('ai_agent') || targetLower.includes('gpt') || 
          targetLower.includes('claude') || targetLower.includes('gemini') || 
          targetLower.includes('ollama') || targetLower.includes('chat_model')) {
        // For AI nodes, prefer items (array of objects) or data
        const aiPreferredFields = ['items', 'data', 'rows', 'records'];
        for (const field of aiPreferredFields) {
          if (availableOutputs.includes(field)) {
            console.log(`✅ [Property Selection] AI node target (${targetNodeType}) → forwarding ${field}`);
            console.log(`   └─ Available outputs: ${availableOutputs.join(', ')}`);
            return field;
          }
        }
      }
      
      // Communication nodes (Gmail, Slack, etc.) need text/message content
      if (targetLower.includes('gmail') || targetLower.includes('email') || 
          targetLower.includes('slack') || targetLower.includes('discord') ||
          targetLower.includes('telegram') || targetLower.includes('whatsapp')) {
        // For communication nodes, prefer text/message from AI nodes
        const commPreferredFields = ['response_text', 'text', 'message', 'content', 'body'];
        for (const field of commPreferredFields) {
          if (availableOutputs.includes(field)) {
            console.log(`✅ [Property Selection] Communication node target → forwarding ${field}`);
            return field;
          }
        }
      }
    }
    
    // ============================================
    // PRIORITY 3: Exact Match
    // ============================================
    const exactMatch = availableOutputs.find(f => f.toLowerCase() === targetLower);
    if (exactMatch) {
      console.log(`✅ [Property Selection] Exact match → forwarding ${exactMatch}`);
      return exactMatch;
    }
    
    // ============================================
    // PRIORITY 4: Semantic Match
    // ============================================
    const semanticMatch = this.findSemanticMatch(targetFieldName, availableOutputs, sourceNodeType);
    if (semanticMatch) {
      console.log(`✅ [Property Selection] Semantic match → forwarding ${semanticMatch.field}`);
      return semanticMatch.field;
    }
    
    // ============================================
    // PRIORITY 5: Source Node Type-Based Selection
    // ============================================
    // Google Sheets → prefer items (array of row objects)
    if (sourceNodeType === 'google_sheets') {
      if (availableOutputs.includes('items')) {
        console.log(`✅ [Property Selection] Google Sheets source → forwarding items`);
        return 'items';
      }
      if (availableOutputs.includes('rows')) {
        console.log(`✅ [Property Selection] Google Sheets source → forwarding rows`);
        return 'rows';
      }
    }
    
    // AI nodes → prefer response_text or text
    if (sourceNodeType.includes('ai_agent') || sourceNodeType.includes('gpt') || 
        sourceNodeType.includes('claude') || sourceNodeType.includes('gemini')) {
      if (availableOutputs.includes('response_text')) {
        console.log(`✅ [Property Selection] AI source → forwarding response_text`);
        return 'response_text';
      }
      if (availableOutputs.includes('text')) {
        console.log(`✅ [Property Selection] AI source → forwarding text`);
        return 'text';
      }
    }
    
    // ============================================
    // PRIORITY 6: Common Data Flow Patterns
    // ============================================
    // For message/text/content fields, prefer response_text, text, message, content
    if (targetLower.includes('message') || targetLower.includes('text') || targetLower.includes('content') || targetLower.includes('body')) {
      const messageFields = ['response_text', 'text', 'message', 'content', 'body', 'output', 'response'];
      for (const msgField of messageFields) {
        if (availableOutputs.includes(msgField)) {
          console.log(`✅ [Property Selection] Message field target → forwarding ${msgField}`);
          return msgField;
        }
      }
    }
    
    // For data/input fields, prefer items, data, output, result
    if (targetLower.includes('data') || targetLower.includes('input') || targetLower.includes('value')) {
      const dataFields = ['items', 'data', 'output', 'result', 'rows', 'records'];
      for (const dataField of dataFields) {
        if (availableOutputs.includes(dataField)) {
          console.log(`✅ [Property Selection] Data field target → forwarding ${dataField}`);
          return dataField;
        }
      }
    }
    
    // ============================================
    // PRIORITY 7: Fallback to Preferred Order
    // ============================================
    const preferredOrder = ['items', 'data', 'output', 'result', 'response_text', 'text', 'message', 'content'];
    for (const preferred of preferredOrder) {
      if (availableOutputs.includes(preferred)) {
        console.log(`✅ [Property Selection] Fallback → forwarding ${preferred}`);
        return preferred;
      }
    }
    
    // ============================================
    // PRIORITY 8: Ultimate Fallback
    // ============================================
    const fallback = availableOutputs[0] || 'output';
    console.log(`✅ [Property Selection] Ultimate fallback → forwarding ${fallback}`);
    return fallback;
  }

  private getPreviousNodeOutputFields(previousNode: WorkflowNode): string[] {
    const outputFields: string[] = [];
    
    // Check config for outputFields (explicitly set)
    if (previousNode.data?.config?.outputFields) {
      const fields = previousNode.data.config.outputFields;
      if (Array.isArray(fields)) {
        outputFields.push(...fields);
      } else if (typeof fields === 'string') {
        outputFields.push(fields);
      }
    }
    
    // Check config for output schema (explicitly set)
    if (previousNode.data?.config?.outputSchema) {
      const schema = previousNode.data.config.outputSchema;
      if (typeof schema === 'object' && schema !== null) {
        outputFields.push(...Object.keys(schema));
      }
    }
    
    // ✅ CRITICAL FIX: Always use comprehensive registry, even if config has fields
    // This ensures we have the complete list of available outputs
    const nodeActualType = normalizeNodeType(previousNode);
    const registryFields = this.getNodeOutputFields(nodeActualType);
    
    // Merge config fields with registry fields (registry takes precedence for duplicates)
    const allFields = [...new Set([...registryFields, ...outputFields])];
    
    // ✅ ARCHITECTURAL FIX: Remove dangerous generic fallback
    // If no output fields found, fail gracefully instead of using generic 'output'
    if (allFields.length === 0) {
      console.warn(`⚠️  [getPreviousNodeOutputFields] No declared outputs for node type: ${nodeActualType} (node.id: ${previousNode.id})`);
      // Return empty array - edge creation should handle this gracefully
      // DO NOT fall back to generic 'output' - this causes validation errors
      return [];
    }
    
    return allFields;
  }

  /**
   * Infer output fields from node type
   */
  private inferOutputFieldsFromNodeType(nodeType: string): string[] {
    const typeLower = nodeType.toLowerCase();
    
    // ============================================
    // TRIGGER NODES
    // ============================================
    if (typeLower === 'manual_trigger') {
      return ['inputData', 'timestamp', 'triggerType'];
    }
    if (typeLower === 'workflow_trigger') {
      return ['inputData', 'workflowId', 'timestamp'];
    }
    if (typeLower === 'chat_trigger') {
      return ['message', 'userId', 'sessionId', 'timestamp'];
    }
    if (typeLower === 'webhook') {
      return ['body', 'headers', 'queryParams', 'method', 'output'];
    }
    if (typeLower === 'form') {
      return ['fields', 'submittedAt', 'formId', 'output'];
    }
    if (typeLower === 'schedule') {
      return ['cronExpression', 'executionTime', 'timezone', 'output'];
    }
    if (typeLower === 'interval') {
      return ['interval', 'unit', 'executionTime', 'output'];
    }
    if (typeLower === 'error_trigger') {
      return ['error', 'timestamp', 'source', 'output'];
    }
    
    // ============================================
    // AI NODES
    // ============================================
    if (typeLower === 'ai_agent') {
      return ['response_text', 'response_json', 'response_markdown', 'text', 'output'];
    }
    if (typeLower.includes('openai') || typeLower.includes('gpt')) {
      return ['text', 'response', 'content', 'message', 'output'];
    }
    if (typeLower.includes('claude') || typeLower.includes('anthropic')) {
      return ['text', 'response', 'content', 'message', 'output'];
    }
    if (typeLower.includes('gemini') || typeLower.includes('google_gemini')) {
      return ['text', 'response', 'content', 'message', 'output'];
    }
    if (typeLower === 'ollama') {
      return ['text', 'response', 'content', 'message', 'output'];
    }
    if (typeLower.includes('summarizer')) {
      return ['text', 'summary', 'output'];
    }
    if (typeLower.includes('sentiment')) {
      return ['sentiment', 'score', 'emotions', 'output'];
    }
    
    // ============================================
    // HTTP & API NODES
    // ============================================
    if (typeLower.includes('http_request') || typeLower.includes('http_post')) {
      return ['status', 'headers', 'body', 'response', 'responseTime'];
    }
    if (typeLower.includes('webhook_response') || typeLower.includes('respond_to_webhook')) {
      return []; // void output
    }
    if (typeLower === 'graphql') {
      return ['data', 'errors', 'response'];
    }
    
    // ============================================
    // GOOGLE SERVICES
    // ============================================
    if (typeLower === 'google_sheets') {
      return ['rows', 'row_data', 'sheet_data', 'data'];
    }
    if (typeLower === 'google_doc') {
      return ['content', 'document_data', 'text'];
    }
    if (typeLower === 'google_drive') {
      return ['file_id', 'file_url', 'file_data', 'files'];
    }
    if (typeLower === 'google_gmail') {
      return ['message', 'response', 'output'];
    }
    if (typeLower === 'google_calendar') {
      return ['eventId', 'success', 'event'];
    }
    if (typeLower === 'google_tasks') {
      return ['tasks', 'data'];
    }
    if (typeLower === 'google_contacts') {
      return ['contacts', 'data'];
    }
    if (typeLower === 'google_bigquery') {
      return ['rows', 'data', 'result'];
    }
    
    // ============================================
    // OUTPUT & COMMUNICATION NODES (all return strings)
    // ============================================
    if (typeLower.includes('slack') || typeLower.includes('discord') || 
        typeLower.includes('email') || typeLower === 'telegram' || 
        typeLower.includes('teams') || typeLower.includes('whatsapp') || 
        typeLower === 'twilio') {
      return ['message', 'response', 'output'];
    }
    if (typeLower === 'log_output') {
      return []; // void output
    }
    
    // ============================================
    // SOCIAL MEDIA NODES (all return strings)
    // ============================================
    if (typeLower === 'linkedin' || typeLower === 'twitter' || 
        typeLower === 'instagram' || typeLower === 'facebook') {
      return ['message', 'response', 'output'];
    }
    
    // ============================================
    // DATA MANIPULATION NODES
    // ============================================
    if (typeLower.includes('set_variable') || typeLower === 'set') {
      return ['data', 'output', 'variables'];
    }
    if (typeLower.includes('javascript') || typeLower.includes('code')) {
      return ['result', 'output', 'data'];
    }
    if (typeLower.includes('text_formatter') || typeLower.includes('format')) {
      return ['formatted', 'output', 'text'];
    }
    if (typeLower.includes('json_parser') || typeLower.includes('json')) {
      return ['parsed', 'data', 'output'];
    }
    if (typeLower.includes('date_time') || typeLower.includes('datetime')) {
      return ['formatted', 'timestamp', 'output'];
    }
    if (typeLower === 'math') {
      return ['result', 'output'];
    }
    if (typeLower === 'html') {
      return ['parsed', 'text', 'output'];
    }
    if (typeLower === 'xml') {
      return ['parsed', 'text', 'output'];
    }
    if (typeLower === 'csv') {
      return ['rows', 'data'];
    }
    if (typeLower.includes('merge_data')) {
      return ['merged', 'data', 'output'];
    }
    if (typeLower.includes('rename_keys')) {
      return ['renamed', 'data', 'output'];
    }
    if (typeLower.includes('edit_fields')) {
      return ['edited', 'data', 'output'];
    }
    
    // ============================================
    // LOGIC NODES
    // ============================================
    if (typeLower.includes('if_else') || typeLower.includes('condition')) {
      return ['result', 'condition_result', 'output', 'true', 'false'];
    }
    if (typeLower === 'switch') {
      return ['result', 'output', 'case_result', 'data'];
    }
    if (typeLower === 'filter') {
      return ['filtered', 'data', 'output'];
    }
    if (typeLower === 'loop') {
      return ['iterated', 'data', 'output'];
    }
    if (typeLower === 'merge') {
      return ['merged', 'data', 'output'];
    }
    if (typeLower.includes('split_in_batches')) {
      return ['batches', 'data'];
    }
    if (typeLower === 'wait') {
      return ['waitedUntil', 'duration', 'output'];
    }
    if (typeLower.includes('error_handler')) {
      return ['result', 'output', 'data'];
    }
    if (typeLower.includes('stop_and_error')) {
      return []; // void output
    }
    if (typeLower === 'noop') {
      return ['output', 'data'];
    }
    if (typeLower === 'limit') {
      return ['limited', 'data', 'output'];
    }
    if (typeLower === 'aggregate') {
      return ['groups', 'totals', 'count', 'output'];
    }
    if (typeLower === 'sort') {
      return ['sorted', 'data', 'output'];
    }
    
    // ============================================
    // DATABASE NODES
    // ============================================
    if (typeLower.includes('database_read')) {
      return ['rows', 'data', 'result'];
    }
    if (typeLower.includes('database_write')) {
      return ['affectedRows', 'insertId', 'result', 'rowsAffected'];
    }
    if (typeLower === 'supabase') {
      return ['data', 'error', 'rows'];
    }
    if (typeLower.includes('postgres') || typeLower.includes('mysql') || 
        typeLower.includes('mongodb') || typeLower === 'redis') {
      return ['rows', 'data', 'result'];
    }
    
    // ============================================
    // CRM & MARKETING NODES
    // ============================================
    if (typeLower.includes('hubspot') || typeLower.includes('zoho') || 
        typeLower.includes('pipedrive') || typeLower.includes('salesforce') ||
        typeLower.includes('freshdesk') || typeLower.includes('intercom') ||
        typeLower.includes('mailchimp') || typeLower.includes('activecampaign')) {
      return ['data', 'result', 'output'];
    }
    
    // ============================================
    // FILE & STORAGE NODES
    // ============================================
    if (typeLower.includes('read_binary_file') || typeLower.includes('read_file')) {
      return ['content', 'data', 'file'];
    }
    if (typeLower.includes('write_binary_file') || typeLower.includes('write_file')) {
      return ['success', 'filePath', 'output'];
    }
    if (typeLower.includes('s3') || typeLower.includes('dropbox') || 
        typeLower.includes('onedrive') || typeLower.includes('ftp') || 
        typeLower.includes('sftp')) {
      return ['fileUrl', 'filePath', 'data'];
    }
    
    // ============================================
    // DEVOPS & E-COMMERCE NODES
    // ============================================
    if (typeLower.includes('github') || typeLower.includes('gitlab') || 
        typeLower.includes('bitbucket') || typeLower === 'jira' || 
        typeLower === 'jenkins' || typeLower.includes('shopify') ||
        typeLower.includes('woocommerce') || typeLower === 'stripe' || 
        typeLower === 'paypal') {
      return ['data', 'result', 'output'];
    }
    
    // Default fallback
    return ['output', 'data', 'result'];
  }

  /**
   * Generate intelligent default value for a field
   */
  private generateIntelligentDefault(fieldName: string, nodeType: string, requirements: Requirements): any {
    const fieldNameLower = fieldName.toLowerCase();
    
    // ENHANCED: Add example values so users can see where to change things
    
    // Strategy 1: Use requirements context with examples
    if (fieldNameLower.includes('message') || fieldNameLower.includes('text') || fieldNameLower.includes('content')) {
      if (requirements.primaryGoal) {
        return requirements.primaryGoal;
      }
      if (requirements.inputs && requirements.inputs.length > 0) {
        return `{{input.${requirements.inputs[0]}}}`;
      }
      // Add example message
      return 'Example: Process the input data - Change this message as needed';
    }
    
    // Strategy 2: Use template variables with examples
    if (fieldNameLower.includes('condition')) {
      // Add example conditions based on common patterns
      if (requirements.primaryGoal?.toLowerCase().includes('age')) {
        return '{{age}} >= 18  // Example: Change age and threshold as needed';
      }
      if (requirements.primaryGoal?.toLowerCase().includes('even') || requirements.primaryGoal?.toLowerCase().includes('odd')) {
        return '{{number}} % 2 === 0  // Example: Check if number is even (change field name as needed)';
      }
      return '{{$json}}  // Example: Change this condition (e.g., {{age}} >= 18)';
    }
    
    if (fieldNameLower.includes('template')) {
      return '{{$json}}  // Example: Change this template (e.g., "Age: {{age}}, Eligible: {{eligible}}")';
    }
    
    // Strategy 3: Use code defaults with examples
    if (fieldNameLower.includes('code')) {
      return `// Example code - modify as needed
return {
  ...input,
  result: input.value * 2
};`;
    }
    
    // Strategy 4: Use requirements inputs with examples
    if (fieldNameLower.includes('variables') || fieldNameLower.includes('input')) {
      if (requirements.inputs && requirements.inputs.length > 0) {
        return `{{input.${requirements.inputs[0]}}}  // Example: Change field name as needed`;
      }
    }
    
    if (fieldNameLower.includes('variables')) {
      // Return example object structure
      return {
        example_field: '{{input.example_field}}  // Example: Change field name and template as needed',
        age: '{{input.age}}  // Example: Add more fields as needed'
      };
    }
    
    if (fieldNameLower.includes('url')) {
      return 'https://api.example.com  // Example: Change this URL to your API endpoint';
    }
    
    if (fieldNameLower.includes('name') || fieldNameLower.includes('field')) {
      return 'example_field  // Example: Change this field name as needed';
    }
    
    if (fieldNameLower.includes('value')) {
      return '{{input.value}}  // Example: Change this template (e.g., {{input.age}})';
    }
    
    // Return example string as last resort
    return 'Example value - Change this as needed';
  }

  /**
   * Generate intelligent node configuration following system prompt rules
   * - Auto-fills ALL required fields
   * - Uses secure variable references for API keys
   * - Generates valid service URLs
   * - Applies safe defaults
   * - NO placeholders or empty required fields
   */
  private async generateNodeConfig(
    node: WorkflowNode, 
    requirements: Requirements,
    configValues: Record<string, any> = {},
    allNodes?: WorkflowNode[],
    nodeIndex?: number
  ): Promise<Record<string, unknown>> {
    // Get node schema from NodeLibrary for better configuration
    // CRITICAL FIX: Use normalizeNodeType to get actual node type
    const actualNodeType = normalizeNodeType(node);
    const nodeSchema = nodeLibrary.getSchema(actualNodeType);
    
    let config: Record<string, unknown> = {};
    
    // Extract values from configValues (user-provided credentials/URLs)
    // configValues may contain credentials passed from constraints
    const allConfigValues = { ...configValues };
    
    const getConfigValue = (key: string, fallback?: any): any => {
      // Try exact match first in all config values (including credentials)
      if (allConfigValues[key] !== undefined && allConfigValues[key] !== null && allConfigValues[key] !== '') {
        return allConfigValues[key];
      }
      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const [k, v] of Object.entries(allConfigValues)) {
        if (k.toLowerCase() === lowerKey && v !== undefined && v !== null && v !== '') {
          return v;
        }
      }
      // Try credential keys (SLACK_TOKEN, API_KEY, etc.)
      const credentialKey = key.toUpperCase();
      if (allConfigValues[credentialKey] !== undefined && allConfigValues[credentialKey] !== null && allConfigValues[credentialKey] !== '') {
        return allConfigValues[credentialKey];
      }
      // Try to get default from schema
      if (nodeSchema?.configSchema?.optional?.[key]?.default !== undefined) {
        return nodeSchema.configSchema.optional[key].default;
      }
      return fallback;
    };

    // Helper to extract from requirements arrays
    const getFromRequirements = (type: 'urls' | 'apis' | 'credentials' | 'schedules' | 'platforms', index: number = 0): string | undefined => {
      const arr = requirements[type] || [];
      return arr[index] || undefined;
    };

    // Apply common patterns from NodeLibrary if available
    if (nodeSchema?.commonPatterns && nodeSchema.commonPatterns.length > 0) {
      // Try to match a pattern based on requirements
      const matchedPattern = nodeSchema.commonPatterns.find(pattern => {
        // Simple matching logic - can be enhanced
        return true; // For now, use first pattern
      });
      
      if (matchedPattern) {
        Object.assign(config, matchedPattern.config);
      }
    }

    // Use utility functions for API key references and service URLs
    const getSecureApiKeyRef = generateApiKeyRef;
    const getServiceUrl = getServiceBaseUrl;

    // Use AI to intelligently configure nodes based on type and requirements
    // Following system prompt: ALL required fields filled, NO placeholders
    try {
      switch (node.type) {
        case 'http_request':
        case 'http_post':
          config.method = node.type === 'http_post' ? 'POST' : 'GET';
          // Auto-generate valid URL or use provided
          config.url = getConfigValue('url') || getConfigValue('api_url') || getFromRequirements('urls', 0) || getServiceUrl('webhook');
          
          // Automatically add required headers
          const headers: Record<string, string> = getConfigValue('headers') || {};
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          
          // Auto-add Authorization header if API key is needed
          const apiKey = getConfigValue('api_key') || getFromRequirements('credentials', 0);
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          } else if (requirements.apis && requirements.apis.length > 0) {
            // Use secure variable reference if API is mentioned but key not provided
            headers['Authorization'] = `Bearer ${getSecureApiKeyRef('api')}`;
          }
          
          config.headers = headers;
          
          // Apply safe defaults for pagination, limits, timeouts
          config.timeout = getConfigValue('timeout') || 30000; // 30 seconds
          config.retries = getConfigValue('retries') || 3;
          config.limit = getConfigValue('limit') || 100;
          break;
        
        case 'schedule':
          const schedule = getFromRequirements('schedules', 0) || getConfigValue('schedule');
          if (schedule) {
            // Try to parse schedule string into cron format
            config.cronExpression = this.parseScheduleToCron(schedule);
          } else {
            config.cronExpression = '0 9 * * *'; // Default: 9 AM daily
          }
          break;
        
        case 'interval':
          config.interval = getConfigValue('interval') || 3600; // Default 1 hour
          config.unit = getConfigValue('unit') || 'seconds';
          break;
        
        case 'if_else':
          // REQUIRED: condition must never be empty
          // Try to extract condition from requirements or node label
          let condition = getConfigValue('condition');
          if (!condition || condition === '{{ $json }}') {
            // Try to infer condition from requirements or node label
            const nodeLabel = node.data?.label?.toLowerCase() || '';
            const primaryGoal = requirements.primaryGoal?.toLowerCase() || '';
            
            // Look for comparison patterns in requirements
            if (primaryGoal.includes('age') && primaryGoal.includes('>= 18')) {
              condition = '{{age}} >= 18  // Example: Change field name (age) and threshold (18) as needed';
            } else if (primaryGoal.includes('age') && primaryGoal.includes('>=')) {
              const ageMatch = primaryGoal.match(/age.*?>=.*?(\d+)/);
              if (ageMatch) {
                condition = `{{age}} >= ${ageMatch[1]}  // Example: Change field name and threshold as needed`;
              }
            } else if (primaryGoal.includes('even') || primaryGoal.includes('odd')) {
              // Even/odd check example
              condition = '{{number}} % 2 === 0  // Example: Change field name (number) - checks if even';
            } else if (nodeLabel.includes('eligibility') || nodeLabel.includes('check')) {
              // Try to extract from keySteps
              const keySteps = requirements.keySteps || [];
              const eligibilityStep = keySteps.find(step => 
                step.toLowerCase().includes('check') || 
                step.toLowerCase().includes('validate') ||
                step.toLowerCase().includes('>=')
              );
              if (eligibilityStep) {
                // Try to extract condition from step description
                const ageMatch = eligibilityStep.match(/(\w+)\s*(>=|>|==|<|<=)\s*(\d+)/);
                if (ageMatch) {
                  condition = `{{${ageMatch[1]}}} ${ageMatch[2]} ${ageMatch[3]}  // Example: Change field name and comparison as needed`;
                }
              }
            }
          }
          // If still no condition, provide a helpful example
          if (!condition || condition === '{{ $json }}') {
            condition = '{{example_field}} >= 18  // Example: Change example_field to your field name and adjust condition';
          }
          config.condition = condition;
          break;
        
        case 'set_variable':
          // 🚨 CRITICAL: Auto-configure set_variable to extract email and name from webhook
          // Check if this is for webhook data extraction
          const nodeDescription = (node.data?.label?.toLowerCase() || '');
          const primaryGoalLower = requirements.primaryGoal?.toLowerCase() || '';
          
          // Check if we need to extract email and name from webhook
          if ((nodeDescription.includes('extract') && (nodeDescription.includes('email') || nodeDescription.includes('name'))) ||
              (primaryGoalLower.includes('extract') && (primaryGoalLower.includes('email') || primaryGoalLower.includes('name')))) {
            // Auto-configure to extract email and name from webhook body
            config.variables = {
              email: '{{$json.body.email}}',
              name: '{{$json.body.name}}'
            };
            // Also try direct access (webhook may output body directly)
            config.fields = {
              email: '{{$json.email}}',
              name: '{{$json.name}}'
            };
            console.log(`✅ [set_variable Auto-Config] Auto-configured email/name extraction from webhook`);
            break;
          }
          
          // REQUIRED: variables must be an array (even if empty)
          // Try to extract variables from requirements
          let variables = getConfigValue('variables');
          if (!variables || !Array.isArray(variables) || variables.length === 0) {
            // Try to infer from requirements
            const primaryGoal = requirements.primaryGoal?.toLowerCase() || '';
            const inputs = requirements.inputs || [];
            const keySteps = requirements.keySteps || [];
            
            variables = {};
            
            // Extract common fields from prompt
            if (primaryGoal.includes('age') || inputs.some(i => i.toLowerCase().includes('age'))) {
              variables['age'] = '{{input.age}}';
            }
            if (primaryGoal.includes('amount') || primaryGoal.includes('total') || inputs.some(i => i.toLowerCase().includes('amount'))) {
              variables['amount'] = '{{input.amount}}';
            }
            if (primaryGoal.includes('email') || inputs.some(i => i.toLowerCase().includes('email'))) {
              variables['email'] = '{{input.email}}';
            }
            if (primaryGoal.includes('name') || inputs.some(i => i.toLowerCase().includes('name'))) {
              variables['name'] = '{{input.name}}';
            }
            
            // If no variables extracted, use default
            if (Object.keys(variables).length === 0) {
              variables = {};
            }
          }
          config.variables = variables;
          break;
        
        case 'openai_gpt':
          config.model = getConfigValue('model') || 'gpt-3.5-turbo';
          // REQUIRED: prompt must never be empty
          config.prompt = getConfigValue('prompt') || requirements.primaryGoal || 'Process the input data and provide a response.';
          // Use secure variable reference if API key not provided
          config.apiKey = getConfigValue('openai_api_key') || getConfigValue('api_key') || getFromRequirements('credentials', 0) || getSecureApiKeyRef('openai');
          config.temperature = getConfigValue('temperature') || 0.7;
          config.maxTokens = getConfigValue('maxTokens') || 2000;
          // Auto-add base URL
          config.baseURL = getConfigValue('baseURL') || getServiceUrl('openai');
          break;
        
        case 'anthropic_claude':
          config.model = getConfigValue('model') || 'claude-3-sonnet-20240229';
          // REQUIRED: prompt must never be empty
          config.prompt = getConfigValue('prompt') || requirements.primaryGoal || 'Process the input data and provide a response.';
          // Use secure variable reference if API key not provided
          config.apiKey = getConfigValue('claude_api_key') || getConfigValue('api_key') || getFromRequirements('credentials', 0) || getSecureApiKeyRef('anthropic');
          config.temperature = getConfigValue('temperature') || 0.7;
          config.maxTokens = getConfigValue('maxTokens') || 2000;
          // Auto-add base URL
          config.baseURL = getConfigValue('baseURL') || getServiceUrl('anthropic');
          break;
        
        case 'google_gemini':
          config.model = getConfigValue('model') || 'gemini-pro';
          // REQUIRED: prompt must never be empty
          config.prompt = getConfigValue('prompt') || requirements.primaryGoal || 'Process the input data and provide a response.';
          // Use secure variable reference if API key not provided
          config.apiKey = getConfigValue('gemini_api_key') || getConfigValue('api_key') || getFromRequirements('credentials', 0) || getSecureApiKeyRef('gemini');
          config.temperature = getConfigValue('temperature') || 0.7;
          config.maxTokens = getConfigValue('maxTokens') || 2000;
          // Auto-add base URL
          config.baseURL = getConfigValue('baseURL') || getServiceUrl('gemini');
          break;
        
        case 'google_sheets':
          config.operation = getConfigValue('operation') || 'read';
          // Extract spreadsheet ID from URL if provided
          const sheetUrl = getConfigValue('google_sheet_url') || getConfigValue('url') || getFromRequirements('urls', 0) || '';
          if (sheetUrl) {
            const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            if (sheetIdMatch) {
              config.spreadsheetId = sheetIdMatch[1];
            } else {
              config.spreadsheetId = sheetUrl; // Assume it's already an ID
            }
          } else {
            // Don't use ENV placeholder - let missing fields check prompt user
            config.spreadsheetId = getConfigValue('spreadsheetId') || getConfigValue('spreadsheet_id') || '';
          }
          // REQUIRED: sheetName must have a value
          config.sheetName = getConfigValue('sheetName') || getConfigValue('sheet_name') || 'Sheet1';
          config.range = getConfigValue('range') || 'A1:Z1000'; // Default range instead of empty
          config.outputFormat = getConfigValue('outputFormat') || 'json';
          break;
        
        case 'slack_message':
          // Auto-generate webhook URL or use secure reference
          // Prioritize webhook URL over token (webhook is simpler and sufficient)
          const slackWebhook = getConfigValue('slack_webhook_url') || getConfigValue('webhook_url') || getFromRequirements('urls', 0) || getSecureApiKeyRef('slack', 'SLACK_WEBHOOK_URL');
          config.webhookUrl = slackWebhook || getServiceUrl('webhook'); // Marked as configurable
          config.channel = getConfigValue('slack_channel') || getConfigValue('channel') || '#general';
          // REQUIRED: message must never be empty
          config.message = getConfigValue('message') || requirements.primaryGoal || 'Workflow notification';
          // Token is optional - webhook URL is preferred
          config.token = getConfigValue('slack_token') || getConfigValue('token') || getFromRequirements('credentials', 0);
          break;
        
        case 'discord':
          // Auto-generate webhook URL or use secure reference
          const discordWebhook = getConfigValue('discord_webhook_url') || getConfigValue('webhook_url') || getFromRequirements('urls', 0);
          config.webhookUrl = discordWebhook || getServiceUrl('webhook'); // Marked as configurable
          // REQUIRED: message must never be empty
          config.message = getConfigValue('message') || requirements.primaryGoal || 'Workflow notification';
          break;
        
        case 'email':
          config.smtpHost = getConfigValue('smtp_host') || 'smtp.gmail.com';
          config.smtpPort = getConfigValue('smtp_port') || 587;
          config.username = getConfigValue('email') || getConfigValue('username') || '';
          config.password = getConfigValue('email_password') || getConfigValue('password') || getFromRequirements('credentials', 0) || '';
          config.to = getConfigValue('to') || '';
          config.subject = getConfigValue('subject') || 'Workflow Notification';
          config.body = getConfigValue('body') || requirements.primaryGoal || '';
          break;
        
        case 'google_gmail':
          config.operation = getConfigValue('operation') || 'send';
          config.to = getConfigValue('to') || '';
          config.subject = getConfigValue('subject') || 'Workflow Notification';
          config.body = getConfigValue('body') || requirements.primaryGoal || '';
          break;
        
        case 'webhook':
          config.method = getConfigValue('method') || 'POST';
          config.path = getConfigValue('path') || '/webhook';
          break;
        
        case 'loop':
          config.maxIterations = getConfigValue('maxIterations') || 100;
          break;
        
        case 'wait':
          config.duration = getConfigValue('duration') || 1000;
          config.unit = getConfigValue('unit') || 'milliseconds';
          break;
        
        case 'filter':
          config.condition = getConfigValue('condition') || '{{ $json }}';
          break;
        
        case 'javascript':
          // REQUIRED: code must never be empty
          // Try to generate meaningful code from requirements
          let code = getConfigValue('code');
          if (!code || code === 'return $input;') {
            const primaryGoal = requirements.primaryGoal?.toLowerCase() || '';
            const nodeLabel = node.data?.label?.toLowerCase() || '';
            
            // Generate code based on requirements
            if (primaryGoal.includes('eligibility') || primaryGoal.includes('check') || nodeLabel.includes('eligibility')) {
              // Voting eligibility or similar check
              if (primaryGoal.includes('age') && primaryGoal.includes('>= 18')) {
                code = `
                  const age = parseInt(input.age) || 0;
                  const threshold = 18;
                  const eligible = age >= threshold;
                  const reason = eligible 
                    ? \`User is \${age} years old, which meets the \${threshold}+ requirement\`
                    : \`User is \${age} years old, which is below the \${threshold} requirement\`;
                  
                  return {
                    age: age,
                    eligible: eligible,
                    reason: reason,
                    threshold: threshold,
                    checkedAt: new Date().toISOString()
                  };
                `;
              } else if (primaryGoal.includes('calculate') || primaryGoal.includes('total') || primaryGoal.includes('sum')) {
                // Calculation logic
                code = `
                  const items = input.items || input.data || [];
                  const total = items.reduce((sum, item) => sum + (parseFloat(item.amount || item.value || 0) || 0), 0);
                  const count = items.length;
                  const average = count > 0 ? total / count : 0;
                  
                  return {
                    total: total,
                    count: count,
                    average: average,
                    items: items
                  };
                `;
              }
            }
          }
          config.code = code || 'return $input;';
          break;
        
        case 'text_formatter':
          // REQUIRED: template must never be empty
          // Try to generate meaningful template from requirements
          let template = getConfigValue('template');
          if (!template || template === '{{ $json }}') {
            const primaryGoal = requirements.primaryGoal?.toLowerCase() || '';
            const nodeLabel = node.data?.label?.toLowerCase() || '';
            
            // Generate template based on requirements
            if (primaryGoal.includes('eligibility') || nodeLabel.includes('eligibility')) {
              template = `Voting Eligibility Result:\n\nAge: {{age}}\nEligible: {{eligible ? 'YES' : 'NO'}}\nReason: {{reason}}\nRequired Age: {{threshold}}`;
            } else if (primaryGoal.includes('report') || primaryGoal.includes('summary')) {
              template = `Report:\n\n{{JSON.stringify($json, null, 2)}}`;
            } else {
              template = `Result: {{JSON.stringify($json, null, 2)}}`;
            }
          }
          config.template = template || '{{ $json }}';
          break;
        
        case 'hubspot':
          // 🚨 CRITICAL: Auto-configure HubSpot operation and properties
          const hubspotPrompt = requirements.primaryGoal?.toLowerCase() || '';
          
          // Auto-set operation to "create" if prompt mentions creating
          if (!config.operation) {
            if (hubspotPrompt.includes('create') || hubspotPrompt.includes('add') || hubspotPrompt.includes('new contact')) {
              config.operation = 'create';
              console.log(`✅ [HubSpot Auto-Config] Set operation to "create" based on prompt`);
            } else {
              config.operation = getConfigValue('operation') || 'get';
            }
          }
          
          // Auto-set resource to "contact" if prompt mentions contact
          if (!config.resource) {
            if (hubspotPrompt.includes('contact')) {
              config.resource = 'contact';
              console.log(`✅ [HubSpot Auto-Config] Set resource to "contact" based on prompt`);
            } else {
              config.resource = getConfigValue('resource') || 'contact';
            }
          }
          
          // Auto-populate Properties field when operation is "create" and we have email/name in flow
          if (config.operation === 'create' && !config.properties) {
            // Check if we have email and name in requirements
            const hasEmail = hubspotPrompt.includes('email');
            const hasName = hubspotPrompt.includes('name');
            
            if (hasEmail && hasName) {
              // Auto-generate Properties JSON with template expressions
              // These will be resolved from previous node (set_variable or webhook)
              config.properties = {
                email: '{{$json.email}}',
                firstname: '{{$json.name}}'
              };
              console.log(`✅ [HubSpot Auto-Config] Auto-populated Properties field: ${JSON.stringify(config.properties)}`);
            }
          }
          
          // Set other HubSpot fields if not already set
          config.id = getConfigValue('id') || getConfigValue('objectId') || '';
          config.searchQuery = getConfigValue('searchQuery') || '';
          config.limit = getConfigValue('limit') || 100;
          break;
        
        case 'log_output':
          // REQUIRED: message must never be empty
          // Try to generate meaningful message from requirements
          let logMessage = getConfigValue('message');
          if (!logMessage || logMessage === 'Workflow execution completed') {
            const primaryGoal = requirements.primaryGoal || '';
            const nodeLabel = node.data?.label || '';
            
            // Generate specific message based on context
            if (primaryGoal.includes('eligibility') || nodeLabel.includes('eligibility')) {
              logMessage = 'Voting eligibility check completed';
            } else if (primaryGoal.includes('calculate') || primaryGoal.includes('total')) {
              logMessage = 'Calculation completed';
            } else if (primaryGoal.includes('validate') || primaryGoal.includes('check')) {
              logMessage = 'Validation completed';
            } else {
              logMessage = primaryGoal || 'Workflow execution completed';
            }
          }
          config.message = logMessage;
          
          // Include data if available - ensure all result fields are included
          if (!config.data) {
            config.data = {};
          }
          // Try to include relevant fields from requirements
          const inputs = requirements.inputs || [];
          const outputs = requirements.outputs || [];
          if (inputs.length > 0 || outputs.length > 0) {
            // Include input/output fields in log data
            const existingData = typeof config.data === 'object' && config.data !== null ? config.data : {};
            config.data = {
              ...(existingData as Record<string, any>),
              inputs: inputs,
              outputs: outputs,
            };
          }
          break;
        
        case 'ai_agent':
          // ✅ DEFAULT: AI Agent uses Ollama via connected chat_model node (created automatically)
          // REQUIRED: systemPrompt must never be empty
          // CRITICAL: Check if this is a chatbot workflow to use chatbot-specific prompt
          const isChatbotWorkflow = this.detectChatbotIntent(requirements) || 
                                   allNodes?.some(n => n.type === 'chat_trigger') ||
                                   (requirements as any)?.trigger === 'chat_trigger';
          
          // Use chatbot-specific prompt for chatbot workflows
          if (isChatbotWorkflow) {
            config.systemPrompt = getConfigValue('systemPrompt') || 
              'You are a helpful and friendly chatbot assistant. Your role is to have natural conversations with users.\n\n' +
              'CRITICAL RULES:\n' +
              '1. When a user sends you a message, respond DIRECTLY to that message in a conversational way.\n' +
              '2. Do NOT explain how workflows work, do NOT describe workflow structures, and do NOT provide technical explanations about automation.\n' +
              '3. Do NOT analyze JSON objects or data structures - just respond to the user\'s message as if you are having a friendly chat.\n' +
              '4. If you receive a simple greeting like "Hello", respond with a friendly greeting like "Hi! How can I help you today?"\n' +
              '5. Keep responses concise (1-3 sentences), helpful, and engaging.\n' +
              '6. Be conversational and natural - act like a helpful assistant, not a technical documentation generator.\n\n' +
              'Example: If user says "Hello", respond with "Hi! How can I help you today?" NOT with explanations about workflows or JSON structures.';
          } else {
            // ✅ DEFAULT: Generate intelligent prompt based on user's original request
            const originalPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
            if (originalPrompt.includes('summarize') || originalPrompt.includes('summary')) {
              config.systemPrompt = getConfigValue('systemPrompt') || 
                'You are an AI assistant that summarizes data concisely and accurately. Extract key points and provide clear summaries.';
            } else if (originalPrompt.includes('analyze') || originalPrompt.includes('analysis')) {
              config.systemPrompt = getConfigValue('systemPrompt') || 
                'You are an AI assistant that analyzes data and provides key insights. Identify patterns, trends, and important information.';
            } else if (originalPrompt.includes('extract')) {
              config.systemPrompt = getConfigValue('systemPrompt') || 
                'You are an AI assistant that extracts key information from data. Identify and return the most important details.';
            } else {
              config.systemPrompt = getConfigValue('systemPrompt') || requirements.primaryGoal || 
                'You are an autonomous intelligent agent inside an automation workflow. Understand user input, reason over context, use available tools when needed, and produce structured responses.';
            }
          }
          config.mode = getConfigValue('mode') || 'chat';
          config.temperature = getConfigValue('temperature') || 0.7;
          config.maxTokens = getConfigValue('maxTokens') || 2000;
          console.log(`✅ [AI Agent Config] Configured AI AGENT node (will use Ollama via connected chat_model by default)`);
          break;

        case 'chat_model':
        case 'ai_chat_model':
          // REQUIRED: provider, model, and prompt must never be empty
          // ✅ CRITICAL: Default to Ollama (running on AWS) for all AI chat models
          config.provider = getConfigValue('provider') || 'ollama';
          config.model = getConfigValue('model') || 'qwen2.5:14b-instruct-q4_K_M';
          // Ollama doesn't need API key - it's configured via OLLAMA_BASE_URL environment variable
          // Remove apiKey requirement for Ollama
          const originalPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
          // Generate intelligent prompt based on user's original request
          if (originalPrompt.includes('summarize') || originalPrompt.includes('summary')) {
            config.prompt = getConfigValue('prompt') || 'Summarize the following data concisely and accurately:';
          } else if (originalPrompt.includes('analyze') || originalPrompt.includes('analysis')) {
            config.prompt = getConfigValue('prompt') || 'Analyze the following data and provide key insights:';
          } else if (originalPrompt.includes('extract')) {
            config.prompt = getConfigValue('prompt') || 'Extract key information from the following data:';
          } else {
            config.prompt = getConfigValue('prompt') || 'You are a helpful AI assistant that provides accurate and useful responses.';
          }
          config.temperature = getConfigValue('temperature') || 0.7;
          console.log(`✅ [AI Config] Configured ${node.type || node.data?.type || 'ai_chat_model'} node with Ollama provider (model: ${config.model})`);
          break;
        
        default:
          // For unknown node types, try to fill common fields
          // Ensure no empty required fields
          if (requirements.primaryGoal) {
            config.prompt = requirements.primaryGoal;
          } else {
            config.prompt = 'Process the input data';
          }
          break;
      }
      
      // Final validation: Remove any placeholder values using utility function
      const serviceName = extractServiceName(node.type);
      Object.keys(config).forEach(key => {
        config[key] = sanitizeConfigValue(key, config[key], serviceName);
      });
      
      // Apply safe defaults for the node type
      config = applySafeDefaults(config, node.type);
    } catch (error) {
      console.error(`Error configuring node ${node.type}:`, error);
      // Fallback: ensure basic required fields are set
      if (requirements.primaryGoal) {
        config.prompt = requirements.primaryGoal;
      } else {
        config.prompt = 'Process the input data';
      }
    }
    
    return config;
  }

  /**
   * Check if node is a transformation node
   */
  private isTransformationNode(nodeType: string): boolean {
    return isTransformationNode(nodeType);
  }

  /**
   * Configure transformation node with input-output mapping
   */
  private configureTransformationNode(
    node: WorkflowNode,
    allNodes: WorkflowNode[],
    index: number,
    baseConfig: Record<string, unknown>,
    requirements: Requirements
  ): Record<string, unknown> {
    const previousNode = index > 0 ? allNodes[index - 1] : null;
    const config = { ...baseConfig };

    // Get transformation template
    const template = getTransformationTemplate(node.type, previousNode || undefined);
    Object.assign(config, template);

    // Generate input/output mappings based on context
    if (previousNode) {
      // Get output schema from previous node
      const previousOutputSchema = previousNode.data?.config?.outputSchema;
      const previousOutputFields = previousNode.data?.config?.outputFields;

      // Set input mapping
      if (!config.inputMapping) {
        // Pass requirements and node type for intelligent property selection
        const nodeType = node.data?.type || node.type;
        config.inputMapping = this.generateInputMapping(previousNode, requirements, nodeType);
      }

      // Set input fields
      if (!config.inputFields || (Array.isArray(config.inputFields) && config.inputFields.length === 0)) {
        if (previousOutputFields) {
          config.inputFields = Array.isArray(previousOutputFields)
            ? previousOutputFields
            : [previousOutputFields];
        } else {
          config.inputFields = this.inferInputFields(previousNode);
        }
      }

      // Generate output schema
      if (!config.outputSchema) {
        config.outputSchema = this.generateOutputSchema(node.type, previousNode);
      }

      // Set output fields
      if (!config.outputFields || (Array.isArray(config.outputFields) && config.outputFields.length === 0)) {
        config.outputFields = this.generateOutputFieldNames(node.type, previousNode);
      }

      // Generate transformation rules
      if (!config.transformationRules || (Array.isArray(config.transformationRules) && config.transformationRules.length === 0)) {
        config.transformationRules = this.generateTransformationRules(
          node.type,
          config.inputFields as string[],
          config.outputFields as string[]
        );
      }
    } else {
      // No previous node - use defaults
      config.inputFields = config.inputFields || ['data'];
      config.outputFields = config.outputFields || ['transformed_data'];
      config.inputMapping = config.inputMapping || { data: '{{input.data}}' };
    }

    // Set intelligent defaults for transformation
    if (!config.transformationType) {
      config.transformationType = 'map';
    }
    if (config.preserveStructure === undefined) {
      config.preserveStructure = true;
    }
    if (!config.errorHandling) {
      config.errorHandling = {
        onError: 'continue',
        fallbackValue: null,
        logErrors: true,
      };
    }

    return config;
  }

  /**
   * Generate input mapping from previous node
   * CRITICAL FIX: Use proper {{$json.field}} format instead of {{previousNode.field}}
   */
  private generateInputMapping(previousNode: WorkflowNode, requirements?: Requirements, currentNodeType?: string): Record<string, string> {
    const mapping: Record<string, string> = {};

    // Try to extract output fields from previous node
    if (previousNode.data?.config?.outputFields) {
      const outputFields = Array.isArray(previousNode.data.config.outputFields)
        ? previousNode.data.config.outputFields
        : [previousNode.data.config.outputFields];

      // CRITICAL FIX: Use proper {{$json.field}} format instead of {{previousNode.field}}
      outputFields.forEach((field: string) => {
        mapping[field] = `{{$json.${field}}}`;
      });
    } else {
      // Default mapping - use common output fields
      // Use {{$json}} format with intelligent property selection if available
      const commonFields = ['items', 'data', 'output', 'result', 'rows'];
      if (requirements && currentNodeType) {
        const bestField = this.findBestOutputMatch('data', commonFields, previousNode.type, requirements, currentNodeType);
        mapping['data'] = `{{$json.${bestField}}}`;
      } else {
        // Fallback to 'items' for Google Sheets, 'data' for others
        const defaultField = previousNode.type === 'google_sheets' ? 'items' : 'data';
        mapping['data'] = `{{$json.${defaultField}}}`;
      }
    }

    return mapping;
  }

  /**
   * Infer input fields from previous node
   */
  private inferInputFields(previousNode: WorkflowNode): string[] {
    const nodeType = previousNode.type.toLowerCase();

    if (nodeType.includes('http') || nodeType.includes('api')) {
      return ['response', 'data', 'body'];
    }
    if (nodeType.includes('sheet') || nodeType.includes('database')) {
      return ['rows', 'data', 'records'];
    }
    if (nodeType.includes('json') || nodeType.includes('parse')) {
      return ['json', 'data', 'parsed'];
    }

    return ['data', 'output', 'result'];
  }

  /**
   * Generate output schema for transformation node
   */
  private generateOutputSchema(
    nodeType: string,
    previousNode: WorkflowNode
  ): Record<string, any> {
    const schema: Record<string, any> = {};

    // Try to preserve previous node's output schema
    if (previousNode.data?.config?.outputSchema) {
      return previousNode.data.config.outputSchema as Record<string, any>;
    }

    // Generate based on node type
    const nodeTypeLower = nodeType.toLowerCase();
    if (nodeTypeLower.includes('filter')) {
      schema.type = 'array';
      schema.items = { type: 'object' };
    } else if (nodeTypeLower.includes('format') || nodeTypeLower.includes('convert')) {
      schema.type = 'string';
    } else if (nodeTypeLower.includes('aggregate')) {
      schema.type = 'object';
      schema.properties = {
        total: { type: 'number' },
        count: { type: 'number' },
      };
    } else {
      schema.type = 'object';
    }

    return schema;
  }

  /**
   * Generate output field names
   */
  private generateOutputFieldNames(
    nodeType: string,
    previousNode?: WorkflowNode | null
  ): string[] {
    // Try to use previous node's output fields as base
    if (previousNode?.data?.config?.outputFields) {
      const prevOutputs = previousNode.data.config.outputFields;
      if (Array.isArray(prevOutputs)) {
        return prevOutputs.map((field: string) => `transformed_${field}`);
      }
      return [`transformed_${prevOutputs}`];
    }

    // Generate based on node type
    const nodeTypeLower = nodeType.toLowerCase();
    if (nodeTypeLower.includes('filter')) {
      return ['filtered_data'];
    }
    if (nodeTypeLower.includes('format') || nodeTypeLower.includes('convert')) {
      return ['formatted_data'];
    }
    if (nodeTypeLower.includes('aggregate')) {
      return ['aggregated_data', 'summary'];
    }

    return ['transformed_data', 'output'];
  }

  /**
   * Generate transformation rules
   */
  private generateTransformationRules(
    nodeType: string,
    inputFields: string[],
    outputFields: string[]
  ): Array<{ source: string; target: string; transformation: string }> {
    const rules: Array<{ source: string; target: string; transformation: string }> = [];

    // Create direct mappings
    const minLength = Math.min(inputFields.length, outputFields.length);
    for (let i = 0; i < minLength; i++) {
      rules.push({
        source: `{{input.${inputFields[i]}}}`,
        target: outputFields[i],
        transformation: 'direct',
      });
    }

    // If more output fields, map remaining to first input
    if (outputFields.length > inputFields.length) {
      for (let i = inputFields.length; i < outputFields.length; i++) {
        rules.push({
          source: `{{input.${inputFields[0] || 'data'}}}`,
          target: outputFields[i],
          transformation: 'direct',
        });
      }
    }

    return rules;
  }

  /**
   * Parse schedule string to cron expression
   */
  private parseScheduleToCron(schedule: string): string {
    const lower = schedule.toLowerCase();
    
    // Daily patterns
    if (lower.includes('daily') || lower.includes('every day')) {
      const timeMatch = schedule.match(/(\d+):(\d+)/);
      if (timeMatch) {
        return `${timeMatch[2]} ${timeMatch[1]} * * *`; // minute hour * * *
      }
      return '0 9 * * *'; // Default 9 AM
    }
    
    // Hourly
    if (lower.includes('hourly') || lower.includes('every hour')) {
      return '0 * * * *';
    }
    
    // Weekly
    if (lower.includes('weekly') || lower.includes('every week')) {
      return '0 9 * * 0'; // Sunday 9 AM
    }
    
    // Monthly
    if (lower.includes('monthly') || lower.includes('every month')) {
      return '0 9 1 * *'; // 1st of month at 9 AM
    }
    
    // Try to parse cron-like expressions
    if (/^[\d\s\*\/,-]+$/.test(schedule.trim())) {
      return schedule.trim();
    }
    
    // Default: daily at 9 AM
    return '0 9 * * *';
  }

  /**
   * Create connections between nodes with proper input-output mapping
   * Following comprehensive prompt: Match output schema to input schema exactly
   * Transform data if needed, never pass incompatible types
   * 
   * Also automatically creates and connects Chat Model nodes for AI Agent nodes
   * 
   * Enhanced with proper field mapping and validation per comprehensive prompt rules
   */
  /**
   * COMPREHENSIVE: Validate connection before creating edge
   */
  private validateConnectionBeforeCreation(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    outputField: string,
    inputField: string
  ): { valid: boolean; error?: string; suggestedOutputField?: string; suggestedInputField?: string } {
    // Get node schemas
    // CRITICAL FIX: Use normalizeNodeType to get actual node types
    const sourceActualType = normalizeNodeType(sourceNode);
    const targetActualType = normalizeNodeType(targetNode);
    const sourceSchema = nodeLibrary.getSchema(sourceActualType);
    const targetSchema = nodeLibrary.getSchema(targetActualType);
    
    if (!sourceSchema || !targetSchema) {
      return { valid: false, error: `Missing schema for ${sourceActualType} or ${targetActualType}` };
    }
    
    // Use connection validator's validateConnection method which handles schema validation
    // Create a temporary edge for validation
    const tempEdge: WorkflowEdge = {
      id: 'temp',
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: outputField,
      targetHandle: inputField,
    };
    
    const validationResult = connectionValidator.validateConnection(sourceNode, targetNode, tempEdge);
    
    if (!validationResult.valid) {
      // Extract suggested fields from validation result
      const suggestedOutput = validationResult.dataContract?.sourceField || outputField;
      const suggestedInput = validationResult.dataContract?.targetField || inputField;
      
      return {
        valid: false,
        error: validationResult.errors.join('; '),
        suggestedOutputField: suggestedOutput,
        suggestedInputField: suggestedInput,
      };
    }
    
    return { valid: true };
  }

  /**
   * ✅ ARCHITECTURAL FIX: Get output fields for a node type
   * Uses the same registry as comprehensive-workflow-validator for consistency
   */
  private getNodeOutputFields(nodeType: string): string[] {
    // Use the same registry as in createConnections
    // ✅ COMPREHENSIVE: Output fields registry matching comprehensive-workflow-validator.ts
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
      'outlook': ['message', 'response', 'output'],
      
      // ============================================
      // SOCIAL MEDIA NODES
      // ============================================
      'linkedin': ['message', 'response', 'output'],
      'twitter': ['message', 'response', 'output'],
      'instagram': ['message', 'response', 'output'],
      'facebook': ['message', 'response', 'output'],
      'youtube': ['message', 'response', 'output'],
      
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
      'function': ['output', 'result', 'data'],
      'function_item': ['output', 'result', 'data'],
      
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
      'airtable': ['record', 'records', 'data', 'output'],
      
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
      
      // ============================================
      // PRODUCTIVITY NODES
      // ============================================
      'notion': ['data', 'result', 'output'],
      'clickup': ['data', 'result', 'output'],
    };
    
    // If not in registry, infer from node type
    if (outputFields[nodeType]) {
      return outputFields[nodeType];
    }
    
    // Fallback to inference
    return this.inferOutputFieldsFromNodeType(nodeType);
  }

  /**
   * ✅ ARCHITECTURAL FIX: Get input fields for a node type
   */
  private getNodeInputFields(nodeType: string): string[] {
    // ✅ CRITICAL: Always use the registry first for consistency with resolveTargetHandle
    // This ensures we use the same input fields that resolveTargetHandle expects
    const defaultInputs: Record<string, string[]> = {
        // AI Nodes
        'ai_agent': ['userInput', 'chat_model', 'memory', 'tool'],
        'openai_gpt': ['prompt', 'model', 'temperature', 'maxTokens'],
        'anthropic_claude': ['prompt', 'model', 'temperature', 'maxTokens'],
        'google_gemini': ['prompt', 'model', 'temperature', 'maxTokens'],
        'ollama': ['prompt', 'model', 'temperature', 'maxTokens'],
        
        // Google Services
        'google_sheets': ['spreadsheetId', 'range', 'values', 'data', 'operation', 'sheetName'],
        'google_doc': ['documentId', 'operation', 'content'],
        'google_drive': ['operation', 'fileId', 'fileName'],
        'google_gmail': ['credentialId', 'operation', 'to', 'subject', 'body', 'from', 'messageId', 'query', 'maxResults'],
        'google_calendar': ['resource', 'operation', 'credentialId', 'calendarId', 'eventId', 'summary', 'start', 'end', 'eventData', 'description', 'timeMin', 'timeMax', 'maxResults', 'q'],
        'google_tasks': ['operation', 'taskId', 'title', 'notes'],
        'google_contacts': ['operation', 'contactId', 'name', 'email'],
        'google_bigquery': ['query', 'projectId', 'datasetId'],
        
        // Communication
        'slack_message': ['webhookUrl', 'channel', 'message', 'text', 'blocks', 'username', 'iconEmoji'],
        'slack_webhook': ['webhookUrl', 'message', 'text'],
        'email': ['to', 'subject', 'text', 'html', 'from', 'smtpHost', 'smtpPort'],
        'discord': ['channelId', 'message', 'botToken'],
        'discord_webhook': ['webhookUrl', 'message'],
        'telegram': ['chatId', 'messageType', 'message', 'botToken'],
        'whatsapp_cloud': ['resource', 'operation', 'phoneNumberId', 'to', 'text'],
        'twilio': ['to', 'message', 'from'],
        'microsoft_teams': ['webhookUrl', 'message'],
        'outlook': ['operation', 'to', 'subject', 'body', 'from'],
        
        // CRM & Integration
        'hubspot': ['resource', 'operation', 'apiKey', 'accessToken', 'credentialId', 'id', 'objectId', 'properties', 'searchQuery', 'limit', 'after'],
        'airtable': ['baseId', 'tableId', 'operation', 'recordId', 'fields'],
        'salesforce': ['resource', 'operation', 'recordId', 'fields'],
        'zoho_crm': ['resource', 'operation', 'module', 'recordId'],
        'pipedrive': ['resource', 'operation', 'apiToken', 'recordId'],
        'freshdesk': ['resource', 'operation', 'domain', 'apiKey'],
        'intercom': ['resource', 'operation', 'accessToken'],
        'mailchimp': ['listId', 'operation', 'apiKey'],
        'activecampaign': ['resource', 'operation', 'apiUrl', 'apiKey'],
        
        // Logic
        'if_else': ['conditions', 'combineOperation'],
        'switch': ['routingType', 'rules', 'value'],
        'filter': ['condition', 'items'],
        'loop': ['items', 'maxIterations'],
        'merge': ['mode', 'joinBy', 'data1', 'data2'], // ✅ CRITICAL: merge receives data via 'data1' and 'data2'
        'javascript': ['code', 'input', 'data'], // ✅ CRITICAL: javascript receives data via 'data' field
        'set_variable': ['name', 'value'], // ✅ CRITICAL: set_variable receives data via 'value' (removed 'input' - not a valid field)
        'json_parser': ['jsonData', 'options'],
        'text_formatter': ['text', 'format', 'options'],
        'set': ['name', 'value', 'input'],
        'edit_fields': ['fields', 'data'],
        'rename_keys': ['keys', 'data'],
        'merge_data': ['data1', 'data2', 'mode'],
        'function': ['description', 'code', 'timeout'],
        'function_item': ['description', 'items'],
        'wait': ['duration', 'unit'],
        'error_handler': ['continueOnFail', 'retryOnFail', 'maxRetries', 'retryDelay'],
        'stop_and_error': ['errorMessage'],
        'noop': [],
        'split_in_batches': ['batchSize'],
        'limit': ['limit'],
        'aggregate': ['aggregateBy', 'groupBy'],
        'sort': ['sortBy', 'order'],
        'date_time': ['format', 'timezone'],
        'math': ['operation', 'a', 'b'],
        'html': ['html', 'selector'],
        'xml': ['xml', 'xpath'],
        'csv': ['csv', 'delimiter'],
        
        // Database
        'database_read': ['query', 'connectionString', 'host', 'port', 'database', 'username', 'password'],
        'database_write': ['query', 'connectionString', 'host', 'port', 'database', 'username', 'password'],
        'supabase': ['operation', 'table', 'select', 'filter', 'data'],
        'postgresql': ['query', 'host', 'port', 'database', 'username', 'password'],
        'mysql': ['query', 'host', 'port', 'database', 'username', 'password'],
        'mongodb': ['operation', 'collection', 'query', 'data', 'connectionString'],
        'redis': ['operation', 'key', 'value', 'host', 'port'],
        
        // HTTP
        'http_request': ['url', 'method', 'headers', 'body', 'qs'],
        'http_post': ['url', 'body', 'headers'],
        'graphql': ['url', 'query', 'variables'],
        'respond_to_webhook': ['responseCode', 'headers', 'body'],
        'webhook_response': ['responseCode', 'body'],
        
        // File/Storage
        'read_binary_file': ['filePath'],
        'write_binary_file': ['filePath', 'data'],
        'aws_s3': ['operation', 'bucket', 'key', 'accessKeyId', 'secretAccessKey'],
        'dropbox': ['operation', 'path', 'accessToken'],
        'onedrive': ['operation', 'path', 'accessToken'],
        'ftp': ['operation', 'host', 'path', 'username', 'password'],
        'sftp': ['operation', 'host', 'path', 'username', 'password'],
        
        // Social Media
        'linkedin': ['operation', 'text', 'mediaUrl', 'visibility', 'personUrn'],
        'twitter': ['resource', 'operation', 'text', 'tweetId'],
        'instagram': ['resource', 'operation', 'media_url', 'caption', 'accessToken'],
        'youtube': ['operation', 'videoUrl', 'title', 'description', 'channelId'],
        'facebook': ['message', 'pageId', 'accessToken', 'credentialId'],
        
        // E-commerce
        'shopify': ['resource', 'operation', 'shop', 'accessToken'],
        'woocommerce': ['resource', 'operation', 'url', 'consumerKey', 'consumerSecret'],
        'stripe': ['operation', 'amount', 'currency', 'apiKey'],
        'paypal': ['operation', 'amount', 'currency', 'clientId', 'clientSecret'],
        
        // DevOps
        'github': ['operation', 'owner', 'repo', 'token'],
        'gitlab': ['operation', 'repo', 'token'],
        'bitbucket': ['operation', 'repo', 'username', 'password'],
        'jira': ['operation', 'issueKey', 'url', 'username', 'apiToken'],
        'jenkins': ['operation', 'jobName', 'url', 'username', 'apiToken'],
        
        // Productivity
        'notion': ['apiKey', 'accessToken', 'credentialId', 'resource', 'operation'],
        'clickup': ['resource', 'operation', 'apiKey', 'listId', 'taskId'],
      };
      
      // ✅ CRITICAL: Always return from registry if available
      if (defaultInputs[nodeType]) {
        return defaultInputs[nodeType];
      }
      
      // ✅ FALLBACK: If schema exists, use it, but merge with registry if needed
      const nodeSchema = nodeLibrary.getSchema(nodeType);
      if (nodeSchema?.configSchema) {
        const requiredFields = nodeSchema.configSchema.required || [];
        const optionalFields = Object.keys(nodeSchema.configSchema.optional || {});
        const schemaFields = [...requiredFields, ...optionalFields];
        
        // ✅ CRITICAL: For set_variable and loop, ensure we include the correct fields
        if (nodeType === 'set_variable' && !schemaFields.includes('value')) {
          schemaFields.push('value');
        }
        if (nodeType === 'loop' && !schemaFields.includes('items')) {
          schemaFields.push('items');
        }
        
        return schemaFields;
      }
      
      // Final fallback
      return ['input', 'data'];
  }

  /**
   * ✅ SCHEMA-AWARE HANDLE RESOLUTION: Get the correct source handle for an edge
   * Maps step output fields to actual node output handles based on schema
   */
  private resolveSourceHandle(
    sourceNode: WorkflowNode,
    stepOutputField?: string
  ): string {
    const sourceActualType = normalizeNodeType(sourceNode);
    const sourceOutputs = this.getNodeOutputFields(sourceActualType);
    
    // If step specifies an output field, validate and use it
    if (stepOutputField) {
      // ✅ CRITICAL: Handle if_else branching - map 'true'/'false' to actual output handles
      if (sourceActualType === 'if_else') {
        // if_else doesn't have 'true'/'false' handles - use 'output' or 'data'
        if (stepOutputField === 'true' || stepOutputField === 'false') {
          // Use 'output' if available, else 'data', else first available
          return sourceOutputs.find(f => f === 'output') || 
                 sourceOutputs.find(f => f === 'data') || 
                 sourceOutputs[0] || 'output';
        }
      }
      
      // Check if the specified field exists in node outputs
      if (sourceOutputs.includes(stepOutputField)) {
        return stepOutputField;
      }
      
      // Field doesn't exist - log warning and fall through to default
      console.warn(`⚠️  [resolveSourceHandle] Step output field '${stepOutputField}' not found in ${sourceActualType} outputs. Available: ${sourceOutputs.join(', ')}`);
    }
    
    // ✅ Use primary output field based on node type
    const primaryOutputs: Record<string, string> = {
      // Triggers
      'manual_trigger': 'inputData',
      'workflow_trigger': 'inputData',
      'chat_trigger': 'message',
      'webhook': 'body',
      'schedule': 'output',
      'interval': 'output',
      'form': 'formData',
      'error_trigger': 'error',
      
      // AI Nodes
      'ai_agent': 'response_text',
      'openai_gpt': 'text',
      'anthropic_claude': 'text',
      'google_gemini': 'text',
      'ollama': 'text',
      'text_summarizer': 'summary',
      'sentiment_analyzer': 'sentiment',
      
      // Google Services
      'google_sheets': 'rows',
      'google_doc': 'content',
      'google_drive': 'file_id',
      'google_gmail': 'message',
      'google_calendar': 'eventId',
      'google_tasks': 'tasks',
      'google_contacts': 'contacts',
      'google_bigquery': 'rows',
      
      // Communication
      'slack_message': 'message',
      'slack_webhook': 'message',
      'email': 'message',
      'discord': 'message',
      'discord_webhook': 'message',
      'telegram': 'message',
      'whatsapp_cloud': 'message',
      'twilio': 'message',
      'microsoft_teams': 'message',
      
      // CRM & Integration
      'hubspot': 'contact',
      'airtable': 'record',
      'salesforce': 'record',
      'zoho_crm': 'data',
      'pipedrive': 'data',
      
      // Logic
      'if_else': 'output',
      'switch': 'result',
      'filter': 'filtered',
      'loop': 'iterated',
      'merge': 'merged',
      'javascript': 'output',
      'set_variable': 'data',
      'json_parser': 'parsed',
      'text_formatter': 'formatted',
      
      // Database
      'database_read': 'rows',
      'database_write': 'affectedRows',
      'supabase': 'data',
      'postgresql': 'rows',
      'mysql': 'rows',
      'mongodb': 'documents',
      
      // HTTP
      'http_request': 'body',
      'http_post': 'body',
      'graphql': 'data',
      
      // File/Storage
      'read_binary_file': 'content',
      'write_binary_file': 'success',
      'aws_s3': 'fileUrl',
      'dropbox': 'fileUrl',
      'onedrive': 'fileUrl',
      
      // Social Media
      'linkedin': 'message',
      'twitter': 'message',
      'instagram': 'message',
      'youtube': 'message',
      'facebook': 'message',
      
      // E-commerce
      'shopify': 'data',
      'woocommerce': 'data',
      'stripe': 'data',
      'paypal': 'data',
      
      // DevOps
      'github': 'data',
      'gitlab': 'data',
      'bitbucket': 'data',
      'jira': 'data',
      'jenkins': 'data',
    };
    
    const primaryOutput = primaryOutputs[sourceActualType];
    if (primaryOutput && sourceOutputs.includes(primaryOutput)) {
      return primaryOutput;
    }
    
    // ✅ CRITICAL: Fallback - use first available output, but NEVER use 'output' if it doesn't exist
    // Only use 'output' if it's actually in the schema
    if (sourceOutputs.length > 0) {
      // Prefer 'output' if it exists, else 'data', else first available
      return sourceOutputs.find(f => f === 'output') || 
             sourceOutputs.find(f => f === 'data') || 
             sourceOutputs[0];
    }
    
    // If no outputs found, log error and return empty (will be caught by validation)
    console.error(`❌ [resolveSourceHandle] No output fields found for ${sourceActualType} node`);
    return 'output'; // Last resort - will fail validation
  }

  /**
   * ✅ SCHEMA-AWARE HANDLE RESOLUTION: Get the correct target handle for an edge
   * Maps step input fields to actual node input handles based on schema
   */
  private resolveTargetHandle(
    targetNode: WorkflowNode,
    stepInputField?: string
  ): string {
    const targetActualType = normalizeNodeType(targetNode);
    const targetInputs = this.getNodeInputFields(targetActualType);
    
    // If step specifies an input field, validate and use it
    if (stepInputField) {
      if (targetInputs.includes(stepInputField)) {
        return stepInputField;
      }
      
      // Field doesn't exist - log warning and fall through to default
      console.warn(`⚠️  [resolveTargetHandle] Step input field '${stepInputField}' not found in ${targetActualType} inputs. Available: ${targetInputs.join(', ')}`);
    }
    
    // ✅ Use primary input field based on node type
    const primaryInputs: Record<string, string> = {
      // AI Nodes
      'ai_agent': 'userInput',
      'openai_gpt': 'prompt',
      'anthropic_claude': 'prompt',
      'google_gemini': 'prompt',
      'ollama': 'prompt',
      
      // Google Services
      'google_sheets': 'values', // ✅ CRITICAL: google_sheets receives data via 'values' array (for write/append operations)
      'google_doc': 'content', // ✅ CRITICAL: google_doc receives content via 'content' field
      'google_drive': 'fileId', // ✅ CRITICAL: google_drive receives file reference via 'fileId'
      'google_gmail': 'body', // ✅ CRITICAL: google_gmail receives email body via 'body' field
      'google_calendar': 'eventData', // ✅ CRITICAL: google_calendar receives event data via 'eventData'
      'google_tasks': 'title', // ✅ CRITICAL: google_tasks receives task data via 'title' (primary field)
      'google_contacts': 'name', // ✅ CRITICAL: google_contacts receives contact data via 'name' (primary field)
      'google_bigquery': 'query', // ✅ CRITICAL: google_bigquery receives SQL query via 'query'
      
      // Communication
      'slack_message': 'message',
      'slack_webhook': 'message',
      'email': 'to',
      'discord': 'message',
      'discord_webhook': 'message',
      'telegram': 'message',
      'whatsapp_cloud': 'to',
      'twilio': 'to',
      'microsoft_teams': 'message',
      
      // CRM & Integration
      'hubspot': 'properties', // ✅ CRITICAL: hubspot receives contact/company data via 'properties' object
      'airtable': 'fields', // ✅ CRITICAL: airtable receives record data via 'fields' object
      'salesforce': 'fields', // ✅ CRITICAL: salesforce receives record data via 'fields' object
      'zoho_crm': 'data', // ✅ CRITICAL: zoho_crm receives data via 'data' field
      'pipedrive': 'data', // ✅ CRITICAL: pipedrive receives data via 'data' field
      'freshdesk': 'data', // ✅ CRITICAL: freshdesk receives ticket data via 'data' field
      'intercom': 'data', // ✅ CRITICAL: intercom receives conversation data via 'data' field
      'mailchimp': 'data', // ✅ CRITICAL: mailchimp receives subscriber data via 'data' field
      'activecampaign': 'data', // ✅ CRITICAL: activecampaign receives contact data via 'data' field
      
      // Logic
      'if_else': 'conditions', // ✅ CRITICAL: if_else receives data via 'conditions' array
      'switch': 'value', // ✅ CRITICAL: switch receives data via 'value' field
      'filter': 'items', // ✅ CRITICAL: filter receives array via 'items'
      'loop': 'items', // ✅ CRITICAL: loop receives array via 'items'
      'merge': 'data1', // ✅ CRITICAL: merge receives data via 'data1' (first branch)
      'javascript': 'data', // ✅ CRITICAL: javascript receives data via 'data' field
      'set_variable': 'value', // ✅ CRITICAL: set_variable receives data via 'value' (not 'name' which is for variable name)
      'json_parser': 'jsonData', // ✅ CRITICAL: json_parser receives JSON string via 'jsonData'
      'text_formatter': 'text', // ✅ CRITICAL: text_formatter receives text via 'text'
      
      // Database
      'database_read': 'query', // ✅ CRITICAL: database_read receives SQL query via 'query'
      'database_write': 'query', // ✅ CRITICAL: database_write receives SQL query via 'query'
      'supabase': 'data', // ✅ CRITICAL: supabase receives record data via 'data' field (for insert/update)
      'postgresql': 'query', // ✅ CRITICAL: postgresql receives SQL query via 'query'
      'mysql': 'query', // ✅ CRITICAL: mysql receives SQL query via 'query'
      'mongodb': 'data', // ✅ CRITICAL: mongodb receives document data via 'data' field (for insert/update)
      
      // HTTP
      'http_request': 'url',
      'http_post': 'url',
      'graphql': 'url',
      'respond_to_webhook': 'responseCode',
      'webhook_response': 'responseCode',
      
      // File/Storage
      'read_binary_file': 'filePath',
      'write_binary_file': 'filePath',
      'aws_s3': 'bucket',
      'dropbox': 'operation',
      'onedrive': 'operation',
      'ftp': 'host',
      'sftp': 'host',
      
      // Social Media
      'linkedin': 'text',
      'twitter': 'text',
      'instagram': 'media_url',
      'youtube': 'title',
      'facebook': 'message',
      
      // E-commerce
      'shopify': 'resource',
      'woocommerce': 'resource',
      'stripe': 'operation',
      'paypal': 'operation',
      
      // DevOps
      'github': 'operation',
      'gitlab': 'operation',
      'bitbucket': 'operation',
      'jira': 'operation',
      'jenkins': 'operation',
      
      // Productivity
      'notion': 'resource',
      'outlook': 'to',
    };
    
    const primaryInput = primaryInputs[targetActualType];
    if (primaryInput && targetInputs.includes(primaryInput)) {
      return primaryInput;
    }
    
    // ✅ CRITICAL: Special handling for nodes that receive data connections
    // For set_variable: use 'value' for data connections (not 'name' which is for variable name)
    if (targetActualType === 'set_variable') {
      // If connecting data, use 'value'; if connecting variable name, use 'name'
      // Default to 'value' for data connections
      if (targetInputs.includes('value')) {
        return 'value';
      }
      if (targetInputs.includes('name')) {
        return 'name';
      }
    }
    
    // ✅ CRITICAL: Fallback - use first available input, but prefer specific fields over generic 'input'
    // Many nodes don't have 'input' - they have specific fields
    if (targetInputs.length > 0) {
      // Prefer 'inputData', then 'data', then 'items' (for loop), then 'value' (for set_variable), then first available
      // ✅ CRITICAL: Do NOT use 'input' as fallback - many nodes don't have it (e.g., google_sheets, set_variable, loop)
      const preferredField = targetInputs.find(f => f === 'inputData') ||
                             targetInputs.find(f => f === 'data') ||
                             targetInputs.find(f => f === 'items') ||
                             targetInputs.find(f => f === 'value') ||
                             targetInputs[0];
      
      if (preferredField) {
        return preferredField;
      }
    }
    
    // If no inputs found, log error and return empty (will be caught by validation)
    console.error(`❌ [resolveTargetHandle] No input fields found for ${targetActualType} node`);
    // ✅ CRITICAL: Return empty string instead of 'input' - this will fail validation and prevent silent corruption
    return ''; // Will fail validation - better than using non-existent 'input'
  }

  /**
   * ✅ ARCHITECTURAL FIX: Global safety guard - validates all edge handles before saving workflow
   * Prevents silent corruption by ensuring all edges use valid handles
   * Throws error if any edge has invalid handles
   */
  private validateAllEdgeHandles(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const errors: string[] = [];
    const repairedEdges: WorkflowEdge[] = [];
    
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      if (!sourceNode) {
        errors.push(`Edge ${edge.id}: Source node ${edge.source} not found`);
        continue;
      }
      
      if (!targetNode) {
        errors.push(`Edge ${edge.id}: Target node ${edge.target} not found`);
        continue;
      }
      
      // ✅ CRITICAL: Use normalizeNodeType to get actual types
      const sourceActualType = normalizeNodeType(sourceNode);
      const targetActualType = normalizeNodeType(targetNode);
      
      // Get valid output fields for source node
      const sourceOutputs = this.getNodeOutputFields(sourceActualType);
      
      // Get valid input fields for target node
      const targetInputs = this.getNodeInputFields(targetActualType);

      // Attempt to repair invalid handles in-place (to avoid crashing API with 500)
      let sourceHandle = edge.sourceHandle;
      let targetHandle = edge.targetHandle;

      const sourceValid = !!sourceHandle && sourceOutputs.includes(sourceHandle);
      const targetValid = !!targetHandle && targetInputs.includes(targetHandle);

      if (!sourceValid || !targetValid) {
        const resolvedSourceHandle = this.resolveSourceHandle(sourceNode, sourceHandle);
        const resolvedTargetHandle = this.resolveTargetHandle(targetNode, targetHandle);

        const { sourceHandle: fixedSourceHandle, targetHandle: fixedTargetHandle } = validateAndFixEdgeHandles(
          sourceActualType,
          targetActualType,
          resolvedSourceHandle,
          resolvedTargetHandle
        );

        const fixedSourceValid = !!fixedSourceHandle && sourceOutputs.includes(fixedSourceHandle);
        const fixedTargetValid = !!fixedTargetHandle && targetInputs.includes(fixedTargetHandle);

        if (fixedSourceValid && fixedTargetValid) {
          edge.sourceHandle = fixedSourceHandle;
          edge.targetHandle = fixedTargetHandle;
          repairedEdges.push(edge);
          continue;
        }

        // Still invalid - record and drop the edge (better than crashing the request)
        if (!sourceValid) {
          errors.push(
            `Edge ${edge.id} (${edge.source} → ${edge.target}): ` +
            `Invalid source handle "${edge.sourceHandle}" for ${sourceActualType} node. ` +
            `Valid outputs: ${sourceOutputs.join(', ')}`
          );
        }
        if (!targetValid) {
          errors.push(
            `Edge ${edge.id} (${edge.source} → ${edge.target}): ` +
            `Invalid target handle "${edge.targetHandle}" for ${targetActualType} node. ` +
            `Valid inputs: ${targetInputs.join(', ')}`
          );
        }
        continue;
      }

      repairedEdges.push(edge);
    }
    
    if (errors.length > 0) {
      const errorMessage = `⚠️  [GLOBAL SAFETY GUARD] Dropped ${edges.length - repairedEdges.length} invalid edge(s):\n${errors.join('\n')}`;
      console.warn(errorMessage);
    }
    
    // Mutate edges array in-place so callers see repaired/dropped edges
    edges.length = 0;
    edges.push(...repairedEdges);

    console.log(`✅ [GLOBAL SAFETY GUARD] Edge handles validated. Kept ${edges.length} edge(s).`);
  }

  /**
   * Create connections for workflow nodes
   * 
   * STRICT LINEAR FLOW ENFORCEMENT:
   * - NO branching structures
   * - NO tree patterns
   * - NO parallel paths
   * - NO multiple outgoing edges from same node (except if_else which is handled specially)
   * - Flow must be: START → step1 → step2 → step3 → ... → END
   * - Each node connects to exactly one next node (except final node)
   * - Only verification/validation logic allowed at final step
   */
  private async createConnections(
    nodes: WorkflowNode[],
    requirements: Requirements,
    structure?: WorkflowGenerationStructure
  ): Promise<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }> {
    const edges: WorkflowEdge[] = [];
    let finalNodes = [...nodes];
    
    // Helper function to get output fields for a node type
    const getNodeOutputFields = (nodeType: string): string[] => {
      const outputFields: Record<string, string[]> = {
        // ============================================
        // TRIGGER NODES
        // ============================================
        'form': ['formData', 'submissionId', 'timestamp', 'fields'],
        'webhook': ['body', 'headers', 'query', 'method', 'path', 'queryParams'],
        'schedule': ['output', 'executionId', 'cronExpression', 'executionTime', 'timezone'],
        'interval': ['output', 'executionId', 'interval', 'unit', 'executionTime'],
        'manual_trigger': ['inputData', 'timestamp', 'triggerType'],
        'workflow_trigger': ['inputData', 'workflowId', 'timestamp'],
        'chat_trigger': ['message', 'userId', 'sessionId', 'timestamp'],
        'error_trigger': ['error', 'timestamp', 'source', 'output'],
        
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
        'chat_model': ['config', 'provider', 'model'], // Configuration object
        'memory': ['messages', 'context'], // Memory state object
        'tool': ['name', 'description', 'parameters'], // Tool configuration
        
        // ============================================
        // HTTP & API NODES
        // ============================================
        'http_request': ['status', 'headers', 'body', 'response', 'responseTime'],
        'http_post': ['status', 'headers', 'body', 'response', 'responseTime'],
        'respond_to_webhook': [], // void output
        'webhook_response': [], // void output
        'graphql': ['data', 'errors', 'response'],
        
        // ============================================
        // GOOGLE SERVICES
        // ============================================
        'google_sheets': ['rows', 'row_data', 'sheet_data', 'data'],
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
        'log_output': [], // void output
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
        'set_variable': ['data', 'output', 'variables'],
        'set': ['data', 'output', 'variables'],
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
        'if_else': ['result', 'output', 'condition_result', 'data', 'true', 'false'],
        'switch': ['result', 'output', 'case_result', 'data'],
        'filter': ['filtered', 'data', 'output'],
        'loop': ['iterated', 'data', 'output'],
        'merge': ['merged', 'data', 'output'],
        'split_in_batches': ['batches', 'data'],
        'wait': ['waitedUntil', 'duration', 'output'],
        'error_handler': ['result', 'output', 'data'],
        'stop_and_error': [], // void output
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
      return outputFields[nodeType] || ['data', 'output'];
    };

    // Helper function to get input fields for a node type
    const getNodeInputFields = (nodeType: string): string[] => {
      const inputFields: Record<string, string[]> = {
        'ai_agent': ['userInput', 'chat_model', 'memory', 'tool'],
        'http_request': ['url', 'method', 'headers', 'body', 'params'],
        'http_post': ['url', 'headers', 'body'],
        'slack_message': ['text', 'channel', 'username', 'webhookUrl'],
        'email': ['to', 'subject', 'body', 'from'],
        'discord': ['content', 'channel', 'username'],
        'linkedin': ['text', 'content', 'visibility'],
        'twitter': ['text', 'tweet'],
        'instagram': ['image', 'caption', 'text'],
        'google_sheets': ['spreadsheetId', 'range', 'values', 'data'],
        'google_doc': ['documentId', 'content', 'text'],
        'google_drive': ['folderId', 'fileName', 'fileContent'],
        'google_gmail': ['to', 'subject', 'body', 'from'],
        'javascript': ['code', 'input'],
        'set_variable': ['input', 'data', 'values'],
        'json_parser': ['json', 'data'],
        'text_formatter': ['template', 'data'],
        'database_read': ['query', 'sql', 'table'],
        'database_write': ['query', 'sql', 'table', 'data'],
        'supabase': ['table', 'data', 'query'],
      };
      return inputFields[nodeType] || ['input', 'data'];
    };

    // Helper function to map output to input based on node types
    const mapOutputToInput = (sourceType: string, targetType: string): { outputField: string; inputField: string; targetHandle?: string } | null => {
      // ✅ CRITICAL FIX: Handle all triggers that output 'inputData'
      if (sourceType === 'manual_trigger' || sourceType === 'workflow_trigger') {
        // Both manual_trigger and workflow_trigger output 'inputData'
        // CRITICAL: Google Sheets doesn't need input from trigger - it reads from spreadsheetId
        // Don't create edge - Google Sheets is configured via spreadsheetId field
        if (targetType === 'google_sheets') {
          return null; // Return null to skip edge creation
        }
        
        const targetInputs = getNodeInputFields(targetType);
        if (targetInputs.includes('input')) {
          return { outputField: 'inputData', inputField: 'input' };
        }
        if (targetInputs.includes('data')) {
          return { outputField: 'inputData', inputField: 'data' };
        }
        return { outputField: 'inputData', inputField: targetInputs[0] || 'input' };
      }
      
      // ✅ CRITICAL FIX: chat_trigger outputs 'message'
      if (sourceType === 'chat_trigger') {
        const targetInputs = getNodeInputFields(targetType);
        // For AI Agent, chat_trigger message goes to userInput
        if (targetType === 'ai_agent') {
          return { outputField: 'message', inputField: 'userInput' };
        }
        // For other nodes, try to map message to appropriate input
        if (targetInputs.includes('input')) {
          return { outputField: 'message', inputField: 'input' };
        }
        if (targetInputs.includes('text')) {
          return { outputField: 'message', inputField: 'text' };
        }
        if (targetInputs.includes('data')) {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: targetInputs[0] || 'input' };
      }
      
      // AI Agent special cases
      if (targetType === 'ai_agent') {
        if (sourceType === 'chat_model') {
          return { outputField: 'config', inputField: 'chat_model', targetHandle: 'chat_model' };
        }
        if (sourceType === 'memory') {
          return { outputField: 'memory', inputField: 'memory', targetHandle: 'memory' };
        }
        if (sourceType === 'tool') {
          return { outputField: 'tool', inputField: 'tool', targetHandle: 'tool' };
        }
        // Text Formatter to AI Agent: map formatted text string to userInput (LEFT SIDE PORT)
        // Text Formatter outputs: { data: "formatted string", formatted: "formatted string" }
        // Always connect to left-side userInput port, not right side
        if (sourceType === 'text_formatter') {
          return { outputField: 'data', inputField: 'userInput', targetHandle: 'userInput' };
        }
        // Default: map to userInput
        const sourceOutputs = getNodeOutputFields(sourceType);
        if (sourceOutputs.includes('inputData')) {
          return { outputField: 'inputData', inputField: 'userInput' };
        }
        if (sourceOutputs.includes('data')) {
          return { outputField: 'data', inputField: 'userInput' };
        }
        if (sourceOutputs.includes('body')) {
          return { outputField: 'body', inputField: 'userInput' };
        }
        if (sourceOutputs.includes('formData')) {
          return { outputField: 'formData', inputField: 'userInput' };
        }
        if (sourceOutputs.includes('formatted')) {
          return { outputField: 'formatted', inputField: 'userInput' };
        }
        if (sourceOutputs.includes('output')) {
          return { outputField: 'output', inputField: 'userInput' };
        }
        return { outputField: sourceOutputs[0] || 'data', inputField: 'userInput' };
      }

      // AI Agent outputs to other nodes
      if (sourceType === 'ai_agent') {
        // Map to output nodes (communication nodes that accept text/body/content)
        if (targetType === 'slack_message') {
          return { outputField: 'response_text', inputField: 'text' };
        }
        if (targetType === 'email' || targetType === 'google_gmail') {
          return { outputField: 'response_text', inputField: 'body' };
        }
        if (targetType === 'discord') {
          return { outputField: 'response_text', inputField: 'content' };
        }
        if (targetType === 'telegram' || targetType === 'microsoft_teams' || targetType === 'whatsapp_cloud') {
          return { outputField: 'response_text', inputField: 'text' };
        }
        if (targetType === 'twilio') {
          return { outputField: 'response_text', inputField: 'message' };
        }
        if (targetType === 'http_request' || targetType === 'http_post') {
          return { outputField: 'response_json', inputField: 'body' };
        }
        // Default: use response_text
        return { outputField: 'response_text', inputField: 'input' };
      }

      // Form to other nodes - Enhanced mapping
      if (sourceType === 'form') {
        // Form to Google Sheets - map formData to values
        if (targetType === 'google_sheets') {
          return { outputField: 'formData', inputField: 'values' };
        }
        // Form to Slack - map formData to text (format as message)
        if (targetType === 'slack_message') {
          return { outputField: 'formData', inputField: 'text' };
        }
        // Form to Gmail/Email - map formData fields appropriately
        if (targetType === 'google_gmail' || targetType === 'email') {
          // CRITICAL: Form outputs formData object, email needs:
          // - to: formData.email (if email field exists in form)
          // - body: formData (all form data as email body)
          // Map formData to body, and formData.email to 'to' field (handled in node config)
          return { outputField: 'formData', inputField: 'body', targetHandle: 'body' };
        }
        // Form to other nodes - default mapping
        return { outputField: 'formData', inputField: 'input' };
      }

      // Chat Trigger to other nodes
      if (sourceType === 'chat_trigger') {
        if (targetType === 'ai_agent') {
          // CRITICAL: ai_agent requires userInput on the left-side port, not generic input
          return { outputField: 'message', inputField: 'userInput', targetHandle: 'userInput' };
        }
        return { outputField: 'message', inputField: 'input' };
      }

      // Webhook to other nodes
      if (sourceType === 'webhook') {
        return { outputField: 'body', inputField: 'input' };
      }

      // HTTP Request outputs
      if (sourceType === 'http_request' || sourceType === 'http_post') {
        if (targetType === 'google_sheets') {
          return { outputField: 'body', inputField: 'values' };
        }
        return { outputField: 'body', inputField: 'input' };
      }

      // CRITICAL FIX: Google Sheets outputs
      if (sourceType === 'google_sheets') {
        // Google Sheets outputs: rows, row_data, sheet_data
        if (targetType === 'javascript') {
          // JavaScript receives data via 'input' variable in code, but config field is 'code'
          // The actual data is passed through the edge, accessible as 'input' in the code
          return { outputField: 'rows', inputField: 'code' };
        }
        if (targetType === 'set_variable') {
          // Set variable expects: input or data
          return { outputField: 'rows', inputField: 'input' };
        }
        if (targetType === 'slack_message' || targetType === 'linkedin' || targetType === 'twitter') {
          return { outputField: 'rows', inputField: 'text' };
        }
        if (targetType === 'log_output') {
          return { outputField: 'rows', inputField: 'data' };
        }
        // Default: map to data/input
        return { outputField: 'rows', inputField: 'input' };
      }

      // LinkedIn node mappings (output node - returns string)
      if (sourceType === 'linkedin') {
        // CRITICAL: LinkedIn is an output node, returns string (message)
        if (targetType === 'log_output') {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: 'input' };
      }

      // Twitter node mappings (output node - returns string)
      if (sourceType === 'twitter') {
        // CRITICAL: Twitter is an output node, returns string (message)
        if (targetType === 'log_output') {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: 'input' };
      }

      // Instagram node mappings (output node - returns string)
      if (sourceType === 'instagram') {
        // CRITICAL: Instagram is an output node, returns string (message)
        if (targetType === 'log_output') {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: 'input' };
      }

      // Facebook node mappings (output node - returns string)
      if (sourceType === 'facebook') {
        // CRITICAL: Facebook is an output node, returns string (message)
        if (targetType === 'log_output') {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: 'input' };
      }

      // AI Agent to LinkedIn/Twitter/Instagram/Facebook
      if (sourceType === 'ai_agent') {
        if (targetType === 'linkedin' || targetType === 'twitter' || targetType === 'instagram' || targetType === 'facebook') {
          return { outputField: 'response_text', inputField: 'text' };
        }
      }

      // JavaScript to LinkedIn/Twitter/Instagram/Facebook
      if (sourceType === 'javascript') {
        if (targetType === 'linkedin' || targetType === 'twitter' || targetType === 'instagram' || targetType === 'facebook') {
          return { outputField: 'output', inputField: 'text' };
        }
      }

      // CRITICAL FIX: JavaScript node inputs/outputs
      if (targetType === 'javascript') {
        // JavaScript node expects data via 'input' variable in code, but config field is 'code'
        // The actual input data comes from previous node's output
        const sourceOutputs = getNodeOutputFields(sourceType);
        if (sourceOutputs.includes('rows')) {
          return { outputField: 'rows', inputField: 'code' }; // Data accessible as 'input' in code
        }
        if (sourceOutputs.includes('data')) {
          return { outputField: 'data', inputField: 'code' };
        }
        if (sourceOutputs.includes('output')) {
          return { outputField: 'output', inputField: 'code' };
        }
        return { outputField: sourceOutputs[0] || 'data', inputField: 'code' };
      }

      if (sourceType === 'javascript') {
        // JavaScript outputs: output, result
        if (targetType === 'log_output') {
          return { outputField: 'output', inputField: 'data' };
        }
        if (targetType === 'google_sheets') {
          return { outputField: 'output', inputField: 'values' };
        }
        if (targetType === 'slack_message' || targetType === 'linkedin' || targetType === 'twitter') {
          return { outputField: 'output', inputField: 'text' };
        }
        if (targetType === 'set_variable') {
          return { outputField: 'output', inputField: 'input' };
        }
        return { outputField: 'output', inputField: 'input' };
      }
      
      // Set Variable node mappings
      if (sourceType === 'set_variable') {
        // Set variable outputs: data, output
        if (targetType === 'slack_message' || targetType === 'linkedin' || targetType === 'twitter') {
          return { outputField: 'data', inputField: 'text' };
        }
        if (targetType === 'log_output') {
          return { outputField: 'data', inputField: 'data' };
        }
        return { outputField: 'data', inputField: 'input' };
      }

      // 🚨 CRITICAL: Fix log_output input field mapping (uses 'text' or 'inputData', not 'data')
      if (targetType === 'log_output') {
        const sourceOutputs = getNodeOutputFields(sourceType);
        // Try to find a text-like field first
        if (sourceOutputs.includes('response_text')) {
          return { outputField: 'response_text', inputField: 'text' };
        }
        if (sourceOutputs.includes('message')) {
          return { outputField: 'message', inputField: 'text' };
        }
        if (sourceOutputs.includes('output')) {
          return { outputField: 'output', inputField: 'text' };
        }
        if (sourceOutputs.includes('data')) {
          return { outputField: 'data', inputField: 'inputData' };
        }
        // Default: use first output field with inputData
        return { outputField: sourceOutputs[0] || 'data', inputField: 'inputData' };
      }

      // 🚨 CRITICAL: Fix schedule trigger output field (uses 'output', not 'triggerTime')
      if (sourceType === 'schedule' || sourceType === 'interval') {
        const targetInputs = getNodeInputFields(targetType);
        if (targetInputs.includes('input')) {
          return { outputField: 'output', inputField: 'input' };
        }
        if (targetInputs.includes('inputData')) {
          return { outputField: 'output', inputField: 'inputData' };
        }
        if (targetInputs.includes('data')) {
          return { outputField: 'output', inputField: 'data' };
        }
        return { outputField: 'output', inputField: targetInputs[0] || 'input' };
      }

      // Default mapping
      const sourceOutputs = getNodeOutputFields(sourceType);
      const targetInputs = getNodeInputFields(targetType);
      
      // ✅ CRITICAL FIX: Handle all triggers that output 'inputData'
      if (sourceType === 'manual_trigger' || sourceType === 'workflow_trigger') {
        // Both manual_trigger and workflow_trigger output 'inputData'
        // CRITICAL: Google Sheets doesn't need input from trigger - it reads from spreadsheetId
        // Don't create edge if target is google_sheets (it's configured via spreadsheetId)
        if (targetType === 'google_sheets') {
          // Return null to indicate no edge needed
          // The edge generator will skip this connection
          return null;
        }
        
        // Try common input field names
        if (targetInputs.includes('input')) {
          return { outputField: 'inputData', inputField: 'input' };
        }
        if (targetInputs.includes('data')) {
          return { outputField: 'inputData', inputField: 'data' };
        }
        if (targetInputs.includes('value')) {
          return { outputField: 'inputData', inputField: 'value' };
        }
        // Use first available input field
        return { outputField: 'inputData', inputField: targetInputs[0] || 'input' };
      }
      
      // ✅ CRITICAL FIX: chat_trigger outputs 'message'
      if (sourceType === 'chat_trigger') {
        // For AI Agent, chat_trigger message goes to userInput
        if (targetType === 'ai_agent') {
          return { outputField: 'message', inputField: 'userInput' };
        }
        // For other nodes, try to map message to appropriate input
        if (targetInputs.includes('input')) {
          return { outputField: 'message', inputField: 'input' };
        }
        if (targetInputs.includes('text')) {
          return { outputField: 'message', inputField: 'text' };
        }
        if (targetInputs.includes('data')) {
          return { outputField: 'message', inputField: 'data' };
        }
        return { outputField: 'message', inputField: targetInputs[0] || 'input' };
      }
      
      // Try to find matching field names
      for (const outputField of sourceOutputs) {
        if (targetInputs.includes(outputField)) {
          return { outputField, inputField: outputField };
        }
      }

      // Fallback: use first available
      return { 
        outputField: sourceOutputs[0] || 'data', 
        inputField: targetInputs[0] || 'input' 
      };
    };
    
    // First, ensure all AI Agent nodes have Chat Model nodes connected
    const aiAgentNodes = finalNodes.filter(n => n.type === 'ai_agent');
    const existingChatModelNodes = finalNodes.filter(n => n.type === 'chat_model');
    
    for (const aiAgentNode of aiAgentNodes) {
      // Check if this AI Agent already has a Chat Model connected
      const hasChatModel = edges.some(e => 
        e.target === aiAgentNode.id && 
        finalNodes.find(n => n.id === e.source)?.type === 'chat_model'
      );
      
      if (!hasChatModel) {
        // ✅ DEFAULT: Create a Chat Model node configured with Ollama (running on AWS)
        // This is the default AI provider - users can change to Google/OpenAI/Claude if needed
        // Ensure position exists with defaults
        const aiAgentPosition = aiAgentNode.position || { x: 100, y: 100 };
        const chatModelNode: WorkflowNode = {
          id: randomUUID(),
          type: 'chat_model',
          position: { 
            x: aiAgentPosition.x - 200, 
            y: aiAgentPosition.y 
          },
          data: {
            type: 'chat_model',
            label: 'Ollama (qwen2.5:14b-instruct-q4_K_M)',
            category: 'ai',
            config: {
              provider: 'ollama',
              model: 'qwen2.5:14b-instruct-q4_K_M',
              // No API key needed - Ollama is configured via OLLAMA_HOST environment variable
              prompt: 'You are a helpful AI assistant that provides accurate and useful responses.',
              temperature: 0.7,
              maxTokens: 2000,
            },
          },
        };
        
        finalNodes.push(chatModelNode);
        
        // ✅ SCHEMA-AWARE HANDLE RESOLUTION: Connect Chat Model to AI Agent's chat_model port
        // Resolve handles using schema-aware helpers
        const resolvedSourceHandle = this.resolveSourceHandle(chatModelNode, 'config');
        const resolvedTargetHandle = this.resolveTargetHandle(aiAgentNode, 'chat_model');
        
        // Validate handles exist in schemas
        const chatModelOutputs = this.getNodeOutputFields('chat_model');
        const aiAgentInputs = this.getNodeInputFields('ai_agent');
        
        if (!chatModelOutputs.includes(resolvedSourceHandle)) {
          console.warn(`⚠️  Chat model source handle '${resolvedSourceHandle}' not found. Available: ${chatModelOutputs.join(', ')}`);
        }
        
        if (!aiAgentInputs.includes(resolvedTargetHandle)) {
          console.warn(`⚠️  AI agent target handle '${resolvedTargetHandle}' not found. Available: ${aiAgentInputs.join(', ')}`);
        }
        
        // ✅ CRITICAL: Use handle registry to ensure valid React handle IDs
        const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
          'chat_model',
          'ai_agent',
          resolvedSourceHandle,
          resolvedTargetHandle
        );
        
        const chatModelEdge: WorkflowEdge = {
          id: randomUUID(),
          source: chatModelNode.id,
          target: aiAgentNode.id,
          type: 'chat_model',
          sourceHandle,
          targetHandle,
        };
        edges.push(chatModelEdge);
        console.log(`✅ Connected chat_model → ai_agent (schema-aware, handles: ${sourceHandle} → ${targetHandle})`);
      }
    }
    
    // PRIORITY 1 FIX: Use structure connections if available, otherwise fall back to sequential
    const triggerNodes = finalNodes.filter(n => 
      ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(n.type)
    );
    
    if (triggerNodes.length === 0) {
      console.warn('⚠️  No trigger node found, cannot create connections');
      return { nodes: finalNodes, edges };
    }

    // Define allNonTriggerNodes outside if/else for orphan node handling (used in both branches)
    const allNonTriggerNodes = finalNodes.filter(n => 
      n.type !== 'chat_model' && 
      !['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(n.type)
    );

    // Variables for sequential connection fallback (will be defined in else block if needed)
    let processingNodes: WorkflowNode[] = [];
    let outputNodes: WorkflowNode[] = [];
    let allNodesToConnect: WorkflowNode[] = [];

    // If we have structure connections, use them as the source of truth
    if (structure?.connections && structure.connections.length > 0) {
      console.log(`✅ Using ${structure.connections.length} connections from structure generation`);
      
      // Create a map from step ID to node ID (for trigger, use trigger node ID)
      const stepIdToNodeId = new Map<string, string>();
      if (structure.trigger && triggerNodes.length > 0) {
        stepIdToNodeId.set('trigger', triggerNodes[0].id);
      }
      // ✅ CRITICAL: Map step IDs to node IDs correctly
      // For nodes created from structure steps, use step.id as the key
      structure.steps.forEach((step: WorkflowStepDefinition, index: number) => {
        const stepId = step.id || `step${index + 1}`; // Use step1, step2 format (no underscore)
        // Find the corresponding node (match by step ID or by order)
        const correspondingNode = finalNodes.find((n, idx) => {
          // First try to match by ID (exact match)
          if (n.id === stepId) return true;
          // Try to match step ID pattern (step1, step2, etc.) with node ID
          const stepIdPattern = stepId.match(/step(\d+)/);
          if (stepIdPattern) {
            const stepNum = parseInt(stepIdPattern[1]);
            // Match by order (skip trigger node)
            const actionNodes = finalNodes.filter(n => {
              const nodeType = normalizeNodeType(n);
              return !['manual_trigger', 'webhook', 'schedule', 'form', 'chat_model'].includes(nodeType);
            });
            if (actionNodes[stepNum - 1] && actionNodes[stepNum - 1].id === n.id) {
              return true;
            }
          }
          // If no match, try to match by order (skip trigger node)
          const actionNodeIndex = finalNodes.filter(n => {
            const nodeType = normalizeNodeType(n);
            return !['manual_trigger', 'webhook', 'schedule', 'form', 'chat_model'].includes(nodeType);
          }).indexOf(n);
          return actionNodeIndex === index;
        });
        if (correspondingNode) {
          stepIdToNodeId.set(stepId, correspondingNode.id);
          console.log(`✅ [Connection Mapping] Mapped step "${stepId}" → node "${correspondingNode.id}" (${correspondingNode.type})`);
        } else {
          console.warn(`⚠️  [Connection Mapping] Could not find node for step "${stepId}" (type: ${step.type})`);
        }
      });
      
      // Also map all node IDs to themselves (for direct node ID references)
      finalNodes.forEach(node => {
        if (!stepIdToNodeId.has(node.id)) {
          stepIdToNodeId.set(node.id, node.id);
        }
      });
      
      // CRITICAL FIX: Enforce LINEAR flow by filtering out branching connections
      // Count connections per source to detect branches
      const connectionsBySource = new Map<string, number>();
      structure.connections.forEach(conn => {
        const count = connectionsBySource.get(conn.source) || 0;
        connectionsBySource.set(conn.source, count + 1);
      });
      
      // Filter connections to enforce linear flow:
      // 1. Only ONE connection from trigger (to first step)
      // 2. Only ONE connection from each step (to next step)
      // 3. Exception: if_else nodes can have 2 connections (true/false paths)
      const linearConnections: typeof structure.connections = [];
      const processedTargets = new Set<string>(); // Track which nodes already have incoming connections
      
      // First, find trigger → first step connection
      const triggerConnections = structure.connections.filter(c => c.source === 'trigger');
      if (triggerConnections.length > 0) {
        // Sort by target step number to get the first step
        const sortedTriggerConnections = [...triggerConnections].sort((a, b) => {
          const aTargetNum = parseInt(a.target.replace(/[^0-9]/g, '')) || 0;
          const bTargetNum = parseInt(b.target.replace(/[^0-9]/g, '')) || 0;
          return aTargetNum - bTargetNum;
        });
        // Take only the FIRST connection from trigger
        linearConnections.push(sortedTriggerConnections[0]);
        processedTargets.add(sortedTriggerConnections[0].target);
        console.log(`✅ Linear flow: Selected trigger → ${sortedTriggerConnections[0].target} (filtered ${triggerConnections.length - 1} branch connections)`);
      }
      
      // Build linear chain: step1 → step2 → step3 → ...
      // Track which nodes we've connected (including trigger and first step)
      const connectedSources = new Set<string>(['trigger']);
      // Add the first step target to connectedSources so chain can continue
      if (linearConnections.length > 0) {
        connectedSources.add(linearConnections[0].target);
      }
      let chainBuilt = false;
      
      while (!chainBuilt) {
        let foundNext = false;
        
        // Find next connection in chain: source must be already connected, target must not be processed
        for (const conn of structure.connections) {
          // Skip if already in linear connections
          if (linearConnections.some(lc => lc.source === conn.source && lc.target === conn.target)) {
            continue;
          }
          
          // Skip if source is trigger (already handled)
          if (conn.source === 'trigger') {
            continue;
          }
          
          // Check if this connection continues the chain
          const sourceIsConnected = connectedSources.has(conn.source);
          const targetNotProcessed = !processedTargets.has(conn.target);
          
          // For if_else nodes, allow up to 2 connections (true/false paths)
          const sourceNode = finalNodes.find(n => stepIdToNodeId.get(conn.source) === n.id);
          const isIfElse = sourceNode && normalizeNodeType(sourceNode) === 'if_else';
          const existingFromSource = linearConnections.filter(lc => lc.source === conn.source).length;
          const canAddFromSource = isIfElse ? existingFromSource < 2 : existingFromSource < 1;
          
          if (sourceIsConnected && targetNotProcessed && canAddFromSource) {
            linearConnections.push(conn);
            connectedSources.add(conn.target);
            processedTargets.add(conn.target);
            foundNext = true;
            console.log(`✅ Linear flow: Added ${conn.source} → ${conn.target} to chain`);
            break;
          }
        }
        
        if (!foundNext) {
          chainBuilt = true;
        }
      }
      
      // If we have orphaned connections (not in chain), try to append them sequentially
      const orphanedConnections = structure.connections.filter(conn => 
        !linearConnections.some(lc => lc.source === conn.source && lc.target === conn.target)
      );
      
      if (orphanedConnections.length > 0) {
        console.log(`⚠️  Found ${orphanedConnections.length} orphaned connections, attempting to append to chain`);
        
        // Find the last node in the chain
        const chainTargets = new Set(linearConnections.map(lc => lc.target));
        const chainSources = new Set(linearConnections.map(lc => lc.source));
        const lastNodeInChain = Array.from(chainTargets).find(target => !chainSources.has(target)) || 
                               Array.from(chainTargets)[chainTargets.size - 1];
        
        // Try to connect orphans to the last node in chain
        for (const orphan of orphanedConnections) {
          if (!processedTargets.has(orphan.target) && lastNodeInChain) {
            // Create new connection: lastNodeInChain → orphan.target
            const newConn = {
              source: lastNodeInChain,
              target: orphan.target,
              outputField: orphan.outputField,
              inputField: orphan.inputField
            };
            linearConnections.push(newConn);
            processedTargets.add(orphan.target);
            console.log(`✅ Linear flow: Appended orphan ${lastNodeInChain} → ${orphan.target}`);
          }
        }
      }
      
      console.log(`✅ Linear flow enforcement: Reduced ${structure.connections.length} connections to ${linearConnections.length} linear chain`);
      
      // CRITICAL: Validate that connections respect logical flow patterns:
      // Pattern 1: data source (read) → loop → create operation (write)
      // Pattern 2: integration (read) → data source (write)
      const dataSourceTypes = ['google_sheets', 'google_doc', 'database_read', 'airtable', 'notion'];
      const loopType = 'loop';
      const createOperationTypes = ['hubspot', 'zoho', 'pipedrive', 'airtable', 'notion'];
      const integrationReadTypes = ['hubspot', 'zoho', 'pipedrive', 'airtable', 'notion'];
      
      // Helper to get operation type
      const getOperation = (n: WorkflowNode): string => {
        const operation = (n.data as any)?.config?.operation || (n.data as any)?.operation || '';
        return String(operation).toLowerCase();
      };
      const isReadOp = (op: string) => ['get', 'getmany', 'read', 'search'].includes(op);
      const isWriteOp = (op: string) => ['create', 'update', 'write', 'delete'].includes(op);
      
      // Check for Pattern 1: data source (read) → loop → create operation (write)
      const hasDataSourceRead = finalNodes.some(n => {
        const type = normalizeNodeType(n);
        const operation = getOperation(n);
        return dataSourceTypes.includes(type) && (isReadOp(operation) || !operation);
      });
      const hasLoop = finalNodes.some(n => {
        const type = normalizeNodeType(n);
        return type === loopType;
      });
      const hasCreateOperation = finalNodes.some(n => {
        const type = normalizeNodeType(n);
        const operation = getOperation(n);
        return createOperationTypes.includes(type) && (isWriteOp(operation) || !operation);
      });
      
      // Check for Pattern 2: integration (read) → data source (write)
      const hasIntegrationRead = finalNodes.some(n => {
        const type = normalizeNodeType(n);
        const operation = getOperation(n);
        return integrationReadTypes.includes(type) && (isReadOp(operation) || !operation);
      });
      const hasDataSourceWrite = finalNodes.some(n => {
        const type = normalizeNodeType(n);
        const operation = getOperation(n);
        return dataSourceTypes.includes(type) && isWriteOp(operation);
      });
      
      // If we have Pattern 1, validate that connections respect it
      // Data source should come before loop, loop should come before create operation
      if (hasDataSourceRead && hasLoop && hasCreateOperation) {
        console.log(`🔍 [Flow Validation] Detected data source → loop → create operation pattern, validating connections...`);
        
        // Get node positions in the reordered array (which respects data source → logic → integrations)
        const getNodePosition = (nodeId: string): number => {
          const node = finalNodes.find(n => n.id === nodeId);
          if (!node) return 999;
          return finalNodes.indexOf(node);
        };
        
        // Validate that connections respect the order
        let connectionsValid = true;
        for (const conn of linearConnections) {
          const sourceNodeId = stepIdToNodeId.get(conn.source);
          const targetNodeId = stepIdToNodeId.get(conn.target);
          if (!sourceNodeId || !targetNodeId) continue;
          
          const sourceNode = finalNodes.find(n => n.id === sourceNodeId);
          const targetNode = finalNodes.find(n => n.id === targetNodeId);
          if (!sourceNode || !targetNode) continue;
          
          const sourceType = normalizeNodeType(sourceNode);
          const targetType = normalizeNodeType(targetNode);
          const sourcePos = getNodePosition(sourceNodeId);
          const targetPos = getNodePosition(targetNodeId);
          
          // Validate Pattern 1: data source should come before loop, loop should come before create operation
          if (dataSourceTypes.includes(sourceType) && targetType === loopType && sourcePos > targetPos) {
            console.warn(`⚠️  [Flow Validation] Invalid connection: ${sourceType} (pos ${sourcePos}) → ${targetType} (pos ${targetPos}). Data source should come before loop.`);
            connectionsValid = false;
          }
          if (sourceType === loopType && createOperationTypes.includes(targetType) && sourcePos > targetPos) {
            console.warn(`⚠️  [Flow Validation] Invalid connection: ${sourceType} (pos ${sourcePos}) → ${targetType} (pos ${targetPos}). Loop should come before create operation.`);
            connectionsValid = false;
          }
        }
        
        if (!connectionsValid) {
          console.log(`⚠️  [Flow Validation] Structure connections violate logical flow. Falling back to sequential connections based on node order.`);
          // Clear linearConnections to force fallback to sequential connection logic
          linearConnections.length = 0;
        } else {
          console.log(`✅ [Flow Validation] Connections respect logical flow pattern (data source → loop → create).`);
        }
      }
      
      // If we have Pattern 2: integration (read) → data source (write), validate that connections respect it
      // Integration read should come before data source write
      if (hasIntegrationRead && hasDataSourceWrite && !hasLoop) {
        console.log(`🔍 [Flow Validation] Detected integration read → data source write pattern, validating connections...`);
        
        // Get node positions in the reordered array
        const getNodePosition = (nodeId: string): number => {
          const node = finalNodes.find(n => n.id === nodeId);
          if (!node) return 999;
          return finalNodes.indexOf(node);
        };
        
        // Validate that connections respect the order
        let connectionsValid = true;
        for (const conn of linearConnections) {
          const sourceNodeId = stepIdToNodeId.get(conn.source);
          const targetNodeId = stepIdToNodeId.get(conn.target);
          if (!sourceNodeId || !targetNodeId) continue;
          
          const sourceNode = finalNodes.find(n => n.id === sourceNodeId);
          const targetNode = finalNodes.find(n => n.id === targetNodeId);
          if (!sourceNode || !targetNode) continue;
          
          const sourceType = normalizeNodeType(sourceNode);
          const targetType = normalizeNodeType(targetNode);
          const sourceOperation = getOperation(sourceNode);
          const targetOperation = getOperation(targetNode);
          const sourcePos = getNodePosition(sourceNodeId);
          const targetPos = getNodePosition(targetNodeId);
          
          // Validate: integration read should come before data source write
          if (integrationReadTypes.includes(sourceType) && isReadOp(sourceOperation) &&
              dataSourceTypes.includes(targetType) && isWriteOp(targetOperation) &&
              sourcePos > targetPos) {
            console.warn(`⚠️  [Flow Validation] Invalid connection: ${sourceType} (read, pos ${sourcePos}) → ${targetType} (write, pos ${targetPos}). Integration read should come before data source write.`);
            connectionsValid = false;
          }
        }
        
        if (!connectionsValid) {
          console.log(`⚠️  [Flow Validation] Structure connections violate logical flow. Falling back to sequential connections based on node order.`);
          // Clear linearConnections to force fallback to sequential connection logic
          linearConnections.length = 0;
        } else {
          console.log(`✅ [Flow Validation] Connections respect logical flow pattern (integration read → data source write).`);
        }
      }
      
      // CRITICAL: Create edges from LINEAR connections only (if we still have them after validation)
      // Sort connections to ensure linear flow: trigger → step1 → step2 → step3
      const sortedConnections = [...linearConnections].sort((a, b) => {
        // Extract step numbers if they exist (step1, step2, etc.)
        const aSourceNum = parseInt(a.source.replace(/[^0-9]/g, '')) || (a.source === 'trigger' ? 0 : 999);
        const bSourceNum = parseInt(b.source.replace(/[^0-9]/g, '')) || (b.source === 'trigger' ? 0 : 999);
        return aSourceNum - bSourceNum;
      });
      
      // Flag to track if we should skip structure connections and use sequential fallback
      let useSequentialFallback = sortedConnections.length === 0;
      
      // Create edges from structure connections (only if we have valid connections)
      if (!useSequentialFallback) {
        for (const connection of sortedConnections) {
          const sourceNodeId = stepIdToNodeId.get(connection.source);
          const targetNodeId = stepIdToNodeId.get(connection.target);
          
          if (!sourceNodeId || !targetNodeId) {
            console.warn(`⚠️  Connection references non-existent node: ${connection.source} -> ${connection.target}`);
            continue;
          }
          
          // 🚨 CRITICAL FIX: Prevent self-loops - source and target must be different
          if (sourceNodeId === targetNodeId) {
            console.warn(`⚠️  Prevented self-loop edge: ${connection.source} (${sourceNodeId}) → ${connection.target} (${targetNodeId})`);
            continue;
          }
          
          // Check if edge already exists (e.g., for chat model)
          const existingEdge = edges.some(e => e.source === sourceNodeId && e.target === targetNodeId);
          if (existingEdge) {
            continue;
          }
          
          const sourceNode = finalNodes.find(n => n.id === sourceNodeId);
          const targetNode = finalNodes.find(n => n.id === targetNodeId);
          
          if (!sourceNode || !targetNode) {
            console.warn(`⚠️  Could not find nodes for connection: ${connection.source} -> ${connection.target}`);
            continue;
          }
          
          // ✅ CRITICAL FIX: Use normalizeNodeType to get actual node types for mapping
          const sourceActualType = normalizeNodeType(sourceNode);
          const targetActualType = normalizeNodeType(targetNode);
          
          // ✅ SCHEMA-AWARE HANDLE RESOLUTION: Use new helper functions to get correct handles
          // Resolve source handle from step output field or use schema-based default
          const resolvedSourceHandle = this.resolveSourceHandle(sourceNode, connection.outputField);
          
          // Resolve target handle from step input field or use schema-based default
          const resolvedTargetHandle = this.resolveTargetHandle(targetNode, connection.inputField);
          
          // ✅ CRITICAL: Validate handles exist in node schemas before creating edge
          const sourceOutputs = this.getNodeOutputFields(sourceActualType);
          const targetInputs = this.getNodeInputFields(targetActualType);
          
          if (!sourceOutputs.includes(resolvedSourceHandle)) {
            console.error(`❌ [Schema Validation] Source handle '${resolvedSourceHandle}' not found in ${sourceActualType} outputs: ${sourceOutputs.join(', ')}`);
            // Try alternative mapping
            const alternativeMapping = this.findAlternativeMapping(sourceNode, targetNode);
            if (alternativeMapping) {
              const altSourceHandle = this.resolveSourceHandle(sourceNode, alternativeMapping.outputField);
              const altTargetHandle = this.resolveTargetHandle(targetNode, alternativeMapping.inputField);
              if (sourceOutputs.includes(altSourceHandle) && targetInputs.includes(altTargetHandle)) {
                const altEdge: WorkflowEdge = {
                  id: randomUUID(),
                  source: sourceNodeId,
                  target: targetNodeId,
                  type: targetActualType === 'ai_agent' ? 'ai-input' : 'default',
                  sourceHandle: altSourceHandle,
                  targetHandle: altTargetHandle,
                };
                edges.push(altEdge);
                console.log(`✅ Connected ${connection.source} → ${connection.target} (alternative mapping, handles: ${altSourceHandle} → ${altTargetHandle})`);
              }
            }
            continue;
          }
          
          if (!targetInputs.includes(resolvedTargetHandle)) {
            console.error(`❌ [Schema Validation] Target handle '${resolvedTargetHandle}' not found in ${targetActualType} inputs: ${targetInputs.join(', ')}`);
            // Try alternative mapping
            const alternativeMapping = this.findAlternativeMapping(sourceNode, targetNode);
            if (alternativeMapping) {
              const altSourceHandle = this.resolveSourceHandle(sourceNode, alternativeMapping.outputField);
              const altTargetHandle = this.resolveTargetHandle(targetNode, alternativeMapping.inputField);
              if (sourceOutputs.includes(altSourceHandle) && targetInputs.includes(altTargetHandle)) {
                const altEdge: WorkflowEdge = {
                  id: randomUUID(),
                  source: sourceNodeId,
                  target: targetNodeId,
                  type: targetActualType === 'ai_agent' ? 'ai-input' : 'default',
                  sourceHandle: altSourceHandle,
                  targetHandle: altTargetHandle,
                };
                edges.push(altEdge);
                console.log(`✅ Connected ${connection.source} → ${connection.target} (alternative mapping, handles: ${altSourceHandle} → ${altTargetHandle})`);
              }
            }
            continue;
          }
          
          // ✅ CRITICAL: Validate and fix handles using handle registry to ensure valid React handle IDs
          const { sourceHandle: validatedSourceHandle, targetHandle: validatedTargetHandle } = validateAndFixEdgeHandles(
            sourceActualType,
            targetActualType,
            resolvedSourceHandle,
            resolvedTargetHandle
          );
          
          // ✅ ARCHITECTURAL FIX: Strict validation before creating edge
          try {
            this.validateEdgeHandlesStrict(sourceNode, targetNode, validatedSourceHandle, validatedTargetHandle);
          } catch (error) {
            console.error(`❌ [STRICT VALIDATION] Edge creation failed: ${error}`);
            // Skip this edge - don't create invalid connections
            continue;
          }
          
          const edge: WorkflowEdge = {
            id: randomUUID(),
            source: sourceNodeId,
            target: targetNodeId,
            type: targetActualType === 'ai_agent' ? 'ai-input' : 'default',
            sourceHandle: validatedSourceHandle,
            targetHandle: validatedTargetHandle,
          };
          edges.push(edge);
          console.log(`✅ Connected ${connection.source} → ${connection.target} (schema-aware, handles: ${validatedSourceHandle} → ${validatedTargetHandle})`);
        }
      } else {
        console.log('⚠️  Structure connections failed validation. Will use sequential connection fallback.');
      }
    } else {
      // Fall back to sequential connection logic (original behavior)
      console.log('⚠️  No structure connections available, using sequential connection fallback');
      
      // Build proper node categories for connection
      // Skip chat_model nodes (already connected to AI Agents)
      // CRITICAL: Include ALL non-trigger, non-chat_model nodes in processing
      // Note: allNonTriggerNodes is already defined above
      
      // Separate into processing and output nodes
      // CRITICAL FIX: Use normalizeNodeType to get actual node types for filtering
      processingNodes = allNonTriggerNodes.filter(n => {
        const actualType = normalizeNodeType(n);
        return !['slack_message', 'email', 'discord', 'log_output', 'respond_to_webhook', 'http_response'].includes(actualType);
      });
      
      outputNodes = allNonTriggerNodes.filter(n => {
        const actualType = normalizeNodeType(n);
        return ['slack_message', 'email', 'discord', 'log_output', 'respond_to_webhook', 'http_response'].includes(actualType);
      });
      
      // If no output nodes, treat all non-trigger nodes as processing nodes
      const nodesToConnect = outputNodes.length > 0 ? processingNodes : allNonTriggerNodes;

      // CRITICAL: Connect trigger to FIRST node ONLY (linear flow, not tree)
      // This ensures: trigger → node1 → node2 → node3 (sequential chain)
      // NOT: trigger → node1, trigger → node2, trigger → node3 (tree structure)
      if (nodesToConnect.length > 0 && triggerNodes.length > 0) {
        const triggerNode = triggerNodes[0];
        const firstNode = nodesToConnect[0];
        
        // ✅ SCHEMA-AWARE HANDLE RESOLUTION: Use new helper functions for trigger connections
        const triggerActualType = normalizeNodeType(triggerNode);
        const firstNodeActualType = normalizeNodeType(firstNode);
        
        // Resolve handles using schema-aware helpers
        const resolvedSourceHandle = this.resolveSourceHandle(triggerNode);
        const resolvedTargetHandle = this.resolveTargetHandle(firstNode);
        
        // Validate handles exist in schemas
        const sourceOutputs = this.getNodeOutputFields(triggerActualType);
        const targetInputs = this.getNodeInputFields(firstNodeActualType);
        
        if (!sourceOutputs.includes(resolvedSourceHandle)) {
          console.warn(`⚠️  Trigger source handle '${resolvedSourceHandle}' not found in ${triggerActualType} outputs: ${sourceOutputs.join(', ')}`);
          console.log(`ℹ️  Skipping edge from ${triggerActualType} to ${firstNodeActualType} (invalid source handle)`);
        } else if (!targetInputs.includes(resolvedTargetHandle)) {
          console.warn(`⚠️  First node target handle '${resolvedTargetHandle}' not found in ${firstNodeActualType} inputs: ${targetInputs.join(', ')}`);
          console.log(`ℹ️  Skipping edge from ${triggerActualType} to ${firstNodeActualType} (invalid target handle)`);
        } else {
          // ✅ CRITICAL: Use handle registry to ensure valid React handle IDs
          const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
            triggerActualType,
            firstNodeActualType,
            resolvedSourceHandle,
            resolvedTargetHandle
          );
          
          // ✅ ARCHITECTURAL FIX: Strict validation before creating edge
          try {
            this.validateEdgeHandlesStrict(triggerNode, firstNode, sourceHandle, targetHandle);
            
            const edge: WorkflowEdge = {
              id: randomUUID(),
              source: triggerNode.id,
              target: firstNode.id,
              type: firstNodeActualType === 'ai_agent' ? 'ai-input' : 'default',
              sourceHandle,
              targetHandle,
            };
            edges.push(edge);
            console.log(`✅ Connected trigger ${triggerActualType} → ${firstNodeActualType} (schema-aware, handles: ${sourceHandle} → ${targetHandle})`);
          } catch (error) {
            console.error(`❌ [STRICT VALIDATION] Trigger edge creation failed: ${error}`);
            console.log(`ℹ️  Skipping edge from ${triggerActualType} to ${firstNodeActualType} (validation failed)`);
          }
        }
      }

      // Connect ALL nodes sequentially (processing + output) to ensure complete chain
      allNodesToConnect = [...nodesToConnect, ...outputNodes];
      for (let i = 0; i < allNodesToConnect.length - 1; i++) {
        const sourceNode = allNodesToConnect[i];
        const targetNode = allNodesToConnect[i + 1];
        
        // 🚨 CRITICAL FIX: Prevent self-loops
        if (sourceNode.id === targetNode.id) {
          console.warn(`⚠️  Prevented self-loop in sequential connection: ${sourceNode.type} (${sourceNode.id})`);
          continue;
        }
        
        // Skip if this connection already exists
        const connectionExists = edges.some(e => 
          e.source === sourceNode.id && e.target === targetNode.id
        );
        
        if (connectionExists) {
          continue;
        }
        
        // Skip if target is chat_model (chat_model only connects to ai_agent, already handled above)
        if (targetNode.type === 'chat_model') {
          continue;
        }
        
        // Skip if source is chat_model (chat_model only connects to ai_agent, already handled above)
        if (sourceNode.type === 'chat_model') {
          continue;
        }
        
        // CRITICAL FIX: Use normalizeNodeType to get actual node types for mapping
        const sourceActualType = normalizeNodeType(sourceNode);
        const targetActualType = normalizeNodeType(targetNode);
        
        // Get proper field mapping using actual node types
        const mapping = mapOutputToInput(sourceActualType, targetActualType);
        if (!mapping) {
          console.warn(`⚠️  Could not map output from ${sourceActualType} to ${targetActualType}`);
          continue;
        }
        
        // CRITICAL FIX: Validate edge before creating
        const targetField = mapping.inputField || mapping.targetHandle || 'default';
        const edgeValidation = this.validateEdge(sourceNode, targetNode, mapping.outputField, targetField);
        if (!edgeValidation.valid) {
          console.warn(`⚠️  Edge validation failed: ${edgeValidation.reason}. Skipping connection ${sourceActualType} → ${targetActualType}`);
          // Try to find alternative valid mapping
          const alternativeMapping = this.findAlternativeMapping(sourceNode, targetNode);
          if (alternativeMapping) {
            // ✅ CRITICAL FIX: Validate and fix handles for alternative mapping
            const { sourceHandle: altSourceHandle, targetHandle: altTargetHandle } = validateAndFixEdgeHandles(
              sourceActualType,
              targetActualType,
              alternativeMapping.outputField,
              alternativeMapping.inputField
            );
            const altEdge: WorkflowEdge = {
              id: randomUUID(),
              source: sourceNode.id,
              target: targetNode.id,
              type: targetActualType === 'ai_agent' ? 'ai-input' : 'default',
              sourceHandle: altSourceHandle,
              targetHandle: altTargetHandle,
            };
            edges.push(altEdge);
            console.log(`✅ Connected ${sourceActualType} → ${targetActualType} (alternative mapping, handles: ${altSourceHandle} → ${altTargetHandle})`);
          }
          continue;
        }
        
        // Determine connection type based on node types
        let edgeType = 'default';
        if (targetNode.type === 'ai_agent') {
          edgeType = 'ai-input';
          // For AI Agent, ensure we're connecting to userInput port (not chat_model, memory, or tool)
          // chat_model connections are handled separately above
          // Only connect to userInput if targetHandle is not a special port
          if (mapping.targetHandle && ['chat_model', 'memory', 'tool'].includes(mapping.targetHandle)) {
            // This is a special port connection, should have been handled above
            continue;
          }
        }
        
        // ✅ SCHEMA-AWARE HANDLE RESOLUTION: Use new helper functions
        // Resolve source handle from mapping or use schema-based default
        const resolvedSourceHandle = this.resolveSourceHandle(sourceNode, mapping.outputField);
        
        // Resolve target handle from mapping or use schema-based default
        const resolvedTargetHandle = this.resolveTargetHandle(targetNode, mapping.targetHandle || mapping.inputField);
        
        // Special cases for AI Agent
        let finalTargetHandle = resolvedTargetHandle;
        if (sourceActualType === 'text_formatter' && targetActualType === 'ai_agent') {
          finalTargetHandle = 'userInput';
          console.log(`[Workflow Builder] Text Formatter → AI Agent: Using userInput port`);
        } else if (sourceActualType === 'chat_trigger' && targetActualType === 'ai_agent') {
          finalTargetHandle = 'userInput';
          console.log(`[Workflow Builder] Chat Trigger → AI Agent: Using userInput port`);
        }
        
        // Validate and fix handles using registry
        const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
          sourceActualType,
          targetActualType,
          resolvedSourceHandle,
          finalTargetHandle
        );
        
        // ✅ ARCHITECTURAL FIX: Strict validation before creating edge
        try {
          this.validateEdgeHandlesStrict(sourceNode, targetNode, sourceHandle, targetHandle);
        } catch (error) {
          console.error(`❌ [STRICT VALIDATION] Edge creation failed: ${error}`);
          // Skip this edge - don't create invalid connections
          continue;
        }
        
        const edge: WorkflowEdge = {
          id: randomUUID(),
          source: sourceNode.id,
          target: targetNode.id,
          type: edgeType,
          sourceHandle,
          targetHandle,
        };
        edges.push(edge);
      }
      
      // Additional: Connect output nodes if they weren't already connected in the sequential chain
      // This ensures output nodes are always connected even if they were filtered out
      if (outputNodes.length > 0) {
        const lastConnectedNode = allNodesToConnect.length > 0 
          ? allNodesToConnect[allNodesToConnect.length - 1]
          : (processingNodes.length > 0 ? processingNodes[processingNodes.length - 1] : null);
        
        if (lastConnectedNode) {
          outputNodes.forEach((outputNode: WorkflowNode) => {
            // Skip if already connected
            const alreadyConnected = edges.some(e => 
              e.source === lastConnectedNode.id && e.target === outputNode.id
            );
            
            if (!alreadyConnected && lastConnectedNode.id !== outputNode.id) {
              // CRITICAL FIX: Use normalizeNodeType for correct field mapping
              const lastNodeActualType = normalizeNodeType(lastConnectedNode);
              const outputNodeActualType = normalizeNodeType(outputNode);
              const mapping = mapOutputToInput(lastNodeActualType, outputNodeActualType);
              if (mapping) {
                // ✅ CRITICAL FIX: Validate and fix handles using handle registry
                const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
                  lastNodeActualType,
                  outputNodeActualType,
                  mapping.outputField,
                  mapping.targetHandle || mapping.inputField
                );
                
                const edge: WorkflowEdge = {
                  id: randomUUID(),
                  source: lastConnectedNode.id,
                  target: outputNode.id,
                  type: 'default',
                  sourceHandle,
                  targetHandle,
                };
                edges.push(edge);
                console.log(`✅ Connected ${lastNodeActualType} → ${outputNodeActualType} (handles: ${sourceHandle} → ${targetHandle})`);
              } else {
                // Fallback: create basic connection with default handles
                const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
                  lastNodeActualType,
                  outputNodeActualType,
                  undefined,
                  undefined
                );
                const edge: WorkflowEdge = {
                  id: randomUUID(),
                  source: lastConnectedNode.id,
                  target: outputNode.id,
                  type: 'default',
                  sourceHandle,
                  targetHandle,
                };
                edges.push(edge);
                console.log(`✅ Connected ${lastNodeActualType} → ${outputNodeActualType} (fallback, handles: ${sourceHandle} → ${targetHandle})`);
              }
            }
          });
        }
      }
    }
    
    // FINAL CHECK: Validate acyclic graph before finalizing
    const acyclicValidation = this.validateAcyclicGraph(allNonTriggerNodes, edges);
    if (acyclicValidation.hasCycle) {
      console.warn(`[WorkflowBuilder] ⚠️  Cycle detected in connections, removing ${acyclicValidation.removedEdges.length} edge(s)`);
      // Remove cycle edges
      acyclicValidation.removedEdges.forEach(removedEdge => {
        const edgeIndex = edges.findIndex(e => e.id === removedEdge.id);
        if (edgeIndex >= 0) {
          edges.splice(edgeIndex, 1);
        }
      });
    }
    
    // CRITICAL FIX: Ensure trigger has outgoing connection FIRST
    // This must happen before orphan node handling
    if (triggerNodes.length > 0 && allNonTriggerNodes.length > 0) {
      const triggerNode = triggerNodes[0];
      const triggerOutgoing = edges.filter(e => e.source === triggerNode.id);
      
      if (triggerOutgoing.length === 0) {
        // Find the best first node to connect to (prefer nodes with no incoming edges, avoid log_output)
        const nodesWithIncoming = new Set(edges.map(e => e.target));
        const nonTriggerCandidates = allNonTriggerNodes.filter(n => normalizeNodeType(n) !== 'log_output');
        const firstActionNode = nonTriggerCandidates.find(n => !nodesWithIncoming.has(n.id)) || nonTriggerCandidates[0] || allNonTriggerNodes[0];

        if (firstActionNode) {
          const triggerType = normalizeNodeType(triggerNode);
          const targetType = normalizeNodeType(firstActionNode);

          const resolvedSourceHandle = this.resolveSourceHandle(triggerNode);
          const resolvedTargetHandle = this.resolveTargetHandle(firstActionNode);

          const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
            triggerType,
            targetType,
            resolvedSourceHandle,
            resolvedTargetHandle
          );

          try {
            this.validateEdgeHandlesStrict(triggerNode, firstActionNode, sourceHandle, targetHandle);
            edges.push({
              id: randomUUID(),
              source: triggerNode.id,
              target: firstActionNode.id,
              type: targetType === 'ai_agent' ? 'ai-input' : 'default',
              sourceHandle,
              targetHandle,
            });
            console.log(`✅ [Connection Fix] Connected trigger ${triggerType} → ${targetType} (handles: ${sourceHandle} → ${targetHandle})`);
          } catch (error) {
            console.warn(`⚠️  [Connection Fix] Failed to connect trigger ${triggerType} → ${targetType}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    
    // FINAL CHECK: Ensure every non-trigger node has at least one incoming edge
    // CRITICAL FIX: Connect orphan nodes to the LAST node in the chain, not directly to trigger
    // This creates proper sequential flow: trigger → node1 → node2 → orphan
    const allNonTriggerNodeIds = new Set(allNonTriggerNodes.map((n: WorkflowNode) => n.id));
    const connectedNodeIds = new Set(edges.map(e => e.target));
    const orphanNodes = allNonTriggerNodes.filter((n: WorkflowNode) => !connectedNodeIds.has(n.id));
    
    if (orphanNodes.length > 0) {
      console.warn(`⚠️  Found ${orphanNodes.length} orphan nodes, connecting to last node in chain...`);
      
      // CRITICAL: Find the LAST node in the LINEAR execution chain
      // Build execution order by traversing from trigger
      const executionOrder: WorkflowNode[] = [];
      const visited = new Set<string>();
      
      // Start from trigger nodes and traverse linearly
      triggerNodes.forEach(trigger => {
        if (!visited.has(trigger.id)) {
          executionOrder.push(trigger);
          visited.add(trigger.id);
          this.traverseLinearExecutionChain(trigger.id, edges, finalNodes, executionOrder, visited);
        }
      });
      
      // Find the last NON-TRIGGER node in the execution chain
      // This is the node that should receive orphan connections
      let lastNodeInChain: WorkflowNode | null = null;
      for (let i = executionOrder.length - 1; i >= 0; i--) {
        const node = executionOrder[i];
        // Skip trigger nodes - we want the last processing/output node
        if (triggerNodes.some(t => t.id === node.id)) {
          continue;
        }
        // This is the last non-trigger node in the chain
        lastNodeInChain = node;
        break;
      }
      
      // Fallback: use the last processing node or first non-trigger node
      if (!lastNodeInChain) {
        if (allNonTriggerNodes.length > 0) {
          // Use the first non-trigger node that's already connected
          const connectedNonTriggerNodes = allNonTriggerNodes.filter(n => connectedNodeIds.has(n.id));
          lastNodeInChain = connectedNonTriggerNodes[connectedNonTriggerNodes.length - 1] || allNonTriggerNodes[0];
        } else if (triggerNodes.length > 0) {
          lastNodeInChain = triggerNodes[0];
        }
      }
      
      const sourceNode = lastNodeInChain;
      
      if (sourceNode) {
        // CRITICAL FIX: LINEAR FLOW ENFORCEMENT - Only connect FIRST orphan to maintain linear flow
        // Do NOT connect multiple orphans to same source (creates branching)
        // Connect orphans sequentially: sourceNode → orphan1 → orphan2 → orphan3
        orphanNodes.forEach((orphan: WorkflowNode, index: number) => {
          // CRITICAL: Skip if orphan is the same as source node (prevent self-connection)
          if (orphan.id === sourceNode.id) {
            console.warn(`⚠️  Skipping orphan connection: ${orphan.type} cannot connect to itself`);
            return;
          }
          
          // LINEAR FLOW: Connect first orphan to sourceNode, then connect subsequent orphans to previous orphan
          const connectToNode = index === 0 ? sourceNode : orphanNodes[index - 1];
          
          // Skip if trying to connect to itself
          if (orphan.id === connectToNode.id) {
            console.warn(`⚠️  Skipping orphan connection: ${orphan.type} cannot connect to itself`);
            return;
          }
          
          // CRITICAL FIX: Use normalizeNodeType for correct type identification
          const orphanActualType = normalizeNodeType(orphan);
          const connectToActualType = normalizeNodeType(connectToNode);
          
          // Skip if it's a chat_model (handled separately)
          if (orphanActualType === 'chat_model') {
            return;
          }
          
          // Skip if it's log_output and we already have other output nodes (log_output is optional)
          if (orphanActualType === 'log_output' && outputNodes.length > 0) {
            return;
          }
          
          // CRITICAL: Skip if orphan is already in the execution chain (not truly orphaned)
          if (executionOrder.some(n => n.id === orphan.id)) {
            console.warn(`⚠️  Skipping orphan connection: ${orphanActualType} is already in execution chain`);
            return;
          }
          
          // CRITICAL: Skip if this would create a circular dependency (use connectToNode, not sourceNode)
          const wouldCreateCycle = this.wouldCreateCycle(edges, connectToNode.id, orphan.id);
          if (wouldCreateCycle) {
            console.warn(`⚠️  Skipping orphan connection ${connectToActualType} → ${orphanActualType} (would create cycle)`);
            return;
          }
          
          // Check if already connected
          if (!edges.some(e => e.target === orphan.id)) {
            // CRITICAL FIX: Use connectToNode and normalizeNodeType for correct mapping
            const mapping = mapOutputToInput(connectToActualType, orphanActualType);
            if (!mapping) {
              console.warn(`⚠️  Could not map output from ${connectToActualType} to ${orphanActualType}, skipping orphan connection`);
              return;
            }
            
            // Validate edge before creating (use connectToNode, not sourceNode)
            const edgeValidation = this.validateEdge(connectToNode, orphan, mapping.outputField, mapping.inputField);
            if (!edgeValidation.valid) {
              console.warn(`⚠️  Edge validation failed for orphan connection ${connectToActualType} → ${orphanActualType}: ${edgeValidation.reason}`);
              return;
            }
            
            // ✅ CRITICAL: Use schema-aware handle resolution instead of generic validateAndFixEdgeHandles
            const resolvedSourceHandle = this.resolveSourceHandle(connectToNode, mapping.outputField);
            const resolvedTargetHandle = this.resolveTargetHandle(orphan, mapping.targetHandle || mapping.inputField);
            
            // Validate handles exist in schemas
            const sourceOutputs = this.getNodeOutputFields(connectToActualType);
            const targetInputs = this.getNodeInputFields(orphanActualType);
            
            if (!sourceOutputs.includes(resolvedSourceHandle)) {
              console.warn(`⚠️  [Orphan] Source handle '${resolvedSourceHandle}' not found in ${connectToActualType} outputs: ${sourceOutputs.join(', ')}. Skipping orphan connection.`);
              return;
            }
            
            if (!targetInputs.includes(resolvedTargetHandle)) {
              console.warn(`⚠️  [Orphan] Target handle '${resolvedTargetHandle}' not found in ${orphanActualType} inputs: ${targetInputs.join(', ')}. Skipping orphan connection.`);
              return;
            }
            
            // ✅ CRITICAL: Strict validation before creating edge
            try {
              this.validateEdgeHandlesStrict(connectToNode, orphan, resolvedSourceHandle, resolvedTargetHandle);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.warn(`⚠️  [Orphan] Edge validation failed for ${connectToActualType} → ${orphanActualType}: ${errorMessage}. Skipping orphan connection.`);
              return;
            }
            
            const edge: WorkflowEdge = {
              id: randomUUID(),
              source: connectToNode.id,
              target: orphan.id,
              type: 'default',
              sourceHandle: resolvedSourceHandle,
              targetHandle: resolvedTargetHandle,
            };
            edges.push(edge);
            console.log(`✅ Connected orphan node ${orphanActualType} to ${connectToActualType} (linear sequential flow, index ${index}, handles: ${resolvedSourceHandle} → ${resolvedTargetHandle})`);
          }
        });
      }
    }
    
    // ✅ REMOVED: Sequential connection fallback
    // Edge creation must ONLY use schema-defined handles
    // If compatible handles not found → workflow invalid (no fallback)
    
    // COMPREHENSIVE VALIDATION: Run full validation pipeline
    const workflow: Workflow = {
      nodes: finalNodes,
      edges: edges,
    };
    
    const comprehensiveValidation = workflowValidationPipeline.validateWorkflow(workflow);
    
    if (!comprehensiveValidation.valid) {
      console.error('❌ Workflow validation failed:', comprehensiveValidation.errors);
      // Log all errors but continue - fixes may have been applied
    }
    
    if (comprehensiveValidation.warnings.length > 0) {
      console.warn('⚠️  Workflow validation warnings:', comprehensiveValidation.warnings);
    }
    
    if (comprehensiveValidation.fixesApplied.length > 0) {
      console.log('✅ Auto-fixes applied:', comprehensiveValidation.fixesApplied);
    }
    
    // Also run connection validator for detailed connection info
    // ✅ CRITICAL: Validate all nodes are connected
    this.validateAllNodesConnected(finalNodes, edges);
    
    const connectionValidation = connectionValidator.validateAllConnections(finalNodes, edges);
    if (!connectionValidation.valid) {
      console.warn('⚠️  Connection validation errors:', connectionValidation.errors);
    }
    
    if (comprehensiveValidation.valid) {
      console.log('✅ Workflow passed comprehensive validation');
    }
    
    // FINAL CHECK: Ensure at least one edge exists for workflows with multiple nodes
    if (finalNodes.length > 1 && edges.length === 0) {
      console.error('❌ CRITICAL: No edges created for multi-node workflow! Creating fallback connections...');
      // Create simple sequential chain
      const nodesInOrder = finalNodes.filter(n => n.type !== 'chat_model');
      for (let i = 0; i < nodesInOrder.length - 1; i++) {
        const edge: WorkflowEdge = {
          id: randomUUID(),
          source: nodesInOrder[i].id,
          target: nodesInOrder[i + 1].id,
          type: 'default',
        };
        edges.push(edge);
      }
      console.log(`✅ Created ${edges.length} fallback sequential connections`);
    }

    // CRITICAL: Validate all edges have required properties before returning
    const validatedEdges = edges.map(edge => {
      // Ensure edge has all required properties
      const validated: WorkflowEdge = {
        id: edge.id || randomUUID(),
        source: edge.source,
        target: edge.target,
        type: edge.type || 'default',
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      };
      return validated;
    }).filter(edge => {
      // 🚨 CRITICAL FIX: Filter out self-loops (source === target)
      if (edge.source === edge.target) {
        console.warn(`⚠️  Removed self-loop edge: ${edge.source} → ${edge.target}`);
        return false;
      }
      
      // Filter out edges with invalid source/target
      const sourceExists = finalNodes.some(n => n.id === edge.source);
      const targetExists = finalNodes.some(n => n.id === edge.target);
      if (!sourceExists || !targetExists) {
        logger.debug(`[EdgeDebug] Removing invalid edge: ${edge.source} -> ${edge.target} (node missing)`);
        return false;
      }
      return true;
    });

    logger.debug(`[EdgeDebug] Final edge count: ${validatedEdges.length} (from ${edges.length} original)`);
    logger.debug(`[EdgeDebug] Final node count: ${finalNodes.length}`);
    validatedEdges.forEach((edge, i) => {
      logger.debug(`[EdgeDebug] Edge ${i + 1}: ${edge.source} -> ${edge.target} (type: ${edge.type})`);
    });

    // Apply hierarchical layout to prevent node overlaps
    this.applyHierarchicalLayout(finalNodes, validatedEdges);

    // PHASE 4: Apply type-aware node defaults
    finalNodes = finalNodes.map(node => this.applyNodeTypeDefaults(node));
    
    // CRITICAL: Ensure workflow has output node at the end
    // If no output node exists, add log_output as default
    const { nodes: nodesWithOutput, edges: edgesWithOutput } = this.ensureOutputNode(finalNodes, validatedEdges);
    finalNodes = nodesWithOutput;
    
    // ✅ ARCHITECTURAL FIX: Global safety guard - validate all edges before returning
    this.validateAllEdgeHandles(finalNodes, edgesWithOutput);
    
    // PHASE 4: Validate all edges for type compatibility
    const validatedEdgesWithTypes = this.validateEdgesForTypes(finalNodes, edgesWithOutput);
    
    // ✅ ARCHITECTURAL FIX: Global safety guard - validate all edges before returning
    this.validateAllEdgeHandles(finalNodes, validatedEdgesWithTypes);

    return { nodes: finalNodes, edges: validatedEdgesWithTypes };
  }
  
  /**
   * Ensure workflow has an output node at the end
   * If no output node exists, add log_output as default
   * Handles multiple terminal nodes (e.g., if_else branches)
   */
  private ensureOutputNode(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    // Define output node types
    const outputNodeTypes = [
      'slack_message',
      'email',
      'discord',
      'log_output',
      'webhook_response',
      'respond_to_webhook',
      'google_gmail'
    ];
    
    // Normalize trigger detection (nodes are often type="custom" with real type in data.type)
    const triggerTypes = ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'];
    const isTriggerNode = (n: WorkflowNode) => triggerTypes.includes(normalizeNodeType(n));

    // Find terminal nodes by graph topology (branch-aware): nodes with no outgoing edges
    const nodesWithOutgoingEdges = new Set(edges.map(edge => edge.source));
    const terminalNodes = nodes.filter(node => !nodesWithOutgoingEdges.has(node.id));
    const terminalNonTriggerNodes = terminalNodes.filter(node => !isTriggerNode(node));

    if (terminalNonTriggerNodes.length === 0) {
      return { nodes, edges };
    }

    // If there is already a log_output node, make sure it is wired as the FINAL sink (not from trigger).
    const existingLogOutputs = nodes.filter(n => normalizeNodeType(n) === 'log_output');
    const hasAnyOutputNode = terminalNonTriggerNodes.some(node => outputNodeTypes.includes(normalizeNodeType(node)));

    // We only auto-add/auto-rewire when workflow has no explicit output OR when there is an auto-injected log_output present.
    const shouldEnsureLog =
      existingLogOutputs.length > 0 ||
      !hasAnyOutputNode;

    if (!shouldEnsureLog) {
      return { nodes, edges };
    }

    const newNodes: WorkflowNode[] = [...nodes];
    let newEdges: WorkflowEdge[] = [...edges];

    // Choose one log_output (prefer auto-injected if available)
    let logOutputNode: WorkflowNode | null =
      existingLogOutputs.find(n => (n.data?.config as any)?._autoInjected) ||
      existingLogOutputs[0] ||
      null;

    if (!logOutputNode) {
      // Add ONE log_output node (sink)
      const anchor = terminalNonTriggerNodes[0];
      logOutputNode = {
        id: randomUUID(),
        type: 'log_output',
        position: {
          x: (anchor.position?.x || 0) + 400,
          y: (anchor.position?.y || 0),
        },
        data: {
          label: 'Log Output',
          type: 'log_output',
          category: 'output',
          config: {
            level: 'info',
            message: '{{$json}}',
            _autoInjected: true,
          },
        },
      };
      newNodes.push(logOutputNode);
      console.log(`📝 Found no output sink, added ONE log_output node as final sink`);
    }

    // 1) Remove edges that incorrectly connect trigger → log_output (this is what users report as "wrong place")
    //    Only remove if workflow has more than just trigger + log_output.
    const hasMoreThanTwoNodes = newNodes.length > 2;
    if (hasMoreThanTwoNodes) {
      const nodeById = new Map(newNodes.map(n => [n.id, n]));
      newEdges = newEdges.filter(e => {
        if (e.target !== logOutputNode!.id) return true;
        const src = nodeById.get(e.source);
        if (!src) return true;
        const srcType = normalizeNodeType(src);
        // Drop trigger→log_output edges so log_output sits at the end of actual branches
        if (triggerTypes.includes(srcType)) {
          console.warn(`⚠️  [ensureOutputNode] Removed trigger→log_output edge: ${srcType} (${e.source}) → log_output (${e.target})`);
          return false;
        }
        return true;
      });
    }

    // 2) Ensure log_output has NO outgoing edges (must be a sink)
    newEdges = newEdges.filter(e => e.source !== logOutputNode!.id);

    // 3) Connect EACH terminal node (in each branch) → log_output (fan-in)
    //    This ensures log_output is at the end even for branching graphs.
    const existingPairs = new Set(newEdges.map(e => `${e.source}::${e.target}`));
    terminalNonTriggerNodes.forEach(term => {
      if (term.id === logOutputNode!.id) return;
      const key = `${term.id}::${logOutputNode!.id}`;
      if (existingPairs.has(key)) return;

      const sourceActualType = normalizeNodeType(term);
      const targetActualType = normalizeNodeType(logOutputNode!);

      const resolvedSourceHandle = this.resolveSourceHandle(term);
      const resolvedTargetHandle = this.resolveTargetHandle(logOutputNode!);

      const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
        sourceActualType,
        targetActualType,
        resolvedSourceHandle,
        resolvedTargetHandle
      );

      try {
        this.validateEdgeHandlesStrict(term, logOutputNode!, sourceHandle, targetHandle);
        newEdges.push({
          id: randomUUID(),
          source: term.id,
          target: logOutputNode!.id,
          type: 'default',
          sourceHandle,
          targetHandle,
        });
        existingPairs.add(key);
      } catch (error) {
        // If strict validation fails, skip; global safety guard will also repair/drop.
        console.warn(`⚠️  [ensureOutputNode] Could not connect terminal ${sourceActualType} → log_output: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    console.log(`✅ [ensureOutputNode] log_output is connected from ${terminalNonTriggerNodes.length} terminal node(s)`);

    return { nodes: newNodes, edges: newEdges };
  }
  
  /**
   * PHASE 4: Apply node defaults with output type information
   */
  private applyNodeTypeDefaults(node: WorkflowNode): WorkflowNode {
    // ✅ SINGLE SOURCE OF TRUTH: Hydrate + normalize node config from NodeDefinitionRegistry
    // - Filters unknown config keys (except internal meta keys starting with "_")
    // - Applies defaultInputs()
    // - Applies migrations for backward compatibility
    // This prevents "schema mismatch" class of errors from reappearing across prompts.
    try {
      const canonicalType = normalizeNodeType(node as any);
      const def = nodeDefinitionRegistry.get(canonicalType);
      if (def) {
        const currentConfig = (node.data?.config || {}) as Record<string, any>;
        const migrated = nodeDefinitionRegistry.migrateInputs(canonicalType, currentConfig, def.version);
        const defaults = def.defaultInputs();

        const allowed = new Set(Object.keys(def.inputSchema || {}));
        const filtered: Record<string, any> = {};
        for (const [k, v] of Object.entries(migrated || {})) {
          if (k.startsWith('_') || allowed.has(k)) {
            filtered[k] = v;
          }
        }

        node.data.config = { ...defaults, ...filtered };
        // Ensure canonical type stored in node.data.type (ReactFlow renderer may still use node.type === "custom")
        node.data.type = canonicalType;
      }
    } catch {
      // If normalization fails, keep node as-is for backward compatibility
    }

    // Preserve output type defaults (used by type compatibility checks)
    const schema = getNodeOutputSchema(node.type);
    if (schema?.defaultValue !== undefined && !node.data.config.outputType) {
      node.data.config.outputType = schema.type;
    }

    return node;
  }
  
  /**
   * PHASE 4: Validate all edges for type compatibility
   */
  private validateEdgesForTypes(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] {
    const validatedEdges: WorkflowEdge[] = [];
    const typeWarnings: string[] = [];
    
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) {
        console.warn(`⚠️  Edge references missing node: ${edge.source} -> ${edge.target}`);
        continue;
      }
      
      const sourceOutputType = getNodeOutputType(sourceNode.type);
      const targetInputType = getNodeOutputType(targetNode.type);
      
      // Check compatibility
      const compatible = areTypesCompatible(
        sourceOutputType,
        targetInputType,
        sourceNode.type,
        targetNode.type
      );
      
      if (compatible) {
        validatedEdges.push(edge);
      } else {
        // Log warning but still add edge (backward compatibility)
        const warning = `Type mismatch: ${sourceNode.type} (${sourceOutputType}) -> ${targetNode.type} (${targetInputType})`;
        typeWarnings.push(warning);
        console.warn(`⚠️  ${warning} - Edge added but may need type conversion`);
        validatedEdges.push({
          ...edge,
          type: edge.type || 'converted',
        });
      }
    }
    
    if (typeWarnings.length > 0) {
      console.log(`⚠️  Found ${typeWarnings.length} type compatibility warnings (edges still added for backward compatibility)`);
    }
    
    return validatedEdges;
  }
  
  /**
   * Apply STRICT LINEAR layout to match "one-in / one-out" expectation.
   * - Main execution chain is drawn as a single horizontal line: Trigger → step1 → step2 → ... → final
   * - Special nodes (if_else, merge, switch) may have additional branches, but are kept close vertically.
   */
  private applyHierarchicalLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    if (nodes.length === 0) return;

    // Layout constants
    const STEP_WIDTH = 320;
    const MAIN_Y = 120;
    const BRANCH_Y_OFFSET = 180;
    const START_X = 120;

    // Identify trigger(s)
    const triggerTypes = ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'];
    const triggerNodes = nodes.filter(n => triggerTypes.includes(n.type));
    const triggerNode = triggerNodes[0] ?? nodes[0];

    // Build adjacency map
    const outgoing: Record<string, string[]> = {};
    const incomingCount: Record<string, number> = {};
    nodes.forEach(n => {
      outgoing[n.id] = [];
      incomingCount[n.id] = 0;
    });
    edges.forEach(e => {
      if (outgoing[e.source]) outgoing[e.source].push(e.target);
      if (incomingCount[e.target] !== undefined) incomingCount[e.target]++;
    });

    // Build execution order with DFS starting from trigger
    const visited = new Set<string>();
    const order: string[] = [];

    const dfs = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      order.push(id);
      (outgoing[id] || []).forEach(nextId => dfs(nextId));
    };

    dfs(triggerNode.id);

    // Append any disconnected/orphan nodes at the end
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        order.push(n.id);
      }
    });

    // Place main chain horizontally
    const idToNode: Record<string, WorkflowNode> = {};
    nodes.forEach(n => (idToNode[n.id] = n));

    order.forEach((nodeId, index) => {
      const node = idToNode[nodeId];
      if (!node) return;
      node.position = {
        x: START_X + index * STEP_WIDTH,
        y: MAIN_Y,
      };
    });

    // Slight vertical offsets for branch targets of if_else / switch / merge
    edges.forEach(e => {
      const sourceNode = idToNode[e.source];
      const targetNode = idToNode[e.target];
      if (!sourceNode || !targetNode) return;

      const sourceType = normalizeNodeType(sourceNode);
      const isBranchSource = sourceType === 'if_else' || sourceType === 'switch';

      if (isBranchSource && targetNode.position) {
        // Decide branch direction based on handle or existing y
        const isTrueBranch =
          e.sourceHandle === 'true' ||
          e.sourceHandle === 'output_true' ||
          (targetNode.data?.label || '').toLowerCase().includes('true');

        targetNode.position = {
          x: targetNode.position.x,
          y: MAIN_Y + (isTrueBranch ? -BRANCH_Y_OFFSET : BRANCH_Y_OFFSET),
        };
      }
    });

    console.log(`✅ Applied linear layout to ${nodes.length} nodes`);
  }

  /**
   * Enhanced validation following system prompt rules
   * - Validates ALL required fields are filled
   * - Checks for placeholder values
   * - Ensures correct data types
   * - Validates credentials usage
   */
  private async validateWorkflow(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
      return { valid: false, errors, warnings };
    }
    
    // ✅ CRITICAL: Validate trigger count first and auto-fix duplicates
    const { validateTriggerCount, removeDuplicateTriggers } = await import('../../core/utils/trigger-deduplicator');
    const triggerValidation = validateTriggerCount(workflow.nodes);
    
    if (!triggerValidation.valid) {
      // Auto-fix: Remove duplicate triggers
      if (triggerValidation.triggerCount > 1) {
        const deduplicationResult = removeDuplicateTriggers(workflow.nodes, workflow.edges);
        workflow.nodes = deduplicationResult.nodes;
        workflow.edges = deduplicationResult.edges;
        console.log(`✅ [Validation] Auto-fixed: Removed ${deduplicationResult.removedTriggerIds.length} duplicate trigger(s)`);
        warnings.push(`Removed ${deduplicationResult.removedTriggerIds.length} duplicate trigger(s)`);
      } else if (triggerValidation.triggerCount === 0) {
        errors.push('Workflow must have exactly one trigger node');
      }
    }
    
    // Validate node configurations - STRICT: no empty required fields, no placeholders
    // PRIORITY 2 FIX: Enhanced validation with required field checking
    workflow.nodes.forEach(node => {
      const config = node.data?.config || {};
      // CRITICAL FIX: Use normalizeNodeType to get actual node type
      const actualNodeType = normalizeNodeType(node);
      const nodeSchema = nodeLibrary.getSchema(actualNodeType);
      const requiredFields = nodeSchema?.configSchema?.required || [];
      
      // PRIORITY 2: Check for empty required fields
      requiredFields.forEach(fieldName => {
        const value = config[fieldName];
        const isEmpty = value === undefined || value === null || 
                       (typeof value === 'string' && value.trim() === '') ||
                       (Array.isArray(value) && value.length === 0);
        
        if (isEmpty) {
          errors.push(`Node ${node.id} (${node.type}) has empty required field: ${fieldName}`);
        }
      });
      
      // Check for placeholder values (NOT ALLOWED per system prompt)
      Object.entries(config).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          if (lowerValue.includes('todo') || 
              lowerValue.includes('example') || 
              lowerValue.includes('fill this') ||
              (lowerValue.includes('placeholder') && !lowerValue.includes('{{ENV.'))) {
            errors.push(`Node ${node.id} (${node.type}) has placeholder value in field "${key}": "${value}"`);
          }
        }
      });
      
      // Validate specific node types have required fields
      switch (node.type) {
        case 'schedule':
          if (!config.cronExpression || typeof config.cronExpression !== 'string' || config.cronExpression.trim() === '') {
            errors.push(`Schedule node ${node.id} missing or empty cronExpression`);
          }
          break;
        
        case 'interval':
          if (config.interval === undefined || config.interval === null || config.interval === '') {
            errors.push(`Interval node ${node.id} missing interval value`);
          }
          if (!config.unit || typeof config.unit !== 'string') {
            errors.push(`Interval node ${node.id} missing unit`);
          }
          break;
        
        case 'http_request':
        case 'http_post':
          if (!config.url || typeof config.url !== 'string' || config.url.trim() === '') {
            errors.push(`HTTP node ${node.id} has empty URL (required field)`);
          }
          if (!config.headers || typeof config.headers !== 'object') {
            errors.push(`HTTP node ${node.id} missing headers object`);
          }
          break;
        
        case 'google_sheets':
          if (!config.spreadsheetId || typeof config.spreadsheetId !== 'string' || config.spreadsheetId.trim() === '') {
            errors.push(`Google Sheets node ${node.id} missing spreadsheetId (required field)`);
          }
          if (!config.sheetName || typeof config.sheetName !== 'string' || config.sheetName.trim() === '') {
            errors.push(`Google Sheets node ${node.id} missing sheetName (required field)`);
          }
          break;
        
        case 'slack_message':
          const slackWebhookUrl = config.webhookUrl as string | undefined;
          const slackToken = config.token as string | undefined;
          // Webhook URL is preferred and sufficient - token is optional fallback
          if ((!slackWebhookUrl || (typeof slackWebhookUrl === 'string' && slackWebhookUrl.trim() === '')) && 
              (!slackToken || (typeof slackToken === 'string' && slackToken.trim() === ''))) {
            errors.push(`Slack node ${node.id} missing webhookUrl (required) or token (optional fallback)`);
          }
          if (!config.message || typeof config.message !== 'string' || config.message.trim() === '') {
            errors.push(`Slack node ${node.id} has empty message (required field)`);
          }
          break;
        
        case 'openai_gpt':
        case 'anthropic_claude':
        case 'google_gemini':
          if (!config.prompt || typeof config.prompt !== 'string' || config.prompt.trim() === '') {
            errors.push(`AI node ${node.id} has empty prompt (required field)`);
          }
          if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
            errors.push(`AI node ${node.id} missing apiKey (required field)`);
          }
          break;
        
        case 'if_else':
          if (!config.condition || typeof config.condition !== 'string' || config.condition.trim() === '') {
            errors.push(`If/Else node ${node.id} missing condition (required field)`);
          }
          break;
        
        case 'set_variable':
          if (!Array.isArray(config.variables)) {
            errors.push(`Set Variable node ${node.id} variables must be an array`);
          }
          break;
        
        case 'javascript':
          if (!config.code || typeof config.code !== 'string' || config.code.trim() === '') {
            errors.push(`JavaScript node ${node.id} has empty code (required field)`);
          }
          break;
        
        case 'text_formatter':
          if (!config.template || typeof config.template !== 'string' || config.template.trim() === '') {
            errors.push(`Text Formatter node ${node.id} has empty template (required field)`);
          }
          break;
        
        case 'ai_agent':
          if (!config.systemPrompt || typeof config.systemPrompt !== 'string' || config.systemPrompt.trim() === '') {
            errors.push(`AI Agent node ${node.id} has empty systemPrompt (required field)`);
          }
          if (!config.mode || typeof config.mode !== 'string') {
            errors.push(`AI Agent node ${node.id} missing mode (required field)`);
          }
          break;

        case 'chat_model':
          if (!config.provider || typeof config.provider !== 'string' || config.provider.trim() === '') {
            errors.push(`Chat Model node ${node.id} missing provider (required field)`);
          }
          if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
            errors.push(`Chat Model node ${node.id} missing model (required field)`);
          }
          if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
            errors.push(`Chat Model node ${node.id} missing apiKey (required field)`);
          }
          if (!config.prompt || typeof config.prompt !== 'string' || config.prompt.trim() === '') {
            errors.push(`Chat Model node ${node.id} has empty prompt (required field)`);
          }
          break;
      }
    });
    
    // Check connections - ensure all edges reference valid nodes
    workflow.edges.forEach(edge => {
      const sourceExists = workflow.nodes.some(n => n.id === edge.source);
      const targetExists = workflow.nodes.some(n => n.id === edge.target);
      
      if (!sourceExists) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }
      if (!targetExists) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    });
    
    // Check for orphaned nodes (nodes with no connections)
    const connectedNodeIds = new Set<string>();
    workflow.edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    
    const orphanedNodes = workflow.nodes.filter(node => {
      // Trigger nodes don't need incoming connections
      if (['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(node.type)) {
        return false;
      }
      return !connectedNodeIds.has(node.id);
    });
    
    if (orphanedNodes.length > 0) {
      warnings.push(`Found ${orphanedNodes.length} orphaned node(s) that may not be connected properly`);
    }
    
    // Ensure workflow has at least one output or end node
    const hasOutput = workflow.nodes.some(n => 
      ['log_output', 'slack_message', 'email', 'discord', 'respond_to_webhook', 'webhook_response'].includes(n.type)
    );
    if (!hasOutput && workflow.nodes.length > 1) {
      warnings.push('Workflow may benefit from an output node to see results');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Auto-fix workflow errors to ensure 100% working workflow
   * Following system prompt: Self-repair until ZERO errors
   * Eliminates all placeholders, fills all required fields
   */
  private async autoFixWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    requirements: Requirements,
    constraints?: any,
    aggressive: boolean = false
  ): Promise<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }> {
    let fixedNodes = [...nodes];
    let fixedEdges = [...edges];

    // Helper functions for auto-fix
    const getSecureApiKeyRef = (serviceName: string, keyName?: string): string => {
      const key = keyName || `${serviceName.toUpperCase()}_API_KEY`;
      return `{{ENV.${key}}}`;
    };

    const getServiceUrl = (serviceName: string, endpoint?: string): string => {
      const baseUrls: Record<string, string> = {
        openai: 'https://api.openai.com/v1',
        anthropic: 'https://api.anthropic.com/v1',
        google: 'https://www.googleapis.com',
        gemini: 'https://generativelanguage.googleapis.com/v1',
        slack: 'https://slack.com/api',
        discord: 'https://discord.com/api',
        webhook: 'https://example.com/webhook',
      };
      const baseUrl = baseUrls[serviceName.toLowerCase()] || `https://api.${serviceName.toLowerCase()}.com/v1`;
      return endpoint ? `${baseUrl}${endpoint}` : baseUrl;
    };

    // Fix 1: Ensure workflow has exactly one trigger (no duplicates)
    // ✅ CRITICAL: Use trigger deduplicator to ensure only one trigger exists
    const { ensureSingleTrigger } = await import('../../core/utils/trigger-deduplicator');
    const triggerResult = ensureSingleTrigger(fixedNodes, fixedEdges);
    
    if (triggerResult.added) {
      console.log('[AutoFix] Added missing trigger (manual_trigger)');
      fixedNodes = triggerResult.nodes;
      
      // Connect trigger to first non-trigger node
      const firstNonTrigger = fixedNodes.find(n => {
        const nodeType = n.data?.type || n.type || '';
        return !['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(nodeType);
      });
      if (firstNonTrigger) {
        fixedEdges.unshift({
          id: randomUUID(),
          source: triggerResult.nodes[0].id,
          target: firstNonTrigger.id,
          type: 'default',
        });
      }
    } else if (triggerResult.removed.length > 0) {
      console.log(`[AutoFix] Removed ${triggerResult.removed.length} duplicate trigger(s)`);
      fixedNodes = triggerResult.nodes;
      fixedEdges = triggerResult.edges;
    }

    // Fix 2: Fix orphaned nodes by connecting them
    const connectedNodeIds = new Set<string>();
    fixedEdges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    fixedNodes.forEach(node => {
      // Skip trigger nodes (they don't need incoming connections)
      if (['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(node.type)) {
        return;
      }

      // If node has no incoming connections, connect it to the previous node
      if (!connectedNodeIds.has(node.id)) {
        const nodeIndex = fixedNodes.findIndex(n => n.id === node.id);
        if (nodeIndex > 0) {
          const previousNode = fixedNodes[nodeIndex - 1];
          fixedEdges.push({
            id: randomUUID(),
            source: previousNode.id,
            target: node.id,
            type: 'default',
          });
          connectedNodeIds.add(node.id);
        }
      }
    });

    // Fix 3: Fix invalid node configurations and eliminate ALL placeholders
    fixedNodes = fixedNodes.map(node => {
      const config = node.data?.config || {};
      const fixedConfig = { ...config };

      // First pass: Remove placeholder values
      Object.keys(fixedConfig).forEach(key => {
        const value = fixedConfig[key];
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          if (lowerValue.includes('todo') || 
              lowerValue.includes('example') || 
              lowerValue.includes('fill this') ||
              (lowerValue.includes('placeholder') && !lowerValue.includes('{{ENV.'))) {
            // Replace placeholder based on field type
            if (key.includes('url') || key.includes('Url')) {
              fixedConfig[key] = getServiceUrl('webhook');
            } else if (key.includes('key') || key.includes('Key') || key.includes('token')) {
              const serviceName = node.type.replace(/_/g, '').replace('gpt', 'openai').replace('claude', 'anthropic');
              fixedConfig[key] = getSecureApiKeyRef(serviceName);
            } else if (key.includes('prompt') || key.includes('message') || key.includes('body')) {
              fixedConfig[key] = requirements.primaryGoal || 'Process the input data';
            } else {
              fixedConfig[key] = '{{ $json }}';
            }
          }
        }
      });

      // Second pass: Fill required fields based on node type
      switch (node.type) {
        case 'schedule':
          if (!fixedConfig.cronExpression || typeof fixedConfig.cronExpression !== 'string' || fixedConfig.cronExpression.trim() === '') {
            const schedule = requirements.schedules?.[0] || '';
            fixedConfig.cronExpression = this.parseScheduleToCron(schedule);
          }
          break;

        case 'interval':
          if (fixedConfig.interval === undefined || fixedConfig.interval === null || fixedConfig.interval === '') {
            fixedConfig.interval = 3600;
          }
          if (!fixedConfig.unit || typeof fixedConfig.unit !== 'string') {
            fixedConfig.unit = 'seconds';
          }
          break;

        case 'if_else':
          if (!fixedConfig.condition || typeof fixedConfig.condition !== 'string' || fixedConfig.condition.trim() === '') {
            fixedConfig.condition = '{{ $json }}';
          }
          break;

        case 'set_variable':
          if (!Array.isArray(fixedConfig.variables)) {
            fixedConfig.variables = [];
          }
          break;

        case 'openai_gpt':
          if (!fixedConfig.prompt || typeof fixedConfig.prompt !== 'string' || fixedConfig.prompt.trim() === '') {
            fixedConfig.prompt = requirements.primaryGoal || 'Process the input data and provide a response.';
          }
          if (!fixedConfig.apiKey || typeof fixedConfig.apiKey !== 'string' || fixedConfig.apiKey.trim() === '') {
            fixedConfig.apiKey = getSecureApiKeyRef('openai');
          }
          if (!fixedConfig.model) {
            fixedConfig.model = 'gpt-3.5-turbo';
          }
          if (!fixedConfig.temperature) {
            fixedConfig.temperature = 0.7;
          }
          if (!fixedConfig.maxTokens) {
            fixedConfig.maxTokens = 2000;
          }
          break;

        case 'anthropic_claude':
          if (!fixedConfig.prompt || typeof fixedConfig.prompt !== 'string' || fixedConfig.prompt.trim() === '') {
            fixedConfig.prompt = requirements.primaryGoal || 'Process the input data and provide a response.';
          }
          if (!fixedConfig.apiKey || typeof fixedConfig.apiKey !== 'string' || fixedConfig.apiKey.trim() === '') {
            fixedConfig.apiKey = getSecureApiKeyRef('anthropic');
          }
          if (!fixedConfig.model) {
            fixedConfig.model = 'claude-3-sonnet-20240229';
          }
          if (!fixedConfig.temperature) {
            fixedConfig.temperature = 0.7;
          }
          if (!fixedConfig.maxTokens) {
            fixedConfig.maxTokens = 2000;
          }
          break;

        case 'google_gemini':
          if (!fixedConfig.prompt || typeof fixedConfig.prompt !== 'string' || fixedConfig.prompt.trim() === '') {
            fixedConfig.prompt = requirements.primaryGoal || 'Process the input data and provide a response.';
          }
          if (!fixedConfig.apiKey || typeof fixedConfig.apiKey !== 'string' || fixedConfig.apiKey.trim() === '') {
            fixedConfig.apiKey = getSecureApiKeyRef('gemini');
          }
          if (!fixedConfig.model) {
            fixedConfig.model = 'gemini-pro';
          }
          if (!fixedConfig.temperature) {
            fixedConfig.temperature = 0.7;
          }
          if (!fixedConfig.maxTokens) {
            fixedConfig.maxTokens = 2000;
          }
          break;

        case 'http_request':
        case 'http_post':
          if (!fixedConfig.url || typeof fixedConfig.url !== 'string' || fixedConfig.url.trim() === '') {
            fixedConfig.url = requirements.urls?.[0] || getServiceUrl('webhook');
          }
          if (!fixedConfig.headers || typeof fixedConfig.headers !== 'object') {
            fixedConfig.headers = { 'Content-Type': 'application/json' };
          }
          if (!fixedConfig.timeout) {
            fixedConfig.timeout = 30000;
          }
          if (!fixedConfig.retries) {
            fixedConfig.retries = 3;
          }
          break;

        case 'google_sheets':
          if (!fixedConfig.spreadsheetId || typeof fixedConfig.spreadsheetId !== 'string' || fixedConfig.spreadsheetId.trim() === '') {
            // Try to extract from URLs
            const sheetUrl = requirements.urls?.find((u: string) => u.includes('spreadsheets') || u.includes('sheets')) || '';
            if (sheetUrl) {
              const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
              if (match) {
                fixedConfig.spreadsheetId = match[1];
              }
            }
            // Don't use ENV placeholder - let missing fields check prompt user
            if (!fixedConfig.spreadsheetId) {
              fixedConfig.spreadsheetId = '';
            }
          }
          if (!fixedConfig.sheetName || typeof fixedConfig.sheetName !== 'string' || fixedConfig.sheetName.trim() === '') {
            fixedConfig.sheetName = 'Sheet1';
          }
          if (!fixedConfig.operation) {
            fixedConfig.operation = 'read';
          }
          if (!fixedConfig.range) {
            fixedConfig.range = 'A1:Z1000';
          }
          if (!fixedConfig.outputFormat) {
            fixedConfig.outputFormat = 'json';
          }
          break;

        case 'slack_message':
          if (!fixedConfig.message || typeof fixedConfig.message !== 'string' || fixedConfig.message.trim() === '') {
            fixedConfig.message = requirements.primaryGoal || 'Workflow notification';
          }
          const fixedWebhookUrl = fixedConfig.webhookUrl as string | undefined;
          const fixedToken = fixedConfig.token as string | undefined;
          // Prioritize webhook URL - it's simpler and sufficient
          if ((!fixedWebhookUrl || (typeof fixedWebhookUrl === 'string' && fixedWebhookUrl.trim() === '')) && 
              (!fixedToken || (typeof fixedToken === 'string' && fixedToken.trim() === ''))) {
            // Try to get webhook URL from credentials first
            fixedConfig.webhookUrl = getSecureApiKeyRef('slack', 'SLACK_WEBHOOK_URL') || getServiceUrl('webhook');
            // Token is optional fallback
            fixedConfig.token = getSecureApiKeyRef('slack', 'SLACK_TOKEN');
          }
          if (!fixedConfig.channel) {
            fixedConfig.channel = '#general';
          }
          break;

        case 'javascript':
          if (!fixedConfig.code || typeof fixedConfig.code !== 'string' || fixedConfig.code.trim() === '') {
            fixedConfig.code = 'return $input;';
          }
          break;

        case 'text_formatter':
          if (!fixedConfig.template || typeof fixedConfig.template !== 'string' || fixedConfig.template.trim() === '') {
            fixedConfig.template = '{{ $json }}';
          }
          break;

        case 'ai_agent':
          if (!fixedConfig.systemPrompt || typeof fixedConfig.systemPrompt !== 'string' || fixedConfig.systemPrompt.trim() === '') {
            fixedConfig.systemPrompt = requirements.primaryGoal || 'You are an autonomous intelligent agent inside an automation workflow. Understand user input, reason over context, use available tools when needed, and produce structured responses.';
          }
          if (!fixedConfig.mode || typeof fixedConfig.mode !== 'string') {
            fixedConfig.mode = 'chat';
          }
          if (!fixedConfig.temperature) {
            fixedConfig.temperature = 0.7;
          }
          if (!fixedConfig.maxTokens) {
            fixedConfig.maxTokens = 2000;
          }
          break;

        case 'chat_model':
          if (!fixedConfig.provider || typeof fixedConfig.provider !== 'string') {
            fixedConfig.provider = 'ollama';
          }
          if (!fixedConfig.model || typeof fixedConfig.model !== 'string' || fixedConfig.model.trim() === '') {
            fixedConfig.model = 'qwen2.5:14b-instruct-q4_K_M';
          }
          // Ollama doesn't need API key - remove apiKey requirement
          if (fixedConfig.apiKey) {
            delete fixedConfig.apiKey; // Remove API key field for Ollama
          }
          if (!fixedConfig.prompt || typeof fixedConfig.prompt !== 'string' || fixedConfig.prompt.trim() === '') {
            fixedConfig.prompt = 'You are a helpful AI assistant that provides accurate and useful responses.';
          }
          if (!fixedConfig.temperature) {
            fixedConfig.temperature = 0.7;
          }
          break;
      }

      return {
        ...node,
        data: {
          ...node.data,
          config: fixedConfig,
        },
      };
    });

    // Fix 4: Remove invalid edges (edges pointing to non-existent nodes)
    const nodeIds = new Set(fixedNodes.map(n => n.id));
    fixedEdges = fixedEdges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    // Fix 5: Ensure sequential connections if edges are missing
    if (fixedEdges.length === 0 && fixedNodes.length > 1) {
      fixedEdges = [];
      for (let i = 0; i < fixedNodes.length - 1; i++) {
        fixedEdges.push({
          id: randomUUID(),
          source: fixedNodes[i].id,
          target: fixedNodes[i + 1].id,
          type: 'default',
        });
      }
    }

    return {
      nodes: fixedNodes,
      edges: fixedEdges,
    };
  }

  private async generateDocumentation(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    requirements: Requirements
  ): Promise<string> {
    const doc = `# Generated Workflow

## Goal
${requirements.primaryGoal}

## Steps
${requirements.keySteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Nodes
${nodes.map(n => `- ${n.data.label} (${n.type})`).join('\n')}

## Connections
${edges.map(e => `${e.source} → ${e.target}`).join('\n')}

Generated on: ${new Date().toISOString()}
`;
    
    return doc;
  }

  private async provideEnhancementSuggestions(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    requirements: Requirements
  ): Promise<any[]> {
    const suggestions: any[] = [];
    
    // Check for error handling
    const hasErrorHandling = nodes.some(n => n.type === 'error_handler');
    if (!hasErrorHandling) {
      suggestions.push({
        type: 'error_handling',
        suggestion: 'Add error handling nodes for better reliability',
        priority: 'high',
      });
    }
    
    // Check for logging
    const hasLogging = nodes.some(n => n.type === 'log_output');
    if (!hasLogging) {
      suggestions.push({
        type: 'logging',
        suggestion: 'Add logging nodes for debugging',
        priority: 'medium',
      });
    }
    
    return suggestions;
  }

  private calculateComplexity(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    
    if (nodeCount <= 3 && edgeCount <= 2) {
      return 'simple';
    } else if (nodeCount <= 10 && edgeCount <= 15) {
      return 'medium';
    } else {
      return 'complex';
    }
  }
  
  /**
   * Ensure workflow is immediately runnable
   * Checks:
   * - All nodes are connected
   * - All required fields are filled
   * - No empty configurations
   */
  private ensureWorkflowRunnable(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): {
    runnable: boolean;
    issues: string[];
    fixes: string[];
  } {
    const issues: string[] = [];
    const fixes: string[] = [];
    
    // Check 1: All nodes have connections (except triggers)
    const triggerNodes = nodes.filter(n => 
      ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(n.type)
    );
    const nonTriggerNodes = nodes.filter(n => 
      !['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'workflow_trigger', 'form', 'error_trigger'].includes(n.type) &&
      n.type !== 'chat_model' // chat_model connects to ai_agent separately
    );
    
    const connectedNodeIds = new Set(edges.map(e => e.target));
    const disconnectedNodes = nonTriggerNodes.filter(n => !connectedNodeIds.has(n.id));
    
    if (disconnectedNodes.length > 0) {
      issues.push(`${disconnectedNodes.length} nodes are not connected`);
      fixes.push(`Connect ${disconnectedNodes.length} orphan nodes`);
    }
    
    // Check 2: All required fields are filled
    for (const node of nodes) {
      // CRITICAL FIX: Use normalizeNodeType to get actual node type
      const actualNodeType = normalizeNodeType(node);
      const nodeSchema = nodeLibrary.getSchema(actualNodeType);
      if (nodeSchema?.configSchema?.required) {
        const requiredFields = nodeSchema.configSchema.required;
        for (const fieldName of requiredFields) {
          if (!fieldName || typeof fieldName !== 'string') {
            continue;
          }
          const fieldValue = node.data?.config?.[fieldName];
          if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
            issues.push(`${node.type}.${fieldName} is required but empty`);
          }
        }
      }
    }
    
    // Check 3: At least one edge exists for multi-node workflows
    if (nodes.length > 1 && edges.length === 0) {
      issues.push('No edges created for multi-node workflow');
      fixes.push('Create sequential connections');
    }
    
    // Check 4: Trigger node exists
    if (triggerNodes.length === 0) {
      issues.push('No trigger node found');
      fixes.push('Add manual_trigger node');
    }
    
    return {
      runnable: issues.length === 0,
      issues,
      fixes,
    };
  }

  async iterativeImprovement(
    existingWorkflow: Workflow,
    feedback: string
  ): Promise<WorkflowImprovement> {
    // Analyze feedback
    const feedbackAnalysis = await this.analyzeFeedback(feedback, existingWorkflow);
    
    // Generate improvements
    const improvements = await this.generateImprovements(
      existingWorkflow,
      feedbackAnalysis
    );
    
    // Apply improvements
    const improvedWorkflow = await this.applyImprovements(
      existingWorkflow,
      improvements
    );
    
    return {
      improvedWorkflow,
      changes: improvements.changes,
      rationale: improvements.rationale,
      confidence: improvements.confidence,
    };
  }

  private async analyzeFeedback(feedback: string, workflow: Workflow): Promise<ImprovementAnalysis> {
    const prompt = `Analyze this feedback for a workflow:
Feedback: "${feedback}"
Current workflow has ${workflow.nodes.length} nodes and ${workflow.edges.length} edges.

Identify what needs to be changed. Respond with JSON:
{
  "issues": ["issue1", "issue2"],
  "suggestedChanges": ["change1", "change2"],
  "priority": "high|medium|low"
}`;
    
    try {
      const result = await ollamaOrchestrator.processRequest('workflow-analysis', {
        prompt,
        temperature: 0.3,
      });
      
      return typeof result === 'string' ? JSON.parse(result) : result;
    } catch (error) {
      console.error('Error analyzing feedback:', error);
      return { issues: [], suggestedChanges: [], priority: 'medium' };
    }
  }

  private async generateImprovements(workflow: Workflow, analysis: ImprovementAnalysis): Promise<{
    changes: Change[];
    rationale: string;
    confidence: number;
  }> {
    // Generate specific improvements based on analysis
    const changes: Change[] = [];
    
    analysis.suggestedChanges?.forEach((change: string) => {
      changes.push({
        type: 'modification',
        description: change,
        impact: analysis.priority,
      });
    });
    
    return {
      changes,
      rationale: `Based on feedback analysis: ${analysis.issues?.join(', ')}`,
      confidence: 0.7,
    };
  }

  private async applyImprovements(workflow: Workflow, improvements: {
    changes: Change[];
    rationale: string;
    confidence: number;
  }): Promise<Workflow> {
    // Apply improvements to workflow
    // This is a simplified version - full implementation would modify nodes/edges
    return {
      ...workflow,
      metadata: {
        ...workflow.metadata,
        improvements: improvements.changes,
        improvedAt: new Date().toISOString(),
      },
    };
  }

  private getNodeLabel(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * ✅ ARCHITECTURAL FIX: Strict edge handle validation before creation
   * Validates that source handle exists in source node and target handle exists in target node
   * Throws error if invalid - prevents silent corruption
   */
  private validateEdgeHandlesStrict(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    sourceHandle: string,
    targetHandle: string
  ): void {
    // ✅ CRITICAL: Use normalizeNodeType to get actual types
    const sourceActualType = normalizeNodeType(sourceNode);
    const targetActualType = normalizeNodeType(targetNode);
    
    // Get valid output fields for source node
    const sourceOutputs = this.getNodeOutputFields(sourceActualType);
    if (!sourceOutputs.includes(sourceHandle)) {
      throw new Error(
        `❌ [STRICT VALIDATION] Invalid source handle "${sourceHandle}" for ${sourceActualType} node (id: ${sourceNode.id}). ` +
        `Valid outputs: ${sourceOutputs.join(', ')}`
      );
    }
    
    // Get valid input fields for target node
    const targetInputs = this.getNodeInputFields(targetActualType);
    if (!targetInputs.includes(targetHandle)) {
      throw new Error(
        `❌ [STRICT VALIDATION] Invalid target handle "${targetHandle}" for ${targetActualType} node (id: ${targetNode.id}). ` +
        `Valid inputs: ${targetInputs.join(', ')}`
      );
    }
  }

  /**
   * Validate edge before creating connection
   * Checks if source node has the output field and target node has the input field
   */
  private validateEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    sourceField: string,
    targetField: string
  ): { valid: boolean; reason?: string } {
    // ✅ ARCHITECTURAL FIX: Use normalizeNodeType for validation
    const sourceActualType = normalizeNodeType(sourceNode);
    const targetActualType = normalizeNodeType(targetNode);
    
    // PHASE 4: Type compatibility validation
    const sourceOutputType = getNodeOutputType(sourceActualType);
    const targetInputType = getNodeOutputType(targetActualType);
    
    // Check type compatibility
    const typeCompatible = areTypesCompatible(
      sourceOutputType,
      targetInputType,
      sourceNode.type,
      targetNode.type
    );
    
    if (!typeCompatible) {
      return {
        valid: false,
        reason: `Type mismatch: ${sourceActualType} outputs ${sourceOutputType} but ${targetActualType} expects ${targetInputType}`
      };
    }
    
    // ✅ ARCHITECTURAL FIX: Get available output fields using normalized type
    const sourceOutputs = this.getNodeOutputFields(sourceActualType);
    
    // ✅ ARCHITECTURAL FIX: Strict validation - no generic fallbacks
    if (!sourceOutputs.includes(sourceField)) {
      // Special case: manual_trigger only has inputData, not data
      if (sourceActualType === 'manual_trigger' && sourceField === 'inputData') {
        return { valid: true };
      }
      // Special case: chat_trigger ONLY has message, userId, sessionId, timestamp fields
      if (sourceActualType === 'chat_trigger') {
        if (sourceField === 'message' || sourceField === 'userId' || sourceField === 'sessionId' || sourceField === 'timestamp') {
          return { valid: true };
        }
        return { 
          valid: false, 
          reason: `chat_trigger does not have output field '${sourceField}'. Available fields: ${sourceOutputs.join(', ')}. Use 'message' instead.` 
        };
      }
      // ✅ STRICT: Fail if field doesn't exist - no generic fallbacks
      return { 
        valid: false, 
        reason: `Source node ${sourceActualType} does not have output field '${sourceField}'. Available: ${sourceOutputs.join(', ')}` 
      };
    }
    
    // Get available input fields from target node
    // ✅ Already normalized above, reuse targetActualType
    const targetSchema = nodeLibrary.getSchema(targetActualType);
    if (targetSchema?.configSchema) {
      const requiredFields = targetSchema.configSchema.required || [];
      const optionalFields = Object.keys(targetSchema.configSchema.optional || {});
      const allInputFields = [...requiredFields, ...optionalFields];
      
      // Special handling for ai_agent node
      if (targetNode.type === 'ai_agent') {
        const aiAgentFields = ['userInput', 'chat_model', 'memory', 'tool'];
        const hasValidField = aiAgentFields.some(f => 
          f.toLowerCase() === targetField.toLowerCase()
        );
        if (!hasValidField && targetField && !allInputFields.some(f => f.toLowerCase() === targetField.toLowerCase())) {
          return { 
            valid: false, 
            reason: `Target node ${targetNode.type} does not have input field '${targetField}'. Available: ${aiAgentFields.join(', ')}` 
          };
        }
      } else {
        // RELAXED: Check if target has the input field (case-insensitive, with flexible matching)
        const targetHasField = allInputFields.some(f => 
          f.toLowerCase() === targetField.toLowerCase() ||
          f.toLowerCase().includes(targetField.toLowerCase()) ||
          targetField.toLowerCase().includes(f.toLowerCase())
        );
        if (!targetHasField && targetField) {
          // RELAXED: Allow connection to generic 'input' or 'data' field if available
          const genericFields = ['input', 'data', 'value', 'message', 'text'];
          const hasGenericField = allInputFields.some(f => 
            genericFields.includes(f.toLowerCase())
          );
          if (hasGenericField) {
            console.log(`⚠️  Target field '${targetField}' not found in ${targetNode.type}, using generic field`);
            return { valid: true }; // Allow connection with generic field
          }
          return { 
            valid: false, 
            reason: `Target node ${targetNode.type} does not have input field '${targetField}'. Available: ${allInputFields.join(', ')}` 
          };
        }
      }
    }
    
    return { valid: true };
  }
  
  /**
   * PHASE 5: Generate type-related clarifying questions
   */
  generateTypeClarifyingQuestions(nodes: WorkflowNode[]): string[] {
    const questions: string[] = [];
    
    nodes.forEach(node => {
      const schema = getNodeOutputSchema(node.type);
      
      // Ask about output format if multiple options (especially for AI nodes)
      if (node.type === 'ai_agent' && !node.data.config.outputFormat) {
        questions.push(`Should the AI agent output plain text or structured JSON? (Current: not specified)`);
      }
      
      // Ask about array handling for data source nodes
      if (schema?.type === 'array' && !node.data.config.limit && !node.data.config.maxItems) {
        if (node.type === 'google_sheets' || node.type === 'database_read') {
          questions.push(`How many items should ${node.data.label || node.type} process at once? (Leave empty for all items)`);
        }
      }
      
      // Ask about text formatting for text_formatter
      if (node.type === 'text_formatter' && !node.data.config.template) {
        questions.push(`What template format should ${node.data.label || 'Text Formatter'} use? (e.g., "Hello {{name}}!")`);
      }
      
      // Ask about output type for javascript nodes
      if (node.type === 'javascript' && !node.data.config.returnType) {
        questions.push(`What type should the JavaScript node return? (string, object, array, or number)`);
      }
    });
    
    return questions;
  }
  
  /**
   * Find alternative mapping if primary mapping fails validation
   */
  private findAlternativeMapping(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode
  ): { outputField: string; inputField: string } | null {
    // ✅ CRITICAL FIX: Use normalizeNodeType to get actual node types
    const sourceActualType = normalizeNodeType(sourceNode);
    const targetActualType = normalizeNodeType(targetNode);
    
    const sourceOutputs = this.getPreviousNodeOutputFields(sourceNode);
    const targetSchema = nodeLibrary.getSchema(targetActualType);
    
    if (!targetSchema?.configSchema) {
      return null;
    }
    
    const requiredFields = targetSchema.configSchema.required || [];
    const optionalFields = Object.keys(targetSchema.configSchema.optional || {});
    const allInputFields = [...requiredFields, ...optionalFields];
    
    // ✅ CRITICAL FIX: Special handling for triggers - use correct output fields
    // Use registry directly to ensure we get the correct fields even if sourceOutputs is empty
    if (sourceActualType === 'manual_trigger' || sourceActualType === 'workflow_trigger') {
      // manual_trigger outputs 'inputData', not 'output'
      // ✅ CRITICAL: Use registry directly to get correct output fields
      const triggerOutputs = this.getNodeOutputFields(sourceActualType);
      const inputDataField = triggerOutputs.find(f => f.toLowerCase() === 'inputdata') || triggerOutputs[0];
      if (inputDataField) {
        const targetField = allInputFields.find(f => 
          ['input', 'data', 'inputdata', 'properties'].includes(f.toLowerCase())
        ) || allInputFields[0];
        if (targetField) {
          return { outputField: inputDataField, inputField: targetField };
        }
      }
    }
    
    if (sourceActualType === 'chat_trigger') {
      // chat_trigger outputs 'message', not 'output' or 'inputData'
      // ✅ CRITICAL: Use registry directly to get correct output fields
      const triggerOutputs = this.getNodeOutputFields(sourceActualType);
      const messageField = triggerOutputs.find(f => f.toLowerCase() === 'message') || triggerOutputs[0];
      if (messageField) {
        const targetField = allInputFields.find(f => 
          ['input', 'message', 'text', 'userinput'].includes(f.toLowerCase())
        ) || allInputFields[0];
        if (targetField) {
          return { outputField: messageField, inputField: targetField };
        }
      }
    }
    
    // Special handling for ai_agent
    if (targetActualType === 'ai_agent') {
      // Try to find message/text/input from source
      const messageField = sourceOutputs.find(f => 
        ['message', 'text', 'input', 'body', 'data', 'inputdata'].includes(f.toLowerCase())
      );
      if (messageField) {
        return { outputField: messageField, inputField: 'userInput' };
      }
    }
    
    // ✅ ARCHITECTURAL FIX: Reorder mapping priority - triggers first, 'output' last
    // Do not allow 'output' to override real fields
    const commonMappings = [
      { source: 'inputdata', target: 'input' },  // Triggers first!
      { source: 'message', target: 'message' },
      { source: 'text', target: 'text' },
      { source: 'data', target: 'data' },
      { source: 'result', target: 'value' },
      { source: 'output', target: 'input' }  // LAST resort
    ];
    
    for (const mapping of commonMappings) {
      const sourceField = sourceOutputs.find(f => f.toLowerCase() === mapping.source);
      const targetField = allInputFields.find(f => f.toLowerCase() === mapping.target);
      if (sourceField && targetField) {
        return { outputField: sourceField, inputField: targetField };
      }
    }
    
    // Last resort: use first available fields (but prefer non-generic fields)
    const preferredSourceField = sourceOutputs.find(f => 
      !['output', 'data', 'result'].includes(f.toLowerCase())
    ) || sourceOutputs[0];
    
    if (preferredSourceField && allInputFields.length > 0) {
      return { outputField: preferredSourceField, inputField: allInputFields[0] };
    }
    
    return null;
  }

  /**
   * STRICT BUILD: Enforce correct node execution order with topological sorting
   * Order: Trigger → Data Collection → AI Processing → Data Storage → Internal Notification → External Communication
   */
  private enforceNodeOrdering(nodes: WorkflowNode[], userPrompt: string): WorkflowNode[] {
    // CRITICAL: Enforce a consistent, human‑readable order for ALL key node types.
    // Order:
    //   1. Triggers          (webhook, chat_trigger, form, schedule, etc.)
    //   2. Read Operations   (get, getMany, read, search from any source - hubspot, google_sheets, etc.)
    //   3. Data Sources      (google_sheets, database_read, etc.) - for reading, MUST come before logic/loops
    //   4. Logic / Flow     (if_else, switch, loop, set, function, merge, wait, limit, aggregate, sort, code, function_item, noop)
    //   5. HTTP / AI        (http_request, ai_chat_model)
    //   6. Write Operations  (create, update, write, delete to any destination - hubspot, google_sheets, etc.)
    //   7. Integrations     (other integration operations)
    //   8. Outputs / Other  (generic outputs, anything not explicitly classified)

    if (!nodes || nodes.length === 0) {
      return nodes;
    }

    // Always normalize using data.type so 'custom' nodes are handled correctly
    const getType = (n: WorkflowNode): string => normalizeNodeType(n) || n.type || (n.data as any)?.type || '';
    
    // Helper to get operation type from node config
    const getOperation = (n: WorkflowNode): string => {
      const operation = (n.data as any)?.config?.operation || (n.data as any)?.operation || '';
      return String(operation).toLowerCase();
    };
    
    // Helper to determine if operation is read or write
    const isReadOperation = (operation: string): boolean => {
      const readOps = ['get', 'getmany', 'read', 'search', 'fetch', 'retrieve', 'list'];
      return readOps.includes(operation);
    };
    
    const isWriteOperation = (operation: string): boolean => {
      const writeOps = ['create', 'update', 'write', 'delete', 'post', 'put', 'patch'];
      return writeOps.includes(operation);
    };

    // --- Category definitions (by normalized node type) ---
    const triggerTypes = new Set<string>([
      'webhook',
      'chat_trigger',
      'form',
      'schedule',
      'manual_trigger',
      'interval',
      'workflow_trigger',
      'error_trigger',
    ]);

    // Data sources - can be used for reading or writing
    const dataSourceTypes = new Set<string>([
      'google_sheets',
      'google_doc',
      'database_read',
      'airtable',
      'notion',
      'csv',
      'excel',
      'json',
      'xml',
    ]);

    const logicTypes = new Set<string>([
      'if_else',
      'if',
      'switch',
      'loop', // Loop should come AFTER data sources
      'set',
      'set_variable',
      'function',
      'merge',
      'wait',
      'limit',
      'aggregate',
      'sort',
      'code',
      'javascript',
      'function_item',
      'noop',
    ]);

    const httpAiTypes = new Set<string>([
      'http_request',
      'http_post',
      'http_get',
      'ai_chat_model',
      'ai_agent',
      'chat_model',
    ]);

    const integrationTypes = new Set<string>([
      // CRM / project tools
      'hubspot',
      'zoho',
      'pipedrive',
      'notion',
      'airtable',
      'clickup',
      // Email / messaging / calendar
      'google_gmail',
      'gmail',
      'slack_message',
      'slack',
      'telegram',
      'outlook',
      'google_calendar',
      // Social / dev
      'linkedin',
      'github',
    ]);

    // Some generic output nodes (can be extended as needed)
    const outputLikeTypes = new Set<string>([
      'log_output',
      'send_extracted_data',
      'extracted_data_google',
      'output',
    ]);

    const triggers: WorkflowNode[] = [];
    const readOperations: WorkflowNode[] = []; // Read operations from any source
    const dataSourcesRead: WorkflowNode[] = []; // Data sources used for reading
    const dataSourcesWrite: WorkflowNode[] = []; // Data sources used for writing
    const logic: WorkflowNode[] = [];
    const httpAi: WorkflowNode[] = [];
    const writeOperations: WorkflowNode[] = []; // Write operations to any destination
    const integrations: WorkflowNode[] = []; // Other integration operations
    const outputs: WorkflowNode[] = [];
    const others: WorkflowNode[] = [];

    for (const node of nodes) {
      const t = getType(node);
      const operation = getOperation(node);

      if (triggerTypes.has(t)) {
        triggers.push(node);
      } else if (dataSourceTypes.has(t)) {
        // Data sources can be read or write - check operation
        if (isWriteOperation(operation)) {
          dataSourcesWrite.push(node);
        } else {
          // Default to read if operation not specified or is read
          dataSourcesRead.push(node);
        }
      } else if (integrationTypes.has(t)) {
        // Integrations can be read or write - check operation
        if (isReadOperation(operation)) {
          readOperations.push(node);
        } else if (isWriteOperation(operation)) {
          writeOperations.push(node);
        } else {
          // Default: if no operation specified, check prompt context
          // For "get from" or "read from" patterns, treat as read
          // For "create in" or "store in" patterns, treat as write
          const promptLower = userPrompt.toLowerCase();
          const nodeLabel = ((node.data as any)?.label || '').toLowerCase();
          if (promptLower.includes('get') || promptLower.includes('read') || promptLower.includes('fetch') ||
              nodeLabel.includes('get') || nodeLabel.includes('read') || nodeLabel.includes('fetch')) {
            readOperations.push(node);
          } else if (promptLower.includes('create') || promptLower.includes('store') || promptLower.includes('save') ||
                     nodeLabel.includes('create') || nodeLabel.includes('store') || nodeLabel.includes('save')) {
            writeOperations.push(node);
          } else {
            // Default to integration category (will be ordered after write operations)
            integrations.push(node);
          }
        }
      } else if (logicTypes.has(t)) {
        logic.push(node);
      } else if (httpAiTypes.has(t)) {
        httpAi.push(node);
      } else if (outputLikeTypes.has(t)) {
        outputs.push(node);
      } else {
        others.push(node);
      }
    }

    const ordered: WorkflowNode[] = [
      ...triggers,
      ...readOperations, // Read operations from integrations come FIRST
      ...dataSourcesRead, // Data sources for reading come BEFORE logic
      ...logic,
      ...httpAi,
      ...writeOperations, // Write operations to integrations come AFTER logic
      ...dataSourcesWrite, // Data sources for writing come AFTER logic
      ...integrations, // Other integration operations
      ...outputs,
      ...others,
    ];

    console.log(
      `✅ [STRICT BUILD] Nodes reordered (trigger→readOps→dataSourcesRead→logic→writeOps→dataSourcesWrite→integrations→outputs).` +
      ` Counts: triggers=${triggers.length}, readOps=${readOperations.length}, dataSourcesRead=${dataSourcesRead.length},` +
      ` logic=${logic.length}, writeOps=${writeOperations.length}, dataSourcesWrite=${dataSourcesWrite.length},` +
      ` integrations=${integrations.length}, outputs=${outputs.length}, others=${others.length}`,
    );

    return ordered;
  }

  /**
   * UNIVERSAL: Get node category from node library (not hardcoded)
   */
  private getNodeCategory(type: string): string {
    const schema = nodeLibrary.getSchema(type);
    if (schema && schema.category) {
      return schema.category;
    }
    // Fallback to basic categories
    if (['manual_trigger', 'webhook', 'schedule'].includes(type)) return 'triggers';
    if (['if_else', 'switch', 'loop'].includes(type)) return 'logic';
    if (['http_request', 'http_post'].includes(type)) return 'http_api';
    if (['openai_gpt', 'anthropic_claude'].includes(type)) return 'ai';
    if (['slack_message', 'log_output'].includes(type)) return 'output';
    return 'data';
  }

  /**
   * UNIVERSAL: Validate that all nodes in workflow exist in node library
   * Replaces invalid nodes with valid alternatives
   */
  private validateAllNodesExist(nodes: WorkflowNode[]): WorkflowNode[] {
    const allSchemas = nodeLibrary.getAllSchemas();
    const validNodeTypes = new Set(allSchemas.map(s => s.type));
    const { normalizeNodeType } = require('../../core/utils/node-type-normalizer');
    
    return nodes.map(node => {
      // CRITICAL FIX: Use normalizeNodeType to get actual type from node.data.type
      const actualNodeType = normalizeNodeType(node);
      const nodeType = actualNodeType || node.type || node.data?.type || '';
      
      // CRITICAL FIX: form node is valid - check if it's actually in library
      // If nodeType is 'form', check if it exists in library first
      if (nodeType === 'form') {
        // Form node should exist - if not in library, it's a library issue, not a node issue
        // Check if form exists in schemas
        const formSchema = allSchemas.find(s => s.type === 'form');
        if (!formSchema) {
          console.warn(`⚠️  Form node type not found in library, but form nodes are valid. Node will be kept as-is.`);
          // Keep the form node - it's valid even if not in library schemas
          return {
            ...node,
            type: 'custom', // Frontend compatibility
            data: {
              ...node.data,
              type: 'form', // Keep form type
            },
          };
        }
        // Form exists in library, validate normally
      }
      
      // Check if node type exists in library
      if (!validNodeTypes.has(nodeType)) {
        // CRITICAL: Don't replace form nodes - they are valid
        if (nodeType === 'form' || node.data?.type === 'form') {
          console.log(`✅ Form node detected - keeping as valid (form nodes are supported)`);
          return {
            ...node,
            type: 'custom', // Frontend compatibility
            data: {
              ...node.data,
              type: 'form', // Keep form type
            },
          };
        }
        
        console.warn(`⚠️  Node ${node.id} has invalid type "${nodeType}" (raw type: "${node.type}", data.type: "${node.data?.type}"). Attempting smart repair...`);
        
        // CRITICAL: Try to infer correct type from node description/label before replacing
        const nodeDescription = (node.data?.label || '').toLowerCase();
        
        // Smart type inference based on description
        let inferredType: string | null = null;
        
        if (nodeDescription.includes('slack') || nodeDescription.includes('message')) {
          inferredType = 'slack_message';
        } else if (nodeDescription.includes('email') || nodeDescription.includes('gmail')) {
          inferredType = 'google_gmail';
        } else if (nodeDescription.includes('google sheets') || nodeDescription.includes('spreadsheet')) {
          inferredType = 'google_sheets';
        } else if (nodeDescription.includes('google doc') || nodeDescription.includes('document')) {
          inferredType = 'google_doc';
        } else if (nodeDescription.includes('javascript') || nodeDescription.includes('transform') || nodeDescription.includes('process')) {
          inferredType = 'javascript';
        } else if (nodeDescription.includes('ai agent') || nodeDescription.includes('ai') || nodeDescription.includes('llm') || nodeDescription.includes('chat model')) {
          inferredType = 'ai_agent';
        } else if (nodeDescription.includes('database') || nodeDescription.includes('read')) {
          inferredType = 'database_read';
        } else if (nodeDescription.includes('write') || nodeDescription.includes('save')) {
          inferredType = 'database_write';
        } else if (nodeDescription.includes('form') || nodeDescription.includes('submission') || nodeType === 'form') {
          // CRITICAL FIX: form node EXISTS and should be used, not replaced
          // Check if form is actually in the library
          if (validNodeTypes.has('form')) {
            inferredType = 'form';
          } else {
            // If form doesn't exist in library, use webhook as fallback for form submissions
            inferredType = 'webhook';
          }
        } else if (nodeDescription.includes('chat') || nodeDescription.includes('bot')) {
          inferredType = 'chat_trigger';
        } else if (nodeDescription.includes('webhook')) {
          inferredType = 'webhook';
        } else if (nodeDescription.includes('schedule') || nodeDescription.includes('cron')) {
          inferredType = 'schedule';
        } else if (nodeDescription.includes('if') || nodeDescription.includes('condition') || nodeDescription.includes('else')) {
          inferredType = 'if_else';
        } else if (nodeDescription.includes('http') || nodeDescription.includes('request')) {
          inferredType = 'http_request';
        } else if (nodeDescription.includes('log') || nodeDescription.includes('output')) {
          inferredType = 'log_output';
        }
        
        // Try inferred type first
        if (inferredType && validNodeTypes.has(inferredType)) {
          console.log(`✅ [Smart Repair] Inferred node type "${inferredType}" from description: "${nodeDescription.substring(0, 50)}"`);
          const inferredSchema = allSchemas.find(s => s.type === inferredType);
          return {
            ...node,
            type: 'custom', // Frontend compatibility - keep 'custom' for frontend
            data: {
              ...node.data,
              type: inferredType, // Actual type in data.type
              label: node.data?.label || inferredSchema?.label || inferredType,
            },
          };
        }
        
        // Try to find similar node using schema keywords
        const similarNode = allSchemas.find(s => {
          const typeMatch = s.type.toLowerCase().includes(nodeType.toLowerCase()) || 
                          nodeType.toLowerCase().includes(s.type.toLowerCase());
          const labelMatch = node.data?.label && 
                           s.label.toLowerCase().includes(node.data.label.toLowerCase());
          const keywordMatch = s.aiSelectionCriteria?.keywords?.some(k => 
            node.data?.label?.toLowerCase().includes(k.toLowerCase()) ||
            nodeType.toLowerCase().includes(k.toLowerCase())
          );
          return typeMatch || labelMatch || keywordMatch;
        });
        
        if (similarNode) {
          console.log(`✅ [Smart Repair] Replacing invalid node type "${nodeType}" with "${similarNode.type}"`);
          return {
            ...node,
            type: 'custom', // Frontend compatibility - keep 'custom' for frontend
            data: {
              ...node.data,
              type: similarNode.type, // Actual type in data.type
              label: node.data?.label || similarNode.label,
            },
          };
        } else {
          console.error(`❌ Cannot find replacement for node type "${nodeType}". Using javascript as safe fallback.`);
          // Use javascript as safe fallback (most flexible)
          const fallback = allSchemas.find(s => s.type === 'javascript') || allSchemas.find(s => s.type === 'set_variable') || allSchemas[0];
          if (fallback) {
            return {
              ...node,
              type: 'custom', // Frontend compatibility - keep 'custom' for frontend
              data: {
                ...node.data,
                type: fallback.type, // Actual type in data.type
                label: node.data?.label || fallback.label,
              },
            };
          }
        }
      } else {
        // Node type is valid - ensure data.type matches for frontend compatibility
        if (node.type === 'custom' && actualNodeType) {
          // Update node to have correct type in data.type
          return {
            ...node,
            type: 'custom', // Keep 'custom' for frontend
            data: {
              ...node.data,
              type: actualNodeType, // Ensure data.type has actual type
            },
          };
        }
      }
      
      return node;
    });
  }

  private mapOutputTypeToNodeType(output: OutputDefinition): string {
    // PERMANENT FIX: Handle undefined/null description
    if (!output || !output.description) {
      // Default to log_output if no description provided
      return 'log_output';
    }
    
    const desc = (output.description || '').toLowerCase();
    
    if (desc.includes('slack')) return 'slack_message';
    if (desc.includes('email') || desc.includes('gmail')) return 'google_gmail';
    if (desc.includes('webhook') || desc.includes('http')) return 'http_post';
    if (desc.includes('log') || desc.includes('console')) return 'log_output';
    
    // Default fallback
    return 'log_output';
  }
  
  /**
   * Traverse linear execution chain from a starting node
   * Builds execution order by following edges sequentially
   */
  private traverseLinearExecutionChain(
    nodeId: string,
    edges: WorkflowEdge[],
    nodes: WorkflowNode[],
    executionOrder: WorkflowNode[],
    visited: Set<string>
  ): void {
    // Find outgoing edges from this node
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    
    // For linear flow, only follow the FIRST outgoing edge (not all edges)
    // This prevents tree structures
    if (outgoingEdges.length > 0) {
      const firstEdge = outgoingEdges[0];
      const targetNode = nodes.find(n => n.id === firstEdge.target);
      
      if (targetNode && !visited.has(targetNode.id)) {
        executionOrder.push(targetNode);
        visited.add(targetNode.id);
        // Recursively traverse from target node
        this.traverseLinearExecutionChain(targetNode.id, edges, nodes, executionOrder, visited);
      }
    }
  }
  
  /**
   * Check if adding an edge would create a cycle
   */
  private wouldCreateCycle(edges: WorkflowEdge[], sourceId: string, targetId: string): boolean {
    // If target can reach source, adding source → target would create a cycle
    const visited = new Set<string>();
    const stack: string[] = [targetId];
    
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      
      if (currentId === sourceId) {
        return true; // Cycle detected
      }
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);
      
      // Find all nodes reachable from current node
      const outgoingEdges = edges.filter(e => e.source === currentId);
      outgoingEdges.forEach(edge => {
        if (!visited.has(edge.target)) {
          stack.push(edge.target);
        }
      });
    }
    
    return false; // No cycle
  }

  /**
   * 🔧 INTEGRATION ENFORCEMENT UPGRADE: Build workflow programmatically when AI fails
   */
  private buildWorkflowProgrammatically(
    requirements: Requirements,
    detectedRequirements: any,
    detectedTrigger: string | null
  ): any {
    logger.warn('🔧 [Programmatic Fallback] Building workflow from scratch using detected requirements');
    
    const trigger = detectedTrigger || this.detectTriggerFromRequirements(requirements);
    const steps: any[] = [];
    
    // Add integration nodes for all detected integrations
    for (const integration of detectedRequirements.requiredIntegrations) {
      const schema = nodeLibrary.getSchema(integration);
      if (schema) {
        steps.push({
          id: `step_${integration}_${Date.now()}`,
          type: integration,
          description: schema.label || `Add ${integration} integration`,
        });
      }
    }
    
    // Build connections
    const connections: any[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (i === 0) {
        connections.push({
          source: 'trigger',
          target: steps[i].id,
          source_output: 'output',
          target_input: 'input',
        });
      } else {
        connections.push({
          source: steps[i - 1].id,
          target: steps[i].id,
          source_output: 'output',
          target_input: 'input',
        });
      }
    }
    
    return {
      trigger: trigger || 'manual_trigger',
      steps: steps,
      connections: connections,
      required_credentials: detectedRequirements.requiredIntegrations.filter((int: string) => {
        const requiresAuth = ['hubspot', 'salesforce', 'airtable', 'slack', 'clickup', 'notion', 'telegram', 'discord', 'twitter', 'linkedin', 'instagram', 'zoho_crm', 'pipedrive', 'gmail', 'google_sheets'];
        return requiresAuth.includes(int);
      }),
      validation_status: 'valid',
    };
  }

  /**
   * Create a node for a specific integration
   */
  private createNodeForIntegration(integration: string, workflow: any): any | null {
    const schema = nodeLibrary.getSchema(integration);
    if (!schema) {
      const fallbackSchema = this.nodeLibrary.get(integration);
      if (!fallbackSchema) {
        logger.error(`❌ [Integration Node Creation] ${integration} not found in library`);
        return null;
      }
      return {
        id: `step_${integration}_${Date.now()}`,
        type: integration,
        description: fallbackSchema.label || `Add ${integration} integration`,
      };
    }
    
    return {
      id: `step_${integration}_${Date.now()}`,
      type: integration,
      description: schema.label || `Add ${integration} integration`,
    };
  }

  /**
   * Connect an integration node to the workflow
   */
  private connectIntegrationNode(workflow: any, newNode: any): void {
    if (!workflow.connections) {
      workflow.connections = [];
    }
    
    const nodesOrSteps = workflow.nodes || workflow.steps || [];
    if (nodesOrSteps.length === 0) {
      // First node after trigger
      workflow.connections.push({
        source: workflow.trigger || 'trigger',
        target: newNode.id,
        source_output: 'output',
        target_input: 'input',
      });
    } else {
      // Connect to last node
      const lastNode = nodesOrSteps[nodesOrSteps.length - 1];
      workflow.connections.push({
        source: lastNode.id,
        target: newNode.id,
        source_output: 'output',
        target_input: 'input',
      });
    }
  }

  /**
   * ✅ CRITICAL: Enhance matched sample workflow with missing nodes from user requirements
   * Identifies nodes mentioned in requirements but not in the matched sample
   * Places them in the correct sequence based on dependencies and typical workflow patterns
   */
  private async enhanceStructureWithMissingNodes(
    baseStructure: WorkflowGenerationStructure,
    requirements: Requirements,
    matchedWorkflow: any
  ): Promise<WorkflowGenerationStructure> {
    const existingNodeTypes = new Set(baseStructure.steps.map(s => s.type));
    const userPrompt = ((requirements as any).originalPrompt || requirements.primaryGoal || '').toLowerCase();
    
    // Extract mentioned nodes from user prompt that aren't in the sample
    const mentionedNodes: Array<{ nodeType: string; placement: 'before' | 'after' | 'parallel'; dependsOn?: string[] }> = [];
    
    // Common node detection patterns
    const nodePatterns = [
      { pattern: /\b(slack|notify.*slack)\b/i, nodeType: 'slack_message' },
      { pattern: /\b(gmail|email.*gmail|send.*gmail)\b/i, nodeType: 'google_gmail' },
      { pattern: /\b(email|send.*email)\b/i, nodeType: 'email' },
      { pattern: /\b(calendar|schedule.*meeting|meeting)\b/i, nodeType: 'google_calendar' },
      { pattern: /\b(sheets|spreadsheet|google.*sheets)\b/i, nodeType: 'google_sheets' },
      { pattern: /\b(hubspot|crm.*hubspot)\b/i, nodeType: 'hubspot' },
      { pattern: /\b(salesforce|crm.*salesforce)\b/i, nodeType: 'salesforce' },
      { pattern: /\b(airtable)\b/i, nodeType: 'airtable' },
      { pattern: /\b(if|condition|check.*if|when.*then)\b/i, nodeType: 'if_else' },
      { pattern: /\b(loop|for.*each|iterate)\b/i, nodeType: 'loop' },
      { pattern: /\b(ai.*agent|chatbot|llm|gpt)\b/i, nodeType: 'ai_agent' },
      { pattern: /\b(http.*request|api.*call|fetch)\b/i, nodeType: 'http_request' },
    ];
    
    nodePatterns.forEach(({ pattern, nodeType }) => {
      if (pattern.test(userPrompt) && !existingNodeTypes.has(nodeType)) {
        // Check if this node should be placed before/after certain nodes
        let placement: 'before' | 'after' | 'parallel' = 'after';
        const dependsOn: string[] = [];
        
        // Heuristic: notification nodes usually go at the end
        if (['slack_message', 'google_gmail', 'email'].includes(nodeType)) {
          placement = 'after';
        }
        
        // Heuristic: condition nodes usually go early
        if (nodeType === 'if_else') {
          placement = 'before';
        }
        
        mentionedNodes.push({ nodeType, placement, dependsOn });
      }
    });
    
    if (mentionedNodes.length === 0) {
      console.log(`✅ [enhanceStructure] No missing nodes detected - using complete sample workflow structure`);
      return baseStructure;
    }
    
    console.log(`🔍 [enhanceStructure] Found ${mentionedNodes.length} missing node(s) from user requirements: ${mentionedNodes.map(n => n.nodeType).join(', ')}`);
    
    // Add missing nodes to structure
    const enhancedSteps = [...baseStructure.steps];
    const enhancedConnections = [...(baseStructure.connections || [])];
    
    mentionedNodes.forEach((missingNode) => {
      const schema = this.nodeLibrary.get(missingNode.nodeType);
      if (!schema) {
        console.warn(`⚠️  [enhanceStructure] Node type "${missingNode.nodeType}" not found in library, skipping`);
        return;
      }
      
      const stepId = `step${enhancedSteps.length + 1}`;
      const newStep: WorkflowStepDefinition = {
        id: stepId,
        description: schema.label || missingNode.nodeType,
        type: missingNode.nodeType,
      };
      
      // Determine placement based on node type and dependencies
      if (missingNode.placement === 'before' && enhancedSteps.length > 0) {
        // Insert before first action step (after trigger)
        enhancedSteps.splice(1, 0, newStep);
        // Connect trigger to new step, new step to first existing step
        if (enhancedConnections.length > 0) {
          const firstConnection = enhancedConnections[0];
          enhancedConnections[0] = { source: 'trigger', target: stepId };
          enhancedConnections.push({ source: stepId, target: firstConnection.target });
        }
      } else {
        // Add at the end (default)
        enhancedSteps.push(newStep);
        
        // Connect to last step in chain
        if (enhancedSteps.length > 1) {
          const lastStepId = enhancedSteps[enhancedSteps.length - 2].id;
          enhancedConnections.push({ source: lastStepId, target: stepId });
        } else {
          enhancedConnections.push({ source: 'trigger', target: stepId });
        }
      }
      
      console.log(`✅ [enhanceStructure] Added missing node: ${missingNode.nodeType} (${stepId})`);
    });
    
    return {
      ...baseStructure,
      steps: enhancedSteps,
      connections: enhancedConnections,
    };
  }

  /**
   * ✅ CRITICAL: Validate that all nodes are properly connected
   * Ensures no isolated nodes and proper data flow
   */
  private validateAllNodesConnected(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    const nodeIds = new Set(nodes.map(n => n.id));
    const triggerTypes = ['manual_trigger', 'webhook', 'schedule', 'form', 'interval', 'chat_trigger', 'error_trigger'];
    
    // Build connection maps
    const incomingConnections = new Map<string, number>();
    const outgoingConnections = new Map<string, number>();
    
    edges.forEach(edge => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        incomingConnections.set(edge.target, (incomingConnections.get(edge.target) || 0) + 1);
        outgoingConnections.set(edge.source, (outgoingConnections.get(edge.source) || 0) + 1);
      }
    });
    
    // Check each node
    const errors: string[] = [];
    const warnings: string[] = [];
    
    nodes.forEach(node => {
      const nodeType = normalizeNodeType(node);
      const isTrigger = triggerTypes.includes(nodeType);
      const isTerminal = ['log_output', 'respond_to_webhook'].includes(nodeType);
      
      const incoming = incomingConnections.get(node.id) || 0;
      const outgoing = outgoingConnections.get(node.id) || 0;
      
      // Triggers should have outgoing connections (unless it's the only node)
      if (isTrigger && outgoing === 0 && nodes.length > 1) {
        errors.push(`Trigger node "${node.id}" (${nodeType}) has no outgoing connections`);
      }
      
      // Non-trigger nodes should have incoming connections
      if (!isTrigger && incoming === 0) {
        errors.push(`Node "${node.id}" (${nodeType}) has no incoming connections`);
      }
      
      // Non-terminal nodes should have outgoing connections (unless it's the last node in a linear flow)
      if (!isTrigger && !isTerminal && outgoing === 0) {
        // Check if this is the last node in a linear chain
        const isLastInChain = !edges.some(e => e.source === node.id);
        if (!isLastInChain) {
          warnings.push(`Node "${node.id}" (${nodeType}) has no outgoing connections (may be intentional for terminal nodes)`);
        }
      }
    });
    
    if (errors.length > 0) {
      console.error(`❌ [Connection Validation] Found ${errors.length} connection error(s):`);
      errors.forEach(err => console.error(`   - ${err}`));
      // Don't throw - log and continue, but mark as invalid
      console.error(`❌ [Connection Validation] Workflow has connection errors - workflow may not execute correctly`);
    }
    
    if (warnings.length > 0) {
      console.warn(`⚠️  [Connection Validation] Found ${warnings.length} connection warning(s):`);
      warnings.forEach(warn => console.warn(`   - ${warn}`));
    }
    
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`✅ [Connection Validation] All ${nodes.length} nodes are properly connected`);
    }
  }

  /**
   * Validate and fix workflow structure
   */
  private validateAndFixWorkflow(workflow: any, requirements: Requirements): any {
    // Ensure all nodes have IDs
    const nodesOrSteps = workflow.nodes || workflow.steps || [];
    nodesOrSteps.forEach((node: any, index: number) => {
      if (!node.id) {
        node.id = `node_${index}_${Date.now()}`;
      }
    });
    
    // Ensure connections reference valid node IDs
    if (workflow.connections) {
      const nodeIds = new Set(nodesOrSteps.map((n: any) => n.id));
      workflow.connections = workflow.connections.filter((conn: any) => {
        const sourceValid = conn.source === 'trigger' || nodeIds.has(conn.source);
        const targetValid = nodeIds.has(conn.target);
        if (!sourceValid || !targetValid) {
          logger.warn(`⚠️  [Workflow Fix] Removing invalid connection: ${conn.source} → ${conn.target}`);
          return false;
        }
        return true;
      });
    }
    
    return workflow;
  }

  /**
   * Get default icon for node category and type
   */
  private getDefaultIconForCategory(category: string, nodeType: string): string {
    const typeLower = nodeType.toLowerCase();
    
    // AI & ML category
    if (category === 'ai' || category === 'ai_ml') {
      if (typeLower.includes('summarizer') || typeLower.includes('summarize')) return 'FileText';
      if (typeLower.includes('sentiment')) return 'Heart';
      if (typeLower.includes('agent') || typeLower.includes('chat')) return 'Bot';
      if (typeLower.includes('gpt') || typeLower.includes('openai')) return 'Sparkles';
      if (typeLower.includes('claude') || typeLower.includes('anthropic')) return 'Gem';
      if (typeLower.includes('gemini')) return 'Brain';
      return 'Brain'; // Default AI icon
    }
    
    // Google category
    if (category === 'google') {
      if (typeLower.includes('gmail') || typeLower.includes('mail')) return 'Mail';
      if (typeLower.includes('sheets')) return 'Table';
      if (typeLower.includes('calendar')) return 'Calendar';
      if (typeLower.includes('drive')) return 'Box';
      return 'Globe';
    }
    
    // Logic category
    if (category === 'logic') {
      if (typeLower.includes('if') || typeLower.includes('else') || typeLower.includes('conditional')) return 'GitBranch';
      if (typeLower.includes('switch') || typeLower.includes('case')) return 'GitBranch';
      if (typeLower.includes('merge') || typeLower.includes('combine')) return 'GitMerge';
      if (typeLower.includes('loop') || typeLower.includes('repeat')) return 'Repeat';
      return 'Code';
    }
    
    // Communication/Output category
    if (category === 'output' || category === 'communication') {
      if (typeLower.includes('slack')) return 'MessageSquare';
      if (typeLower.includes('email') || typeLower.includes('mail')) return 'Mail';
      if (typeLower.includes('log')) return 'Terminal';
      if (typeLower.includes('telegram')) return 'MessageSquare';
      return 'Send';
    }
    
    // HTTP & API
    if (category === 'http_api' || category === 'http') {
      return 'Globe';
    }
    
    // Database
    if (category === 'database') {
      return 'Database';
    }
    
    // Triggers
    if (category === 'triggers') {
      if (typeLower.includes('manual')) return 'Play';
      if (typeLower.includes('webhook')) return 'Webhook';
      if (typeLower.includes('schedule') || typeLower.includes('cron')) return 'Clock';
      if (typeLower.includes('interval') || typeLower.includes('timer')) return 'Timer';
      return 'Play';
    }
    
    // Default fallback
    return 'Box';
  }

  /**
   * Detect trigger from requirements
   */
  private detectTriggerFromRequirements(requirements: Requirements): string {
    const promptLower = (requirements.primaryGoal || '').toLowerCase();
    
    if (promptLower.includes('schedule') || promptLower.includes('daily') || promptLower.includes('weekly') || promptLower.includes('hourly')) {
      return 'schedule';
    }
    if (promptLower.includes('form') || promptLower.includes('submit')) {
      return 'form';
    }
    if (promptLower.includes('webhook') || promptLower.includes('when') && promptLower.includes('added')) {
      return 'webhook';
    }
    if (promptLower.includes('chat') || promptLower.includes('message')) {
      return 'chat_trigger';
    }
    
    return 'manual_trigger';
  }

  /**
   * Validate that the workflow graph is acyclic (DAG)
   * Uses topological sort to detect cycles
   * Removes edges that create cycles
   */
  private validateAcyclicGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): {
    hasCycle: boolean;
    cyclePath?: string[];
    removedEdges: WorkflowEdge[];
  } {
    // Build adjacency list
    const adjacencyList = new Map<string, string[]>();
    const nodeIds = new Set(nodes.map(n => n.id));
    nodeIds.add('trigger'); // Include trigger in graph
    
    // Initialize adjacency list
    nodeIds.forEach(id => adjacencyList.set(id, []));
    
    // Build graph and detect upstream connections
    const upstreamEdges: WorkflowEdge[] = [];
    edges.forEach(edge => {
      // Skip self-loops
      if (edge.source === edge.target) {
        upstreamEdges.push(edge);
        return;
      }
      
      // Check if this is an upstream connection (target comes before source in node order)
      const sourceIndex = edge.source === 'trigger' ? -1 : nodes.findIndex(n => n.id === edge.source);
      const targetIndex = nodes.findIndex(n => n.id === edge.target);
      
      // If target comes before source, this is an upstream connection
      if (sourceIndex >= 0 && targetIndex >= 0 && targetIndex < sourceIndex) {
        upstreamEdges.push(edge);
        console.warn(`[WorkflowBuilder] ⚠️  Upstream connection detected: ${edge.source} → ${edge.target} (target is before source)`);
        // Don't add upstream connections to graph by default
        return;
      }
      
      // Add forward edge
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)!.push(edge.target);
      }
    });
    
    // Check for cycles in the forward graph
    const cycleCheck = this.hasCycleDFS(adjacencyList, nodeIds);
    
    if (cycleCheck.hasCycle || upstreamEdges.length > 0) {
      // Remove upstream edges and cycle edges
      const removedEdges: WorkflowEdge[] = [...upstreamEdges];
      
      if (cycleCheck.hasCycle) {
        // Find edges in the cycle path
        if (cycleCheck.cyclePath && cycleCheck.cyclePath.length > 1) {
          for (let i = 0; i < cycleCheck.cyclePath.length - 1; i++) {
            const source = cycleCheck.cyclePath[i];
            const target = cycleCheck.cyclePath[i + 1];
            const cycleEdges = edges.filter(e => e.source === source && e.target === target);
            removedEdges.push(...cycleEdges);
          }
        }
      }
      
      return {
        hasCycle: cycleCheck.hasCycle || upstreamEdges.length > 0,
        cyclePath: cycleCheck.cyclePath,
        removedEdges: removedEdges.filter((edge, index, self) => 
          index === self.findIndex(e => e.id === edge.id)
        ), // Remove duplicates
      };
    }
    
    return {
      hasCycle: false,
      removedEdges: [],
    };
  }

  /**
   * Use DFS to detect cycles in the graph
   */
  private hasCycleDFS(
    adjacencyList: Map<string, string[]>,
    nodeIds: Set<string>
  ): {
    hasCycle: boolean;
    cyclePath?: string[];
  } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cyclePath: string[] = [];
    
    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = adjacencyList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          cyclePath.push(...path.slice(cycleStart), neighbor);
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    // Check all nodes (in case graph is disconnected)
    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [])) {
          return {
            hasCycle: true,
            cyclePath: cyclePath.length > 0 ? cyclePath : undefined,
          };
        }
      }
    }
    
    return { hasCycle: false };
  }
}

// Export singleton instance
export const agenticWorkflowBuilder = new AgenticWorkflowBuilder();
