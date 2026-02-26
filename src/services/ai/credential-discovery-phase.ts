/**
 * Credential Discovery Phase
 * 
 * Structural architecture fix: Discover ALL credentials required for entire workflow
 * BEFORE execution. This ensures deterministic workflow generation and prevents
 * partial workflows from being created.
 * 
 * This phase runs AFTER workflow generation but BEFORE execution.
 */

import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { CredentialResolver } from './credential-resolver';

export interface CredentialRequirement {
  provider: string;
  type: 'oauth' | 'api_key' | 'webhook' | 'basic_auth' | 'token' | 'runtime';
  scopes?: string[];
  vaultKey: string;
  displayName: string;
  required: boolean;
  satisfied?: boolean; // ✅ CRITICAL: Whether credential is already in vault
  nodeTypes: string[]; // Which node types require this credential
  nodeIds: string[]; // Which specific nodes require this credential
}

export interface CredentialDiscoveryResult {
  requiredCredentials: CredentialRequirement[]; // All required credentials
  satisfiedCredentials?: CredentialRequirement[]; // Already in vault
  missingCredentials?: CredentialRequirement[]; // Need to be provided
  allDiscovered: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Credential Discovery Phase
 * 
 * Walks the entire workflow DAG and discovers ALL required credentials
 * before execution. This is a structural requirement, not optional.
 */
export class CredentialDiscoveryPhase {
  private credentialResolver: CredentialResolver;

  constructor() {
    this.credentialResolver = new CredentialResolver(nodeLibrary);
  }

  /**
   * Discover all credentials required for the workflow
   * 
   * This is a MANDATORY phase that must complete successfully
   * before the workflow can be executed.
   * 
   * ✅ CRITICAL: Checks vault during discovery to mark satisfied credentials
   * OAuth credentials already connected (via header bar) are marked as satisfied
   * 
   * @param workflow - Complete workflow with nodes and edges
   * @param userId - User ID for vault lookup (optional)
   * @returns Credential discovery result with all required credentials (satisfied marked)
   */
  async discoverCredentials(workflow: Workflow, userId?: string): Promise<CredentialDiscoveryResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const credentialMap = new Map<string, CredentialRequirement>();

    console.log('[CredentialDiscovery] Starting credential discovery for workflow...');
    console.log(`[CredentialDiscovery] Workflow has ${workflow.nodes.length} nodes`);

    // Walk every node in the workflow
    for (const node of workflow.nodes) {
      const nodeType = normalizeNodeType(node);
      const nodeId = node.id;

      // CRITICAL: Validate node schema exists
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        const error = `Node ${nodeId} (type: ${nodeType}) has no schema in node library. Cannot discover credentials.`;
        errors.push(error);
        console.error(`[CredentialDiscovery] ${error}`);
        continue; // Skip this node but continue processing others
      }

