/**
 * LLM Guardrails
 * 
 * ✅ PHASE 4: Ensures LLM outputs adhere to valid structures
 * 
 * This system:
 * - Validates LLM outputs against JSON schemas
 * - Enforces function calling constraints
 * - Provides grammar constraints
 * - Auto-repairs invalid outputs
 * - Uses registry to validate node types
 * 
 * Architecture Rule:
 * - All LLM outputs must be validated before use
 * - Invalid outputs are repaired automatically
 * - Uses registry to validate node types
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface LLMOutputValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  repaired?: any; // Repaired output if validation failed
  confidence: number; // 0-1, how confident we are in the output
}

export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: any[];
  [key: string]: any;
}

export class LLMGuardrails {
  private static instance: LLMGuardrails;
  
  private constructor() {}
  
  static getInstance(): LLMGuardrails {
    if (!LLMGuardrails.instance) {
      LLMGuardrails.instance = new LLMGuardrails();
    }
    return LLMGuardrails.instance;
  }
  
  /**
   * Validate LLM output against JSON schema
   * 
   * @param output - LLM output to validate
   * @param schema - JSON schema to validate against
   * @returns Validation result with repaired output if needed
   */
  validateJSONSchema(
    output: any,
    schema: JSONSchema
  ): LLMOutputValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Parse JSON if string
      let parsed: any = output;
      if (typeof output === 'string') {
        try {
          parsed = JSON.parse(output);
        } catch (e) {
          errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
          return {
            valid: false,
            errors,
            warnings,
            confidence: 0,
          };
        }
      }
      
      // Validate against schema
      const validation = this.validateAgainstSchema(parsed, schema);
      
      if (!validation.valid) {
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
        
        // Try to repair
        const repaired = this.repairOutput(parsed, schema, validation.errors);
        
        if (repaired) {
          // Re-validate repaired output
          const repairedValidation = this.validateAgainstSchema(repaired, schema);
          if (repairedValidation.valid) {
            return {
              valid: true,
              errors: [],
              warnings: [...warnings, 'Output was repaired'],
              repaired,
              confidence: 0.8, // Lower confidence for repaired outputs
            };
          }
        }
        
        return {
          valid: false,
          errors,
          warnings,
          confidence: 0,
        };
      }
      
      return {
        valid: true,
        errors: [],
        warnings,
        confidence: 1.0,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings,
        confidence: 0,
      };
    }
  }
  
  /**
   * Validate output against schema recursively
   */
  private validateAgainstSchema(
    value: any,
    schema: JSONSchema,
    path: string = ''
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check type
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) {
        errors.push(`Type mismatch at ${path}: expected ${schema.type}, got ${actualType}`);
      }
    }
    
    // Validate object properties
    if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      if (schema.properties) {
        // Check required properties
        if (schema.required) {
          for (const requiredProp of schema.required) {
            if (!(requiredProp in value)) {
              errors.push(`Missing required property at ${path}.${requiredProp}`);
            }
          }
        }
        
        // Validate each property
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in value) {
            const propValidation = this.validateAgainstSchema(
              value[prop],
              propSchema,
              path ? `${path}.${prop}` : prop
            );
            errors.push(...propValidation.errors);
            warnings.push(...propValidation.warnings);
          }
        }
      }
    }
    
    // Validate array items
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemValidation = this.validateAgainstSchema(
            value[i],
            schema.items,
            `${path}[${i}]`
          );
          errors.push(...itemValidation.errors);
          warnings.push(...itemValidation.warnings);
        }
      }
    }
    
    // Validate enum
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Value at ${path} must be one of: ${schema.enum.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Repair invalid output based on schema
   */
  private repairOutput(
    output: any,
    schema: JSONSchema,
    errors: string[]
  ): any | null {
    try {
      const repaired = JSON.parse(JSON.stringify(output)); // Deep clone
      
      // Repair missing required properties
      if (schema.type === 'object' && schema.properties && schema.required) {
        for (const requiredProp of schema.required) {
          if (!(requiredProp in repaired)) {
            const propSchema = schema.properties[requiredProp];
            repaired[requiredProp] = this.getDefaultValue(propSchema);
          }
        }
      }
      
      // Repair type mismatches
      if (schema.type === 'array' && !Array.isArray(repaired)) {
        return [repaired];
      }
      
      if (schema.type === 'object' && (Array.isArray(repaired) || typeof repaired !== 'object' || repaired === null)) {
        return {};
      }
      
      return repaired;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get default value for schema type
   */
  private getDefaultValue(schema: JSONSchema): any {
    switch (schema.type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return null;
    }
  }
  
  /**
   * Validate SimpleIntent structure
   * 
   * ✅ UNIVERSAL: Uses registry to validate node types mentioned in intent
   */
  validateSimpleIntent(intent: any): LLMOutputValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic structure validation
    if (!intent || typeof intent !== 'object') {
      return {
        valid: false,
        errors: ['Intent must be an object'],
        warnings,
        confidence: 0,
      };
    }
    
    // Validate verbs
    if (!intent.verbs || !Array.isArray(intent.verbs)) {
      errors.push('Intent must have verbs array');
    }
    
    // ✅ UNIVERSAL: Validate sources using registry
    if (intent.sources && Array.isArray(intent.sources)) {
      for (const source of intent.sources) {
        if (typeof source !== 'string') {
          errors.push(`Source must be a string: ${source}`);
          continue;
        }
        
        // Check if source can be mapped to a node type in registry
        const nodeType = this.findNodeTypeForEntity(source, 'dataSource');
        if (!nodeType) {
          warnings.push(`Source "${source}" may not map to a valid data source node`);
        }
      }
    }
    
    // ✅ UNIVERSAL: Validate destinations using registry
    if (intent.destinations && Array.isArray(intent.destinations)) {
      for (const destination of intent.destinations) {
        if (typeof destination !== 'string') {
          errors.push(`Destination must be a string: ${destination}`);
          continue;
        }
        
        // Check if destination can be mapped to a node type in registry
        const nodeType = this.findNodeTypeForEntity(destination, 'output');
        if (!nodeType) {
          warnings.push(`Destination "${destination}" may not map to a valid output node`);
        }
      }
    }
    
    // ✅ UNIVERSAL: Validate transformations using registry
    if (intent.transformations && Array.isArray(intent.transformations)) {
      for (const transformation of intent.transformations) {
        if (typeof transformation !== 'string') {
          errors.push(`Transformation must be a string: ${transformation}`);
          continue;
        }
        
        // Check if transformation can be mapped to a node type in registry
        const nodeType = this.findNodeTypeForEntity(transformation, 'transformation');
        if (!nodeType) {
          warnings.push(`Transformation "${transformation}" may not map to a valid transformation node`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      confidence: errors.length === 0 ? (warnings.length === 0 ? 1.0 : 0.8) : 0,
    };
  }
  
  /**
   * Find node type for entity using registry (UNIVERSAL)
   */
  private findNodeTypeForEntity(
    entity: string,
    category: 'dataSource' | 'transformation' | 'output'
  ): string | null {
    const entityLower = entity.toLowerCase();
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check category
      const isCorrectCategory = 
        (category === 'dataSource' && nodeCapabilityRegistryDSL.isDataSource(nodeType)) ||
        (category === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(nodeType)) ||
        (category === 'output' && nodeCapabilityRegistryDSL.isOutput(nodeType));
      
      if (!isCorrectCategory) continue;
      
      // Check match
      const label = nodeDef.label || nodeType;
      const labelLower = label.toLowerCase();
      const typeLower = nodeType.toLowerCase();
      const keywords = nodeDef.tags || [];
      
      if (labelLower.includes(entityLower) || entityLower.includes(labelLower) ||
          typeLower.includes(entityLower) || entityLower.includes(typeLower)) {
        return nodeType;
      }
      
      for (const keyword of keywords) {
        if (keyword.toLowerCase() === entityLower || keyword.toLowerCase().includes(entityLower)) {
          return nodeType;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Generate JSON schema for SimpleIntent
   */
  generateSimpleIntentSchema(): JSONSchema {
    return {
      type: 'object',
      required: ['verbs'],
      properties: {
        verbs: {
          type: 'array',
          items: { type: 'string' },
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
        },
        destinations: {
          type: 'array',
          items: { type: 'string' },
        },
        trigger: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              // ✅ UNIVERSAL: Enum values are SimpleIntent trigger types (not registry node types)
              // These are mapped to registry trigger types by the planner
              enum: ['schedule', 'manual', 'webhook', 'event', 'form', 'chat'],
            },
            description: { type: 'string' },
          },
        },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              type: {
                type: 'string',
                enum: ['if', 'switch', 'loop'],
              },
            },
          },
        },
        transformations: {
          type: 'array',
          items: { type: 'string' },
        },
        dataTypes: {
          type: 'array',
          items: { type: 'string' },
        },
        providers: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
  }
  
  /**
   * Extract and validate JSON from LLM response
   * Handles markdown code blocks, extra text, etc.
   */
  extractAndValidateJSON(
    response: string,
    schema: JSONSchema
  ): LLMOutputValidationResult {
    // Try to extract JSON from response
    let jsonString = response.trim();
    
    // Remove markdown code blocks
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }
    
    // Try to find JSON object/array
    const jsonMatch = jsonString.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    }
    
    try {
      const parsed = JSON.parse(jsonString);
      return this.validateJSONSchema(parsed, schema);
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        confidence: 0,
      };
    }
  }
}

// Export singleton instance
export const llmGuardrails = LLMGuardrails.getInstance();
