/**
 * Centralized Credential Resolution Engine
 * 
 * 🎯 GOAL: Single source of truth for credential detection
 * 
 * RULES:
 * 1. Runs AFTER all node selection, repair, filtering, and layout
 * 2. Uses Connector Registry to determine required credentials
 * 3. Checks vault for stored credentials
 * 4. Returns deterministic, complete credential requirements
 * 5. Never requests SMTP for Gmail nodes
 * 6. Never skips required credentials
 * 
 * ARCHITECTURE: Uses Connector Registry for strict connector isolation
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { NodeLibrary } from '../nodes/node-library';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { connectorRegistry } from '../connectors/connector-registry';
import { getCredentialVault, CredentialAccessContext } from '../credential-vault';

export interface CredentialRequirement {
  credentialId: string; // Unique identifier (e.g., "google_oauth_gmail", "google_oauth_sheets")
  displayName: string; // User-friendly name
  nodeId: string; // Single node ID (for backward compatibility)
  nodeIds?: string[]; // Multiple node IDs that require this credential
  nodeType: string; // Single node type (for backward compatibility)
  nodeTypes?: string[]; // Multiple node types that require this credential
  nodeLabel: string;
  provider: string; // "google", "slack", "smtp", etc.
  type: 'oauth' | 'api_key' | 'webhook' | 'token' | 'basic_auth' | 'runtime';
  scopes?: string[]; // For OAuth (e.g., ["gmail.send"])
  required: boolean;
  resolved: boolean; // Whether credential is already stored
  source?: 'vault' | 'user_input'; // Where credential comes from
  vaultKey?: string; // Key in vault (e.g., "google", "slack")
}

export interface CredentialResolutionResult {
  required: CredentialRequirement[];
  missing: CredentialRequirement[];
  satisfied: CredentialRequirement[];
  providers: string[]; // Unique list of providers
  summary: {
    totalNodes: number;
    nodesWithCredentials: number;
    totalCredentials: number;
    missingCount: number;
    satisfiedCount: number;
  };
}

/**
 * Get credential contracts for a node type from Connector Registry
 * 
 * This replaces the old NODE_CREDENTIAL_CONTRACTS map.
 * Now uses Connector Registry for strict connector isolation.
 */
function getCredentialContractsForNode(nodeType: string): Array<{
  provider: string;
  type: 'oauth' | 'api_key' | 'webhook' | 'token' | 'basic_auth' | 'runtime';
  scopes?: string[];
  vaultKey: string;
  displayName: string;
  required: boolean;
}> {
  // Get connector for this node type
  const connector = connectorRegistry.getConnectorByNodeType(nodeType);
  
  if (!connector) {
    // Node type doesn't have a connector (e.g., trigger nodes, AI nodes)
    return [];
  }

  // Return credential contract from connector
  return [{
    provider: connector.credentialContract.provider,
    type: connector.credentialContract.type,
    scopes: connector.credentialContract.scopes,
    vaultKey: connector.credentialContract.vaultKey,
    displayName: connector.credentialContract.displayName,
    required: connector.credentialContract.required,
  }];
}

export class CredentialResolver {
  private nodeLibrary: NodeLibrary;
  private supabase: ReturnType<typeof getSupabaseClient>;

  constructor(nodeLibrary: NodeLibrary) {
    this.nodeLibrary = nodeLibrary;
    this.supabase = getSupabaseClient();
  }

