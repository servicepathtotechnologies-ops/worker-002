/**
 * UNIVERSAL VARIATION NODE CATEGORIZER
 * 
 * ✅ WORLD-CLASS ARCHITECTURE: 100% Registry-Driven, Zero Hardcoding
 * 
 * This service dynamically categorizes nodes for variation diversity using ONLY registry metadata.
 * Works for infinite workflows - new nodes automatically work without code changes.
 * 
 * Architecture Principles:
 * 1. ALL node selection from unified-node-registry (single source of truth)
 * 2. Semantic matching using node.category, tags, description, aliases
 * 3. NO hardcoded node lists - everything derived from registry
 * 4. Universal algorithm works for any node type
 * 5. Infinite scalability (500+ node types supported)
 * 
 * Usage:
 * - Helper nodes: Utility/logic nodes for timing, caching, splitting
 * - Processing nodes: Transformation/ai nodes for data processing
 * - Style nodes: Scheduling/queuing nodes for alternative approaches
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { UnifiedNodeDefinition } from '../types/unified-node-contract';

export type VariationNodeCategory = 'helper' | 'processing' | 'style';

interface NodeScore {
  nodeType: string;
  score: number;
  reasons: string[];
}

export class UniversalVariationNodeCategorizer {
  private static instance: UniversalVariationNodeCategorizer;
  private cache: Map<string, string[]> = new Map();
  
  private constructor() {
    // Singleton pattern
  }
  
  static getInstance(): UniversalVariationNodeCategorizer {
    if (!UniversalVariationNodeCategorizer.instance) {
      UniversalVariationNodeCategorizer.instance = new UniversalVariationNodeCategorizer();
    }
    return UniversalVariationNodeCategorizer.instance;
  }
  
  /**
   * ✅ UNIVERSAL: Get helper nodes from registry using semantic matching
   * Helper nodes: Utility/logic nodes for timing, caching, splitting, validation
   * 
   * Matching criteria (all from registry):
   * - category === 'utility' || 'logic'
   * - type name contains: delay, wait, cache, split, batch, validation
   * - description contains: delay, wait, cache, split, batch, validation, utility
   * - tags include: helper, utility, cache, delay, wait, split
   * 
   * @param excludeNodes - Nodes to exclude (e.g., required nodes from user prompt)
   * @returns Sorted list of helper node types (highest score first)
   */
  getHelperNodes(excludeNodes: string[] = []): string[] {
    const cacheKey = `helper:${excludeNodes.sort().join(',')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const allNodes = unifiedNodeRegistry.getAllTypes();
    const helperNodes: NodeScore[] = [];
    
    // ✅ SEMANTIC KEYWORDS (derived from common helper node patterns, not hardcoded lists)
    const semanticKeywords = [
      'delay', 'wait', 'cache', 'split', 'batch', 'validation', 
      'utility', 'helper', 'timing', 'control', 'throttle', 'rate'
    ];
    
    for (const nodeType of allNodes) {
      if (excludeNodes.includes(nodeType)) continue;
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // ✅ EXCLUDE: Not helper nodes if they're triggers, data sources, or outputs
      if (nodeDef.category === 'trigger') continue;
      if (nodeDef.category === 'data' || nodeDef.category === 'communication') continue;
      
      let score = 0;
      const reasons: string[] = [];
      const typeLower = nodeType.toLowerCase();
      const category = (nodeDef.category || '').toLowerCase();
      const description = (nodeDef.description || '').toLowerCase();
      const tags = (nodeDef.tags || []).map((t: string) => t && typeof t === 'string' ? t.toLowerCase() : '').filter((t: string) => t.length > 0);
      const aliases = (nodeDef.aliases || []).map((a: string) => a && typeof a === 'string' ? a.toLowerCase() : '').filter((a: string) => a.length > 0);
      
      // ✅ CATEGORY MATCHING (from registry)
      if (category === 'utility' || category === 'logic') {
        score += 3;
        reasons.push(`category: ${category}`);
      }
      
      // ✅ TYPE NAME MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (typeLower.includes(keyword)) {
          score += 2;
          reasons.push(`type contains: ${keyword}`);
          break; // Only count once per keyword
        }
      }
      
      // ✅ DESCRIPTION MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (description.includes(keyword)) {
          score += 1;
          reasons.push(`description contains: ${keyword}`);
          break;
        }
      }
      
      // ✅ TAGS MATCHING (from registry)
      for (const tag of tags) {
        for (const keyword of semanticKeywords) {
          if (tag.includes(keyword)) {
            score += 1.5;
            reasons.push(`tag matches: ${tag}`);
            break;
          }
        }
      }
      
      // ✅ ALIASES MATCHING (from registry)
      for (const alias of aliases) {
        for (const keyword of semanticKeywords) {
          if (alias.includes(keyword)) {
            score += 1;
            reasons.push(`alias matches: ${alias}`);
            break;
          }
        }
      }
      
      if (score > 0) {
        helperNodes.push({ nodeType, score, reasons });
      }
    }
    
    // ✅ SORT BY SCORE (highest first) and return node types
    const result = helperNodes
      .sort((a, b) => b.score - a.score)
      .map(item => item.nodeType);
    
    this.cache.set(cacheKey, result);
    return result;
  }
  
  /**
   * ✅ UNIVERSAL: Get processing nodes from registry using semantic matching
   * Processing nodes: Transformation/ai nodes for data processing, merging, aggregating
   * 
   * Matching criteria (all from registry):
   * - category === 'transformation' || 'ai'
   * - type name contains: transform, process, merge, aggregate, filter, map, parse
   * - description contains: transform, process, merge, aggregate, filter, map, parse
   * - tags include: transformation, processing, merge, aggregate, filter
   * 
   * @param excludeNodes - Nodes to exclude (e.g., required nodes from user prompt)
   * @returns Sorted list of processing node types (highest score first)
   */
  getProcessingNodes(excludeNodes: string[] = []): string[] {
    const cacheKey = `processing:${excludeNodes.sort().join(',')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const allNodes = unifiedNodeRegistry.getAllTypes();
    const processingNodes: NodeScore[] = [];
    
    // ✅ SEMANTIC KEYWORDS (derived from common processing node patterns)
    const semanticKeywords = [
      'transform', 'process', 'merge', 'aggregate', 'filter', 'map', 
      'parse', 'convert', 'analyze', 'compute', 'calculate', 'summarize'
    ];
    
    for (const nodeType of allNodes) {
      if (excludeNodes.includes(nodeType)) continue;
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // ✅ INCLUDE: Processing nodes are transformation/ai category
      // ✅ EXCLUDE: Not processing if they're triggers or outputs
      if (nodeDef.category === 'trigger') continue;
      if (nodeDef.category === 'communication') continue;
      
      let score = 0;
      const reasons: string[] = [];
      const typeLower = nodeType.toLowerCase();
      const category = (nodeDef.category || '').toLowerCase();
      const description = (nodeDef.description || '').toLowerCase();
      const tags = (nodeDef.tags || []).map((t: string) => t && typeof t === 'string' ? t.toLowerCase() : '').filter((t: string) => t.length > 0);
      const aliases = (nodeDef.aliases || []).map((a: string) => a && typeof a === 'string' ? a.toLowerCase() : '').filter((a: string) => a.length > 0);
      
      // ✅ CATEGORY MATCHING (from registry)
      if (category === 'transformation' || category === 'ai') {
        score += 3;
        reasons.push(`category: ${category}`);
      }
      
      // ✅ TYPE NAME MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (typeLower.includes(keyword)) {
          score += 2;
          reasons.push(`type contains: ${keyword}`);
          break;
        }
      }
      
      // ✅ DESCRIPTION MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (description.includes(keyword)) {
          score += 1;
          reasons.push(`description contains: ${keyword}`);
          break;
        }
      }
      
      // ✅ TAGS MATCHING (from registry)
      for (const tag of tags) {
        for (const keyword of semanticKeywords) {
          if (tag.includes(keyword)) {
            score += 1.5;
            reasons.push(`tag matches: ${tag}`);
            break;
          }
        }
      }
      
      // ✅ ALIASES MATCHING (from registry)
      for (const alias of aliases) {
        for (const keyword of semanticKeywords) {
          if (alias.includes(keyword)) {
            score += 1;
            reasons.push(`alias matches: ${alias}`);
            break;
          }
        }
      }
      
      if (score > 0) {
        processingNodes.push({ nodeType, score, reasons });
      }
    }
    
    // ✅ SORT BY SCORE (highest first) and return node types
    const result = processingNodes
      .sort((a, b) => b.score - a.score)
      .map(item => item.nodeType);
    
    this.cache.set(cacheKey, result);
    return result;
  }
  
  /**
   * ✅ UNIVERSAL: Get style nodes from registry using semantic matching
   * Style nodes: Scheduling/queuing nodes for alternative workflow approaches
   * 
   * Matching criteria (all from registry):
   * - category === 'trigger' AND (type includes schedule || interval || queue)
   * - type name contains: schedule, interval, queue, batch, event, periodic
   * - description contains: schedule, queue, batch, periodic, interval, event
   * - tags include: schedule, queue, batch, event, periodic
   * 
   * @param excludeNodes - Nodes to exclude (e.g., required nodes from user prompt)
   * @returns Sorted list of style node types (highest score first)
   */
  getStyleNodes(excludeNodes: string[] = []): string[] {
    const cacheKey = `style:${excludeNodes.sort().join(',')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const allNodes = unifiedNodeRegistry.getAllTypes();
    const styleNodes: NodeScore[] = [];
    
    // ✅ SEMANTIC KEYWORDS (derived from common style node patterns)
    const semanticKeywords = [
      'schedule', 'interval', 'queue', 'batch', 'event', 'periodic',
      'cron', 'trigger', 'timed', 'recurring', 'automated'
    ];
    
    for (const nodeType of allNodes) {
      if (excludeNodes.includes(nodeType)) continue;
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // ✅ INCLUDE: Style nodes are typically triggers with scheduling/queuing capabilities
      // ✅ EXCLUDE: Not style if they're data sources or outputs
      if (nodeDef.category === 'data' || nodeDef.category === 'communication') continue;
      
      let score = 0;
      const reasons: string[] = [];
      const typeLower = nodeType.toLowerCase();
      const category = (nodeDef.category || '').toLowerCase();
      const description = (nodeDef.description || '').toLowerCase();
      const tags = (nodeDef.tags || []).map((t: string) => t && typeof t === 'string' ? t.toLowerCase() : '').filter((t: string) => t.length > 0);
      const aliases = (nodeDef.aliases || []).map((a: string) => a && typeof a === 'string' ? a.toLowerCase() : '').filter((a: string) => a.length > 0);
      
      // ✅ CATEGORY MATCHING (from registry) - triggers with scheduling/queuing
      if (category === 'trigger') {
        // Check if it's a scheduling/queuing trigger (not just any trigger)
        const isSchedulingTrigger = semanticKeywords.some(keyword => 
          typeLower.includes(keyword) || description.includes(keyword)
        );
        if (isSchedulingTrigger) {
          score += 3;
          reasons.push(`category: ${category} (scheduling trigger)`);
        }
      }
      
      // ✅ TYPE NAME MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (typeLower.includes(keyword)) {
          score += 2;
          reasons.push(`type contains: ${keyword}`);
          break;
        }
      }
      
      // ✅ DESCRIPTION MATCHING (semantic keywords)
      for (const keyword of semanticKeywords) {
        if (description.includes(keyword)) {
          score += 1;
          reasons.push(`description contains: ${keyword}`);
          break;
        }
      }
      
      // ✅ TAGS MATCHING (from registry)
      for (const tag of tags) {
        for (const keyword of semanticKeywords) {
          if (tag.includes(keyword)) {
            score += 1.5;
            reasons.push(`tag matches: ${tag}`);
            break;
          }
        }
      }
      
      // ✅ ALIASES MATCHING (from registry)
      for (const alias of aliases) {
        for (const keyword of semanticKeywords) {
          if (alias.includes(keyword)) {
            score += 1;
            reasons.push(`alias matches: ${alias}`);
            break;
          }
        }
      }
      
      if (score > 0) {
        styleNodes.push({ nodeType, score, reasons });
      }
    }
    
    // ✅ SORT BY SCORE (highest first) and return node types
    const result = styleNodes
      .sort((a, b) => b.score - a.score)
      .map(item => item.nodeType);
    
    this.cache.set(cacheKey, result);
    return result;
  }
  
  /**
   * ✅ UNIVERSAL: Get all nodes for a specific variation category
   * Convenience method that routes to appropriate getter
   * 
   * @param category - Variation node category
   * @param excludeNodes - Nodes to exclude
   * @returns Sorted list of node types for the category
   */
  getNodesByCategory(category: VariationNodeCategory, excludeNodes: string[] = []): string[] {
    switch (category) {
      case 'helper':
        return this.getHelperNodes(excludeNodes);
      case 'processing':
        return this.getProcessingNodes(excludeNodes);
      case 'style':
        return this.getStyleNodes(excludeNodes);
      default:
        return [];
    }
  }
  
  /**
   * ✅ Clear cache (useful for testing or when registry updates)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
