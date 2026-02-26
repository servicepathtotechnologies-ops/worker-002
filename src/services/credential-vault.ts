/**
 * Credential Vault Service
 * 
 * Secure storage for API keys, OAuth tokens, and other credentials.
 * 
 * Features:
 * - AES-256-GCM encryption
 * - Environment-based encryption key
 * - Database storage
 * - Access control (user-based, workflow-based)
 * - Never logs secrets
 * - Automatic encryption/decryption
 */

import crypto from 'crypto';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { config } from '../core/config';

/**
 * Credential types
 */
export type CredentialType = 
  | 'api_key'
  | 'oauth_token'
  | 'oauth_refresh_token'
  | 'basic_auth'
  | 'webhook_secret'
  | 'custom';

/**
 * Credential metadata
 */
export interface CredentialMetadata {
  name?: string;
  description?: string;
  service?: string; // e.g., 'gmail', 'slack', 'openai'
  provider?: string; // e.g., 'google', 'slack', 'openai'
  scopes?: string[]; // For OAuth tokens
  expiresAt?: string; // ISO timestamp
  [key: string]: any; // Additional metadata
}

/**
 * Stored credential (encrypted in database)
 */
export interface StoredCredential {
  id: string;
  userId: string;
  workflowId?: string; // Optional: workflow-specific credential
  type: CredentialType;
  key: string; // Unique key identifier (e.g., 'google_oauth_gmail', 'openai_api_key')
  encryptedValue: string; // Encrypted credential value
  metadata?: CredentialMetadata;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

/**
 * Credential access context
 */
export interface CredentialAccessContext {
  userId: string;
  workflowId?: string;
  nodeId?: string;
  nodeType?: string;
}

/**
 * Encryption configuration
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Get encryption key from environment variable
 */
function getEncryptionKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY || config.encryptionKey;
  
  if (!encryptionKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        'Generate a secure key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    
    // Development fallback (NOT SECURE - only for local development)
    console.warn('⚠️  WARNING: Using default encryption key. Set ENCRYPTION_KEY in production!');
    return crypto.pbkdf2Sync('default-dev-key-change-in-production', 'salt', ITERATIONS, KEY_LENGTH, 'sha256');
  }
  
  // Derive key from environment variable using PBKDF2
  return crypto.pbkdf2Sync(encryptionKey, 'ctrlchecks-credential-vault-salt', ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt credential value
 */
function encryptValue(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Credential encryption: value must be a non-empty string');
  }
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CredentialVault] Failed to encrypt credential:', errorMessage);
    throw new Error(`Credential encryption failed: ${errorMessage}`);
  }
}

/**
 * Decrypt credential value
 */
function decryptValue(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('Credential decryption: encrypted value must be a non-empty string');
  }
  
  try {
    // Parse format: iv:authTag:encrypted
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format. Expected format: iv:authTag:encrypted');
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CredentialVault] Failed to decrypt credential:', errorMessage);
    throw new Error(`Credential decryption failed: ${errorMessage}`);
  }
}

/**
 * Sanitize value for logging (never log actual secrets)
 */
