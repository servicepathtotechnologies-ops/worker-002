import { credentialTypeDefinitions, getCredentialType } from '../credential-type-registry';
import { connectionService } from '../connection-service';

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

  it('provides in-app credential guide metadata for every credential type and required field', () => {
    for (const definition of credentialTypeDefinitions) {
      expect(definition.guide.summary).toEqual(expect.any(String));
      expect(definition.guide.summary.length).toBeGreaterThan(0);
      expect(definition.guide.prerequisites.length).toBeGreaterThan(0);
      expect(definition.guide.steps.length).toBeGreaterThan(0);
      expect(definition.guide.securityNotes.length).toBeGreaterThan(0);

      for (const field of definition.inputFields.filter((field) => field.required)) {
        expect(definition.guide.fieldGuides[field.name]?.whereToFind).toEqual(expect.any(String));
        expect(definition.guide.fieldGuides[field.name]?.whereToFind.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns cloned guide metadata from the connection service without credential payloads', () => {
    const credentialTypes = connectionService.listCredentialTypes();
    const mysql = credentialTypes.find((definition) => definition.id === 'mysql_connection');

    expect(mysql?.guide.fieldGuides.host.label).toBe('Host');
    expect(JSON.stringify(credentialTypes)).not.toContain('encrypted_credentials');
    expect(JSON.stringify(credentialTypes)).not.toContain('"credentials"');
  });
});
