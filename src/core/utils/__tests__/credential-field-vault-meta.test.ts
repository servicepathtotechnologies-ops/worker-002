import {
  getCredentialVaultMetaForField,
  getPrimaryCredentialFieldForNode,
} from '../credential-field-vault-meta';

jest.mock('../../../services/connectors/connector-registry', () => ({
  connectorRegistry: {
    getConnectorByNodeType: jest.fn(),
  },
}));

jest.mock('../../../services/nodes/node-library', () => ({
  nodeLibrary: {},
}));

import { connectorRegistry } from '../../../services/connectors/connector-registry';
import { nodeLibrary } from '../../../services/nodes/node-library';

const mockGetConnector = connectorRegistry.getConnectorByNodeType as jest.Mock;

function makeConnector(
  type: string,
  vaultKey: string,
  extra: Record<string, unknown> = {}
): any {
  return {
    credentialContract: { type, vaultKey, provider: 'test', displayName: 'Test', required: true, ...extra },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // ensure nodeLibrary has no getCanonicalType by default
  delete (nodeLibrary as any).getCanonicalType;
});

// ---------------------------------------------------------------------------
// getCredentialVaultMetaForField
// ---------------------------------------------------------------------------

describe('getCredentialVaultMetaForField', () => {
  it('returns undefined when no connector found', () => {
    mockGetConnector.mockReturnValue(undefined);
    expect(getCredentialVaultMetaForField('some_node', 'apiKey')).toBeUndefined();
  });

  it('matches when credentialFieldName set and field equals it', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'my_vault', { credentialFieldName: 'apiKey' }));
    const result = getCredentialVaultMetaForField('some_node', 'apiKey');
    expect(result).toEqual({ vaultKey: 'my_vault', credentialId: 'my_vault' });
  });

  it('returns undefined when credentialFieldName set but field does not match', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'my_vault', { credentialFieldName: 'apiKey' }));
    expect(getCredentialVaultMetaForField('some_node', 'token')).toBeUndefined();
  });

  it('webhook type: matches field containing "webhook"', () => {
    mockGetConnector.mockReturnValue(makeConnector('webhook', 'wh_vault'));
    const result = getCredentialVaultMetaForField('some_node', 'webhookUrl');
    expect(result).toEqual({ vaultKey: 'wh_vault', credentialId: 'wh_vault' });
  });

  it('webhook type: returns undefined when field has no webhook keyword', () => {
    mockGetConnector.mockReturnValue(makeConnector('webhook', 'wh_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'apiKey')).toBeUndefined();
  });

  it('oauth type: matches field containing "credential"', () => {
    mockGetConnector.mockReturnValue(makeConnector('oauth', 'oauth_vault'));
    const result = getCredentialVaultMetaForField('some_node', 'credentialId');
    expect(result).toEqual({ vaultKey: 'oauth_vault', credentialId: 'oauth_vault' });
  });

  it('oauth type: returns undefined when field has no credential keyword', () => {
    mockGetConnector.mockReturnValue(makeConnector('oauth', 'oauth_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'apiKey')).toBeUndefined();
  });

  it('api_key type: matches field containing "api"', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'apikey_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'apiKey')).toEqual({ vaultKey: 'apikey_vault', credentialId: 'apikey_vault' });
  });

  it('token type: matches field containing "token"', () => {
    mockGetConnector.mockReturnValue(makeConnector('token', 'token_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'accessToken')).toEqual({ vaultKey: 'token_vault', credentialId: 'token_vault' });
  });

  it('basic_auth type: matches field containing "password"', () => {
    mockGetConnector.mockReturnValue(makeConnector('basic_auth', 'basic_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'password')).toEqual({ vaultKey: 'basic_vault', credentialId: 'basic_vault' });
  });

  it('basic_auth type: returns undefined when field has no auth keyword', () => {
    mockGetConnector.mockReturnValue(makeConnector('basic_auth', 'basic_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'webhookUrl')).toBeUndefined();
  });

  it('runtime type (default case): returns undefined', () => {
    mockGetConnector.mockReturnValue(makeConnector('runtime', 'runtime_vault'));
    expect(getCredentialVaultMetaForField('some_node', 'credential')).toBeUndefined();
  });

  it('returns undefined when vaultKey is empty', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', ''));
    expect(getCredentialVaultMetaForField('some_node', 'apiKey')).toBeUndefined();
  });

  it('uses getCanonicalType from nodeLibrary when available', () => {
    (nodeLibrary as any).getCanonicalType = jest.fn().mockReturnValue('canonical_node');
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'vault_k'));
    getCredentialVaultMetaForField('alias_node', 'apiKey');
    expect((nodeLibrary as any).getCanonicalType).toHaveBeenCalledWith('alias_node');
    expect(mockGetConnector).toHaveBeenCalledWith('canonical_node');
  });
});

// ---------------------------------------------------------------------------
// getPrimaryCredentialFieldForNode
// ---------------------------------------------------------------------------

describe('getPrimaryCredentialFieldForNode', () => {
  it('returns undefined when no connector found', () => {
    mockGetConnector.mockReturnValue(undefined);
    expect(getPrimaryCredentialFieldForNode('some_node')).toBeUndefined();
  });

  it('returns webhookUrl fieldName for webhook type', () => {
    mockGetConnector.mockReturnValue(makeConnector('webhook', 'wh_vault'));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result?.fieldName).toBe('webhookUrl');
  });

  it('returns apiKey fieldName for api_key type', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'ak_vault'));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result?.fieldName).toBe('apiKey');
  });

  it('returns credentialId fieldName for oauth type', () => {
    mockGetConnector.mockReturnValue(makeConnector('oauth', 'oauth_vault'));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result?.fieldName).toBe('credentialId');
  });

  it('returns credential fieldName for token type', () => {
    mockGetConnector.mockReturnValue(makeConnector('token', 'tok_vault'));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result?.fieldName).toBe('credential');
  });

  it('uses credentialFieldName from contract when set', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'ak_vault', { credentialFieldName: 'customKey' }));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result?.fieldName).toBe('customKey');
  });

  it('returns undefined when vaultKey is empty', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', ''));
    expect(getPrimaryCredentialFieldForNode('some_node')).toBeUndefined();
  });

  it('includes vaultKey, credentialId, and displayName in return value', () => {
    mockGetConnector.mockReturnValue(makeConnector('api_key', 'vault_x', { displayName: 'My Service' }));
    const result = getPrimaryCredentialFieldForNode('some_node');
    expect(result).toMatchObject({ vaultKey: 'vault_x', credentialId: 'vault_x', displayName: 'My Service' });
  });
});
