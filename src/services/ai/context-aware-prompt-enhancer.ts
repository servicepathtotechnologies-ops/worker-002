/**
 * Context-Aware Prompt Enhancer
 * 
 * Enhances prompts at every AI call stage with:
 * - Node metadata (keywords, capabilities, descriptions)
 * - Semantic context from previous stages
 * - Resolved node types with reasoning
 * 
 * This ensures keywords and semantic context are always available to AI,
 * eliminating the problem of inconsistent keyword integration.
 */

import { SemanticIntent } from './semantic-intent-analyzer';
import { NodeMetadata } from './node-metadata-enricher';
import { NodeResolution } from './semantic-node-resolver';
import { StructuredIntent } from './intent-structurer';
import { Workflow } from '../../core/types/ai-types';
import { nodeMetadataEnricher } from './node-metadata-enricher';

export interface EnhancedPrompt {
  originalPrompt: string;
  semanticContext: SemanticIntent | null;
  availableNodes: NodeMetadata[];
  resolvedNodes: NodeResolution[];
  stage: 'planner' | 'dsl_generator' | 'validator';
  formattedPrompt: string;          // Ready for AI
}

export class ContextAwarePromptEnhancer {
  /**
   * Enhance prompt for planner stage
   * 
   * @param prompt - Original user prompt
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForPlanner(
    prompt: string,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    } = {}
  ): EnhancedPrompt {
    const nodeMetadata = context.nodeMetadata || nodeMetadataEnricher.enrichAllNodes();
    const semanticIntent = context.semanticIntent || null;
    const resolvedNodes = context.resolvedNodes || [];

    // Format node metadata for AI
    const formattedMetadata = this.formatMetadataForPlanner(nodeMetadata);
    
    // Format semantic context if available
    const formattedContext = semanticIntent 
      ? this.formatSemanticContext(semanticIntent)
      : '';

    // Format resolved nodes if available
    const formattedResolved = resolvedNodes.length > 0
      ? this.formatResolvedNodes(resolvedNodes)
      : '';

    // Build enhanced prompt
    const formattedPrompt = this.buildPlannerPrompt(
      prompt,
      formattedMetadata,
      formattedContext,
      formattedResolved
    );

    return {
      originalPrompt: prompt,
      semanticContext: semanticIntent,
      availableNodes: nodeMetadata,
      resolvedNodes,
      stage: 'planner',
      formattedPrompt
    };
  }

  /**
   * Enhance prompt for DSL generator stage
   * 
   * @param intent - Structured intent
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForDSLGenerator(
    intent: StructuredIntent,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    } = {}
  ): EnhancedPrompt {
    const nodeMetadata = context.nodeMetadata || nodeMetadataEnricher.enrichAllNodes();
    const semanticIntent = context.semanticIntent || null;
    const resolvedNodes = context.resolvedNodes || [];

    // Format node metadata
    const formattedMetadata = this.formatMetadataForDSLGenerator(nodeMetadata);
    
    // Format semantic context
    const formattedContext = semanticIntent
      ? this.formatSemanticContext(semanticIntent)
      : '';

    // Format resolved nodes
    const formattedResolved = resolvedNodes.length > 0
      ? this.formatResolvedNodes(resolvedNodes)
      : '';

    // Build enhanced prompt
    const formattedPrompt = this.buildDSLGeneratorPrompt(
      intent,
      formattedMetadata,
      formattedContext,
      formattedResolved
    );

    return {
      originalPrompt: JSON.stringify(intent),
      semanticContext: semanticIntent,
      availableNodes: nodeMetadata,
      resolvedNodes,
      stage: 'dsl_generator',
      formattedPrompt
    };
  }

  /**
   * Enhance prompt for validator stage
   * 
   * @param workflow - Generated workflow
   * @param context - Semantic context and metadata
   * @returns Enhanced prompt with all context
   */
  enhanceForValidator(
    workflow: Workflow,
    context: {
      semanticIntent?: SemanticIntent;
      nodeMetadata?: NodeMetadata[];
      resolvedNodes?: NodeResolution[];
    } = {}
  ): EnhancedPrompt {
    const nodeMetadata = context.nodeMetadata || nodeMetadataEnricher.enrichAllNodes();
    const semanticIntent = context.semanticIntent || null;
    const resolvedNodes = context.resolvedNodes || [];

    // Format node metadata
    const formattedMetadata = this.formatMetadataForValidator(nodeMetadata);
    
    // Format semantic context
    const formattedContext = semanticIntent
      ? this.formatSemanticContext(semanticIntent)
      : '';

    // Build enhanced prompt
    const formattedPrompt = this.buildValidatorPrompt(
      workflow,
      formattedMetadata,
      formattedContext
    );

    return {
      originalPrompt: JSON.stringify(workflow),
      semanticContext: semanticIntent,
      availableNodes: nodeMetadata,
      resolvedNodes,
      stage: 'validator',
      formattedPrompt
    };
  }

  /**
   * Format metadata for planner stage
   */
  private formatMetadataForPlanner(metadata: NodeMetadata[]): string {
    return metadata.map((node, index) => {
      return `${index + 1}. ${node.type}
   Keywords: ${node.keywords.slice(0, 15).join(', ')}${node.keywords.length > 15 ? '...' : ''}
   Capabilities: ${node.capabilities.slice(0, 10).join(', ')}${node.capabilities.length > 10 ? '...' : ''}
   Description: ${node.description}
   Category: ${node.category}`;
    }).join('\n\n');
  }

