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
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import { CredentialResolver } from './credential-resolver';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { isCredentialSatisfiedByNodeConfig } from './credential-config-satisfaction';
import { geminiOrchestrator } from './gemini-orchestrator';
import { queryAsService } from '../../core/database/db-pool';

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
  /** AI-generated: plain-English explanation of why this credential is needed */
  simpleDescription?: string;
  /** AI-generated: technical explanation of how the credential is used (auth flow, header, etc.) */
  technicalDescription?: string;
  /** AI-generated: step-by-step instructions for obtaining this credential */
  howToObtain?: string;
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
   * @param workflowOrId - Complete workflow with nodes and edges, OR a workflowId string
   * @param userId - User ID for vault lookup (optional)
   * @param dbClient - AWS RDS database client (required when workflowOrId is a string)
   * @returns Credential discovery result with all required credentials (satisfied marked)
   */
  async discoverCredentials(
    workflowOrId: Workflow | string,
    userId?: string,
    supabaseClient?: any
  ): Promise<CredentialDiscoveryResult> {
    // If a workflowId string is passed, fetch the committed row from DB (e.g. read-only tooling).
    // attach-inputs / attach-credentials should pass a Workflow object so discovery sees the same
    // reconciled node types as the handler (DB row can still be ollama until save after reconcile).
    let workflow: Workflow;
    if (typeof workflowOrId === 'string') {
      const workflowId = workflowOrId;
      if (!supabaseClient) {
        throw new Error('[CredentialDiscovery] supabaseClient is required when workflowId is passed as string');
      }
      const { data, error } = await supabaseClient
        .from('workflows')
        .select('nodes, edges, graph')
        .eq('id', workflowId)
        .single();
      if (error || !data) {
        throw new Error(`[CredentialDiscovery] Failed to fetch workflow ${workflowId} from DB: ${error?.message}`);
      }
      // Parse nodes/edges — DB may return JSON strings
      let nodes = data.nodes;
      let edges = data.edges;
      if (data.graph && typeof data.graph === 'object' && Array.isArray(data.graph.nodes)) {
        nodes = data.graph.nodes;
        edges = data.graph.edges;
      }
      if (typeof nodes === 'string') nodes = JSON.parse(nodes);
      if (typeof edges === 'string') edges = JSON.parse(edges);
      workflow = { nodes: nodes || [], edges: edges || [] } as Workflow;
      console.log(`[CredentialDiscovery] ✅ Loaded workflow ${workflowId} from DB (${workflow.nodes.length} nodes)`);
    } else {
      workflow = workflowOrId;
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const credentialMap = new Map<string, CredentialRequirement>();

    console.log('[CredentialDiscovery] Starting credential discovery for workflow...');
    console.log(`[CredentialDiscovery] Workflow has ${workflow.nodes.length} nodes`);

    // Walk every node in the workflow
    for (const node of workflow.nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
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

    // Enrich credentials with AI-generated guidance (non-blocking)
    const enrichedCredentials = await this.enrichWithAIGuidance(allCredentials).catch(() => allCredentials);

    const enrichedSatisfied = enrichedCredentials.filter(c => c.satisfied === true);
    const enrichedMissing = enrichedCredentials.filter(c => !c.satisfied && c.required);

    return {
      requiredCredentials: enrichedCredentials,
      satisfiedCredentials: enrichedSatisfied,
      missingCredentials: enrichedMissing,
      allDiscovered,
      errors,
      warnings,
    };
  }

  /**
   * Enrich discovered credentials with AI-generated guidance (simpleDescription,
   * technicalDescription, howToObtain). A single Gemini call covers all credentials.
   * Returns the original array unchanged on any error so the pipeline never blocks.
   */
  private async enrichWithAIGuidance(
    credentials: CredentialRequirement[],
  ): Promise<CredentialRequirement[]> {
    if (credentials.length === 0) return credentials;

    const credList = credentials
      .map((c, i) => `${i + 1}. displayName="${c.displayName}", type="${c.type}", nodeTypes=[${c.nodeTypes.join(', ')}]`)
      .join('\n');

    const systemPrompt =
      'You are a workflow automation credential expert. ' +
      'For each credential listed, generate three fields:\n' +
      '- simpleDescription: 1-sentence plain-English reason why the user needs this credential.\n' +
      '- technicalDescription: 1-2 sentences on how it is used technically (auth header, OAuth flow, etc.).\n' +
      '- howToObtain: 2-4 concise numbered steps the user must follow to get this credential from the service.\n' +
      'Return a JSON array in the same order as the input list. Each element: ' +
      '{ "simpleDescription": "...", "technicalDescription": "...", "howToObtain": "..." }. ' +
      'Return ONLY valid JSON — no markdown, no explanation.';

    const userMessage = `Credentials:\n${credList}`;

    const raw = await geminiOrchestrator.processRequest(
      'credential-guidance',
      { system: systemPrompt, message: userMessage },
      { model: 'gemini-2.5-flash', temperature: 0.2, cache: false },
    );

    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return credentials;

    let parsed: Array<{ simpleDescription?: string; technicalDescription?: string; howToObtain?: string }>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return credentials;
    }

    return credentials.map((c, i) => ({
      ...c,
      simpleDescription: parsed[i]?.simpleDescription || c.simpleDescription,
      technicalDescription: parsed[i]?.technicalDescription || c.technicalDescription,
      howToObtain: parsed[i]?.howToObtain || c.howToObtain,
    }));
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
    const registryDescriptor = unifiedNodeRegistry.getCredentialPreflightDescriptor(nodeType);

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
        // (shared rules with CredentialResolver — webhook, OAuth refs, api_key field)
        if (!satisfied) {
          const schema = nodeLibrary.getSchema(nodeType);
          satisfied = isCredentialSatisfiedByNodeConfig(node, {
            provider: contract.provider,
            type: contract.type,
            credentialFieldName: contract.credentialFieldName,
          });
          if (satisfied) {
            console.log(`[CredentialDiscovery] ✅ Credential satisfied from node config for ${nodeId} (${nodeType})`);
            // Validate the credentialId actually exists in DB — prevents ghost UUIDs from deleted connections
            if (userId) {
              const nodeConfig = (node.data?.config || {}) as Record<string, unknown>;
              const credentialId = String(nodeConfig.credentialId || nodeConfig.credentialRef || '').trim();
              if (credentialId) {
                const rows = await queryAsService(
                  `SELECT 1 FROM connections WHERE user_id = $1 AND id = $2 LIMIT 1`,
                  [userId, credentialId]
                );
                if (!rows.length) {
                  satisfied = false;
                  console.log(`[CredentialDiscovery] ❌ credentialId "${credentialId}" not found in DB — treating as missing`);
                }
              }
            }
          }
          // Fallback: SMTP and similar — multi-field or no credentialFieldName on connector
          if (!satisfied && schema && schema.configSchema) {
            const config = node.data?.config || {};
            const requiredFields = schema.configSchema.required || [];
            for (const field of requiredFields) {
              const fieldValue = config[field];
              if (fieldValue && typeof fieldValue === 'string' && 
                  fieldValue.trim() !== '' && 
                  !fieldValue.includes('{{ENV.') &&
                  !fieldValue.includes('{{$json')) {
                if (field.toLowerCase().includes('webhook') || field.toLowerCase().includes('url')) {
                  if (fieldValue.startsWith('http')) {
                    satisfied = true;
                    console.log(`[CredentialDiscovery] ✅ Credential field "${field}" found in node config for ${nodeId}`);
                    break;
                  }
                } else {
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
      // Registry is authoritative: if credential requirements are declared there,
      // do not fall back to legacy schema heuristics for this node.
      if (registryDescriptor?.requiresCheck === true) {
        return credentials;
      }
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
          // Exclude configuration fields like maxTokens and webhook URLs (those are config values)
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
                                   // webhook URLs are config values, not secrets — excluded
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

/** Aligns discovery output with `buildCredentialStatuses` / wizard filtering (uses vaultKey as credentialId). */
export function mapDiscoveryResultToCredentialStatusResolution(discovery: CredentialDiscoveryResult): {
  required?: Array<{ credentialId?: string; displayName?: string; nodeIds?: string[] }>;
  missing?: Array<{ credentialId?: string; displayName?: string; nodeIds?: string[] }>;
  satisfied?: Array<{ credentialId?: string; displayName?: string; nodeIds?: string[] }>;
} {
  const toRow = (c: CredentialRequirement) => ({
    credentialId: String(c.vaultKey || c.displayName || 'credential'),
    displayName: c.displayName,
    nodeIds: Array.isArray(c.nodeIds) ? c.nodeIds : [],
  });
  return {
    required: discovery.requiredCredentials.filter((c) => c.required).map(toRow),
    missing: (discovery.missingCredentials || []).map(toRow),
    satisfied: (discovery.satisfiedCredentials || []).map(toRow),
  };
}

/** Same shape as legacy `discoveredCredentials` entries from generate-workflow (Slack webhook field hint). */
export function mapDiscoveryMissingToWizardDiscoveredCredentials(discovery: CredentialDiscoveryResult): Array<{
  credentialId: string;
  displayName: string;
  provider: string;
  type: string;
  resolved: boolean;
  required: boolean;
  vaultKey: string;
  nodeIds: string[];
  primaryFieldName?: string;
}> {
  return (discovery.missingCredentials || [])
    .filter((c) => {
      const isGoogleOAuth =
        (String(c.provider || '').toLowerCase() === 'google' && c.type === 'oauth') ||
        (String(c.vaultKey || '').toLowerCase() === 'google' && c.type === 'oauth');
      return !isGoogleOAuth;
    })
    .map((c) => ({
      credentialId: c.vaultKey,
      displayName: c.displayName,
      provider: c.provider,
      type: c.type,
      resolved: false,
      required: c.required !== false,
      vaultKey: c.vaultKey,
      nodeIds: c.nodeIds || [],
      primaryFieldName:
        c.type === 'webhook' && String(c.provider || '').toLowerCase() === 'slack' ? 'webhookUrl' : undefined,
    }));
}

// Export singleton instance
export const credentialDiscoveryPhase = new CredentialDiscoveryPhase();
