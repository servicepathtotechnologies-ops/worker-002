import { nodeLibrary } from '../nodes/node-library';
import { getCanonicalTypeFromPattern, matchNodeTypeByPattern } from '../../core/registry/node-type-pattern-registry';
import { semanticNodeResolver } from './semantic-node-resolver';
import { semanticIntentAnalyzer } from './semantic-intent-analyzer';
import { nodeMetadataEnricher } from './node-metadata-enricher';
import { resolutionLearningCache } from './resolution-learning-cache';

/**
 * ✅ SEMANTIC + PATTERN-BASED NODE TYPE NORMALIZER (SYNC VERSION)
 * 
 * Normalize a node type string using SEMANTIC AI resolution first, then pattern matching as fallback.
 * This provides world-class node type resolution that handles all variations automatically.
 *
 * Responsibilities:
 * 1. Semantic AI resolution (PRIMARY METHOD) - understands intent, not just patterns
 * 2. Pattern matching (FALLBACK) - for backward compatibility
 * 3. Explicit semantic mappings (e.g. ai providers → ai_chat_model)
 * 4. Exact match against registered types
 * 5. Token-based matching (whole tokens only, not substrings)
 * 6. Levenshtein distance (final fallback)
 *
 * This is designed to be safe to call from transformation detection,
 * DSL generation, and mapping layers before they emit final node types.
 * 
 * NOTE: This is the SYNC version. Use normalizeNodeTypeAsync() for full async semantic resolution.
 */
export function normalizeNodeType(nodeType: string): string {
  if (!nodeType) {
    return nodeType;
  }

  const original = nodeType;
  const lower = nodeType.toLowerCase().trim();

  // ✅ STEP 0: Check cache first (fast path)
  const cached = resolutionLearningCache.get(lower);
  if (cached && cached.confidence > 0.8 && cached.resolvedType) {
    // Verify the cached type is still registered
    if (nodeLibrary.isNodeTypeRegistered(cached.resolvedType)) {
      return cached.resolvedType;
    }
  }

  // ✅ STEP 1: SEMANTIC AI RESOLUTION (PRIMARY METHOD)
  // Try semantic resolution for variations like "post on linkedin" → "linkedin"
  // This is async, but we provide sync fallback for backward compatibility
  // In production, callers should use the async version
  try {
    // Quick semantic check: if input looks like a variation (has spaces, prepositions, etc.)
    const looksLikeVariation = /(post|publish|send|create)\s+(on|to|via|using)\s+/.test(lower) ||
                                lower.includes('_post') || lower.includes('post_');
    
    if (looksLikeVariation) {
      // For variations, we'll try semantic resolution
      // But since this is a sync function, we'll do a quick keyword-based check first
      const metadata = nodeMetadataEnricher.enrichAllNodes();
      const quickMatch = findQuickSemanticMatch(lower, metadata);
      if (quickMatch) {
        return quickMatch;
      }
    }
  } catch (error) {
    // Silently fall through to pattern matching
    console.debug('[NodeTypeNormalizer] Semantic resolution skipped, using pattern matching');
  }

  // ✅ STEP 2: STRICT PATTERN MATCHING (FALLBACK)
  // Use word-boundary patterns to match whole words only
  // This prevents "gmail" from matching "ai" because "ai" is not a whole word in "gmail"
  const registeredTypes = nodeLibrary.getRegisteredNodeTypes();
  const patternMatch = matchNodeTypeByPattern(lower, registeredTypes);
  if (patternMatch) {
    const canonicalType = patternMatch.type;
    // Verify the canonical type is registered
    if (nodeLibrary.isNodeTypeRegistered(canonicalType)) {
      return canonicalType;
    }
  }

  // ✅ STEP 2: Explicit semantic mappings for AI / LLM providers
  // These are higher-level logical types that should be implemented
  // by the canonical ai_chat_model node.
  const semanticMap: Record<string, string> = {
    // Legacy / provider-specific AI nodes → ai_chat_model
    'ollama_llm': 'ai_chat_model',
    'text_summarizer': 'ai_chat_model',
    'openai_gpt': 'ai_chat_model',
    'anthropic_claude': 'ai_chat_model',
  };

  let candidate = semanticMap[lower] || lower;

  // ✅ STEP 3: If the mapped type is already registered, return it immediately.
  if (nodeLibrary.isNodeTypeRegistered(candidate)) {
    return candidate;
  }

  // ✅ STEP 4: Try exact match against registered types ignoring case.
  // (registeredTypes already declared above)
  for (const registered of registeredTypes) {
    if (registered.toLowerCase() === candidate) {
      return registered;
    }
  }

  // ✅ STEP 5: STRICT TOKEN-BASED MATCHING (whole tokens only, not substrings)
  // Split on delimiters and match whole tokens only
  // This prevents "gmail" from matching "ai" because they're different tokens
  const candidateTokens = candidate.split(/[_\-\.\s]+/g).filter(Boolean);
  const MIN_TOKEN_LENGTH = 2; // Minimum token length to consider

  const tokenMatches: string[] = [];
  for (const registered of registeredTypes) {
    const regLower = registered.toLowerCase();
    const regTokens = regLower.split(/[_\-\.\s]+/g).filter(Boolean);

    // ✅ STRICT: Match only if ALL candidate tokens exist as WHOLE tokens in registered type
    // This ensures "gmail" won't match "ai" because "ai" is not a whole token in "gmail"
    const allTokensMatch = candidateTokens.length > 0 && 
                          candidateTokens.every(token => 
                            token.length >= MIN_TOKEN_LENGTH && 
                            regTokens.includes(token)
                          );

    if (allTokensMatch && candidateTokens.length === regTokens.length) {
      // Exact token match - highest confidence
      tokenMatches.push(registered);
    } else if (allTokensMatch) {
      // Partial token match - lower confidence, but still valid
      tokenMatches.push(registered);
    }
  }

  if (tokenMatches.length === 1) {
    return tokenMatches[0];
  }

  if (tokenMatches.length > 1) {
    // Prefer exact token count match, then shorter type
    tokenMatches.sort((a, b) => {
      const aTokens = a.split(/[_\-\.\s]+/g).length;
      const bTokens = b.split(/[_\-\.\s]+/g).length;
      if (aTokens === candidateTokens.length && bTokens !== candidateTokens.length) return -1;
      if (bTokens === candidateTokens.length && aTokens !== candidateTokens.length) return 1;
      return a.length - b.length;
    });
    return tokenMatches[0];
  }

  // ✅ STEP 6: As a final fallback, choose the closest type by Levenshtein distance.
  // This is defensive: it should rarely be needed, but it prevents
  // completely invalid node types from leaking through when there is a
  // very close supported alternative.
  let bestMatch = candidate;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (const registered of registeredTypes) {
    const distance = levenshtein(candidate, registered.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = registered;
    }
  }

  // If distance is very large, keep the original to avoid surprising mappings.
  // Threshold is heuristic; small edits (typos / suffixes) will be corrected,
  // but completely unrelated names will be left unchanged.
  if (bestDistance <= 4) {
    return bestMatch;
  }

  // ✅ STEP 7: No good match found – return the original type unchanged.
  // Callers can still validate this against NodeLibrary if needed.
  return original;
}

