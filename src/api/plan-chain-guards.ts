import { resolveCanonicalNodeTypeStrict } from '../core/utils/node-type-resolver-util';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { extractBranchIntentSignals } from '../core/utils/branch-intent-model';
import { nodeCapabilityRegistryDSL } from '../services/ai/node-capability-registry-dsl';
import { unifiedNormalizeNodeTypeString } from '../core/utils/unified-node-type-normalizer';
import { buildBranchSlotContract } from '../core/utils/branch-slot-contract';
import { planSwitchCasesFromPrompt } from '../services/ai/switch-case-plan';
import {
  explicitPlanIdSuffix,
  formatPlanChainToken,
  stripPlanTokenToType,
} from '../services/ai/plan-chain-prune';

export interface PlanChainIssue {
  input: string;
  reason: string;
  expected_before?: string;
  expected_after?: string;
  branch_required?: boolean;
}

export interface ValidateChainOptions {
  userPrompt?: string;
}

export interface AutoRepairResult {
  canonical: string[];
  repairs: string[];
}

export interface SemanticAutoRepairResult {
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
    const head = stripPlanTokenToType(input);
    try {
      const c = resolveCanonicalNodeTypeStrict(head);
      canonical.push(formatPlanChainToken(input, c));
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
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  // log_output is a side-effect/terminal utility, not a functional output in plan-chain terms.
  // Use registry category + capability to decide rather than hardcoding node names.
  const category = String(def.category || '').toLowerCase();
  if (category === 'utility' || category === 'debug') return false;
  return nodeCapabilityRegistryDSL.isOutput(nodeType) || ((def as any).tags || []).includes('output');
}

function isBranchingNodeType(nodeType: string): boolean {
  const def: any = unifiedNodeRegistry.get(nodeType);
  // Registry is authoritative; no hardcoded fallback needed.
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
    db: /\bsupabase\b/,
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

/**
 * `google_gmail` and generic `email` (SMTP) both send mail; plans often list both unnecessarily.
 * Drop `email` when Gmail is already in the chain unless the user explicitly asks for SMTP / non-Gmail.
 * Also handles the case where `email` was normalized to `google_gmail` by pruneProposedPlanChain.
 */
function dedupeRedundantEmailFamilyNodes(
  chain: string[],
  userPrompt: string
): { chain: string[]; dropped: string[] } {
  const dropped: string[] = [];
  // Normalize: treat 'email' and 'google_gmail' as the same family
  const hasGmail = chain.includes('google_gmail');
  const hasEmail = chain.includes('email');
  if (!hasGmail || !hasEmail) {
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

function normalizeChainWithTerminal(canonical: string[], options?: { preserveOutputRepeats?: boolean }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let triggerSeen = false;
  const preserveOutputRepeats = options?.preserveOutputRepeats === true;
  for (const nodeType of canonical) {
    if (!nodeType) continue;
    // Branch workflows may intentionally repeat the same output type
    // across multiple slots (e.g., Slack on case_2 and case_3).
    if (
      preserveOutputRepeats &&
      isOutputNodeType(nodeType) &&
      nodeType !== 'log_output'
    ) {
      out.push(nodeType);
      continue;
    }
    if (seen.has(nodeType)) continue;
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

/** Branch "slots" after switch: each run of non–log_output nodes until the next log_output (typical out→log per branch). */
function countBranchSlotsAfterSwitch(canonical: string[], switchIdx: number): number {
  let i = switchIdx + 1;
  let slots = 0;
  while (i < canonical.length) {
    const typ = stripPlanTokenToType(canonical[i]);
    if (typ === 'log_output') {
      i++;
      continue;
    }
    slots++;
    while (i < canonical.length && stripPlanTokenToType(canonical[i]) !== 'log_output') {
      i++;
    }
    if (i < canonical.length) i++;
  }
  return slots;
}

function countDistinctExplicitIdsAfterSwitch(canonical: string[], switchIdx: number): number {
  const ids = new Set<string>();
  for (let i = switchIdx + 1; i < canonical.length; i++) {
    const raw = canonical[i];
    if (stripPlanTokenToType(raw) === 'log_output') continue;
    const suf = explicitPlanIdSuffix(raw);
    if (suf) ids.add(suf);
  }
  return ids.size;
}

export function autoRepairCanonicalChainForIntent(
  canonical: string[],
  userPrompt: string = ''
): AutoRepairResult {
  const repairs: string[] = [];
  const initialBranching = canonical.filter((n) => isBranchingNodeType(n));
  const preserveOutputRepeats = initialBranching.length > 0;
  let chain = normalizeChainWithTerminal(canonical, { preserveOutputRepeats });
  const emailDedup = dedupeRedundantEmailFamilyNodes(chain, userPrompt);
  if (emailDedup.dropped.length > 0) {
    repairs.push(`deduped_email_family:${emailDedup.dropped.join(',')}`);
    chain = normalizeChainWithTerminal(emailDedup.chain, { preserveOutputRepeats });
  }
  const branchingNodeTypes = chain.filter((n) => isBranchingNodeType(n));
  if (branchingNodeTypes.length === 0) {
    return { canonical: chain, repairs };
  }

  const signals = extractBranchIntentSignals(userPrompt || '');
  const slotContract = buildBranchSlotContract(branchingNodeTypes, signals);
  const requiredTargets = slotContract.requiredSlotCount;

  const currentOutputs = chain.filter((n) => isOutputNodeType(n));
  if (currentOutputs.length >= requiredTargets) {
    return { canonical: chain, repairs };
  }

  const missingCount = requiredTargets - currentOutputs.length;
  const preferredOutputs = signals.mentionedOutputNodeTypes
    .map((n) => unifiedNormalizeNodeTypeString(n) || n)
    .filter((n) => isOutputNodeType(n) && !chain.includes(n));

  // When preferredOutputs is empty it means all mentioned outputs are already in the chain.
  // The same output type serves multiple branches (e.g. gmail on both true and false).
  // Repeat the existing output type instead of pulling random registry nodes.
  // NEVER fall back to the full registry — that injects unrelated nodes (http_request, postgresql, etc.)
  const additions =
    preferredOutputs.length > 0
      ? preferredOutputs.slice(0, missingCount)
      : currentOutputs.slice(0, missingCount); // repeat existing output for each missing branch
  if (additions.length > 0) {
    chain = chain.filter((n) => n !== 'log_output').concat(additions, ['log_output']);
    repairs.push(`added_output_targets:${additions.join(',')}`);
  }
  return { canonical: normalizeChainWithTerminal(chain, { preserveOutputRepeats: true }), repairs };
}

export function validateCanonicalChainCompleteness(
  canonical: string[],
  options?: ValidateChainOptions
): PlanChainIssue[] {
  const issues: PlanChainIssue[] = [];
  const promptLower = String(options?.userPrompt || '').toLowerCase();
  const triggerCount = canonical.filter((n) => isTriggerNodeType(stripPlanTokenToType(n))).length;
  if (triggerCount !== 1) {
    issues.push({
      input: canonical.join(' -> '),
      reason: `invalid_trigger_count:${triggerCount}`,
    });
  }
  if (!canonical.some((n) => stripPlanTokenToType(n) === 'log_output')) {
    issues.push({
      input: canonical.join(' -> '),
      reason: 'missing_terminal_log_output',
    });
  }

  const branchingNodeTypes = [
    ...new Set(
      canonical.map((n) => stripPlanTokenToType(n)).filter((n) => isBranchingNodeType(n))
    ),
  ];
  if (branchingNodeTypes.length > 0) {
    const signals = extractBranchIntentSignals(options?.userPrompt || '');
    const slotContract = buildBranchSlotContract(branchingNodeTypes, signals);
    const requiredTargets = slotContract.requiredSlotCount;
    const foundTargets = canonical.filter((n) => isOutputNodeType(stripPlanTokenToType(n))).length;
    if (foundTargets < requiredTargets) {
      issues.push({
        input: canonical.join(' -> '),
        reason: `branch_slots_insufficient:required=${requiredTargets},mapped=${foundTargets}`,
      });
    }

    if (signals.hasBranchingIntent && signals.mentionedOutputNodeTypes.length > 0) {
      // Normalize mentioned output types before checking overlap — the chain may contain
      // the canonical form (e.g. google_gmail) while the signal contains the category alias (e.g. email).
      const normalizedMentioned = signals.mentionedOutputNodeTypes.map(
        (n) => unifiedNormalizeNodeTypeString(n) || n
      );
      const canonicalSet = new Set(canonical.map((c) => stripPlanTokenToType(c)));
      const overlap = normalizedMentioned.filter((n) => canonicalSet.has(n));
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
      !/\bspreadsheet|sheet|db|salesforce|database|postgres|mysql|mongo|airtable|notion\b/.test(promptLower) &&
      !/\bdelay\b|\bwait\b/.test(promptLower) &&
      !/\bclassify|summari[sz]e|analy[sz]e|model|agent|ai\b/.test(promptLower);
    if (simpleBranchIntent) {
      const suspicious = canonical.filter((n) => {
        const nt = stripPlanTokenToType(n);
        return (
          ['delay', 'wait', 'db', 'google_sheets', 'salesforce', 'ai_agent', 'ai_chat_model', 'ai_service'].includes(nt) &&
          !hasExplicitCue(promptLower, nt)
        );
      });
      if (suspicious.length > 0) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `over_broad_chain_non_intent_nodes:${suspicious.join(',')}`,
        });
      }
    }

    // Switch (R4): branch slots and/or explicit plan ids must cover enumerated case count.
    const switchIdx = canonical.findIndex((t) => stripPlanTokenToType(t) === 'switch');
    if (switchIdx !== -1) {
      const upstreamType = switchIdx > 0 ? stripPlanTokenToType(canonical[switchIdx - 1]) : undefined;
      const switchPlan = planSwitchCasesFromPrompt(options?.userPrompt || '', upstreamType);
      const caseCount = switchPlan.cases?.length ?? 0;
      if (caseCount > 0) {
        const slots = countBranchSlotsAfterSwitch(canonical, switchIdx);
        const explicitIds = countDistinctExplicitIdsAfterSwitch(canonical, switchIdx);
        const downstreamNonLog = canonical
          .slice(switchIdx + 1)
          .filter((n) => stripPlanTokenToType(n) !== 'log_output').length;
        let covered = Math.max(slots, explicitIds);
        if (covered === 0) {
          covered = downstreamNonLog;
        }
        if (covered < caseCount) {
          issues.push({
            input: canonical.join(' -> '),
            reason: `switch_downstream_actions_insufficient:cases=${caseCount},slots=${slots},explicit_ids=${explicitIds},non_log=${downstreamNonLog}`,
          });
        }
      }
    }
  }
  return issues;
}

export function validateCanonicalChainSemantics(
  canonical: string[],
  options?: ValidateChainOptions
): PlanChainIssue[] {
  const issues: PlanChainIssue[] = [];
  const promptLower = String(options?.userPrompt || '').toLowerCase();

  // Semantic ordering rules (data_source → transformation → output) only apply to
  // linear pipelines. Branching workflows (if_else, switch) have a fundamentally
  // different structure where outputs appear on each branch — not after a data source.
  // Skip semantic ordering checks entirely when the chain contains a branching node.
  const hasBranchingNode = canonical.some((n) => isBranchingNodeType(stripPlanTokenToType(n)));
  if (hasBranchingNode) {
    return issues; // No semantic ordering violations for branching chains
  }

  // "from" as a preposition (e.g. "send email from X") must not trigger data-fetch intent.
  // Only match "from" when preceded by a data-fetch verb.
  const hasTransformIntent = /\bsummari[sz]e|classif|analy[sz]e|transform|rewrite|extract\b/.test(promptLower);
  const hasDataFetchIntent =
    /\bfetch|get|read\b/.test(promptLower) ||
    /\b(fetch|get|read|pull|load|import)\s+from\b/.test(promptLower);

  let seenDataSource = false;
  let seenTransformation = false;
  let seenOutput = false;
  for (const nodeType of canonical) {
    const nt = stripPlanTokenToType(nodeType);
    const isDataSource = nodeCapabilityRegistryDSL.isDataSource(nt) || nodeCapabilityRegistryDSL.canReadData(nt);
    const isTransformation = nodeCapabilityRegistryDSL.isTransformation(nt);
    const isOutput = isOutputNodeType(nt) && !isDataSource;

    if (isDataSource) seenDataSource = true;
    if (isTransformation) {
      if (hasDataFetchIntent && !seenDataSource && canonical.some((n) => nodeCapabilityRegistryDSL.isDataSource(stripPlanTokenToType(n)))) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `semantic_order_violation:transformation_before_data_source:${nt}`,
          expected_after: 'data_source',
        });
      }
      seenTransformation = true;
    }
    if (isOutput) {
      if (hasTransformIntent && canonical.some((n) => nodeCapabilityRegistryDSL.isTransformation(stripPlanTokenToType(n))) && !seenTransformation) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `semantic_order_violation:output_before_transformation:${nt}`,
          expected_after: 'transformation',
        });
      }
      if (hasDataFetchIntent && canonical.some((n) => nodeCapabilityRegistryDSL.isDataSource(stripPlanTokenToType(n))) && !seenDataSource) {
        issues.push({
          input: canonical.join(' -> '),
          reason: `semantic_order_violation:output_before_data_source:${nt}`,
          expected_after: 'data_source',
        });
      }
      seenOutput = true;
    }
    if (seenOutput && !isOutput && (isDataSource || isTransformation) && nt !== 'log_output') {
      issues.push({
        input: canonical.join(' -> '),
        reason: `semantic_order_violation:post_output_processing:${nt}`,
        expected_before: 'output',
      });
    }
  }

  return issues;
}

