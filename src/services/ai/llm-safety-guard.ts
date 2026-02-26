/**
 * LLM Safety Guard
 * 
 * Validates and repairs workflows before compilation to prevent:
 * - Unknown node types
 * - Unregistered providers
 * - Invalid schemas
 * - Security vulnerabilities
 * 
 * Features:
 * 1. Node allowlist validation
 * 2. Provider verification
 * 3. Schema validation
 * 4. Reject unknown node types
 * 5. Reject unregistered providers
 * 6. Auto-repair invalid output
 * 
 * Integrated before workflow compilation.
 */

import { StructuredIntent } from './intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary, NodeSchema } from '../nodes/node-library';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { randomUUID } from 'crypto';

/**
 * Registered providers allowlist
 */
const REGISTERED_PROVIDERS = new Set([
  'google',
  'slack',
  'microsoft',
  'smtp',
  'telegram',
  'salesforce',
  'youtube',
  'hubspot',
  'airtable',
  'ollama',
  'openai',
  'anthropic',
  'claude',
  'gemini',
  'notion',
  'github',
  'linkedin',
  'pipedrive',
  'zoho',
  'clickup',
]);

/**
 * Safety validation result
 */
export interface SafetyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  repaired: boolean;
  repairedWorkflow?: Workflow;
  details: {
    unknownNodes: Array<{ nodeId: string; nodeType: string }>;
    unregisteredProviders: Array<{ nodeId: string; nodeType: string; provider: string }>;
    schemaErrors: Array<{ nodeId: string; nodeType: string; errors: string[] }>;
    removedNodes: string[];
    fixedNodes: string[];
  };
}

/**
 * LLM Safety Guard
 * Validates and repairs workflows before compilation
 */
export class LLMSafetyGuard {
  /**
   * Validate and repair workflow before compilation
   * 
   * @param workflow - Workflow to validate
   * @param intent - Structured intent (for context)
   * @returns Safety validation result with repaired workflow if needed
   */
  validateAndRepair(
    workflow: Workflow,
    intent?: StructuredIntent
  ): SafetyValidationResult {
    console.log('[LLMSafetyGuard] Starting safety validation...');
    console.log(`[LLMSafetyGuard] Workflow: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    const errors: string[] = [];
    const warnings: string[] = [];
    const details: SafetyValidationResult['details'] = {
      unknownNodes: [],
      unregisteredProviders: [],
      schemaErrors: [],
      removedNodes: [],
      fixedNodes: [],
    };

    let repaired = false;
    let repairedWorkflow: Workflow | undefined = undefined;

    // STEP 1: Node allowlist validation
    console.log('[LLMSafetyGuard] STEP 1: Validating node allowlist...');
    const nodeValidation = this.validateNodeAllowlist(workflow.nodes);
    details.unknownNodes = nodeValidation.unknownNodes;
    
    if (nodeValidation.unknownNodes.length > 0) {
      errors.push(`Unknown node types found: ${nodeValidation.unknownNodes.map(n => n.nodeType).join(', ')}`);
      console.error(`[LLMSafetyGuard] ❌ Found ${nodeValidation.unknownNodes.length} unknown node type(s)`);
    } else {
      console.log('[LLMSafetyGuard] ✅ All nodes are in allowlist');
    }

    // STEP 2: Provider verification
    console.log('[LLMSafetyGuard] STEP 2: Verifying providers...');
    const providerValidation = this.validateProviders(workflow.nodes);
    details.unregisteredProviders = providerValidation.unregisteredProviders;
    
    if (providerValidation.unregisteredProviders.length > 0) {
      errors.push(`Unregistered providers found: ${providerValidation.unregisteredProviders.map(p => `${p.provider} (in ${p.nodeType})`).join(', ')}`);
      console.error(`[LLMSafetyGuard] ❌ Found ${providerValidation.unregisteredProviders.length} unregistered provider(s)`);
    } else {
      console.log('[LLMSafetyGuard] ✅ All providers are registered');
    }

    // STEP 3: Schema validation
    console.log('[LLMSafetyGuard] STEP 3: Validating node schemas...');
    const schemaValidation = this.validateSchemas(workflow.nodes);
    details.schemaErrors = schemaValidation.schemaErrors;
    
    if (schemaValidation.schemaErrors.length > 0) {
      warnings.push(`Schema validation errors: ${schemaValidation.schemaErrors.length} node(s) have schema issues`);
      console.warn(`[LLMSafetyGuard] ⚠️  Found ${schemaValidation.schemaErrors.length} node(s) with schema errors`);
    } else {
      console.log('[LLMSafetyGuard] ✅ All node schemas are valid');
    }

    // STEP 4: Auto-repair if needed
    if (nodeValidation.unknownNodes.length > 0 || providerValidation.unregisteredProviders.length > 0) {
      console.log('[LLMSafetyGuard] STEP 4: Auto-repairing invalid nodes...');
      const repairResult = this.autoRepair(workflow, nodeValidation, providerValidation, schemaValidation);
      
      if (repairResult.repaired) {
        repaired = true;
        repairedWorkflow = repairResult.workflow;
        details.removedNodes = repairResult.removedNodeIds;
        details.fixedNodes = repairResult.fixedNodeIds;
        console.log(`[LLMSafetyGuard] ✅ Auto-repaired: removed ${repairResult.removedNodeIds.length} node(s), fixed ${repairResult.fixedNodeIds.length} node(s)`);
      } else {
        console.warn('[LLMSafetyGuard] ⚠️  Could not auto-repair all issues');
      }
    }

    const valid = errors.length === 0;

    console.log(`[LLMSafetyGuard] ✅ Safety validation complete: ${valid ? 'VALID' : 'INVALID'}`);
    if (errors.length > 0) {
      console.error(`[LLMSafetyGuard] ❌ Errors: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.warn(`[LLMSafetyGuard] ⚠️  Warnings: ${warnings.join(', ')}`);
    }

    return {
      valid,
      errors,
      warnings,
      repaired,
      repairedWorkflow,
      details,
    };
  }

