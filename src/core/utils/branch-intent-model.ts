import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';

export interface BranchIntentSignals {
  hasBranchingIntent: boolean;
  explicitOutcomeCount: number;
  mentionedOutputNodeTypes: string[];
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
  const prompt = (userPrompt || '').toLowerCase();
  const hasIfElse =
    /\bif\b/.test(prompt) &&
    (/\belse\b/.test(prompt) || /\botherwise\b/.test(prompt) || /\bif not\b/.test(prompt));
  const hasOutcomeLanguage =
    /\b(eligible|ineligible|approve|reject|success|failure|pass|fail|yes|no|true|false)\b/.test(prompt);
  const hasComparisonBranch = /\b(>|<|>=|<=|greater than|less than|equals|equal to)\b/.test(prompt);
  const hasBranchingIntent = hasIfElse || hasOutcomeLanguage || hasComparisonBranch;

  let explicitOutcomeCount = 0;
  if (hasIfElse) explicitOutcomeCount = Math.max(explicitOutcomeCount, 2);
  const enumerated = prompt.match(/\b(or|either)\b/g);
  if (enumerated && enumerated.length > 0) explicitOutcomeCount = Math.max(explicitOutcomeCount, 2);
  if (!hasBranchingIntent) explicitOutcomeCount = 0;

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

  return {
    hasBranchingIntent,
    explicitOutcomeCount,
    mentionedOutputNodeTypes: unique(mentionedOutputNodeTypes),
  };
}

export function expectedBranchTargetCount(signals: BranchIntentSignals): number {
  if (!signals.hasBranchingIntent) return 1;
  return Math.max(2, signals.explicitOutcomeCount);
}