      // Discover credentials for this node
      try {
        const nodeCredentials = await this.discoverNodeCredentials(nodeType, nodeId, node, userId);
        
        // Merge into credential map (deduplicate by provider + scope)
        for (const cred of nodeCredentials) {
          const key = this.getCredentialKey(cred);
          
          if (credentialMap.has(key)) {
            // Credential already discovered - merge node references
            const existing = credentialMap.get(key)!;
            if (!existing.nodeTypes.includes(nodeType)) {
              existing.nodeTypes.push(nodeType);
            }
            if (!existing.nodeIds.includes(nodeId)) {
              existing.nodeIds.push(nodeId);
            }
          } else {
            // New credential - add to map
            credentialMap.set(key, {
              ...cred,
              nodeTypes: [nodeType],
              nodeIds: [nodeId],
            });
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorText = `Failed to discover credentials for node ${nodeId} (${nodeType}): ${errorMsg}`;
        errors.push(errorText);
        console.error(`[CredentialDiscovery] ${errorText}`);
      }
    }

    // Convert map to array
    const allCredentials = Array.from(credentialMap.values());
    
    // ✅ CRITICAL: Separate satisfied vs missing credentials
    const satisfiedCredentials = allCredentials.filter(c => c.satisfied === true);
    const missingCredentials = allCredentials.filter(c => !c.satisfied && c.required);
    const requiredCredentials = allCredentials.filter(c => c.required);

    // Validate discovery completeness
    const allDiscovered = errors.length === 0;
    
    if (!allDiscovered) {
      warnings.push(`Credential discovery completed with ${errors.length} error(s). Some credentials may be missing.`);
    }

    console.log(`[CredentialDiscovery] Discovery complete: ${allCredentials.length} unique credential(s) required`);
    console.log(`[CredentialDiscovery] Satisfied: ${satisfiedCredentials.length}, Missing: ${missingCredentials.length}`);
    
    // ✅ ORGANIZATION: Log credentials with node mapping for clarity
    console.log(`[CredentialDiscovery] Credentials:`, allCredentials.map(c => {
      const nodeIds = c.nodeIds || [];
      const nodeTypes = c.nodeTypes || [];
      return `${c.displayName} (${c.satisfied ? '✅' : '❌'}) - nodes: [${nodeIds.join(', ')}] (${nodeTypes.join(', ')})`;
    }).join(', '));

    return {
      requiredCredentials: allCredentials, // All credentials (both satisfied and missing)
      satisfiedCredentials, // Already in vault
      missingCredentials, // Need to be provided
      allDiscovered,
      errors,
      warnings,
    };
  }