  /**
   * Resolve all credentials for a workflow
   * 
   * This is the SINGLE AUTHORITATIVE credential detection pass.
   * Must run AFTER:
   * - Node selection
   * - Auto-repair
   * - Trigger enforcement
   * - Node deduplication
   * - Final graph layout
   * 
   * @param workflow - Final workflow with all nodes
   * @param userId - User ID for vault lookup
   * @returns Complete credential resolution result
   */
  async resolve(
    workflow: { nodes: WorkflowNode[] },
    userId?: string
  ): Promise<CredentialResolutionResult> {
    console.log('[CredentialResolution] Starting credential resolution...');
    console.log(`[CredentialResolution] nodes=${workflow.nodes.length}`);

    const allRequirements: CredentialRequirement[] = [];
    const credentialMap = new Map<string, CredentialRequirement>(); // Deduplicate by credentialId

    // STEP 1: Iterate all final nodes
    for (const node of workflow.nodes || []) {
      const nodeType = this.normalizeNodeType(node);
      const nodeLabel = node.data?.label || nodeType || 'Unknown Node';
      const nodeId = node.id;

      if (!nodeType) {
        console.warn(`[CredentialResolution] Node ${nodeId} has no type, skipping`);
        continue;
      }

      // STEP 2: Get credential contract for this node type from Connector Registry
      const contracts = getCredentialContractsForNode(nodeType);
      
      if (contracts.length === 0) {
        // Node doesn't require credentials
        continue;
      }

      console.log(`[CredentialResolution] Node ${nodeType} (${nodeId}) requires ${contracts.length} credential(s)`);

      // STEP 3: Create credential requirements from contracts
      for (const contract of contracts) {
        // ✅ CRITICAL FIX: Generate unique credential ID based on provider + type + scopes
        // This ensures Gmail, Sheets, and Docs get separate credential requirements
        // even though they all use Google OAuth
        const credentialId = this.generateCredentialId(contract);
        
        // Check if credential is already in vault
        const resolved = userId ? await this.checkVault(contract.vaultKey, contract.type, userId) : false;

        const requirement: CredentialRequirement = {
          credentialId,
          displayName: contract.displayName,
          nodeId,
          nodeIds: [nodeId],
          nodeType,
          nodeTypes: [nodeType],
          nodeLabel,
          provider: contract.provider,
          type: contract.type,
          scopes: contract.scopes,
          required: contract.required,
          resolved,
          source: resolved ? 'vault' : undefined,
          vaultKey: contract.vaultKey,
        };

        // ✅ CRITICAL FIX: Deduplicate only when credential ID matches exactly
        // This means scopes must be identical to merge
        const existing = credentialMap.get(credentialId);
        if (!existing) {
          // New credential requirement - add it
          credentialMap.set(credentialId, requirement);
          console.log(`[CredentialResolution] ${credentialId}: ${resolved ? 'SATISFIED' : 'MISSING'} (${contract.provider}) - ${contract.displayName}`);
        } else {
          // Credential with same ID already exists - merge node references
          // Keep the one that's missing (higher priority for user action)
          if (!existing.resolved && resolved) {
            // Existing is missing, new is resolved - keep existing (user needs to provide it)
            console.log(`[CredentialResolution] ${credentialId}: Keeping MISSING requirement (${contract.provider})`);
          } else if (existing.resolved && !resolved) {
            // Existing is resolved, new is missing - update to missing (user needs to provide it)
            credentialMap.set(credentialId, requirement);
            console.log(
              `[CredentialResolution] ${credentialId}: Updated to MISSING (${contract.provider})`
            );
          } else {
            // Both same state - merge node references
            // Ensure nodeIds/nodeTypes arrays are initialized for backward compatibility
            if (!existing.nodeIds) {
              existing.nodeIds = [existing.nodeId];
            }
            if (!existing.nodeTypes) {
              existing.nodeTypes = [existing.nodeType];
            }

            if (!existing.nodeIds.includes(nodeId)) {
              existing.nodeIds.push(nodeId);
            }
            if (!existing.nodeTypes.includes(nodeType)) {
              existing.nodeTypes.push(nodeType);
            }
            console.log(
              `[CredentialResolution] ${credentialId}: Merged node references (${contract.provider})`
            );
          }
        }
      }
    }

    // Convert map to array
    allRequirements.push(...credentialMap.values());

    // Separate missing vs satisfied
    const missing = allRequirements.filter(c => !c.resolved && c.required);
    const satisfied = allRequirements.filter(c => c.resolved);
    const required = allRequirements.filter(c => c.required);

    // Get unique providers
    const providers = Array.from(new Set(allRequirements.map(c => c.provider)));

    // Calculate nodes with credentials (accounting for nodeIds arrays)
    const allNodeIds = new Set<string>();
    for (const cred of allRequirements) {
      if (cred.nodeIds && cred.nodeIds.length > 0) {
        cred.nodeIds.forEach(id => allNodeIds.add(id));
      } else {
        allNodeIds.add(cred.nodeId);
      }
    }

    const result: CredentialResolutionResult = {
      required,
      missing,
      satisfied,
      providers,
      summary: {
        totalNodes: workflow.nodes.length,
        nodesWithCredentials: allNodeIds.size,
        totalCredentials: allRequirements.length,
        missingCount: missing.length,
        satisfiedCount: satisfied.length,
      },
    };

    // ✅ ENHANCED LOGGING: Log detected nodes and their credential requirements
    console.log('[CredentialResolution] ========================================');
    console.log('[CredentialResolution] Resolution complete:');
    console.log(`[CredentialResolution] nodes=${result.summary.totalNodes}`);
    console.log(`[CredentialResolution] providers=[${providers.join(', ')}]`);
    console.log(`[CredentialResolution] total=${result.summary.totalCredentials}, missing=${result.summary.missingCount}, satisfied=${result.summary.satisfiedCount}`);
    console.log('[CredentialResolution] ----------------------------------------');
    console.log('[CredentialResolution] Detected Credentials:');
    allRequirements.forEach(cred => {
      const nodeTypes = cred.nodeTypes || [cred.nodeType];
      const nodeIds = cred.nodeIds || [cred.nodeId];
      console.log(`[CredentialResolution]   - ${cred.credentialId} (${cred.displayName})`);
      console.log(`[CredentialResolution]     Provider: ${cred.provider}, Type: ${cred.type}`);
      console.log(`[CredentialResolution]     Scopes: ${cred.scopes ? cred.scopes.join(', ') : 'none'}`);
      console.log(`[CredentialResolution]     Node Types: ${nodeTypes.join(', ')}`);
      console.log(`[CredentialResolution]     Node IDs: ${nodeIds.join(', ')}`);
      console.log(`[CredentialResolution]     Status: ${cred.resolved ? '✅ SATISFIED' : '❌ MISSING'}`);
    });
    console.log('[CredentialResolution] ========================================');

    // ✅ VALIDATION: Ensure all Google integrations are properly detected
    this.validateGoogleIntegrations(workflow, allRequirements);

    return result;
  }

