/**
 * Shared detection of "user wants branching / eligibility / validation" style workflows.
 * Mirrors the conservative rules used in workflow-builder programmatic detection so
 * fallbacks and planners stay aligned.
 */

/**
 * Returns true when the prompt likely requires if_else (or switch) rather than a purely linear flow.
 */
export function detectBranchingIntentFromPrompt(fullText: string): boolean {
  const triggerWhenPatterns = [
    /\bwhen\s+(?:i|we|you|they|it)\s+(?:receive|get|fetch|trigger|call|send|submit|create|add|update|delete)/i,
    /\bwhen\s+(?:a|an|the)\s+(?:new|user|request|form|webhook|message|event)/i,
    /\bwhen\s+(?:i|we|you|they)\s+receive\s+(?:a|an|the)\s+/i,
    /\bwhen\s+(?:i|we|you|they)\s+receive\s+(?:a|an|the)\s+(?:post|get|put|delete|patch)\s+request/i,
  ];
  const isTriggerWhen = triggerWhenPatterns.some((pattern) => pattern.test(fullText));

  const isDataExtraction =
    /\bextract\s+(?:the|a|an)?\s*(?:customer|data|field|value|name|email|phone|address|from)/i.test(
      fullText,
    );

  const isLinearThen =
    /\b(?:extract|get|fetch|receive|send|create|update|delete|add|save|store)\s+.*?\s+then\s+(?:extract|get|fetch|receive|send|create|update|delete|add|save|store)/i.test(
      fullText,
    );

  const conditionalKeywords = [
    'if',
    'check if',
    'only if',
    'unless',
    'contains',
    'equals',
    'greater than',
    'less than',
    '>=',
    '<=',
    '==',
    '!==',
    'filter',
    'separate',
    'categorize',
    'validate',
    'validation',
    'eligible',
    'eligibility',
    'verify',
    'is he',
    'is she',
    'are they',
    'is it',
    'determine if',
    'decide if',
  ];
  if (!isTriggerWhen) {
    conditionalKeywords.push('when');
  }
  if (!isDataExtraction) {
    conditionalKeywords.push('check');
  }
  if (!isLinearThen) {
    conditionalKeywords.push('then');
  }

  const conditionalPatterns = [
    /\bif\s+\w+\s+then\s+/i,
    /\bcheck\s+if\s+/i,
    /\bwhen\s+(?:the|value|amount|score|count|size|age|price|status|type)\s+(?:is|equals|>|<|>=|<=|contains)/i,
    /\bwhen\s+(?:it|they|he|she)\s+(?:is|equals|>|<|>=|<=|contains)/i,
    /\b(?:if|when)\s+.*?\s+(?:contains|equals|>|<|>=|<=|is\s+greater|is\s+less)/i,
    /\bcontains\s+/i,
    /\bgreater\s+than\s+/i,
    /\bless\s+than\s+/i,
    /score\s*>\s*\d+/i,
    /score\s*>=\s*\d+/i,
    /score\s*<\s*\d+/i,
    /score\s*<=\s*\d+/i,
  ];

  const hasConditionalKeywords = conditionalKeywords.some((keyword) => fullText.includes(keyword));
  const hasConditionalPatterns = conditionalPatterns.some((pattern) => pattern.test(fullText));

  return (
    (hasConditionalKeywords || hasConditionalPatterns) &&
    !isTriggerWhen &&
    !isDataExtraction &&
    !isLinearThen
  );
}