/**
 * Compute Levenshtein distance between two strings.
 * Small and self-contained implementation suitable for runtime use.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[] = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    dp[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      }
      prev = temp;
    }
  }

  return dp[b.length];
}

/**
 * Quick semantic match using keyword overlap
 * This is a synchronous fallback for semantic resolution
 */
function findQuickSemanticMatch(
  input: string,
  metadata: Array<{ type: string; keywords: string[] }>
): string | null {
  const inputWords = input.toLowerCase().split(/[\s_\-]+/).filter(w => w.length > 2);
  
  let bestMatch: { type: string; score: number } | null = null;
  
  for (const node of metadata) {
    const nodeKeywords = node.keywords.map(k => k.toLowerCase());
    let score = 0;
    let matches = 0;
    
    // Check how many input words match node keywords
    for (const word of inputWords) {
      if (nodeKeywords.some(k => k === word || k.includes(word) || word.includes(k))) {
        matches++;
        score += 1;
      }
    }
    
    // Bonus if node type itself matches
    if (node.type.toLowerCase().includes(inputWords[inputWords.length - 1]) ||
        inputWords.some(w => node.type.toLowerCase().includes(w))) {
      score += 2;
    }
    
    // Normalize score
    const normalizedScore = matches > 0 ? score / (inputWords.length + 1) : 0;
    
    if (normalizedScore > 0.5 && (!bestMatch || normalizedScore > bestMatch.score)) {
      bestMatch = { type: node.type, score: normalizedScore };
    }
  }
  
  return bestMatch && bestMatch.score > 0.6 ? bestMatch.type : null;
}

/**
 * Async version of normalizeNodeType with full semantic resolution
 * Use this when you can handle async operations
 */
export async function normalizeNodeTypeAsync(nodeType: string): Promise<string> {
  if (!nodeType) {
    return nodeType;
  }

  const original = nodeType;
  const lower = nodeType.toLowerCase().trim();

  // Check cache first
  const cached = resolutionLearningCache.get(lower);
  if (cached && cached.confidence > 0.8 && cached.resolvedType) {
    if (nodeLibrary.isNodeTypeRegistered(cached.resolvedType)) {
      return cached.resolvedType;
    }
  }

  // Try semantic resolution
  try {
    const intent = await semanticIntentAnalyzer.analyze(nodeType);
    const metadata = nodeMetadataEnricher.enrichAllNodes();
    const resolution = await semanticNodeResolver.resolve(intent, metadata);
    
    if (resolution.confidence > 0.7 && resolution.type) {
      // Verify type is registered
      if (nodeLibrary.isNodeTypeRegistered(resolution.type)) {
        return resolution.type;
      }
    }
  } catch (error) {
    console.debug('[NodeTypeNormalizer] Semantic resolution failed, using pattern matching:', error);
  }

  // Fallback to sync pattern-based normalization
  return normalizeNodeType(nodeType);
}
