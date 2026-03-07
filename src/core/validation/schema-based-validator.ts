/**
 * SCHEMA-BASED VALIDATOR
 * 
 * This replaces all hardcoded validation rules.
 * 
 * Architecture:
 * - Fetches node schema from UnifiedNodeRegistry
 * - Validates config against inputSchema
 * - Validates output against outputSchema
 * - NO hardcoded validation rules
 * 
 * This ensures:
 * - All validation comes from registry
 * - Permanent fixes apply to all workflows
 * - Consistent validation across system
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { WorkflowNode } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validate node config against schema from registry
 */
export function validateNodeConfig(node: WorkflowNode): ValidationResult {
  const normalizedType = unifiedNormalizeNodeType(node);
  const nodeType = normalizedType || node.data?.type || node.type;
  const config = node.data?.config || {};
  
  // ✅ STRICT ARCHITECTURE: Pre-validation guard before registry
  try {
    const { assertValidNodeType } = require('../utils/node-authority');
    assertValidNodeType(nodeType);
  } catch (error: any) {
    return {
      valid: false,
      errors: [error.message],
    };
  }
  
  // Get node definition from registry (SINGLE SOURCE OF TRUTH)
  const definition = unifiedNodeRegistry.get(nodeType);
  
  if (!definition) {
    // This should NEVER happen if assertValidNodeType passed
    return {
      valid: false,
      errors: [`[NodeAuthority] Integrity error: Canonical node type '${nodeType}' not found in registry. This indicates a system initialization failure.`],
    };
  }
  
  // Migrate config first (backward compatibility)
  const migratedConfig = unifiedNodeRegistry.migrateConfig(nodeType, config);
  
  // Validate using node's validateConfig (from registry)
  return definition.validateConfig(migratedConfig);
}

/**
 * Validate entire workflow using registry schemas
 */
export function validateWorkflowSchema(workflow: { nodes: WorkflowNode[] }): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nodeErrors: Map<string, string[]>;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeErrors = new Map<string, string[]>();
  
  for (const node of workflow.nodes) {
    const validation = validateNodeConfig(node);
    
    if (!validation.valid) {
      errors.push(`Node ${node.id} (${node.data?.type || node.type}): ${validation.errors.join(', ')}`);
      nodeErrors.set(node.id, validation.errors);
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      warnings.push(`Node ${node.id}: ${validation.warnings.join(', ')}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeErrors,
  };
}

/**
 * Get required fields for a node type from registry
 */
export function getRequiredFields(nodeType: string): string[] {
  const definition = unifiedNodeRegistry.get(nodeType);
  if (!definition) {
    return [];
  }
  
  return definition.requiredInputs;
}

/**
 * Get default config for a node type from registry
 */
export function getDefaultConfig(nodeType: string): Record<string, any> {
  return unifiedNodeRegistry.getDefaultConfig(nodeType);
}
