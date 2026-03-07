/**
 * Runtime Context Builder
 * 
 * ✅ CRITICAL: Builds clean runtime context for node execution
 * 
 * Keeps nodes pure by providing all necessary context:
 * - inputs
 * - credentials
 * - secrets
 * - env
 * - runId
 */

import { WorkflowNode } from '../types/ai-types';

export interface NodeRuntimeContext {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, any>;
  credentials: Record<string, any>;
  secrets: Record<string, any>;
  env: Record<string, string>;
  runId: string;
  workflowId: string;
  userId?: string;
  executionId: string;
  metadata: {
    nodeLabel?: string;
    nodeCategory?: string;
    timestamp: string;
  };
}

export interface BuildContextOptions {
  node: WorkflowNode;
  nodeInputs: Record<string, any>;
  nodeCredentials: Record<string, any>;
  secrets?: Record<string, any>;
  env?: Record<string, string>;
  runId: string;
  workflowId: string;
  executionId: string;
  userId?: string;
}

/**
 * Build runtime context for a node
 * 
 * Separates inputs, credentials, and secrets cleanly
 */
export function buildNodeRuntimeContext(options: BuildContextOptions): NodeRuntimeContext {
  const {
    node,
    nodeInputs,
    nodeCredentials,
    secrets = {},
    env = {},
    runId,
    workflowId,
    executionId,
    userId,
  } = options;

  const nodeType = node.type || node.data?.type || 'custom';
  const nodeLabel = node.data?.label || nodeType;
  const nodeCategory = node.data?.category || 'general';

  return {
    nodeId: node.id,
    nodeType,
    inputs: { ...nodeInputs }, // Copy to avoid mutations
    credentials: { ...nodeCredentials }, // Copy to avoid mutations
    secrets: { ...secrets }, // Copy to avoid mutations
    env: { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([_, v]) => v !== undefined)) as Record<string, string> }, // Merge with process env (filter undefined)
    runId,
    workflowId,
    userId,
    executionId,
    metadata: {
      nodeLabel,
      nodeCategory,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Extract node inputs from workflow node config
 */
export function extractNodeInputs(node: WorkflowNode): Record<string, any> {
  const config = node.data?.config || {};
  const inputs: Record<string, any> = {};

  // Extract non-credential fields as inputs
  for (const [key, value] of Object.entries(config)) {
    // Skip credential fields
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('oauth') ||
      keyLower.includes('client_id') ||
      keyLower.includes('client_secret') ||
      keyLower.includes('token') ||
      keyLower.includes('secret') ||
      keyLower.includes('password') ||
      keyLower.includes('api_key')
    ) {
      continue; // Skip credentials
    }
    inputs[key] = value;
  }

  return inputs;
}

/**
 * Extract node credentials from workflow node config
 * ✅ WORLD-CLASS: Also extracts credentials from node input when viewing/editing
 * This ensures credentials are properly connected and visible in node properties
 */
export function extractNodeCredentials(node: WorkflowNode): Record<string, any> {
  const config = node.data?.config || {};
  const credentials: Record<string, any> = {};

  // ✅ WORLD-CLASS: Extract credential fields from config
  // This includes credentials attached via attach-credentials endpoint
  for (const [key, value] of Object.entries(config)) {
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('oauth') ||
      keyLower.includes('client_id') ||
      keyLower.includes('client_secret') ||
      keyLower.includes('token') ||
      keyLower.includes('secret') ||
      keyLower.includes('password') ||
      keyLower.includes('api_key') ||
      keyLower.includes('api_key') ||
      keyLower.includes('webhook_url') ||
      keyLower.includes('webhookurl') ||
      keyLower.includes('credentialid') ||
      keyLower.includes('credential_id') ||
      keyLower.includes('accesstoken') ||
      keyLower.includes('access_token') ||
      keyLower.includes('apikey') ||
      keyLower.includes('api_token')
    ) {
      credentials[key] = value;
    }
  }

  // ✅ WORLD-CLASS: Also extract credentials from node input (for viewing/editing)
  // This handles cases where credentials are provided via comprehensive questions
  // Note: Inputs are stored in config, not a separate input property
  const nodeInput = (node.data as any)?.input || {};
  for (const [key, value] of Object.entries(nodeInput)) {
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('oauth') ||
      keyLower.includes('client_id') ||
      keyLower.includes('client_secret') ||
      keyLower.includes('token') ||
      keyLower.includes('secret') ||
      keyLower.includes('password') ||
      keyLower.includes('api_key') ||
      keyLower.includes('api_key') ||
      keyLower.includes('webhook_url') ||
      keyLower.includes('webhookurl') ||
      keyLower.includes('credentialid') ||
      keyLower.includes('credential_id') ||
      keyLower.includes('accesstoken') ||
      keyLower.includes('access_token') ||
      keyLower.includes('apikey') ||
      keyLower.includes('api_token')
    ) {
      // ✅ Only add if not already in config (config takes precedence)
      if (!credentials[key]) {
        credentials[key] = value;
      }
    }
  }

  return credentials;
}