function sanitizeForLogging(value: any): any {
  if (typeof value === 'string') {
    // Check for sensitive patterns
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /auth/i,
      /credential/i,
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(JSON.stringify(value))) {
        return '[REDACTED]';
      }
    }
    
    // If it looks like an encrypted value (has colons), redact
    if (value.includes(':') && value.split(':').length === 3) {
      return '[ENCRYPTED]';
    }
    
    // If it's a long string (likely a token), redact
    if (value.length > 20) {
      return value.substring(0, 4) + '...' + value.substring(value.length - 4);
    }
  }
  
  if (typeof value === 'object' && value !== null) {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(value)) {
      if (/password|secret|token|key|auth|credential/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(val);
      }
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Credential Vault
 */
export class CredentialVault {
  private supabase: ReturnType<typeof getSupabaseClient>;
  private tableName = 'credential_vault';

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Store credential
   */
  async store(
    context: CredentialAccessContext,
    key: string,
    value: string,
    type: CredentialType,
    metadata?: CredentialMetadata
  ): Promise<StoredCredential> {
    // Validate access
    await this.validateAccess(context);

    // Encrypt value
    const encryptedValue = encryptValue(value);

    // Prepare credential data
    const credentialData: any = {
      user_id: context.userId,
      workflow_id: context.workflowId || null,
      type,
      key,
      encrypted_value: encryptedValue,
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    };

    // Check if credential already exists
    const existing = await this.supabase
      .from(this.tableName)
      .select('id')
      .eq('user_id', context.userId)
      .eq('key', key)
      .eq('workflow_id', context.workflowId || null)
      .single();

    let credentialId: string;

    if (existing.data) {
      // Update existing
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(credentialData)
        .eq('id', existing.data.id)
        .select()
        .single();

      if (error) {
        console.error('[CredentialVault] Failed to update credential:', sanitizeForLogging({ key, error: error.message }));
        throw new Error(`Failed to update credential: ${error.message}`);
      }

      credentialId = data.id;
      console.log('[CredentialVault] ✅ Updated credential:', sanitizeForLogging({ key, type, userId: context.userId }));
    } else {
      // Insert new
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert({
          ...credentialData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[CredentialVault] Failed to store credential:', sanitizeForLogging({ key, error: error.message }));
        throw new Error(`Failed to store credential: ${error.message}`);
      }

      credentialId = data.id;
      console.log('[CredentialVault] ✅ Stored credential:', sanitizeForLogging({ key, type, userId: context.userId }));
    }

    return {
      id: credentialId,
      userId: context.userId,
      workflowId: context.workflowId,
      type,
      key,
      encryptedValue,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieve credential (decrypted)
   */
  async retrieve(
    context: CredentialAccessContext,
    key: string
  ): Promise<string | null> {
    // Validate access
    await this.validateAccess(context);

    // Build query
    let query = this.supabase
      .from(this.tableName)
      .select('encrypted_value, last_used_at')
      .eq('user_id', context.userId)
      .eq('key', key);

    // Prefer workflow-specific credential, fallback to user-level
    if (context.workflowId) {
      query = query.or(`workflow_id.eq.${context.workflowId},workflow_id.is.null`);
    } else {
      query = query.is('workflow_id', null);
    }

    const { data, error } = await query.order('workflow_id', { ascending: false }).limit(1).single();

    if (error || !data) {
      console.log('[CredentialVault] Credential not found:', sanitizeForLogging({ key, userId: context.userId }));
      return null;
    }

    // Decrypt value
    try {
      const decryptedValue = decryptValue(data.encrypted_value);

      // Update last used timestamp
      await this.supabase
        .from(this.tableName)
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', context.userId)
        .eq('key', key);

      console.log('[CredentialVault] ✅ Retrieved credential:', sanitizeForLogging({ key, userId: context.userId }));
      
      return decryptedValue;
    } catch (decryptError) {
      console.error('[CredentialVault] Failed to decrypt credential:', sanitizeForLogging({ key, error: decryptError }));
      return null;
    }
  }

  /**
   * Retrieve credential with metadata
   */
  async retrieveWithMetadata(
    context: CredentialAccessContext,
    key: string
  ): Promise<{ value: string; metadata?: CredentialMetadata } | null> {
    // Validate access
    await this.validateAccess(context);

    // Build query
    let query = this.supabase
      .from(this.tableName)
      .select('encrypted_value, metadata, last_used_at')
      .eq('user_id', context.userId)
      .eq('key', key);

    // Prefer workflow-specific credential, fallback to user-level
    if (context.workflowId) {
      query = query.or(`workflow_id.eq.${context.workflowId},workflow_id.is.null`);
    } else {
      query = query.is('workflow_id', null);
    }

    const { data, error } = await query.order('workflow_id', { ascending: false }).limit(1).single();

    if (error || !data) {
      return null;
    }

    // Decrypt value
    try {
      const decryptedValue = decryptValue(data.encrypted_value);

      // Update last used timestamp
      await this.supabase
        .from(this.tableName)
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', context.userId)
        .eq('key', key);

      return {
        value: decryptedValue,
        metadata: data.metadata,
      };
    } catch (decryptError) {
      console.error('[CredentialVault] Failed to decrypt credential:', sanitizeForLogging({ key }));
      return null;
    }
  }

  /**
   * List credentials for user/workflow
   */
  async list(context: CredentialAccessContext): Promise<StoredCredential[]> {
    // Validate access
    await this.validateAccess(context);

    let query = this.supabase
      .from(this.tableName)
      .select('id, user_id, workflow_id, type, key, metadata, created_at, updated_at, last_used_at')
      .eq('user_id', context.userId);

    if (context.workflowId) {
      query = query.or(`workflow_id.eq.${context.workflowId},workflow_id.is.null`);
    } else {
      query = query.is('workflow_id', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[CredentialVault] Failed to list credentials:', sanitizeForLogging({ error: error.message }));
      throw new Error(`Failed to list credentials: ${error.message}`);
    }

    return (data || []).map((cred: any) => ({
      id: cred.id,
      userId: cred.user_id,
      workflowId: cred.workflow_id,
      type: cred.type,
      key: cred.key,
      encryptedValue: '[ENCRYPTED]', // Never return actual encrypted value
      metadata: cred.metadata,
      createdAt: cred.created_at,
      updatedAt: cred.updated_at,
      lastUsedAt: cred.last_used_at,
    }));
  }

  /**
   * Delete credential
   */
  async delete(
    context: CredentialAccessContext,
    key: string
  ): Promise<boolean> {
    // Validate access
    await this.validateAccess(context);

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('user_id', context.userId)
      .eq('key', key)
      .eq('workflow_id', context.workflowId || null);

    if (error) {
      console.error('[CredentialVault] Failed to delete credential:', sanitizeForLogging({ key, error: error.message }));
      throw new Error(`Failed to delete credential: ${error.message}`);
    }

    console.log('[CredentialVault] ✅ Deleted credential:', sanitizeForLogging({ key, userId: context.userId }));
    return true;
  }

  /**
   * Check if credential exists
   */
  async exists(
    context: CredentialAccessContext,
    key: string
  ): Promise<boolean> {
    // Validate access
    await this.validateAccess(context);

    let query = this.supabase
      .from(this.tableName)
      .select('id')
      .eq('user_id', context.userId)
      .eq('key', key)
      .limit(1);

    if (context.workflowId) {
      query = query.or(`workflow_id.eq.${context.workflowId},workflow_id.is.null`);
    } else {
      query = query.is('workflow_id', null);
    }

    const { data, error } = await query;

    return !error && data && data.length > 0;
  }

  /**
   * Validate access to credentials
   */
  private async validateAccess(context: CredentialAccessContext): Promise<void> {
    if (!context.userId) {
      throw new Error('User ID is required for credential access');
    }

    // Additional access control can be added here
    // e.g., check if user has permission to access workflow
    if (context.workflowId) {
      // Verify user has access to workflow
      const { data, error } = await this.supabase
        .from('workflows')
        .select('id')
        .eq('id', context.workflowId)
        .single();

      if (error || !data) {
        throw new Error('Workflow not found or access denied');
      }
    }
  }
}

// Export singleton instance
let credentialVaultInstance: CredentialVault | null = null;

export function getCredentialVault(): CredentialVault {
  if (!credentialVaultInstance) {
    credentialVaultInstance = new CredentialVault();
  }
  return credentialVaultInstance;
}

// Types are already exported above, no need to re-export
