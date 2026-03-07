/**
 * Unified Node Type Format
 * 
 * Defines the canonical format for node types across all stages.
 * Ensures consistency and preserves semantic resolution metadata.
 * 
 * This is the single source of truth for node type representation.
 */

import { NodeResolution } from '../../services/ai/semantic-node-resolver';

/**
 * Unified node type format used across all pipeline stages
 */
export interface UnifiedNodeType {
  // Canonical type (always consistent)
  type: string;
  
  // Semantic resolution metadata
  resolution: {
    originalInput: string;
    confidence: number;
    matchedKeywords: string[];
    matchedCapabilities: string[];
    reasoning?: string;
  };
  
  // Validation
  isValid: boolean;
  validatedAt: Date;
}

/**
 * Convert node resolution to unified format
 * 
 * @param resolution - Node resolution from semantic resolver
 * @returns Unified node type format
 */
export function toUnifiedType(resolution: NodeResolution): UnifiedNodeType {
  return {
    type: resolution.type,
    resolution: {
      originalInput: resolution.semanticMatch.matchedKeywords.join(' ') || resolution.type,
      confidence: resolution.confidence,
      matchedKeywords: resolution.semanticMatch.matchedKeywords,
      matchedCapabilities: resolution.semanticMatch.matchedCapabilities,
      reasoning: resolution.semanticMatch.reasoning
    },
    isValid: resolution.confidence >= 0.7,
    validatedAt: new Date()
  };
}

/**
 * Create unified type from canonical type (for backward compatibility)
 * 
 * @param type - Canonical node type
 * @returns Unified node type format
 */
export function createUnifiedTypeFromCanonical(type: string): UnifiedNodeType {
  return {
    type,
    resolution: {
      originalInput: type,
      confidence: 1.0,
      matchedKeywords: [type],
      matchedCapabilities: [],
      reasoning: 'Canonical type match'
    },
    isValid: true,
    validatedAt: new Date()
  };
}

/**
 * Extract canonical type from unified format
 * 
 * @param unified - Unified node type
 * @returns Canonical node type string
 */
export function getCanonicalType(unified: UnifiedNodeType): string {
  return unified.type;
}

/**
 * Check if unified type is valid
 * 
 * @param unified - Unified node type
 * @returns True if valid
 */
export function isValid(unified: UnifiedNodeType): boolean {
  return unified.isValid && unified.resolution.confidence >= 0.7;
}

/**
 * Get confidence score from unified type
 * 
 * @param unified - Unified node type
 * @returns Confidence score (0.0 - 1.0)
 */
export function getConfidence(unified: UnifiedNodeType): number {
  return unified.resolution.confidence;
}

/**
 * Get reasoning from unified type
 * 
 * @param unified - Unified node type
 * @returns Reasoning string or undefined
 */
export function getReasoning(unified: UnifiedNodeType): string | undefined {
  return unified.resolution.reasoning;
}