  /**
   * Check if credential exists in vault (public method for credential discovery)
   * ✅ CRITICAL: Used by credential discovery to check vault state
   */
  async checkVaultForCredential(
    vaultKey: string,
    credentialType: string,
    userId: string
  ): Promise<boolean> {
    return this.checkVault(vaultKey, credentialType, userId);
  }

  /**
   * Check if credential exists in vault (private implementation)
   */
  private async checkVault(
    vaultKey: string,
    credentialType: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Get user from Supabase
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      
      if (authError || !user) {
        // If no user, try to use userId directly (for service role)
        if (!userId) {
          return false;
        }
      }

      const effectiveUserId = user?.id || userId;

      // 🔒 SPECIAL HANDLING: Google OAuth tokens are stored in google_oauth_tokens table
      // This is where the "Connect Google" button stores credentials
      if (vaultKey.toLowerCase() === 'google' && credentialType === 'oauth') {
        const { data: tokenData, error: tokenError } = await this.supabase
          .from('google_oauth_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', effectiveUserId)
          .single();

        if (!tokenError && tokenData) {
          // Check if token is valid (not expired or about to expire)
          const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
          const now = new Date();
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

          // Token is valid if it exists and (not expired OR has refresh token)
          if (tokenData.access_token && (!expiresAt || expiresAt > fiveMinutesFromNow || tokenData.refresh_token)) {
            console.log(`[CredentialResolution] ✅ Google OAuth found in google_oauth_tokens table`);
            return true;
          }
        }
      }

      // 🔒 SPECIAL HANDLING: LinkedIn OAuth tokens are stored in linkedin_oauth_tokens table
      // This is where the "Connect LinkedIn" button stores credentials
      if (vaultKey.toLowerCase() === 'linkedin' && credentialType === 'oauth') {
        const { data: tokenData, error: tokenError } = await this.supabase
          .from('linkedin_oauth_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', effectiveUserId)
          .single();

        if (!tokenError && tokenData) {
          const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
          const now = new Date();
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

          // Token is valid if it exists and (not expired OR has refresh token)
          if (tokenData.access_token && (!expiresAt || expiresAt > fiveMinutesFromNow || tokenData.refresh_token)) {
            console.log(`[CredentialResolution] ✅ LinkedIn OAuth found in linkedin_oauth_tokens table`);
            return true;
          }
        }
      }

      // 🆕 CREDENTIAL VAULT: Check unified credential vault
      try {
        const vault = getCredentialVault();
        const exists = await vault.exists(
          { userId: effectiveUserId } as CredentialAccessContext,
          vaultKey
        );
        
        if (exists) {
          console.log(`[CredentialResolution] ✅ Credential found in vault: ${vaultKey}`);
          return true;
        }
      } catch (vaultError) {
        // Vault check failed, continue to other checks
        console.warn(`[CredentialResolution] Vault check failed for ${vaultKey}:`, vaultError);
      }

      // Check user_credentials table (for other services - legacy)
      const { data, error } = await this.supabase
        .from('user_credentials')
        .select('credentials')
        .eq('user_id', effectiveUserId)
        .eq('service', vaultKey.toLowerCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No credentials found
          return false;
        }
        console.warn(`[CredentialResolution] Error checking vault for ${vaultKey}:`, error.message);
        return false;
      }

