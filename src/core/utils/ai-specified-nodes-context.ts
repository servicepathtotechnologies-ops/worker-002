/**
 * AI-Specified Nodes Context
 * 
 * Universal context for tracking AI-specified nodes from StructuredIntent.
 * This ensures all injection layers respect AI's intent and don't add duplicate nodes.
 * 
 * SINGLE SOURCE OF TRUTH: AI-specified nodes from StructuredIntent take precedence
 * over keyword detection, HTTP enforcement, and other heuristic-based injection.
 */

import { StructuredIntent } from '../../services/ai/intent-structurer';
import { IntentConstraintEngine } from '../../services/ai/intent-constraint-engine';
import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';
import { resolveNodeType } from './node-type-resolver-util';

/**
 * AI-Specified Nodes Context
 * Tracks which nodes were explicitly specified by AI in StructuredIntent
 * 
 * ✅ FIXED: Removed structuredIntent to prevent circular reference
 * Only stores node types (Set<string>) which is all that's needed
 */
export interface AISpecifiedNodesContext {
  /**
   * Set of AI-specified node types (canonical forms)
   * These are the nodes that AI explicitly included in StructuredIntent
   */
  aiSpecifiedNodeTypes: Set<string>;
  
  /**
   * Original prompt (for reference)
   */
  originalPrompt?: string;
}

/**
 * Create AI-Specified Nodes Context from StructuredIntent
 * 
 * This extracts the authoritative list of nodes that AI specified,
 * which should be respected by all injection layers.
 * 
 * @param structuredIntent - StructuredIntent from AI
 * @param originalPrompt - Original user prompt (optional, for transformation detection)
 * @returns AI-Specified Nodes Context
 */
export function createAISpecifiedNodesContext(
  structuredIntent: StructuredIntent,
  originalPrompt?: string
): AISpecifiedNodesContext {
  // ✅ SINGLE SOURCE OF TRUTH: Extract required nodes from StructuredIntent
  // This uses IntentConstraintEngine which is the authoritative source for AI-specified nodes
  const aiSpecifiedNodes = IntentConstraintEngine.getRequiredNodes(structuredIntent, originalPrompt);
  
  // Normalize all node types to canonical forms
  const normalizedNodeTypes = new Set<string>();
  for (const nodeType of aiSpecifiedNodes) {
    const normalized = unifiedNormalizeNodeTypeString(nodeType);
    // Also resolve aliases to canonical form (e.g., "gmail" → "google_gmail")
    const canonical = resolveNodeType(normalized, false);
    normalizedNodeTypes.add(canonical);
  }
  
  console.log(`[AISpecifiedNodesContext] ✅ Created context with ${normalizedNodeTypes.size} AI-specified node(s): ${Array.from(normalizedNodeTypes).join(', ')}`);
  
  // ✅ FIXED: Don't store structuredIntent to prevent circular reference
  // Only store node types and original prompt - that's all we need
  return {
    aiSpecifiedNodeTypes: normalizedNodeTypes,
    originalPrompt,
  };
}

/**
 * Check if a node type is already specified by AI
 * 
 * @param context - AI-Specified Nodes Context
 * @param nodeType - Node type to check (will be normalized)
 * @returns true if node is already specified by AI
 */
export function isNodeAISpecified(
  context: AISpecifiedNodesContext,
  nodeType: string
): boolean {
  const normalized = unifiedNormalizeNodeTypeString(nodeType);
  const canonical = resolveNodeType(normalized, false);
  
  const isSpecified = context.aiSpecifiedNodeTypes.has(canonical);
  
  if (isSpecified) {
    console.log(`[AISpecifiedNodesContext] ✅ Node "${nodeType}" (canonical: ${canonical}) is already specified by AI - skipping injection`);
  }
  
  return isSpecified;
}

/**
 * Filter out nodes that are already specified by AI
 * 
 * @param context - AI-Specified Nodes Context
 * @param nodeTypes - Array of node types to filter
 * @returns Array of node types NOT already specified by AI
 */
export function filterAISpecifiedNodes(
  context: AISpecifiedNodesContext,
  nodeTypes: string[]
): string[] {
  return nodeTypes.filter(nodeType => !isNodeAISpecified(context, nodeType));
}

/**
 * Check if any of the provided node types are already specified by AI
 * 
 * @param context - AI-Specified Nodes Context
 * @param nodeTypes - Array of node types to check
 * @returns true if ANY node is already specified by AI
 */
export function hasAnyAISpecifiedNode(
  context: AISpecifiedNodesContext,
  nodeTypes: string[]
): boolean {
  return nodeTypes.some(nodeType => isNodeAISpecified(context, nodeType));
}
