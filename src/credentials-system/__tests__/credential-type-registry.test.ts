import { credentialTypeDefinitions, getCredentialType } from '../credential-type-registry';

describe('credential type registry', () => {
  it('registers the required production auth types', () => {
    expect(new Set(credentialTypeDefinitions.map((definition) => definition.authType))).toEqual(
      new Set(['oauth2', 'api_key', 'bearer_token', 'basic_auth', 'custom_header', 'query_auth']),
    );
  });

  it('defines OAuth refresh and injection rules for Google', () => {
    const google = getCredentialType('google_oauth2');

    expect(google?.displayName).toBe('Google OAuth2');
    expect(google?.refresh?.enabled).toBe(true);
    expect(google?.injection).toContainEqual({
      target: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {{access_token}}',
    });
  });
});
