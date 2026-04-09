import { describe, expect, it } from '@jest/globals';
import {
  diffWorkflowProtectedConfig,
  diffWorkflowTopology,
  fingerprintWorkflowProtectedConfig,
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

  it('protected-config fingerprint ignores volatile ownership metadata', () => {
    const nodesA = [
      {
        id: 'n1',
        type: 'custom',
        data: {
          type: 'google_gmail',
          config: {
            credentialId: 'cred_a',
            _ownershipUnlock: { from: true },
            _fillMode: { subject: 'runtime_ai' },
            subject: 'Hello',
          },
        },
      },
    ];
    const nodesB = [
      {
        id: 'n1',
        type: 'custom',
        data: {
          type: 'google_gmail',
          config: {
            credentialId: 'cred_b',
            _ownershipUnlock: {},
            _fillMode: { subject: 'manual_static' },
            subject: 'Hello',
          },
        },
      },
    ];
    const a = fingerprintWorkflowProtectedConfig(nodesA);
    const b = fingerprintWorkflowProtectedConfig(nodesB);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(diffWorkflowProtectedConfig(a, b).equal).toBe(true);
  });
});
