/**
 * Credential Extractor Utility
 * 
 * ✅ WORLD-CLASS: Extracts credentials from node input when viewing/editing nodes
 * This ensures credentials are properly connected and visible in node properties
 * 
 * Flow:
 * 1. User provides credentials via credential modal
 * 2. Credentials are attached via attach-credentials endpoint
 * 3. Credentials are injected into node config via injectCredentials()
 * 4. When user views/edits node, credentials are extracted from input
 * 5. Credentials are displayed in node properties
 * 6. Workflow can run immediately after credentials are provided
 */

import { WorkflowNode } from '../types/ai-types';
import { nodeLibrary } from '../../services/nodes/node-library';
import { unifiedNormalizeNodeType } from './unified-node-type-normalizer';

export interface ExtractedCredentials {
  credentials: Record<string, any>;
  missingCredentials: string[];
  allSatisfied: boolean;
}

/**
 * Extract credentials from node config and input
 * ✅ WORLD-CLASS: Comprehensive credential extraction for viewing/editing
 */
export function extractCredentialsFromNode(node: WorkflowNode): ExtractedCredentials {
  const nodeType = unifiedNormalizeNodeType(node);
  const config = node.data?.config || {};
  // Note: Inputs are stored in config, not a separate input property
  const nodeInput = (node.data as any)?.input || {};
  const credentials: Record<string, any> = {};
  const missingCredentials: string[] = [];

  // Get node schema to identify credential fields
  const schema = nodeLibrary.getSchema(nodeType);
  if (!schema || !schema.configSchema) {
    return {
      credentials: {},
      missingCredentials: [],
      allSatisfied: true, // No schema = no credentials needed
    };
  }

  const requiredFields = schema.configSchema.required || [];
  const optionalFields = Object.keys(schema.configSchema.optional || {});
  const allFields = [...requiredFields, ...optionalFields];

  // ✅ WORLD-CLASS: Identify credential fields from schema
  const credentialFields = allFields.filter(fieldName => {
    const fieldLower = fieldName.toLowerCase();
    return (
      fieldLower.includes('oauth') ||
      fieldLower.includes('client_id') ||
      fieldLower.includes('client_secret') ||
      fieldLower.includes('token') ||
      fieldLower.includes('secret') ||
      fieldLower.includes('password') ||
      fieldLower.includes('api_key') ||
      fieldLower.includes('api_key') ||
      fieldLower.includes('webhook_url') ||
      fieldLower.includes('webhookurl') ||
      fieldLower.includes('credentialid') ||
      fieldLower.includes('credential_id') ||
      fieldLower.includes('accesstoken') ||
      fieldLower.includes('access_token') ||
      fieldLower.includes('apikey') ||
      fieldLower.includes('api_token')
    );
  });

  // ✅ WORLD-CLASS: Extract credentials from config (attached via attach-credentials)
  for (const fieldName of credentialFields) {
    const configValue = config[fieldName];
    const inputValue = nodeInput[fieldName];
    
    // ✅ Config takes precedence (credentials attached via attach-credentials)
    const value = configValue !== undefined && configValue !== null && configValue !== '' 
      ? configValue 
      : inputValue !== undefined && inputValue !== null && inputValue !== '' 
        ? inputValue 
        : null;

    if (value) {
      credentials[fieldName] = value;
    } else if (requiredFields.includes(fieldName)) {
      // ✅ Track missing required credentials
      missingCredentials.push(fieldName);
    }
  }

  // ✅ WORLD-CLASS: Also check for credentials in generic input fields
  // This handles cases where credentials are provided via comprehensive questions
  for (const [key, value] of Object.entries(nodeInput)) {
    const keyLower = key.toLowerCase();
    if (
      (keyLower.includes('cred_') || keyLower.includes('req_')) &&
      (keyLower.includes('apikey') ||
       keyLower.includes('api_key') ||
       keyLower.includes('accesstoken') ||
       keyLower.includes('access_token') ||
       keyLower.includes('webhook') ||
       keyLower.includes('credentialid') ||
       keyLower.includes('credential_id'))
    ) {
      // Extract field name from key (e.g., "cred_nodeId_webhookUrl" -> "webhookUrl")
      const fieldNameMatch = key.match(/_(?:apikey|api_key|accesstoken|access_token|webhook|credentialid|credential_id)$/i);
      if (fieldNameMatch) {
        const fieldName = fieldNameMatch[0].substring(1); // Remove leading underscore
        if (!credentials[fieldName] && value) {
          credentials[fieldName] = value;
        }
      }
    }
  }

  return {
    credentials,
    missingCredentials,
    allSatisfied: missingCredentials.length === 0,
  };
}

/**
 * Validate credentials are properly connected to node
 * ✅ WORLD-CLASS: Ensures credentials are ready for execution
 */
export function validateCredentialsConnected(node: WorkflowNode): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const extracted = extractCredentialsFromNode(node);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (extracted.missingCredentials.length > 0) {
    errors.push(
      `Missing required credentials: ${extracted.missingCredentials.join(', ')}`
    );
  }

  // ✅ WORLD-CLASS: Validate credential values are not placeholders
  for (const [key, value] of Object.entries(extracted.credentials)) {
    if (typeof value === 'string') {
      const valueLower = value.toLowerCase().trim();
      if (
        valueLower === 'dammy' ||
        valueLower === 'dummy' ||
        valueLower === 'placeholder' ||
        valueLower === 'enter_here' ||
        valueLower.startsWith('{{') ||
        (valueLower.length < 3 && !valueLower.match(/^[a-z0-9]{1,2}$/i))
      ) {
        warnings.push(`Credential "${key}" appears to be a placeholder value`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
