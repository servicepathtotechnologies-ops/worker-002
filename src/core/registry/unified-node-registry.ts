/**
 * UNIFIED NODE REGISTRY
 * 
 * This is the SINGLE SOURCE OF TRUTH for all node definitions.
 * 
 * Architecture Rules:
 * 1. ALL node behavior MUST be defined here
 * 2. Execution engine MUST fetch definitions from here
 * 3. Validators MUST reference schemas from here
 * 4. Workflow builders MUST hydrate defaults from here
 * 5. NO hardcoded node logic allowed elsewhere
 * 
 * This ensures:
 * - Permanent fixes apply to ALL workflows
 * - Infinite scalability (500+ node types)
 * - Backward compatibility via migrations
 * - Type safety and validation
 */

import { 
  UnifiedNodeDefinition, 
  INodeRegistry, 
  NodeCredentialRequirement,
  NodeCredentialSchema,
  NodeOutputSchema,
  NodeInputSchema,
  NodeInputField,
  NodeMigration,
  NodeExecutionContext,
  EffectiveOutputSchema,
  FieldFillMode,
} from '../types/unified-node-contract';
import { nodeLibrary, CANONICAL_NODE_TYPES, isValidCanonicalNodeType } from '../../services/nodes/node-library';
import { applyNodeDefinitionOverrides } from './unified-node-registry-overrides';
import { executeViaLegacyExecutor } from './unified-node-registry-legacy-adapter';
import { resolveEffectiveFieldFillMode } from '../utils/fill-mode-resolver';
import { getBranchOutgoingPortsForNode } from '../utils/branching-node-ports';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';
import {
  inferFieldHelpMetadata,
} from '../utils/field-help-metadata';
import type { FieldHelpCategory } from '../utils/field-help-metadata';
import { classifyFieldOwnership, isCredentialOwnership } from '../utils/field-ownership';
import type { Workflow } from '../types/ai-types';
import { enrichCredentialSchema } from '../../credentials-system/credential-requirements';

export interface BuildValueContext {
  upstreamFields: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
  targetFields: Array<{
    name: string;
    role: string;
    type: string;
    fillMode: any;
    essentialForExecution: boolean;
    supportsBuildtimeAI: boolean;
  }>;
}

export class UnifiedNodeRegistry implements INodeRegistry {
  private static instance: UnifiedNodeRegistry;
  private definitions: Map<string, UnifiedNodeDefinition> = new Map();
  /** Lazily cached list of definitions in the `communication` category (for planner disambiguation). */
  private communicationCategoryDefsCache: UnifiedNodeDefinition[] | null = null;
  /** Lowercased keywords derived from nodes that declare email/Gmail send capabilities (for intent matching). */
  private emailChannelIntentKeywordCache: string[] | null = null;
  /** Exact phrase index derived from live registry metadata for alias-like canonical resolution. */
  private registryAliasIndexCache: Map<string, string[]> | null = null;

  /**
   * Single source of truth for all node type alias → canonical type mappings.
   * Email aliases must NEVER map to AI/LLM node types.
   * All resolution goes through this map — no external resolver files needed.
   */
  private readonly ALIAS_MAP: Record<string, string> = {
    // ── Email (must resolve to google_gmail, never ollama) ──────────────────
    'email': 'google_gmail',
    'mail': 'google_gmail',
    'gmail': 'google_gmail',
    'send_email': 'google_gmail',
    'google_mail': 'google_gmail',
    'send via gmail': 'google_gmail',
    'google email': 'google_gmail',
    'gmail_send': 'google_gmail',
    'email_send': 'google_gmail',
    'google_gmail': 'google_gmail',
    // ── Outlook / SMTP ───────────────────────────────────────────────────────
    'outlook': 'outlook',
    'microsoft_mail': 'outlook',
    'outlook_mail': 'outlook',
    'smtp': 'email',           // generic SMTP → email node
    // ── Amazon SES ───────────────────────────────────────────────────────────
    'amazon_ses': 'amazon_ses',
    'ses': 'amazon_ses',
    'amazon-ses': 'amazon_ses',
    'aws-ses': 'amazon_ses',
    'aws_ses': 'amazon_ses',
    'amazon ses': 'amazon_ses',
    'aws ses': 'amazon_ses',
    'send via amazon ses': 'amazon_ses',
    'send via aws ses': 'amazon_ses',
    // ── Slack ────────────────────────────────────────────────────────────────
    'slack': 'slack_message',
    'slack_send': 'slack_message',
    'send_slack': 'slack_message',
    'slack_message': 'slack_message',
    // ── Google Sheets ────────────────────────────────────────────────────────
    'sheets': 'google_sheets',
    'gsheets': 'google_sheets',
    'google_sheet': 'google_sheets',
    'spreadsheet': 'google_sheets',
    'sheet': 'google_sheets',
    'google_sheets': 'google_sheets',
    // ── Google services ──────────────────────────────────────────────────────
    'gdoc': 'google_doc',
    'google_document': 'google_doc',
    'google_doc': 'google_doc',
    'gdrive': 'google_drive',
    'google_drive': 'google_drive',
    'drive': 'google_drive',
    'gcal': 'google_calendar',
    'calendar': 'google_calendar',
    'google_cal': 'google_calendar',
    'google_calendar': 'google_calendar',
    // ── Triggers ─────────────────────────────────────────────────────────────
    'manual': 'manual_trigger',
    'manual_trigger': 'manual_trigger',
    'webhook_trigger': 'webhook',
    'http_trigger': 'webhook',
    'webhook': 'webhook',
    'schedule_trigger': 'schedule',
    'cron': 'schedule',
    'schedule': 'schedule',
    'interval_trigger': 'interval',
    'interval': 'interval',
    'form_trigger': 'form',
    'form_submission': 'form',
    'form': 'form',
    'chat_trigger': 'chat_trigger',
    'error_trigger': 'error_trigger',
    // ── Logic ────────────────────────────────────────────────────────────────
    'if': 'if_else',
    'if_else': 'if_else',
    'conditional': 'if_else',
    'condition': 'if_else',
    'switch': 'switch',
    'switch_case': 'switch',
    'merge': 'merge',
    'loop': 'loop',
    'filter': 'filter',
    'split_in_batches': 'split_in_batches',
    'batch': 'split_in_batches',
    // ── AI nodes ─────────────────────────────────────────────────────────────
    'ai': 'ai_chat_model',
    'ai_service': 'ai_chat_model',
    'llm': 'ai_chat_model',
    'ai_chat': 'ai_chat_model',
    'chat_model': 'ai_chat_model',
    'ai_chat_model': 'ai_chat_model',
    'ai_agent': 'ai_agent',
    'agent': 'ai_agent',
    'local_ai': 'ollama',
    'local_llm': 'ollama',
    'ollama': 'ollama',
    'text_summarizer': 'text_summarizer',
    'summarizer': 'text_summarizer',
    'sentiment_analyzer': 'sentiment_analyzer',
    // ── Communication ────────────────────────────────────────────────────────
    'telegram': 'telegram',
    'telegram_send': 'telegram',
    'discord': 'discord',
    'discord_send': 'discord',
    'microsoft_teams': 'microsoft_teams',
    'teams': 'microsoft_teams',
    'ms_teams': 'microsoft_teams',
    'whatsapp_cloud': 'whatsapp_cloud',
    'twilio': 'twilio',
    'sms': 'twilio',
    // ── Mailgun ──────────────────────────────────────────────────────────────
    'mailgun': 'mailgun',
    'mailgun_email': 'mailgun',
    'mailgun email': 'mailgun',
    'mailgun_send': 'mailgun',
    'mailgun send': 'mailgun',
    'send via mailgun': 'mailgun',
    'mail_gun': 'mailgun',
    // ── SendGrid ─────────────────────────────────────────────────────────────
    'sendgrid': 'sendgrid',
    'send_grid': 'sendgrid',
    'sendgrid_email': 'sendgrid',
    'sendgrid email': 'sendgrid',
    'sendgrid_send': 'sendgrid',
    'sendgrid send': 'sendgrid',
    'send via sendgrid': 'sendgrid',
    'email service': 'sendgrid',
    'send email sendgrid': 'sendgrid',
    // ── CRM ──────────────────────────────────────────────────────────────────
    'hubspot': 'hubspot',
    'hub_spot': 'hubspot',
    'salesforce': 'salesforce',
    'sf': 'salesforce',
    'airtable': 'airtable',
    'air_table': 'airtable',
    'zoho_crm': 'zoho_crm',
    'zoho': 'zoho_crm',
    'pipedrive': 'pipedrive',
    'pipe_drive': 'pipedrive',
    'intuit': 'intuit_smes',
    'intuit_smes': 'intuit_smes',
    'intuit smes': 'intuit_smes',
    'quickbooks': 'intuit_smes',
    'intuit quickbooks': 'intuit_smes',
    'notion': 'notion',
    // ── Tally ERP ────────────────────────────────────────────────────────────
    'tally': 'tally',
    'tally erp': 'tally',
    'tallyprime': 'tally',
    'tally prime': 'tally',
    'tally solutions': 'tally',
    'tally_erp': 'tally',
    'tally_prime': 'tally',
    'tally_solutions': 'tally',
    'tally accounting': 'tally',
    'tally_accounting': 'tally',
    // ── Microsoft Dynamics ───────────────────────────────────────────────────
    'microsoft_dynamics': 'microsoft_dynamics',
    'dynamics': 'microsoft_dynamics',
    'dynamics_365': 'microsoft_dynamics',
    'dynamics365': 'microsoft_dynamics',
    'dynamics crm': 'microsoft_dynamics',
    'dynamics_crm': 'microsoft_dynamics',
    'ms dynamics': 'microsoft_dynamics',
    'ms_dynamics': 'microsoft_dynamics',
    'microsoft dynamics': 'microsoft_dynamics',
    'microsoft dynamics 365': 'microsoft_dynamics',
    'msdynamics': 'microsoft_dynamics',
    // ── SAP ERP ──────────────────────────────────────────────────────────────
    'sap': 'sap',
    'sap_erp': 'sap',
    'sap erp': 'sap',
    'sap_api': 'sap',
    'sap api': 'sap',
    'sap_odata': 'sap',
    'sap odata': 'sap',
    's4hana': 'sap',
    's/4hana': 'sap',
    'sap_s4hana': 'sap',
    'sap s4hana': 'sap',
    'sap hana': 'sap',
    'sap_hana': 'sap',
    'sap business one': 'sap',
    'sap_business_one': 'sap',
    'sap_b1': 'sap',
    'sap b1': 'sap',
    'sap_ecc': 'sap',
    'sap ecc': 'sap',
    // ── Database ─────────────────────────────────────────────────────────────
    'postgresql': 'postgresql',
    'postgres': 'postgresql',
    'pg': 'postgresql',
    'mysql': 'mysql',
    'mongodb': 'mongodb',
    'mongo': 'mongodb',
    'mongo_db': 'mongodb',
    'db': 'db',
    'redis': 'redis',
    'firebase': 'firebase',
    'firestore': 'firebase',
    'firebase_firestore': 'firebase',
    'firebase_realtime': 'firebase',
    'firebase_realtime_database': 'firebase',
    'gcs': 'google_cloud_storage',
    'google_storage': 'google_cloud_storage',
    'cloud_storage': 'google_cloud_storage',
    'google_cloud_storage': 'google_cloud_storage',
    // ── Odoo ERP ─────────────────────────────────────────────────────────────
    'odoo': 'odoo',
    'odoo erp': 'odoo',
    'odoo crm': 'odoo',
    'open erp': 'odoo',
    'openerp': 'odoo',
    'erp': 'odoo',
    'database_write': 'database_write',
    'database_read': 'database_read',
    // ── HTTP ─────────────────────────────────────────────────────────────────
    'http_request': 'http_request',
    'http': 'http_request',
    'api': 'http_request',
    'api_call': 'http_request',
    'graphql': 'graphql',
    'gql': 'graphql',
    'respond_to_webhook': 'respond_to_webhook',
    'webhook_response': 'respond_to_webhook',
    'response': 'respond_to_webhook',
    // ── Logging ──────────────────────────────────────────────────────────────
    'log_output': 'log_output',
    'log': 'log_output',
    'logger': 'log_output',
    // ── Social ───────────────────────────────────────────────────────────────
    'twitter': 'twitter',
    'tweet': 'twitter',
    'x': 'twitter',
    'instagram': 'instagram',
    'ig': 'instagram',
    'insta': 'instagram',
    'instagram_trigger': 'instagram_trigger',
    'facebook': 'facebook',
    'fb': 'facebook',
    'youtube': 'youtube',
    'yt': 'youtube',
    'linkedin': 'linkedin',
    'linked_in': 'linkedin',
    'whatsapp': 'whatsapp',
    'wa': 'whatsapp',
    'whatsapp_trigger': 'whatsapp_trigger',
    // ── DevOps ───────────────────────────────────────────────────────────────
    'github': 'github',
    'git_hub': 'github',
    'gh': 'github',
    'gitlab': 'gitlab',
    'git_lab': 'gitlab',
    'bitbucket': 'bitbucket',
    'jira': 'jira',
    // ── Storage ──────────────────────────────────────────────────────────────
    'aws_s3': 'aws_s3',
    's3': 'aws_s3',
    'amazon_s3': 'aws_s3',
    'dropbox': 'dropbox',
    'dbx': 'dropbox',
    'onedrive': 'onedrive',
    'one_drive': 'onedrive',
    // ── E-commerce ───────────────────────────────────────────────────────────
    'shopify': 'shopify',
    'stripe': 'stripe',
    // ── Data manipulation ────────────────────────────────────────────────────
    'set_variable': 'set_variable',
    'javascript': 'javascript',
    'js': 'javascript',
    'json_parser': 'json_parser',
    'csv': 'csv',
    'csv_parser': 'csv',
    'csv_processor': 'csv',
    'aggregate': 'aggregate',
    'sort': 'sort',
    'limit': 'limit',
    'wait': 'wait',
    'delay': 'delay',
    // ── Video Conferencing ───────────────────────────────────────────────────
    'zoom': 'zoom_video',
    'zoom_video': 'zoom_video',
    'zoom_meeting': 'zoom_video',
    'zoom meeting': 'zoom_video',
    'video call': 'zoom_video',
    'video_call': 'zoom_video',
    'zoom_call': 'zoom_video',
    'zoom call': 'zoom_video',
  };
  
