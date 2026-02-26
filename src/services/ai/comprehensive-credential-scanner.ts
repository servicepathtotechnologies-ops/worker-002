/**
 * Comprehensive Credential Scanner
 * 
 * 🎯 GOAL: Always identify 100% of required credentials AFTER workflow is fully generated
 * 
 * RULES:
 * 1. Workflow MUST be fully generated before scanning
 * 2. Use hard-coded schemas (no AI guessing)
 * 3. Check ALL nodes in the workflow
 * 4. Block execution if ANY credential is missing
 * 5. Treat missing credentials like compiler errors
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { NodeLibrary } from '../nodes/node-library';
import { getNodeCredentialRequirements, getRequiredCredentialFieldsForNode } from './node-credential-requirements';

export interface CredentialRequirement {
  credentialName: string; // Normalized name like "SLACK_WEBHOOK_URL"
  displayName: string; // User-friendly name
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  fieldName: string; // Original field name in node config
  description: string;
  type: 'password' | 'text' | 'url' | 'oauth';
  required: boolean;
  isMissing: boolean; // Whether the credential value is actually missing
}

export interface CredentialScanResult {
  allRequiredCredentials: CredentialRequirement[];
  missingCredentials: CredentialRequirement[];
  providedCredentials: CredentialRequirement[];
  isValid: boolean; // false if ANY required credential is missing
  summary: {
    totalNodes: number;
    nodesWithCredentials: number;
    totalCredentials: number;
    missingCount: number;
    providedCount: number;
  };
}

export class ComprehensiveCredentialScanner {
  private nodeLibrary: NodeLibrary;

  constructor(nodeLibrary: NodeLibrary) {
    this.nodeLibrary = nodeLibrary;
  }

  /**
   * Scan workflow for ALL required credentials
   * This runs AFTER workflow is fully generated
   * 
   * @param workflow - Fully generated workflow with all nodes
   * @returns Complete credential scan result
   */
  scanWorkflowForCredentials(workflow: { nodes: WorkflowNode[] }): CredentialScanResult {
    const allCredentials: CredentialRequirement[] = [];
    const credentialMap = new Map<string, CredentialRequirement>(); // Deduplicate by credentialName

    console.log(`🔍 [CredentialScanner] Scanning ${workflow.nodes.length} nodes for credentials...`);

    // STEP 1: Scan every node in the workflow
    for (const node of workflow.nodes || []) {
      const nodeType = this.normalizeNodeType(node);
      const nodeConfig = node.data?.config || {};
      const nodeLabel = node.data?.label || nodeType || 'Unknown Node';

      if (!nodeType) {
        console.warn(`⚠️  [CredentialScanner] Node ${node.id} has no type, skipping`);
        continue;
      }

      console.log(`🔍 [CredentialScanner] Scanning node: ${nodeType} (${node.id})`);

      // STEP 2: Get credential requirements from hard-coded schema
      const credentialFields = getRequiredCredentialFieldsForNode(nodeType);

      if (credentialFields.length > 0) {
        console.log(`  ✅ Found ${credentialFields.length} credential field(s) in schema`);
        
        // 🚨 CRITICAL: Skip SMTP credentials for Gmail nodes (Gmail uses OAuth, not SMTP)
        const isGmailNode = nodeType === 'google_gmail';
        
        // Check each required credential field
        for (const credField of credentialFields) {
          const fieldName = credField.fieldName;
          
          // Skip SMTP fields for Gmail nodes
          if (isGmailNode && (fieldName.toLowerCase().includes('smtp') || 
              fieldName.toLowerCase().includes('host') || 
              fieldName.toLowerCase().includes('username') || 
              fieldName.toLowerCase().includes('password'))) {
            console.log(`  🔑 [CredentialScanner] Skipping SMTP field "${fieldName}" for google_gmail (uses OAuth via navbar button)`);
            continue; // Gmail uses OAuth, not SMTP
          }
          
          const fieldValue = this.getFieldValue(nodeConfig, fieldName);
          const isEmpty = this.isFieldEmpty(fieldValue);

          // Normalize credential name for deduplication
          const credentialName = this.normalizeCredentialName(credField.displayName);

          // Create credential requirement
          const credentialReq: CredentialRequirement = {
            credentialName,
            displayName: credField.displayName,
            nodeId: node.id,
            nodeType,
            nodeLabel,
            fieldName,
            description: credField.description,
            type: credField.type,
            required: true,
            isMissing: isEmpty,
          };

          // Deduplicate: If we already have this credential, keep the one that's missing (higher priority)
          const existing = credentialMap.get(credentialName);
          if (!existing || (!existing.isMissing && isEmpty)) {
            credentialMap.set(credentialName, credentialReq);
            console.log(`  🔑 ${credentialName}: ${isEmpty ? 'MISSING' : 'PROVIDED'} (field: ${fieldName})`);
          }
        }
      } else {
        // STEP 3: Fallback to schema-based detection if no hard-coded mapping exists
        console.log(`  ⚠️  No credential mapping found, using schema fallback`);
        const schemaCredentials = this.extractCredentialsFromSchema(nodeType, nodeConfig, node.id, nodeLabel);
        
        for (const cred of schemaCredentials) {
          const existing = credentialMap.get(cred.credentialName);
          if (!existing || (!existing.isMissing && cred.isMissing)) {
            credentialMap.set(cred.credentialName, cred);
            console.log(`  🔑 ${cred.credentialName}: ${cred.isMissing ? 'MISSING' : 'PROVIDED'} (schema fallback)`);
          }
        }
      }
    }

    // Convert map to array
    allCredentials.push(...credentialMap.values());

    // Separate missing vs provided
    const missingCredentials = allCredentials.filter(c => c.isMissing);
    const providedCredentials = allCredentials.filter(c => !c.isMissing);

    // Count nodes with credentials
    const nodesWithCredentials = new Set(allCredentials.map(c => c.nodeId)).size;

    const result: CredentialScanResult = {
      allRequiredCredentials: allCredentials,
      missingCredentials,
      providedCredentials,
      isValid: missingCredentials.length === 0, // Invalid if ANY credential is missing
      summary: {
        totalNodes: workflow.nodes.length,
        nodesWithCredentials,
        totalCredentials: allCredentials.length,
        missingCount: missingCredentials.length,
        providedCount: providedCredentials.length,
      },
    };

    console.log(`✅ [CredentialScanner] Scan complete:`);
    console.log(`   Total nodes: ${result.summary.totalNodes}`);
    console.log(`   Nodes with credentials: ${result.summary.nodesWithCredentials}`);
    console.log(`   Total credentials: ${result.summary.totalCredentials}`);
    console.log(`   Missing: ${result.summary.missingCount}`);
    console.log(`   Provided: ${result.summary.providedCount}`);
    console.log(`   Valid: ${result.isValid ? '✅ YES' : '❌ NO - BLOCKING EXECUTION'}`);

    if (!result.isValid) {
      console.error(`🚨 [CredentialScanner] WORKFLOW BLOCKED: Missing ${result.summary.missingCount} required credential(s):`);
      missingCredentials.forEach(cred => {
        console.error(`   - ${cred.credentialName} (${cred.nodeType}.${cred.fieldName})`);
      });
    }

    return result;
  }

  /**
   * Normalize node type (handles 'custom' type and variations)
   */
  private normalizeNodeType(node: WorkflowNode): string {
    return node.type || node.data?.type || '';
  }

  /**
   * Get field value from config (handles camelCase, snake_case, etc.)
   */
  private getFieldValue(config: Record<string, any>, fieldName: string): any {
    // Try exact match first
    if (config[fieldName] !== undefined) {
      return config[fieldName];
    }

    // Try camelCase
    const camelCase = fieldName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (config[camelCase] !== undefined) {
      return config[camelCase];
    }

    // Try snake_case
    const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (config[snakeCase] !== undefined) {
      return config[snakeCase];
    }

    // Try lowercase
    if (config[fieldName.toLowerCase()] !== undefined) {
      return config[fieldName.toLowerCase()];
    }

    return undefined;
  }

  /**
   * Check if field value is empty (missing credential)
   */
  private isFieldEmpty(value: any): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Empty string
      if (trimmed === '') {
        return true;
      }
      // Placeholder/ENV variable that needs to be filled
      if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
        // Check if it's a real ENV variable or just a placeholder
        if (trimmed.includes('ENV.') && !trimmed.includes('$json') && !trimmed.includes('input') && !trimmed.includes('trigger')) {
          return true; // ENV placeholder without actual value
        }
      }
      // Common placeholder patterns
      if (trimmed.toLowerCase().includes('placeholder') || 
          trimmed.toLowerCase().includes('example') ||
          trimmed.toLowerCase().includes('your_') ||
          trimmed.toLowerCase().includes('enter_')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize credential name for deduplication
   */
  private normalizeCredentialName(displayName: string): string {
    return displayName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Fallback: Extract credentials from node schema if no hard-coded mapping exists
   */
  private extractCredentialsFromSchema(
    nodeType: string,
    nodeConfig: Record<string, any>,
    nodeId: string,
    nodeLabel: string
  ): CredentialRequirement[] {
    const credentials: CredentialRequirement[] = [];
    const schema = this.nodeLibrary.getSchema(nodeType);

    if (!schema || !schema.configSchema) {
      return credentials;
    }

    // Check required fields
    const requiredFields = schema.configSchema.required || [];
    const optionalFields = schema.configSchema.optional || {};

    // Combine required and optional fields
    const allFields = [
      ...requiredFields.map(field => ({ name: field, required: true })),
      ...Object.keys(optionalFields).map(field => ({ name: field, required: false })),
    ];

    // 🚨 CRITICAL: Skip SMTP credentials for Gmail nodes (Gmail uses OAuth, not SMTP)
    const isGmailNode = nodeType === 'google_gmail';
    
    for (const field of allFields) {
      if (this.isCredentialField(field.name)) {
        // Skip SMTP fields for Gmail nodes
        if (isGmailNode && (field.name.toLowerCase().includes('smtp') || 
            field.name.toLowerCase().includes('host') || 
            (field.name.toLowerCase().includes('username') && !field.name.toLowerCase().includes('gmail')) || 
            field.name.toLowerCase().includes('password'))) {
          console.log(`  🔑 [CredentialScanner] Skipping SMTP field "${field.name}" for google_gmail (uses OAuth via navbar button)`);
          continue; // Gmail uses OAuth, not SMTP
        }
        
        const fieldValue = this.getFieldValue(nodeConfig, field.name);
        const isEmpty = this.isFieldEmpty(fieldValue);

        // Only include if it's required OR if it's optional but has a credential-like name
        if (field.required || this.isLikelyRequiredCredential(field.name)) {
          const credentialName = this.normalizeCredentialName(field.name);
          
          credentials.push({
            credentialName,
            displayName: this.formatFieldName(field.name),
            nodeId,
            nodeType,
            nodeLabel,
            fieldName: field.name,
            description: `Credential for ${nodeLabel}`,
            type: this.inferCredentialType(field.name),
            required: field.required,
            isMissing: isEmpty,
          });
        }
      }
    }

    return credentials;
  }

  /**
   * Check if a field name indicates a credential field
   * ✅ UPDATED: Excludes webhook URLs and configuration fields (consistent with other credential detection)
   */
  private isCredentialField(fieldName: string): boolean {
    const lower = fieldName.toLowerCase();
    
    // ✅ CRITICAL: Exclude configuration fields that are NOT credentials
    const isConfigurationField = 
      lower === 'webhookurl' || lower === 'webhook_url' || // Webhook URL is configuration, not credential
      lower === 'callbackurl' || lower === 'callback_url' || // OAuth callback URL is configuration
      lower === 'redirecturl' || lower === 'redirect_url' || // OAuth redirect URL is configuration
      lower.includes('message') || // Message fields are not credentials
      lower.includes('channel') || // Channel fields are not credentials
      lower.includes('text') || // Text fields are not credentials
      lower.includes('subject') || // Subject fields are not credentials
      lower.includes('body') || // Body fields are not credentials
      lower.includes('to') || // To fields are not credentials
      lower.includes('from'); // From fields are not credentials
    
    if (isConfigurationField) {
      return false; // Configuration fields are NOT credentials
    }
    
    // ✅ STRICT: Only detect ACTUAL credential fields
    // APIs, OAuths, Secrets, Passwords, Tokens, Keys
    const credentialKeywords = [
      'api_key', 'apikey', 'apiKey',
      'apitoken', 'api_token', 'apiToken',
      'apisecret', 'api_secret', 'apiSecret',
      'token', 'access_token', 'refresh_token',
      'secret', 'password', 'pass',
      'auth', 'authentication', 'authorization',
      'oauth', 'client_id', 'client_secret',
      'credential', 'credentialid', 'credential_id',
      'bearer', 'bearertoken', 'bearer_token',
      'bottoken', 'bot_token',
      'secrettoken', 'secret_token',
      'private_key', 'public_key', 'privateKey', 'publicKey',
      'consumer_key', 'consumer_secret',
      // Note: webhook, webhook_url removed - they're configuration, not credentials
      // Note: connection_string, username, user, email, host, port removed - these are configuration fields
    ];

    // Check if field matches credential keywords (but exclude webhook URLs)
    const matchesKeyword = credentialKeywords.some(keyword => {
      if (lower.includes(keyword)) {
        // Double-check: exclude webhook URLs and message tokens
        if (lower.includes('webhook') && lower.includes('url')) {
          return false; // webhookUrl is configuration
        }
        if (lower.includes('message') && lower.includes('token')) {
          return false; // messageToken is not a credential
        }
        return true;
      }
      return false;
    });

    return matchesKeyword;
  }

  /**
   * Check if an optional field is likely a required credential
   * ✅ UPDATED: Excludes webhook URLs (they're configuration, not credentials)
   */
  private isLikelyRequiredCredential(fieldName: string): boolean {
    const lower = fieldName.toLowerCase();
    
    // Exclude webhook URLs - they're configuration, not credentials
    if (lower === 'webhookurl' || lower === 'webhook_url') {
      return false;
    }
    
    // These patterns usually indicate required credentials even if marked optional
    return lower.includes('api_key') || 
           lower.includes('apitoken') ||
           lower.includes('token') || 
           lower.includes('secret') ||
           lower.includes('password') ||
           lower.includes('credentialid') ||
           lower.includes('oauth');
  }

  /**
   * Format field name for display
   */
  private formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Infer credential type from field name
   * ✅ UPDATED: This method should not be called for webhook URLs (they're configuration, not credentials)
   */
  private inferCredentialType(fieldName: string): 'password' | 'text' | 'url' | 'oauth' {
    const lower = fieldName.toLowerCase();
    
    // Note: webhook URLs should not reach here (filtered out in isCredentialField)
    // But if they do, return 'url' for backward compatibility
    if (lower.includes('oauth') || lower.includes('client_id') || lower.includes('client_secret')) {
      return 'oauth';
    }
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('api_key')) {
      return 'password';
    }
    if (lower.includes('email') || lower.includes('username')) {
      return 'text';
    }
    
    return 'password'; // Default to password for security
  }
}
