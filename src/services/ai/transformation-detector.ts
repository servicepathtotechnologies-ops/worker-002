/**
 * Transformation Detector
 * 
 * Detects transformation verbs in user prompts and ensures transformation steps are included.
 * 
 * Transformation verbs:
 * - summarize → ai_chat_model (from TRANSFORMATION_NODE_MAP)
 * - analyze → ai_chat_model (from TRANSFORMATION_NODE_MAP)
 * - classify → ai_chat_model (from TRANSFORMATION_NODE_MAP)
 * - generate → ai_chat_model (from TRANSFORMATION_NODE_MAP)
 * 
 * Rules:
 * 1. If prompt contains transformation verb → transformation step must exist
 * 2. Map transformation verbs to appropriate nodes using TRANSFORMATION_NODE_MAP
 * 3. Validate workflow includes required transformations
 * 
 * ✅ ROOT-LEVEL FIX: Uses UnifiedNodeTypeMatcher for semantic equivalence checking
 * This ensures ollama = ai_chat_model for AI processing requirements (universal for ALL nodes)
 */

import { TRANSFORMATION_NODE_MAP, getTransformationNodeType } from './transformation-node-config';
import { unifiedNodeTypeMatcher } from '../../core/utils/unified-node-type-matcher';

export enum TransformationVerb {
  SUMMARIZE = 'summarize',
  ANALYZE = 'analyze',
  CLASSIFY = 'classify',
  TRANSLATE = 'translate',
  EXTRACT = 'extract',
  GENERATE = 'generate',
  PROCESS = 'process',
  TRANSFORM = 'transform',
}

export interface TransformationDetection {
  detected: boolean;
  verbs: TransformationVerb[];
  requiredNodeTypes: string[];
  missingInWorkflow: string[];
}

/**
 * Transformation Detector
 * Detects transformation requirements from prompts
 */
export class TransformationDetector {
  private readonly TRANSFORMATION_VERBS: Record<string, TransformationVerb> = {
    'summarize': TransformationVerb.SUMMARIZE,
    'summarise': TransformationVerb.SUMMARIZE,
    'summary': TransformationVerb.SUMMARIZE,
    'summarizing': TransformationVerb.SUMMARIZE,
    'summarization': TransformationVerb.SUMMARIZE,
    'analyze': TransformationVerb.ANALYZE,
    'analyse': TransformationVerb.ANALYZE,
    'analysis': TransformationVerb.ANALYZE,
    'analyzing': TransformationVerb.ANALYZE,
    'classify': TransformationVerb.CLASSIFY,
    'classification': TransformationVerb.CLASSIFY,
    'classifying': TransformationVerb.CLASSIFY,
    'translate': TransformationVerb.TRANSLATE,
    'translation': TransformationVerb.TRANSLATE,
    'translating': TransformationVerb.TRANSLATE,
    'extract': TransformationVerb.EXTRACT,
    'extraction': TransformationVerb.EXTRACT,
    'extracting': TransformationVerb.EXTRACT,
    'generate': TransformationVerb.GENERATE,
    'generation': TransformationVerb.GENERATE,
    'generating': TransformationVerb.GENERATE,
    'process': TransformationVerb.PROCESS,
    'processing': TransformationVerb.PROCESS,
    'transform': TransformationVerb.TRANSFORM,
    'transformation': TransformationVerb.TRANSFORM,
    'transforming': TransformationVerb.TRANSFORM,
  };
  
  /**
   * Get node types for a transformation verb using central configuration
   * 
   * @param verb - Transformation verb
   * @returns Array of node types from TRANSFORMATION_NODE_MAP
   */
  private getNodeTypesForVerb(verb: TransformationVerb): string[] {
    const nodeType = getTransformationNodeType(verb);
    // Return as array for backward compatibility with existing code
    return [nodeType];
  }
  
  /**
   * Detect transformation verbs in prompt
   * 
   * @param prompt - User prompt
   * @returns Transformation detection result
   */
  detectTransformations(prompt: string): TransformationDetection {
    console.log(`[TransformationDetector] Detecting transformations in prompt: "${prompt.substring(0, 100)}"`);
    
    const promptLower = prompt.toLowerCase();
    const detectedVerbs: TransformationVerb[] = [];
    const requiredNodeTypes: string[] = [];
    
    // Detect transformation verbs
    for (const [keyword, verb] of Object.entries(this.TRANSFORMATION_VERBS)) {
      // Use word boundary matching to avoid false positives
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(promptLower)) {
        if (!detectedVerbs.includes(verb)) {
          detectedVerbs.push(verb);
          console.log(`[TransformationDetector] ✅ Detected transformation verb: ${verb}`);
        }
      }
    }
    
