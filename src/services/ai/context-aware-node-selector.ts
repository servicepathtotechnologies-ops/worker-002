/**
 * ✅ ROOT-LEVEL ARCHITECTURE: Context-Aware Node Selector
 * 
 * This is the CORE AI system that understands node contexts.
 * 
 * Architecture Rules:
 * 1. AI reads ALL node contexts
 * 2. AI analyzes user prompt context
 * 3. AI matches user context to node contexts semantically
 * 4. AI selects nodes based on context understanding
 * 
 * This ensures:
 * - AI understands what each node does (not just keywords)
 * - AI matches user intent to node capabilities
 * - AI suggests alternatives based on context
 * - No patchwork - systematic context understanding
 */

import { nodeContextRegistry } from '../../core/registry/node-context-registry';
import { NodeContext } from '../../core/types/node-context';
import { LLMAdapter } from '../../shared/llm-adapter';

export interface UserPromptContext {
  intent: string;
  actions: string[];
  resources: string[];
  platforms?: string[];
  useCase?: string;
  examples?: string[];
}

export interface NodeMatchResult {
  nodeType: string;
  context: NodeContext;
  confidence: number;
  reason: string;
  matchedCapabilities: string[];
  matchedUseCases: string[];
}

export interface ContextMatchResult {
  matches: NodeMatchResult[];
  alternatives: NodeMatchResult[];
  suggestions: string[];
}

/**
 * ✅ ROOT-LEVEL: Context-Aware Node Selector
 * 
 * AI uses this to understand node contexts and match user intent
 */
export class ContextAwareNodeSelector {
  private llmAdapter: LLMAdapter;
  
  constructor(llmAdapter: LLMAdapter) {
    this.llmAdapter = llmAdapter;
  }
  
