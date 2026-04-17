import { describe, expect, it, jest } from '@jest/globals';
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

  it('uses unrecognized_type method for unknown aliases', () => {
    const info = unifiedNormalizeNodeTypeWithInfo('customm');
    expect(info.valid).toBe(false);
    expect(info.method).toBe('unrecognized_type');
  });

  it('suppresses per-alias warning in startup phase and aggregates later', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    unifiedNormalizeNodeTypeString('customm', { phase: 'startup', suppressUnknownWarning: true });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Runtime unknown node type')
    );
    warnSpy.mockRestore();
  });
});
