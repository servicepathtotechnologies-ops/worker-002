import {
  getDefaultSourceHandle,
  getDefaultTargetHandle,
  normalizeHandleId,
  validateAndFixEdgeHandles,
  getDynamicOutputHandles,
} from '../node-handle-registry';

// Mock registry — getAllTypes returns [] so the lazy cache only has the 'default' entry.
// getNodeHandleContract('anything') therefore always returns { inputs: ['input'], outputs: ['output'] }.
jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn().mockReturnValue(undefined),
    getAllTypes: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((type: string) => type),
}));

import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

const mockGet = unifiedNodeRegistry.get as jest.Mock;

describe('node-handle-registry', () => {
  beforeEach(() => {
    mockGet.mockReturnValue(undefined);
  });

  // ── getDefaultSourceHandle ─────────────────────────────────────────────────

  describe('getDefaultSourceHandle', () => {
    test('returns first output from default contract', () => {
      expect(getDefaultSourceHandle('some_node')).toBe('output');
    });
  });

  // ── getDefaultTargetHandle ─────────────────────────────────────────────────

  describe('getDefaultTargetHandle', () => {
    test('returns first input from default contract', () => {
      expect(getDefaultTargetHandle('some_node')).toBe('input');
    });
  });

  // ── normalizeHandleId (source) ─────────────────────────────────────────────

  describe('normalizeHandleId — source', () => {
    test('returns handle as-is when it is already in contract outputs', () => {
      expect(normalizeHandleId('http_request', 'output', true)).toBe('output');
    });

    test('maps alias "data" to "output" via sourceMappings', () => {
      expect(normalizeHandleId('http_request', 'data', true)).toBe('output');
    });

    test('maps alias "result" to "output" via sourceMappings', () => {
      expect(normalizeHandleId('http_request', 'result', true)).toBe('output');
    });

    test('returns default source handle when handle is undefined', () => {
      expect(normalizeHandleId('http_request', undefined, true)).toBe('output');
    });
  });

  // ── normalizeHandleId (target) ─────────────────────────────────────────────

  describe('normalizeHandleId — target', () => {
    test('returns handle as-is when it is already in contract inputs', () => {
      expect(normalizeHandleId('send_email', 'input', false)).toBe('input');
    });

    test('maps alias "data" to "input" via targetMappings', () => {
      expect(normalizeHandleId('send_email', 'data', false)).toBe('input');
    });

    test('maps alias "message" to "input" via targetMappings', () => {
      expect(normalizeHandleId('send_email', 'message', false)).toBe('input');
    });

    test('returns default target handle when handle is undefined', () => {
      expect(normalizeHandleId('send_email', undefined, false)).toBe('input');
    });
  });

  // ── validateAndFixEdgeHandles ──────────────────────────────────────────────

  describe('validateAndFixEdgeHandles', () => {
    test('normalises both source and target handles in a single call', () => {
      const result = validateAndFixEdgeHandles('http_request', 'send_email', 'data', 'message');
      expect(result.sourceHandle).toBe('output');
      expect(result.targetHandle).toBe('input');
    });

    test('preserves already-valid handles without change', () => {
      const result = validateAndFixEdgeHandles('http_request', 'send_email', 'output', 'input');
      expect(result.sourceHandle).toBe('output');
      expect(result.targetHandle).toBe('input');
    });
  });

  // ── getDynamicOutputHandles ────────────────────────────────────────────────

  describe('getDynamicOutputHandles', () => {
    test('returns contract outputs for a non-branching node', () => {
      mockGet.mockReturnValueOnce({ isBranching: false, outgoingPorts: ['output'] });
      const result = getDynamicOutputHandles('http_request');
      expect(result).toEqual(['output']);
    });

    test('returns fixed semantic ports for a branching node with declared outgoingPorts', () => {
      mockGet.mockReturnValueOnce({
        isBranching: true,
        outgoingPorts: ['true', 'false'],
        incomingPorts: ['input'],
      });
      const result = getDynamicOutputHandles('if_else');
      expect(result).toEqual(['true', 'false']);
    });

    test('parses config.cases for a dynamic branching node (no fixed outgoingPorts)', () => {
      mockGet.mockReturnValueOnce({ isBranching: true, outgoingPorts: [] });
      const result = getDynamicOutputHandles('switch_node', {
        cases: [{ value: 'approved' }, { value: 'rejected' }],
      });
      expect(result).toEqual(['approved', 'rejected']);
    });

    test('returns empty array for dynamic branching node with no cases configured', () => {
      mockGet.mockReturnValueOnce({ isBranching: true, outgoingPorts: [] });
      const result = getDynamicOutputHandles('switch_node');
      expect(result).toEqual([]);
    });
  });
});