  /**
   * Discover credentials for a single node
   * ✅ CRITICAL: Checks vault during discovery to mark satisfied credentials
   */
  private async discoverNodeCredentials(
    nodeType: string,
    nodeId: string,
    node: WorkflowNode,
    userId?: string
  ): Promise<CredentialRequirement[]> {
    const credentials: CredentialRequirement[] = [];

    // Use CredentialResolver to get credential contracts for this node type
    const contracts = this.credentialResolver.getCredentialContracts(nodeType);

    if (contracts && contracts.length > 0) {
      for (const contract of contracts) {
        // ✅ CRITICAL: Check vault during discovery to mark satisfied credentials
        let satisfied = userId ? await this.credentialResolver.checkVaultForCredential(
          contract.vaultKey,
          contract.type,
          userId
        ) : false;

        // ✅ CRITICAL: For Google OAuth, also check if vaultKey matches 'google' (handles different vaultKey formats)
        if (!satisfied && contract.type === 'oauth' && contract.provider === 'google') {
          // Try checking with 'google' as vaultKey (credential resolver uses this)
          satisfied = userId ? await this.credentialResolver.checkVaultForCredential(
            'google', // Use 'google' as vaultKey for Google OAuth
            'oauth',
            userId
          ) : false;
        }

        // ✅ CRITICAL: Also check if credential is already injected in node config
        // This handles cases where credentials are attached via attach-credentials endpoint
        if (!satisfied) {
          const config = node.data?.config || {};
          const schema = nodeLibrary.getSchema(nodeType);
          
          // For Slack webhook, check if webhookUrl is populated
          if (contract.type === 'webhook' && contract.provider === 'slack') {
            const webhookUrl = config.webhookUrl;
            if (webhookUrl && typeof webhookUrl === 'string' && 
                webhookUrl.trim() !== '' && 
                !webhookUrl.includes('{{ENV.') &&
                !webhookUrl.includes('{{$json') &&
                webhookUrl.startsWith('http')) {
              satisfied = true;
              console.log(`[CredentialDiscovery] ✅ Slack webhook URL found in node config for ${nodeId}`);
            }
          }
          // For other credential types, check schema required fields
          else if (schema && schema.configSchema) {
            const requiredFields = schema.configSchema.required || [];
            for (const field of requiredFields) {
              const fieldValue = config[field];
              // Check if field is populated and not a placeholder
              if (fieldValue && typeof fieldValue === 'string' && 
                  fieldValue.trim() !== '' && 
                  !fieldValue.includes('{{ENV.') &&
                  !fieldValue.includes('{{$json')) {
                // Field is populated - credential might be satisfied
                // For webhook URLs, validate format
                if (field.toLowerCase().includes('webhook') || field.toLowerCase().includes('url')) {
                  if (fieldValue.startsWith('http')) {
                    satisfied = true;
                    console.log(`[CredentialDiscovery] ✅ Credential field "${field}" found in node config for ${nodeId}`);
                    break;
                  }
                } else {
                  // For other fields (tokens, keys, etc.), assume satisfied if non-empty
                  satisfied = true;
                  console.log(`[CredentialDiscovery] ✅ Credential field "${field}" found in node config for ${nodeId}`);
                  break;
                }
              }
            }
          }
        }

        credentials.push({
          provider: contract.provider,
          type: contract.type,
          scopes: contract.scopes,
          vaultKey: contract.vaultKey,
          displayName: contract.displayName,
          required: contract.required,
          satisfied, // ✅ Mark if already in vault OR injected in config
          nodeTypes: [nodeType],
          nodeIds: [nodeId],
        });
      }
    } else {
      // ✅ ENHANCED: No credential contracts defined - check schema for credential fields
      // This handles nodes that don't have connectors registered but still need credentials
      const schema = nodeLibrary.getSchema(nodeType);
      if (schema && schema.configSchema) {
        const config = node.data?.config || {};
        const requiredFields = schema.configSchema.required || [];
        const optionalFields = Object.keys(schema.configSchema.optional || {});
        const allFields = [...requiredFields, ...optionalFields];
        
        // Check for credential fields in both required and optional
        for (const field of allFields) {
          const fieldLower = field.toLowerCase();
          const fieldValue = config[field];
          
          // ✅ FIXED: Exclude configuration fields (not credentials)
          // Configuration fields: maxTokens, max_tokens, temperature, model, etc.
          const isConfigurationField = fieldLower === 'maxtokens' ||
                                      fieldLower === 'max_tokens' ||
                                      fieldLower === 'max-tokens' ||
                                      fieldLower === 'temperature' ||
                                      fieldLower === 'model' ||
                                      fieldLower === 'baseurl' ||
                                      fieldLower === 'base_url' ||
                                      fieldLower === 'timeout' ||
                                      fieldLower === 'retries' ||
                                      fieldLower === 'stream' ||
                                      fieldLower === 'cache' ||
                                      fieldLower === 'prompt' ||
                                      fieldLower === 'system' ||
                                      fieldLower === 'top_p' ||
                                      fieldLower === 'top_p' ||
                                      fieldLower === 'frequency_penalty' ||
                                      fieldLower === 'presence_penalty';
          
          if (isConfigurationField) {
            // Skip configuration fields - these are not credentials
            continue;
          }
          
          // ✅ FIXED: Check if this is a credential field
          // Credentials = API keys / OAuth / tokens only
          // Exclude configuration fields like maxTokens
          const isCredentialField = fieldLower.includes('apikey') || 
                                   fieldLower.includes('api_key') ||
                                   fieldLower.includes('api-key') ||
                                   fieldLower === 'apikey' ||
                                   fieldLower === 'api_key' ||
                                   fieldLower.includes('apitoken') ||
                                   fieldLower.includes('api_token') ||
                                   fieldLower === 'apitoken' ||
                                   fieldLower === 'api_token' ||
                                   fieldLower.includes('accesstoken') ||
                                   fieldLower.includes('access_token') ||
                                   fieldLower === 'accesstoken' ||
                                   fieldLower === 'access_token' ||
                                   // ✅ FIXED: Only match token fields that are actual credentials
                                   // Exclude maxTokens, max_tokens, etc. (already excluded above)
                                   (fieldLower.includes('token') && 
                                    !fieldLower.includes('message') && 
                                    !fieldLower.includes('max')) ||
                                   fieldLower.includes('secret') ||
                                   fieldLower.includes('password') ||
                                   fieldLower.includes('credentialid') ||
                                   fieldLower.includes('credential_id') ||
                                   fieldLower === 'credentialid' ||
                                   fieldLower === 'credential_id' ||
                                   fieldLower.includes('webhook') ||
                                   fieldLower.includes('oauth') ||
                                   fieldLower.includes('client_id') ||
                                   fieldLower.includes('client_secret') ||
                                   fieldLower.includes('bearer') ||
                                   fieldLower.includes('authorization');
          
          if (isCredentialField) {
            // Check if credential is already populated
            const isPopulated = fieldValue && 
                               typeof fieldValue === 'string' && 
                               fieldValue.trim() !== '' &&
                               !fieldValue.includes('{{ENV.') &&
                               !fieldValue.includes('{{$json');
            
            // Infer provider from node type
            const provider = nodeType.toLowerCase().replace(/_/g, '');
            const displayName = field === 'apiKey' ? `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} API Key` :
                               field === 'apiToken' ? `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} API Token` :
                               field === 'accessToken' ? `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Access Token` :
                               `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} ${field}`;
            
            // Determine credential type
            const credType = fieldLower.includes('token') && !fieldLower.includes('api') ? 'token' :
                            fieldLower.includes('oauth') || fieldLower.includes('access') ? 'oauth' : 'api_key';
            
            // Check vault if userId provided
            let vaultSatisfied = false;
            if (userId) {
              try {
                const vaultCheck = await this.credentialResolver.checkVaultForCredential(provider, credType, userId);
                vaultSatisfied = vaultCheck === true;
              } catch (error) {
                console.warn(`[CredentialDiscovery] Error checking vault for ${provider}:`, error);
                vaultSatisfied = false;
              }
            }
            
            // ✅ CRITICAL: Ensure satisfied is always a boolean
            const isSatisfied = Boolean(isPopulated || vaultSatisfied);
            
            credentials.push({
              provider,
              type: credType as any,
              vaultKey: provider,
              displayName,
              required: requiredFields.includes(field),
              satisfied: isSatisfied,
              nodeTypes: [nodeType],
              nodeIds: [nodeId],
            });
            
            console.log(`[CredentialDiscovery] ✅ Discovered credential field "${field}" for ${nodeType} (${isPopulated ? 'POPULATED' : 'MISSING'})`);
          }
        }
      }
    }

    return credentials;
  }

