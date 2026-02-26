// Node Credential Analyzer
// Analyzes workflow structure to determine actual credential requirements

import { NodeLibrary } from '../nodes/node-library';
import { AuthProvider, UserAuthState } from '../auth/auth-provider';
import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';

export interface CredentialNeed {
  nodeType: string;
  nodeId: string;
  field: string;
  fieldName: string;
  isRequired: boolean;
  credentialType: CredentialType;
  alternatives: AlternativeAuth[];
}

export interface AlternativeAuth {
  type: 'google_oauth' | 'environment_variable' | 'oauth2';
  description: string;
  autoConfigure: boolean;
  envVar?: string;
}

export type CredentialType = 
  | 'email_smtp' 
  | 'google_oauth' 
  | 'slack_token' 
  | 'ai_api_key' 
  | 'api_key' 
  | 'generic';

export interface CredentialAnalysis {
  requiredCredentials: CredentialNeed[];
  optionalCredentials: CredentialNeed[];
  existingAuthCoverage: CredentialNeed[];
  missingCredentials: CredentialNeed[];
  autoResolvable: CredentialNeed[];
  questionsNeeded: CredentialQuestion[];
}

export interface CredentialQuestion {
  id: string;
  nodeType: string;
  nodeId: string;
  field: string;
  label: string;
  description: string;
  type: 'text' | 'password' | 'select';
  required: boolean;
  options?: { label: string; value: string }[];
}

export interface WorkflowStructure {
  steps: Array<{
    id: string;
    type: string;
    config?: Record<string, any>;
  }>;
}

/**
 * NodeCredentialAnalyzer - Analyzes workflow structure for credential requirements
 */
export class NodeCredentialAnalyzer {
  constructor(
    private nodeLibrary: NodeLibrary,
    private authProvider: AuthProvider
  ) {}

