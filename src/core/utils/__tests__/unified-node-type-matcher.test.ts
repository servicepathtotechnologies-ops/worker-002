jest.mock('../../registry/semantic-node-equivalence-registry', () => ({
  semanticNodeEquivalenceRegistry: {
    areEquivalent: jest.fn(),
    getCanonicalType: jest.fn(),
    findSemanticDuplicate: jest.fn(),
  },
}));

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeTypeString: jest.fn((s: string) => s),
}));

import {
  unifiedNodeTypeMatcher,
  matchesNodeType,
  isRequirementSatisfiedBy,
} from '../unified-node-type-matcher';
import { semanticNodeEquivalenceRegistry } from '../../registry/semantic-node-equivalence-registry';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../unified-node-type-normalizer';

const mockAreEquivalent = semanticNodeEquivalenceRegistry.areEquivalent as jest.Mock;
const mockGetCanonicalType = semanticNodeEquivalenceRegistry.getCanonicalType as jest.Mock;
const mockFindSemanticDuplicate = semanticNodeEquivalenceRegistry.findSemanticDuplicate as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;
const mockNormalize = unifiedNormalizeNodeTypeString as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  unifiedNodeTypeMatcher.clearCache();
  mockNormalize.mockImplementation((s: string) => s);
  mockAreEquivalent.mockReturnValue(false);
  mockGetCanonicalType.mockImplementation((s: string) => s);
  mockFindSemanticDuplicate.mockReturnValue(undefined);
  mockRegistryGet.mockReturnValue(undefined);
});

