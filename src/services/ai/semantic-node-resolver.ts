/**
 * AI-Powered Node Type Resolver
 * 
 * Resolves semantic intent to node types using AI.
 * Matches user intent to available nodes based on semantic understanding,
 * not pattern matching.
 * 
 * This is the core component that replaces pattern matching with
 * semantic AI-powered resolution.
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { SemanticIntent } from './semantic-intent-analyzer';
import { NodeMetadata } from './node-metadata-enricher';
import { ResolutionLearningCache } from './resolution-learning-cache';

export interface NodeResolution {
  type: string;                    // Canonical node type
  confidence: number;               // 0.0 - 1.0
  semanticMatch: {
    matchedKeywords: string[];      // Keywords that matched
    matchedCapabilities: string[];  // Capabilities that matched
    reasoning: string;              // AI's reasoning
  };
  alternatives?: NodeResolution[];  // Other possible matches
}

export class SemanticNodeResolver {
  private cache: ResolutionLearningCache;

  constructor() {
    this.cache = new ResolutionLearningCache();
  }

  /**
   * Resolve semantic intent to node type
   * 
   * @param intent - Semantic intent from analyzer
   * @param nodeMetadata - All available node metadata
   * @returns Node resolution with confidence
   */
  async resolve(
    intent: SemanticIntent,
    nodeMetadata: NodeMetadata[]
  ): Promise<NodeResolution> {
    // Check cache first
    const cacheKey = this.createCacheKey(intent);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.confidence > 0.8) {
      return {
        type: cached.resolvedType,
        confidence: cached.confidence,
        semanticMatch: {
          matchedKeywords: intent.semanticKeywords,
          matchedCapabilities: [],
          reasoning: 'Cached resolution'
        }
      };
    }

    // Format node metadata for AI
    const formattedMetadata = this.formatMetadataForAI(nodeMetadata);
    
    // Create AI prompt
    const systemPrompt = this.createResolutionPrompt(formattedMetadata);
    const userPrompt = this.formatIntentForAI(intent);

    try {
      const content = await ollamaOrchestrator.processRequest(
        'workflow-analysis',
        {
          system: systemPrompt,
          message: userPrompt
        },
        {
          temperature: 0,
          max_tokens: 2000
        }
      );
      const resolution = this.parseAIResponse(content, nodeMetadata);
      
      // Cache successful resolution
      if (resolution.confidence > 0.7) {
        this.cache.store({
          input: cacheKey,
          resolvedType: resolution.type,
          confidence: resolution.confidence,
          success: true,
          timestamp: new Date(),
          usageCount: 1
        });
      }

      return resolution;
    } catch (error) {
      console.error('[SemanticNodeResolver] Error resolving node type:', error);
      // Fallback to keyword matching
      return this.fallbackResolution(intent, nodeMetadata);
    }
  }

  /**
   * Resolve user input directly with context
   * 
   * @param userInput - User's natural language input
   * @param context - Optional context from previous stages
   * @returns Node resolution with confidence
   */
  async resolveWithContext(
    userInput: string,
    context?: any
  ): Promise<NodeResolution> {
    // Check cache first
    const cached = this.cache.get(userInput.toLowerCase().trim());
    if (cached && cached.confidence > 0.8) {
      return {
        type: cached.resolvedType,
        confidence: cached.confidence,
        semanticMatch: {
          matchedKeywords: [userInput],
          matchedCapabilities: [],
          reasoning: 'Cached resolution'
        }
      };
    }

    // For direct input, we need to analyze intent first
    // This is a simplified version - in production, use SemanticIntentAnalyzer
    const nodeMetadata = context?.nodeMetadata || [];
    return this.fallbackResolutionFromInput(userInput, nodeMetadata);
  }

  /**
   * Batch resolve multiple inputs
   * 
   * @param inputs - Array of user inputs
   * @returns Array of resolutions
   */
  async resolveBatch(inputs: string[]): Promise<NodeResolution[]> {
    const resolutions = await Promise.all(
      inputs.map(input => this.resolveWithContext(input))
    );
    return resolutions;
  }

  /**
   * Create resolution prompt for AI
   */
  private createResolutionPrompt(formattedMetadata: string): string {
    return `You are a node type resolver. Your job is to match user intent to the best available node type using semantic understanding.

Available Nodes:
${formattedMetadata}

Each node has:
- type: Canonical node type name
- keywords: All possible keywords/aliases (e.g., ["linkedin", "li", "linked_in", "post", "publish"])
- capabilities: What the node can do (e.g., ["send_post", "output", "social_media"])
- description: Natural language description
- useCases: Common use cases

Your Task:
1. Understand what the user wants to do semantically
2. Find the best matching node based on:
   - Semantic similarity (not exact string match)
   - Keyword relevance (user words match node keywords)
   - Capability alignment (node can do what user wants)
   - Use case match (node is used for this purpose)
3. Consider variations:
   - "post on linkedin" = "post_to_linkedin" = "linkedin_post" = "publish to linkedin"
   - All should resolve to node type "linkedin"
4. Provide confidence score (0.0 - 1.0)
5. Explain your reasoning

Important Rules:
- Use SEMANTIC understanding, not pattern matching
- Handle variations automatically (spaces, dashes, prepositions)
- Match based on meaning, not exact words
- If user says "post on linkedin", match to "linkedin" node (keywords include "post" and "linkedin")

Output Format (JSON only, no markdown):
{
  "type": "canonical_node_type",
  "confidence": 0.95,
  "semanticMatch": {
    "matchedKeywords": ["keyword1", "keyword2"],
    "matchedCapabilities": ["capability1"],
    "reasoning": "User wants to publish to LinkedIn. Node 'linkedin' has keywords 'post', 'publish', 'linkedin' and capability 'send_post', which semantically matches the intent."
  },
  "alternatives": [
    {
      "type": "alternative_type",
      "confidence": 0.60,
      "reasoning": "..."
    }
  ]
}`;
  }

  /**
   * Format intent for AI
   */
  private formatIntentForAI(intent: SemanticIntent): string {
    return `User Intent:
- Actions: ${intent.actions.join(', ')}
- Targets: ${intent.targets.join(', ')}
- Categories: ${intent.categories.join(', ')}
- Primary Intent: ${intent.primaryIntent}
- Keywords: ${intent.semanticKeywords.join(', ')}
- Context: ${intent.context.domain} / ${intent.context.operation}${intent.context.platform ? ` / ${intent.context.platform}` : ''}

Match this intent to the best available node type.`;
  }

  /**
   * Format metadata for AI
   */
  private formatMetadataForAI(metadata: NodeMetadata[]): string {
    return metadata.map((node, index) => {
      return `${index + 1}. ${node.type}
   Keywords: ${node.keywords.slice(0, 15).join(', ')}${node.keywords.length > 15 ? '...' : ''}
   Capabilities: ${node.capabilities.slice(0, 10).join(', ')}${node.capabilities.length > 10 ? '...' : ''}
   Description: ${node.description}
   Use Cases: ${node.useCases.slice(0, 3).join(', ')}${node.useCases.length > 3 ? '...' : ''}
   Category: ${node.category}`;
    }).join('\n\n');
  }

  /**
   * Parse AI response into NodeResolution
   */
  private parseAIResponse(content: string, nodeMetadata: NodeMetadata[]): NodeResolution {
    try {
      // Extract JSON from response
      let jsonStr = content.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```')) {
        const lines = jsonStr.split('\n');
        jsonStr = lines.slice(1, -1).join('\n').trim();
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.slice(0, -3).trim();
        }
      }

      // Remove language identifier
      if (jsonStr.startsWith('json')) {
        jsonStr = jsonStr.slice(4).trim();
      }

      const parsed = JSON.parse(jsonStr);

      // Validate node type exists
      const nodeType = parsed.type;
      const metadata = nodeMetadata.find(m => m.type === nodeType);
      
      if (!metadata) {
        console.warn(`[SemanticNodeResolver] Resolved type "${nodeType}" not found in metadata, using fallback`);
        return this.createFallbackResolution(parsed, nodeMetadata);
      }

      return {
        type: nodeType,
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        semanticMatch: {
          matchedKeywords: Array.isArray(parsed.semanticMatch?.matchedKeywords) 
            ? parsed.semanticMatch.matchedKeywords 
            : [],
          matchedCapabilities: Array.isArray(parsed.semanticMatch?.matchedCapabilities)
            ? parsed.semanticMatch.matchedCapabilities
            : [],
          reasoning: parsed.semanticMatch?.reasoning || parsed.reasoning || 'AI resolution'
        },
        alternatives: parsed.alternatives ? parsed.alternatives.map((alt: any) => ({
          type: alt.type,
          confidence: alt.confidence || 0.5,
          semanticMatch: {
            matchedKeywords: [],
            matchedCapabilities: [],
            reasoning: alt.reasoning || ''
          }
        })) : undefined
      };
    } catch (error) {
      console.error('[SemanticNodeResolver] Error parsing AI response:', error);
      return this.createEmptyResolution();
    }
  }

  /**
   * Fallback resolution using keyword matching
   */
  private fallbackResolution(
    intent: SemanticIntent,
    nodeMetadata: NodeMetadata[]
  ): NodeResolution {
    // Find best match based on keyword overlap
    let bestMatch: NodeMetadata | null = null;
    let bestScore = 0;

    for (const node of nodeMetadata) {
      const score = this.calculateMatchScore(intent, node);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = node;
      }
    }

    if (bestMatch && bestScore > 0.3) {
      return {
        type: bestMatch.type,
        confidence: Math.min(bestScore, 0.8), // Cap at 0.8 for fallback
        semanticMatch: {
          matchedKeywords: intent.semanticKeywords.filter(k => 
            bestMatch!.keywords.includes(k.toLowerCase())
          ),
          matchedCapabilities: [],
          reasoning: `Fallback keyword matching: ${bestScore.toFixed(2)} match score`
        }
      };
    }

    return this.createEmptyResolution();
  }

  /**
   * Fallback resolution from direct input
   */
  private fallbackResolutionFromInput(
    userInput: string,
    nodeMetadata: NodeMetadata[]
  ): NodeResolution {
    const lowerInput = userInput.toLowerCase();
    
    // Try exact match first
    const exactMatch = nodeMetadata.find(m => 
      m.type.toLowerCase() === lowerInput ||
      m.keywords.some(k => k.toLowerCase() === lowerInput)
    );

    if (exactMatch) {
      return {
        type: exactMatch.type,
        confidence: 0.9,
        semanticMatch: {
          matchedKeywords: [userInput],
          matchedCapabilities: [],
          reasoning: 'Exact keyword match'
        }
      };
    }

    // Try partial match
    const partialMatch = nodeMetadata.find(m =>
      m.keywords.some(k => lowerInput.includes(k.toLowerCase()) || k.toLowerCase().includes(lowerInput))
    );

    if (partialMatch) {
      return {
        type: partialMatch.type,
        confidence: 0.7,
        semanticMatch: {
          matchedKeywords: [userInput],
          matchedCapabilities: [],
          reasoning: 'Partial keyword match'
        }
      };
    }

    return this.createEmptyResolution();
  }

  /**
   * Calculate match score between intent and node
   */
  private calculateMatchScore(intent: SemanticIntent, node: NodeMetadata): number {
    let score = 0;
    let matches = 0;

    // Check keyword matches
    for (const keyword of intent.semanticKeywords) {
      if (node.keywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
        matches++;
      }
    }

    if (intent.semanticKeywords.length > 0) {
      score += (matches / intent.semanticKeywords.length) * 0.6;
    }

    // Check target matches
    for (const target of intent.targets) {
      if (node.keywords.some(k => k.toLowerCase().includes(target.toLowerCase()))) {
        score += 0.2;
      }
    }

    // Check category matches
    if (intent.categories.includes(node.category)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Create fallback resolution when parsed type not found
   */
  private createFallbackResolution(parsed: any, nodeMetadata: NodeMetadata[]): NodeResolution {
    // Try to find similar node
    const similar = nodeMetadata.find(m => 
      m.type.toLowerCase().includes(parsed.type?.toLowerCase() || '') ||
      parsed.type?.toLowerCase().includes(m.type.toLowerCase())
    );

    if (similar) {
      return {
        type: similar.type,
        confidence: 0.6,
        semanticMatch: {
          matchedKeywords: [],
          matchedCapabilities: [],
          reasoning: `Fallback: Similar node found for "${parsed.type}"`
        }
      };
    }

    return this.createEmptyResolution();
  }

  /**
   * Create empty resolution
   */
  private createEmptyResolution(): NodeResolution {
    return {
      type: '',
      confidence: 0,
      semanticMatch: {
        matchedKeywords: [],
        matchedCapabilities: [],
        reasoning: 'No match found'
      }
    };
  }

  /**
   * Create cache key from intent
   */
  private createCacheKey(intent: SemanticIntent): string {
    return `${intent.primaryIntent}_${intent.targets.join('_')}_${intent.actions.join('_')}`;
  }
}

// Export singleton instance
export const semanticNodeResolver = new SemanticNodeResolver();
