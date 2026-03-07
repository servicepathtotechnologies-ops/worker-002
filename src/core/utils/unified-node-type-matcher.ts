/**
 * UNIFIED NODE TYPE MATCHER
 * 
 * WORLD-CLASS ARCHITECTURE: Single source of truth for ALL node type matching
 * 
 * This is the UNIVERSAL service that ALL layers MUST use for:
 * - Node type comparison
 * - Requirement satisfaction checking
 * - Semantic equivalence validation
 * - Category-based matching
 * 
 * Architecture Principles:
 * 1. ✅ SINGLE SOURCE OF TRUTH: All matching logic centralized here
 * 2. ✅ SEMANTIC-AWARE: Uses SemanticNodeEquivalenceRegistry
 * 3. ✅ CATEGORY-AWARE: Falls back to category matching when needed
 * 4. ✅ OPERATION-AWARE: Context-sensitive matching (same node can match in one context, not another)
 * 5. ✅ EXTENSIBLE: Easy to add new matching strategies
 * 6. ✅ PRODUCTION-READY: Handles null/undefined gracefully
 * 7. ✅ PERFORMANCE: Cached lookups for high-scale usage
 * 
 * Usage Across All Layers:
 * - ✅ Validation Layers (GraphConnectivity, PreCompilation, etc.)
 * - ✅ Workflow Builders (ProductionWorkflowBuilder, DSLGenerator)
 * - ✅ Intent Engines (IntentConstraintEngine)
 * - ✅ Sanitizers (WorkflowGraphSanitizer)
 * - ✅ Optimizers (WorkflowOperationOptimizer)
 * - ✅ Auto-Repair Systems
 * 
 * This ensures:
 * - Consistent matching behavior across ALL stages
 * - No duplicate logic scattered across codebase
 * - Single point of maintenance for matching rules
 * - World-class scalability (millions/billions of workflows)
 */

import { semanticNodeEquivalenceRegistry } from '../registry/semantic-node-equivalence-registry';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';

/**
 * Matching context for operation-aware and category-aware matching
 */
export interface NodeTypeMatchingContext {
  /**
   * Operation being performed (e.g., 'summarize', 'create', 'send')
   * Used for operation-aware semantic equivalence
   */
  operation?: string;
  
  /**
   * Node category (e.g., 'ai', 'communication', 'data')
   * Used for category-based fallback matching
   */
  category?: string;
  
  /**
   * Whether to use strict matching (exact type only) or semantic matching
   * Default: false (uses semantic matching)
   */
  strict?: boolean;
}

/**
 * Matching result with detailed information
 */
export interface NodeTypeMatchResult {
  /**
   * Whether the types match
   */
  matches: boolean;
  
  /**
   * Match confidence (0-100)
   * - 100: Exact match
   * - 90: Semantic equivalence match
   * - 80: Category-based match
   * - 70: Partial/contains match
   */
  confidence: number;
  
  /**
   * Match reason for debugging/logging
   */
  reason: string;
  
  /**
   * Canonical type (if applicable)
   */
  canonicalType?: string;
}

/**
 * Unified Node Type Matcher
 * 
 * WORLD-CLASS SERVICE: Handles ALL node type matching across entire system
 */
export class UnifiedNodeTypeMatcher {
  private static instance: UnifiedNodeTypeMatcher;
  
  // Performance optimization: Cache for frequently accessed matches
  private matchCache: Map<string, NodeTypeMatchResult> = new Map();
  private cacheMaxSize = 10000; // Prevent memory bloat
  
  private constructor() {
    console.log('[UnifiedNodeTypeMatcher] 🏗️  Initializing Unified Node Type Matcher...');
    console.log('[UnifiedNodeTypeMatcher] ✅ Initialized - Ready for world-class matching');
  }
  
  static getInstance(): UnifiedNodeTypeMatcher {
    if (!UnifiedNodeTypeMatcher.instance) {
      UnifiedNodeTypeMatcher.instance = new UnifiedNodeTypeMatcher();
    }
    return UnifiedNodeTypeMatcher.instance;
  }
  
