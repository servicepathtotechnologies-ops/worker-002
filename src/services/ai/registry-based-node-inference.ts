/**
 * ✅ REGISTRY-BASED NODE INFERENCE
 * 
 * Replaces hardcoded pattern matching (stepLower.includes('gmail')) with
 * registry-based node type inference using node metadata.
 * 
 * Architecture:
 * - Uses node keywords, capabilities, and context from NodeLibrary
 * - Matches user prompt against node metadata
 * - Returns best matching node type
 * - No hardcoded pattern matching
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeLibrary } from '../nodes/node-library';
import { CANONICAL_NODE_TYPES } from '../nodes/node-library';

export interface NodeInferenceResult {
  nodeType: string;
  confidence: number;
  reason: string;
  matchedKeywords: string[];
}

/**
 * Infer node type from user prompt using registry metadata
 * 
 * Replaces hardcoded pattern matching with semantic matching
 * based on node keywords, capabilities, and context.
 */
export function inferNodeTypeFromPrompt(
  step: string,
  context?: string
): NodeInferenceResult | null {
  const stepLower = step.toLowerCase();
  const contextLower = context?.toLowerCase() || '';
  const combinedText = `${stepLower} ${contextLower}`.trim();
  
  const matches: Array<{
    nodeType: string;
    score: number;
    matchedKeywords: string[];
    reason: string;
  }> = [];
  
  // ✅ STEP 1: Get all node types from registry
  for (const nodeType of CANONICAL_NODE_TYPES) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (!nodeDef) continue;
    
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) continue;
    
    // ✅ STEP 2: Match against node keywords
    const keywords = schema.keywords || [];
    const matchedKeywords: string[] = [];
    let keywordScore = 0;
    
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (combinedText.includes(keywordLower)) {
        matchedKeywords.push(keyword);
        keywordScore += 1;
      }
    }
    
    // ✅ STEP 3: Match against node description
    const description = schema.description || '';
    const descriptionLower = description.toLowerCase();
    let descriptionScore = 0;
    
    if (combinedText.split(' ').some(word => descriptionLower.includes(word))) {
      descriptionScore = 0.5;
    }
    
    // ✅ STEP 4: Match against node capabilities
    const capabilities = schema.capabilities || [];
    let capabilityScore = 0;
    
    for (const capability of capabilities) {
      const capabilityLower = capability.toLowerCase();
      if (combinedText.includes(capabilityLower)) {
        capabilityScore += 0.3;
      }
    }
    
    // ✅ STEP 5: Calculate total score
    const totalScore = keywordScore + descriptionScore + capabilityScore;
    
    if (totalScore > 0) {
      matches.push({
        nodeType,
        score: totalScore,
        matchedKeywords,
        reason: matchedKeywords.length > 0
          ? `Matched keywords: ${matchedKeywords.join(', ')}`
          : `Matched description/capabilities`,
      });
    }
  }
  
  // ✅ STEP 6: Return best match
  if (matches.length === 0) {
    return null;
  }
  
  // Sort by score (highest first)
  matches.sort((a, b) => b.score - a.score);
  
  const bestMatch = matches[0];
  
  // Normalize confidence (0-1)
  const maxPossibleScore = 10; // Estimate
  const confidence = Math.min(bestMatch.score / maxPossibleScore, 1);
  
  return {
    nodeType: bestMatch.nodeType,
    confidence,
    reason: bestMatch.reason,
    matchedKeywords: bestMatch.matchedKeywords,
  };
}

/**
 * Infer multiple node types from prompt (for multi-step workflows)
 */
export function inferNodeTypesFromPrompt(
  prompt: string
): NodeInferenceResult[] {
  // Split prompt into steps (simple heuristic)
  const steps = prompt.split(/[,\n;]|and|then/i).map(s => s.trim()).filter(s => s.length > 0);
  
  const results: NodeInferenceResult[] = [];
  
  for (const step of steps) {
    const inference = inferNodeTypeFromPrompt(step, prompt);
    if (inference && inference.confidence > 0.3) {
      results.push(inference);
    }
  }
  
  return results;
}
