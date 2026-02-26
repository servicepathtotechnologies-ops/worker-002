/**
 * Shared Intent Parser
 * 
 * Single source of truth for intent parsing across all layers.
 * Prevents intent drift between generation-time and runtime.
 * 
 * Architecture Rule: No free-text intent logic outside this module.
 */

export interface IntentModel {
  version: number; // Version for backward compatibility
  entities: string[]; // Nouns: resume, email, data, column
  actions: string[]; // Verbs: get, summarize, send, analyze
  qualifiers: string[]; // Modifiers: all, only, specific, first
  confidence: number; // Parsing confidence (0-1)
  rawIntent: string; // Original prompt for reference
}

/**
 * Parse user intent into structured model
 * 
 * This is the ONLY place where intent parsing logic exists.
 * All layers (Data Flow Contract, Intent Router) use this.
 */
export function parseIntent(userPrompt: string): IntentModel {
  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
    return {
      version: 1,
      entities: [],
      actions: [],
      qualifiers: [],
      confidence: 0,
      rawIntent: userPrompt || '',
    };
  }

  const normalized = userPrompt.toLowerCase().trim();
  
  // Extract entities (nouns) - common data-related terms
  const entityPatterns = [
    /\b(resume|resumes|cv|cvs|candidate|profile|application)\b/gi,
    /\b(email|emails|mail|message|notification)\b/gi,
    /\b(data|information|records|rows|columns)\b/gi,
    /\b(sheet|sheets|spreadsheet|table|database)\b/gi,
    /\b(name|age|address|phone|contact)\b/gi,
    /\b(report|summary|analysis|insight)\b/gi,
    /\b(file|document|attachment)\b/gi,
  ];

  const entities: string[] = [];
  entityPatterns.forEach(pattern => {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalizedMatch = match.toLowerCase();
        if (!entities.includes(normalizedMatch)) {
          entities.push(normalizedMatch);
        }
      });
    }
  });

  // Extract actions (verbs)
  const actionPatterns = [
    /\b(get|fetch|retrieve|read|load)\b/gi,
    /\b(send|forward|deliver|transmit)\b/gi,
    /\b(summarize|summarise|condense|brief)\b/gi,
    /\b(analyze|analyse|examine|process)\b/gi,
    /\b(filter|select|extract|find)\b/gi,
    /\b(create|generate|make|build)\b/gi,
    /\b(update|modify|edit|change)\b/gi,
  ];

  const actions: string[] = [];
  actionPatterns.forEach(pattern => {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalizedMatch = match.toLowerCase();
        if (!actions.includes(normalizedMatch)) {
          actions.push(normalizedMatch);
        }
      });
    }
  });

  // Extract qualifiers (modifiers)
  const qualifierPatterns = [
    /\b(all|every|entire|complete|full)\b/gi,
    /\b(only|just|solely|exclusively)\b/gi,
    /\b(specific|particular|certain|selected)\b/gi,
    /\b(first|last|top|bottom)\b/gi,
    /\b(recent|latest|newest|oldest)\b/gi,
  ];

  const qualifiers: string[] = [];
  qualifierPatterns.forEach(pattern => {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const normalizedMatch = match.toLowerCase();
        if (!qualifiers.includes(normalizedMatch)) {
          qualifiers.push(normalizedMatch);
        }
      });
    }
  });

  // Calculate parsing confidence
  // Higher confidence if we found clear entities/actions
  const hasEntities = entities.length > 0;
  const hasActions = actions.length > 0;
  const hasQualifiers = qualifiers.length > 0;
  
  let confidence = 0.5; // Base confidence
  if (hasEntities) confidence += 0.2;
  if (hasActions) confidence += 0.2;
  if (hasQualifiers) confidence += 0.1;
  
  // Boost confidence if prompt is specific (not too generic)
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount >= 5 && wordCount <= 50) {
    confidence += 0.1; // Sweet spot for specificity
  }
  
  confidence = Math.min(confidence, 1.0); // Cap at 1.0

  return {
    version: 1,
    entities: [...entities],
    actions: [...actions],
    qualifiers: [...qualifiers],
    confidence,
    rawIntent: userPrompt,
  };
}

/**
 * Check if intent explicitly requests filtering
 * 
 * Used by routing skip logic to determine if runtime router should activate.
 */
export function requiresExplicitFiltering(intent: IntentModel): boolean {
  // Check for explicit filtering qualifiers
  const filteringQualifiers = ['only', 'just', 'specific', 'particular', 'selected'];
  const hasFilteringQualifier = intent.qualifiers.some(q => 
    filteringQualifiers.includes(q)
  );
  
  // Check for filtering actions
  const filteringActions = ['filter', 'select', 'extract', 'find'];
  const hasFilteringAction = intent.actions.some(a => 
    filteringActions.includes(a)
  );
  
  return hasFilteringQualifier || hasFilteringAction;
}

/**
 * Check if intent requests full dataset
 * 
 * Used to determine if selective extraction should be skipped.
 */
export function requestsFullDataset(intent: IntentModel): boolean {
  const fullDatasetQualifiers = ['all', 'every', 'entire', 'complete', 'full'];
  return intent.qualifiers.some(q => fullDatasetQualifiers.includes(q));
}