  /**
   * Analyze workflow structure for credential needs
   */
  async analyzeWorkflowForCredentials(
    workflowStructure: WorkflowStructure | { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    existingAuth: UserAuthState
  ): Promise<CredentialAnalysis> {
    const analysis: CredentialAnalysis = {
      requiredCredentials: [],
      optionalCredentials: [],
      existingAuthCoverage: [],
      missingCredentials: [],
      autoResolvable: [],
      questionsNeeded: [],
    };

    // Extract nodes from structure
    const nodes = 'nodes' in workflowStructure 
      ? workflowStructure.nodes 
      : workflowStructure.steps.map(step => ({
          id: step.id,
          type: step.type,
          data: { type: step.type, config: step.config || {} },
        } as WorkflowNode));

    // Step 1: Analyze each node in the structure
    for (const node of nodes) {
      const nodeType = node.type || node.data?.type;
      if (!nodeType) continue;

      const nodeSchema = this.nodeLibrary.getSchema(nodeType);
      const nodeConfig = node.data?.config || {};
      
      // Step 2: Check configuration fields for credential requirements
      // Only check fields that are actually missing or empty in the node config
      const credentialFields: Array<{ key: string; label: string; required: boolean }> = [];
      
      // Extract from schema if available
      if (nodeSchema) {
        credentialFields.push(...this.extractCredentialFields(nodeSchema));
      }
      
      // Add known credential requirements for common node types (even if not in schema)
      // BUT only if the field is actually missing from config
      const knownCredentialFields = this.getKnownCredentialFields(nodeType, nodeConfig);
      credentialFields.push(...knownCredentialFields);

      for (const field of credentialFields) {
        // CRITICAL: Only check for credentials if the field is actually missing from config
        const fieldValue = nodeConfig[field.key] || nodeConfig[field.key.replace(/_/g, '')] || 
                           nodeConfig[field.key.replace(/_/g, '-')];
        
        // Skip if field already has a value (not empty, not placeholder)
        if (fieldValue && 
            typeof fieldValue === 'string' && 
            fieldValue.trim() !== '' && 
            !fieldValue.includes('{{') && 
            !fieldValue.includes('${') &&
            !fieldValue.toLowerCase().includes('placeholder') &&
            !fieldValue.toLowerCase().includes('example')) {
          // Field already has a value, skip credential check
          continue;
        }
        
        const credentialNeed: CredentialNeed = {
          nodeType,
          nodeId: node.id,
          field: field.key,
          fieldName: field.label || field.key,
          isRequired: field.required || false,
          credentialType: this.mapFieldToCredentialType(field),
          alternatives: this.findAlternativeAuthMethods(field, existingAuth),
        };

        // Step 3: Check if already satisfied by existing auth
        const isSatisfied = await this.checkExistingAuthSatisfies(
          credentialNeed,
          existingAuth,
          nodeType
        );

        if (isSatisfied) {
          analysis.existingAuthCoverage.push(credentialNeed);
        } else if (credentialNeed.isRequired) {
          analysis.requiredCredentials.push(credentialNeed);

          // Check if we can auto-resolve (OAuth, env vars, etc.)
          if (await this.canAutoResolve(credentialNeed, existingAuth)) {
            analysis.autoResolvable.push(credentialNeed);
          } else {
            analysis.missingCredentials.push(credentialNeed);
            analysis.questionsNeeded.push(this.createCredentialQuestion(credentialNeed));
          }
        } else {
          analysis.optionalCredentials.push(credentialNeed);
        }
      }
    }

    // Step 4: Deduplicate credentials and convert to unique credential names
    // Group by credential type and field to avoid duplicates
    const credentialMap = new Map<string, CredentialNeed>();
    
    // Process missing credentials first (highest priority)
    for (const cred of analysis.missingCredentials) {
      const credentialName = this.mapCredentialToName(cred);
      if (credentialName && !credentialMap.has(credentialName)) {
        credentialMap.set(credentialName, cred);
      }
    }
    
    // Then process required credentials that aren't missing (might be auto-resolvable)
    for (const cred of analysis.requiredCredentials) {
      if (!analysis.missingCredentials.includes(cred)) {
        const credentialName = this.mapCredentialToName(cred);
        if (credentialName && !credentialMap.has(credentialName)) {
          credentialMap.set(credentialName, cred);
        }
      }
    }
    
    // Update missingCredentials to only include unique credentials
    analysis.missingCredentials = Array.from(credentialMap.values());
    
    return analysis;
  }

  /**
   * Map CredentialNeed to a standardized credential name
   */
  private mapCredentialToName(cred: CredentialNeed): string | null {
    const field = cred.field.toLowerCase();
    const fieldName = cred.fieldName.toLowerCase();
    const nodeType = cred.nodeType.toLowerCase();
    
    // Map to standard credential names
    if (field.includes('gemini') || fieldName.includes('gemini') || 
        (nodeType.includes('gemini') && field.includes('api'))) {
      return 'GEMINI_API_KEY';
    }
    
    if (field.includes('openai') || fieldName.includes('openai') || 
        (nodeType.includes('openai') && field.includes('api'))) {
      return 'OPENAI_API_KEY';
    }
    
    if (field.includes('anthropic') || fieldName.includes('anthropic') || 
        field.includes('claude') || (nodeType.includes('claude') && field.includes('api'))) {
      return 'ANTHROPIC_API_KEY';
    }
    
    if ((field.includes('slack') && field.includes('token')) || 
        (field.includes('slack') && field.includes('bot'))) {
      return 'SLACK_BOT_TOKEN';
    }
    
    if (field.includes('slack') && (field.includes('webhook') || field.includes('url'))) {
      return 'SLACK_WEBHOOK_URL';
    }
    
    if (field.includes('database') || fieldName.includes('database')) {
      return 'DATABASE_CREDENTIALS';
    }
    
    // For generic API keys, use the field name
    if (field.includes('api_key') || field.includes('apiKey') || field.includes('api_token')) {
      return field.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    }
    
    return null;
  }

  /**
   * Extract credential fields from node schema
   */
  private extractCredentialFields(nodeSchema: any): Array<{ key: string; label: string; required: boolean }> {
    const fields: Array<{ key: string; label: string; required: boolean }> = [];

    // Check configSchema.optional fields
    if (nodeSchema.configSchema?.optional) {
      for (const [key, field] of Object.entries(nodeSchema.configSchema.optional)) {
        if (this.isCredentialField(key, field)) {
          fields.push({
            key,
            label: (field as any).description || key,
            required: false,
          });
        }
      }
    }

    // Check configSchema.required fields
    if (nodeSchema.configSchema?.required) {
      for (const key of nodeSchema.configSchema.required) {
        if (this.isCredentialFieldByName(key)) {
          fields.push({
            key,
            label: key,
            required: true,
          });
        }
      }
    }

    return fields;
  }

  /**
   * Check if a field is a credential field
   */
  private isCredentialField(key: string, field: any): boolean {
    const keyLower = key.toLowerCase();
    const description = (field?.description || '').toLowerCase();

    const credentialKeywords = [
      'api', 'key', 'token', 'secret', 'password', 'auth',
      'smtp', 'oauth', 'client_id', 'client_secret',
      'username', 'password', 'host', 'port', 'credentials',
      'access_token', 'refresh_token',
    ];

    return credentialKeywords.some(keyword =>
      keyLower.includes(keyword) || description.includes(keyword)
    );
  }

  /**
   * Check if a field name indicates a credential field
   */
  private isCredentialFieldByName(key: string): boolean {
    const keyLower = key.toLowerCase();
    const credentialKeywords = [
      'api_key', 'apiKey', 'token', 'secret', 'password',
      'smtp', 'oauth', 'client_id', 'client_secret',
      'access_token', 'refresh_token',
    ];

    return credentialKeywords.some(keyword => keyLower.includes(keyword));
  }

  /**
   * Map field to credential type
   */
  private mapFieldToCredentialType(field: { key: string; label?: string }): CredentialType {
    const key = field.key.toLowerCase();
    const label = (field.label || '').toLowerCase();

    if (key.includes('smtp') || label.includes('smtp')) return 'email_smtp';
    if (key.includes('gmail') || key.includes('google') || label.includes('gmail')) return 'google_oauth';
    if (key.includes('slack') || label.includes('slack')) return 'slack_token';
    if (key.includes('openai') || key.includes('gemini') || key.includes('anthropic') || key.includes('claude')) {
      return 'ai_api_key';
    }
    if (key.includes('api_key') || key.includes('api_token') || key.includes('apikey')) return 'api_key';

    return 'generic';
  }

  /**
   * Find alternative authentication methods
   */
  private findAlternativeAuthMethods(
    field: { key: string; label?: string },
    existingAuth: UserAuthState
  ): AlternativeAuth[] {
    const alternatives: AlternativeAuth[] = [];
    const credentialType = this.mapFieldToCredentialType(field);

    // Check OAuth alternatives for email
    if (credentialType === 'email_smtp') {
      if (existingAuth.googleOAuth.available) {
        alternatives.push({
          type: 'google_oauth',
          description: 'Use Google OAuth instead of SMTP',
          autoConfigure: true,
        });
      }
    }

    // Check environment variables
    const envVar = this.mapToEnvironmentVariable(field);
    if (envVar && existingAuth.environmentVariables[envVar]) {
      alternatives.push({
        type: 'environment_variable',
        description: `Use ${envVar} from environment`,
        autoConfigure: true,
        envVar,
      });
    }

    return alternatives;
  }

  /**
   * Map field to environment variable name
   */
  private mapToEnvironmentVariable(field: { key: string; label?: string }): string | null {
    const key = field.key.toLowerCase();

    if (key.includes('gemini') || key.includes('google_gemini')) return 'GEMINI_API_KEY';
    if (key.includes('openai') || key.includes('gpt')) return 'OPENAI_API_KEY';
    if (key.includes('anthropic') || key.includes('claude')) return 'ANTHROPIC_API_KEY';
    if (key.includes('slack') && key.includes('token')) return 'SLACK_BOT_TOKEN';
    if (key.includes('slack') && key.includes('webhook')) return 'SLACK_WEBHOOK_URL';

    return null;
  }

  /**
   * Check if existing auth satisfies credential need
   */
  private async checkExistingAuthSatisfies(
    credentialNeed: CredentialNeed,
    existingAuth: UserAuthState,
    nodeType: string
  ): Promise<boolean> {
    // Check Google OAuth for Gmail/Google nodes
    if (credentialNeed.credentialType === 'google_oauth' || 
        credentialNeed.credentialType === 'email_smtp' && nodeType === 'google_gmail') {
      if (existingAuth.googleOAuth.available) {
        // Check if OAuth has required scope for Gmail
        if (nodeType === 'google_gmail') {
          return await this.authProvider.hasGoogleOAuthForService('gmail');
        }
        return true;
      }
    }

    // Check environment variables
    const envVar = this.mapToEnvironmentVariable({ key: credentialNeed.field, label: credentialNeed.fieldName });
    if (envVar && existingAuth.environmentVariables[envVar]) {
      return true;
    }

    return false;
  }

  /**
   * Check if credential can be auto-resolved
   */
  private async canAutoResolve(
    credentialNeed: CredentialNeed,
    existingAuth: UserAuthState
  ): Promise<boolean> {
    // Check if alternative auth methods exist
    if (credentialNeed.alternatives.some(alt => alt.autoConfigure)) {
      return true;
    }

    // Check environment variables
    const envVar = this.mapToEnvironmentVariable({ key: credentialNeed.field, label: credentialNeed.fieldName });
    if (envVar && existingAuth.environmentVariables[envVar]) {
      return true;
    }

    return false;
  }

  /**
   * Create credential question for missing credential
   */
  private createCredentialQuestion(credentialNeed: CredentialNeed): CredentialQuestion {
    return {
      id: `${credentialNeed.nodeId}.${credentialNeed.field}`,
      nodeType: credentialNeed.nodeType,
      nodeId: credentialNeed.nodeId,
      field: credentialNeed.field,
      label: credentialNeed.fieldName,
      description: this.generateQuestionDescription(credentialNeed),
      type: credentialNeed.field.toLowerCase().includes('password') || 
            credentialNeed.field.toLowerCase().includes('secret') ? 'password' : 'text',
      required: credentialNeed.isRequired,
    };
  }

  /**
   * Get known credential fields for node types (even if not in schema)
   * Only returns fields that are actually missing from the node config
   */
  private getKnownCredentialFields(nodeType: string, nodeConfig: Record<string, any>): Array<{ key: string; label: string; required: boolean }> {
    const knownFields: Array<{ key: string; label: string; required: boolean }> = [];
    
    // Slack node - only require ONE of token OR webhook_url, not both
    if (nodeType === 'slack_message' || nodeType === 'slack') {
      const hasToken = nodeConfig.token || nodeConfig.slack_token || nodeConfig.bot_token;
      const hasWebhook = nodeConfig.webhook_url || nodeConfig.webhookUrl || nodeConfig.slack_webhook_url;
      
      // Only add if BOTH are missing (user needs to provide at least one)
      if (!hasToken && !hasWebhook) {
        // Prefer token over webhook as it's more flexible
        knownFields.push({
          key: 'token',
          label: 'Slack Bot Token',
          required: true,
        });
      }
      // Don't add webhook_url if token is already provided
    }
    
    // Gmail/Email nodes - only if not using OAuth
    if ((nodeType === 'google_gmail' || nodeType === 'email') && !nodeConfig.use_oauth) {
      const hasSmtp = nodeConfig.smtp_host || nodeConfig.smtpHost;
      if (!hasSmtp) {
        knownFields.push({
          key: 'smtp_host',
          label: 'SMTP Host',
          required: false, // Not required if using OAuth
        });
      }
    }
    
    // AI nodes - only if API key is actually missing
    // Note: ai_agent nodes get their API key from chat_model connection, not directly
    if (nodeType === 'openai_gpt' || nodeType === 'google_gemini' || nodeType === 'anthropic_claude') {
      const hasApiKey = nodeConfig.api_key || nodeConfig.apiKey || nodeConfig.api_token;
      if (!hasApiKey) {
        knownFields.push({
          key: 'api_key',
          label: 'API Key',
          required: true,
        });
      }
    }
    
    // ai_agent nodes don't need direct API keys - they get it from chat_model connection
    // Only check if chat_model is not connected
    if (nodeType === 'ai_agent') {
      // ai_agent gets API key from chat_model node connection, not from config
      // So we don't add api_key here - it's handled via the chat_model connection
    }

    // LinkedIn node - media URL for media posts
    if (nodeType === 'linkedin') {
      const operation = (nodeConfig.operation || '').toString().toLowerCase();
      const isMediaOperation = operation === 'create_post_media';

      // When the AI/workflow prompt describes a LinkedIn media post, we want the
      // credential/question flow to also collect the mediaUrl and inject it into
      // the node config. We treat this as "required" for media operations only,
      // while the runtime node logic still allows text-only posts when no
      // mediaUrl is provided.
      if (isMediaOperation && !nodeConfig.mediaUrl) {
        knownFields.push({
          key: 'mediaUrl',
          label: 'Media URL',
          required: true,
        });
      }
    }

    return knownFields;
  }

  /**
   * Generate question description
   */
  private generateQuestionDescription(credentialNeed: CredentialNeed): string {
    const nodeLabel = credentialNeed.nodeType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    switch (credentialNeed.credentialType) {
      case 'email_smtp':
        return `SMTP credentials for ${nodeLabel} node. Required for sending emails.`;
      case 'google_oauth':
        return `Google OAuth credentials for ${nodeLabel} node.`;
      case 'slack_token':
        return `Slack bot token for ${nodeLabel} node. Get it from https://api.slack.com/apps`;
      case 'ai_api_key':
        return `API key for ${nodeLabel} node. Required for AI functionality.`;
      case 'api_key':
        return `API key for ${nodeLabel} node.`;
      default:
        return `Configuration value for ${credentialNeed.fieldName} in ${nodeLabel} node.`;
    }
  }
}