describe('matches() — guard clauses', () => {
  it('returns no-match when type1 is empty', () => {
    const result = unifiedNodeTypeMatcher.matches('', 'webhook_trigger');
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('returns no-match when type2 is empty', () => {
    const result = unifiedNodeTypeMatcher.matches('webhook_trigger', '');
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

describe('matches() — strict mode', () => {
  it('returns confidence 100 for identical types in strict mode', () => {
    const result = unifiedNodeTypeMatcher.matches('webhook_trigger', 'webhook_trigger', { strict: true });
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(100);
  });

  it('returns no-match for different types in strict mode', () => {
    const result = unifiedNodeTypeMatcher.matches('webhook_trigger', 'http_request', { strict: true });
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

describe('matches() — exact match (step 1)', () => {
  it('returns confidence 100 and canonicalType for identical types', () => {
    const result = unifiedNodeTypeMatcher.matches('send_email', 'send_email');
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(100);
    expect(result.canonicalType).toBe('send_email');
  });
});

describe('matches() — semantic equivalence (step 2)', () => {
  it('returns confidence 90 when types are semantically equivalent', () => {
    mockAreEquivalent.mockReturnValue(true);
    mockGetCanonicalType.mockReturnValue('google_gemini');
    const result = unifiedNodeTypeMatcher.matches('gemini_pro', 'google_gemini');
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(90);
    expect(result.canonicalType).toBe('google_gemini');
  });
});

describe('matches() — category-based match (step 3)', () => {
  it('returns confidence 80 when both nodes share the same category', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue({ category: 'ai' });
    const result = unifiedNodeTypeMatcher.matches('gemini_pro', 'openai_chat');
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(80);
  });

  it('returns no-match when nodes are in different categories', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'send_email') return { category: 'communication' };
      if (type === 'openai_chat') return { category: 'ai' };
      return undefined;
    });
    const result = unifiedNodeTypeMatcher.matches('send_email', 'openai_chat');
    expect(result.matches).toBe(false);
  });
});

describe('matches() — partial/contains match (step 4)', () => {
  it('returns confidence 70 when one type string contains the other', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    const result = unifiedNodeTypeMatcher.matches('webhook', 'webhook_trigger');
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(70);
  });
});

describe('matches() — no match', () => {
  it('returns confidence 0 when no matching strategy applies', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    const result = unifiedNodeTypeMatcher.matches('send_email', 'http_request');
    expect(result.matches).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

describe('cache behaviour', () => {
  it('returns cached result on second call without re-running matching logic', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    unifiedNodeTypeMatcher.matches('send_email', 'http_request');
    unifiedNodeTypeMatcher.matches('send_email', 'http_request');
    expect(mockAreEquivalent).toHaveBeenCalledTimes(1);
  });

  it('getCacheStats() reflects number of cached entries', () => {
    unifiedNodeTypeMatcher.clearCache();
    expect(unifiedNodeTypeMatcher.getCacheStats().size).toBe(0);
    unifiedNodeTypeMatcher.matches('send_email', 'http_request');
    expect(unifiedNodeTypeMatcher.getCacheStats().size).toBe(1);
  });
});

describe('isRequirementSatisfied()', () => {
  it('returns no-match when requiredType is empty', () => {
    const result = unifiedNodeTypeMatcher.isRequirementSatisfied('', ['send_email']);
    expect(result.matches).toBe(false);
  });

  it('returns no-match when availableTypes is empty array', () => {
    const result = unifiedNodeTypeMatcher.isRequirementSatisfied('send_email', []);
    expect(result.matches).toBe(false);
  });

  it('returns best matching type from the list', () => {
    const result = unifiedNodeTypeMatcher.isRequirementSatisfied('send_email', ['http_request', 'send_email']);
    expect(result.matches).toBe(true);
    expect((result as any).matchingType).toBe('send_email');
    expect(result.confidence).toBe(100);
  });
});

describe('findAllMatches()', () => {
  it('returns matching types sorted by confidence descending', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    // 'send_email' exact-matches 'send_email' (100); 'email' is contained in 'send_email' (70)
    const results = unifiedNodeTypeMatcher.findAllMatches('send_email', ['send_email', 'email', 'http_request']);
    expect(results.length).toBe(2);
    expect(results[0].match.confidence).toBeGreaterThanOrEqual(results[1].match.confidence);
    expect(results[0].type).toBe('send_email');
  });

  it('returns empty array when no candidates match', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    const results = unifiedNodeTypeMatcher.findAllMatches('send_email', ['http_request', 'webhook_trigger']);
    expect(results).toHaveLength(0);
  });
});

describe('getCanonicalType()', () => {
  it('delegates to semanticNodeEquivalenceRegistry with operation and category from context', () => {
    mockGetCanonicalType.mockReturnValue('google_gemini');
    const result = unifiedNodeTypeMatcher.getCanonicalType('gemini_pro', { operation: 'summarize' });
    expect(result).toBe('google_gemini');
    expect(mockGetCanonicalType).toHaveBeenCalledWith('gemini_pro', 'summarize', undefined);
  });
});

describe('findSemanticDuplicate()', () => {
  it('returns null when no semantic duplicate exists', () => {
    mockFindSemanticDuplicate.mockReturnValue(undefined);
    const result = unifiedNodeTypeMatcher.findSemanticDuplicate('send_email', ['http_request']);
    expect(result).toBeNull();
  });

  it('returns the matching duplicate type when found', () => {
    mockFindSemanticDuplicate.mockReturnValue('gmail_send');
    const result = unifiedNodeTypeMatcher.findSemanticDuplicate('send_email', ['gmail_send']);
    expect(result).toBe('gmail_send');
  });
});

describe('matchesNodeType() convenience function', () => {
  it('returns true when types match', () => {
    expect(matchesNodeType('send_email', 'send_email')).toBe(true);
  });

  it('returns false when types do not match', () => {
    mockAreEquivalent.mockReturnValue(false);
    mockRegistryGet.mockReturnValue(undefined);
    expect(matchesNodeType('send_email', 'http_request')).toBe(false);
  });
});

describe('isRequirementSatisfiedBy() convenience function', () => {
  it('returns true when requirement is satisfied by an available type', () => {
    expect(isRequirementSatisfiedBy('send_email', ['http_request', 'send_email'])).toBe(true);
  });
});
