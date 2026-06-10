/**
 * Unit Tests: node-type-normalizer
 * Day 197: covers normalizeNodeType and normalizeNodeTypeAsync
 */

jest.mock('../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    resolveAlias: jest.fn(),
    has: jest.fn(),
  },
}));

jest.mock('../../nodes/node-library', () => ({
  nodeLibrary: {
    isNodeTypeRegistered: jest.fn(),
    getRegisteredNodeTypes: jest.fn(),
  },
}));

import { normalizeNodeType, normalizeNodeTypeAsync } from '../node-type-normalizer';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { nodeLibrary } from '../../nodes/node-library';

const mockResolveAlias = unifiedNodeRegistry.resolveAlias as jest.Mock;
const mockHas = unifiedNodeRegistry.has as jest.Mock;
const mockIsRegistered = nodeLibrary.isNodeTypeRegistered as jest.Mock;
const mockGetTypes = nodeLibrary.getRegisteredNodeTypes as jest.Mock;

describe('normalizeNodeType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAlias.mockReturnValue(undefined);
    mockHas.mockReturnValue(false);
    mockIsRegistered.mockReturnValue(false);
    mockGetTypes.mockReturnValue([]);
  });

  describe('guard clauses', () => {
    it('returns null unchanged', () => {
      expect(normalizeNodeType(null as any)).toBeNull();
    });

    it('returns undefined unchanged', () => {
      expect(normalizeNodeType(undefined as any)).toBeUndefined();
    });

    it('returns non-string value unchanged', () => {
      expect(normalizeNodeType(42 as any)).toBe(42 as any);
    });

    it('returns empty string unchanged', () => {
      expect(normalizeNodeType('')).toBe('');
    });

    it('returns whitespace-only string unchanged (untrimmed)', () => {
      expect(normalizeNodeType('   ')).toBe('   ');
    });
  });

  describe('alias resolution path', () => {
    it('returns alias-resolved type when registry alias exists and nodeLibrary confirms it', () => {
      mockResolveAlias.mockReturnValue('google_gmail');
      mockIsRegistered.mockImplementation((t: string) => t === 'google_gmail');

      expect(normalizeNodeType('GMAIL')).toBe('google_gmail');
      expect(mockResolveAlias).toHaveBeenCalledWith('gmail');
    });

    it('skips alias when nodeLibrary does not confirm the resolved alias', () => {
      mockResolveAlias.mockReturnValue('google_gmail');
      mockIsRegistered.mockReturnValue(false);

      expect(normalizeNodeType('gmail')).toBe('gmail');
    });

    it('lowercases input before alias lookup', () => {
      mockResolveAlias.mockReturnValue('slack');
      mockIsRegistered.mockImplementation((t: string) => t === 'slack');

      expect(normalizeNodeType('SLACK')).toBe('slack');
      expect(mockResolveAlias).toHaveBeenCalledWith('slack');
    });
  });

  describe('direct lowercase registry path', () => {
    it('returns lowercased type when registry has it and nodeLibrary confirms it', () => {
      mockResolveAlias.mockReturnValue(undefined);
      mockHas.mockImplementation((t: string) => t === 'send_email');
      mockIsRegistered.mockImplementation((t: string) => t === 'send_email');

      expect(normalizeNodeType('Send_Email')).toBe('send_email');
    });

    it('skips direct-lowercase path when nodeLibrary does not confirm', () => {
      mockResolveAlias.mockReturnValue(undefined);
      mockHas.mockImplementation((t: string) => t === 'send_email');
      mockIsRegistered.mockReturnValue(false);

      expect(normalizeNodeType('Send_Email')).toBe('Send_Email');
    });
  });

  describe('original-case nodeLibrary path', () => {
    it('returns original type when nodeLibrary registers it with its original casing', () => {
      mockResolveAlias.mockReturnValue(undefined);
      mockHas.mockReturnValue(false);
      mockIsRegistered.mockImplementation((t: string) => t === 'Send_Email');

      expect(normalizeNodeType('Send_Email')).toBe('Send_Email');
    });
  });

  describe('case-insensitive fallback scan', () => {
    it('returns registered form when a case-insensitive match exists in nodeLibrary', () => {
      mockResolveAlias.mockReturnValue(undefined);
      mockHas.mockReturnValue(false);
      mockIsRegistered.mockReturnValue(false);
      mockGetTypes.mockReturnValue(['google_gmail', 'HTTP_Request', 'if_else']);

      expect(normalizeNodeType('http_request')).toBe('HTTP_Request');
    });

    it('returns trimmed original when no match is found anywhere', () => {
      mockGetTypes.mockReturnValue(['google_gmail', 'if_else']);

      expect(normalizeNodeType('unknown_node_xyz')).toBe('unknown_node_xyz');
    });

    it('trims whitespace before lookup and returns trimmed value on fallback', () => {
      mockGetTypes.mockReturnValue([]);

      expect(normalizeNodeType('  unknown_node  ')).toBe('unknown_node');
    });
  });
});

describe('normalizeNodeTypeAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAlias.mockReturnValue(undefined);
    mockHas.mockReturnValue(false);
    mockIsRegistered.mockReturnValue(false);
    mockGetTypes.mockReturnValue([]);
  });

  it('delegates to normalizeNodeType and resolves with the same result', async () => {
    mockHas.mockImplementation((t: string) => t === 'slack');
    mockIsRegistered.mockImplementation((t: string) => t === 'slack');

    await expect(normalizeNodeTypeAsync('slack')).resolves.toBe('slack');
  });

  it('resolves to original for unknown type', async () => {
    await expect(normalizeNodeTypeAsync('no_such_node')).resolves.toBe('no_such_node');
  });

  it('resolves alias when registry provides one', async () => {
    mockResolveAlias.mockReturnValue('google_sheets');
    mockIsRegistered.mockImplementation((t: string) => t === 'google_sheets');

    await expect(normalizeNodeTypeAsync('sheets')).resolves.toBe('google_sheets');
  });
});