  /**
   * Generate unique key for credential deduplication
   * Uses provider + type + scopes (sorted) as key
   * 
   * ✅ CRITICAL FIX: This ensures Gmail, Sheets, and Docs get separate
   * credential requirements even though they share the same provider.
   */
  private getCredentialKey(cred: CredentialRequirement): string {
    // For OAuth credentials with scopes, include scope signature in key
    if (cred.type === 'oauth' && cred.scopes && cred.scopes.length > 0) {
      // Sort scopes for consistent key generation
      const sortedScopes = [...cred.scopes].sort();
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
      
      return `${cred.provider}:${cred.type}:${scopeSignature}`;
    }
    
    // For non-OAuth or OAuth without scopes, use provider + type
    const scopeKey = cred.scopes ? cred.scopes.sort().join(',') : '';
    return `${cred.provider}:${cred.type}:${scopeKey}`;
  }

  /**
   * Validate that all required credentials are available
   * 
   * @param workflow - Workflow to validate
   * @param availableCredentials - Map of available credentials (vaultKey -> true)
   * @returns Validation result
   */
  async validateCredentialsAvailable(
    workflow: Workflow,
    availableCredentials: Map<string, boolean>
  ): Promise<{
    valid: boolean;
    missing: CredentialRequirement[];
    errors: string[];
  }> {
    const discovery = await this.discoverCredentials(workflow);
    const missing: CredentialRequirement[] = [];

    for (const cred of discovery.requiredCredentials) {
      if (cred.required) {
        const isAvailable = availableCredentials.get(cred.vaultKey) === true;
        if (!isAvailable) {
          missing.push(cred);
        }
      }
    }

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`Missing ${missing.length} required credential(s): ${missing.map(c => c.displayName).join(', ')}`);
    }

    return {
      valid: missing.length === 0,
      missing,
      errors,
    };
  }
}

// Export singleton instance
export const credentialDiscoveryPhase = new CredentialDiscoveryPhase();
