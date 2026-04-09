/**
 * Documents topology-only freeze: node config value changes must not alter topology fingerprint.
 */
import { describe, it, expect } from '@jest/globals';
import { fingerprintWorkflowTopology } from '../workflow-topology-fingerprint';

describe('freeze policy — topology fingerprint', () => {
  it('is unchanged when only node.data.config field values change (same ids, same edges)', () => {
    const edges: any[] = [];
    const nodesA = [
      {
        id: 'n1',
        type: 'slack_message',
        data: { type: 'slack_message', config: { message: 'a', channel: 'x' } },
      },
    ];
    const nodesB = [
      {
        id: 'n1',
        type: 'slack_message',
        data: { type: 'slack_message', config: { message: 'b', channel: 'y' } },
      },
    ];
    expect(fingerprintWorkflowTopology(nodesA, edges).fingerprint).toBe(
      fingerprintWorkflowTopology(nodesB, edges).fingerprint
    );
  });
});
