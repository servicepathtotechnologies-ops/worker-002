import { describe, expect, it } from 'vitest';
import {
  diffWorkflowTopology,
  fingerprintWorkflowTopology,
} from '../workflow-topology-fingerprint';

describe('workflow-topology-fingerprint', () => {
  it('fingerprint is stable for same node/edge set', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { id: 'e1', source: 'a', target: 'b', type: 'default' },
    ];
    const a = fingerprintWorkflowTopology(nodes, edges);
    const b = fingerprintWorkflowTopology(nodes, edges);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('diff detects added node', () => {
    const base = fingerprintWorkflowTopology([{ id: 'a' }], []);
    const cur = fingerprintWorkflowTopology([{ id: 'a' }, { id: 'b' }], []);
    const d = diffWorkflowTopology(base, cur);
    expect(d.equal).toBe(false);
    expect(d.addedNodeIds).toContain('b');
  });
});
