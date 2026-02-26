/**
 * Intent Confidence Scorer
 * 
 * Computes confidence scores for structured intents based on:
 * - Semantic similarity to sample workflows
 * - Node match coverage (all node types exist in NodeLibrary)
 * - Missing fields (required fields present)
 * - Vague keywords (agent, workflow, automation, sales, etc.)
 */

import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { resolveNodeType } from '../../core/utils/node-type-resolver-util';

export interface IntentConfidenceScore {
  /**
   * Overall confidence score (0-1)
   */
  confidence_score: number;
  
  /**
   * Breakdown of confidence factors
   */
  factors: {
    /**
     * Semantic similarity to sample workflows (0-1)
     */
    semantic_similarity: number;
    
    /**
     * Node match coverage - percentage of node types that exist in NodeLibrary (0-1)
     */
    node_match_coverage: number;
    
    /**
     * Missing fields penalty - percentage of required fields that are present (0-1)
     */
    missing_fields_penalty: number;
    
    /**
     * Vague keywords penalty - presence of vague keywords reduces confidence (0-1)
     */
    vague_keywords_penalty: number;
  };
  
  /**
   * Detailed analysis
   */
  analysis: {
    /**
     * List of node types that couldn't be resolved
     */
    unresolved_node_types: string[];
    
    /**
     * List of missing required fields
     */
    missing_fields: string[];
    
    /**
     * List of vague keywords found
     */
    vague_keywords_found: string[];
    
    /**
     * Recommendations for improving confidence
     */
    recommendations: string[];
  };
}

export class IntentConfidenceScorer {
  /**
   * Vague keywords that indicate abstract or incomplete intent
   */
  private readonly VAGUE_KEYWORDS = [
    'agent', 'workflow', 'automation', 'sales', 'crm', 'marketing',
    'recruitment', 'hiring', 'onboarding', 'process', 'system',
    'platform', 'tool', 'solution', 'pipeline', 'integration',
    'connect', 'sync', 'manage', 'handle', 'process', 'automate'
  ];

  /**
   * Required fields for high confidence
   */
  private readonly REQUIRED_FIELDS = [
    'trigger', // Must have a trigger
    'actions', // Must have at least one action
  ];

  /**
   * Compute confidence score for structured intent
   */
  async computeConfidence(
    structuredIntent: StructuredIntent,
    userPrompt: string,
    semanticSimilarity?: number
  ): Promise<IntentConfidenceScore> {
    console.log(`[IntentConfidenceScorer] Computing confidence score for intent...`);

    // Factor 1: Semantic Similarity (0-1)
    const semanticSimilarityScore = semanticSimilarity !== undefined 
      ? Math.max(0, Math.min(1, semanticSimilarity))
      : 0.5; // Default to 0.5 if not provided

    // Factor 2: Node Match Coverage (0-1)
    const nodeCoverageResult = this.computeNodeMatchCoverage(structuredIntent);

    // Factor 3: Missing Fields Penalty (0-1)
    const missingFieldsResult = this.computeMissingFieldsPenalty(structuredIntent);

    // Factor 4: Vague Keywords Penalty (0-1)
    const vagueKeywordsResult = this.computeVagueKeywordsPenalty(userPrompt);

    // Calculate weighted confidence score
    // Weights: semantic similarity (40%), node coverage (30%), missing fields (20%), vague keywords (10%)
    const confidenceScore = 
      (semanticSimilarityScore * 0.4) +
      (nodeCoverageResult.coverage * 0.3) +
      (missingFieldsResult.coverage * 0.2) +
      (vagueKeywordsResult.coverage * 0.1);

    // Clamp to 0-1
    const finalConfidence = Math.max(0, Math.min(1, confidenceScore));

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      structuredIntent,
      userPrompt,
      semanticSimilarityScore,
      nodeCoverageResult,
      missingFieldsResult,
      vagueKeywordsResult
    );

    console.log(`[IntentConfidenceScorer] Confidence score: ${(finalConfidence * 100).toFixed(1)}%`);
    console.log(`[IntentConfidenceScorer]   Semantic similarity: ${(semanticSimilarityScore * 100).toFixed(1)}%`);
    console.log(`[IntentConfidenceScorer]   Node coverage: ${(nodeCoverageResult.coverage * 100).toFixed(1)}%`);
    console.log(`[IntentConfidenceScorer]   Missing fields penalty: ${((1 - missingFieldsResult.coverage) * 100).toFixed(1)}%`);
    console.log(`[IntentConfidenceScorer]   Vague keywords penalty: ${((1 - vagueKeywordsResult.coverage) * 100).toFixed(1)}%`);

