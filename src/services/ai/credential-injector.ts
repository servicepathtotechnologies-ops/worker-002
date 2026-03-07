/**
 * Credential Injector
 * 
 * Injects credentials into workflow nodes after user provides them.
 * This is STEP 4 of the pipeline: Inject Credentials into Workflow
 * 
 * Rules:
 * - After user provides credentials
 * - Inject credentials into node config
 * - Validate required fields exist
 * - Never allow workflow execution without credentials attached
 */

import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { RequiredCredential } from './credential-detector';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';

export interface CredentialInjectionResult {
  success: boolean;
  workflow: Workflow;
  errors: string[];
  warnings: string[];
}

export class CredentialInjector {
  /**
   * Inject credentials into workflow
   */
  injectCredentials(
    workflow: Workflow,
    credentials: Record<string, Record<string, any>>,
    requiredCredentials: RequiredCredential[]
  ): CredentialInjectionResult {
    console.log(`[CredentialInjector] Injecting credentials into workflow`);

    const errors: string[] = [];
    const warnings: string[] = [];
    const updatedNodes: WorkflowNode[] = [];

    // Create a map of provider to credential data
    const credentialMap = new Map<string, Record<string, any>>();
    Object.entries(credentials).forEach(([provider, data]) => {
      credentialMap.set(provider, data);
    });

    // Inject credentials into each node
    workflow.nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const requiredCredential = requiredCredentials.find(rc => rc.node_id === node.id || rc.node_type === nodeType);

      if (requiredCredential) {
        const credentialData = credentialMap.get(requiredCredential.provider);
        
        if (!credentialData) {
          errors.push(`Missing credentials for ${requiredCredential.provider} (node: ${node.id})`);
          updatedNodes.push(node); // Keep node without credentials (will fail validation)
          return;
        }

        // Validate all required fields are present
        const missingFields = requiredCredential.fields.filter(
          field => !credentialData[field] || credentialData[field] === ''
        );

        if (missingFields.length > 0) {
          errors.push(
            `Missing credential fields for ${requiredCredential.provider} (node: ${node.id}): ${missingFields.join(', ')}`
          );
          updatedNodes.push(node);
          return;
        }

        // Inject credential ID into node config
        const updatedNode = this.injectCredentialIntoNode(node, requiredCredential.provider, credentialData);
        updatedNodes.push(updatedNode);
        
        console.log(`[CredentialInjector] ✅ Injected credentials for ${requiredCredential.provider} into node ${node.id}`);
      } else {
        // Node doesn't require credentials
        updatedNodes.push(node);
      }
    });

    // Validate all required credentials are injected
    const missingCredentials = requiredCredentials.filter(rc => {
      const credentialData = credentialMap.get(rc.provider);
      return !credentialData || !this.validateCredentialFields(rc, credentialData);
    });

    if (missingCredentials.length > 0) {
      errors.push(
        `Missing credentials for: ${missingCredentials.map(rc => rc.provider).join(', ')}`
      );
    }

    const result: CredentialInjectionResult = {
      success: errors.length === 0,
      workflow: {
        ...workflow,
        nodes: updatedNodes,
      },
      errors,
      warnings,
    };

    if (errors.length > 0) {
      console.error(`[CredentialInjector] ❌ Credential injection failed:`, errors);
    } else {
      console.log(`[CredentialInjector] ✅ All credentials injected successfully`);
    }

    return result;
  }

  /**
   * Inject credential into node config
   */
  private injectCredentialIntoNode(
    node: WorkflowNode,
    provider: string,
    credentialData: Record<string, any>
  ): WorkflowNode {
    // Get node schema to determine credential field name
    const nodeType = unifiedNormalizeNodeType(node);
    const schema = nodeLibrary.getSchema(nodeType);

    // Determine credential field name (usually 'credentialId' or provider-specific)
    const credentialField = this.getCredentialFieldName(nodeType, provider);

    // Update node config
    const updatedConfig = {
      ...(node.data?.config || {}),
      [credentialField]: credentialData, // Store credential data in config
      credentialId: provider, // Also store provider name for reference
    };

    return {
      ...node,
      data: {
        ...node.data,
        config: updatedConfig,
      },
    };
  }

  /**
   * Get credential field name for node type
   */
  private getCredentialFieldName(nodeType: string, provider: string): string {
    // Most nodes use 'credentialId', but some have provider-specific fields
    const fieldMap: Record<string, string> = {
      'slack_message': 'webhook_url',
      'discord': 'webhook_url',
      'telegram': 'bot_token',
    };

    return fieldMap[nodeType] || 'credentialId';
  }

  /**
   * Validate credential fields are present
   */
  private validateCredentialFields(credential: RequiredCredential, credentialData: Record<string, any>): boolean {
    return credential.fields.every(field => {
      const value = credentialData[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * Check if workflow has all required credentials
   */
  hasAllCredentials(workflow: Workflow, requiredCredentials: RequiredCredential[]): boolean {
    const nodeCredentialMap = new Map<string, boolean>();

    workflow.nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const requiredCredential = requiredCredentials.find(rc => rc.node_id === node.id || rc.node_type === nodeType);

      if (requiredCredential) {
        const hasCredential = this.nodeHasCredential(node, requiredCredential.provider);
        nodeCredentialMap.set(node.id, hasCredential);
      } else {
        nodeCredentialMap.set(node.id, true); // Node doesn't need credentials
      }
    });

    return Array.from(nodeCredentialMap.values()).every(hasCredential => hasCredential);
  }

  /**
   * Check if node has credential injected
   */
  private nodeHasCredential(node: WorkflowNode, provider: string): boolean {
    const config = node.data?.config || {};
    return !!(config.credentialId || config[this.getCredentialFieldName(unifiedNormalizeNodeType(node), provider)]);
  }
}

export const credentialInjector = new CredentialInjector();
