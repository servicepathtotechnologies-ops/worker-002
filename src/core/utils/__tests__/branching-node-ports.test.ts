import { describe, expect, it } from '@jest/globals';
import { extractSwitchCasePortNames, getBranchOutgoingPortsForNode } from '../branching-node-ports';

describe('branching-node-ports', () => {
  it('extracts switch ports from cases', () => {
    expect(
      extractSwitchCasePortNames({
        cases: [{ value: 'a' }, { value: 'b' }],
      })
    ).toEqual(['a', 'b']);
  });

  it('extracts ports from legacy rules field', () => {
    expect(extractSwitchCasePortNames({ rules: [{ value: 'x', label: 'X' }] })).toEqual(['x']);
  });

  it('getBranchOutgoingPortsForNode uses config for switch', () => {
    const ports = getBranchOutgoingPortsForNode(
      'switch',
      { cases: [{ value: 'p1' }, { value: 'p2' }] },
      []
    );
    expect(ports).toEqual(['p1', 'p2']);
  });

  it('getBranchOutgoingPortsForNode returns true/false for if_else', () => {
    expect(getBranchOutgoingPortsForNode('if_else', {}, ['output'])).toEqual(['true', 'false']);
  });

  it('getBranchOutgoingPortsForNode uses output fallback when switch has no cases', () => {
    expect(getBranchOutgoingPortsForNode('switch', {}, [])).toEqual(['output']);
  });
});
