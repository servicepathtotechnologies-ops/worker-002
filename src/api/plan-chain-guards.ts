import { resolveCanonicalNodeTypeStrict } from '../core/utils/node-type-resolver-util';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { extractBranchIntentSignals, expectedBranchTargetCount } from '../core/utils/branch-intent-model';
import { nodeCapabilityRegistryDSL } from '../services/ai/node-capability-registry-dsl';

export interface PlanChainIssue {
  input: string;
  reason: string;
}

export interface ValidateChainOptions {
  userPrompt?: string;
}

export interface AutoRepairResult {
  canonical: string[];
  repairs: string[];
}

export function canonicalizePlanChainStrict(
  chainRaw: unknown
): { canonical: string[]; issues: PlanChainIssue[] } {
  const issues: PlanChainIssue[] = [];
  const canonical: string[] = [];
  if (!Array.isArray(chainRaw)) {
    return { canonical, issues: [{ input: String(chainRaw), reason: 'not_array' }] };
  }
  for (const item of chainRaw) {
    const input = String(item ?? '');
    try {
      canonical.push(resolveCanonicalNodeTypeStrict(input));
    } catch (e: any) {
      issues.push({ input, reason: e?.message || 'non_canonical_type' });
    }
  }
  return { canonical, issues };
}

function isTriggerNodeType(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  return !!def && (def.category === 'trigger' || (def.tags || []).includes('trigger'));
}

function isOutputNodeType(nodeType: string): boolean {
  if (nodeType === 'log_output') return false;
  const def = unifiedNodeRegistry.get(nodeType);
  return !!def && (nodeCapabilityRegistryDSL.isOutput(nodeType) || (def.tags || []).includes('output'));
}

function isBranchingNodeType(nodeType: string): boolean {
  const def: any = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  return !!def.isBranching;
}

function hasExplicitCue(promptLower: string, nodeType: string): boolean {
  const cues: Record<string, RegExp> = {
    form: /\bform\b/,
    google_gmail: /\bgmail\b/,
    email: /\bemail\b/,
    slack_message: /\bslack\b/,
    google_sheets: /\bgoogle\s*sheet|spreadsheet|sheet\b/,
    supabase: /\bsupabase\b/,
    salesforce: /\bsalesforce\b/,
    delay: /\bdelay\b/,
    wait: /\bwait\b/,
    ai_agent: /\bai\b|\bagent\b/,
    ai_chat_model: /\bai\b|\bmodel\b|\bchat model\b/,
    ai_service: /\bai\b|\bsummarize|classify|analy[sz]e\b/,
  };
  const matcher = cues[nodeType];
  return matcher ? matcher.test(promptLower) : false;
}

function expectedTargetsFromRegistry(branchingNodeTypes: string[]): number {
  let required = 1;
  for (const nodeType of branchingNodeTypes) {
    const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode({
      type: nodeType,
      data: { type: nodeType, config: {} as Record<string, unknown> },
    });
    if (Array.isArray(ports) && ports.length > 1) {
      required = Math.max(required, ports.length);
    }
  }
  return required;
}

/**
 * `google_gmail` and generic `email` (SMTP) both send mail; plans often list both unnecessarily.
 * Drop `email` when Gmail is already in the chain unless the user explicitly asks for SMTP / non-Gmail.
 */
function dedupeRedundantEmailFamilyNodes(
  chain: string[],
  userPrompt: string
): { chain: string[]; dropped: string[] } {
  const dropped: string[] = [];
  if (!chain.includes('google_gmail') || !chain.includes('email')) {
    return { chain, dropped };
  }
  const pl = userPrompt.toLowerCase();
  const explicitGenericSmtp =
    /\bsmtp\b|\bmailgun\b|\bsendgrid\b|\bnon[-\s]?gmail\b|generic\s*email|smtp\s*email/i.test(pl);
  if (explicitGenericSmtp) {
    return { chain, dropped };
  }
  const next = chain.filter((n) => n !== 'email');
  dropped.push('email');
  return { chain: next, dropped };
}

function normalizeChainWithTerminal(canonical: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let triggerSeen = false;
  for (const nodeType of canonical) {
    if (!nodeType || seen.has(nodeType)) continue;
    if (isTriggerNodeType(nodeType)) {
      if (triggerSeen) continue;
      triggerSeen = true;
    }
    seen.add(nodeType);
    out.push(nodeType);
  }
  if (!out.some(isTriggerNodeType) && unifiedNodeRegistry.get('manual_trigger')) {
    out.unshift('manual_trigger');
  }
  if (out[out.length - 1] !== 'log_output') {
    out.push('log_output');
  }
  return out;
}

