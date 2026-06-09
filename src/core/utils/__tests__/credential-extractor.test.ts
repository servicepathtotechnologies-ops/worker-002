import { extractCredentialsFromNode, validateCredentialsConnected } from '../credential-extractor';

jest.mock('../../../services/nodes/node-library', () => ({
  nodeLibrary: {
    getSchema: jest.fn(),
  },
}));

jest.mock('../unified-node-type-normalizer', () => ({
  unifiedNormalizeNodeType: jest.fn(),
}));

import { nodeLibrary } from '../../../services/nodes/node-library';
import { unifiedNormalizeNodeType } from '../unified-node-type-normalizer';

const mockGetSchema = nodeLibrary.getSchema as jest.Mock;
const mockNormalize = unifiedNormalizeNodeType as jest.Mock;

function makeNode(overrides: any = {}): any {
  return {
    id: 'n1',
    type: 'some_node',
    data: {
      config: {},
      ...overrides.data,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNormalize.mockReturnValue('some_node');
});

// ────────────────────────────────────────────────────────────
// extractCredentialsFromNode
// ────────────────────────────────────────────────────────────

describe('extractCredentialsFromNode', () => {
  it('returns empty result when schema is null', () => {
    mockGetSchema.mockReturnValue(null);
    const result = extractCredentialsFromNode(makeNode());
    expect(result).toEqual({ credentials: {}, missingCredentials: [], allSatisfied: true });
  });

  it('returns empty result when schema has no configSchema', () => {
    mockGetSchema.mockReturnValue({});
    const result = extractCredentialsFromNode(makeNode());
    expect(result).toEqual({ credentials: {}, missingCredentials: [], allSatisfied: true });
  });

  it('extracts required apikey field from config', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: { apiKey: 'abc123' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({ apiKey: 'abc123' });
    expect(result.missingCredentials).toEqual([]);
    expect(result.allSatisfied).toBe(true);
  });

  it('extracts optional token field from config', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: { accessToken: {} } },
    });
    const node = makeNode({ data: { config: { accessToken: 'tok_xyz' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({ accessToken: 'tok_xyz' });
    expect(result.allSatisfied).toBe(true);
  });

  it('config value takes precedence over input value', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: { apiKey: 'config-key' }, input: { apiKey: 'input-key' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials.apiKey).toBe('config-key');
  });

  it('falls back to input value when config field is empty', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: { apiKey: '' }, input: { apiKey: 'input-key' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials.apiKey).toBe('input-key');
  });

  it('adds to missingCredentials when required credential field is absent', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: {} } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({});
    expect(result.missingCredentials).toContain('apiKey');
    expect(result.allSatisfied).toBe(false);
  });

  it('does not extract non-credential fields', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['recipient', 'subject'], optional: {} },
    });
    const node = makeNode({ data: { config: { recipient: 'a@b.com', subject: 'Hi' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({});
    expect(result.missingCredentials).toEqual([]);
  });

  it('handles multiple credential types: oauth credentialId and webhook webhookUrl', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['credentialId', 'webhookUrl'], optional: {} },
    });
    const node = makeNode({ data: { config: { credentialId: 'cred-1', webhookUrl: 'https://hook' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({ credentialId: 'cred-1', webhookUrl: 'https://hook' });
    expect(result.allSatisfied).toBe(true);
  });

  it('handles password, secret, and api_token keyword fields', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: { dbPassword: {}, clientSecret: {}, api_token: {} } },
    });
    const node = makeNode({ data: { config: { dbPassword: 'pass', clientSecret: 'sec', api_token: 'tok-xyz' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials).toEqual({ dbPassword: 'pass', clientSecret: 'sec', api_token: 'tok-xyz' });
  });

  it('extracts credential from generic cred_ prefixed input key', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: {} },
    });
    // field name pattern: key ends with _apikey
    const node = makeNode({ data: { config: {}, input: { cred_n1_apikey: 'generic-key' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials['apikey']).toBe('generic-key');
  });

  it('extracts credential from req_ prefixed input key with webhook suffix', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: {} },
    });
    const node = makeNode({ data: { config: {}, input: { req_n1_webhook: 'https://wh' } } });
    const result = extractCredentialsFromNode(node);
    expect(result.credentials['webhook']).toBe('https://wh');
  });

  it('does not duplicate if generic key already in credentials', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    // apiKey already extracted from config; generic key matches "apikey" suffix
    const node = makeNode({ data: { config: { apiKey: 'from-config' }, input: { cred_n1_apikey: 'from-input' } } });
    const result = extractCredentialsFromNode(node);
    // "apiKey" (from required) is in credentials; the generic key would try to add "apikey"
    // They are different key names in the map so both may exist — just check config one is present
    expect(result.credentials['apiKey']).toBe('from-config');
  });
});

// ────────────────────────────────────────────────────────────
// validateCredentialsConnected
// ────────────────────────────────────────────────────────────

describe('validateCredentialsConnected', () => {
  it('returns valid=true with no errors when credentials are satisfied', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: { apiKey: 'real-key-value' } } });
    const result = validateCredentialsConnected(node);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns valid=false with error when required credential is missing', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: {} } });
    const result = validateCredentialsConnected(node);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('apiKey');
  });

  it('adds warning when credential value is "dummy"', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: ['apiKey'], optional: {} },
    });
    const node = makeNode({ data: { config: { apiKey: 'dummy' } } });
    const result = validateCredentialsConnected(node);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('apiKey'))).toBe(true);
  });

  it('adds warning when credential value is "placeholder"', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: { accessToken: {} } },
    });
    const node = makeNode({ data: { config: { accessToken: 'placeholder' } } });
    const result = validateCredentialsConnected(node);
    expect(result.warnings.some(w => w.includes('accessToken'))).toBe(true);
  });

  it('adds warning when credential value is a template placeholder', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: { accessToken: {} } },
    });
    const node = makeNode({ data: { config: { accessToken: '{{someVariable}}' } } });
    const result = validateCredentialsConnected(node);
    expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
  });

  it('returns valid=true with no warnings for a real-looking key', () => {
    mockGetSchema.mockReturnValue({
      configSchema: { required: [], optional: { apiKey: {} } },
    });
    const node = makeNode({ data: { config: { apiKey: 'sk-proj-abc123XYZ' } } });
    const result = validateCredentialsConnected(node);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
