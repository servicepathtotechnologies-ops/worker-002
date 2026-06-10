import {
  credentialRequirementForNode,
  normalizeProvider,
  requiredScopesForProvider,
  scopesCover,
  scopeSet,
  splitScopeSet,
} from '../credential-scope-registry';

describe('credential-scope-registry', () => {
  it('normalizes provider aliases used by node types', () => {
    expect(normalizeProvider(' google_gmail ')).toBe('google');
    expect(normalizeProvider('GOOGLE_BIG_QUERY')).toBe('google');
    expect(normalizeProvider('outlook')).toBe('microsoft');
    expect(normalizeProvider('custom_provider')).toBe('custom_provider');
  });

  it('canonicalizes scope sets by trimming, deduping, and sorting', () => {
    expect(scopeSet(['profile', ' email ', '', 'profile', 'openid'])).toBe('email+openid+profile');
    expect(scopeSet(['', '   '])).toBe('default');
  });

  it('splits stored scope sets back into trimmed scope arrays', () => {
    expect(splitScopeSet(null)).toEqual([]);
    expect(splitScopeSet('default')).toEqual([]);
    expect(splitScopeSet(' email + profile + ')).toEqual(['email', 'profile']);
  });

  it('checks whether available scopes cover all required scopes exactly', () => {
    expect(scopesCover(['email', 'profile', 'openid'], ['openid', 'email'])).toBe(true);
    expect(scopesCover(['email'], ['email', 'profile'])).toBe(false);
  });

  it('prefers explicit scopes and dedupes them before provider defaults', () => {
    expect(requiredScopesForProvider('google_gmail', ['gmail.send', 'gmail.send', 'gmail.read'])).toEqual([
      'gmail.send',
      'gmail.read',
    ]);
  });

  it('derives credential requirements from known node type aliases', () => {
    const gmailRequirement = credentialRequirementForNode(' GOOGLE_GMAIL ');

    expect(gmailRequirement).toEqual({
      provider: 'google',
      requiredScopes: expect.arrayContaining([
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
      ]),
    });

    expect(credentialRequirementForNode('unknown_node')).toBeNull();
  });
});
