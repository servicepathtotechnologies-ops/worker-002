// PHASE-2: Credential Preflight Check (STEP-4.5)
// Validates credentials BEFORE building workflow
// Prevents wasted builds

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { WorkflowNode } from '../../core/types/ai-types';

export interface CredentialCheck {
  nodeId: string;
  nodeType: string;
  credentialType: string;
  exists: boolean;
  valid: boolean;
  scopes: string[];
  requiredScopes: string[];
  missingScopes: string[];
  error?: string;
}

export interface PreflightResult {
  ready: boolean;
  checks: CredentialCheck[];
  missing: CredentialCheck[];
  invalid: CredentialCheck[];
  warnings: string[];
}

/**
 * Credential Preflight Check - PHASE-2 Feature #4
 *
 * STEP-4.5: Credential Readiness Check
 * Validates:
 * - Credential exists
 * - Permission scopes sufficient
 * - Stops early if invalid
 *
 * Credential policy is driven by unifiedNodeRegistry.getCredentialPreflightDescriptor().
 */
export class CredentialPreflightChecker {
  /**
   * Check credential readiness before building
   */
  async checkCredentials(
    nodes: WorkflowNode[],
    existingAuth: Record<string, any> = {}
  ): Promise<PreflightResult> {
    console.log('🔐 [CredentialPreflight] Checking credentials...');

    const checks: CredentialCheck[] = [];
    const missing: CredentialCheck[] = [];
    const invalid: CredentialCheck[] = [];
    const warnings: string[] = [];

    for (const node of nodes) {
      if (this.requiresCredentials(node.type)) {
        const check = await this.checkNodeCredentials(node, existingAuth);
        checks.push(check);

        if (!check.exists) {
          missing.push(check);
        } else if (!check.valid) {
          invalid.push(check);
        }

        if (check.exists && check.missingScopes.length > 0) {
          warnings.push(
            `Node ${node.data?.label || node.id} (${node.type}) is missing scopes: ${check.missingScopes.join(', ')}`
          );
        }
      }
    }

    const ready = missing.length === 0 && invalid.length === 0;

    if (!ready) {
      console.warn(`⚠️  [CredentialPreflight] Not ready: ${missing.length} missing, ${invalid.length} invalid`);
    } else {
      console.log('✅ [CredentialPreflight] All credentials ready');
    }

    return {
      ready,
      checks,
      missing,
      invalid,
      warnings,
    };
  }

  /**
   * Registry-driven: true when UnifiedNodeRegistry says this node participates in preflight.
   */
  requiresCredentials(nodeType: string): boolean {
    return unifiedNodeRegistry.getCredentialPreflightDescriptor(nodeType).requiresCheck;
  }

  /**
   * Check credentials for a single node
   */
  private async checkNodeCredentials(
    node: WorkflowNode,
    existingAuth: Record<string, any>
  ): Promise<CredentialCheck> {
    const nodeType = node.type;
    const desc = unifiedNodeRegistry.getCredentialPreflightDescriptor(nodeType);
    const credentialTypeLabel =
      desc.credentialType === 'OAuth' ? 'OAuth' : desc.credentialType === 'API_KEY' ? 'API_KEY' : 'API_KEY';
    const requiredScopes = desc.requiredScopes;

    const credential = this.findCredential(existingAuth, desc.lookupKeys);
    const exists = !!credential;

    let valid = false;
    let scopes: string[] = [];
    let missingScopes: string[] = [];
    let error: string | undefined;

    if (credential) {
      valid = this.validateCredentialFormat(credential, desc.credentialType);
      if (!valid) {
        error = 'Invalid credential format';
      } else {
        scopes = this.extractScopes(credential);
        missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));

        if (desc.credentialType === 'OAuth' && missingScopes.length > 0) {
          valid = true;
        } else if (missingScopes.length > 0) {
          valid = false;
          error = `Missing required scopes: ${missingScopes.join(', ')}`;
        }
      }
    }

    return {
      nodeId: node.id,
      nodeType,
      credentialType: credentialTypeLabel,
      exists,
      valid,
      scopes,
      requiredScopes,
      missingScopes,
      error,
    };
  }

  /**
   * Find credential in existing auth using registry-provided lookup keys (order preserved).
   */
  private findCredential(existingAuth: Record<string, any>, lookupKeys: string[]): any {
    for (const key of lookupKeys) {
      if (key && existingAuth[key]) {
        return existingAuth[key];
      }
    }
    return null;
  }

  /**
   * Validate credential format
   */
  private validateCredentialFormat(
    credential: any,
    credentialType: 'OAuth' | 'API_KEY' | 'UNKNOWN'
  ): boolean {
    if (credentialType === 'API_KEY' || credentialType === 'UNKNOWN') {
      if (typeof credential === 'string' && credential.length > 0) return true;
      return !!(
        credential &&
        typeof credential === 'object' &&
        (credential.apiKey || credential.key || credential.access_token || credential.token)
      );
    }

    if (credentialType === 'OAuth') {
      return !!(
        credential &&
        typeof credential === 'object' &&
        (credential.access_token || credential.token)
      );
    }

    return false;
  }

  /**
   * Extract scopes from credential
   */
  private extractScopes(credential: any): string[] {
    if (credential.scopes && Array.isArray(credential.scopes)) {
      return credential.scopes;
    }
    if (credential.scope && typeof credential.scope === 'string') {
      return credential.scope.split(' ');
    }
    return [];
  }
}

// Export singleton instance
export const credentialPreflightChecker = new CredentialPreflightChecker();
