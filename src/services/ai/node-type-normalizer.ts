import { nodeLibrary } from '../nodes/node-library';

/**
 * Normalize a node type string so that it is compatible with NodeLibrary.
 *
 * Responsibilities:
 * - Apply explicit semantic mappings (e.g. ai providers → ai_chat_model)
 * - Prefer canonical / registered node types from NodeLibrary
 * - Fallback to the closest registered type when an unknown type is received
 *
 * This is designed to be safe to call from transformation detection,
 * DSL generation, and mapping layers before they emit final node types.
 */
export function normalizeNodeType(nodeType: string): string {
  if (!nodeType) {
    return nodeType;
  }

  const original = nodeType;
  const lower = nodeType.toLowerCase().trim();

  // 1) Explicit semantic mappings for AI / LLM providers
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

  // 2) If the mapped type is already registered, return it immediately.
  if (nodeLibrary.isNodeTypeRegistered(candidate)) {
    return candidate;
  }

  // 3) Try exact match against registered types ignoring case.
  const registeredTypes = nodeLibrary.getRegisteredNodeTypes();
  for (const registered of registeredTypes) {
    if (registered.toLowerCase() === candidate) {
      return registered;
    }
  }

  // 4) Try substring / token based matching for common cases, e.g.:
  //    "ollama_llm" → "ollama", "openai-gpt-4" → "openai_gpt"
  const candidateTokens = candidate.split(/[_\-\.]/g).filter(Boolean);

  const substringMatches: string[] = [];
  for (const registered of registeredTypes) {
    const regLower = registered.toLowerCase();

    // Direct containment in either direction
    if (regLower.includes(candidate) || candidate.includes(regLower)) {
      substringMatches.push(registered);
      continue;
    }

    // Token overlap heuristic
    if (candidateTokens.length > 0) {
      const regTokens = regLower.split(/[_\-\.]/g).filter(Boolean);
      const overlap = regTokens.filter(t => candidateTokens.includes(t));
      if (overlap.length > 0) {
        substringMatches.push(registered);
      }
    }
  }

  if (substringMatches.length === 1) {
    return substringMatches[0];
  }

  if (substringMatches.length > 1) {
    // Prefer shorter, more canonical-looking type when multiple match
    substringMatches.sort((a, b) => a.length - b.length);
    return substringMatches[0];
  }

  // 5) As a final fallback, choose the closest type by Levenshtein distance.
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

  // 6) No good match found – return the original type unchanged.
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

