/**
 * Credential Retriever Utility
 * 
 * Helper functions for nodes to retrieve credentials from the vault during execution.
 * 
 * Features:
 * - Automatic decryption
 * - Access control validation
 * - Never logs secrets
 * - Supports workflow-specific and user-level credentials
 */

import { getCredentialVault, CredentialAccessContext } from '../../services/credential-vault';

/**
 * Retrieve credential for node execution
 * 
 * @param context - Access context (userId, workflowId, nodeId, nodeType)
 * @param key - Credential key (e.g., 'google_oauth_gmail', 'openai_api_key')
 * @returns Decrypted credential value or null if not found
 */
export async function retrieveCredential(
  context: CredentialAccessContext,
  key: string
): Promise<string | null> {
  try {
    const vault = getCredentialVault();
    const value = await vault.retrieve(context, key);
    return value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CredentialRetriever] Failed to retrieve credential ${key}:`, errorMessage);
    return null;
  }
}

/**
 * Retrieve credential with metadata
 * 
 * @param context - Access context
 * @param key - Credential key
 * @returns Credential value and metadata or null if not found
 */
export async function retrieveCredentialWithMetadata(
  context: CredentialAccessContext,
  key: string
): Promise<{ value: string; metadata?: any } | null> {
  try {
    const vault = getCredentialVault();
    const result = await vault.retrieveWithMetadata(context, key);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CredentialRetriever] Failed to retrieve credential ${key}:`, errorMessage);
    return null;
  }
}

/**
 * Check if credential exists
 * 
 * @param context - Access context
 * @param key - Credential key
 * @returns True if credential exists
 */
export async function credentialExists(
  context: CredentialAccessContext,
  key: string
): Promise<boolean> {
  try {
    const vault = getCredentialVault();
    const exists = await vault.exists(context, key);
    return exists;
  } catch (error) {
    console.error(`[CredentialRetriever] Failed to check credential ${key}:`, error);
    return false;
  }
}
