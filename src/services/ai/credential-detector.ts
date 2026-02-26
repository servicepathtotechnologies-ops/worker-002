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
import { nodeLibrary } from '../nodes/node-library';

export interface RequiredCredential {
  provider: string;
  fields: string[];
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
    
    // Rule-based credential mapping
    const credentialMap: Record<string, { provider: string; fields: string[] }> = {
      // CRM platforms
      'hubspot': {
        provider: 'hubspot',
        fields: ['access_token', 'refresh_token'],
      },
      'zoho_crm': {
        provider: 'zoho_crm',
        fields: ['client_id', 'client_secret', 'refresh_token'],
      },
      'salesforce': {
        provider: 'salesforce',
        fields: ['access_token', 'instance_url'],
      },
      'pipedrive': {
        provider: 'pipedrive',
        fields: ['api_token'],
      },
      
      // Google services
      'google_sheets': {
        provider: 'google_sheets',
        fields: ['client_id', 'client_secret', 'refresh_token'],
      },
      'google_gmail': {
        provider: 'google_gmail',
        fields: ['client_id', 'client_secret', 'refresh_token'],
      },
      'google_calendar': {
        provider: 'google_calendar',
        fields: ['client_id', 'client_secret', 'refresh_token'],
      },
      
      // Communication platforms
      'slack_message': {
        provider: 'slack',
        fields: ['webhook_url'],
      },
      'discord': {
        provider: 'discord',
        fields: ['webhook_url'],
      },
      'telegram': {
        provider: 'telegram',
        fields: ['bot_token'],
      },
      
      // Other platforms
      'airtable': {
        provider: 'airtable',
        fields: ['api_key', 'base_id'],
      },
      'notion': {
        provider: 'notion',
        fields: ['api_key'],
      },
      'email': {
        provider: 'email',
        fields: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password'],
      },
    };

    const credentialInfo = credentialMap[nodeType];
    if (!credentialInfo) {
      return null; // Node doesn't require credentials
    }

    return {
      provider: credentialInfo.provider,
      fields: credentialInfo.fields,
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
