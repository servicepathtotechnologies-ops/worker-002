/**
 * Coerce React Flow node positions from JSON/DB (numeric strings must not break layout).
 */

export function coerceWorkflowNodePosition(position: unknown): { x: number; y: number } | null {
  if (!position || typeof position !== 'object') return null;
  const p = position as Record<string, unknown>;
  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const x = toNum(p.x);
  const y = toNum(p.y);
  if (x === null || y === null) return null;
  return { x, y };
}

/**
 * Merge positions from a snapshot (e.g. DB row as loaded) onto normalized nodes when current position is missing.
 */
export function mergePreservedNodePositions(
  nodes: any[],
  snapshotById: Map<string, { x: number; y: number }>
): any[] {
  return nodes.map((n) => {
    const cur = coerceWorkflowNodePosition(n?.position);
    if (cur) {
      return { ...n, position: cur };
    }
    const fb = snapshotById.get(n.id);
    if (fb) {
      return { ...n, position: fb };
    }
    return { ...n, position: cur ?? { x: 0, y: 0 } };
  });
}

export function buildPositionSnapshotFromNodes(nodes: unknown[] | null | undefined): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (!Array.isArray(nodes)) return map;
  for (const n of nodes) {
    if (!n || typeof n !== 'object' || !(n as any).id) continue;
    const c = coerceWorkflowNodePosition((n as any).position);
    if (c) {
      map.set(String((n as any).id), c);
    }
  }
  return map;
}
