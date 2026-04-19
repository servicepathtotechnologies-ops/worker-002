/**
 * Keyword Node Selector
 * 
 * ✅ PHASE 3: Keyword-based node selection using registry
 * 
 * This selector:
 * - Maps keywords to node types using registry
 * - Uses node labels, tags, and keywords for matching
 * - Works for ALL node types (universal)
 * - No hardcoded keyword mappings
 * 
 * Architecture Rule:
 * - Uses registry as single source of truth
 * - Keywords come from node labels, tags, and AI selection criteria
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface NodeSelectionResult {
  nodeType: string;
  confidence: number; // 0-1, how well this node matches
  reason: string;
}

export class KeywordNodeSelector {
  private static instance: KeywordNodeSelector;
  
  private constructor() {}
  
  static getInstance(): KeywordNodeSelector {
    if (!KeywordNodeSelector.instance) {
      KeywordNodeSelector.instance = new KeywordNodeSelector();
    }
    return KeywordNodeSelector.instance;
  }
  
  /**
   * Select node type based on keyword
   * 
   * @param keyword - Keyword to search for
   * @param category - Optional category filter
   * @returns Array of matching node types with confidence scores
   */
  selectNodes(
    keyword: string,
    category?: 'dataSource' | 'transformation' | 'output'
  ): NodeSelectionResult[] {
    const keywordLower = keyword.toLowerCase();
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const results: NodeSelectionResult[] = [];
    
    // ✅ UNIVERSAL: Search all nodes in registry
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Filter by category if specified
      if (category) {
        const isCorrectCategory = 
          (category === 'dataSource' && nodeCapabilityRegistryDSL.isDataSource(nodeType)) ||
          (category === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(nodeType)) ||
          (category === 'output' && nodeCapabilityRegistryDSL.isOutput(nodeType));
        
        if (!isCorrectCategory) continue;
      }
      
      // Calculate match score
      const match = this.calculateMatchScore(keywordLower, nodeType, nodeDef);
      
      if (match.confidence > 0) {
        results.push({
          nodeType,
          confidence: match.confidence,
          reason: match.reason,
        });
      }
    }
    
    // Sort by confidence (highest first)
    return results.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Calculate match score for keyword against node
   */
  private calculateMatchScore(
    keyword: string,
    nodeType: string,
    nodeDef: any
  ): { confidence: number; reason: string } {
    let score = 0;
    let maxScore = 0;
    const reasons: string[] = [];
    
    // ✅ MATCH 1: Node label (highest weight)
    const label = nodeDef.label || nodeType;
    const labelLower = label.toLowerCase();
    maxScore += 2;
    if (labelLower === keyword) {
      score += 2;
      reasons.push('Exact label match');
    } else if (labelLower.includes(keyword) || keyword.includes(labelLower)) {
      score += 1.5;
      reasons.push('Partial label match');
    }
    
    // ✅ MATCH 2: Node type
    const typeLower = nodeType.toLowerCase();
    maxScore += 1;
    if (typeLower === keyword) {
      score += 1;
      reasons.push('Exact type match');
    } else if (typeLower.includes(keyword) || keyword.includes(typeLower)) {
      score += 0.5;
      reasons.push('Partial type match');
    }
    
    // ✅ MATCH 3: Tags (from registry)
    if (nodeDef.tags && nodeDef.tags.length > 0) {
      maxScore += 1;
      const matchingTags = nodeDef.tags.filter((tag: string) => 
        tag.toLowerCase() === keyword || 
        tag.toLowerCase().includes(keyword) ||
        keyword.includes(tag.toLowerCase())
      );
      if (matchingTags.length > 0) {
        score += Math.min(1, matchingTags.length / nodeDef.tags.length);
        reasons.push(`Matched ${matchingTags.length} tag(s)`);
      }
    }
    
    // ✅ MATCH 4: AI selection criteria keywords (from registry)
    if (nodeDef.aiSelectionCriteria && nodeDef.aiSelectionCriteria.keywords) {
      maxScore += 1;
      const matchingKeywords = nodeDef.aiSelectionCriteria.keywords.filter((kw: string) => 
        kw.toLowerCase() === keyword || 
        kw.toLowerCase().includes(keyword) ||
        keyword.includes(kw.toLowerCase())
      );
      if (matchingKeywords.length > 0) {
        score += Math.min(1, matchingKeywords.length / nodeDef.aiSelectionCriteria.keywords.length);
        reasons.push(`Matched ${matchingKeywords.length} AI keyword(s)`);
      }
    }
    
    // ✅ MATCH 5: Description (semantic match)
    if (nodeDef.description) {
      maxScore += 0.5;
      const descLower = nodeDef.description.toLowerCase();
      if (descLower.includes(keyword)) {
        score += 0.5;
        reasons.push('Description match');
      }
    }
    
    const confidence = maxScore > 0 ? score / maxScore : 0;
    
    return {
      confidence,
      reason: reasons.join(', ') || 'No match',
    };
  }
  
  /**
   * Select best matching node for keyword
   */
  selectBestNode(
    keyword: string,
    category?: 'dataSource' | 'transformation' | 'output'
  ): NodeSelectionResult | null {
    const results = this.selectNodes(keyword, category);
    return results.length > 0 && results[0].confidence >= 0.3 ? results[0] : null;
  }
  
  /**
   * Select multiple nodes for multiple keywords
   */
  selectNodesForKeywords(
    keywords: string[],
    category?: 'dataSource' | 'transformation' | 'output'
  ): Map<string, NodeSelectionResult | null> {
    const results = new Map<string, NodeSelectionResult | null>();
    
    for (const keyword of keywords) {
      const bestMatch = this.selectBestNode(keyword, category);
      results.set(keyword, bestMatch);
    }
    
    return results;
  }
}

// Export singleton instance
export const keywordNodeSelector = KeywordNodeSelector.getInstance();
