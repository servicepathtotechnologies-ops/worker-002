/**
 * Intent-DSL Semantic Mapper
 * 
 * Provides semantic mapping between intent actions and DSL node types.
 * 
 * Problem:
 * - Intent action type "ai_chat_model" doesn't directly match DSL node types like "text_summarizer", "ollama_llm"
 * - Need semantic matching based on operation (summarize, analyze, process) and capabilities
 * 
 * Solution:
 * - Operation-based matching: summarize/analyze/process → transformation nodes
 * - Capability-based matching: Uses NodeCapabilityRegistryDSL for semantic capabilities
 * - Type-based matching: Direct type matching with normalization
 */

import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { StructuredIntent } from './intent-structurer';

/**
 * Intent action with type and operation
 */
export interface IntentAction {
  type: string;
  operation?: string;
}

/**
 * DSL node type information
 */
export interface DSLNodeType {
  type: string;
  category: 'dataSource' | 'transformation' | 'output';
}

/**
 * Semantic mapping result
 */
export interface SemanticMatchResult {
  matches: boolean;
  confidence: number; // 0.0 to 1.0
  reason: string;
  matchedCategory?: 'dataSource' | 'transformation' | 'output';
}

/**
 * Operation to category mapping
 */
const OPERATION_CATEGORY_MAP: Record<string, 'dataSource' | 'transformation' | 'output'> = {
  // Read operations → dataSource
  'read': 'dataSource',
  'fetch': 'dataSource',
  'get': 'dataSource',
  'query': 'dataSource',
  'retrieve': 'dataSource',
  'pull': 'dataSource',
  'list': 'dataSource',
  
  // Write operations → output
  'send': 'output',
  'write': 'output',
  'create': 'output',
  'update': 'output',
  'notify': 'output',
  'post': 'output',
  'publish': 'output',
  'store': 'output',
  'save': 'output',
  'append': 'output',
  
  // Transformation operations → transformation
  'summarize': 'transformation',
  'summarise': 'transformation',
  'analyze': 'transformation',
  'analyse': 'transformation',
  'process': 'transformation',
  'transform': 'transformation',
  'format': 'transformation',
  'parse': 'transformation',
  'filter': 'transformation',
  'merge': 'transformation',
  'extract': 'transformation',
  'classify': 'transformation',
  'translate': 'transformation',
};

/**
 * Transformation operation keywords
 */
const TRANSFORMATION_OPERATIONS = [
  'summarize', 'summarise', 'analyze', 'analyse', 'process', 'transform',
  'format', 'parse', 'filter', 'merge', 'extract', 'classify', 'translate',
  'ai_processing', 'llm', 'chat', 'generate', 'compose',
];

/**
 * Intent action type to transformation node type mapping
 */
const INTENT_TO_TRANSFORMATION_MAP: Record<string, string[]> = {
  'ai_chat_model': ['text_summarizer', 'ollama_llm', 'openai_gpt', 'anthropic_claude', 'ai_agent', 'ai_service'],
  'ai_model': ['text_summarizer', 'ollama_llm', 'openai_gpt', 'anthropic_claude', 'ai_agent', 'ai_service'],
  'llm': ['ollama_llm', 'openai_gpt', 'anthropic_claude', 'ai_agent', 'ai_service'],
  'chat_model': ['ai_agent', 'ai_service', 'ollama_llm', 'openai_gpt'],
  'summarizer': ['text_summarizer', 'ollama_llm', 'openai_gpt', 'anthropic_claude'],
  'text_processor': ['text_summarizer', 'text_formatter', 'javascript', 'function'],
  'analyzer': ['ai_agent', 'ai_service', 'ollama_llm', 'openai_gpt'],
};

/**
 * Check if intent action matches DSL node type semantically
 * 
 * @param intentAction - Intent action with type and operation
 * @param dslNodeType - DSL node type to check against
 * @param dslCategory - Category of the DSL node (dataSource, transformation, output)
 * @returns Semantic match result
 */
