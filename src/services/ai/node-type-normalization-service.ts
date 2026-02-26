/**
 * NodeTypeNormalizationService
 * 
 * Normalizes and validates node types before workflow generation.
 * 
 * Responsibilities:
 * 1. Map abstract types to real node types (e.g., ai_summary → text_summarizer)
 * 2. Validate all node types exist in NodeLibrary
 * 3. Replace invalid types with valid ones
 * 4. Throw error if types cannot be resolved
 * 
 * This service ensures workflow_builder never receives invalid node types.
 */

import { nodeLibrary } from '../nodes/node-library';
import { resolveNodeType } from '../../core/utils/node-type-resolver-util';
import { StructuredIntent } from './intent-structurer';
import { WorkflowStructure } from './workflow-structure-builder';
import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { capabilityResolver } from './capability-resolver';

/**
 * Abstract type to canonical node type mappings
 * These are common abstract types that need to be mapped to real node types
 */
const ABSTRACT_TYPE_MAPPINGS: Record<string, string> = {
  // AI Summary types
  'ai_summary': 'text_summarizer',
  'ai_summarization': 'text_summarizer',
  'ai_summarize': 'text_summarizer',
  'ai_summarizer': 'text_summarizer',
  
  // Email types - map to google_gmail (gmail is an alias that resolves to google_gmail)
  'ai_email': 'google_gmail',
  'ai_mail': 'google_gmail',
  
  // Spreadsheet types
  'spreadsheet': 'google_sheets',
  'sheet': 'google_sheets',
  'sheets': 'google_sheets',
};

/**
 * Normalization result
 */
export interface NormalizationResult {
  success: boolean;
  normalizedIntent?: StructuredIntent;
  normalizedStructure?: WorkflowStructure;
  normalizedWorkflow?: Workflow;
  errors: string[];
  warnings: string[];
  replacements: Array<{
    original: string;
    normalized: string;
    location: string;
  }>;
}

/**
 * NodeTypeNormalizationService
 */
export class NodeTypeNormalizationService {
  private static instance: NodeTypeNormalizationService;
  
  private constructor() {}
  
  static getInstance(): NodeTypeNormalizationService {
    if (!NodeTypeNormalizationService.instance) {
      NodeTypeNormalizationService.instance = new NodeTypeNormalizationService();
    }
    return NodeTypeNormalizationService.instance;
  }
  
  /**
   * Normalize a node type string
   * 
   * Strategy:
   * 1. Check if it's a capability (ai_service, ai_processing, etc.) → resolve to real node
   * 2. Check abstract type mappings
   * 3. Use NodeTypeResolver to resolve aliases
   * 4. Validate against NodeLibrary
   * 
   * @param nodeType - The node type to normalize
   * @returns Normalized node type or null if cannot be resolved
   */
  normalizeNodeType(nodeType: string): { normalized: string; valid: boolean; method: string } {
    if (!nodeType || typeof nodeType !== 'string') {
      return { normalized: nodeType || '', valid: false, method: 'invalid_input' };
    }
    
    // ✅ STEP 1: Check if it's a capability (not a node type)
    // ai_service, ai_processing, summarization, etc. are capabilities, not node types
    if (capabilityResolver.isCapability(nodeType)) {
      const resolution = capabilityResolver.resolveCapability(nodeType);
      if (resolution) {
        console.log(`[NodeTypeNormalization] Resolved capability "${nodeType}" → "${resolution.nodeType}" (${resolution.reason})`);
        return { normalized: resolution.nodeType, valid: true, method: 'capability_resolution' };
      } else {
        console.warn(`[NodeTypeNormalization] ⚠️  Could not resolve capability: "${nodeType}"`);
        return { normalized: nodeType, valid: false, method: 'capability_resolution_failed' };
      }
    }
    
    // Step 2: Check abstract type mappings
    const abstractMapping = ABSTRACT_TYPE_MAPPINGS[nodeType.toLowerCase()];
    if (abstractMapping) {
      // Validate the mapped type exists
      const schema = nodeLibrary.getSchema(abstractMapping);
      if (schema) {
        return { normalized: abstractMapping, valid: true, method: 'abstract_mapping' };
      }
    }
    
    // Step 2: Use NodeTypeResolver to resolve aliases and fuzzy matches
    const resolved = resolveNodeType(nodeType, false);
    
    // Step 3: Validate resolved type exists in NodeLibrary
    const schema = nodeLibrary.getSchema(resolved);
    if (schema) {
      if (resolved === nodeType) {
        return { normalized: resolved, valid: true, method: 'exact_match' };
      } else {
        return { normalized: resolved, valid: true, method: 'resolver' };
      }
    }
    
    // Step 4: Not found - return invalid
    return { normalized: nodeType, valid: false, method: 'not_found' };
  }
  