  /**
   * Validate node allowlist
   * Rejects unknown node types
   */
  private validateNodeAllowlist(nodes: WorkflowNode[]): {
    unknownNodes: Array<{ nodeId: string; nodeType: string }>;
    validNodes: WorkflowNode[];
  } {
    const unknownNodes: Array<{ nodeId: string; nodeType: string }> = [];
    const validNodes: WorkflowNode[] = [];

    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);

      if (!schema) {
        unknownNodes.push({
          nodeId: node.id,
          nodeType,
        });
        console.warn(`[LLMSafetyGuard] ⚠️  Unknown node type: ${nodeType} (node ${node.id})`);
      } else {
        validNodes.push(node);
      }
    }

    return { unknownNodes, validNodes };
  }

  /**
   * Verify providers
   * Rejects unregistered providers
   */
  private validateProviders(nodes: WorkflowNode[]): {
    unregisteredProviders: Array<{ nodeId: string; nodeType: string; provider: string }>;
    validNodes: WorkflowNode[];
  } {
    const unregisteredProviders: Array<{ nodeId: string; nodeType: string; provider: string }> = [];
    const validNodes: WorkflowNode[] = [];

    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);

      if (!schema) {
        // Unknown node type - skip provider validation (handled by allowlist validation)
        continue;
      }

      // Check if node has providers field
      if (schema.providers && schema.providers.length > 0) {
        // Node schema declares providers - validate they're registered
        for (const provider of schema.providers) {
          if (!REGISTERED_PROVIDERS.has(provider.toLowerCase())) {
            unregisteredProviders.push({
              nodeId: node.id,
              nodeType,
              provider,
            });
            console.warn(`[LLMSafetyGuard] ⚠️  Unregistered provider: ${provider} (in node ${nodeType}, node ${node.id})`);
          }
        }
      }

      // Check node config for provider field
      if (node.data?.config) {
        const config = node.data.config;
        
        // Check for provider field in config
        if (config.provider && typeof config.provider === 'string') {
          const provider = config.provider.toLowerCase();
          if (!REGISTERED_PROVIDERS.has(provider)) {
            unregisteredProviders.push({
              nodeId: node.id,
              nodeType,
              provider: config.provider,
            });
            console.warn(`[LLMSafetyGuard] ⚠️  Unregistered provider in config: ${config.provider} (in node ${nodeType}, node ${node.id})`);
          }
        }
      }

      validNodes.push(node);
    }

    return { unregisteredProviders, validNodes };
  }

  /**
   * Validate node schemas
   * Validates node configurations against their schemas
   */
  private validateSchemas(nodes: WorkflowNode[]): {
    schemaErrors: Array<{ nodeId: string; nodeType: string; errors: string[] }>;
    validNodes: WorkflowNode[];
  } {
    const schemaErrors: Array<{ nodeId: string; nodeType: string; errors: string[] }> = [];
    const validNodes: WorkflowNode[] = [];

    for (const node of nodes) {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);

      if (!schema) {
        // Unknown node type - skip schema validation (handled by allowlist validation)
        continue;
      }

      const errors: string[] = [];

      // Validate required fields
      if (schema.configSchema.required && schema.configSchema.required.length > 0) {
        const config = node.data?.config || {};
        
        for (const requiredField of schema.configSchema.required) {
          if (!(requiredField in config) || config[requiredField] === undefined || config[requiredField] === null || config[requiredField] === '') {
            errors.push(`Missing required field: ${requiredField}`);
          }
        }
      }

      // Validate field types and constraints
      if (schema.configSchema.optional && node.data?.config) {
        const config = node.data.config;
        
        for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
          if (fieldName in config) {
            const value = config[fieldName];
            
            // Type validation
            if (fieldDef.type === 'string' && typeof value !== 'string') {
              errors.push(`Field ${fieldName}: expected string, got ${typeof value}`);
            } else if (fieldDef.type === 'number' && typeof value !== 'number') {
              errors.push(`Field ${fieldName}: expected number, got ${typeof value}`);
            } else if (fieldDef.type === 'boolean' && typeof value !== 'boolean') {
              errors.push(`Field ${fieldName}: expected boolean, got ${typeof value}`);
            } else if (fieldDef.type === 'array' && !Array.isArray(value)) {
              errors.push(`Field ${fieldName}: expected array, got ${typeof value}`);
            } else if (fieldDef.type === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
              errors.push(`Field ${fieldName}: expected object, got ${typeof value}`);
            }

            // Custom validation
            if (fieldDef.validation && typeof fieldDef.validation === 'function') {
              const validationResult = fieldDef.validation(value);
              if (validationResult !== true) {
                errors.push(`Field ${fieldName}: ${validationResult || 'validation failed'}`);
              }
            }
          }
        }
      }

      // Validate validation rules
      if (schema.validationRules && schema.validationRules.length > 0 && node.data?.config) {
        const config = node.data.config;
        
        for (const rule of schema.validationRules) {
          if (rule.field in config) {
            const value = config[rule.field];
            const validationResult = rule.validator(value);
            if (validationResult !== true) {
              errors.push(`Validation rule failed for ${rule.field}: ${rule.errorMessage}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        schemaErrors.push({
          nodeId: node.id,
          nodeType,
          errors,
        });
        console.warn(`[LLMSafetyGuard] ⚠️  Schema validation errors for node ${node.id} (${nodeType}): ${errors.join(', ')}`);
      } else {
        validNodes.push(node);
      }
    }

    return { schemaErrors, validNodes };
  }

  /**
   * Auto-repair invalid output
   * Removes unknown nodes and fixes schema issues
   */
  private autoRepair(
    workflow: Workflow,
    nodeValidation: { unknownNodes: Array<{ nodeId: string; nodeType: string }> },
    providerValidation: { unregisteredProviders: Array<{ nodeId: string; nodeType: string; provider: string }> },
    schemaValidation: { schemaErrors: Array<{ nodeId: string; nodeType: string; errors: string[] }> }
  ): {
    repaired: boolean;
    workflow: Workflow;
    removedNodeIds: string[];
    fixedNodeIds: string[];
  } {
    const removedNodeIds = new Set<string>();
    const fixedNodeIds: string[] = [];
    const nodesToRemove = new Set<string>();

    // Remove unknown nodes
    for (const unknownNode of nodeValidation.unknownNodes) {
      nodesToRemove.add(unknownNode.nodeId);
      removedNodeIds.add(unknownNode.nodeId);
      console.log(`[LLMSafetyGuard] 🔧 Removing unknown node: ${unknownNode.nodeId} (${unknownNode.nodeType})`);
    }

    // Remove nodes with unregistered providers (if cannot be fixed)
    for (const unregisteredProvider of providerValidation.unregisteredProviders) {
      // Try to fix by removing provider or using default
      const node = workflow.nodes.find(n => n.id === unregisteredProvider.nodeId);
      if (node && node.data?.config) {
        // Try to remove provider field or set to default
        if (unregisteredProvider.provider in node.data.config) {
          delete node.data.config[unregisteredProvider.provider];
          fixedNodeIds.push(unregisteredProvider.nodeId);
          console.log(`[LLMSafetyGuard] 🔧 Fixed unregistered provider: removed ${unregisteredProvider.provider} from node ${unregisteredProvider.nodeId}`);
        } else {
          // Cannot fix - remove node
          nodesToRemove.add(unregisteredProvider.nodeId);
          removedNodeIds.add(unregisteredProvider.nodeId);
          console.log(`[LLMSafetyGuard] 🔧 Removing node with unregistered provider: ${unregisteredProvider.nodeId} (${unregisteredProvider.provider})`);
        }
      } else {
        // Node not found or no config - remove
        nodesToRemove.add(unregisteredProvider.nodeId);
        removedNodeIds.add(unregisteredProvider.nodeId);
      }
    }

    // Fix schema errors (remove invalid fields, set defaults)
    for (const schemaError of schemaValidation.schemaErrors) {
      const node = workflow.nodes.find(n => n.id === schemaError.nodeId);
      if (node && !nodesToRemove.has(node.id)) {
        const nodeType = normalizeNodeType(node);
        const schema = nodeLibrary.getSchema(nodeType);
        
        if (schema && node.data?.config) {
          const config = node.data.config;
          let fixed = false;

          // Remove invalid fields
          for (const error of schemaError.errors) {
            if (error.includes('expected') && error.includes('got')) {
              // Type mismatch - remove invalid field
              const fieldMatch = error.match(/Field (\w+):/);
              if (fieldMatch && fieldMatch[1] in config) {
                delete config[fieldMatch[1]];
                fixed = true;
                console.log(`[LLMSafetyGuard] 🔧 Fixed schema error: removed invalid field ${fieldMatch[1]} from node ${node.id}`);
              }
            } else if (error.includes('Missing required field')) {
              // Missing required field - set default if available
              const fieldMatch = error.match(/Missing required field: (\w+)/);
              if (fieldMatch && schema.configSchema.optional?.[fieldMatch[1]]?.default !== undefined) {
                config[fieldMatch[1]] = schema.configSchema.optional[fieldMatch[1]].default;
                fixed = true;
                console.log(`[LLMSafetyGuard] 🔧 Fixed schema error: set default for required field ${fieldMatch[1]} in node ${node.id}`);
              }
            }
          }

          if (fixed) {
            fixedNodeIds.push(node.id);
          }
        }
      }
    }

    // Remove nodes and their edges
    const repairedNodes = workflow.nodes.filter(node => !nodesToRemove.has(node.id));
    const repairedEdges = workflow.edges.filter(
      edge => !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target)
    );

    const repairedWorkflow: Workflow = {
      ...workflow,
      nodes: repairedNodes,
      edges: repairedEdges,
      metadata: {
        ...workflow.metadata,
        safetyGuardRepaired: true,
        removedNodes: Array.from(removedNodeIds),
        fixedNodes: fixedNodeIds,
      },
    };

    return {
      repaired: removedNodeIds.size > 0 || fixedNodeIds.length > 0,
      workflow: repairedWorkflow,
      removedNodeIds: Array.from(removedNodeIds),
      fixedNodeIds,
    };
  }

  /**
   * Validate structured intent before compilation
   * Pre-validates intent to catch issues early
   */
  validateIntent(intent: StructuredIntent): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    console.log('[LLMSafetyGuard] Validating structured intent...');
    
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate trigger
    if (intent.trigger) {
      const triggerSchema = nodeLibrary.getSchema(intent.trigger);
      if (!triggerSchema) {
        errors.push(`Unknown trigger type: ${intent.trigger}`);
      }
    }

    // Validate actions
    if (intent.actions && intent.actions.length > 0) {
      for (const action of intent.actions) {
        const actionSchema = nodeLibrary.getSchema(action.type);
        if (!actionSchema) {
          errors.push(`Unknown action type: ${action.type}`);
        } else {
          // Check provider if action has provider
          if (actionSchema.providers && actionSchema.providers.length > 0) {
            // Validate providers are registered
            for (const provider of actionSchema.providers) {
              if (!REGISTERED_PROVIDERS.has(provider.toLowerCase())) {
                warnings.push(`Unregistered provider in action ${action.type}: ${provider}`);
              }
            }
          }
        }
      }
    }

    const valid = errors.length === 0;

    console.log(`[LLMSafetyGuard] Intent validation: ${valid ? 'VALID' : 'INVALID'}`);
    if (errors.length > 0) {
      console.error(`[LLMSafetyGuard] ❌ Errors: ${errors.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.warn(`[LLMSafetyGuard] ⚠️  Warnings: ${warnings.join(', ')}`);
    }

    return { valid, errors, warnings };
  }
}

// Export singleton instance
export const llmSafetyGuard = new LLMSafetyGuard();

// Export convenience functions
export function validateWorkflowSafety(
  workflow: Workflow,
  intent?: StructuredIntent
): SafetyValidationResult {
  return llmSafetyGuard.validateAndRepair(workflow, intent);
}

export function validateIntentSafety(intent: StructuredIntent): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  return llmSafetyGuard.validateIntent(intent);
}
