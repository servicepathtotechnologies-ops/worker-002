/**
 * Node-grouped credential rows for the wizard Credentials step.
 * Derived from comprehensive questions + credentialStatuses (no node-type hardcoding).
 */

import type { ComprehensiveNodeQuestion } from './comprehensive-node-questions-generator';

export type CredentialWizardCredentialKind = 'oauth' | 'api_key' | 'webhook' | 'token' | 'other';

export type CredentialWizardStatus = 'required_missing' | 'resolved_connected' | 'not_required';

export type CredentialWizardOwnershipSummary =
  | 'user'
  | 'ai_runtime'
  | 'locked'
  | 'unlockable_locked'
  | 'selectable';

/** Rows may omit displayName — match logic must not assume it is set. */
export interface CredentialStatusRow {
  nodeId: string;
  nodeType?: string;
  nodeLabel?: string;
  credentialId: string;
  displayName?: string;
  status: CredentialWizardStatus;
}

export interface CredentialWizardRow {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  questionId: string;
  fieldName: string;
  displayTitle: string;
  subtitle: string;
  kind: CredentialWizardCredentialKind;
  status: CredentialWizardStatus;
  ownershipSummary: CredentialWizardOwnershipSummary;
  aiPrefilled: boolean;
  /** Show password/text input (missing secret user must provide). */
  requiresInput: boolean;
  askOrder: number;
}

export interface CredentialWizardNodeGroup {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  rows: CredentialWizardRow[];
}

function norm(s: string | undefined | null): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
}

function inferKind(q: ComprehensiveNodeQuestion): CredentialWizardCredentialKind {
  const fn = norm(q.fieldName);
  const text = norm(q.text);
  if (fn === 'authtype' || text.includes('oauth')) return 'oauth';
  if (fn.includes('webhook') || text.includes('webhook')) return 'webhook';
  if (fn.includes('apikey') || fn.includes('api_key') || text.includes('apikey')) return 'api_key';
  if (fn.includes('token') || fn.includes('secret') || text.includes('token')) return 'token';
  return 'other';
}

function ownershipSummaryFromQuestion(q: ComprehensiveNodeQuestion): CredentialWizardOwnershipSummary {
  const locked = q.ownershipUiMode === 'locked';
  if (locked && q.isUnlockableCredential) return 'unlockable_locked';
  if (locked) return 'locked';
  if (q.ownershipUiMode === 'selectable' || q.ownershipUiMode === 'user_only') {
    if (q.fillModeDefault === 'runtime_ai') return 'ai_runtime';
    return 'selectable';
  }
  if (q.fillModeDefault === 'runtime_ai') return 'ai_runtime';
  return 'user';
}

function aiPrefilledFromQuestion(q: ComprehensiveNodeQuestion): boolean {
  if (q.aiFilledAtBuildTime) return true;
  const dv = String(q.defaultValue || '').trim();
  if (!dv) return false;
  return q.fillModeDefault === 'buildtime_ai_once';
}

function isCredentialWizardQuestion(q: ComprehensiveNodeQuestion): boolean {
  return q.category === 'credential' || q.ownershipClass === 'credential';
}

/**
 * Match comprehensive credential question to a status row for the same node.
 */
export function matchCredentialStatusForQuestion(
  q: ComprehensiveNodeQuestion,
  statuses: CredentialStatusRow[]
): CredentialWizardStatus {
  const nodeRows = statuses.filter((s) => s.nodeId === q.nodeId && s.credentialId !== 'none');
  if (nodeRows.length === 0) return 'not_required';

  const fn = norm(q.fieldName);
  const text = norm(q.text);
  const vkRaw = (q as { credential?: { vaultKey?: string } }).credential?.vaultKey;
  const vk = norm(vkRaw ?? '');

  const scoreRow = (r: CredentialStatusRow): number => {
    const cid = norm(r.credentialId);
    const dn = norm(r.displayName);
    let score = 0;
    if (vk && cid && (vk === cid || cid.includes(vk) || vk.includes(cid))) score += 8;
    if (fn && (cid.includes(fn) || fn.includes(cid))) score += 5;
    if (fn && dn.includes(fn)) score += 4;
    if (text && dn && (text.includes(dn.slice(0, 12)) || dn.includes(text.slice(0, 12)))) score += 2;
    if (q.fieldName === 'authType' && (dn.includes('google') || cid.includes('google'))) score += 1;
    return score;
  };

  let best: CredentialStatusRow | null = null;
  let bestScore = 0;
  for (const r of nodeRows) {
    const sc = scoreRow(r);
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }

  if (best && bestScore > 0) return best.status;
  if (nodeRows.length === 1) return nodeRows[0].status;
  if (nodeRows.some((r) => r.status === 'required_missing')) return 'required_missing';
  return nodeRows[0]?.status ?? 'not_required';
}

export function buildCredentialWizardRows(
  questions: ComprehensiveNodeQuestion[],
  credentialStatuses: CredentialStatusRow[]
): CredentialWizardRow[] {
  const credQs = questions.filter(isCredentialWizardQuestion);
  const rows: CredentialWizardRow[] = [];

  for (const q of credQs) {
    const status = matchCredentialStatusForQuestion(q, credentialStatuses);
    const displayTitle =
      q.text?.trim() ||
      q.description?.trim()?.split('\n')[0] ||
      q.fieldName.replace(/([A-Z])/g, ' $1').trim();
    const subtitle =
      (q.description && q.description !== displayTitle ? q.description : '') ||
      `${q.nodeLabel} · ${q.fieldName}`;

    const ownershipSummary = ownershipSummaryFromQuestion(q);
    const aiPrefilled = aiPrefilledFromQuestion(q);
    const requiresInput = status === 'required_missing' && q.category === 'credential';

    rows.push({
      nodeId: q.nodeId,
      nodeType: q.nodeType,
      nodeLabel: q.nodeLabel,
      questionId: q.id,
      fieldName: q.fieldName,
      displayTitle,
      subtitle: subtitle.slice(0, 280),
      kind: inferKind(q),
      status,
      ownershipSummary,
      aiPrefilled,
      requiresInput,
      askOrder: q.askOrder ?? 999,
    });
  }

  rows.sort((a, b) => {
    if (a.nodeLabel !== b.nodeLabel) return a.nodeLabel.localeCompare(b.nodeLabel);
    return a.askOrder - b.askOrder;
  });

  return rows;
}

export function groupCredentialWizardRows(rows: CredentialWizardRow[]): CredentialWizardNodeGroup[] {
  const byNode = new Map<string, CredentialWizardNodeGroup>();
  for (const r of rows) {
    if (!byNode.has(r.nodeId)) {
      byNode.set(r.nodeId, {
        nodeId: r.nodeId,
        nodeType: r.nodeType,
        nodeLabel: r.nodeLabel,
        rows: [],
      });
    }
    byNode.get(r.nodeId)!.rows.push(r);
  }
  return Array.from(byNode.values()).sort((a, b) => a.nodeLabel.localeCompare(b.nodeLabel));
}

export function buildCredentialWizardView(
  questions: ComprehensiveNodeQuestion[],
  credentialStatuses: CredentialStatusRow[]
): { rows: CredentialWizardRow[]; groups: CredentialWizardNodeGroup[] } {
  const rows = buildCredentialWizardRows(questions, credentialStatuses);
  return { rows, groups: groupCredentialWizardRows(rows) };
}
