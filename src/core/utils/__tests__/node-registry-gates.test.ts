import { describe, expect, it } from '@jest/globals';
import { formatGateViolations, runNodeRegistryGates } from '../node-registry-gates';

describe('node-registry-gates', () => {
  it('passes with zero violations on the unified registry', () => {
    const v = runNodeRegistryGates();
    if (v.length > 0) {
      // eslint-disable-next-line no-console
      console.error(formatGateViolations(v));
    }
    expect(v).toEqual([]);
  });
});