export function autoRepairCanonicalChainSemantics(
  canonical: string[],
  options?: ValidateChainOptions
): SemanticAutoRepairResult {
  const repairs: string[] = [];
  const chain = normalizeChainWithTerminal(canonical).filter((n) => n !== 'log_output');
  const trigger = chain.find((n) => isTriggerNodeType(n)) || 'manual_trigger';
  const branch = chain.find((n) => isBranchingNodeType(n));
  const dataSources = chain.filter(
    (n) =>
      !isTriggerNodeType(n) &&
      !isBranchingNodeType(n) &&
      !isOutputNodeType(n) &&
      (nodeCapabilityRegistryDSL.isDataSource(n) || nodeCapabilityRegistryDSL.canReadData(n))
  );
  const transforms = chain.filter(
    (n) => !isTriggerNodeType(n) && !isBranchingNodeType(n) && !(nodeCapabilityRegistryDSL.isDataSource(n) || nodeCapabilityRegistryDSL.canReadData(n)) && nodeCapabilityRegistryDSL.isTransformation(n)
  );
  const outputs = chain.filter(
    (n) => !isTriggerNodeType(n) && !isBranchingNodeType(n) && !dataSources.includes(n) && !transforms.includes(n) && isOutputNodeType(n)
  );
  const others = chain.filter(
    (n) => !isTriggerNodeType(n) && !isBranchingNodeType(n) && !dataSources.includes(n) && !transforms.includes(n) && !outputs.includes(n)
  );

  let rebuilt: string[];
  if (branch) {
    const branchTail = chain.filter((n) => !isTriggerNodeType(n) && n !== branch);
    rebuilt = [trigger, branch, ...branchTail];
    repairs.push('semantic_reorder_branch_template');
  } else {
    rebuilt = [trigger, ...dataSources, ...transforms, ...others, ...outputs];
    repairs.push('semantic_reorder_linear_template');
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const n of rebuilt) {
    if (!seen.has(n)) {
      seen.add(n);
      unique.push(n);
    }
  }
  return { canonical: normalizeChainWithTerminal(unique), repairs };
}