    return {
      confidence_score: finalConfidence,
      factors: {
        semantic_similarity: semanticSimilarityScore,
        node_match_coverage: nodeCoverageResult.coverage,
        missing_fields_penalty: missingFieldsResult.coverage,
        vague_keywords_penalty: vagueKeywordsResult.coverage,
      },
      analysis: {
        unresolved_node_types: nodeCoverageResult.unresolved,
        missing_fields: missingFieldsResult.missing,
        vague_keywords_found: vagueKeywordsResult.found,
        recommendations,
      },
    };
  }

  /**
   * Compute node match coverage - check if all node types exist in NodeLibrary
   */
  private computeNodeMatchCoverage(intent: StructuredIntent): {
    coverage: number;
    unresolved: string[];
  } {
    const nodeTypes: string[] = [];

    // Collect all node types from intent
    if (intent.trigger) {
      nodeTypes.push(intent.trigger);
    }

    if (intent.actions && intent.actions.length > 0) {
      intent.actions.forEach(action => {
        if (action.type) {
          nodeTypes.push(action.type);
        }
      });
    }

    if (nodeTypes.length === 0) {
      return { coverage: 0, unresolved: [] };
    }

    // Check each node type against NodeLibrary
    const resolved: string[] = [];
    const unresolved: string[] = [];

    for (const nodeType of nodeTypes) {
      try {
        const resolvedType = resolveNodeType(nodeType);
        const schema = nodeLibrary.getSchema(resolvedType);
        if (schema) {
          resolved.push(nodeType);
        } else {
          unresolved.push(nodeType);
        }
      } catch (error) {
        unresolved.push(nodeType);
      }
    }

    const coverage = resolved.length / nodeTypes.length;
    return { coverage, unresolved };
  }

  /**
   * Compute missing fields penalty
   */
  private computeMissingFieldsPenalty(intent: StructuredIntent): {
    coverage: number;
    missing: string[];
  } {
    const missing: string[] = [];

    // Check required fields
    // ✅ FIXED: Don't mark trigger as missing - manual_trigger is automatically injected as default
    // If trigger is missing, it will be defaulted to manual_trigger, so it's not a missing field
    // Do not add 'trigger' to missing fields

    if (!intent.actions || intent.actions.length === 0) {
      missing.push('actions');
    }

    // Check if actions have required fields
    if (intent.actions && intent.actions.length > 0) {
      intent.actions.forEach((action, index) => {
        if (!action.type) {
          missing.push(`actions[${index}].type`);
        }
        if (!action.operation) {
          missing.push(`actions[${index}].operation`);
        }
      });
    }

    const coverage = Math.max(0, 1 - (missing.length / this.REQUIRED_FIELDS.length));
    return { coverage, missing };
  }

  /**
   * Compute vague keywords penalty
   */
  private computeVagueKeywordsPenalty(userPrompt: string): {
    coverage: number;
    found: string[];
  } {
    const promptLower = userPrompt.toLowerCase();
    const found: string[] = [];

    for (const keyword of this.VAGUE_KEYWORDS) {
      // Use word boundary matching to avoid false positives
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(promptLower)) {
        found.push(keyword);
      }
    }

    // Penalty increases with number of vague keywords found
    // 0 keywords = 1.0, 1 keyword = 0.9, 2 keywords = 0.8, 3+ keywords = 0.6
    let coverage = 1.0;
    if (found.length === 1) {
      coverage = 0.9;
    } else if (found.length === 2) {
      coverage = 0.8;
    } else if (found.length >= 3) {
      coverage = 0.6;
    }

    return { coverage, found };
  }

  /**
   * Generate recommendations for improving confidence
   */
  private generateRecommendations(
    intent: StructuredIntent,
    userPrompt: string,
    semanticSimilarity: number,
    nodeCoverage: { coverage: number; unresolved: string[] },
    missingFields: { coverage: number; missing: string[] },
    vagueKeywords: { coverage: number; found: string[] }
  ): string[] {
    const recommendations: string[] = [];

    if (semanticSimilarity < 0.7) {
      recommendations.push('Provide more specific details about the workflow goal and use case');
    }

    if (nodeCoverage.coverage < 1.0 && nodeCoverage.unresolved.length > 0) {
      recommendations.push(`Specify valid node types. Unresolved: ${nodeCoverage.unresolved.join(', ')}`);
    }

    if (missingFields.coverage < 1.0 && missingFields.missing.length > 0) {
      recommendations.push(`Provide missing required fields: ${missingFields.missing.join(', ')}`);
    }

    if (vagueKeywords.found.length > 0) {
      recommendations.push(`Replace vague keywords with specific actions: ${vagueKeywords.found.join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Intent is clear and complete');
    }

    return recommendations;
  }
}

export const intentConfidenceScorer = new IntentConfidenceScorer();
