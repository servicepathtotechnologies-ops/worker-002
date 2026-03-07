/**
 * Output Validator
 * 
 * ✅ PHASE 4: Validates LLM outputs against schemas
 * 
 * This validator:
 * - Validates SimpleIntent structure
 * - Validates StructuredIntent structure
 * - Validates node types against registry
 * - Provides detailed error messages
 * - Suggests fixes for invalid outputs
 * 
 * Architecture Rule:
 * - All LLM outputs must be validated before use
 * - Uses registry to validate node types
 * - Provides actionable error messages
 */

import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { llmGuardrails } from './llm-guardrails';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[]; // Suggested fixes
  confidence: number; // 0-1
}

export class OutputValidator {
  private static instance: OutputValidator;
  
  private constructor() {}
  
  static getInstance(): OutputValidator {
    if (!OutputValidator.instance) {
      OutputValidator.instance = new OutputValidator();
    }
    return OutputValidator.instance;
  }
  
  /**
   * Validate SimpleIntent output from LLM
   * 
   * ✅ UNIVERSAL: Uses registry to validate node types
   */
  validateSimpleIntent(intent: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Use LLM guardrails for basic structure validation
    const guardrailResult = llmGuardrails.validateSimpleIntent(intent);
    errors.push(...guardrailResult.errors);
    warnings.push(...guardrailResult.warnings);
    
    // Additional validation
    if (!intent.verbs || intent.verbs.length === 0) {
      errors.push('Intent must have at least one verb');
      suggestions.push('Add verbs like "send", "read", "create", etc.');
    }
    
    if (!intent.sources && !intent.destinations) {
      warnings.push('Intent has no sources or destinations');
      suggestions.push('Add at least one source or destination');
    }
    
    // ✅ UNIVERSAL: Validate trigger if present using registry
    if (intent.trigger) {
      // Get all trigger types from registry
      const allNodeTypes = unifiedNodeRegistry.getAllTypes();
      const validTriggerTypes = allNodeTypes.filter(type => {
        const normalized = unifiedNormalizeNodeTypeString(type);
        const nodeDef = unifiedNodeRegistry.get(normalized);
        return nodeDef?.category === 'trigger';
      });
      
      // Map SimpleIntent trigger type to registry trigger types
      const triggerTypeMap: Record<string, string[]> = {
        'schedule': ['schedule'],
        'manual': ['manual_trigger'],
        'webhook': ['webhook'],
        'event': ['webhook', 'error_trigger', 'workflow_trigger'],
        'form': ['form'],
        'chat': ['chat_trigger'],
      };
      
      const mappedTypes = triggerTypeMap[intent.trigger.type] || [];
      const isValid = mappedTypes.some(mappedType => 
        validTriggerTypes.some(validType => 
          unifiedNormalizeNodeTypeString(validType) === unifiedNormalizeNodeTypeString(mappedType)
        )
      );
      
      if (!isValid) {
        errors.push(`Invalid trigger type: ${intent.trigger.type}`);
        suggestions.push(`Use one of: ${Object.keys(triggerTypeMap).join(', ')}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      confidence: guardrailResult.confidence,
    };
  }
  
  /**
   * Validate StructuredIntent output
   * 
   * ✅ UNIVERSAL: Uses registry to validate node types
   */
  validateStructuredIntent(intent: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Basic structure validation
    if (!intent || typeof intent !== 'object') {
      return {
        valid: false,
        errors: ['StructuredIntent must be an object'],
        warnings,
        suggestions: ['Ensure LLM returns a valid object'],
        confidence: 0,
      };
    }
    
    // Validate trigger
    if (!intent.trigger) {
      errors.push('StructuredIntent must have a trigger');
      suggestions.push('Add a trigger (e.g., "manual_trigger", "schedule")');
    } else if (typeof intent.trigger !== 'string') {
      errors.push('Trigger must be a string');
    } else {
      // ✅ UNIVERSAL: Validate trigger type using registry
      const normalizedTrigger = unifiedNormalizeNodeTypeString(intent.trigger);
      const triggerDef = unifiedNodeRegistry.get(normalizedTrigger);
      if (!triggerDef) {
        errors.push(`Invalid trigger type: ${intent.trigger}`);
        suggestions.push(`Use a valid trigger type from registry`);
      } else if (triggerDef.category !== 'trigger') {
        errors.push(`Node type "${intent.trigger}" is not a trigger`);
        suggestions.push(`Use a trigger node type (e.g., "manual_trigger", "schedule", "webhook")`);
      }
    }
    
    // Validate actions
    if (intent.actions && Array.isArray(intent.actions)) {
      for (let i = 0; i < intent.actions.length; i++) {
        const action = intent.actions[i];
        if (!action.type) {
          errors.push(`Action ${i} missing type`);
          suggestions.push('Add a node type to the action');
        } else {
          // ✅ UNIVERSAL: Validate node type using registry
          const normalizedType = unifiedNormalizeNodeTypeString(action.type);
          const nodeDef = unifiedNodeRegistry.get(normalizedType);
          if (!nodeDef) {
            errors.push(`Invalid action node type: ${action.type}`);
            suggestions.push(`Use a valid node type from registry`);
          } else if (!nodeCapabilityRegistryDSL.isOutput(normalizedType)) {
            warnings.push(`Action node type "${action.type}" may not be an output node`);
            suggestions.push(`Consider using an output node type`);
          }
        }
      }
    }
    
    // ✅ UNIVERSAL: Validate data sources using registry
    if (intent.dataSources && Array.isArray(intent.dataSources)) {
      for (let i = 0; i < intent.dataSources.length; i++) {
        const dataSource = intent.dataSources[i];
        if (!dataSource.type) {
          errors.push(`Data source ${i} missing type`);
          suggestions.push('Add a node type to the data source');
        } else {
          const normalizedType = unifiedNormalizeNodeTypeString(dataSource.type);
          const nodeDef = unifiedNodeRegistry.get(normalizedType);
          if (!nodeDef) {
            errors.push(`Invalid data source node type: ${dataSource.type}`);
            suggestions.push(`Use a valid node type from registry`);
          } else if (!nodeCapabilityRegistryDSL.isDataSource(normalizedType)) {
            warnings.push(`Data source node type "${dataSource.type}" may not be a data source node`);
            suggestions.push(`Consider using a data source node type`);
          }
        }
      }
    }
    
    // ✅ UNIVERSAL: Validate transformations using registry
    if (intent.transformations && Array.isArray(intent.transformations)) {
      for (let i = 0; i < intent.transformations.length; i++) {
        const transformation = intent.transformations[i];
        if (!transformation.type) {
          errors.push(`Transformation ${i} missing type`);
          suggestions.push('Add a node type to the transformation');
        } else {
          const normalizedType = unifiedNormalizeNodeTypeString(transformation.type);
          const nodeDef = unifiedNodeRegistry.get(normalizedType);
          if (!nodeDef) {
            errors.push(`Invalid transformation node type: ${transformation.type}`);
            suggestions.push(`Use a valid node type from registry`);
          } else if (!nodeCapabilityRegistryDSL.isTransformation(normalizedType)) {
            warnings.push(`Transformation node type "${transformation.type}" may not be a transformation node`);
            suggestions.push(`Consider using a transformation node type`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      confidence: errors.length === 0 ? (warnings.length === 0 ? 1.0 : 0.8) : 0,
    };
  }
  
  /**
   * Validate node type exists in registry
   * 
   * ✅ UNIVERSAL: Uses registry to check node existence
   */
  validateNodeType(nodeType: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    if (!nodeType || typeof nodeType !== 'string') {
      return {
        valid: false,
        errors: ['Node type must be a non-empty string'],
        warnings,
        suggestions: ['Provide a valid node type string'],
        confidence: 0,
      };
    }
    
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      errors.push(`Node type "${nodeType}" not found in registry`);
      suggestions.push('Use a valid node type from the registry');
      
      // Suggest similar node types
      const allTypes = unifiedNodeRegistry.getAllTypes();
      const similarTypes = allTypes.filter(type => 
        type.toLowerCase().includes(nodeType.toLowerCase()) ||
        nodeType.toLowerCase().includes(type.toLowerCase())
      );
      
      if (similarTypes.length > 0) {
        suggestions.push(`Did you mean: ${similarTypes.slice(0, 3).join(', ')}?`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      confidence: errors.length === 0 ? 1.0 : 0,
    };
  }
  
  /**
   * Validate operation for node type
   * 
   * ✅ UNIVERSAL: Uses registry to validate operations
   */
  validateOperation(nodeType: string, operation: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Validate node type first
    const nodeTypeValidation = this.validateNodeType(nodeType);
    if (!nodeTypeValidation.valid) {
      return nodeTypeValidation;
    }
    
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return {
        valid: false,
        errors: [`Node type "${nodeType}" not found`],
        warnings,
        suggestions,
        confidence: 0,
      };
    }
    
    // Check if operation is valid for this node type
    // Common operations that most nodes support
    const commonOperations = ['read', 'write', 'create', 'update', 'delete', 'send', 'get', 'execute'];
    
    if (!operation || typeof operation !== 'string') {
      errors.push('Operation must be a non-empty string');
      suggestions.push(`Use one of: ${commonOperations.join(', ')}`);
    } else if (!commonOperations.includes(operation.toLowerCase())) {
      warnings.push(`Operation "${operation}" may not be standard`);
      suggestions.push(`Common operations: ${commonOperations.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      confidence: errors.length === 0 ? 1.0 : 0.8,
    };
  }
}

// Export singleton instance
export const outputValidator = OutputValidator.getInstance();