  /**
   * Check if two node types match (with semantic equivalence support)
   * 
   * ✅ PRODUCTION-READY: Handles null/undefined gracefully
   * ✅ SEMANTIC-AWARE: Uses semantic equivalence registry
   * ✅ CATEGORY-AWARE: Falls back to category matching
   * ✅ OPERATION-AWARE: Context-sensitive matching
   * 
   * @param type1 - First node type
   * @param type2 - Second node type
   * @param context - Matching context (operation, category, strict mode)
   * @returns Match result with confidence and reason
   */
  matches(
    type1: string,
    type2: string,
    context?: NodeTypeMatchingContext
  ): NodeTypeMatchResult {
    // ✅ PRODUCTION-READY: Validate inputs
    if (!type1 || !type2) {
      return {
        matches: false,
        confidence: 0,
        reason: 'One or both node types are missing',
      };
    }
    
    // Check cache first (performance optimization)
    const cacheKey = this.getCacheKey(type1, type2, context);
    const cached = this.matchCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    const normalized1 = unifiedNormalizeNodeTypeString(type1).toLowerCase();
    const normalized2 = unifiedNormalizeNodeTypeString(type2).toLowerCase();
    
    // ✅ STRICT MODE: Exact matching only (for legacy compatibility)
    if (context?.strict) {
      const exactMatch = normalized1 === normalized2;
      const result: NodeTypeMatchResult = {
        matches: exactMatch,
        confidence: exactMatch ? 100 : 0,
        reason: exactMatch ? 'Exact match (strict mode)' : 'No exact match (strict mode)',
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
    
    // ✅ STEP 1: Exact match (highest confidence)
    if (normalized1 === normalized2) {
      const result: NodeTypeMatchResult = {
        matches: true,
        confidence: 100,
        reason: 'Exact type match',
        canonicalType: normalized1,
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
    
    // ✅ STEP 2: Semantic equivalence check (most precise)
    const areSemanticallyEquivalent = semanticNodeEquivalenceRegistry.areEquivalent(
      normalized1,
      normalized2,
      context?.operation,
      context?.category
    );
    
    if (areSemanticallyEquivalent) {
      const canonical1 = semanticNodeEquivalenceRegistry.getCanonicalType(
        normalized1,
        context?.operation,
        context?.category
      );
      const result: NodeTypeMatchResult = {
        matches: true,
        confidence: 90,
        reason: `Semantic equivalence: ${normalized1} ≡ ${normalized2} (canonical: ${canonical1})`,
        canonicalType: canonical1,
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
    
    // ✅ STEP 3: Category-based matching (fallback for nodes not in semantic registry)
    const nodeDef1 = unifiedNodeRegistry.get(normalized1);
    const nodeDef2 = unifiedNodeRegistry.get(normalized2);
    
    if (nodeDef1 && nodeDef2) {
      const category1 = (nodeDef1.category || '').toLowerCase();
      const category2 = (nodeDef2.category || '').toLowerCase();
      
      if (category1 && category1 === category2) {
        const result: NodeTypeMatchResult = {
          matches: true,
          confidence: 80,
          reason: `Category-based match: both are '${category1}' category`,
          canonicalType: normalized1, // Prefer first as canonical
        };
        this.cacheResult(cacheKey, result);
        return result;
      }
    }
    
    // ✅ STEP 4: Partial/contains match (legacy compatibility)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const result: NodeTypeMatchResult = {
        matches: true,
        confidence: 70,
        reason: `Partial match: ${normalized1} contains ${normalized2} or vice versa`,
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
    
    // No match found
    const result: NodeTypeMatchResult = {
      matches: false,
      confidence: 0,
      reason: `No match: ${normalized1} ≠ ${normalized2} (not semantically equivalent, different categories)`,
    };
    this.cacheResult(cacheKey, result);
    return result;
  }
  
  /**
   * Check if a required node type is satisfied by any node in a list
   * 
   * ✅ PRODUCTION-READY: Used by validators, builders, sanitizers
   * 
   * @param requiredType - Required node type
   * @param availableTypes - List of available node types
   * @param context - Matching context
   * @returns Match result with best matching type
   */
  isRequirementSatisfied(
    requiredType: string,
    availableTypes: string[],
    context?: NodeTypeMatchingContext
  ): NodeTypeMatchResult & { matchingType?: string } {
    if (!requiredType || !Array.isArray(availableTypes) || availableTypes.length === 0) {
      return {
        matches: false,
        confidence: 0,
        reason: 'Required type or available types list is empty',
      };
    }
    
    let bestMatch: NodeTypeMatchResult & { matchingType?: string } | null = null;
    
    for (const availableType of availableTypes) {
      const match = this.matches(requiredType, availableType, context);
      
      if (match.matches) {
        // Prefer higher confidence matches
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = {
            ...match,
            matchingType: availableType,
          };
        }
      }
    }
    
    return bestMatch || {
      matches: false,
      confidence: 0,
      reason: `No matching type found in available types: ${availableTypes.join(', ')}`,
    };
  }
  
  /**
   * Find all matching types in a list for a given type
   * 
   * ✅ PRODUCTION-READY: Used by optimizers, sanitizers
   * 
   * @param targetType - Target node type to match
   * @param candidateTypes - List of candidate types
   * @param context - Matching context
   * @returns List of matching types with match results
   */
  findAllMatches(
    targetType: string,
    candidateTypes: string[],
    context?: NodeTypeMatchingContext
  ): Array<{ type: string; match: NodeTypeMatchResult }> {
    const matches: Array<{ type: string; match: NodeTypeMatchResult }> = [];
    
    for (const candidateType of candidateTypes) {
      const match = this.matches(targetType, candidateType, context);
      if (match.matches) {
        matches.push({ type: candidateType, match });
      }
    }
    
    // Sort by confidence (highest first)
    matches.sort((a, b) => b.match.confidence - a.match.confidence);
    
    return matches;
  }
  
  /**
   * Get canonical type for a node type
   * 
   * ✅ PRODUCTION-READY: Delegates to semantic equivalence registry
   * 
   * @param nodeType - Node type to get canonical for
   * @param context - Matching context
   * @returns Canonical type
   */
  getCanonicalType(
    nodeType: string,
    context?: NodeTypeMatchingContext
  ): string {
    return semanticNodeEquivalenceRegistry.getCanonicalType(
      nodeType,
      context?.operation,
      context?.category
    );
  }
  
  /**
   * Check if a node type is semantically equivalent to any in a list
   * 
   * ✅ PRODUCTION-READY: Used by auto-repair, injection systems
   * 
   * @param nodeType - Node type to check
   * @param existingTypes - List of existing types
   * @param context - Matching context
   * @returns Matching type if found, null otherwise
   */
  findSemanticDuplicate(
    nodeType: string,
    existingTypes: string[],
    context?: NodeTypeMatchingContext
  ): string | null {
    const duplicate = semanticNodeEquivalenceRegistry.findSemanticDuplicate(
      nodeType,
      existingTypes,
      context?.operation,
      context?.category
    );
    
    return duplicate || null;
  }
  
  /**
   * Clear match cache (for testing or memory management)
   */
  clearCache(): void {
    this.matchCache.clear();
    console.log('[UnifiedNodeTypeMatcher] 🧹 Cache cleared');
  }
  
  /**
   * Get cache statistics (for monitoring/debugging)
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.matchCache.size,
      maxSize: this.cacheMaxSize,
    };
  }
  
  // Private helper methods
  
  private getCacheKey(
    type1: string,
    type2: string,
    context?: NodeTypeMatchingContext
  ): string {
    const normalized1 = unifiedNormalizeNodeTypeString(type1).toLowerCase();
    const normalized2 = unifiedNormalizeNodeTypeString(type2).toLowerCase();
    const operation = context?.operation || '';
    const category = context?.category || '';
    const strict = context?.strict ? 'strict' : 'semantic';
    
    // Sort types for cache key (order-independent)
    const sorted = [normalized1, normalized2].sort().join('|');
    return `${sorted}:${operation}:${category}:${strict}`;
  }
  
  private cacheResult(key: string, result: NodeTypeMatchResult): void {
    // Prevent cache bloat
    if (this.matchCache.size >= this.cacheMaxSize) {
      // Remove oldest entries (simple FIFO)
      const firstKey = this.matchCache.keys().next().value;
      if (firstKey) {
        this.matchCache.delete(firstKey);
      }
    }
    
    this.matchCache.set(key, result);
  }
}

// Export singleton instance
export const unifiedNodeTypeMatcher = UnifiedNodeTypeMatcher.getInstance();

// Export convenience functions for common use cases
export function matchesNodeType(
  type1: string,
  type2: string,
  context?: NodeTypeMatchingContext
): boolean {
  return unifiedNodeTypeMatcher.matches(type1, type2, context).matches;
}

export function isRequirementSatisfiedBy(
  requiredType: string,
  availableTypes: string[],
  context?: NodeTypeMatchingContext
): boolean {
  return unifiedNodeTypeMatcher.isRequirementSatisfied(requiredType, availableTypes, context).matches;
}