export function matchesIntentAction(
  intentAction: IntentAction,
  dslNodeType: string,
  dslCategory: 'dataSource' | 'transformation' | 'output'
): SemanticMatchResult {
  const intentType = (intentAction.type || '').toLowerCase().trim();
  const intentOperation = (intentAction.operation || '').toLowerCase().trim();
  const dslType = dslNodeType.toLowerCase().trim();
  
  // 1. EXACT MATCH (highest confidence)
  if (intentType === dslType) {
    return {
      matches: true,
      confidence: 1.0,
      reason: `Exact type match: ${intentType} === ${dslType}`,
      matchedCategory: dslCategory,
    };
  }
  
  // 2. SUBSTRING MATCH (high confidence)
  if (dslType.includes(intentType) || intentType.includes(dslType)) {
    return {
      matches: true,
      confidence: 0.9,
      reason: `Substring match: ${intentType} matches ${dslType}`,
      matchedCategory: dslCategory,
    };
  }
  
  // 3. OPERATION-BASED MATCHING (semantic matching)
  if (intentOperation) {
    const expectedCategory = OPERATION_CATEGORY_MAP[intentOperation];
    
    if (expectedCategory) {
      // Check if DSL category matches expected category
      if (expectedCategory === dslCategory) {
        // For transformation operations, check if DSL node has transformation capabilities
        if (expectedCategory === 'transformation') {
          const hasTransformationCapability = nodeCapabilityRegistryDSL.isTransformation(dslType);
          if (hasTransformationCapability) {
            // Check for specific transformation operation matching
            const capabilities = nodeCapabilityRegistryDSL.getCapabilities(dslType);
            const operationMatches = capabilities.some(cap => 
              cap.includes(intentOperation) || intentOperation.includes(cap)
            );
            
            if (operationMatches) {
              return {
                matches: true,
                confidence: 0.95,
                reason: `Operation-based match: ${intentOperation} operation matches transformation node ${dslType} with capability`,
                matchedCategory: 'transformation',
              };
            }
            
            return {
              matches: true,
              confidence: 0.85,
              reason: `Operation-based match: ${intentOperation} operation matches transformation node ${dslType}`,
              matchedCategory: 'transformation',
            };
          }
        }
        
        // For dataSource operations
        if (expectedCategory === 'dataSource') {
          const hasDataSourceCapability = nodeCapabilityRegistryDSL.isDataSource(dslType);
          if (hasDataSourceCapability) {
            return {
              matches: true,
              confidence: 0.9,
              reason: `Operation-based match: ${intentOperation} operation matches dataSource node ${dslType}`,
              matchedCategory: 'dataSource',
            };
          }
        }
        
        // For output operations
        if (expectedCategory === 'output') {
          const hasOutputCapability = nodeCapabilityRegistryDSL.isOutput(dslType);
          if (hasOutputCapability) {
            return {
              matches: true,
              confidence: 0.9,
              reason: `Operation-based match: ${intentOperation} operation matches output node ${dslType}`,
              matchedCategory: 'output',
            };
          }
        }
      }
    }
  }
  
  // 4. INTENT TYPE TO TRANSFORMATION MAPPING
  if (intentType in INTENT_TO_TRANSFORMATION_MAP) {
    const allowedTypes = INTENT_TO_TRANSFORMATION_MAP[intentType];
    if (allowedTypes.some(allowed => dslType === allowed || dslType.includes(allowed) || allowed.includes(dslType))) {
      if (dslCategory === 'transformation') {
        return {
          matches: true,
          confidence: 0.8,
          reason: `Intent type mapping: ${intentType} maps to transformation node ${dslType}`,
          matchedCategory: 'transformation',
        };
      }
    }
  }
  
  // 5. CAPABILITY-BASED MATCHING
  // Check if intent operation matches any capability of the DSL node
  if (intentOperation) {
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(dslType);
    
    // Check if operation matches any capability
    for (const capability of capabilities) {
      if (capability.includes(intentOperation) || intentOperation.includes(capability)) {
        // Verify category matches
        if (dslCategory === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(dslType)) {
          return {
            matches: true,
            confidence: 0.85,
            reason: `Capability-based match: ${intentOperation} matches capability ${capability} of ${dslType}`,
            matchedCategory: 'transformation',
          };
        }
        if (dslCategory === 'dataSource' && nodeCapabilityRegistryDSL.isDataSource(dslType)) {
          return {
            matches: true,
            confidence: 0.85,
            reason: `Capability-based match: ${intentOperation} matches capability ${capability} of ${dslType}`,
            matchedCategory: 'dataSource',
          };
        }
        if (dslCategory === 'output' && nodeCapabilityRegistryDSL.isOutput(dslType)) {
          return {
            matches: true,
            confidence: 0.85,
            reason: `Capability-based match: ${intentOperation} matches capability ${capability} of ${dslType}`,
            matchedCategory: 'output',
          };
        }
      }
    }
  }
  
  // 6. NORMALIZED MATCHING (common variations)
  const normalizedVariations = [
    intentType.replace(/_/g, ''),
    intentType.replace(/-/g, '_'),
    `google_${intentType}`,
    intentType.replace(/^google_/, ''),
    intentType.replace(/^ai_/, ''),
    intentType.replace(/_model$/, ''),
    intentType.replace(/_chat$/, ''),
  ];
  
  for (const normalized of normalizedVariations) {
    if (dslType === normalized || dslType.includes(normalized) || normalized.includes(dslType)) {
      return {
        matches: true,
        confidence: 0.7,
        reason: `Normalized match: ${intentType} (normalized: ${normalized}) matches ${dslType}`,
        matchedCategory: dslCategory,
      };
    }
  }
  
  // 7. TRANSFORMATION OPERATION KEYWORD MATCHING
  // If operation is a transformation keyword and DSL node is a transformation
  if (intentOperation && TRANSFORMATION_OPERATIONS.includes(intentOperation)) {
    if (dslCategory === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(dslType)) {
      return {
        matches: true,
        confidence: 0.75,
        reason: `Transformation keyword match: ${intentOperation} operation matches transformation node ${dslType}`,
        matchedCategory: 'transformation',
      };
    }
  }
  
  // No match found
  return {
    matches: false,
    confidence: 0.0,
    reason: `No semantic match found between intent action ${intentType}(${intentOperation}) and DSL node ${dslType} (${dslCategory})`,
  };
}

