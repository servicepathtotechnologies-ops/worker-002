/**
 * Normalize planner / summarize proposedNodeChain before plan-driven build:
 * drop unknown types, collapse consecutive duplicates, preserve order.
 */

import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export function pruneProposedPlanChain(chain: string[] | undefined | null): string[] {
  if (!Array.isArray(chain) || chain.length === 0) return [];
  const out: string[] = [];
  let prev: string | undefined;
  for (const raw of chain) {
    const nt = unifiedNormalizeNodeTypeString(String(raw || '').trim()) || String(raw || '').trim();
    if (!nt || !nodeLibrary.isNodeTypeRegistered(nt)) continue;
    // Allow repeated log_output (one terminal per branch path); still collapse other consecutive dupes.
    if (prev === nt && nt !== 'log_output') continue;
    out.push(nt);
    prev = nt;
  }
  return out;
}