  private constructor() {
    console.log('[UnifiedNodeRegistry] 🏗️  Initializing Unified Node Registry...');
    this.initializeFromNodeLibrary();
    console.log(`[UnifiedNodeRegistry] ✅ Initialized with ${this.definitions.size} node definitions`);
    
    // ✅ PRODUCTION-GRADE: Startup integrity check
    // Ensure every canonical type has a UnifiedNodeDefinition
    this.validateIntegrity();
  }
  
  /**
   * ✅ PRODUCTION-GRADE: Validate registry integrity on startup
   * 
   * Ensures every canonical node type has a corresponding UnifiedNodeDefinition
   * If mismatch found → throw error and stop boot
   */
  private validateIntegrity(): void {
    const missingTypes: string[] = [];
    
    for (const canonicalType of CANONICAL_NODE_TYPES) {
      if (!this.definitions.has(canonicalType)) {
        missingTypes.push(canonicalType);
      }
    }
    
    if (missingTypes.length > 0) {
      const error = new Error(
        `[UnifiedNodeRegistry] ❌ Integrity check failed: ` +
        `${missingTypes.length} canonical node type(s) missing from registry: ${missingTypes.slice(0, 5).join(', ')}... ` +
        `This indicates a system initialization failure. All canonical types must have UnifiedNodeDefinitions.`
      );
      console.error(error.message);
      throw error;
    }
    
    console.log(
      `[UnifiedNodeRegistry] ✅ Integrity check passed: All ${CANONICAL_NODE_TYPES.length} canonical types have definitions`
    );
  }
  
  static getInstance(): UnifiedNodeRegistry {
    if (!UnifiedNodeRegistry.instance) {
      UnifiedNodeRegistry.instance = new UnifiedNodeRegistry();
    }
    return UnifiedNodeRegistry.instance;
  }
  