  /**
   * ✅ CORE: AI analyzes user prompt context
   * 
   * AI reads the user prompt and extracts:
   * - Intent (what user wants to do)
   * - Actions (what actions are needed)
   * - Resources (what resources are involved)
   * - Platforms (what platforms are mentioned)
   * - Use case (what use case this is)
   */
  async analyzeUserPromptContext(userPrompt: string): Promise<UserPromptContext> {
    const systemPrompt = `You are an expert at analyzing user prompts to understand their intent.

Analyze the following user prompt and extract:
1. Intent: What the user wants to accomplish
2. Actions: What actions are needed (e.g., "send", "monitor", "notify")
3. Resources: What resources are involved (e.g., "email", "slack", "github")
4. Platforms: What platforms are mentioned (e.g., "google", "microsoft", "slack")
5. Use Case: What use case this is (e.g., "notification", "monitoring", "automation")

Return a JSON object with this structure.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `User Prompt: "${userPrompt}"\n\nAnalyze this prompt and extract the context.` }
    ];
    const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
    
    try {
      const context = JSON.parse(response.content);
      return {
        intent: context.intent || userPrompt,
        actions: context.actions || [],
        resources: context.resources || [],
        platforms: context.platforms || [],
        useCase: context.useCase || '',
        examples: context.examples || [],
      };
    } catch (error) {
      // Fallback: simple extraction
      return {
        intent: userPrompt,
        actions: this.extractActions(userPrompt),
        resources: this.extractResources(userPrompt),
        platforms: this.extractPlatforms(userPrompt),
        useCase: '',
        examples: [],
      };
    }
  }
  
  /**
   * ✅ CORE: AI matches user context to node contexts
   * 
   * AI reads ALL node contexts and matches user intent to node capabilities
   */
  async matchUserContextToNodes(
    userContext: UserPromptContext
  ): Promise<ContextMatchResult> {
    // Get all node contexts
    const allContexts = nodeContextRegistry.getAllContextsArray();
    
    // Build context summary for AI
    const nodeContextsSummary = nodeContextRegistry.getContextsForAI();
    
    const systemPrompt = `You are an expert at matching user intent to node capabilities.

You have access to ALL node contexts. Each node has:
- Description: What the node does
- Use Cases: When to use this node
- Capabilities: What the node can do
- Keywords: Terms that describe the node
- Platforms: What platforms the node supports
- Examples: Example scenarios

User Context:
- Intent: ${userContext.intent}
- Actions: ${userContext.actions.join(', ')}
- Resources: ${userContext.resources.join(', ')}
- Platforms: ${userContext.platforms?.join(', ') || 'none specified'}
- Use Case: ${userContext.useCase || 'none specified'}

Available Nodes:
${nodeContextsSummary}

Your task:
1. Match user intent to node capabilities
2. Find nodes that match the user's use case
3. Consider platforms if specified
4. Return nodes with confidence scores
5. Suggest alternatives if exact match not found

Return JSON with:
{
  "matches": [
    {
      "nodeType": "node_type",
      "confidence": 0.95,
      "reason": "why this node matches",
      "matchedCapabilities": ["capability1", "capability2"],
      "matchedUseCases": ["use case 1"]
    }
  ],
  "alternatives": [
    // Similar nodes that could work
  ],
  "suggestions": [
    // Suggestions for user
  ]
}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `Match the user context to available nodes.` }
    ];
    const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
    
    try {
      const result = JSON.parse(response.content);
      
      // Enrich with actual node contexts
      const enrichedMatches = result.matches.map((match: any) => {
        const context = nodeContextRegistry.get(match.nodeType);
        return {
          nodeType: match.nodeType,
          context: context!,
          confidence: match.confidence,
          reason: match.reason,
          matchedCapabilities: match.matchedCapabilities || [],
          matchedUseCases: match.matchedUseCases || [],
        };
      });
      
      const enrichedAlternatives = result.alternatives.map((alt: any) => {
        const context = nodeContextRegistry.get(alt.nodeType);
        return {
          nodeType: alt.nodeType,
          context: context!,
          confidence: alt.confidence,
          reason: alt.reason,
          matchedCapabilities: alt.matchedCapabilities || [],
          matchedUseCases: alt.matchedUseCases || [],
        };
      });
      
      return {
        matches: enrichedMatches,
        alternatives: enrichedAlternatives,
        suggestions: result.suggestions || [],
      };
    } catch (error) {
      // Fallback: keyword-based matching
      return this.fallbackKeywordMatching(userContext, allContexts);
    }
  }
  
  /**
   * Fallback: Simple keyword-based matching
   */
  private fallbackKeywordMatching(
    userContext: UserPromptContext,
    allContexts: Array<{ nodeType: string; context: NodeContext }>
  ): ContextMatchResult {
    const matches: NodeMatchResult[] = [];
    const alternatives: NodeMatchResult[] = [];
    
    const userKeywords = [
      ...userContext.actions,
      ...userContext.resources,
      ...(userContext.platforms || []),
    ].map(k => k.toLowerCase());
    
    for (const { nodeType, context } of allContexts) {
      const nodeKeywords = [
        ...context.keywords,
        ...context.capabilities,
        ...context.useCases,
      ].map(k => k.toLowerCase());
      
      const matchingKeywords = userKeywords.filter(uk => 
        nodeKeywords.some(nk => nk.includes(uk) || uk.includes(nk))
      );
      
      if (matchingKeywords.length > 0) {
        const confidence = matchingKeywords.length / Math.max(userKeywords.length, nodeKeywords.length);
        
        const match: NodeMatchResult = {
          nodeType,
          context,
          confidence,
          reason: `Matched keywords: ${matchingKeywords.join(', ')}`,
          matchedCapabilities: context.capabilities.filter(c => 
            userKeywords.some(uk => c.toLowerCase().includes(uk))
          ),
          matchedUseCases: context.useCases.filter(uc => 
            userKeywords.some(uk => uc.toLowerCase().includes(uk))
          ),
        };
        
        if (confidence > 0.5) {
          matches.push(match);
        } else {
          alternatives.push(match);
        }
      }
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    alternatives.sort((a, b) => b.confidence - a.confidence);
    
    return {
      matches,
      alternatives,
      suggestions: [],
    };
  }
  
  /**
   * Helper: Extract actions from prompt
   */
  private extractActions(prompt: string): string[] {
    const actionWords = ['send', 'receive', 'monitor', 'notify', 'alert', 'create', 'update', 'delete', 'read', 'write'];
    const lowerPrompt = prompt.toLowerCase();
    return actionWords.filter(action => lowerPrompt.includes(action));
  }
  
  /**
   * Helper: Extract resources from prompt
   */
  private extractResources(prompt: string): string[] {
    const resourceWords = ['email', 'slack', 'github', 'gmail', 'sheets', 'calendar', 'message', 'notification'];
    const lowerPrompt = prompt.toLowerCase();
    return resourceWords.filter(resource => lowerPrompt.includes(resource));
  }
  
  /**
   * Helper: Extract platforms from prompt
   */
  private extractPlatforms(prompt: string): string[] {
    const platformWords = ['google', 'microsoft', 'slack', 'github', 'outlook', 'gmail'];
    const lowerPrompt = prompt.toLowerCase();
    return platformWords.filter(platform => lowerPrompt.includes(platform));
  }
}
