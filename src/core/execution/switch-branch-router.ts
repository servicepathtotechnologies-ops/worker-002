/**
 * Universal switch → outgoing-edge resolution for execution and orchestration.
 *
 * Graphs may label branch edges as semantic values (e.g. "success"), indexed ports
 * (`case_1`, `case_2`), explicit `branchName` / `sourceIndex` / `isDefault`, or a mix.
 * Switch node outputs carry `matchedCase` (string | null) and optionally `expressionValue`.
 */

import type { WorkflowEdge } from '../types/ai-types';

export class SwitchRoutingError extends Error {
  constructor(
    message: string,
    public readonly switchNodeId: string,
    public readonly availableBranches: string[]
  ) {
    super(message);
    this.name = 'SwitchRoutingError';
  }
}

/** Minimal node shape for reading switch `cases` config. */
export interface SwitchRouterNode {
  id: string;
  type?: string;
  data?: { type?: string; config?: Record<string, unknown> };
}

export function parseCaseHandleIndex(sourceHandleOrType: string | undefined): number | null {
  if (!sourceHandleOrType) return null;
  const m = /^case_(\d+)$/i.exec(String(sourceHandleOrType).trim());
  if (!m) return null;
  return parseInt(m[1], 10) - 1;
}

/** Ordered case values (index 0 = case_1 / first branch). */
export function orderedSwitchCaseValues(config?: Record<string, unknown>): string[] {
  if (!config) return [];
  try {
    const casesRaw = config.cases ?? config.rules ?? [];
    let cases: Array<{ value?: string } | string> = [];
    if (typeof casesRaw === 'string') {
      const parsed = JSON.parse(casesRaw);
      if (Array.isArray(parsed)) cases = parsed;
    } else if (Array.isArray(casesRaw)) {
      cases = casesRaw;
    }
    const values: string[] = [];
    for (const c of cases) {
      const raw = typeof c === 'string' ? c : c?.value != null ? String(c.value) : '';
      const value = raw.trim();
      if (value) values.push(value);
    }
    return values;
  } catch {
    return [];
  }
}

function normalizeSwitchString(a: string): string {
  return a.trim();
}

function stringsMatchCase(a: string, b: string): boolean {
  const x = normalizeSwitchString(a);
  const y = normalizeSwitchString(b);
  if (x === y) return true;
  if (x.length === 0 || y.length === 0) return false;
  return x.toLowerCase() === y.toLowerCase();
}

function stableSortOutgoingEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  return [...edges].sort((a, b) => a.id.localeCompare(b.id));
}

function coerceSwitchNumber(expressionValue: unknown, matchedCase: string | null): number | undefined {
  if (typeof expressionValue === 'number' && !Number.isNaN(expressionValue)) {
    return expressionValue;
  }
  if (typeof expressionValue === 'string') {
    const t = expressionValue.trim();
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  }
  if (matchedCase != null) {
    const t = String(matchedCase).trim();
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  }
  return undefined;
}

/**
 * Resolves which outgoing edge from a switch should run for the given output.
 *
 * Priority:
 * 1. edge.branchName === string output (matched case / semantic)
 * 2. edge.sourceIndex === numeric output OR case_N index matches numeric output
 * 3. edge.isDefault === true
 * 4. last outgoing edge (stable order)
 *
 * @returns Winning edge id, or `null` if there are no outgoing edges.
 */