  /**
   * Initialize registry from existing NodeLibrary
   * This bridges the old system to the new unified contract
   */
  private initializeFromNodeLibrary(): void {
    const allSchemas = nodeLibrary.getAllSchemas();
    const failedSchemas: string[] = [];
    
    for (const schema of allSchemas) {
      try {
        const baseDefinition = this.convertNodeLibrarySchemaToUnified(schema);
        const overridden = applyNodeDefinitionOverrides(baseDefinition, schema);
        // ✅ Universal fix: overrides can change inputSchema ownership/helpCategory.
        // Credential schema must be derived from the final (post-override) inputSchema,
        // otherwise the UI may ask twice (config + credential) for the same field.
        const extractedCredentialSchema = this.extractCredentialSchema(schema, overridden.inputSchema);
        const definition: UnifiedNodeDefinition = {
          ...overridden,
          credentialSchema: this.mergeCredentialSchema(overridden.credentialSchema, extractedCredentialSchema),
        };
        this.register(definition);
      } catch (error: any) {
        console.error(`[UnifiedNodeRegistry] ⚠️  Failed to convert schema for ${schema.type}:`, error?.message || error);
        failedSchemas.push(schema.type);
      }
    }
    
    // ✅ CRITICAL: Verify log_output is registered (common failure point)
    if (!this.definitions.has('log_output')) {
      console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output not registered! Failed schemas: ${failedSchemas.join(', ')}`);
      // Try to register log_output explicitly
      const logOutputSchema = nodeLibrary.getSchema('log_output');
      if (logOutputSchema) {
        try {
          console.log(`[UnifiedNodeRegistry] 🔄 Attempting explicit registration of log_output...`);
          const baseDefinition = this.convertNodeLibrarySchemaToUnified(logOutputSchema);
          const overridden = applyNodeDefinitionOverrides(baseDefinition, logOutputSchema);
          const extractedCredentialSchema = this.extractCredentialSchema(logOutputSchema, overridden.inputSchema);
          const definition: UnifiedNodeDefinition = {
            ...overridden,
            credentialSchema: this.mergeCredentialSchema(overridden.credentialSchema, extractedCredentialSchema),
          };
          this.register(definition);
          console.log(`[UnifiedNodeRegistry] ✅ Successfully registered log_output after retry`);
          
          // ✅ VERIFY: Double-check it's actually registered
          if (!this.definitions.has('log_output')) {
            console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output registration succeeded but still not found in registry!`);
          } else {
            console.log(`[UnifiedNodeRegistry] ✅ VERIFIED: log_output is now in registry`);
          }
        } catch (retryError: any) {
          console.error(`[UnifiedNodeRegistry] ❌ Failed to register log_output even after retry:`, retryError?.message || retryError);
          console.error(`[UnifiedNodeRegistry] ❌ Stack trace:`, retryError?.stack);
          
          // ✅ CRITICAL: If log_output fails to register, this is a system integrity issue
          // Log detailed error for debugging
          console.error(`[UnifiedNodeRegistry] ❌ CRITICAL ERROR: log_output is a critical node and MUST be registered.`);
          console.error(`[UnifiedNodeRegistry] ❌ Schema structure:`, JSON.stringify({
            type: logOutputSchema.type,
            hasConfigSchema: !!logOutputSchema.configSchema,
            hasRequired: !!logOutputSchema.configSchema?.required,
            hasOptional: !!logOutputSchema.configSchema?.optional,
          }, null, 2));
        }
      } else {
        console.error(`[UnifiedNodeRegistry] ❌ CRITICAL: log_output schema not found in NodeLibrary!`);
      }
    } else {
      console.log(`[UnifiedNodeRegistry] ✅ log_output is registered (found in definitions)`);
    }
    
    if (failedSchemas.length > 0) {
      console.warn(`[UnifiedNodeRegistry] ⚠️  ${failedSchemas.length} schema(s) failed to convert: ${failedSchemas.join(', ')}`);
    }
  }
  
  /**
   * Convert NodeLibrary schema to UnifiedNodeDefinition
   * This is a bridge function for backward compatibility
   */
  private convertNodeLibrarySchemaToUnified(schema: any): UnifiedNodeDefinition {
    // Extract input schema from configSchema
    const inputSchema: NodeInputSchema = {};
    const requiredInputs: string[] = [];
    
    // Helper to derive universal, registry-driven default fill mode metadata
    const getDefaultFillMode = (fieldName: string, fieldType: string): {
      default: FieldFillMode;
      supportsRuntimeAI?: boolean;
      supportsBuildtimeAI?: boolean;
    } => {
      const normalizedType = (fieldType || 'string').toLowerCase();
      const field = (fieldName || '').toLowerCase();
      // Must align with inferRole title_like / long_body: subject & titles are filled by AI or upstream,
      // not fixed at design time like spreadsheet IDs.
      const isRuntimeSemanticText =
        field.includes('subject') ||
        field.includes('title') ||
        field.includes('heading') ||
        field.includes('prompt') ||
        field.includes('message') ||
        field.includes('body') ||
        field.includes('content') ||
        field.includes('text') ||
        field.includes('summary') ||
        field.includes('description');
      const isStructureSemanticField =
        field === 'fields' ||
        field.includes('condition') ||
        field.includes('case') ||
        field.includes('rule') ||
        field.includes('schema') ||
        field.includes('layout') ||
        field.includes('template') ||
        field.includes('formtitle') ||
        field.includes('formdescription') ||
        field.includes('submitbutton') ||
        field.includes('successmessage') ||
        field.includes('placeholder') ||
        field.includes('label') ||
        field.includes('options');
      const isDeterministicConfig =
        field.includes('id') ||
        field.includes('key') ||
        field.includes('token') ||
        field.includes('secret') ||
        field.includes('credential') ||
        field.includes('sheetname') ||
        field.includes('spreadsheet') ||
        field.includes('range') ||
        field.includes('url') ||
        field.includes('endpoint') ||
        field.includes('method');

      // Structural shape fields are finalized before runtime; runtime_ai must not own schema keys.
      if (isStructureSemanticField) {
        return {
          default: 'buildtime_ai_once',
          supportsRuntimeAI: false,
          supportsBuildtimeAI: true,
        };
      }
      // Text-like fields: always default to manual so manually placed nodes start empty.
      // User or AI can switch to runtime_ai; supportsRuntimeAI stays true.
      if (normalizedType === 'string' || normalizedType === 'expression') {
        return {
          default: 'manual_static',
          supportsRuntimeAI: true,
          supportsBuildtimeAI: true,
        };
      }
      // JSON / object / array fields: can be mapped from upstream at runtime,
      // but build-time AI should not fabricate structures.
      if (normalizedType === 'object' || normalizedType === 'array' || normalizedType === 'json') {
        return {
          default: 'manual_static',
          supportsRuntimeAI: true,
          supportsBuildtimeAI: true,
        };
      }
      // Scalars: generally manual configuration only.
      return {
        default: 'manual_static',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: false,
      };
    };

    const inferRole = (fieldName: string, fieldType: string): 'title_like' | 'long_body' | 'short_summary' | 'raw_json' | 'id' | 'config' | 'prompt' | 'recipient' | 'content' => {
      const f = (fieldName || '').toLowerCase();
      const t = (fieldType || '').toLowerCase();
      if (f.includes('subject') || f.includes('title') || f.includes('heading')) return 'title_like';
      if (f.includes('body') || f.includes('message') || f.includes('content')) return 'long_body';
      if (f.includes('summary')) return 'short_summary';
      if (f.includes('prompt') || f.includes('query')) return 'prompt';
      if (f.includes('recipient') || f === 'to' || f.includes('email')) return 'recipient';
      if (f.endsWith('id') || f.includes('id')) return 'id';
      if (t === 'object' || t === 'array' || t === 'json') return 'raw_json';
      if (t === 'string') return 'content';
      return 'config';
    };

    const inferEssentialForExecution = (required: boolean, fieldName: string): boolean => {
      if (required) return true;
      const f = (fieldName || '').toLowerCase();
      return (
        f.includes('text') ||
        f.includes('subject') ||
        f.includes('body') ||
        f.includes('message') ||
        f.includes('prompt') ||
        f.includes('input')
      );
    };

    /** Maps NodeLibrary optional/required field defs to Properties panel / API `ui` metadata. */
    const libraryFieldUi = (fieldName: string, raw: Record<string, unknown> | undefined): NodeInputField['ui'] | undefined => {
      if (!raw || typeof raw !== 'object') return undefined;
      const fd = raw as Record<string, unknown>;
      const out: NonNullable<NodeInputField['ui']> = {};
      const opts = fd.options;
      if (Array.isArray(opts) && opts.length > 0) {
        out.options = opts as NonNullable<NodeInputField['ui']>['options'];
      }
      const isSelectLikeField = ['operation', 'resource', 'event', 'serviceType'].includes(fieldName);
      if (!out.options && isSelectLikeField) {
        const optionValues = new Set<string>();
        if (typeof fd.default === 'string' && fd.default.trim()) {
          optionValues.add(fd.default.trim());
        }
        if (Array.isArray(fd.examples)) {
          for (const example of fd.examples) {
            if (typeof example === 'string' && example.trim() && !example.includes('{{')) {
              optionValues.add(example.trim());
            }
          }
        }
        if (optionValues.size > 0) {
          out.options = Array.from(optionValues).map((value) => ({
            value,
            label: value
              .replace(/_/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/^./, (c) => c.toUpperCase()),
          }));
        }
      }
      const reqIf = fd.requiredIf;
      if (reqIf && typeof reqIf === 'object' && reqIf !== null && 'field' in (reqIf as object)) {
        out.requiredIf = reqIf as NonNullable<NodeInputField['ui']>['requiredIf'];
      }
      const visIf = fd.visibleIf;
      if (visIf && typeof visIf === 'object' && visIf !== null && 'field' in (visIf as object)) {
        out.visibleIf = visIf as NonNullable<NodeInputField['ui']>['visibleIf'];
      }
      if (fieldName.toLowerCase() === 'recipientemails') {
        out.widget = 'multi_email';
      }
      const ctxHints = fd.contextHints;
      if (Array.isArray(ctxHints) && ctxHints.length > 0) {
        out.contextHints = ctxHints as NonNullable<NodeInputField['ui']>['contextHints'];
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };
    
    // Process required fields
    if (schema.configSchema?.required) {
      for (const fieldName of schema.configSchema.required) {
        requiredInputs.push(fieldName);
        const optionalField = schema.configSchema.optional?.[fieldName];
        const type = optionalField?.type || 'string';
        const ui = libraryFieldUi(fieldName, optionalField as Record<string, unknown> | undefined);
        inputSchema[fieldName] = {
          type,
          description: optionalField?.description || `${fieldName} field`,
          required: true,
          default: optionalField?.default,
          examples: optionalField?.examples,
          validation: optionalField?.validation,
          fillMode: (optionalField as any)?.fillMode ?? getDefaultFillMode(fieldName, type),
          role: inferRole(fieldName, type),
          essentialForExecution: inferEssentialForExecution(true, fieldName),
          ...(ui ? { ui } : {}),
        };
      }
    }
    
    // Process optional fields
    if (schema.configSchema?.optional) {
      for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
        if (!inputSchema[fieldName]) {
          const type = (fieldDef as any).type || 'string';
          const ui = libraryFieldUi(fieldName, fieldDef as Record<string, unknown>);
          inputSchema[fieldName] = {
            type,
            description: (fieldDef as any).description || `${fieldName} field`,
            required: false,
            default: (fieldDef as any).default,
            examples: (fieldDef as any).examples,
            validation: (fieldDef as any).validation,
            fillMode: (fieldDef as any).fillMode ?? getDefaultFillMode(fieldName, type),
            role: inferRole(fieldName, type),
            essentialForExecution: inferEssentialForExecution(false, fieldName),
            ...(ui ? { ui } : {}),
          };
        }
      }
    }

    // Registry-wide "how to get it" / credential UX metadata (single inference path)
    for (const fieldName of Object.keys(inputSchema)) {
      const fd = inputSchema[fieldName];
      const meta = inferFieldHelpMetadata(schema.type, fieldName, fd.type);
      fd.helpCategory = meta.helpCategory;
      fd.ownership = classifyFieldOwnership(fieldName, fd);
      if (meta.docsUrl) {
        fd.docsUrl = meta.docsUrl;
      }
      const ex = fd.examples;
      if (!fd.exampleValue && Array.isArray(ex) && ex.length > 0) {
        const first = ex[0];
        if (typeof first === 'string' && first.length > 0 && first.length <= 200) {
          fd.exampleValue = first;
        }
      }
    }

    // Extract output schema
    const outputSchema: NodeOutputSchema = {
      default: {
        name: 'default',
        description: 'Default output port',
        schema: {
          type: schema.outputType || 'object',
          properties: schema.outputSchema || {},
        },
      },
    };
    
    // Extract credential schema (merged with helpCategory-driven fields)
    const credentialSchema = this.extractCredentialSchema(schema, inputSchema);
    
    // Create default config factory
    const defaultConfig = () => {
      const config: Record<string, any> = {};
      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        // Include all fields, even those with null, empty string, or undefined defaults
        config[fieldName] = fieldDef.default;
      }
      return config;
    };
    
    // Create validation function
    const validateConfig = (config: Record<string, any>) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate required fields
      for (const fieldName of requiredInputs) {
        const effectiveMode = resolveEffectiveFieldFillMode(fieldName, inputSchema, config);
        if (effectiveMode === 'runtime_ai') {
          continue;
        }
        if (config[fieldName] === undefined || config[fieldName] === null || 
            (typeof config[fieldName] === 'string' && config[fieldName].trim() === '')) {
          errors.push(`Required field '${fieldName}' is missing or empty`);
        }
      }
      
      // ✅ ROOT-LEVEL FIX: Validate field types with conversion
      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        const value = config[fieldName];
        if (value !== undefined && value !== null) {
          // Check type compatibility
          const expectedType = fieldDef.type as any;
          const actualType = getValueType(value);
          
          if (!isTypeCompatible(actualType, expectedType)) {
            // Try to convert
            try {
              const { convertToType } = require('../utils/type-converter');
              const conversion = convertToType(value, expectedType, fieldName);
              if (conversion.success) {
                // Type converted successfully - update config
                config[fieldName] = conversion.value;
                warnings.push(`Field '${fieldName}': Type converted from ${actualType} to ${expectedType}`);
              } else {
                errors.push(`Field '${fieldName}': Type mismatch: ${actualType} cannot be assigned to ${expectedType}`);
              }
            } catch (error: any) {
              errors.push(`Field '${fieldName}': Type mismatch: ${actualType} cannot be assigned to ${expectedType}`);
            }
          }
          
          // Run custom validators
          if (fieldDef.validation) {
            const validationResult = fieldDef.validation(value);
            if (validationResult !== true) {
              errors.push(`Field '${fieldName}': ${validationResult}`);
            }
          }
        }
      }
      
      // Helper functions for type checking
      function getValueType(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        return typeof value;
      }
      
      function isTypeCompatible(actualType: string, expectedType: string): boolean {
        if (actualType === expectedType) return true;
        if (expectedType === 'string') return true; // String can accept most types
        if (expectedType === 'email' && actualType === 'string') return true;
        if (expectedType === 'datetime' && actualType === 'string') return true;
        if (expectedType === 'number' && actualType === 'string') return true;
        if (expectedType === 'boolean' && (actualType === 'string' || actualType === 'number')) return true;
        if (expectedType === 'array' && actualType === 'object') return true;
        if (expectedType === 'object' && actualType === 'array') return true;
        if (expectedType === 'json' && actualType === 'object') return true;
        return false;
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    };
    
    // Create execute function (delegates to legacy execution engine via adapter)
    // Node-specific behavior must be implemented via per-node overrides (see unified-node-registry-overrides.ts)
    const execute = async (context: NodeExecutionContext) => {
      return await executeViaLegacyExecutor({ context, schema });
    };
    
    // ✅ ROOT-LEVEL FIX: Intelligent category mapping for ALL nodes
    // This ensures correct categorization based on schema category, operations, and tags
    const normalizedCategory = this.normalizeNodeCategory(schema);
    
    // ✅ ROOT-LEVEL FIX: Set ports based on node category (applies to ALL nodes universally)
    // This prevents "Invalid handle 'default'" errors by ensuring all nodes have correct port names
    // - Triggers: No incoming ports (they start workflows), outgoingPorts: ['output']
    // - All other nodes: incomingPorts: ['input'], outgoingPorts: ['output']
    // Special nodes (if_else, switch, etc.) will override these in their override files
    const incomingPorts = normalizedCategory === 'trigger' ? [] : ['input'];
    const outgoingPorts = ['output'];
    
    return {
      type: schema.type,
      label: schema.label,
      category: normalizedCategory,
      description: schema.description,
      version: schema.schemaVersion || '1.0.0',
      inputSchema,
      outputSchema,
      credentialSchema,
      requiredInputs,
      defaultConfig,
      validateConfig,
      execute,
      incomingPorts,
      outgoingPorts,
      isBranching: false,
      aiSelectionCriteria: schema.aiSelectionCriteria,
      tags: schema.keywords || [],
      capabilities: Array.isArray(schema.capabilities) ? schema.capabilities : [],
    };
  }
  
  /**
   * ✅ ROOT-LEVEL FIX: Normalize node category intelligently
   * 
   * This ensures ALL nodes are correctly categorized based on:
   * 1. Schema category (social, crm, database, etc.)
   * 2. Operations (post, send, create, write → output/communication)
   * 3. Tags (output, send, notify → communication)
   * 4. Node type patterns (linkedin, twitter → communication)
   * 
   * This is a UNIVERSAL fix that applies to ALL nodes automatically.
   */
  private normalizeNodeCategory(schema: any): string {
    const originalCategory = (schema.category || '').toLowerCase();
    const nodeType = (schema.type || '').toLowerCase();
    const keywords = (schema.keywords || []).map((k: string) => k.toLowerCase());
    const tags = keywords;

    // Direct pass-through for categories that already match frontend IDs
    const directMap: Record<string, ReturnType<typeof this.normalizeNodeCategory>> = {
      'triggers': 'trigger',
      'trigger': 'trigger',
      'ai': 'ai',
      'logic': 'logic',
      'flow': 'logic',
      'workflow': 'logic',
      'data': 'data',
      'transformation': 'data',
      'database': 'database',
      'google': 'google',
      'productivity': 'productivity',
      'crm': 'crm',
      'devops': 'devops',
      'ecommerce': 'ecommerce',
      'payment': 'payment',
      'cms': 'cms',
      'file': 'storage',
      'storage': 'storage',
      'http_api': 'http_api',
      'integration': 'http_api',
      'auth': 'authentication',
      'authentication': 'authentication',
      'social': 'social_media',
      'social_media': 'social_media',
      'output': 'output',
      'communication': 'output',
      'microsoft': 'output',
      'analytics': 'analytics',
      'queue': 'utility',
      'cache': 'utility',
      'actions': 'utility',
      'utility': 'utility',
    };

    if (originalCategory && directMap[originalCategory] !== undefined) {
      // Special case: google_gmail and similar google communication nodes belong to 'output'
      const socialMediaTypes = ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube'];
      const isSocialMedia = socialMediaTypes.some(s => nodeType.includes(s));
      const communicationTypes = ['gmail', 'email', 'slack', 'discord', 'telegram', 'teams', 'whatsapp', 'twilio', 'sendgrid', 'mailgun'];
      const isCommunication = communicationTypes.some(c => nodeType.includes(c));
      if (isSocialMedia) return 'social_media';
      if (isCommunication && (originalCategory === 'google' || originalCategory === 'microsoft')) return 'output';
      return directMap[originalCategory];
    }

    // Node-type pattern matching for nodes with ambiguous/missing categories
    const socialMediaTypes = ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube'];
    const isSocialMedia = socialMediaTypes.some(s => nodeType.includes(s));
    if (isSocialMedia || originalCategory === 'social') return 'social_media';

    const communicationTypes = ['gmail', 'email', 'slack', 'discord', 'telegram', 'teams', 'whatsapp', 'twilio', 'sendgrid', 'mailgun', 'notify', 'message'];
    const isCommunication = communicationTypes.some(c => nodeType.includes(c));
    if (isCommunication) return 'output';

    const triggerTypes = ['trigger', 'schedule', 'webhook', 'interval', 'form_trigger', 'chat_trigger', 'error_trigger', 'workflow_trigger'];
    if (triggerTypes.some(t => nodeType.includes(t))) return 'trigger';

    const aiTypes = ['ai_chat_model', 'ai_agent', 'ai_service', 'ollama', 'openai', 'gpt', 'claude', 'gemini', 'text_summarizer', 'sentiment_analyzer', 'chat_model', 'memory'];
    if (aiTypes.some(a => nodeType.includes(a)) || tags.some((t: string) => ['ai', 'llm', 'agent'].includes(t))) return 'ai';

    const logicTypes = ['if_else', 'switch', 'merge', 'try_catch', 'retry', 'parallel', 'loop', 'noop', 'split_in_batches', 'stop_and_error'];
    if (logicTypes.some(l => nodeType.includes(l)) || tags.some((t: string) => ['conditional', 'branch', 'merge'].includes(t))) return 'logic';

    const databaseTypes = ['postgres', 'mysql', 'mongodb', 'bigquery', '_db', 'sql_'];
    if (databaseTypes.some(d => nodeType.includes(d))) return 'database';

    const googleTypes = ['google_sheets', 'google_doc', 'google_drive', 'google_calendar', 'google_contacts', 'google_tasks', 'google_bigquery'];
    if (googleTypes.some(g => nodeType.includes(g))) return 'google';

    const productivityTypes = ['notion', 'airtable', 'clickup', 'asana', 'monday', 'trello'];
    if (productivityTypes.some(p => nodeType.includes(p))) return 'productivity';

    const crmTypes = ['hubspot', 'salesforce', 'zoho', 'pipedrive', 'freshdesk', 'intercom', 'mailchimp', 'activecampaign', 'dynamics', 'odoo'];
    if (crmTypes.some(c => nodeType.includes(c))) return 'crm';

    const devopsTypes = ['github', 'gitlab', 'bitbucket', 'jira', 'jenkins', 'circleci', 'travis'];
    if (devopsTypes.some(d => nodeType.includes(d))) return 'devops';

    const ecommerceTypes = ['shopify', 'woocommerce'];
    if (ecommerceTypes.some(e => nodeType.includes(e))) return 'ecommerce';

    const paymentTypes = ['stripe', 'paypal', 'braintree', 'square', 'razorpay'];
    if (paymentTypes.some(p => nodeType.includes(p))) return 'payment';

    const cmsTypes = ['wordpress', 'contentful', 'strapi', 'ghost', 'drupal'];
    if (cmsTypes.some(c => nodeType.includes(c))) return 'cms';

    const storageTypes = ['s3', 'dropbox', 'onedrive', 'ftp', 'sftp', 'binary_file'];
    if (storageTypes.some(s => nodeType.includes(s))) return 'storage';

    const httpTypes = ['http_request', 'http_response', 'http_post', 'webhook_response', 'graphql', 'rest_api'];
    if (httpTypes.some(h => nodeType.includes(h))) return 'http_api';

    const authTypes = ['oauth', 'api_key_auth', 'jwt_auth'];
    if (authTypes.some(a => nodeType.includes(a))) return 'authentication';

    const dataTypes = ['json_parser', 'merge_data', 'edit_fields', 'math', 'html', 'xml', 'csv', 'rename_keys', 'aggregate', 'sort', 'limit', 'set_variable', 'text_formatter', 'date_time'];
    if (dataTypes.some(d => nodeType.includes(d))) return 'data';

    const utilityTypes = ['wait', 'delay', 'timeout', 'return', 'execute_workflow', 'code', 'function_item'];
    if (utilityTypes.some(u => nodeType.includes(u))) return 'utility';

    // Default fallback
    return 'utility';
  }
  
  /**
   * Maps provider name → preferred credentialTypeId (and its display label).
   * Used to enrich every node's credentialSchema.requirements with the right
   * credentialTypeId so the Properties panel shows the correct connection picker.
   */
  private static readonly PROVIDER_CREDENTIAL_MAP: Record<string, { credentialTypeId: string; label: string; authType: 'oauth2' | 'api_key' | 'bearer_token' | 'basic_auth' }> = {
    // AI
    gemini:        { credentialTypeId: 'gemini_api_key',       label: 'Gemini API Key',          authType: 'api_key' },
    openai:        { credentialTypeId: 'openai_api_key',       label: 'OpenAI API Key',           authType: 'bearer_token' },
    anthropic:     { credentialTypeId: 'anthropic_api_key',    label: 'Anthropic API Key',        authType: 'api_key' },
    pinecone:      { credentialTypeId: 'pinecone_api_key',     label: 'Pinecone API Key',         authType: 'api_key' },
    qdrant:        { credentialTypeId: 'qdrant_api_key',       label: 'Qdrant API Key',           authType: 'api_key' },
    cohere:        { credentialTypeId: 'cohere_api_key',       label: 'Cohere API Key',           authType: 'api_key' },
    huggingface:   { credentialTypeId: 'huggingface_token',    label: 'Hugging Face Token',       authType: 'bearer_token' },
    mistral:       { credentialTypeId: 'mistral_api_key',      label: 'Mistral API Key',          authType: 'api_key' },
    // Google OAuth
    google:        { credentialTypeId: 'google_oauth2',        label: 'Google OAuth2',            authType: 'oauth2' },
    // Communication / messaging
    slack:         { credentialTypeId: 'slack_oauth2',         label: 'Slack Connection',         authType: 'oauth2' },
    discord:         { credentialTypeId: 'discord_bot_token',    label: 'Discord Bot Token',        authType: 'bearer_token' },
    discord_webhook: { credentialTypeId: 'discord_webhook',      label: 'Discord Webhook URL',      authType: 'api_key' },
    telegram:      { credentialTypeId: 'telegram_bot_token',   label: 'Telegram Bot Token',       authType: 'api_key' },
    whatsapp:      { credentialTypeId: 'whatsapp_api_key',     label: 'WhatsApp API Key',         authType: 'bearer_token' },
    twilio:        { credentialTypeId: 'twilio_api_key',       label: 'Twilio API Key',           authType: 'basic_auth' },
    sendgrid:      { credentialTypeId: 'sendgrid_api_key',     label: 'SendGrid API Key',         authType: 'bearer_token' },
    mailgun:       { credentialTypeId: 'mailgun_api',          label: 'Mailgun API Key',          authType: 'api_key' },
    mailchimp:     { credentialTypeId: 'mailchimp_api_key',    label: 'Mailchimp API Key',        authType: 'api_key' },
    activecampaign:{ credentialTypeId: 'activecampaign_api',   label: 'ActiveCampaign API Key',   authType: 'api_key' },
    // Project management
    notion:        { credentialTypeId: 'notion_api_key',       label: 'Notion API Key',           authType: 'bearer_token' },
    airtable:      { credentialTypeId: 'airtable_api_key',     label: 'Airtable API Key',         authType: 'bearer_token' },
    clickup:       { credentialTypeId: 'clickup_api_token',    label: 'ClickUp API Token',        authType: 'bearer_token' },
    linear:        { credentialTypeId: 'linear_api_key',       label: 'Linear API Key',           authType: 'bearer_token' },
    trello:        { credentialTypeId: 'trello_api_key',       label: 'Trello API Key',           authType: 'api_key' },
    asana:         { credentialTypeId: 'asana_oauth2',         label: 'Asana Connection',         authType: 'oauth2' },
    // CRM
    hubspot:       { credentialTypeId: 'hubspot_oauth2',       label: 'HubSpot Connection',       authType: 'oauth2' },
    salesforce:    { credentialTypeId: 'salesforce_oauth2',    label: 'Salesforce Connection',    authType: 'oauth2' },
    pipedrive:     { credentialTypeId: 'pipedrive_api_key',    label: 'Pipedrive API Key',        authType: 'api_key' },
    zoho:          { credentialTypeId: 'zoho_oauth2',          label: 'Zoho Connection',          authType: 'oauth2' },
    freshdesk:     { credentialTypeId: 'freshdesk_api_key',    label: 'Freshdesk API Key',        authType: 'basic_auth' },
    intercom:      { credentialTypeId: 'intercom_token',       label: 'Intercom Token',           authType: 'bearer_token' },
    zendesk:       { credentialTypeId: 'zendesk_api',          label: 'Zendesk API Key',          authType: 'basic_auth' },
    // Social media
    twitter:       { credentialTypeId: 'twitter_oauth2',       label: 'Twitter Connection',       authType: 'oauth2' },
    facebook:      { credentialTypeId: 'facebook_oauth2',      label: 'Facebook Connection',      authType: 'oauth2' },
    instagram:     { credentialTypeId: 'instagram_oauth2',     label: 'Instagram Connection',     authType: 'oauth2' },
    linkedin:      { credentialTypeId: 'linkedin_oauth2',      label: 'LinkedIn Connection',      authType: 'oauth2' },
    youtube:       { credentialTypeId: 'youtube_oauth2',       label: 'YouTube Connection',       authType: 'oauth2' },
    // DevOps
    github:        { credentialTypeId: 'github_pat',           label: 'GitHub Personal Token',    authType: 'bearer_token' },
    gitlab:        { credentialTypeId: 'gitlab_pat',           label: 'GitLab Personal Token',    authType: 'bearer_token' },
    bitbucket:     { credentialTypeId: 'bitbucket_app_password', label: 'Bitbucket App Password', authType: 'basic_auth' },
    jira:          { credentialTypeId: 'jira_api_key',         label: 'Jira API Key',             authType: 'basic_auth' },
    jenkins:       { credentialTypeId: 'jenkins_api_token',    label: 'Jenkins API Token',        authType: 'basic_auth' },
    vercel:        { credentialTypeId: 'vercel_api_key',       label: 'Vercel API Token',         authType: 'bearer_token' },
    // Payment
    stripe:        { credentialTypeId: 'stripe_api_key',       label: 'Stripe API Key',           authType: 'bearer_token' },
    paypal:        { credentialTypeId: 'paypal_oauth2',        label: 'PayPal Connection',        authType: 'oauth2' },
    shopify:       { credentialTypeId: 'shopify_api_key',      label: 'Shopify API Key',          authType: 'api_key' },
    woocommerce:   { credentialTypeId: 'woocommerce_api_key',  label: 'WooCommerce API Key',      authType: 'basic_auth' },
    typeform:      { credentialTypeId: 'typeform_token',       label: 'Typeform Token',           authType: 'bearer_token' },
    calendly:      { credentialTypeId: 'calendly_api',         label: 'Calendly API Key',         authType: 'bearer_token' },
    xero:          { credentialTypeId: 'xero_oauth2',          label: 'Xero Connection',          authType: 'oauth2' },
    // Cloud / infra
    aws:           { credentialTypeId: 'aws_s3_api_key',       label: 'AWS Credentials',          authType: 'api_key' },
    cloudflare:    { credentialTypeId: 'cloudflare_api_key',   label: 'Cloudflare API Key',       authType: 'bearer_token' },
    dropbox:       { credentialTypeId: 'dropbox_oauth2',       label: 'Dropbox Connection',       authType: 'oauth2' },
    microsoft:     { credentialTypeId: 'microsoft_oauth2',     label: 'Microsoft Connection',     authType: 'oauth2' },
    zoom:          { credentialTypeId: 'zoom_oauth2',          label: 'Zoom Connection',          authType: 'oauth2' },
    // Databases
    postgresql:    { credentialTypeId: 'postgresql_connection', label: 'PostgreSQL Connection',   authType: 'basic_auth' },
    mysql:         { credentialTypeId: 'mysql_connection',     label: 'MySQL Connection',         authType: 'basic_auth' },
    mongodb:       { credentialTypeId: 'mongodb_connection',   label: 'MongoDB Connection',       authType: 'basic_auth' },
    redis:         { credentialTypeId: 'redis_connection',     label: 'Redis Connection',         authType: 'api_key' },
    firebase:      { credentialTypeId: 'firebase_credentials', label: 'Firebase Credentials',     authType: 'api_key' },
    sftp:          { credentialTypeId: 'sftp_credentials',     label: 'SFTP Credentials',         authType: 'basic_auth' },
    ftp:           { credentialTypeId: 'ftp_credentials',      label: 'FTP Credentials',          authType: 'basic_auth' },
    odoo:          { credentialTypeId: 'odoo_credentials',     label: 'Odoo Credentials',         authType: 'basic_auth' },
  };

  private enrichRequirementsWithCredentialType(
    requirements: NodeCredentialRequirement[],
    provider: string,
  ): NodeCredentialRequirement[] {
    const mapping = UnifiedNodeRegistry.PROVIDER_CREDENTIAL_MAP[provider.toLowerCase()];
    if (!mapping) return requirements;
    return requirements.map((req) => {
      if (req.credentialTypeId) return req; // already set by override — don't overwrite
      return {
        ...req,
        credentialTypeId: mapping.credentialTypeId,
        authType: req.authType ?? mapping.authType,
        label: req.label ?? mapping.label,
      };
    });
  }

  /**
   * Extract credential schema from NodeLibrary schema + unified inputSchema help metadata
   */
  private extractCredentialSchema(schema: any, inputSchema: NodeInputSchema): NodeCredentialSchema | undefined {
    const requirements: NodeCredentialRequirement[] = [];
    const credentialFieldsSet = new Set<string>();
    const provider =
      Array.isArray(schema.providers) && typeof schema.providers[0] === 'string'
        ? schema.providers[0]
        : this.inferProviderFromNodeType(schema.type) || schema.type;

    // Credential schema is ownership-driven only.
    for (const [fieldName, fd] of Object.entries(inputSchema)) {
      if (!isCredentialOwnership(fieldName, fd)) continue;
      if (credentialFieldsSet.has(fieldName)) continue;
      credentialFieldsSet.add(fieldName);
      if (provider) {
        const category = this.inferCredentialCategory(fieldName, fd.helpCategory);
        if (category === undefined) continue;
        requirements.push({
          provider,
          category,
          required: schema.configSchema?.required?.includes(fieldName) || false,
          description: fd.description || `${fieldName} credential`,
        });
      }
    }
    
    const credentialFields = Array.from(credentialFieldsSet);
    if (requirements.length === 0 && credentialFields.length === 0) {
      // If schema.providers is explicitly declared and the first provider maps to a known
      // credential type, synthesize a picker requirement so the UI shows the connection
      // selector even when the node has no ownership-marked fields.
      // Guard: only fires when providers[] is explicitly set — utility/trigger nodes that
      // carry no providers array are unaffected.
      if (Array.isArray(schema.providers) && schema.providers.length > 0) {
        const firstProvider = String(schema.providers[0]).toLowerCase();
        const mapping = UnifiedNodeRegistry.PROVIDER_CREDENTIAL_MAP[firstProvider];
        if (mapping) {
          const syntheticReq: NodeCredentialRequirement = {
            provider: String(schema.providers[0]),
            category: mapping.authType === 'oauth2' ? 'oauth' : 'api_key',
            required: false,
            description: `${mapping.label} connection`,
            credentialTypeId: mapping.credentialTypeId,
            authType: mapping.authType,
            label: mapping.label,
          };
          return enrichCredentialSchema({ requirements: [syntheticReq], credentialFields: [] });
        }
      }
      return undefined;
    }

    if (requirements.length === 0 && credentialFields.length > 0 && provider) {
      requirements.push({
        provider,
        category: 'api_key',
        required: credentialFields.some((fieldName) => schema.configSchema?.required?.includes(fieldName)),
        description: `${schema.label || schema.type} credentials`,
      });
    }

    const enrichedRequirements = this.enrichRequirementsWithCredentialType(requirements, provider);

    return enrichCredentialSchema({
      requirements: enrichedRequirements,
      credentialFields,
    });
  }

  private mergeCredentialSchema(
    explicitSchema: NodeCredentialSchema | undefined,
    extractedSchema: NodeCredentialSchema | undefined,
  ): NodeCredentialSchema | undefined {
    if (!explicitSchema) return enrichCredentialSchema(extractedSchema);
    if (!extractedSchema) return enrichCredentialSchema(explicitSchema);

    const requirements = [...(explicitSchema.requirements || [])];
    // Two-tier dedup: first by credentialTypeId (most specific), then by provider (one picker per service)
    const seenKeys = new Set(
      requirements.map((req) => req.credentialTypeId || `${req.provider}:${req.category}:${req.required}`),
    );
    const seenProviders = new Set(
      requirements.map((req) => req.provider).filter((p): p is string => Boolean(p)),
    );
    for (const req of extractedSchema.requirements || []) {
      const key = req.credentialTypeId || `${req.provider}:${req.category}:${req.required}`;
      if (seenKeys.has(key)) continue;
      if (req.provider && seenProviders.has(req.provider)) continue;
      seenKeys.add(key);
      if (req.provider) seenProviders.add(req.provider);
      requirements.push(req);
    }

    const credentialFields = Array.from(new Set([
      ...(explicitSchema.credentialFields || []),
      ...(extractedSchema.credentialFields || []),
    ]));

    return enrichCredentialSchema({ requirements, credentialFields });
  }
  
  private inferProviderFromNodeType(nodeType: string): string | undefined {
    const typeLower = nodeType.toLowerCase();
    // Gemini uses an API key, not Google OAuth — must come before the generic 'google' check
    if (typeLower === 'google_gemini') return 'gemini';
    if (typeLower.includes('google')) return 'google';
    if (typeLower.includes('slack')) return 'slack';
    if (typeLower === 'discord_webhook') return 'discord_webhook';
    if (typeLower.includes('discord')) return 'discord';
    if (typeLower.includes('openai') || typeLower.includes('gpt')) return 'openai';
    if (typeLower.includes('anthropic') || typeLower.includes('claude')) return 'anthropic';
    if (typeLower.includes('notion')) return 'notion';
    if (typeLower.includes('airtable')) return 'airtable';
    if (typeLower.includes('vercel')) return 'vercel';
    if (typeLower.includes('salesforce')) return 'salesforce';
    if (typeLower.includes('hubspot')) return 'hubspot';
    if (typeLower.includes('pipedrive')) return 'pipedrive';
    if (typeLower.includes('zoho')) return 'zoho';
    if (typeLower.includes('odoo')) return 'odoo';
    if (typeLower.includes('mailchimp')) return 'mailchimp';
    if (typeLower.includes('activecampaign')) return 'activecampaign';
    if (typeLower.includes('intercom')) return 'intercom';
    if (typeLower.includes('freshdesk')) return 'freshdesk';
    if (typeLower.includes('postgres') || typeLower === 'database_read' || typeLower === 'database_write') return 'postgresql';
    if (typeLower.includes('mysql')) return 'mysql';
    if (typeLower.includes('mongo')) return 'mongodb';
    if (typeLower.includes('redis')) return 'redis';
    if (typeLower.includes('github')) return 'github';
    if (typeLower.includes('gitlab')) return 'gitlab';
    if (typeLower.includes('bitbucket')) return 'bitbucket';
    if (typeLower.includes('jira')) return 'jira';
    if (typeLower.includes('jenkins')) return 'jenkins';
    if (typeLower.includes('clickup')) return 'clickup';
    if (typeLower.includes('twitter')) return 'twitter';
    if (typeLower.includes('webhook')) return 'webhook';
    if (typeLower.includes('ftp')) return 'ftp';
    if (typeLower.includes('sftp')) return 'sftp';
    if (typeLower.includes('stripe')) return 'stripe';
    if (typeLower.includes('paypal')) return 'paypal';
    if (typeLower.includes('shopify')) return 'shopify';
    if (typeLower.includes('woocommerce')) return 'woocommerce';
    return undefined;
  }
  
  private inferCredentialCategory(fieldName: string, helpCategory?: FieldHelpCategory): string | undefined {
    // URL-type categories are config values, not secrets — never treat them as credentials
    const URL_CONFIG_CATEGORIES = new Set<FieldHelpCategory>([
      'webhook_url',
      'base_url',
      'api_endpoint',
      'callback_url',
      'redirect_url',
    ]);
    if (helpCategory && URL_CONFIG_CATEGORIES.has(helpCategory)) {
      return undefined;
    }

    const nameLower = fieldName.toLowerCase();
    if (nameLower.includes('oauth')) return 'oauth';
    // Match both camelCase 'apiKey' (→ 'apikey') and snake_case 'api_key'
    if (nameLower === 'apikey' || nameLower.includes('api_key')) return 'api_key';
    if (nameLower.includes('token')) return 'token';
    // NOTE: 'webhook' substring match intentionally removed — it was the Bug 1 root cause.
    // Legitimate webhook secrets are identified by helpCategory='webhook_secret' (in STRICT_CREDENTIAL_CATEGORIES)
    // and are classified as 'credential' ownership before reaching this method.
    return 'credential';
  }
  
  // ============================================
  // INodeRegistry Implementation
  // ============================================
  
  register(definition: UnifiedNodeDefinition): void {
    this.definitions.set(definition.type, definition);
    this.registryAliasIndexCache = null;
    this.communicationCategoryDefsCache = null;
    this.emailChannelIntentKeywordCache = null;
    
    // ✅ STRICT ARCHITECTURE: No alias awareness in registry
    // Alias resolution belongs at input layer, not registry layer
    
    console.log(`[UnifiedNodeRegistry] ✅ Registered: ${definition.type} (v${definition.version})`);
  }
  
  /**
   * ✅ PRODUCTION-GRADE: Deterministic node type lookup
   * 
   * Registry is a lookup table ONLY. No resolution, no fallback, no normalization.
   * 
   * Rules:
   * - Only accepts canonical node types
   - - Returns undefined if node type not found (caller must validate first)
   * - No dynamic alias learning
   * - No fuzzy matching
   * - Deterministic behavior only
   */
  get(nodeType: string): UnifiedNodeDefinition | undefined {
    // ✅ STRICT: Direct lookup only - no resolution, no fallback
    return this.definitions.get(nodeType);
  }
  
  getAllTypes(): string[] {
    return Array.from(this.definitions.keys());
  }
  
  has(nodeType: string): boolean {
    return this.get(nodeType) !== undefined;
  }
  
  migrateConfig(nodeType: string, oldConfig: Record<string, any>): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition || !definition.migrations) {
      return oldConfig;
    }
    
    let migratedConfig = { ...oldConfig };
    
    // Apply migrations in order
    for (const migration of definition.migrations) {
      try {
        migratedConfig = migration.migrate(migratedConfig);
      } catch (error) {
        console.warn(`[UnifiedNodeRegistry] Migration failed for ${nodeType}:`, error);
      }
    }
    
    return migratedConfig;
  }
  
  validateConfig(nodeType: string, config: Record<string, any>): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    // ✅ STRICT ARCHITECTURE: Fail-fast on invalid node types
    // This ensures only canonical node types reach the registry
    if (!isValidCanonicalNodeType(nodeType)) {
      const sampleTypes = CANONICAL_NODE_TYPES.slice(0, 10).join(', ');
      throw new Error(
        `[NodeAuthority] ❌ Invalid node type: "${nodeType}". ` +
        `Only canonical node types from NodeLibrary are allowed. ` +
        `Valid types (sample): ${sampleTypes}... ` +
        `Total valid types: ${CANONICAL_NODE_TYPES.length}. ` +
        `This indicates LLM generated an invalid node type or alias resolution failed.`
      );
    }
    
    const definition = this.get(nodeType);
    if (!definition) {
      // This should NEVER happen if nodeType is canonical
      // If it does, it's an integrity issue (canonical type not registered)
      throw new Error(
        `[NodeAuthority] ❌ Integrity error: Canonical node type '${nodeType}' not found in registry. ` +
        `This indicates a system initialization failure. All canonical types must have UnifiedNodeDefinitions.`
      );
    }
    
    // Migrate config first
    const migratedConfig = this.migrateConfig(nodeType, config);
    
    // Validate using node's validateConfig
    return definition.validateConfig(migratedConfig);
  }
  
  getDefaultConfig(nodeType: string): Record<string, any> {
    const definition = this.get(nodeType);
    if (!definition) {
      return {};
    }
    
    return definition.defaultConfig();
  }
  
  getRequiredCredentials(nodeType: string): NodeCredentialRequirement[] {
    const definition = this.get(nodeType);
    if (!definition || !definition.credentialSchema) {
      return [];
    }
    
    return definition.credentialSchema.requirements.filter(req => req.required);
  }

  /**
   * Single source for credential preflight: registry schema + minimal provider inference
   * when NodeLibrary has not yet emitted credentialSchema rows for a node.
   */
  getCredentialPreflightDescriptor(nodeType: string): {
    requiresCheck: boolean;
    credentialType: 'OAuth' | 'API_KEY' | 'UNKNOWN';
    requiredScopes: string[];
    lookupKeys: string[];
  } {
    const def = this.get(nodeType);
    const reqs = def?.credentialSchema?.requirements ?? [];
    const scopesFromSchema = reqs.flatMap((r) => r.scopes || []);
    const hasSchemaCreds =
      reqs.length > 0 || (def?.credentialSchema?.credentialFields?.length ?? 0) > 0;

    const provider = this.inferCredentialProviderForPreflight(nodeType);
    const requiresCheck = hasSchemaCreds || provider !== undefined;

    if (!requiresCheck) {
      return {
        requiresCheck: false,
        credentialType: 'UNKNOWN',
        requiredScopes: [],
        lookupKeys: [],
      };
    }

    let requiredScopes = [...scopesFromSchema];
    if (requiredScopes.length === 0) {
      requiredScopes = this.inferDefaultOAuthScopes(nodeType, provider);
    }

    // Use the mapping if available; otherwise fall back to heuristic list
    const mappedAuthType = provider ? UnifiedNodeRegistry.PROVIDER_CREDENTIAL_MAP[provider.toLowerCase()]?.authType : undefined;
    const oauthish =
      mappedAuthType === 'oauth2' ||
      reqs.some((r) => r.authType === 'oauth2' || (r.category || '').toLowerCase() === 'oauth') ||
      (provider && !mappedAuthType &&
        ['google', 'linkedin', 'twitter', 'facebook', 'instagram', 'microsoft', 'zoom',
         'slack', 'github', 'gitlab', 'notion', 'hubspot', 'salesforce', 'zoho',
         'paypal', 'shopify', 'xero', 'asana', 'mailchimp', 'dropbox', 'youtube'].includes(provider));

    const credentialType: 'OAuth' | 'API_KEY' | 'UNKNOWN' = oauthish ? 'OAuth' : 'API_KEY';

    const lookupKeys = this.buildCredentialLookupKeys(nodeType, provider, def?.credentialSchema?.credentialFields);

    return {
      requiresCheck: true,
      credentialType,
      requiredScopes,
      lookupKeys,
    };
  }

  /** Provider hint for preflight when credentialSchema is empty or incomplete. */
  private inferCredentialProviderForPreflight(nodeType: string): string | undefined {
    const t = nodeType.toLowerCase();
    const fromBase = this.inferProviderFromNodeType(nodeType);
    if (fromBase) return fromBase;
    if (t === 'http_request' || t === 'http_post' || t === 'graphql' || t === 'webhook_response') return 'http';
    if (t === 'email') return 'email';
    if (t.includes('database_') || t === 'postgresql' || t === 'db' || t === 'mysql' || t === 'mongodb' || t === 'redis')
      return 'database';
    if (t === 'linkedin' || t === 'twitter' || t === 'instagram' || t === 'facebook') return t.split('_')[0];
    if (t === 'vercel') return 'vercel';
    return undefined;
  }

  private inferDefaultOAuthScopes(nodeType: string, provider?: string): string[] {
    const t = nodeType.toLowerCase();
    if (provider === 'google' || t.includes('google')) {
      if (t.includes('gmail')) return ['https://www.googleapis.com/auth/gmail.send'];
      if (t.includes('sheet')) return ['https://www.googleapis.com/auth/spreadsheets'];
      if (t.includes('drive')) return ['https://www.googleapis.com/auth/drive'];
      if (t.includes('calendar')) return ['https://www.googleapis.com/auth/calendar'];
      return [];
    }
    if (t === 'linkedin') return ['openid', 'profile', 'email', 'w_member_social'];
    if (provider === 'vercel' || t === 'vercel') return ['deployments:read', 'deployments:write'];
    return [];
  }

  private buildCredentialLookupKeys(
    nodeType: string,
    provider: string | undefined,
    credentialFields?: string[]
  ): string[] {
    const keys = new Set<string>([nodeType]);
    if (provider) keys.add(provider);
    if (nodeType.includes('google')) {
      keys.add('google');
      keys.add('google_sheets');
      keys.add('google_drive');
      keys.add('gmail');
    }
    if (nodeType === 'slack_message' || nodeType === 'slack_webhook') {
      keys.add('slack');
    }
    if (nodeType === 'openai_gpt' || nodeType === 'chat_model') keys.add('openai');
    if (nodeType === 'anthropic_claude') keys.add('anthropic');
    if (nodeType === 'google_gemini') {
      keys.add('gemini');
      keys.add('google');
    }
    if (credentialFields) {
      for (const f of credentialFields) keys.add(f);
    }
    return [...keys];
  }
  
  getOutputSchema(nodeType: string): NodeOutputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.outputSchema;
  }
  
  getInputSchema(nodeType: string): NodeInputSchema | undefined {
    const definition = this.get(nodeType);
    return definition?.inputSchema;
  }

  /**
   * Get effective output schema for a node given its config.
   * For form: derives properties from config.fields. For code/javascript: returns dynamic object.
   * Used by intent→config to generate downstream config/code from upstream JSON shape.
   */
  getEffectiveOutputSchema(nodeType: string, config?: Record<string, any>): EffectiveOutputSchema | undefined {
    const def = this.get(nodeType);
    if (!def?.outputSchema?.default) {
      return undefined;
    }
    const port = def.outputSchema.default;
    const baseType = (port.schema?.type as EffectiveOutputSchema['type']) || 'object';
    const baseProperties = port.schema?.properties as Record<string, { type: string }> | undefined;

    // Form / form_trigger: output shape = { [field.name]: field.type } from config.fields
    if (
      (nodeType === 'form' || nodeType === 'form_trigger') &&
      config?.fields &&
      Array.isArray(config.fields)
    ) {
      const properties: Record<string, { type: string; description?: string }> = {};
      for (const f of config.fields) {
        const name = f.name ?? f.key ?? f.id ?? 'field';
        const type = (f.type || 'string') as string;
        properties[name] = { type, description: f.description || f.label };
      }
      return {
        type: 'object',
        properties: Object.keys(properties).length ? properties : undefined,
        dynamic: Object.keys(properties).length === 0,
      };
    }

    // Code / javascript: output is whatever the code returns; schema is dynamic
    if (nodeType === 'javascript' || nodeType === 'code') {
      return { type: 'object', dynamic: true };
    }

    // Static: use registry output schema properties when available
    if (baseProperties && typeof baseProperties === 'object' && Object.keys(baseProperties).length > 0) {
      const properties: Record<string, { type: string; description?: string }> = {};
      for (const [k, v] of Object.entries(baseProperties)) {
        properties[k] = typeof v === 'object' && v !== null && 'type' in v
          ? { type: (v as any).type, description: (v as any).description }
          : { type: typeof v === 'string' ? v : 'string' };
      }
      return { type: baseType, properties };
    }

    return { type: baseType, dynamic: false };
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node allows branching
   * Uses registry as single source of truth
   */
  /**
   * Effective outgoing ports for a concrete workflow node (branching: if_else, switch with cases).
   */
  getOutgoingPortsForWorkflowNode(node: {
    type?: string;
    data?: { type?: string; config?: Record<string, any> };
  }): string[] {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const def = this.get(nodeType);
    const raw = (node.data?.config || {}) as Record<string, any>;
    const config = this.migrateConfig(nodeType, raw);
    return getBranchOutgoingPortsForNode(nodeType, config, def?.outgoingPorts || ['output']);
  }

  allowsBranching(nodeType: string): boolean {
    const definition = this.get(nodeType);
    return definition?.isBranching || false;
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node is a trigger
   * Uses registry category as single source of truth
   */
  isTrigger(nodeType: string): boolean {
    const definition = this.get(nodeType);
    // node-library registers triggers with category 'triggers' (plural);
    // unified contract normalises to 'trigger' (singular). Accept both.
    const cat = definition?.category as string | undefined;
    return cat === 'trigger' || cat === 'triggers';
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to get node category
   * Uses registry as single source of truth
   */
  getCategory(nodeType: string): string | undefined {
    const definition = this.get(nodeType);
    return definition?.category;
  }
  
  /**
   * ✅ PHASE 1 FIX: Helper method to check if node has specific tag
   * Uses registry tags as single source of truth
   */
  hasTag(nodeType: string, tag: string): boolean {
    const definition = this.get(nodeType);
    const tags = definition?.tags || [];
    return tags.some(t => t.toLowerCase() === tag.toLowerCase());
  }
  
  /**
   * Resolve alias to canonical type.
   * Uses the internal ALIAS_MAP — single source of truth, no external resolver files.
   * Email aliases must NEVER resolve to AI/LLM node types.
   */
  resolveAlias(alias: string): string | undefined {
    if (!alias) return undefined;
    const normalized = alias.toLowerCase().trim();
    // If alias is itself a canonical type in the registry, return it directly
    if (this.has(normalized)) {
      return normalized;
    }
    // Original casing fallback
    if (this.has(alias)) {
      return alias;
    }
    // Temporary migration fallback for old saved workflows and legacy callers.
    // Keep this ahead of registry-derived phrases so broad catalog metadata like
    // "mail" cannot steal compatibility aliases that intentionally point at Gmail.
    const fromMap = this.ALIAS_MAP[normalized];
    if (fromMap) {
      return fromMap;
    }
    const fromRegistry = this.resolveRegistryDerivedAlias(normalized);
    if (fromRegistry) {
      return fromRegistry;
    }
    return undefined;
  }

  private normalizeRegistryAliasPhrase(raw: string): string {
    return String(raw || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private addRegistryAlias(index: Map<string, string[]>, phrase: string, nodeType: string): void {
    const normalized = this.normalizeRegistryAliasPhrase(phrase);
    if (!normalized || normalized.length < 2) return;
    const existing = index.get(normalized) || [];
    if (!existing.includes(nodeType)) {
      index.set(normalized, [...existing, nodeType]);
    }
  }

  private buildRegistryAliasIndex(): Map<string, string[]> {
    if (this.registryAliasIndexCache) {
      return this.registryAliasIndexCache;
    }
    const index = new Map<string, string[]>();
    for (const def of this.definitions.values()) {
      this.addRegistryAlias(index, def.type, def.type);
      this.addRegistryAlias(index, def.type.replace(/_/g, ' '), def.type);
      this.addRegistryAlias(index, def.label || '', def.type);
      this.addRegistryAlias(index, String(def.label || '').replace(/\s+/g, '_'), def.type);
      this.addRegistryAlias(index, def.description || '', def.type);
      for (const tag of def.tags || []) this.addRegistryAlias(index, String(tag), def.type);
      for (const capability of def.capabilities || []) this.addRegistryAlias(index, String(capability), def.type);
      const criteria = def.aiSelectionCriteria;
      for (const keyword of criteria?.keywords || []) this.addRegistryAlias(index, String(keyword), def.type);
      for (const useCase of criteria?.useCases || []) this.addRegistryAlias(index, String(useCase), def.type);
      for (const whenToUse of criteria?.whenToUse || []) this.addRegistryAlias(index, String(whenToUse), def.type);
      const operation = (def.inputSchema || {}).operation as any;
      const operationValues = Array.isArray(operation?.enum)
        ? operation.enum
        : Array.isArray(operation?.oneOf)
          ? operation.oneOf.map((x: any) => x?.const || x?.enum?.[0]).filter(Boolean)
          : [];
      for (const op of operationValues) {
        this.addRegistryAlias(index, `${def.label || def.type} ${op}`, def.type);
        this.addRegistryAlias(index, `${def.type} ${op}`, def.type);
      }
    }
    this.registryAliasIndexCache = index;
    return index;
  }

  private resolveRegistryDerivedAlias(alias: string): string | undefined {
    const key = this.normalizeRegistryAliasPhrase(alias);
    if (!key) return undefined;
    const matches = this.buildRegistryAliasIndex().get(key) || [];
    return matches.length === 1 ? matches[0] : undefined;
  }

  private getCommunicationCategoryDefinitions(): UnifiedNodeDefinition[] {
    if (this.communicationCategoryDefsCache) {
      return this.communicationCategoryDefsCache;
    }
    const list: UnifiedNodeDefinition[] = [];
    for (const def of this.definitions.values()) {
      if (def.category === 'output' || def.category === 'social_media') {
        list.push(def);
      }
    }
    this.communicationCategoryDefsCache = list;
    return list;
  }

  private collectPlannerConfigKeys(config: Record<string, unknown> | undefined): Set<string> {
    const keys = new Set<string>();
    if (!config || typeof config !== 'object') {
      return keys;
    }
    for (const k of Object.keys(config as Record<string, unknown>)) {
      if (k.startsWith('_')) continue;
      keys.add(k);
    }
    return keys;
  }

  private scoreConfigAgainstDefinition(def: UnifiedNodeDefinition, configKeys: Set<string>): number {
    let score = 0;
    const schema = def.inputSchema || {};
    for (const k of configKeys) {
      if (!schema[k]) continue;
      score += 1;
      const field = schema[k] as { role?: string };
      if (field?.role === 'recipient') {
        score += 1;
      }
    }
    return score;
  }

  /** True when NodeLibrary capabilities mark this node as OAuth/API email send (e.g. Gmail), not generic LLM. */
  private definitionSendsOAuthEmail(def: UnifiedNodeDefinition | undefined): boolean {
    if (!def) return false;
    const caps = def.capabilities || [];
    return caps.some((c) => {
      const x = String(c).toLowerCase();
      return (
        x.startsWith('email.send') ||
        x.startsWith('gmail.') ||
        x.includes('gmail.send') ||
        x === 'google.mail'
      );
    });
  }

  /**
   * Product default: transactional email in this app is Gmail (`google_gmail`) when that node declares email send capabilities.
   */
  private getPreferredGmailSendCanonicalType(): string {
    const g = this.get('google_gmail');
    if (g && this.definitionSendsOAuthEmail(g)) {
      return 'google_gmail';
    }
    for (const def of this.definitions.values()) {
      if (def.type === 'google_gmail' && this.definitionSendsOAuthEmail(def)) {
        return 'google_gmail';
      }
    }
    for (const def of this.definitions.values()) {
      if (this.definitionSendsOAuthEmail(def) && (def.capabilities || []).some((c) => String(c).toLowerCase().includes('gmail'))) {
        return def.type;
      }
    }
    return 'google_gmail';
  }

  private ensureEmailChannelIntentKeywordCache(): string[] {
    if (this.emailChannelIntentKeywordCache) {
      return this.emailChannelIntentKeywordCache;
    }
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string) => {
      const t = String(raw || '')
        .toLowerCase()
        .trim();
      if (t.length < 4 || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const def of this.definitions.values()) {
      if (!this.definitionSendsOAuthEmail(def)) continue;
      for (const t of def.tags || []) {
        push(String(t));
      }
      const ai = def.aiSelectionCriteria;
      if (ai?.keywords) {
        for (const k of ai.keywords) {
          push(String(k));
        }
      }
      if (ai?.whenToUse) {
        for (const line of ai.whenToUse) {
          for (const word of String(line).toLowerCase().split(/[^a-z0-9]+/)) {
            if (word.length >= 5) push(word);
          }
        }
      }
    }
    this.emailChannelIntentKeywordCache = out;
    return out;
  }

  /** Whether free-text (summary, user prompt, step label) matches keywords from email-send node definitions. */
  private workflowTextSuggestsRegistryEmailChannel(intentText: string): boolean {
    const blob = String(intentText || '').toLowerCase();
    if (!blob.trim()) return false;
    for (const kw of this.ensureEmailChannelIntentKeywordCache()) {
      if (blob.includes(kw)) return true;
    }
    return false;
  }

  /**
   * True when an AI-category planned node should be checked against communication definitions
   * using config key overlap (registry-driven — no per-node string checks in builders).
   */
  private shouldRunCommunicationDisambiguation(
    fromDef: UnifiedNodeDefinition,
    role: string | undefined,
    configKeys: Set<string>
  ): boolean {
    if (fromDef.category !== 'ai') {
      return false;
    }
    const r = (role || '').toLowerCase().trim();
    if (r === 'output') {
      return true;
    }
    const matched = new Set<string>();
    for (const comm of this.getCommunicationCategoryDefinitions()) {
      const schema = comm.inputSchema || {};
      for (const k of configKeys) {
        if (schema[k]) {
          matched.add(k);
        }
      }
    }
    return matched.size >= 2;
  }

  /**
   * When the planner emits an AI node type but the config keys clearly belong to a communication
   * node (per registry inputSchema), return the best-matching communication canonical type.
   * Used by workflow hydration and optional graph reconciliation (attach-inputs, etc.).
   *
   * Email is routed to Gmail (`google_gmail`): if the planner still emits an LLM type for an
   * output step but workflow/step text matches email-channel registry keywords, the canonical
   * type becomes `google_gmail` — not Ollama.
   */
  resolvePlannedStepCanonicalType(
    rawType: string,
    role: string | undefined,
    config: Record<string, unknown> | undefined,
    context?: { workflowIntentText?: string; stepLabel?: string }
  ): string {
    const normalized = unifiedNormalizeNodeTypeString(rawType);
    const fromDef = this.get(normalized);
    if (!fromDef) {
      return normalized;
    }
    const configKeys = this.collectPlannerConfigKeys(config);
    let resolved = normalized;
    if (this.shouldRunCommunicationDisambiguation(fromDef, role, configKeys)) {
      let bestType = normalized;
      let bestScore = this.scoreConfigAgainstDefinition(fromDef, configKeys);
      for (const comm of this.getCommunicationCategoryDefinitions()) {
        const s = this.scoreConfigAgainstDefinition(comm, configKeys);
        if (s > bestScore) {
          bestScore = s;
          bestType = comm.type;
        }
      }
      if (bestType !== normalized && bestScore >= 2) {
        console.log(
          `[UnifiedNodeRegistry] Planned-step disambiguation: "${rawType}" (${normalized}) → "${bestType}" (schema overlap score ${bestScore}, role=${role || 'n/a'})`
        );
        resolved = bestType;
      }
    }

    const r = (role || '').toLowerCase().trim();
    const intentBlob = [context?.workflowIntentText, context?.stepLabel].filter(Boolean).join(' ');
    const resolvedDef = this.get(resolved);
    if (
      resolvedDef?.category === 'ai' &&
      r === 'output' &&
      this.workflowTextSuggestsRegistryEmailChannel(intentBlob)
    ) {
      const gmailType = this.getPreferredGmailSendCanonicalType();
      if (gmailType !== resolved) {
        console.log(
          `[UnifiedNodeRegistry] Email intent → Gmail: "${rawType}" (${resolved}) → "${gmailType}" (output step; text matched email-channel registry keywords)`
        );
        resolved = gmailType;
      }
    }

    return resolved;
  }

  /**
   * Rewrite AI nodes whose configs match communication inputSchema better than their declared type.
   * Preserves React Flow shells (`custom`, `form`) — only `data.type` is updated when shell is custom.
   */
  reconcileMisroutedAiCommunicationNodes(workflow: Workflow): Workflow {
    if (!workflow?.nodes?.length) {
      return workflow;
    }
    const nodes = workflow.nodes.map((node: any) => {
      const data = node?.data || {};
      const semanticType = String(data.type || node.type || '').trim();
      if (!semanticType) {
        return node;
      }
      const role =
        (data.metadata?.aiRole as string | undefined) ||
        (data.stepType as string | undefined) ||
        (data.metadata?.stepType as string | undefined);
      const wfIntent = [
        (workflow as any)?.metadata?.summary,
        (workflow as any)?.metadata?.generatedFrom,
        (workflow as any)?.metadata?.userPrompt,
      ]
        .filter(Boolean)
        .join(' ');
      const resolved = this.resolvePlannedStepCanonicalType(semanticType, role, data.config as Record<string, unknown>, {
        workflowIntentText: wfIntent,
        stepLabel: typeof data.label === 'string' ? data.label : undefined,
      });
      const normalizedBefore = unifiedNormalizeNodeTypeString(semanticType);
      if (resolved === normalizedBefore) {
        return node;
      }
      const def = this.get(resolved);
      const shell = String(node.type || '');
      const useShell = shell === 'custom' || shell === 'form';
      return {
        ...node,
        type: useShell ? shell : resolved,
        data: {
          ...data,
          type: resolved,
          ...(def?.category ? { category: def.category } : {}),
          ...(def?.label && !data.label ? { label: def.label } : {}),
        },
      };
    });
    return { ...workflow, nodes };
  }
  
  /**
   * ✅ UNIVERSAL: Get all nodes with specific workflow-level behavior
   * Used by orchestrators, policies, builders to query registry
   * 
   * @param behavior - The workflow behavior to query for
   * @returns Array of node definitions with the specified behavior
   */
  getNodesWithBehavior(behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): UnifiedNodeDefinition[] {
    const results: UnifiedNodeDefinition[] = [];
    for (const [type, def] of this.definitions) {
      if (def.workflowBehavior?.[behavior] === true) {
        results.push(def);
      }
    }
    return results;
  }
  
  /**
   * ✅ UNIVERSAL: Check if node has specific workflow behavior
   * 
   * @param nodeType - The node type to check
   * @param behavior - The workflow behavior to check for
   * @returns true if node has the specified behavior
   */
  hasWorkflowBehavior(nodeType: string, behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): boolean {
    const def = this.get(nodeType);
    return def?.workflowBehavior?.[behavior] === true;
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-required nodes (for auto-inclusion)
   * These nodes are automatically included in all workflows
   * 
   * @returns Array of node definitions that are always required
   */
  getAlwaysRequiredNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysRequired');
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-terminal nodes (must be last)
   * These nodes must have no outgoing edges and be the last node
   * 
   * @returns Array of node definitions that must be terminal
   */
  getAlwaysTerminalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysTerminal');
  }
  
  /**
   * ✅ UNIVERSAL: Get all exempt-from-removal nodes
   * These nodes cannot be removed by minimal workflow policy
   * 
   * @returns Array of node definitions that are exempt from removal
   */
  getExemptFromRemovalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('exemptFromRemoval');
  }

  /**
   * Returns true if the given node type is classified as a utility node.
   * Classification is registry-driven — no hardcoded type strings outside this method.
   *
   * Rules (in priority order):
   * 1. Resolve alias to canonical type.
   * 2. Look up definition; if not found, return false (fail-safe).
   * 3. Return true if definition.category === 'utility'.
   * 4. Return true if definition.tags includes any of ['logging', 'debug', 'side-effect', 'internal'].
   * 5. Otherwise return false.
   */
  isUtilityNode(nodeType: string): boolean {
    const canonical = this.ALIAS_MAP[nodeType.toLowerCase()] ?? nodeType;
    const def = this.definitions.get(canonical);
    if (!def) return false;
    if (def.category === 'utility') return true;
    const utilityTags = ['logging', 'debug', 'side-effect', 'internal'];
    if ((def.tags || []).some(t => utilityTags.includes(t.toLowerCase()))) return true;
    return false;
  }

  /**
   * Returns context needed for build-time AI value generation for a target node,
   * given an optional upstream node type.
   *
   * - upstreamFields: flat property map from the upstream node's default output port schema.
   * - targetFields: input fields of the target node eligible for build-time AI population
   *   (fillMode.default === 'buildtime_ai_once' OR fillMode.supportsBuildtimeAI === true),
   *   excluding credential-owned fields.
   *
   * Returns { upstreamFields: [], targetFields: [] } for unknown target types.
   */
  getBuildValueContext(targetNodeType: string, upstreamNodeType: string | undefined): BuildValueContext {
    const targetCanonical = this.ALIAS_MAP[targetNodeType.toLowerCase()] ?? targetNodeType;
    const targetDef = this.definitions.get(targetCanonical);
    if (!targetDef) {
      return { upstreamFields: [], targetFields: [] };
    }

    // Build upstreamFields from upstream node's default output port schema properties
    let upstreamFields: BuildValueContext['upstreamFields'] = [];
    if (upstreamNodeType) {
      const upstreamCanonical = this.ALIAS_MAP[upstreamNodeType.toLowerCase()] ?? upstreamNodeType;
      const upstreamDef = this.definitions.get(upstreamCanonical);
      const props = upstreamDef?.outputSchema?.default?.schema?.properties;
      if (props && typeof props === 'object') {
        upstreamFields = Object.entries(props).map(([key, val]: [string, any]) => ({
          name: key,
          type: val?.type || 'string',
          description: val?.description,
        }));
      }
    }

    // Build targetFields from inputSchema filtered to buildtime-AI-eligible, non-credential fields
    const targetFields: BuildValueContext['targetFields'] = [];
    for (const [name, field] of Object.entries(targetDef.inputSchema)) {
      const fillMode = field.fillMode;
      const isBuildtimeEligible =
        fillMode?.default === 'buildtime_ai_once' ||
        fillMode?.supportsBuildtimeAI === true;
      if (!isBuildtimeEligible) continue;
      if (isCredentialOwnership(name, field)) continue;
      targetFields.push({
        name,
        role: field.role || 'content',
        type: field.type || 'string',
        fillMode,
        essentialForExecution: field.essentialForExecution ?? false,
        supportsBuildtimeAI: fillMode?.supportsBuildtimeAI ?? false,
      });
    }

    return { upstreamFields, targetFields };
  }
}

// Export singleton instance
export const unifiedNodeRegistry = UnifiedNodeRegistry.getInstance();
