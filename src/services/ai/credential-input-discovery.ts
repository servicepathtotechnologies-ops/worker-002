/**
 * Unified Credential & Sensitive Input Discovery Service
 * 
 * Combines credential discovery and node input discovery into a single unified structure
 * for the Configure step in the workflow wizard.
 */

import { Workflow } from '../../core/types/ai-types';
import { CredentialDiscoveryPhase, CredentialRequirement } from './credential-discovery-phase';
import { workflowLifecycleManager } from '../workflow-lifecycle-manager';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { isPlaceholderValue } from '../../core/utils/placeholder-filter';

export interface UnifiedMissingCredential {
  provider: string;
  type: 'oauth' | 'api_key' | 'webhook' | 'basic_auth' | 'token' | 'runtime';
  nodes: string[]; // node IDs that need this credential
  fields: string[]; // credential field names (e.g., ["accessToken", "refreshToken"])
  displayName: string;
  vaultKey: string;
  scopes?: string[];
  satisfied?: boolean;
}

export interface UnifiedMissingInput {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  fieldName: string;
  description: string;
  fieldType: string;
  required: boolean;
  examples?: any[];
  defaultValue?: any;
  ownership?: 'structural' | 'value' | 'credential';
  fillModeDefault?: 'manual_static' | 'runtime_ai' | 'buildtime_ai_once';
  supportsRuntimeAI?: boolean;
  supportsBuildtimeAI?: boolean;
}

export interface UnifiedMissingItems {
  credentials: UnifiedMissingCredential[];
  inputs: UnifiedMissingInput[];
}

/**
 * Get unified list of missing credentials and sensitive inputs for a workflow
 */
export async function getUnifiedMissingItems(
  workflowId: string,
  userId?: string
): Promise<UnifiedMissingItems> {
  console.log(`[UnifiedDiscovery] Starting unified discovery for workflow ${workflowId}`);

  // Load workflow from database
  const supabase = getSupabaseClient();
  const { data: workflowData, error: workflowError } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (workflowError || !workflowData) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Parse workflow structure
  const graphData = typeof workflowData.graph === 'string' 
    ? JSON.parse(workflowData.graph) 
    : workflowData.graph || {};
  
  const workflow: Workflow = {
    nodes: workflowData.nodes || graphData.nodes || [],
    edges: workflowData.edges || graphData.edges || [],
    metadata: {
      created_at: workflowData.created_at,
      updated_at: workflowData.updated_at,
      workflowId,
      name: workflowData.name || 'Untitled Workflow',
    },
  };

  console.log(`[UnifiedDiscovery] Loaded workflow with ${workflow.nodes.length} nodes`);

  // Discover credentials
  const credentialDiscoveryPhase = new CredentialDiscoveryPhase();
  const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(workflow, userId);

  // Convert credential requirements to unified format
  const missingCredentials = credentialDiscovery.missingCredentials || [];
  const unifiedCredentials: UnifiedMissingCredential[] = missingCredentials.map(cred => ({
    provider: cred.provider,
    type: cred.type,
    nodes: cred.nodeIds || [],
    fields: [], // Credential fields are provider-specific, not exposed as individual fields
    displayName: cred.displayName,
    vaultKey: cred.vaultKey,
    scopes: cred.scopes,
    satisfied: cred.satisfied,
  }));

  // Discover node inputs
  const nodeInputsDiscovery = workflowLifecycleManager.discoverNodeInputs(workflow);

  // Convert node inputs to unified format (ownership-driven value questions only)
  const unifiedInputs: UnifiedMissingInput[] = nodeInputsDiscovery.inputs
    .filter(input => {
      // ✅ ENHANCED: Double-check that the node's actual config value is not a placeholder
      // (discoverNodeInputs already filters, but this is an extra safety check)
      const node = workflow.nodes.find(n => n.id === input.nodeId);
      if (node) {
        const nodeConfig = node.data?.config || {};
        const actualValue = nodeConfig[input.fieldName];
        // If the field has a placeholder value, it should already be filtered by discoverNodeInputs,
        // but verify here as well
        if (actualValue !== undefined && actualValue !== null && actualValue !== '' && !isPlaceholderValue(actualValue)) {
          // Field has a non-placeholder value, but discoverNodeInputs marked it as missing
          // This shouldn't happen, but if it does, skip it
          console.log(`[UnifiedDiscovery] ⚠️ Input ${input.nodeId}.${input.fieldName} has non-placeholder value, skipping`);
          return false;
        }
      }
      
      return (input as any).ownership !== 'structural' && (input as any).ownership !== 'credential';
    })
    .map(input => ({
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      nodeLabel: input.nodeLabel,
      fieldName: input.fieldName,
      description: input.description,
      fieldType: input.fieldType,
      required: input.required,
      examples: input.examples,
      defaultValue: input.defaultValue,
      ownership: (input as any).ownership,
      fillModeDefault: (input as any).fillModeDefault,
      supportsRuntimeAI: (input as any).supportsRuntimeAI,
      supportsBuildtimeAI: (input as any).supportsBuildtimeAI,
    }));

  console.log(`[UnifiedDiscovery] Discovered ${unifiedCredentials.length} missing credential(s) and ${unifiedInputs.length} missing input(s)`);

  return {
    credentials: unifiedCredentials,
    inputs: unifiedInputs,
  };
}
