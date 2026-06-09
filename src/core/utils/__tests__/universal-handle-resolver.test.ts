// Mock dependencies before import — inline jest.fn() to avoid TDZ
jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
}));

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../branching-node-ports', () => ({
  extractSwitchCasePortNames: jest.fn(),
}));

import { UniversalHandleResolver, universalHandleResolver } from '../universal-handle-resolver';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../unified-node-type-normalizer';
import { extractSwitchCasePortNames } from '../branching-node-ports';

const mockGet = unifiedNodeRegistry.get as jest.Mock;
const mockNormalize = unifiedNormalizeNodeTypeString as jest.Mock;
const mockExtractPorts = extractSwitchCasePortNames as jest.Mock;

describe('UniversalHandleResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalize.mockImplementation((s: string) => s);
    mockGet.mockReturnValue(null);
    mockExtractPorts.mockReturnValue([]);
  });

  // 1. Singleton
  it('getInstance returns the same instance each call', () => {
    const a = UniversalHandleResolver.getInstance();
    const b = UniversalHandleResolver.getInstance();
    expect(a).toBe(b);
    expect(universalHandleResolver).toBe(a);
  });

  // 2–9. resolveSourceHandle
  describe('resolveSourceHandle', () => {
    it('returns fallback output when node not in registry', () => {
      mockGet.mockReturnValue(undefined);
      const result = universalHandleResolver.resolveSourceHandle('unknown_node');
      expect(result.handle).toBe('output');
      expect(result.valid).toBe(false);
    });

    it('uses explicit handle when it is valid', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['true', 'false'], isBranching: true });
      const result = universalHandleResolver.resolveSourceHandle('if_else', 'false');
      expect(result.handle).toBe('false');
      expect(result.valid).toBe(true);
    });

    it('skips invalid explicit handle and falls through to connection type', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['true', 'false'], isBranching: false });
      const result = universalHandleResolver.resolveSourceHandle('if_else', 'bad_handle', 'true');
      expect(result.handle).toBe('true');
      expect(result.valid).toBe(true);
    });

    it('uses connection type when valid', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['main'], isBranching: false });
      const result = universalHandleResolver.resolveSourceHandle('gmail', undefined, 'main');
      expect(result.handle).toBe('main');
      expect(result.valid).toBe(true);
    });

    it('defaults to true handle for branching node with multiple ports', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['true', 'false'], isBranching: true });
      const result = universalHandleResolver.resolveSourceHandle('if_else');
      expect(result.handle).toBe('true');
      expect(result.valid).toBe(true);
    });

    it('falls to false handle when branching node has no true port', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['false', 'case_1'], isBranching: true });
      const result = universalHandleResolver.resolveSourceHandle('if_else');
      expect(result.handle).toBe('false');
      expect(result.valid).toBe(true);
    });

    it('uses first available port for non-branching node', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['output'], isBranching: false });
      const result = universalHandleResolver.resolveSourceHandle('gmail');
      expect(result.handle).toBe('output');
      expect(result.valid).toBe(true);
    });

    it('returns fallback when outgoing ports are empty', () => {
      mockGet.mockReturnValue({ outgoingPorts: [], isBranching: false });
      const result = universalHandleResolver.resolveSourceHandle('broken_node');
      expect(result.handle).toBe('output');
      expect(result.valid).toBe(false);
    });

    it('uses dynamic ports from extractSwitchCasePortNames for switch node with nodeConfig', () => {
      mockNormalize.mockReturnValue('switch');
      mockGet.mockReturnValue({ outgoingPorts: ['output'], isBranching: false });
      mockExtractPorts.mockReturnValue(['case_a', 'case_b']);
      const result = universalHandleResolver.resolveSourceHandle('switch', undefined, undefined, { cases: [] });
      // dynamic ports are ['case_a', 'case_b', 'output'] — first is 'case_a'
      expect(result.handle).toBe('case_a');
      expect(result.valid).toBe(true);
      expect(mockExtractPorts).toHaveBeenCalledWith({ cases: [] });
    });
  });

  // 10–13. resolveTargetHandle
  describe('resolveTargetHandle', () => {
    it('returns fallback input when node not in registry', () => {
      mockGet.mockReturnValue(undefined);
      const result = universalHandleResolver.resolveTargetHandle('unknown_node');
      expect(result.handle).toBe('input');
      expect(result.valid).toBe(false);
    });

    it('uses explicit target handle when valid', () => {
      mockGet.mockReturnValue({ incomingPorts: ['input'] });
      const result = universalHandleResolver.resolveTargetHandle('gmail', 'input');
      expect(result.handle).toBe('input');
      expect(result.valid).toBe(true);
    });

    it('skips invalid explicit handle and uses first incoming port', () => {
      mockGet.mockReturnValue({ incomingPorts: ['input'] });
      const result = universalHandleResolver.resolveTargetHandle('gmail', 'bad_target');
      expect(result.handle).toBe('input');
      expect(result.valid).toBe(true);
    });

    it('returns fallback when no incoming ports exist', () => {
      mockGet.mockReturnValue({ incomingPorts: [] });
      const result = universalHandleResolver.resolveTargetHandle('broken_node');
      expect(result.handle).toBe('input');
      expect(result.valid).toBe(false);
    });
  });

  // 14. validateHandleCompatibility
  describe('validateHandleCompatibility', () => {
    it('returns false when source node not in registry', () => {
      mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce({ incomingPorts: ['input'] });
      expect(
        universalHandleResolver.validateHandleCompatibility('bad', 'output', 'gmail', 'input')
      ).toBe(false);
    });

    it('returns false when target node not in registry', () => {
      mockGet.mockReturnValueOnce({ outgoingPorts: ['output'] }).mockReturnValueOnce(undefined);
      expect(
        universalHandleResolver.validateHandleCompatibility('trigger', 'output', 'bad', 'input')
      ).toBe(false);
    });

    it('returns true when both source and target handles are valid', () => {
      mockGet
        .mockReturnValueOnce({ outgoingPorts: ['output'] })
        .mockReturnValueOnce({ incomingPorts: ['input'] });
      expect(
        universalHandleResolver.validateHandleCompatibility('trigger', 'output', 'gmail', 'input')
      ).toBe(true);
    });

    it('returns false when source handle is not in outgoing ports', () => {
      mockGet
        .mockReturnValueOnce({ outgoingPorts: ['true', 'false'] })
        .mockReturnValueOnce({ incomingPorts: ['input'] });
      expect(
        universalHandleResolver.validateHandleCompatibility('if_else', 'output', 'gmail', 'input')
      ).toBe(false);
    });
  });

  // 15. getValidSourceHandles / getValidTargetHandles
  describe('getValidSourceHandles and getValidTargetHandles', () => {
    it('returns outgoing ports for a known node', () => {
      mockGet.mockReturnValue({ outgoingPorts: ['output'] });
      expect(universalHandleResolver.getValidSourceHandles('gmail')).toEqual(['output']);
    });

    it('returns empty array for unknown source node', () => {
      mockGet.mockReturnValue(undefined);
      expect(universalHandleResolver.getValidSourceHandles('unknown')).toEqual([]);
    });

    it('returns incoming ports via getValidTargetHandles', () => {
      mockGet.mockReturnValue({ incomingPorts: ['input'] });
      expect(universalHandleResolver.getValidTargetHandles('gmail')).toEqual(['input']);
    });

    it('returns empty array for unknown target node', () => {
      mockGet.mockReturnValue(undefined);
      expect(universalHandleResolver.getValidTargetHandles('unknown')).toEqual([]);
    });
  });
});
