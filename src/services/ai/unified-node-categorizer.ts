/**
 * Unified Node Categorizer
 * 
 * Provides consistent node categorization across all pipeline stages.
 * Uses capability-based categorization instead of checking category field.
 * 
 * This fixes the "No output nodes found" error by ensuring all stages
 * use the same categorization logic.
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface CategorizationResult {
  category: 'dataSource' | 'transformation' | 'output';
  confidence: number;
  reasoning: string;
}

export class UnifiedNodeCategorizer {
  /**
   * Categorize node type based on capabilities
   * 
   * @param nodeType - Canonical node type
   * @returns Categorization result
   */
  categorize(nodeType: string): CategorizationResult {
    if (!nodeType) {
      return {
        category: 'transformation',
        confidence: 0,
        reasoning: 'Invalid node type'
      };
    }

    // ✅ PHASE 1 FIX: Use unified-node-registry as single source of truth
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return {
        category: 'transformation',
        confidence: 0,
        reasoning: 'Node type not found in registry'
      };
    }

    // ✅ PHASE 1 FIX: Use registry category and tags instead of capabilities
    const category = nodeDef.category;
    const tags = nodeDef.tags || [];
    const tagsLower = tags.map(t => t.toLowerCase());

    // ✅ PHASE 1 FIX: Use registry category as primary source
    // Map registry categories to DSL categories
    // ✅ ROOT-LEVEL FIX: Added 'social' mapping (social media nodes are communication/output)
    const categoryMap: Record<string, 'dataSource' | 'transformation' | 'output'> = {
      'trigger': 'dataSource', // Triggers are data sources in DSL
      'data': 'dataSource',
      'transformation': 'transformation',
      'ai': 'transformation', // AI nodes are transformations
      'communication': 'output', // Communication nodes are outputs
      'social': 'output', // ✅ FIX: Social media nodes (linkedin, twitter, etc.) are outputs
      'utility': 'transformation', // Utility nodes are transformations
      'logic': 'transformation' // Logic nodes are transformations
    };

    // Priority 1: Use registry category
    if (category && categoryMap[category]) {
      return {
        category: categoryMap[category],
        confidence: 1.0,
        reasoning: `Using registry category: ${category}`
      };
    }

    // Priority 2: Check tags for hints
    if (tagsLower.includes('output') || tagsLower.includes('send') || tagsLower.includes('notify')) {
      return {
        category: 'output',
        confidence: 0.9,
        reasoning: `Node has output tags: ${tags.filter(t => ['output', 'send', 'notify'].includes(t.toLowerCase())).join(', ')}`
      };
    }

    if (tagsLower.includes('data_source') || tagsLower.includes('read') || tagsLower.includes('fetch')) {
      return {
        category: 'dataSource',
        confidence: 0.9,
        reasoning: `Node has data source tags: ${tags.filter(t => ['data_source', 'read', 'fetch'].includes(t.toLowerCase())).join(', ')}`
      };
    }

    if (tagsLower.includes('transformation') || tagsLower.includes('transform') || tagsLower.includes('process')) {
      return {
        category: 'transformation',
        confidence: 0.9,
        reasoning: `Node has transformation tags: ${tags.filter(t => ['transformation', 'transform', 'process'].includes(t.toLowerCase())).join(', ')}`
      };
    }

    // Default to transformation
    return {
      category: 'transformation',
      confidence: 0.5,
      reasoning: 'Default categorization (no clear category or tags match)'
    };
  }

  /**
   * Check if node is output type
   * 
   * @param nodeType - Canonical node type
   * @returns True if output node
   */
  isOutput(nodeType: string): boolean {
    const result = this.categorize(nodeType);
    return result.category === 'output';
  }

  /**
   * Check if node is data source type
   * 
   * @param nodeType - Canonical node type
   * @returns True if data source node
   */
  isDataSource(nodeType: string): boolean {
    const result = this.categorize(nodeType);
    return result.category === 'dataSource';
  }

  /**
   * Check if node is transformation type
   * 
   * @param nodeType - Canonical node type
   * @returns True if transformation node
   */
  isTransformation(nodeType: string): boolean {
    const result = this.categorize(nodeType);
    return result.category === 'transformation';
  }

  /**
   * ✅ FIX 1: Categorize node with operation context
   * This ensures consistent categorization when operation is available
   * 
   * @param nodeType - Canonical node type
   * @param operation - Operation being performed (read, write, transform, etc.)
   * @returns Categorization result
   */
  categorizeWithOperation(nodeType: string, operation: string): CategorizationResult {
    if (!nodeType) {
      return {
        category: 'transformation',
        confidence: 0,
        reasoning: 'Invalid node type'
      };
    }

    // Normalize operation
    const normalizedOperation = this.normalizeOperation(operation);
    // ✅ ROOT FIX: Comprehensive write operations list (includes post, put, patch, publish, share for social media, APIs, etc.)
    const isWriteOperation = ['write', 'create', 'update', 'append', 'send', 'notify', 'delete', 'remove', 'post', 'put', 'patch', 'publish', 'share', 'upload', 'submit'].includes(normalizedOperation);
    const isReadOperation = ['read', 'fetch', 'get', 'query', 'retrieve', 'pull', 'list', 'load', 'download'].includes(normalizedOperation);
    const isTransformOperation = ['transform', 'process', 'analyze', 'summarize', 'extract', 'parse', 'convert', 'format'].includes(normalizedOperation);

    // ✅ Priority 1: Operation-based categorization (operation reflects user intent)
    if (isWriteOperation) {
      return {
        category: 'output',
        confidence: 0.95,
        reasoning: `Operation "${operation}" indicates output/write operation`
      };
    }

    if (isTransformOperation) {
      return {
        category: 'transformation',
        confidence: 0.95,
        reasoning: `Operation "${operation}" indicates transformation operation`
      };
    }

    if (isReadOperation) {
      return {
        category: 'dataSource',
        confidence: 0.95,
        reasoning: `Operation "${operation}" indicates data source/read operation`
      };
    }

    // ✅ Priority 2: Fall back to capability-based categorization
    return this.categorize(nodeType);
  }

  /**
   * Normalize operation string
   */
  private normalizeOperation(operation: string): string {
    if (!operation) return '';
    return operation.toLowerCase().trim();
  }

  // ✅ PHASE 1 FIX: Removed capability-based methods
  // All categorization now uses unified-node-registry as single source of truth
}

// Export singleton instance
export const unifiedNodeCategorizer = new UnifiedNodeCategorizer();
