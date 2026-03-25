import { describe, expect, it } from '@jest/globals';
import {
  unifiedNormalizeNodeTypeString,
  unifiedNormalizeNodeTypeWithInfo,
} from '../unified-node-type-normalizer';

describe('unified-node-type-normalizer startup safety', () => {
  it('does not throw when service is unavailable at load time', () => {
    expect(() => unifiedNormalizeNodeTypeString('if_else')).not.toThrow();
  });

  it('returns info object with normalization metadata', () => {
    const info = unifiedNormalizeNodeTypeWithInfo('manual_trigger');
    expect(typeof info.normalized).toBe('string');
    expect(typeof info.valid).toBe('boolean');
    expect(typeof info.method).toBe('string');
  });
});