      // Check if credentials object has required fields
      const credentials = data?.credentials || {};
      
      // For OAuth, check for access_token or refresh_token
      if (credentialType === 'oauth') {
        return !!(credentials.accessToken || credentials.access_token || credentials.refreshToken || credentials.refresh_token);
      }
      
      // For webhook, check for webhookUrl or webhook_url
      if (credentialType === 'webhook') {
        return !!(credentials.webhookUrl || credentials.webhook_url || credentials.url);
      }
      
      // For api_key, check for apiKey, api_key, or the vaultKey itself
      if (credentialType === 'api_key') {
        return !!(credentials.apiKey || credentials.api_key || credentials[vaultKey]);
      }

      // Default: if credentials object exists and is not empty, consider it resolved
      return Object.keys(credentials).length > 0;
    } catch (error) {
      console.warn(`[CredentialResolution] Exception checking vault for ${vaultKey}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Normalize node type (handles 'custom' type and variations)
   */
  /**
   * Get credential contracts for a node type
   * Used by CredentialDiscoveryPhase to discover all required credentials
   * Now uses Connector Registry
   */
  getCredentialContracts(nodeType: string): Array<{
    provider: string;
    type: 'oauth' | 'api_key' | 'webhook' | 'token' | 'basic_auth' | 'runtime';
    scopes?: string[];
    vaultKey: string;
    displayName: string;
    required: boolean;
  }> {
    // ✅ CRITICAL: Canonicalize aliases (e.g., "gmail" → "google_gmail") so
    // connector-based credential contracts apply consistently across the system.
    // Otherwise, CredentialDiscoveryPhase falls back to schema heuristics and may
    // incorrectly treat `credentialId` as an unsatisfied API key for "gmail".
    const canonicalType = this.nodeLibrary.getCanonicalType(nodeType);
    return getCredentialContractsForNode(canonicalType);
  }

  /**
   * Generate unique credential ID based on provider, type, and scopes
   * 
   * This ensures that different Google integrations (Gmail, Sheets, Docs)
   * get separate credential requirements even though they share the same
   * provider and type.
   * 
   * Examples:
   * - Gmail: "google_oauth_gmail.send,gmail.read"
   * - Sheets: "google_oauth_spreadsheets,spreadsheets.readonly"
   * - Docs: "google_oauth_documents,documents.readonly"
   */
  private generateCredentialId(contract: {
    provider: string;
    type: string;
    scopes?: string[];
  }): string {
    // For OAuth credentials with scopes, include scope signature in ID
    if (contract.type === 'oauth' && contract.scopes && contract.scopes.length > 0) {
      // Sort scopes for consistent ID generation
      const sortedScopes = [...contract.scopes].sort();
      // Create a short signature from scopes (extract service name from scope URL)
      const scopeSignature = sortedScopes
        .map(scope => {
          // Extract service name from scope URL
          // e.g., "https://www.googleapis.com/auth/gmail.send" -> "gmail"
          // e.g., "https://www.googleapis.com/auth/spreadsheets" -> "spreadsheets"
          const match = scope.match(/\/auth\/([^.\/]+)/);
          return match ? match[1] : scope.split('/').pop() || '';
        })
        .filter(Boolean)
        .join('_');
      
      return `${contract.provider}_${contract.type}_${scopeSignature}`;
    }
    
    // For non-OAuth or OAuth without scopes, use provider + type
    return `${contract.provider}_${contract.type}`;
  }

  private normalizeNodeType(node: WorkflowNode): string {
    return node.type || node.data?.type || '';
  }

  /**
   * Assert that Gmail nodes are never downgraded to SMTP
   * 
   * @param workflow - Final workflow
   * @param originalPrompt - Original user prompt
   * @throws Error if Gmail mentioned but no Gmail node exists
   */
  assertGmailIntegrity(workflow: { nodes: WorkflowNode[] }, originalPrompt: string): void {
    const promptLower = originalPrompt.toLowerCase();
    const mentionsGmail = promptLower.includes('gmail') || 
                         promptLower.includes('google mail') || 
                         promptLower.includes('google email');

    if (!mentionsGmail) {
      return; // No Gmail mentioned, skip check
    }

    // Check if workflow has Gmail node
    const hasGmailNode = workflow.nodes.some(node => {
      const nodeType = this.normalizeNodeType(node);
      const canonicalType = this.nodeLibrary.getCanonicalType(nodeType);
      return canonicalType === 'google_gmail';
    });

    if (!hasGmailNode) {
      // Check if it has generic email node (this is a downgrade!)
      const hasEmailNode = workflow.nodes.some(node => {
        const nodeType = this.normalizeNodeType(node);
        return nodeType === 'email';
      });

      if (hasEmailNode) {
        throw new Error(
          `🚨 CRITICAL: Prompt mentions Gmail but workflow contains generic email node (SMTP). ` +
          `Gmail must use google_gmail node with OAuth, not SMTP. ` +
          `This indicates a node selection or repair error.`
        );
      } else {
        throw new Error(
          `🚨 CRITICAL: Prompt mentions Gmail but no Gmail node exists in workflow. ` +
          `Workflow generation must select google_gmail node when Gmail is mentioned.`
        );
      }
    }

    console.log('[CredentialResolution] ✅ Gmail integrity check passed');
  }

  /**
   * Validate that all Google integrations in the workflow have corresponding credentials
   * 
   * This ensures that if a workflow contains Gmail, Sheets, or Docs nodes,
   * the credential resolution detects separate credential requirements for each.
   * 
   * @param workflow - Workflow with nodes
   * @param allRequirements - All credential requirements
   * @throws Error if Google integration nodes exist but credentials are missing
   */
  private validateGoogleIntegrations(
    workflow: { nodes: WorkflowNode[] },
    allRequirements: CredentialRequirement[]
  ): void {
    // Detect which Google integrations are in the workflow
    const detectedIntegrations = new Set<string>();
    const googleNodes: Array<{ nodeId: string; nodeType: string; integration: string }> = [];

    for (const node of workflow.nodes) {
      const nodeType = this.normalizeNodeType(node);
      
      if (nodeType === 'google_gmail') {
        detectedIntegrations.add('gmail');
        googleNodes.push({ nodeId: node.id, nodeType, integration: 'gmail' });
      } else if (nodeType === 'google_sheets') {
        detectedIntegrations.add('sheets');
        googleNodes.push({ nodeId: node.id, nodeType, integration: 'sheets' });
      } else if (nodeType === 'google_doc') {
        detectedIntegrations.add('docs');
        googleNodes.push({ nodeId: node.id, nodeType, integration: 'docs' });
      }
    }

    if (detectedIntegrations.size === 0) {
      // No Google integrations, skip validation
      return;
    }

    console.log(`[CredentialResolution] Validating Google integrations: ${Array.from(detectedIntegrations).join(', ')}`);

    // Check that each Google integration has a corresponding credential requirement
    const googleCredentials = allRequirements.filter(c => c.provider === 'google' && c.type === 'oauth');
    
    // Map credentials to their integration types based on scopes
    const credentialIntegrations = new Set<string>();
    for (const cred of googleCredentials) {
      if (cred.scopes) {
        for (const scope of cred.scopes) {
          if (scope.includes('gmail')) {
            credentialIntegrations.add('gmail');
          } else if (scope.includes('spreadsheets')) {
            credentialIntegrations.add('sheets');
          } else if (scope.includes('documents')) {
            credentialIntegrations.add('docs');
          }
        }
      }
    }

    // Validate that all detected integrations have credentials
    const missingIntegrations: string[] = [];
    for (const integration of detectedIntegrations) {
      if (!credentialIntegrations.has(integration)) {
        missingIntegrations.push(integration);
      }
    }

    if (missingIntegrations.length > 0) {
      const errorMsg = `🚨 CRITICAL: Workflow contains Google ${missingIntegrations.join(', ')} node(s) but no corresponding credential requirement detected. ` +
        `Detected nodes: ${googleNodes.map(n => `${n.integration} (${n.nodeId})`).join(', ')}. ` +
        `Detected credentials: ${Array.from(credentialIntegrations).join(', ') || 'none'}. ` +
        `This indicates a credential resolution bug.`;
      console.error(`[CredentialResolution] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Additional validation: If multiple Google integrations exist, ensure multiple credentials
    if (detectedIntegrations.size > 1 && googleCredentials.length === 1) {
      const errorMsg = `🚨 CRITICAL: Workflow contains ${detectedIntegrations.size} different Google integrations ` +
        `(${Array.from(detectedIntegrations).join(', ')}) but only 1 credential requirement detected. ` +
        `Each Google integration (Gmail, Sheets, Docs) should have its own credential requirement. ` +
        `This indicates a credential deduplication bug.`;
      console.error(`[CredentialResolution] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`[CredentialResolution] ✅ Google integration validation passed: ${detectedIntegrations.size} integration(s), ${googleCredentials.length} credential(s)`);
  }

  /**
   * Assert that Gmail nodes require Google OAuth credentials
   * 
   * @param resolution - Credential resolution result
   * @param workflow - Final workflow
   * @throws Error if Gmail node exists but no Google credential in scan
   */
  assertGmailCredentials(resolution: CredentialResolutionResult, workflow: { nodes: WorkflowNode[] }): void {
    const hasGmailNode = workflow.nodes.some(node => {
      const nodeType = this.normalizeNodeType(node);
      return nodeType === 'google_gmail';
    });

    if (!hasGmailNode) {
      return; // No Gmail node, skip check
    }

    // Check if Google credential is in resolution
    const hasGoogleCredential = resolution.required.some(c => c.provider === 'google');

    if (!hasGoogleCredential) {
      throw new Error(
        `🚨 CRITICAL: Workflow contains google_gmail node but no Google OAuth credential detected. ` +
        `Credential resolution must include Google OAuth for Gmail nodes.`
      );
    }

    // Check that it's OAuth, not SMTP
    const googleCredential = resolution.required.find(c => c.provider === 'google');
    if (googleCredential && googleCredential.type !== 'oauth') {
      throw new Error(
        `🚨 CRITICAL: Gmail node requires OAuth credential, but detected type: ${googleCredential.type}. ` +
        `Gmail must use OAuth, never SMTP.`
      );
    }

    // Check that SMTP is NOT requested
    const hasSmtpCredential = resolution.required.some(c => c.provider === 'smtp');
    if (hasSmtpCredential) {
      throw new Error(
        `🚨 CRITICAL: Workflow contains Gmail node but SMTP credentials are also requested. ` +
        `Gmail uses OAuth, not SMTP. Remove SMTP credential requirement.`
      );
    }

    console.log('[CredentialResolution] ✅ Gmail credential check passed');
  }
}
