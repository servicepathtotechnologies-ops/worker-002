import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';

export type BranchType = 'if_else' | 'switch' | 'threshold' | null;

export interface BranchIntentSignals {
  /**
   * Whether the prompt appears to describe any branching behavior at all.
   */
  hasBranchingIntent: boolean;

  /**
   * Conservative lower bound on distinct outcomes explicitly described
   * (kept for backward compatibility with existing callers).
   */
  explicitOutcomeCount: number;

  /**
   * Canonical node types that were mentioned in the prompt and are classified
   * as outputs (e.g. "google_gmail", "slack_message").
   */
  mentionedOutputNodeTypes: string[];

  /**
   * High-level branching kind inferred from the prompt, when possible.
   * - "if_else"   → binary condition (true/false, eligible/ineligible, etc.)
   * - "switch"    → multi-way case routing (3+ outcomes, e.g. red/blue/green)
   * - "threshold" → numeric thresholds (score > 70, between 50–70, < 50)
   * - null        → not enough signal to decide
   */
  branchType: BranchType;

  /**
   * Planner-level estimate of how many distinct logical outcomes exist.
   * This may be higher than explicitOutcomeCount when enumerated cases are found.
   */
  estimatedBranchCount: number;

  /**
   * Raw descriptors of outcomes found in the text (e.g. ["red","blue","green"]).
   */
  outcomeDescriptors: string[];

  /**
   * Discriminator field used for branching when we can infer it
   * (e.g. "color", "status", "score").
   */
  discriminatorField?: string;

  /**
   * Heuristic confidence in the inferred branching structure (0.0–1.0).
   * Currently used for diagnostics only.
   */
  confidence: number;
}

function isOutputNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  return nodeCapabilityRegistryDSL.isOutput(nodeType) || (def.tags || []).includes('output');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function extractBranchIntentSignals(userPrompt: string): BranchIntentSignals {
  const raw = userPrompt || '';
  const prompt = raw.toLowerCase();

  const hasIfElse =
    /\bif\b/.test(prompt) &&
    (/\belse\b/.test(prompt) || /\botherwise\b/.test(prompt) || /\bif not\b/.test(prompt));
  const hasOutcomeLanguage =
    /\b(eligible|ineligible|approve|reject|success|failure|pass|fail|yes|no|true|false)\b/.test(prompt);
  const hasComparisonBranch =
    /\b(>|<|>=|<=|greater than|less than|equals|equal to)\b/.test(prompt);
  const hasSwitchKeywords =
    /\bswitch\b/.test(prompt) || /\bcase\b/.test(prompt) || /\bwhen\b/.test(prompt);

  const hasBranchingIntent = hasIfElse || hasOutcomeLanguage || hasComparisonBranch || hasSwitchKeywords;

  // Backward-compatible explicit outcome floor.
  let explicitOutcomeCount = 0;
  if (hasIfElse) explicitOutcomeCount = Math.max(explicitOutcomeCount, 2);
  const enumerated = prompt.match(/\b(or|either)\b/g);
  if (enumerated && enumerated.length > 0) {
    explicitOutcomeCount = Math.max(explicitOutcomeCount, 2);
  }
  if (!hasBranchingIntent) {
    explicitOutcomeCount = 0;
  }

  const mentionedOutputNodeTypes: string[] = [];
  for (const nodeType of unifiedNodeRegistry.getAllTypes()) {
    if (!isOutputNodeType(nodeType)) continue;
    const def = unifiedNodeRegistry.get(nodeType);
    const label = (def?.label || '').toLowerCase();
    const typeToken = nodeType.toLowerCase();
    if (typeToken && prompt.includes(typeToken)) {
      mentionedOutputNodeTypes.push(nodeType);
      continue;
    }
    if (label && label.length >= 3 && prompt.includes(label)) {
      mentionedOutputNodeTypes.push(nodeType);
      continue;
    }
  }

  // --- NEW: richer signals for universal branching ---

  // 1. Outcome descriptors from repeated "if X" patterns (common in switch-style prompts).
  const outcomeDescriptors: string[] = [];
  const ifOutcomeRegex = /\bif\s+([a-z0-9_]+)\b/g;
  let ifMatch: RegExpExecArray | null;
  while ((ifMatch = ifOutcomeRegex.exec(prompt)) !== null) {
    const candidate = ifMatch[1];
    // Filter out obvious non-outcome words (e.g. "age", "score") by heuristic:
    if (candidate && candidate.length <= 20 && !/\d/.test(candidate)) {
      outcomeDescriptors.push(candidate);
    }
  }

  // 2. Discriminator field from phrases like "switch on X", "route by X", "based on X".
  let discriminatorField: string | undefined;
  const discriminatorRegexes = [
    /\bswitch\s+(?:on|by|using)\s+([a-z_][a-z0-9_]*)/i,
    /\bbased\s+on\s+([a-z_][a-z0-9_]*)/i,
    /\bdepending\s+on\s+([a-z_][a-z0-9_]*)/i,
    /\broute\s+by\s+([a-z_][a-z0-9_]*)/i,
  ];
  for (const re of discriminatorRegexes) {
    const m = re.exec(raw);
    if (m && m[1]) {
      discriminatorField = m[1];
      break;
    }
  }

  // 3. Branch type inference.
  let branchType: BranchType = null;
  if (hasSwitchKeywords || outcomeDescriptors.length >= 3) {
    branchType = 'switch';
  } else if (hasIfElse || hasOutcomeLanguage || hasComparisonBranch) {
    branchType = 'if_else';
  }

  // 4. Estimated branch count: prefer descriptors, then explicit outcome floor.
  let estimatedBranchCount = 0;
  if (outcomeDescriptors.length > 0) {
    estimatedBranchCount = outcomeDescriptors.length;
  } else if (explicitOutcomeCount > 0) {
    estimatedBranchCount = explicitOutcomeCount;
  } else if (hasBranchingIntent) {
    // Fallback: at least 2 whenever we know there is branching intent.
    estimatedBranchCount = 2;
  }

  // Switch-style prompts with weak descriptors should still aim for >= 3.
  if (branchType === 'switch' && estimatedBranchCount < 3) {
    estimatedBranchCount = 3;
  }

  // 5. Confidence heuristic for diagnostics.
  let confidence = 0;
  if (!hasBranchingIntent) {
    confidence = 0;
  } else {
    confidence = 0.4;
    if (branchType === 'switch' && outcomeDescriptors.length >= 3) {
      confidence += 0.4;
    } else if (branchType === 'if_else' && explicitOutcomeCount >= 2) {
      confidence += 0.3;
    }
    if (discriminatorField) {
      confidence += 0.1;
    }
    if (mentionedOutputNodeTypes.length > 0) {
      confidence += 0.1;
    }
    if (confidence > 1) confidence = 1;
  }

  return {
    hasBranchingIntent,
    explicitOutcomeCount,
    mentionedOutputNodeTypes: unique(mentionedOutputNodeTypes),
    branchType,
    estimatedBranchCount,
    outcomeDescriptors: unique(outcomeDescriptors),
    discriminatorField,
    confidence,
  };
}

export function expectedBranchTargetCount(signals: BranchIntentSignals): number {
  if (!signals.hasBranchingIntent) return 1;

  // Prefer richer estimate when available; fall back to explicitOutcomeCount (for legacy callers).
  const baseCount =
    signals.estimatedBranchCount && signals.estimatedBranchCount > 0
      ? signals.estimatedBranchCount
      : signals.explicitOutcomeCount;

  // For generic branching, ensure at least 2 outputs.
  let required = Math.max(2, baseCount || 0);

  // For switch-style prompts, strongly prefer 3+ distinct targets.
  if (signals.branchType === 'switch') {
    required = Math.max(required, 3);
  }

  return required;
}