  /**
   * Format metadata for DSL generator stage
   */
  private formatMetadataForDSLGenerator(metadata: NodeMetadata[]): string {
    // More detailed for DSL generation
    return metadata.map((node, index) => {
      return `${index + 1}. ${node.type}
   Keywords: ${node.keywords.join(', ')}
   Capabilities: ${node.capabilities.join(', ')}
   Description: ${node.description}
   Use Cases: ${node.useCases.join(', ')}
   Category: ${node.category}
   Semantic Context: ${node.semanticContext}`;
    }).join('\n\n');
  }

  /**
   * Format metadata for validator stage
   */
  private formatMetadataForValidator(metadata: NodeMetadata[]): string {
    // Focused on validation
    return metadata.map((node) => {
      return `- ${node.type}: Keywords [${node.keywords.slice(0, 10).join(', ')}], Capabilities [${node.capabilities.join(', ')}]`;
    }).join('\n');
  }

  /**
   * Format semantic context
   */
  private formatSemanticContext(intent: SemanticIntent): string {
    return `Semantic Context:
- Actions: ${intent.actions.join(', ')}
- Targets: ${intent.targets.join(', ')}
- Categories: ${intent.categories.join(', ')}
- Primary Intent: ${intent.primaryIntent}
- Keywords: ${intent.semanticKeywords.join(', ')}
- Domain: ${intent.context.domain}
- Operation: ${intent.context.operation}
${intent.context.platform ? `- Platform: ${intent.context.platform}` : ''}`;
  }

  /**
   * Format resolved nodes
   */
  private formatResolvedNodes(resolutions: NodeResolution[]): string {
    if (resolutions.length === 0) return '';

    return `Resolved Node Types (from semantic analysis):
${resolutions.map((res, index) => {
  return `${index + 1}. ${res.type} (confidence: ${(res.confidence * 100).toFixed(1)}%)
   Reasoning: ${res.semanticMatch.reasoning}
   Matched Keywords: ${res.semanticMatch.matchedKeywords.join(', ')}`;
}).join('\n\n')}`;
  }

  /**
   * Build planner prompt
   */
  private buildPlannerPrompt(
    prompt: string,
    metadata: string,
    context: string,
    resolved: string
  ): string {
    let systemPrompt = `You are a Workflow Planner Agent. Your job is to convert user prompts into workflow specifications.

IMPORTANT: Available Node Types (with keywords and capabilities):
${metadata}

When generating node types:
1. Use the CANONICAL node type names from the list above
2. Match user intent to nodes using SEMANTIC understanding
3. Consider keywords: If user says "post on linkedin", use node type "linkedin" (keywords include "post" and "linkedin")
4. Consider capabilities: If user wants to "send email", use node type "google_gmail" (capability: "send_email")
5. Use SEMANTIC matching, not pattern matching
6. Handle variations automatically (spaces, dashes, prepositions)

`;

    if (context) {
      systemPrompt += `${context}\n\n`;
    }

    if (resolved) {
      systemPrompt += `${resolved}\n\n`;
    }

    systemPrompt += `User Prompt: ${prompt}

Your Task:
1. Understand user intent semantically
2. Select appropriate node types from the available list
3. Use CANONICAL type names only
4. Match based on semantic meaning, not exact words`;

    return systemPrompt;
  }

  /**
   * Build DSL generator prompt
   */
  private buildDSLGeneratorPrompt(
    intent: StructuredIntent,
    metadata: string,
    context: string,
    resolved: string
  ): string {
    let systemPrompt = `You are a DSL Generator. Your job is to convert structured intent into workflow DSL.

IMPORTANT: Available Node Types (with keywords):
${metadata}

Resolved Node Types (from semantic analysis):
${resolved || 'None yet - use semantic matching'}

When categorizing nodes:
1. Use CANONICAL node type names
2. Match based on semantic understanding
3. Consider keywords and capabilities

`;

    if (context) {
      systemPrompt += `${context}\n\n`;
    }

    systemPrompt += `Structured Intent:
${JSON.stringify(intent, null, 2)}

Your Task:
1. Use resolved node types when available
2. For new node types, match semantically to available nodes
3. Categorize correctly (dataSource, transformation, output)
4. Use canonical types only`;

    return systemPrompt;
  }

  /**
   * Build validator prompt
   */
  private buildValidatorPrompt(
    workflow: Workflow,
    metadata: string,
    context: string
  ): string {
    let systemPrompt = `You are a Workflow Validator. Your job is to validate that all node types are correct.

Available Node Types:
${metadata}

`;

    if (context) {
      systemPrompt += `${context}\n\n`;
    }

    systemPrompt += `Workflow to Validate:
${JSON.stringify(workflow, null, 2)}

Your Task:
1. Check all node types exist in available nodes
2. Validate semantic matches are correct
3. Suggest corrections if needed`;

    return systemPrompt;
  }
}

// Export singleton instance
export const contextAwarePromptEnhancer = new ContextAwarePromptEnhancer();
