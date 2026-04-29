/**
 * Credential Detector
 * 
 * Rule-based credential detection from workflow structure.
 * This is STEP 3 of the pipeline: Detect Required Credentials
 * 
 * Rules:
 * - Must be rule-based (not AI-based)
 * - Scan all action nodes
 * - Extract required connectors
 */

import { WorkflowStructure } from './workflow-structure-builder';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface RequiredCredential {
  provider: string;
  fields: string[];
  vaultKey?: string;
  node_id?: string;
  node_type?: string;
}

export interface CredentialDetectionResult {
  required_credentials: RequiredCredential[];
  missing_credentials: RequiredCredential[];
  satisfied_credentials: RequiredCredential[];
}

export class CredentialDetector {
  /**
   * Detect required credentials from workflow structure
   */
  detectCredentials(structure: WorkflowStructure, existingCredentials?: Record<string, any>): CredentialDetectionResult {
    console.log(`[CredentialDetector] Detecting credentials for workflow structure`);

    const requiredCredentials: RequiredCredential[] = [];
    const satisfiedCredentials: RequiredCredential[] = [];
    const missingCredentials: RequiredCredential[] = [];

    // Scan all nodes for required credentials
    structure.nodes.forEach(node => {
      const credential = this.detectNodeCredentials(node);
      if (credential) {
        requiredCredentials.push(credential);

        // Check if credential is satisfied
        const isSatisfied = existingCredentials && 
                           existingCredentials[credential.provider] &&
                           this.validateCredentialFields(credential, existingCredentials[credential.provider]);

        if (isSatisfied) {
          satisfiedCredentials.push(credential);
        } else {
          missingCredentials.push(credential);
        }
      }
    });

    // Also check trigger for credentials (e.g., webhook might need API key)
    const triggerCredential = this.detectTriggerCredentials(structure.trigger, structure.trigger_config);
    if (triggerCredential) {
      requiredCredentials.push(triggerCredential);
      
      const isSatisfied = existingCredentials && 
                         existingCredentials[triggerCredential.provider] &&
                         this.validateCredentialFields(triggerCredential, existingCredentials[triggerCredential.provider]);

      if (isSatisfied) {
        satisfiedCredentials.push(triggerCredential);
      } else {
        missingCredentials.push(triggerCredential);
      }
    }

    return {
      required_credentials: requiredCredentials,
      missing_credentials: missingCredentials,
      satisfied_credentials: satisfiedCredentials,
    };
  }

  /**
   * Detect credentials required by a node
   */
  private detectNodeCredentials(node: WorkflowStructure['nodes'][0]): RequiredCredential | null {
    const nodeType = node.type;
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const credSchema = nodeDef?.credentialSchema;

    // No credential schema or no requirements → node doesn't need credentials
    if (!credSchema || !credSchema.requirements || credSchema.requirements.length === 0) {
      return null;
    }

    const req = credSchema.requirements[0];
    const fields: string[] = credSchema.credentialFields && credSchema.credentialFields.length > 0
      ? credSchema.credentialFields
      : [];

    if (fields.length === 0) return null;

    return {
      provider: req.provider,
      vaultKey: (req as any).vaultKey || req.provider,
      fields,
      node_id: node.id,
      node_type: nodeType,
    };
  }

  /**
   * Detect credentials required by trigger
   */
  private detectTriggerCredentials(trigger: string, triggerConfig?: Record<string, any>): RequiredCredential | null {
    // Most triggers don't need credentials, but webhook might need API key
    if (trigger === 'webhook' && triggerConfig?.requires_auth) {
      return {
        provider: 'webhook',
        vaultKey: 'webhook',
        fields: ['api_key'],
      };
    }

    return null;
  }

  /**
   * Validate credential fields are present
   */
  private validateCredentialFields(credential: RequiredCredential, credentialData: any): boolean {
    return credential.fields.every(field => {
      // Check if field exists and is not empty
      const value = credentialData[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * Get credential field descriptions for UI
   */
  getCredentialFieldDescriptions(provider: string): Record<string, string> {
    const descriptions: Record<string, Record<string, string>> = {
      'hubspot': {
        'access_token': 'HubSpot access token',
        'refresh_token': 'HubSpot refresh token',
      },
      'zoho_crm': {
        'client_id': 'Zoho CRM client ID',
        'client_secret': 'Zoho CRM client secret',
        'refresh_token': 'Zoho CRM refresh token',
      },
      'google_sheets': {
        'client_id': 'Google OAuth client ID',
        'client_secret': 'Google OAuth client secret',
        'refresh_token': 'Google OAuth refresh token',
      },
      'slack': {
        'webhook_url': 'Slack webhook URL',
      },
      'discord': {
        'webhook_url': 'Discord webhook URL',
      },
    };

    return descriptions[provider] || {};
  }
}

export const credentialDetector = new CredentialDetector();
