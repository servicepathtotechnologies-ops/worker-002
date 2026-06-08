import {
  assertValidNodeType,
  assertValidNodeTypes,
  isValidNodeType,
  getValidNodeTypes,
} from '../node-authority';

const MOCK_VALID_TYPES = ['trigger', 'send_email', 'http_request'] as const;

jest.mock('../../../services/nodes/node-library', () => ({
  CANONICAL_NODE_TYPES: ['trigger', 'send_email', 'http_request'],
  isValidCanonicalNodeType: (t: string) =>
    ['trigger', 'send_email', 'http_request'].includes(t),
}));

describe('node-authority', () => {
  describe('assertValidNodeType', () => {
    it('throws on empty string', () => {
      expect(() => assertValidNodeType('')).toThrow(/non-empty string/);
    });

    it('throws on null', () => {
      expect(() => assertValidNodeType(null as unknown as string)).toThrow(
        /non-empty string/
      );
    });

    it('throws on non-string (number)', () => {
      expect(() => assertValidNodeType(42 as unknown as string)).toThrow(
        /non-empty string/
      );
    });

    it('throws on unknown type and includes [NodeAuthority] prefix', () => {
      expect(() => assertValidNodeType('ghost_node')).toThrow(
        /\[NodeAuthority\]/
      );
    });

    it('throws on unknown type and includes the bad type in the message', () => {
      expect(() => assertValidNodeType('ghost_node')).toThrow(/ghost_node/);
    });

    it('does not throw for a valid canonical type', () => {
      expect(() => assertValidNodeType('trigger')).not.toThrow();
    });

    it('does not throw for each mocked valid type', () => {
      for (const t of MOCK_VALID_TYPES) {
        expect(() => assertValidNodeType(t)).not.toThrow();
      }
    });
  });

  describe('assertValidNodeTypes', () => {
    it('throws when array contains an invalid type', () => {
      expect(() => assertValidNodeTypes(['trigger', 'bad_type'])).toThrow(
        /\[NodeAuthority\]/
      );
    });

    it('throws on the first invalid element', () => {
      expect(() => assertValidNodeTypes(['bad_one', 'trigger'])).toThrow(
        /bad_one/
      );
    });

    it('does not throw for an all-valid array', () => {
      expect(() =>
        assertValidNodeTypes(['trigger', 'send_email', 'http_request'])
      ).not.toThrow();
    });

    it('does not throw for an empty array', () => {
      expect(() => assertValidNodeTypes([])).not.toThrow();
    });
  });

  describe('isValidNodeType', () => {
    it('returns true for a valid type', () => {
      expect(isValidNodeType('send_email')).toBe(true);
    });

    it('returns false for an unknown type', () => {
      expect(isValidNodeType('hallucinated_node')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isValidNodeType('')).toBe(false);
    });
  });

  describe('getValidNodeTypes', () => {
    it('returns the mocked canonical types array', () => {
      const types = getValidNodeTypes();
      expect(types).toEqual(['trigger', 'send_email', 'http_request']);
    });

    it('result contains the known valid types', () => {
      const types = getValidNodeTypes();
      expect(types).toContain('trigger');
      expect(types).toContain('send_email');
    });
  });
});
