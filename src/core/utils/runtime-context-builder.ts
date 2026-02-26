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
 */
export function extractNodeCredentials(node: WorkflowNode): Record<string, any> {
  const config = node.data?.config || {};
  const credentials: Record<string, any> = {};

  // Extract credential fields
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
      keyLower.includes('webhook_url')
    ) {
      credentials[key] = value;
    }
  }

  return credentials;
}
