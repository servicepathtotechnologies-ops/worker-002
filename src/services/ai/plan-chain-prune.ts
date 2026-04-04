/**
 * Normalize planner / summarize proposedNodeChain before plan-driven build:
 * drop unknown types, collapse consecutive duplicates, preserve order.
 * After switch/if_else, consecutive duplicate types are preserved (same type on different branches).
 *
 * Token annotation formats supported:
 *   - `nodeType#id` / `nodeType@id`  — explicit plan node id suffix (existing)
 *   - `nodeType[branchTag]`           — same-type branch annotation (task 18)
 *
 * Both formats can coexist: `google_gmail[true]#branch_a`
 */

import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

/**
 * Strip all annotation suffixes (`[branchTag]`, `#id`, `@id`) from a raw plan token
 * and return the canonical node type string.
 */
export function stripPlanTokenToType(raw: string): string {
  const s = String(raw || '').trim();
  // Strip [branchTag] suffix first (e.g. "google_gmail[true]" → "google_gmail")
  const withoutBranchTag = s.replace(/\[.*?\]/, '');
  const hashIdx = withoutBranchTag.indexOf('#');
  const atIdx = withoutBranchTag.indexOf('@');
  const sepIdx =
    hashIdx > 0 && atIdx > 0 ? Math.min(hashIdx, atIdx) : Math.max(hashIdx, atIdx);
  const head = sepIdx > 0 ? withoutBranchTag.slice(0, sepIdx).trim() : withoutBranchTag;
  return unifiedNormalizeNodeTypeString(head) || head;
}

/** Suffix starting at `#` or `@` when present (plan explicit node id). */
export function explicitPlanIdSuffix(raw: string): string | null {
  const s = String(raw || '').trim();
  // Strip [branchTag] before looking for #/@
  const withoutBranchTag = s.replace(/\[.*?\]/, '');
  const hashIdx = withoutBranchTag.indexOf('#');
  const atIdx = withoutBranchTag.indexOf('@');
  const sepIdx =
    hashIdx > 0 && atIdx > 0 ? Math.min(hashIdx, atIdx) : Math.max(hashIdx, atIdx);
  if (sepIdx > 0 && sepIdx < withoutBranchTag.length - 1) {
    return withoutBranchTag.slice(sepIdx);
  }
  return null;
}

/** Canonical registry type + optional `#id` / `@id` from planner token. Preserves `[branchTag]` if present. */
export function formatPlanChainToken(raw: string, canonicalType: string): string {
  // Preserve [branchTag] annotation if present in the raw token
  const branchTagMatch = String(raw || '').match(/(\[.+?\])/);
  const branchTagSuffix = branchTagMatch ? branchTagMatch[1] : '';
  const suf = explicitPlanIdSuffix(raw);
  return suf ? `${canonicalType}${branchTagSuffix}${suf}` : `${canonicalType}${branchTagSuffix}`;
}

/**
 * Format a plan chain token with a branch annotation suffix.
 * e.g. formatPlanChainTokenWithBranchTag('google_gmail', 'true') → 'google_gmail[true]'
 * If branchTag is omitted, returns the nodeType unchanged.
 */
export function formatPlanChainTokenWithBranchTag(nodeType: string, branchTag?: string): string {
  if (branchTag) return `${nodeType}[${branchTag}]`;
  return nodeType;
}

/**
 * Extract the branch tag from an annotated plan token.
 * e.g. extractBranchTag('google_gmail[true]') → 'true'
 *      extractBranchTag('google_gmail')        → undefined
 */
export function extractBranchTag(token: string): string | undefined {
  const match = String(token || '').match(/\[(.+?)\]$/);
  return match ? match[1] : undefined;
}

export function pruneProposedPlanChain(chain: string[] | undefined | null): string[] {
  if (!Array.isArray(chain) || chain.length === 0) return [];
  const firstFork = chain.findIndex((t) => {
    const nt = stripPlanTokenToType(String(t || ''));
    return nt === 'if_else' || nt === 'switch';
  });
  const out: string[] = [];
  let prev: string | undefined;
  chain.forEach((rawItem, idx) => {
    const raw = String(rawItem || '').trim();
    const nt = stripPlanTokenToType(raw);
    if (!nt || !nodeLibrary.isNodeTypeRegistered(nt)) return;
    const pastFork =
      firstFork >= 0 && idx > firstFork && nt !== 'log_output';
    // Allow repeated log_output (one terminal per branch path).
    // After fork: allow consecutive duplicate types (e.g. two gmail on two switch branches).
    if (!pastFork && prev === nt && nt !== 'log_output') return;
    out.push(formatPlanChainToken(raw, nt));
    prev = nt;
  });
  return out;
}