  /**
   * Normalize StructuredIntent node types
   * 
   * @param intent - The structured intent to normalize
   * @returns Normalization result
   */
  normalizeStructuredIntent(intent: StructuredIntent): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedIntent: StructuredIntent = {
      ...intent,
      actions: intent.actions ? [...intent.actions] : [],
    };
    
    // Normalize trigger
    if (normalizedIntent.trigger) {
      const result = this.normalizeNodeType(normalizedIntent.trigger);
      if (!result.valid) {
        errors.push(`Invalid trigger type: "${normalizedIntent.trigger}"`);
      } else if (result.normalized !== normalizedIntent.trigger) {
        replacements.push({
          original: normalizedIntent.trigger,
          normalized: result.normalized,
          location: 'trigger',
        });
        normalizedIntent.trigger = result.normalized;
        warnings.push(`Trigger type "${normalizedIntent.trigger}" normalized to "${result.normalized}" (${result.method})`);
      }
    }
    
    // Normalize action types
    if (normalizedIntent.actions && normalizedIntent.actions.length > 0) {
      for (let i = 0; i < normalizedIntent.actions.length; i++) {
        const action = normalizedIntent.actions[i];
        const result = this.normalizeNodeType(action.type);
        
        if (!result.valid) {
          errors.push(`Invalid action type at index ${i}: "${action.type}"`);
        } else if (result.normalized !== action.type) {
          replacements.push({
            original: action.type,
            normalized: result.normalized,
            location: `actions[${i}].type`,
          });
          action.type = result.normalized;
          warnings.push(`Action type "${action.type}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedIntent: errors.length === 0 ? normalizedIntent : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Normalize WorkflowStructure node types
   * 
   * @param structure - The workflow structure to normalize
   * @returns Normalization result
   */
  normalizeWorkflowStructure(structure: WorkflowStructure): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedStructure: WorkflowStructure = {
      ...structure,
      nodes: structure.nodes ? [...structure.nodes] : [],
      connections: structure.connections ? [...structure.connections] : [],
    };
    
    // Normalize node types in structure
    if (normalizedStructure.nodes && normalizedStructure.nodes.length > 0) {
      for (let i = 0; i < normalizedStructure.nodes.length; i++) {
        const node = normalizedStructure.nodes[i];
        const nodeType = typeof node === 'string' ? node : node.type || '';
        
        if (!nodeType) {
          errors.push(`Node at index ${i} has no type`);
          continue;
        }
        
        const result = this.normalizeNodeType(nodeType);
        
        if (!result.valid) {
          errors.push(`Invalid node type at index ${i}: "${nodeType}"`);
        } else if (result.normalized !== nodeType) {
          replacements.push({
            original: nodeType,
            normalized: result.normalized,
            location: `nodes[${i}].type`,
          });
          
          if (typeof node === 'string') {
            // If node is a string, keep it as a string (just the type)
            normalizedStructure.nodes[i] = result.normalized as any;
          } else {
            // If node is an object, update its type property
            (normalizedStructure.nodes[i] as any).type = result.normalized;
          }
          
          warnings.push(`Node type "${nodeType}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedStructure: errors.length === 0 ? normalizedStructure : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Normalize Workflow node types
   * 
   * @param workflow - The workflow to normalize
   * @returns Normalization result
   */
  normalizeWorkflow(workflow: Workflow): NormalizationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const replacements: Array<{ original: string; normalized: string; location: string }> = [];
    
    // Create a copy to avoid mutating the original
    const normalizedWorkflow: Workflow = {
      ...workflow,
      nodes: workflow.nodes ? [...workflow.nodes] : [],
      edges: workflow.edges ? [...workflow.edges] : [],
    };
    
    // Normalize node types in workflow
    if (normalizedWorkflow.nodes && normalizedWorkflow.nodes.length > 0) {
      for (let i = 0; i < normalizedWorkflow.nodes.length; i++) {
        const node = normalizedWorkflow.nodes[i];
        const nodeType = normalizeNodeType(node);
        
        if (!nodeType || nodeType === 'custom') {
          // Try to get from data.type
          const dataType = node.data?.type;
          if (!dataType) {
            errors.push(`Node ${node.id} has no valid type`);
            continue;
          }
        }
        
        // Get the actual type to normalize
        const actualType = nodeType || node.data?.type || '';
        
        if (!actualType) {
          errors.push(`Node ${node.id} has no type`);
          continue;
        }
        
        const result = this.normalizeNodeType(actualType);
        
        if (!result.valid) {
          errors.push(`Invalid node type for node ${node.id}: "${actualType}"`);
        } else if (result.normalized !== actualType) {
          replacements.push({
            original: actualType,
            normalized: result.normalized,
            location: `nodes[${i}].data.type`,
          });
          
          // Update node data.type
          if (!node.data) {
            // Create minimal data structure with required properties
            node.data = {
              type: result.normalized,
              label: result.normalized,
              category: 'utility',
              config: {},
            };
          } else {
            node.data.type = result.normalized;
            // Ensure required properties exist
            if (!node.data.label) {
              node.data.label = result.normalized;
            }
            if (!node.data.category) {
              node.data.category = 'utility';
            }
            if (!node.data.config) {
              node.data.config = {};
            }
          }
          
          warnings.push(`Node ${node.id} type "${actualType}" normalized to "${result.normalized}" (${result.method})`);
        }
      }
    }
    
    return {
      success: errors.length === 0,
      normalizedWorkflow: errors.length === 0 ? normalizedWorkflow : undefined,
      errors,
      warnings,
      replacements,
    };
  }
  
  /**
   * Validate and normalize node types in a StructuredIntent
   * Throws error if any types cannot be resolved
   * 
   * @param intent - The structured intent to validate and normalize
   * @returns Normalized structured intent
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeIntent(intent: StructuredIntent): StructuredIntent {
    const result = this.normalizeStructuredIntent(intent);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedIntent!;
  }
  
  /**
   * Validate and normalize node types in a WorkflowStructure
   * Throws error if any types cannot be resolved
   * 
   * @param structure - The workflow structure to validate and normalize
   * @returns Normalized workflow structure
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeStructure(structure: WorkflowStructure): WorkflowStructure {
    const result = this.normalizeWorkflowStructure(structure);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedStructure!;
  }
  
  /**
   * Validate and normalize node types in a Workflow
   * Throws error if any types cannot be resolved
   * 
   * @param workflow - The workflow to validate and normalize
   * @returns Normalized workflow
   * @throws Error if any node types cannot be resolved
   */
  validateAndNormalizeWorkflow(workflow: Workflow): Workflow {
    const result = this.normalizeWorkflow(workflow);
    
    if (!result.success) {
      const errorMessage = `Node type validation failed:\n${result.errors.join('\n')}\n\nUnresolved node types cannot be used in workflow generation.`;
      console.error(`[NodeTypeNormalizationService] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    if (result.warnings.length > 0) {
      console.log(`[NodeTypeNormalizationService] ⚠️  Normalizations applied:\n${result.warnings.join('\n')}`);
    }
    
    if (result.replacements.length > 0) {
      console.log(`[NodeTypeNormalizationService] ✅ Applied ${result.replacements.length} node type replacements`);
    }
    
    return result.normalizedWorkflow!;
  }
}

// Export singleton instance
export const nodeTypeNormalizationService = NodeTypeNormalizationService.getInstance();