/**
 * Find best matching DSL node for an intent action
 * 
 * @param intentAction - Intent action to match
 * @param dslNodes - Array of DSL node types with categories
 * @returns Best match result or null if no match
 */
export function findBestDSLMatch(
  intentAction: IntentAction,
  dslNodes: DSLNodeType[]
): SemanticMatchResult | null {
  let bestMatch: SemanticMatchResult | null = null;
  let highestConfidence = 0;
  
  for (const dslNode of dslNodes) {
    const match = matchesIntentAction(intentAction, dslNode.type, dslNode.category);
    
    if (match.matches && match.confidence > highestConfidence) {
      bestMatch = match;
      highestConfidence = match.confidence;
    }
  }
  
  return bestMatch;
}

/**
 * Detailed coverage failure information
 */
export interface CoverageFailureDetails {
  intentAction: {
    type: string;
    operation?: string;
  };
  availableDSLNodes: {
    dataSources: string[];
    transformations: string[];
    outputs: string[];
  };
  attemptedMatches: Array<{
    dslNodeType: string;
    category: 'dataSource' | 'transformation' | 'output';
    matchResult: SemanticMatchResult;
  }>;
  failureReason: string;
  suggestedFix?: string;
}

/**
 * Check if intent action is covered by any DSL node
 * 
 * @param intentAction - Intent action to check
 * @param dslDataSources - DSL data source types
 * @param dslTransformations - DSL transformation types
 * @param dslOutputs - DSL output types
 * @returns Match result with detailed failure information if not covered
 */
