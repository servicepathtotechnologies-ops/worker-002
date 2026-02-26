// PHASE-2: Credential Preflight Check (STEP-4.5)
// Validates credentials BEFORE building workflow
// Prevents wasted builds

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

    // Check each node that requires credentials
    for (const node of nodes) {
      if (this.requiresCredentials(node.type)) {
        const check = await this.checkNodeCredentials(node, existingAuth);
        checks.push(check);

        if (!check.exists) {
          missing.push(check);
        } else if (!check.valid) {
          invalid.push(check);
        }

        // Check scope compatibility
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
   * Check credentials for a single node
   */
  private async checkNodeCredentials(
    node: WorkflowNode,
    existingAuth: Record<string, any>
  ): Promise<CredentialCheck> {
    const nodeType = node.type;
    const credentialType = this.getCredentialType(nodeType);
    const requiredScopes = this.getRequiredScopes(nodeType);

    // Check if credential exists
    const credential = this.findCredential(nodeType, existingAuth);
    const exists = !!credential;

    // Check if credential is valid
    let valid = false;
    let scopes: string[] = [];
    let missingScopes: string[] = [];
    let error: string | undefined;

    if (credential) {
      // Validate credential format
      valid = this.validateCredentialFormat(credential, credentialType);
      
      if (!valid) {
        error = 'Invalid credential format';
      } else {
        // Check scopes
        scopes = this.extractScopes(credential);
        missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
        
        // If OAuth, missing scopes might be acceptable (user can grant)
        if (credentialType === 'OAuth' && missingScopes.length > 0) {
          valid = true; // OAuth can be granted later
        } else if (missingScopes.length > 0) {
          valid = false;
          error = `Missing required scopes: ${missingScopes.join(', ')}`;
        }
      }
    }

    return {
      nodeId: node.id,
      nodeType,
      credentialType,
      exists,
      valid,
      scopes,
      requiredScopes,
      missingScopes,
      error,
    };
  }

  /**
   * Check if node type requires credentials
   */
  private requiresCredentials(nodeType: string): boolean {
    return [
      'http_request',
      'http_post',
      'slack_message',
      'email',
      'google_sheets',
      'google_drive',
      'google_gmail',
      'database_write',
      'database_read',
      'openai_gpt',
      'anthropic_claude',
      'google_gemini',
      'linkedin',
      'twitter',
      'discord',
    ].includes(nodeType);
  }

  /**
   * Get credential type for node
   */
  private getCredentialType(nodeType: string): string {
    const oauthNodes = ['google_sheets', 'google_drive', 'google_gmail', 'linkedin'];
    if (oauthNodes.includes(nodeType)) {
      return 'OAuth';
    }
    return 'API_KEY';
  }

  /**
   * Get required scopes for node
   */
  private getRequiredScopes(nodeType: string): string[] {
    const scopeMap: Record<string, string[]> = {
      google_sheets: ['https://www.googleapis.com/auth/spreadsheets'],
      google_drive: ['https://www.googleapis.com/auth/drive'],
      google_gmail: ['https://www.googleapis.com/auth/gmail.send'],
      linkedin: ['r_liteprofile', 'r_emailaddress'],
    };

    return scopeMap[nodeType] || [];
  }

  /**
   * Find credential in existing auth
   */
  private findCredential(nodeType: string, existingAuth: Record<string, any>): any {
    // Check for direct match
    if (existingAuth[nodeType]) {
      return existingAuth[nodeType];
    }

    // Check for service-based match
    const serviceMap: Record<string, string[]> = {
      google_sheets: ['google', 'google_sheets'],
      google_drive: ['google', 'google_drive'],
      google_gmail: ['google', 'gmail'],
      slack_message: ['slack'],
      openai_gpt: ['openai'],
      anthropic_claude: ['anthropic'],
      google_gemini: ['gemini', 'google'],
    };

    const services = serviceMap[nodeType] || [];
    for (const service of services) {
      if (existingAuth[service]) {
        return existingAuth[service];
      }
    }

    return null;
  }

  /**
   * Validate credential format
   */
  private validateCredentialFormat(credential: any, type: string): boolean {
    if (type === 'API_KEY') {
      return typeof credential === 'string' && credential.length > 0;
    }

    if (type === 'OAuth') {
      return (
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
