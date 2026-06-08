import {
  buildPositionSnapshotFromNodes,
  coerceWorkflowNodePosition,
  mergePreservedNodePositions,
} from '../workflow-node-position';

describe('workflow node position utilities', () => {
  describe('coerceWorkflowNodePosition', () => {
    it('accepts finite numbers and numeric strings', () => {
      expect(coerceWorkflowNodePosition({ x: 12, y: -4 })).toEqual({ x: 12, y: -4 });
      expect(coerceWorkflowNodePosition({ x: ' 10.5 ', y: '0' })).toEqual({ x: 10.5, y: 0 });
    });

    it('rejects invalid positions', () => {
      const invalidPositions = [
        null,
        undefined,
        {},
        { x: '', y: 1 },
        { x: 'Infinity', y: 1 },
        { x: Number.NaN, y: 1 },
        { x: 1, y: 'nope' },
      ];

      for (const position of invalidPositions) {
        expect(coerceWorkflowNodePosition(position)).toBeNull();
      }
    });
  });

  describe('buildPositionSnapshotFromNodes', () => {
    it('captures only valid node positions and stringifies ids', () => {
      const snapshot = buildPositionSnapshotFromNodes([
        { id: 'email', position: { x: '20', y: '30' } },
        { id: 7, position: { x: 1, y: 2 } },
        { id: 'bad-position', position: { x: 'left', y: 4 } },
        { position: { x: 5, y: 6 } },
        null,
      ]);

      expect(Array.from(snapshot.entries())).toEqual([
        ['email', { x: 20, y: 30 }],
        ['7', { x: 1, y: 2 }],
      ]);
    });

    it('returns an empty snapshot for non-array input', () => {
      expect(buildPositionSnapshotFromNodes(null).size).toBe(0);
      expect(buildPositionSnapshotFromNodes(undefined).size).toBe(0);
      expect(buildPositionSnapshotFromNodes({ nodes: [] } as unknown as unknown[]).size).toBe(0);
    });
  });

  describe('mergePreservedNodePositions', () => {
    it('keeps and normalizes valid current positions before consulting the snapshot', () => {
      const merged = mergePreservedNodePositions(
        [{ id: 'kept', position: { x: '8', y: '9' }, data: { label: 'Kept' } }],
        new Map([['kept', { x: 100, y: 200 }]])
      );

      expect(merged).toEqual([
        { id: 'kept', position: { x: 8, y: 9 }, data: { label: 'Kept' } },
      ]);
    });

    it('restores missing positions from the snapshot and defaults unresolved nodes', () => {
      const merged = mergePreservedNodePositions(
        [
          { id: 'restored', position: null },
          { id: 'defaulted', position: { x: 'bad', y: 1 } },
        ],
        new Map([['restored', { x: 30, y: 40 }]])
      );

      expect(merged).toEqual([
        { id: 'restored', position: { x: 30, y: 40 } },
        { id: 'defaulted', position: { x: 0, y: 0 } },
      ]);
    });
  });
});
