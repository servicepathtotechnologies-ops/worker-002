import { getConnectionCatalog } from '../connections-catalog';
import { connectorRegistry } from '../../services/connectors/connector-registry';

describe('connections catalog', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:8080';
    process.env.PUBLIC_BASE_URL = 'http://localhost:3001';
    process.env.GITHUB_OAUTH_REDIRECT_URI = 'http://127.0.0.1:3001/api/oauth/github/callback';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3001/api/oauth/google/callback';
    process.env.LINKEDIN_OAUTH_REDIRECT_URI = 'http://localhost:3001/api/oauth/linkedin/callback';
    process.env.WHATSAPP_OAUTH_REDIRECT_URI = 'http://localhost:8080/auth/whatsapp/callback';
  });

  it('includes every ConnectorRegistry credential contract once by vaultKey', () => {
    const catalog = getConnectionCatalog();
    const catalogKeys = new Set(catalog.map((entry) => entry.vaultKey));
    const registryKeys = new Set(
      connectorRegistry.getAllConnectors().map((connector) => connector.credentialContract.vaultKey)
    );

    expect(catalogKeys).toEqual(registryKeys);
    expect(catalog).toHaveLength(catalogKeys.size);
  });

  it('uses env-driven callback URLs for implemented OAuth providers', () => {
    const catalog = getConnectionCatalog();
    const byKey = Object.fromEntries(catalog.map((entry) => [entry.vaultKey, entry]));

    expect(byKey.github.callbackUrl).toBe('http://127.0.0.1:3001/api/oauth/github/callback');
    expect(byKey.google.callbackUrl).toBe('http://localhost:3001/api/oauth/google/callback');
    expect(byKey.linkedin.callbackUrl).toBe('http://localhost:3001/api/oauth/linkedin/callback');
  });

  it('renders non-OAuth credential fields from registry contracts', () => {
    const catalog = getConnectionCatalog();
    const byKey = Object.fromEntries(catalog.map((entry) => [entry.vaultKey, entry]));

    expect(byKey.slack.authType).toBe('webhook');
    expect(byKey.slack.credentialFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'webhookUrl', type: 'url' })])
    );
    expect(byKey.openai.authType).toBe('api_key');
    expect(byKey.openai.credentialFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'apiKey', type: 'password' })])
    );
  });

  it('marks dashboard OAuth providers as implemented with status and disconnect routes', () => {
    const catalog = getConnectionCatalog();
    const byKey = Object.fromEntries(catalog.map((entry) => [entry.vaultKey, entry]));

    for (const key of ['google', 'linkedin', 'github', 'facebook', 'notion', 'twitter', 'instagram', 'whatsapp', 'salesforce', 'zoho']) {
      expect(byKey[key]).toEqual(
        expect.objectContaining({
          authType: 'oauth',
          oauthImplemented: true,
          statusTable: expect.any(String),
          connectUrl: expect.any(String),
        })
      );
    }

    expect(byKey.whatsapp.statusTable).toBe('whatsapp_oauth_tokens');
    expect(byKey.notion.disconnectUrl).toBe('/api/connections/notion');
    expect(byKey.twitter.disconnectUrl).toBe('/api/connections/twitter');
    expect(byKey.salesforce.disconnectUrl).toBe('/api/connections/salesforce');
  });
});