export function autoRepairCanonicalChainForIntent(
  canonical: string[],
  userPrompt: string = ''
): AutoRepairResult {
  const repairs: string[] = [];
  let chain = normalizeChainWithTerminal(canonical);
  const emailDedup = dedupeRedundantEmailFamilyNodes(chain, userPrompt);
  if (emailDedup.dropped.length > 0) {
    repairs.push(`deduped_email_family:${emailDedup.dropped.join(',')}`);
    chain = normalizeChainWithTerminal(emailDedup.chain);
  }
  const branchingNodeTypes = chain.filter((n) => isBranchingNodeType(n));
  if (branchingNodeTypes.length === 0) {
    return { canonical: chain, repairs };
  }

  const signals = extractBranchIntentSignals(userPrompt || '');
  const registryTargetFloor = expectedTargetsFromRegistry(branchingNodeTypes);
  const intentTargetFloor = expectedBranchTargetCount(signals);
  const requiredTargets = signals.hasBranchingIntent
    ? Math.max(registryTargetFloor, intentTargetFloor)
    : registryTargetFloor;

  const currentOutputs = chain.filter((n) => isOutputNodeType(n));
  if (currentOutputs.length >= requiredTargets) {
    return { canonical: chain, repairs };
  }

  const missingCount = requiredTargets - currentOutputs.length;
  const preferredOutputs = signals.mentionedOutputNodeTypes.filter(
    (n) => isOutputNodeType(n) && !chain.includes(n)
  );
  const fallbackOutputs = preferredOutputs.length > 0
    ? []
    : unifiedNodeRegistry
        .getAllTypes()
        .filter((n) => isOutputNodeType(n) && !chain.includes(n));
  const additions = [...preferredOutputs, ...fallbackOutputs].slice(0, missingCount);
  if (additions.length > 0) {
    chain = chain.filter((n) => n !== 'log_output').concat(additions, ['log_output']);
    repairs.push(`added_output_targets:${additions.join(',')}`);
  }
  return { canonical: normalizeChainWithTerminal(chain), repairs };
}

export function validateCanonicalChainCompleteness(
  canonical: string[],
  options?: ValidateChainOptions
): PlanChainIssue[] {
  const issues: PlanChainIssue[] = [];
  const promptLower = String(options?.userPrompt || '').toLowerCase();
  const triggerCount = canonical.filter((n) => isTriggerNodeType(n)).length;
  if (triggerCount !== 1) {
    issues.push({
      input: canonical.join(' -> '),
      reason: `invalid_trigger_count:${triggerCount}`,
    });
  }
  if (!canonical.includes('log_output')) {
    issues.push({
      input: canonical.join(' -> '),
      reason: 'missing_terminal_log_output',
    });
  }

  const branchingNodeTypes = canonical.filter((n) => isBranchingNodeType(n));
  if (branchingNodeTypes.length > 0) {
    const signals = extractBranchIntentSignals(options?.userPrompt || '');
    const registryTargetFloor = expectedTargetsFromRegistry(branchingNodeTypes);
    const intentTargetFloor = expectedBranchTargetCount(signals);
    const requiredTargets = signals.hasBranchingIntent
      ? Math.max(registryTargetFloor, intentTargetFloor)
      : registryTargetFloor;
    const foundTargets = canonical.filter((n) => isOutputNodeType(n)).length;
    if (foundTargets < requiredTargets) {
      issues.push({
        input: canonical.join(' -> '),
        reason: `branch_downstream_outputs_insufficient:required=${requiredTargets},found=${foundTargets}`,
      });
    }

    if (signals.hasBranchingIntent && signals.mentionedOutputNodeTypes.length > 0) {
      const overlap = signals.mentionedOutputNodeTypes.filter((n) => canonical.includes(n));
      if (overlap.length === 0) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `branch_intent_output_targets_missing:${signals.mentionedOutputNodeTypes.join(',')}`,
        });
      }
    }

    // Guardrail: for simple branch prompts, reject unrelated inflation nodes unless explicitly requested.
    const simpleBranchIntent =
      signals.hasBranchingIntent &&
      signals.mentionedOutputNodeTypes.length > 0 &&
      !/\bspreadsheet|sheet|supabase|salesforce|database|postgres|mysql|mongo|airtable|notion\b/.test(promptLower) &&
      !/\bdelay\b|\bwait\b/.test(promptLower) &&
      !/\bclassify|summari[sz]e|analy[sz]e|model|agent|ai\b/.test(promptLower);
    if (simpleBranchIntent) {
      const suspicious = canonical.filter((n) =>
        ['delay', 'wait', 'supabase', 'google_sheets', 'salesforce', 'ai_agent', 'ai_chat_model', 'ai_service'].includes(n) &&
        !hasExplicitCue(promptLower, n)
      );
      if (suspicious.length > 0) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `over_broad_chain_non_intent_nodes:${suspicious.join(',')}`,
        });
      }
    }
  }
  return issues;
}
