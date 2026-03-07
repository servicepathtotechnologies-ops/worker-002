/**
 * TEMPLATE VALIDATION GATE
 * 
 * This service validates template mappings before they are applied to node configs.
 * It ensures:
 * 1. Source fields exist in upstream schema
 * 2. Type compatibility between source and target
 * 3. Confidence thresholds are met
 * 4. No invalid templates are persisted
 * 
 * This is a PRE-WRITE validator that prevents invalid templates from being saved.
 * It works alongside template-expression-validator.ts (which validates at read time).
 */

import { TemplateMapping } from './schema-aware-template-generator';
import { NodeOutputFields } from './input-field-mapper';
import { getNodeOutputSchema } from '../../core/types/node-output-types';

export interface ValidationResult {
  ok: boolean;                    // Overall validation result
  score: number;                  // 0-1 validation score
  reasons: string[];              // Reasons for validation result
  warnings: string[];             // Non-blocking warnings
  approvedMappings: TemplateMapping[]; // Mappings that pass validation
  rejectedMappings: TemplateMapping[]; // Mappings that fail validation
}

/**
 * Confidence thresholds for mapping validation
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,      // High confidence - auto-approve
  MEDIUM: 0.6,    // Medium confidence - approve with warning
  LOW: 0.4,       // Low confidence - reject
  MINIMUM: 0.3,   // Absolute minimum - anything below is rejected
};

/**
 * Validate a single template mapping
 */
export function validateMapping(
  mapping: TemplateMapping,
  upstreamSchema: NodeOutputFields,
  targetNodeType: string
): { ok: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = mapping.confidence; // Start with LLM confidence
  
  // ✅ CHECK 1: Source field exists in upstream schema
  if (!upstreamSchema.outputFields.includes(mapping.sourceField)) {
    return {
      ok: false,
      score: 0,
      reasons: [`Source field "${mapping.sourceField}" not found in upstream schema`],
    };
  }
  
  // ✅ CHECK 2: Template format is correct
  if (!mapping.template.includes('{{') || !mapping.template.includes('}}')) {
    reasons.push('Template format is invalid (must contain {{...}})');
    score -= 0.2;
  }
  
  // ✅ CHECK 3: Template references correct source field
  if (!mapping.template.includes(mapping.sourceField)) {
    reasons.push(`Template "${mapping.template}" does not reference source field "${mapping.sourceField}"`);
    score -= 0.3;
  }
  
  // ✅ CHECK 4: Type compatibility (if schema available)
  const typeCompatibility = checkTypeCompatibility(
    mapping.sourceField,
    mapping.targetField,
    upstreamSchema,
    targetNodeType
  );
  if (!typeCompatibility.compatible) {
    reasons.push(...typeCompatibility.reasons);
    score -= 0.2;
  }
  
  // ✅ CHECK 5: Confidence threshold
  if (mapping.confidence < CONFIDENCE_THRESHOLDS.MINIMUM) {
    reasons.push(`Confidence ${mapping.confidence} is below minimum threshold ${CONFIDENCE_THRESHOLDS.MINIMUM}`);
    score = 0;
  } else if (mapping.confidence < CONFIDENCE_THRESHOLDS.LOW) {
    reasons.push(`Confidence ${mapping.confidence} is below low threshold ${CONFIDENCE_THRESHOLDS.LOW}`);
    score *= 0.5; // Penalize low confidence
  }
  
  // ✅ CHECK 6: Needs review flag
  if (mapping.needsReview) {
    reasons.push('Mapping marked as needs review');
    score *= 0.8; // Slight penalty for needs review
  }
  
  // Normalize score to 0-1
  score = Math.max(0, Math.min(1, score));
  
  // Determine if mapping is approved
  const ok = score >= CONFIDENCE_THRESHOLDS.MEDIUM && reasons.length === 0;
  
  return { ok, score, reasons };
}

