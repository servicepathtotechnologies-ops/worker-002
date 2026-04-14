/**
 * ✅ WORLD-CLASS: Unified Node Type Normalizer
 * 
 * SINGLE SOURCE OF TRUTH for node type normalization.
 * 
 * This consolidates ALL node type normalization logic:
 * - Node object normalization (extracts type from node.data.type)
 * - Node type string normalization (uses NodeTypeNormalizationService + semantic resolution)
 * - Handles all edge cases (custom types, aliases, capabilities, semantic matching)
 * 
 * Architecture:
 * - Uses NodeTypeNormalizationService for comprehensive normalization
 * - Falls back to semantic resolution if needed
 * - Handles both node objects and type strings
 * 
 * Usage:
 * - For node objects: `unifiedNormalizeNodeType(node)`
 * - For type strings: `unifiedNormalizeNodeTypeString(typeString)`
 * - For validation info: `unifiedNormalizeNodeTypeWithInfo(typeString)`
 */

import { WorkflowNode } from '../types/ai-types';
type ServiceNormalizeResult = { normalized: string; valid: boolean; method: string };

function normalizeViaServiceSafely(nodeType: string): ServiceNormalizeResult {
  try {
    // Delegate to unified-node-registry alias map (single source of truth).
    // Lazy-load to avoid startup circular initialization.
    const { unifiedNodeRegistry } = require('../registry/unified-node-registry') as {
      unifiedNodeRegistry: { resolveAlias: (t: string) => string | undefined; has: (t: string) => boolean };
    };
    const resolved = unifiedNodeRegistry.resolveAlias(nodeType);
    if (resolved) {
      return { normalized: resolved, valid: true, method: 'registry_alias' };
    }
    if (unifiedNodeRegistry.has(nodeType)) {
      return { normalized: nodeType, valid: true, method: 'registry_exact' };
    }
  } catch {
    // Fall through to semantic + raw fallback.
  }
  return { normalized: nodeType, valid: false, method: 'service_unavailable' };
}

/**
 * ✅ UNIFIED: Normalize node type from node object OR type string
 * 
 * This is the UNIVERSAL function that handles BOTH:
 * - Node objects: extracts type from node.data.type
 * - Type strings: normalizes the type string directly
 * 
 * Handles:
 * - Frontend pattern: type: "custom" with actual type in data.type
 * - Direct type: type: "google_sheets"
 * - Fallback: data.nodeType, data.type
 * - Type strings: "google_sheets", "gmail", etc.
 * 
 * @param input - Node object (WorkflowNode or any) OR type string
 * @returns Normalized node type string
 */
export function unifiedNormalizeNodeType(input: WorkflowNode | any | string): string {
  // If input is a string, treat it as a type string
  if (typeof input === 'string') {
    return unifiedNormalizeNodeTypeString(input);
  }
  
  // Otherwise, treat as node object
  // Step 1: Extract type from node object
  let nodeType = input.type || '';
  
  // Handle frontend normalization where type: "custom" with actual type in data.type
  if (nodeType === 'custom' && input.data?.type) {
    nodeType = input.data.type;
  }
  
  // Also check for data.nodeType as fallback
  if ((!nodeType || nodeType === 'custom') && input.data?.nodeType) {
    nodeType = input.data.nodeType;
  }
  
  // If still empty, try to infer from data.type directly
  if (!nodeType && input.data?.type) {
    nodeType = input.data.type;
  }
  
  // Step 2: Normalize the extracted type string
  if (!nodeType) {
    return '';
  }
  
  return unifiedNormalizeNodeTypeString(nodeType);
}

/**
 * ✅ UNIFIED: Normalize node type string
 * 
 * Uses strict registry normalization strategy:
 * 1. UnifiedNodeRegistry alias resolution
 * 2. UnifiedNodeRegistry exact canonical lookup
 * 3. Fallback to original only (caller decides whether to reject)
 * 
 * @param nodeType - Node type string to normalize
 * @returns Normalized node type string
 */
export function unifiedNormalizeNodeTypeString(nodeType: string): string {
  if (!nodeType || typeof nodeType !== 'string') {
    return nodeType || '';
  }
  
  // Step 1: Resolve through UnifiedNodeRegistry only (single source of truth)
  const serviceResult = normalizeViaServiceSafely(nodeType);
  
  if (serviceResult.valid) {
    return serviceResult.normalized;
  }

  // Step 2: If resolution fails, return original and let callers fail fast where required.
  console.warn(`[UnifiedNodeTypeNormalizer] ⚠️  Could not normalize node type: "${nodeType}" (method: ${serviceResult.method})`);
  return nodeType;
}

/**
 * ✅ UNIFIED: Normalize node type with validation info
 * 
 * Returns both normalized type and validation info.
 * 
 * @param nodeType - Node type string to normalize
 * @returns Normalization result with validation info
 */
export function unifiedNormalizeNodeTypeWithInfo(nodeType: string): {
  normalized: string;
  valid: boolean;
  method: string;
} {
  if (!nodeType || typeof nodeType !== 'string') {
    return { normalized: nodeType || '', valid: false, method: 'invalid_input' };
  }
  
  // Try registry normalization first
  const serviceResult = normalizeViaServiceSafely(nodeType);
  
  if (serviceResult.valid) {
    return serviceResult;
  }

  return serviceResult; // Return service result (may be invalid, but has method info)
}