export function resolveWinningSwitchEdgeId(options: {
  switchNode: SwitchRouterNode;
  allEdges: WorkflowEdge[];
  matchedCase: string | null;
  expressionValue?: unknown;
}): string | null {
  const { switchNode, allEdges, matchedCase, expressionValue } = options;
  const outEdges = stableSortOutgoingEdges(allEdges.filter(e => e.source === switchNode.id));
  if (outEdges.length === 0) return null;

  const caseValues = orderedSwitchCaseValues(
    (switchNode.data?.config || {}) as Record<string, unknown>
  );
  const switchOutStr =
    matchedCase != null && matchedCase !== undefined ? String(matchedCase) : '';
  const switchOutNum = coerceSwitchNumber(expressionValue, matchedCase);

  const branchNameOf = (e: WorkflowEdge): string | undefined =>
    (e as WorkflowEdge & { branchName?: string }).branchName
    ?? (e as any).data?.branchName;

  const explicitSourceIndex = (e: WorkflowEdge): number | undefined => {
    const raw = (e as WorkflowEdge & { sourceIndex?: number }).sourceIndex;
    return typeof raw === 'number' && !Number.isNaN(raw) ? raw : undefined;
  };

  const isDefaultEdge = (e: WorkflowEdge): boolean =>
    (e as WorkflowEdge & { isDefault?: boolean }).isDefault === true;

  const handle = (e: WorkflowEdge): string =>
    String(e.sourceHandle || e.type || '').trim();

  // 1) branchName === string output
  if (switchOutStr.length > 0) {
    for (const e of outEdges) {
      const bn = branchNameOf(e);
      if (bn != null && stringsMatchCase(String(bn), switchOutStr)) {
        return e.id;
      }
    }
    // 1b) sourceHandle / type equals semantic value
    for (const e of outEdges) {
      const h = handle(e);
      if (h && !/^case_\d+$/i.test(h) && stringsMatchCase(h, switchOutStr)) {
        return e.id;
      }
    }
    // 1c) case_N → caseValues[N] matches output
    for (const e of outEdges) {
      const idx = parseCaseHandleIndex(handle(e) || undefined);
      if (idx !== null && idx >= 0 && idx < caseValues.length) {
        if (stringsMatchCase(caseValues[idx], switchOutStr)) {
          return e.id;
        }
      }
    }
    // 1d) Edge ID embeds the case value (format: `${switchId}-${caseValue}-${targetId}`).
    // Covers pre-fix workflows where branchName/sourceHandle were stripped by the frontend
    // but the edge ID was generated by wireSwitchCaseEdges and still contains the case value.
    for (const e of outEdges) {
      if (e.id.toLowerCase().includes(`-${switchOutStr.toLowerCase()}-`)) {
        console.warn('[SwitchRouter] ID-substring match for matchedCase=%s → edge %s', switchOutStr, e.id);
        return e.id;
      }
    }
  }

  // 2) Numeric / sourceIndex
  if (switchOutNum !== undefined && !Number.isNaN(switchOutNum)) {
    for (const e of outEdges) {
      const si = explicitSourceIndex(e);
      if (si !== undefined && si === switchOutNum) {
        return e.id;
      }
    }
    for (const e of outEdges) {
      const idx = parseCaseHandleIndex(handle(e) || undefined);
      if (idx !== null && idx === switchOutNum) {
        return e.id;
      }
    }
  }

  // 3) Positional fallback: matchedCase is at position N in the ordered case values →
  // use the N-th outgoing edge. Handles edges where sourceHandle is missing/generic
  // (e.g. all "main") but the edge ORDER matches the case declaration order.
  if (switchOutStr.length > 0 && caseValues.length > 0) {
    const caseIdx = caseValues.findIndex((cv) => stringsMatchCase(cv, switchOutStr));
    if (caseIdx !== -1 && caseIdx < outEdges.length) {
      console.warn(
        '[SwitchRouter] Positional fallback: no semantic/case_N match for matchedCase=%s — using outEdges[%d] (edge %s)',
        switchOutStr, caseIdx, outEdges[caseIdx].id,
      );
      return outEdges[caseIdx].id;
    }
  }

  // 4) No string/number match (including null matchedCase): default edge
  for (const e of outEdges) {
    if (isDefaultEdge(e)) return e.id;
  }

  // 5) Last edge (never drop execution when at least one edge exists)
  console.warn(
    '[SwitchRouter] Last-edge fallback for switch %s — matchedCase=%s did not match any branch. Routing to last edge: %s. Edge sourceHandles: [%s]',
    switchNode.id, switchOutStr, outEdges[outEdges.length - 1].id,
    outEdges.map((e) => handle(e) || '(empty)').join(', '),
  );
  return outEdges[outEdges.length - 1].id;
}

/**
 * Throws only when the switch has no outgoing edges; otherwise always returns an edge id.
 */
export function resolveWinningSwitchEdgeIdOrThrow(options: Parameters<typeof resolveWinningSwitchEdgeId>[0]): string {
  const id = resolveWinningSwitchEdgeId(options);
  if (id === null) {
    const outs = options.allEdges.filter(e => e.source === options.switchNode.id);
    throw new SwitchRoutingError(
      'no matching branch for switch output (no outgoing edges)',
      options.switchNode.id,
      outs.map(e => e.id)
    );
  }
  return id;
}

/**
 * For skip logic: `true` if this incoming edge is NOT the winning branch from its switch source.
 */
export function shouldSkipForSwitchIncomingEdge(
  edge: WorkflowEdge,
  switchNode: SwitchRouterNode,
  allEdges: WorkflowEdge[],
  matchedCase: string | null,
  expressionValue?: unknown
): boolean {
  const winning = resolveWinningSwitchEdgeId({
    switchNode,
    allEdges,
    matchedCase,
    expressionValue,
  });
  if (winning === null) return true;
  return edge.id !== winning;
}