/**
 * Validate all mappings in a template generation result
 */
export function validateMappings(
  mappings: TemplateMapping[],
  upstreamSchema: NodeOutputFields,
  targetNodeType: string
): ValidationResult {
  const approvedMappings: TemplateMapping[] = [];
  const rejectedMappings: TemplateMapping[] = [];
  const warnings: string[] = [];
  const allReasons: string[] = [];
  
  let totalScore = 0;
  let validCount = 0;
  
  for (const mapping of mappings) {
    const validation = validateMapping(mapping, upstreamSchema, targetNodeType);
    
    totalScore += validation.score;
    if (validation.score > 0) validCount++;
    
    if (validation.reasons.length > 0) {
      allReasons.push(...validation.reasons.map(r => `${mapping.targetField}: ${r}`));
    }
    
    if (validation.ok) {
      approvedMappings.push(mapping);
    } else {
      rejectedMappings.push(mapping);
      
      // Add warnings for medium-confidence rejections
      if (validation.score >= CONFIDENCE_THRESHOLDS.LOW && validation.score < CONFIDENCE_THRESHOLDS.MEDIUM) {
        warnings.push(
          `Mapping "${mapping.targetField}" → "${mapping.sourceField}" has medium confidence ` +
          `(${validation.score.toFixed(2)}) and was rejected. Consider manual review.`
        );
      }
    }
  }
  
  // Calculate overall score
  const overallScore = validCount > 0 ? totalScore / validCount : 0;
  
  // Determine overall validation result
  const ok = approvedMappings.length > 0 && 
             overallScore >= CONFIDENCE_THRESHOLDS.MEDIUM &&
             rejectedMappings.length === 0;
  
  return {
    ok,
    score: overallScore,
    reasons: allReasons,
    warnings,
    approvedMappings,
    rejectedMappings,
  };
}

/**
 * Check type compatibility between source and target fields
 */
function checkTypeCompatibility(
  sourceField: string,
  targetField: string,
  upstreamSchema: NodeOutputFields,
  targetNodeType: string
): { compatible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Get source field type from upstream schema
  const sourceType = upstreamSchema.outputSchema?.structure?.fields?.[sourceField];
  
  // Get target field type from target node schema
  const targetNodeSchema = require('../nodes/node-library').nodeLibrary.getSchema(targetNodeType);
  const targetFieldDef = targetNodeSchema?.configSchema?.required?.[targetField] ||
                        targetNodeSchema?.configSchema?.optional?.[targetField];
  const targetType = targetFieldDef?.type;
  
  // If types are available, check compatibility
  if (sourceType && targetType) {
    const compatible = areTypesCompatible(sourceType, targetType);
    if (!compatible) {
      reasons.push(
        `Type mismatch: source field "${sourceField}" is ${sourceType}, ` +
        `but target field "${targetField}" expects ${targetType}`
      );
    }
  }
  
  return {
    compatible: reasons.length === 0,
    reasons,
  };
}

/**
 * Check if two types are compatible
 */
function areTypesCompatible(sourceType: string, targetType: string): boolean {
  // Exact match
  if (sourceType === targetType) return true;
  
  // String can be converted to most types
  if (sourceType === 'string') {
    return ['text', 'email', 'url', 'textarea'].includes(targetType);
  }
  
  // Number can be converted to string
  if (sourceType === 'number' && targetType === 'string') return true;
  
  // Boolean can be converted to string
  if (sourceType === 'boolean' && targetType === 'string') return true;
  
  // Array can be converted to string (JSON stringify)
  if (sourceType === 'array' && targetType === 'string') return true;
  
  // Object can be converted to string (JSON stringify)
  if (sourceType === 'object' && targetType === 'string') return true;
  
  return false;
}

/**
 * Get confidence threshold for a given level
 */
export function getConfidenceThreshold(level: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMUM'): number {
  return CONFIDENCE_THRESHOLDS[level];
}