export function isIntentActionCovered(
  intentAction: IntentAction,
  dslDataSources: string[],
  dslTransformations: string[],
  dslOutputs: string[]
): SemanticMatchResult & { failureDetails?: CoverageFailureDetails } {
  const allDSLNodes: DSLNodeType[] = [
    ...dslDataSources.map(type => ({ type, category: 'dataSource' as const })),
    ...dslTransformations.map(type => ({ type, category: 'transformation' as const })),
    ...dslOutputs.map(type => ({ type, category: 'output' as const })),
  ];
  
  // Try to match against all DSL nodes and collect results
  const attemptedMatches: Array<{
    dslNodeType: string;
    category: 'dataSource' | 'transformation' | 'output';
    matchResult: SemanticMatchResult;
  }> = [];
  
  for (const dslNode of allDSLNodes) {
    const matchResult = matchesIntentAction(intentAction, dslNode.type, dslNode.category);
    attemptedMatches.push({
      dslNodeType: dslNode.type,
      category: dslNode.category,
      matchResult,
    });
  }
  
  const bestMatch = findBestDSLMatch(intentAction, allDSLNodes);
  
  if (bestMatch && bestMatch.matches) {
    return bestMatch;
  }
  
  // Build detailed failure information
  const operation = intentAction.operation || 'unknown';
  const expectedCategory = OPERATION_CATEGORY_MAP[operation] || 'unknown';
  
  let failureReason = `Intent action "${intentAction.type}" with operation "${operation}" could not be matched to any DSL node.`;
  
  if (expectedCategory === 'transformation') {
    failureReason += ` Expected transformation node (operation: ${operation}), but no matching transformation nodes found.`;
  } else if (expectedCategory === 'dataSource') {
    failureReason += ` Expected dataSource node (operation: ${operation}), but no matching dataSource nodes found.`;
  } else if (expectedCategory === 'output') {
    failureReason += ` Expected output node (operation: ${operation}), but no matching output nodes found.`;
  } else {
    failureReason += ` Operation "${operation}" is not recognized. Expected one of: read/fetch (dataSource), send/write (output), or summarize/analyze/process (transformation).`;
  }
  
  // Generate suggested fix
  let suggestedFix: string | undefined;
  if (expectedCategory === 'transformation' && dslTransformations.length === 0) {
    suggestedFix = `Add a transformation node (e.g., text_summarizer, ollama_llm, openai_gpt) to handle the "${operation}" operation.`;
  } else if (expectedCategory === 'dataSource' && dslDataSources.length === 0) {
    suggestedFix = `Add a dataSource node (e.g., google_sheets, database_read) to handle the "${operation}" operation.`;
  } else if (expectedCategory === 'output' && dslOutputs.length === 0) {
    suggestedFix = `Add an output node (e.g., google_gmail, slack_message) to handle the "${operation}" operation.`;
  } else if (intentAction.type in INTENT_TO_TRANSFORMATION_MAP) {
    const suggestedTypes = INTENT_TO_TRANSFORMATION_MAP[intentAction.type];
    suggestedFix = `Intent type "${intentAction.type}" should map to one of: ${suggestedTypes.join(', ')}. Consider adding one of these transformation nodes.`;
  } else {
    suggestedFix = `Ensure the DSL includes a node that can handle "${intentAction.type}" with operation "${operation}".`;
  }
  
  const failureDetails: CoverageFailureDetails = {
    intentAction: {
      type: intentAction.type,
      operation: intentAction.operation,
    },
    availableDSLNodes: {
      dataSources: dslDataSources,
      transformations: dslTransformations,
      outputs: dslOutputs,
    },
    attemptedMatches: attemptedMatches.filter(m => !m.matchResult.matches).slice(0, 5), // Show first 5 failed attempts
    failureReason,
    suggestedFix,
  };
  
  return {
    matches: false,
    confidence: 0.0,
    reason: failureReason,
    failureDetails,
  };
}