    // Map verbs to required node types using central configuration
    for (const verb of detectedVerbs) {
      const nodeTypes = this.getNodeTypesForVerb(verb);
      for (const nodeType of nodeTypes) {
        if (!requiredNodeTypes.includes(nodeType)) {
          requiredNodeTypes.push(nodeType);
        }
      }
    }
    
    const detected = detectedVerbs.length > 0;
    
    if (detected) {
      console.log(`[TransformationDetector] ✅ Detected ${detectedVerbs.length} transformation verbs: ${detectedVerbs.join(', ')}`);
      console.log(`[TransformationDetector] ✅ Required node types: ${requiredNodeTypes.join(', ')}`);
    } else {
      console.log(`[TransformationDetector] ℹ️  No transformation verbs detected`);
    }
    
    return {
      detected,
      verbs: detectedVerbs,
      requiredNodeTypes,
      missingInWorkflow: [], // Will be populated during validation
    };
  }
  
  /**
   * Validate workflow includes required transformations
   * 
   * @param detection - Transformation detection result
   * @param workflowNodeTypes - Node types in the workflow
   * @returns Validation result with missing transformations
   */
  /**
   * ✅ ROOT-LEVEL FIX: Validate transformations using semantic matching
   * 
   * Uses UnifiedNodeTypeMatcher to recognize semantic equivalence:
   * - ollama = ai_chat_model (both in 'ai' category)
   * - openai_gpt = ai_chat_model (both in 'ai' category)
   * - google_gmail = outlook (both in 'communication' category)
   * 
   * This is UNIVERSAL - works for ALL node types automatically via registry
   * No hardcoded mappings needed - uses category and semantic equivalence
   */
  validateTransformations(
    detection: TransformationDetection,
    workflowNodeTypes: string[]
  ): { valid: boolean; missing: string[]; errors: string[] } {
    if (!detection.detected) {
      return { valid: true, missing: [], errors: [] };
    }
    
    const errors: string[] = [];
    const missing: string[] = [];
    
    // ✅ ROOT-LEVEL FIX: Use semantic matching via UnifiedNodeTypeMatcher
    // This recognizes that ollama = ai_chat_model for AI processing requirements
    // Works universally for ALL node types - no hardcoding needed
    const satisfiedRequirements: string[] = [];
    const missingRequirements: string[] = [];
    
    for (const requiredType of detection.requiredNodeTypes) {
      const matchResult = unifiedNodeTypeMatcher.isRequirementSatisfied(
        requiredType,
        workflowNodeTypes,
        {
          strict: false, // Use semantic equivalence (category matching)
        }
      );
      
      if (matchResult.matches && matchResult.matchingType) {
        satisfiedRequirements.push(requiredType);
        console.log(
          `[TransformationDetector] ✅ Requirement "${requiredType}" satisfied by ` +
          `workflow node "${matchResult.matchingType}" (${matchResult.reason}, confidence: ${matchResult.confidence}%)`
        );
      } else {
        missingRequirements.push(requiredType);
      }
    }
    
    // Only report truly missing requirements (not semantically satisfied ones)
    if (missingRequirements.length > 0) {
      const error = `Workflow missing required transformation node. Detected verbs: ${detection.verbs.join(', ')}. Missing node types: ${missingRequirements.join(', ')}`;
      errors.push(error);
      missing.push(...missingRequirements);
      console.error(`[TransformationDetector] ❌ ${error}`);
    } else {
      console.log(
        `[TransformationDetector] ✅ All required transformation nodes satisfied ` +
        `(${satisfiedRequirements.length} requirement(s) satisfied by semantic matching)`
      );
    }
    
    return {
      valid: errors.length === 0,
      missing,
      errors,
    };
  }
  
  /**
   * Get recommended node type for a transformation verb
   * Uses central TRANSFORMATION_NODE_MAP configuration
   * 
   * @param verb - Transformation verb
   * @returns Recommended node type from TRANSFORMATION_NODE_MAP
   */
  getRecommendedNodeType(verb: TransformationVerb): string | null {
    const nodeType = getTransformationNodeType(verb);
    return nodeType || null;
  }
}

// Export singleton instance
export const transformationDetector = new TransformationDetector();

// Export convenience functions
export function detectTransformations(prompt: string): TransformationDetection {
  return transformationDetector.detectTransformations(prompt);
}
 
export function validateTransformations(
  detection: TransformationDetection,
  workflowNodeTypes: string[]
): { valid: boolean; missing: string[]; errors: string[] } {
  return transformationDetector.validateTransformations(detection, workflowNodeTypes);
}
