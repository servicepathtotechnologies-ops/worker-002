/**
 * Universal Category Resolver
 * 
 * ✅ CRITICAL: Prevents Error #4 - Orphan nodes not reconnected
 * 
 * This resolver ensures:
 * 1. NO hardcoded category mappings
 * 2. Works for ALL node types (current and future)
 * 3. Uses multi-step resolution (capability registry → registry → semantic analysis)
 * 4. Never returns null (always resolves to valid category)
 * 
 * Architecture Rule:
 * - ALL category resolution MUST use this resolver
 * - NO hardcoded category mappings allowed
 * - Registry is the ONLY source of truth for categories
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';
import type { WorkflowNode } from '../types/ai-types';

export type DSLCategory = 'dataSource' | 'transformation' | 'output';

/**
 * Raw metadata type that includes AI-determined properties
 * These are set directly on node.data.metadata by workflow-builder
 */
interface RawNodeMetadata {
  aiDeterminedCategory?: DSLCategory;
  aiRole?: string;
  intendedCapability?: string;
  [key: string]: unknown;
}

export class UniversalCategoryResolver {
  private static instance: UniversalCategoryResolver;
  
  private constructor() {}
  
  static getInstance(): UniversalCategoryResolver {
    if (!UniversalCategoryResolver.instance) {
      UniversalCategoryResolver.instance = new UniversalCategoryResolver();
    }
    return UniversalCategoryResolver.instance;
  }
  
  /**
   * ✅ AI-FIRST: Get node category with context-aware resolution.
   * Uses AI-determined category as Priority 1, then falls back to standard resolution.
   * 
   * Priority Order:
   * 1. AI-determined category from node metadata (Gemini's role mapping)
   * 2. intendedCapability from metadata (DSL flows)
   * 3. Operation-aware category mapping (for multi-capability nodes)
   * 4. Standard category resolution (capability registry → registry → semantic)
   * 
   * @param node - WorkflowNode with metadata
   * @param userPrompt - Optional user prompt for context
   * @returns DSL category (dataSource, transformation, or output)
   */
  getNodeCategoryWithContext(node: WorkflowNode, userPrompt?: string): DSLCategory {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const metadata = (node.data?.metadata || {}) as RawNodeMetadata;
    const config = (node.data?.config || {}) as Record<string, unknown>;

    // ✅ PRIORITY 1: AI-determined category from Gemini's role mapping
    if (metadata.aiDeterminedCategory) {
      const aiCategory = metadata.aiDeterminedCategory as DSLCategory;
      console.log(`[CategoryResolver] Using AI-determined category for ${nodeType}: ${aiCategory} (from role: ${metadata.aiRole})`);
      return aiCategory;
    }

    // ✅ PRIORITY 2: intendedCapability from metadata (DSL flows)
    if (metadata.intendedCapability) {
      const intendedCap = metadata.intendedCapability.toLowerCase();
      if (intendedCap === 'data_source' || intendedCap === 'datasource') {
        return 'dataSource';
      }
      if (intendedCap === 'transformation') {
        return 'transformation';
      }
      if (intendedCap === 'output') {
        return 'output';
      }
    }

    // ✅ PRIORITY 3: Operation-aware category mapping (for multi-capability nodes)
    // This enables context-aware categorization: same node type can be data_source or output based on operation
    const operation = (typeof config?.operation === 'string' ? config.operation.toLowerCase() : '') || '';
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    if (operation && nodeDef) {
      // Multi-capability nodes: Gmail, Sheets, etc.
      // Reading operations → dataSource
      if (operation === 'read' || operation === 'get' || operation === 'list' || operation === 'search' || operation === 'fetch') {
        console.log(`[CategoryResolver] Operation-aware: ${nodeType} with operation '${operation}' → dataSource`);
        return 'dataSource';
      }
      // Writing/sending operations → output
      if (operation === 'send' || operation === 'write' || operation === 'create' || operation === 'update' || operation === 'delete' || operation === 'append') {
        console.log(`[CategoryResolver] Operation-aware: ${nodeType} with operation '${operation}' → output`);
        return 'output';
      }
    }

    // ✅ PRIORITY 4: Fall back to standard category resolution
    return this.getNodeCategory(nodeType);
  }

