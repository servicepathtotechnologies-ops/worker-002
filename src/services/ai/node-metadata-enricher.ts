/**
 * Node Metadata Enricher
 * 
 * Collects and enriches all node metadata from NodeLibrary.
 * Formats metadata for AI consumption in prompts.
 * 
 * This ensures all node information (keywords, capabilities, descriptions)
 * is available to AI at every stage for semantic matching.
 */

import { nodeLibrary } from '../nodes/node-library';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface NodeMetadata {
  type: string;                    // Canonical node type
  keywords: string[];              // All keywords/aliases
  capabilities: string[];          // What node can do
  description: string;             // Natural language description
  useCases: string[];              // Common use cases
  category: string;                // Node category
  semanticContext: string;         // Natural language context for AI
}

export class NodeMetadataEnricher {
  private cache: Map<string, NodeMetadata[]> | null = null;

  /**
   * Enrich all nodes with complete metadata
   * 
   * @returns Array of enriched node metadata
   */
  enrichAllNodes(): NodeMetadata[] {
    // Use cache if available
    if (this.cache) {
      return this.cache.get('all') || [];
    }

    const enriched: NodeMetadata[] = [];
    const registeredTypes = nodeLibrary.getRegisteredNodeTypes();

    for (const nodeType of registeredTypes) {
      const metadata = this.enrichNode(nodeType);
      if (metadata) {
        enriched.push(metadata);
      }
    }

    // Cache result
    if (!this.cache) {
      this.cache = new Map();
    }
    this.cache.set('all', enriched);

    return enriched;
  }

  /**
   * Get metadata for specific node type
   * 
   * @param nodeType - Canonical node type
   * @returns Node metadata or null if not found
   */
  getMetadataForType(nodeType: string): NodeMetadata | null {
    if (!nodeType) return null;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(nodeType);
      if (cached) return cached[0];
    }

    const metadata = this.enrichNode(nodeType);
    
    // Cache result
    if (metadata) {
      if (!this.cache) {
        this.cache = new Map();
      }
      this.cache.set(nodeType, [metadata]);
    }

    return metadata;
  }

  /**
   * Format node metadata for AI consumption
   * 
   * @param nodes - Array of node metadata
   * @returns Formatted string for AI prompts
   */
  formatForAI(nodes: NodeMetadata[]): string {
    if (!nodes || nodes.length === 0) {
      return 'No nodes available.';
    }

    const formatted = nodes.map((node, index) => {
      return `${index + 1}. ${node.type}
   Keywords: ${node.keywords.join(', ')}
   Capabilities: ${node.capabilities.join(', ')}
   Description: ${node.description}
   Use Cases: ${node.useCases.join(', ')}
   Category: ${node.category}`;
    }).join('\n\n');

    return `Available Nodes:\n\n${formatted}`;
  }

  /**
   * Format node metadata as JSON for AI
   * 
   * @param nodes - Array of node metadata
   * @returns JSON string
   */
  formatForAIAsJSON(nodes: NodeMetadata[]): string {
    return JSON.stringify(nodes, null, 2);
  }

  /**
   * Enrich a single node with metadata
   */
  private enrichNode(nodeType: string): NodeMetadata | null {
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) return null;

    // Get keywords from multiple sources
    const keywords = this.extractKeywords(schema, nodeType);
    
    // Get capabilities
    const capabilities = this.extractCapabilities(schema, nodeType);
    
    // Get description
    const description = schema.description || schema.label || `Node type: ${nodeType}`;
    
    // Get use cases
    const useCases = this.extractUseCases(schema);
    
    // Get category
    const category = schema.category || 'general';
    
    // Create semantic context
    const semanticContext = this.createSemanticContext(
      nodeType,
      keywords,
      capabilities,
      description,
      useCases
    );

    return {
      type: nodeType,
      keywords,
      capabilities,
      description,
      useCases,
      category,
      semanticContext
    };
  }

  /**
   * Extract keywords from schema
   */
  private extractKeywords(schema: any, nodeType: string): string[] {
    const keywords = new Set<string>();

    // Add canonical type
    keywords.add(nodeType.toLowerCase());

    // Add from schema.keywords
    if (schema.keywords && Array.isArray(schema.keywords)) {
      schema.keywords.forEach((k: string) => keywords.add(k.toLowerCase()));
    }

    // Add from aiSelectionCriteria.keywords
    if (schema.aiSelectionCriteria?.keywords && Array.isArray(schema.aiSelectionCriteria.keywords)) {
      schema.aiSelectionCriteria.keywords.forEach((k: string) => keywords.add(k.toLowerCase()));
    }

    // Add from capabilities registry
    const capabilityKeywords = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
    capabilityKeywords.forEach(k => keywords.add(k.toLowerCase()));

    // Add label if different
    if (schema.label) {
      const labelWords = schema.label.toLowerCase().split(/\s+/);
      labelWords.forEach((word: string) => {
        if (word.length > 2) { // Only meaningful words
          keywords.add(word);
        }
      });
    }

    // Add common aliases from node type name
    const typeWords = nodeType.toLowerCase().split(/[_\s-]+/);
    typeWords.forEach(word => {
      if (word.length > 2) {
        keywords.add(word);
      }
    });

    return Array.from(keywords);
  }

  /**
   * Extract capabilities from schema
   */
  private extractCapabilities(schema: any, nodeType: string): string[] {
    const capabilities = new Set<string>();

    // Get from capability registry
    const registryCaps = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
    registryCaps.forEach(cap => capabilities.add(cap.toLowerCase()));

    // Add from schema if available
    if (schema.capabilities && Array.isArray(schema.capabilities)) {
      schema.capabilities.forEach((cap: string) => capabilities.add(cap.toLowerCase()));
    }

    return Array.from(capabilities);
  }

  /**
   * Extract use cases from schema
   */
  private extractUseCases(schema: any): string[] {
    const useCases: string[] = [];

    // From aiSelectionCriteria.useCases
    if (schema.aiSelectionCriteria?.useCases && Array.isArray(schema.aiSelectionCriteria.useCases)) {
      schema.aiSelectionCriteria.useCases.forEach((uc: string) => useCases.push(uc));
    }

    // From commonPatterns
    if (schema.commonPatterns && Array.isArray(schema.commonPatterns)) {
      schema.commonPatterns.forEach((pattern: any) => {
        if (pattern.name) {
          useCases.push(pattern.name);
        }
      });
    }

    return useCases;
  }

  /**
   * Create semantic context string for AI
   */
  private createSemanticContext(
    nodeType: string,
    keywords: string[],
    capabilities: string[],
    description: string,
    useCases: string[]
  ): string {
    const parts: string[] = [];

    parts.push(`Node "${nodeType}" is used for: ${description}`);
    
    if (keywords.length > 0) {
      parts.push(`Keywords: ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? '...' : ''}`);
    }
    
    if (capabilities.length > 0) {
      parts.push(`Capabilities: ${capabilities.slice(0, 5).join(', ')}${capabilities.length > 5 ? '...' : ''}`);
    }
    
    if (useCases.length > 0) {
      parts.push(`Common use cases: ${useCases.slice(0, 3).join(', ')}${useCases.length > 3 ? '...' : ''}`);
    }

    return parts.join('. ');
  }

  /**
   * Clear cache (useful for testing or when node library updates)
   */
  clearCache(): void {
    this.cache = null;
  }
}

// Export singleton instance
export const nodeMetadataEnricher = new NodeMetadataEnricher();
