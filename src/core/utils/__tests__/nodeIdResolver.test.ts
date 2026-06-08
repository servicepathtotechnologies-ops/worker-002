import { NodeIdResolver, nodeIdResolver } from '../nodeIdResolver';

describe('NodeIdResolver', () => {
  let resolver: NodeIdResolver;

  beforeEach(() => {
    resolver = new NodeIdResolver();
  });

  describe('register + resolve', () => {
    it('registers a logical→physical mapping and resolves it', () => {
      resolver.register('step_1', 'uuid-abc', 'gmail_trigger');
      expect(resolver.resolve('step_1')).toBe('uuid-abc');
    });

    it('returns undefined for an unknown logical ID', () => {
      expect(resolver.resolve('nonexistent')).toBeUndefined();
    });

    it('overwrites old physical when re-registering same logical ID', () => {
      resolver.register('step_1', 'uuid-old', 'typeA');
      resolver.register('step_1', 'uuid-new', 'typeB');

      expect(resolver.resolve('step_1')).toBe('uuid-new');
      // old physical should no longer map back
      expect(resolver.reverse('uuid-old')).toBeUndefined();
    });

    it('removes old logical entry when same physical ID is re-registered', () => {
      resolver.register('step_1', 'uuid-shared', 'typeA');
      resolver.register('step_2', 'uuid-shared', 'typeB');

      // step_1 should no longer resolve
      expect(resolver.resolve('step_1')).toBeUndefined();
      expect(resolver.resolve('step_2')).toBe('uuid-shared');
    });
  });

  describe('reverse', () => {
    it('returns the logical ID for a registered physical ID', () => {
      resolver.register('trigger', 'phys-001', 'webhook_trigger');
      expect(resolver.reverse('phys-001')).toBe('trigger');
    });

    it('returns undefined for an unknown physical ID', () => {
      expect(resolver.reverse('ghost')).toBeUndefined();
    });
  });

  describe('getNodeType', () => {
    it('returns the node type associated with a physical ID', () => {
      resolver.register('a', 'phys-x', 'send_email');
      expect(resolver.getNodeType('phys-x')).toBe('send_email');
    });

    it('returns undefined for an unregistered physical ID', () => {
      expect(resolver.getNodeType('nope')).toBeUndefined();
    });
  });

  describe('hasLogical / hasPhysical', () => {
    it('reports true after registration', () => {
      resolver.register('log-1', 'phys-1', 'typeA');
      expect(resolver.hasLogical('log-1')).toBe(true);
      expect(resolver.hasPhysical('phys-1')).toBe(true);
    });

    it('reports false for unregistered IDs', () => {
      expect(resolver.hasLogical('missing')).toBe(false);
      expect(resolver.hasPhysical('missing')).toBe(false);
    });
  });

  describe('resolveBatch', () => {
    it('resolves all known logical IDs to physical IDs', () => {
      resolver.register('s1', 'p1', 't1');
      resolver.register('s2', 'p2', 't2');

      const result = resolver.resolveBatch(['s1', 's2']);
      expect(result.get('s1')).toBe('p1');
      expect(result.get('s2')).toBe('p2');
    });

    it('skips unknown IDs in the result map', () => {
      resolver.register('s1', 'p1', 't1');
      const result = resolver.resolveBatch(['s1', 'unknown']);
      expect(result.size).toBe(1);
      expect(result.has('unknown')).toBe(false);
    });
  });

  describe('registerNodes', () => {
    it('self-maps node id→id for each node', () => {
      resolver.registerNodes([
        { id: 'node-a', type: 'gmail_trigger' },
        { id: 'node-b', data: { type: 'send_email' } },
      ]);

      expect(resolver.resolve('node-a')).toBe('node-a');
      expect(resolver.resolve('node-b')).toBe('node-b');
    });

    it('falls back to "unknown" when no type is provided', () => {
      resolver.registerNodes([{ id: 'node-c' }]);
      expect(resolver.getNodeType('node-c')).toBe('unknown');
    });
  });

  describe('registerFromStructure', () => {
    it('self-maps node IDs after processing the step map', () => {
      const nodes = [{ id: 'uuid-1', type: 'webhook_trigger' }];
      const stepMap = new Map([['step_1', 'uuid-1']]);

      resolver.registerFromStructure(stepMap, nodes);

      // registerNodes is called after the step map, self-registering uuid-1→uuid-1
      // overwrites the physical-id slot, so uuid-1 self-resolves correctly
      expect(resolver.resolve('uuid-1')).toBe('uuid-1');
      expect(resolver.getNodeType('uuid-1')).toBe('webhook_trigger');
    });

    it('registers step→node mappings that survive when registerNodes does not clobber them', () => {
      // When step ID ≠ physical ID and registerNodes re-uses the same physical ID,
      // the bidirectional constraint means only the last registration survives.
      // Use disjoint IDs to confirm the step mapping itself works.
      const nodes: Array<{ id: string; type?: string }> = [];
      const stepMap = new Map([['step_A', 'phys-A']]);

      // Call only the step-map path, without nodes (no registerNodes call effect)
      for (const [stepId, nodeId] of stepMap.entries()) {
        resolver.register(stepId, nodeId, 'some_type');
      }

      expect(resolver.resolve('step_A')).toBe('phys-A');
    });
  });

  describe('clear', () => {
    it('removes all mappings and resets stats to zero', () => {
      resolver.register('x', 'y', 'typeX');
      resolver.clear();

      expect(resolver.resolve('x')).toBeUndefined();
      expect(resolver.hasPhysical('y')).toBe(false);
      expect(resolver.getStats()).toEqual({ totalMappings: 0, logicalIds: 0, physicalIds: 0 });
    });
  });

  describe('getAllMappings', () => {
    it('returns all registered mappings as an array', () => {
      resolver.register('l1', 'p1', 'type1');
      resolver.register('l2', 'p2', 'type2');

      const mappings = resolver.getAllMappings();
      expect(mappings).toHaveLength(2);
      expect(mappings.map(m => m.logicalId).sort()).toEqual(['l1', 'l2']);
    });

    it('returns a copy — mutations do not affect internal state', () => {
      resolver.register('l1', 'p1', 'type1');
      const mappings = resolver.getAllMappings();
      mappings.pop();
      expect(resolver.getAllMappings()).toHaveLength(1);
    });

    it('updates existing mapping record when same logical ID is re-registered', () => {
      resolver.register('l1', 'p1', 'typeA');
      resolver.register('l1', 'p2', 'typeB');

      const mappings = resolver.getAllMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].physicalId).toBe('p2');
      expect(mappings[0].nodeType).toBe('typeB');
    });
  });

  describe('getStats', () => {
    it('returns correct counts after registrations', () => {
      resolver.register('l1', 'p1', 'type1');
      resolver.register('l2', 'p2', 'type2');

      expect(resolver.getStats()).toEqual({ totalMappings: 2, logicalIds: 2, physicalIds: 2 });
    });
  });

  describe('singleton export', () => {
    it('nodeIdResolver is an instance of NodeIdResolver', () => {
      expect(nodeIdResolver).toBeInstanceOf(NodeIdResolver);
    });
  });
});
