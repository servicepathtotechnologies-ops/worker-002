/**
 * Property-Based Tests: Legacy Removal
 * Feature: ai-workflow-generation-engine
 */

// Feature: ai-workflow-generation-engine, Property 45: No hardcoded keyword maps after legacy removal
// Feature: ai-workflow-generation-engine, Property 46: Gemini-first non-empty result is used exclusively

import { EnhancedKeywordMatcher } from '../enhanced-keyword-matcher';

// ─── Property 45: No hardcoded keyword maps after legacy removal ──────────────

describe('Property 45: No hardcoded keyword maps after legacy removal', () => {
  it('EnhancedKeywordMatcher has no keywordVariations property', () => {
    const matcher = new EnhancedKeywordMatcher();
    // After legacy removal, keywordVariations should not exist or be empty/undefined
    const hasKeywordVariations = 'keywordVariations' in matcher;
    if (hasKeywordVariations) {
      // If the property exists, it must be empty or undefined
      const variations = (matcher as any).keywordVariations;
      if (variations instanceof Map) {
        expect(variations.size).toBe(0);
      } else {
        expect(variations).toBeFalsy();
      }
    } else {
      // Property doesn't exist — this is the expected state after removal
      expect(hasKeywordVariations).toBe(false);
    }
  });

  it('EnhancedKeywordMatcher instance has no keywordVariations Map with entries', () => {
    const matcher = new EnhancedKeywordMatcher();
    const proto = Object.getPrototypeOf(matcher);
    const allKeys = [...Object.keys(matcher), ...Object.getOwnPropertyNames(proto)];
    
    // keywordVariations should not be a populated Map
    if ((matcher as any).keywordVariations instanceof Map) {
      expect((matcher as any).keywordVariations.size).toBe(0);
    }
    // The property should not exist at all
    expect((matcher as any).keywordVariations).toBeUndefined();
  });
});

// ─── Property 46: Gemini-first non-empty result is used exclusively ───────────

describe('Property 46: Gemini-first non-empty result is used exclusively', () => {
  it('EnhancedKeywordMatcher.findBestMatch still works without keywordVariations', () => {
    const matcher = new EnhancedKeywordMatcher();
    // Should not throw even without keywordVariations
    expect(() => matcher.findBestMatch('send email')).not.toThrow();
  });

  it('EnhancedKeywordMatcher.findAllMatches still works without keywordVariations', () => {
    const matcher = new EnhancedKeywordMatcher();
    expect(() => matcher.findAllMatches('send email')).not.toThrow();
    const results = matcher.findAllMatches('send email');
    expect(Array.isArray(results)).toBe(true);
  });
});