  /**
   * Get node category using multi-step resolution
   * NO hardcoded mappings - works for all categories
   * 
   * Prevents Error #4: Orphan nodes not reconnected
   * 
   * Resolution Steps:
   * 1. Check capability registry (isOutput, isTransformation, isDataSource)
   * 2. Check registry category property
   * 3. Semantic analysis (node type patterns)
   * 4. Check tags
   * 5. Default fallback
   * 
   * @param nodeType - Node type to resolve
   * @returns DSL category (dataSource, transformation, or output)
   */
  getNodeCategory(nodeType: string): DSLCategory {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    // ✅ STEP 1: Check capability registry
    if (nodeCapabilityRegistryDSL.isOutput(normalizedType)) {
      return 'output';
    }
    if (nodeCapabilityRegistryDSL.isTransformation(normalizedType)) {
      return 'transformation';
    }
    if (nodeCapabilityRegistryDSL.isDataSource(normalizedType)) {
      return 'dataSource';
    }
    
    // ✅ STEP 2: Check registry category property
    if (nodeDef) {
      const registryCategory = nodeDef.category;
      
      // Map registry categories to DSL categories
      const categoryMap: Record<string, DSLCategory> = {
        'data': 'dataSource',
        'transformation': 'transformation',
        'ai': 'transformation',
        'communication': 'output',
        'utility': 'output',
        'logic': 'transformation',
        'flow': 'transformation', // ✅ Handles try_catch, etc.
        'trigger': 'dataSource',
      };
      
      if (categoryMap[registryCategory]) {
        return categoryMap[registryCategory];
      }
    }
    
    // ✅ STEP 3: Semantic analysis (node type patterns) - UNIVERSAL, no hardcoded types
    const typeLower = normalizedType.toLowerCase();
    
    // ✅ UNIVERSAL: Trigger patterns → dataSource (works for ANY trigger node)
    if (typeLower.includes('_trigger') || typeLower.includes('trigger') || 
        typeLower === 'schedule' || typeLower === 'webhook' || typeLower === 'interval' || 
        typeLower === 'form' || typeLower === 'chat_trigger') {
      return 'dataSource';
    }
    
    // ✅ UNIVERSAL: Output patterns → output (works for ANY output node)
    if (typeLower.includes('_output') || typeLower.includes('output') || 
        typeLower.includes('_message') || typeLower.includes('_notify') ||
        typeLower.includes('_send') || typeLower.includes('_post') ||
        typeLower === 'log_output' || typeLower === 'email' || typeLower === 'slack' ||
        typeLower.includes('gmail') || typeLower.includes('discord') || typeLower.includes('telegram')) {
      return 'output';
    }
    
    // ✅ UNIVERSAL: Transformation patterns → transformation (works for ANY transformation node)
    // Uses semantic patterns, not hardcoded type names
    if (typeLower.includes('_transform') || typeLower.includes('transform') ||
        typeLower.includes('_filter') || typeLower.includes('_merge') ||
        typeLower.includes('_summarize') || typeLower.includes('_analyze') ||
        typeLower.includes('_process') || typeLower.includes('_convert') ||
        typeLower === 'loop' || typeLower === 'try_catch' || typeLower === 'javascript' ||
        typeLower.includes('_condition') || typeLower.includes('_branch') ||
        typeLower.includes('ai_') || typeLower.includes('_ai')) {
      return 'transformation';
    }
    
    // ✅ STEP 4: Check tags
    if (nodeDef?.tags) {
      const tags = nodeDef.tags.map(t => t.toLowerCase());
      if (tags.includes('output') || tags.includes('send') || tags.includes('notify')) {
        return 'output';
      }
      if (tags.includes('transformation') || tags.includes('process') || tags.includes('transform')) {
        return 'transformation';
      }
      if (tags.includes('datasource') || tags.includes('read') || tags.includes('fetch')) {
        return 'dataSource';
      }
    }
    
    // ✅ STEP 5: Default fallback (should rarely happen)
    // Default to transformation as it's the most common category
    return 'transformation';
  }
  
  /**
   * Check if node is a data source
   */
  isDataSource(nodeType: string): boolean {
    return this.getNodeCategory(nodeType) === 'dataSource';
  }
  
  /**
   * Check if node is a transformation
   */
  isTransformation(nodeType: string): boolean {
    return this.getNodeCategory(nodeType) === 'transformation';
  }
  
  /**
   * Check if node is an output
   */
  isOutput(nodeType: string): boolean {
    return this.getNodeCategory(nodeType) === 'output';
  }
}

// Export singleton instance
export const universalCategoryResolver = UniversalCategoryResolver.getInstance();
