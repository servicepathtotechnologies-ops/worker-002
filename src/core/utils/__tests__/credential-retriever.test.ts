import {
  retrieveCredential,
  retrieveCredentialWithMetadata,
  credentialExists,
} from '../credential-retriever';

jest.mock('../../../services/credential-vault', () => ({
  getCredentialVault: jest.fn(),
}));

import { getCredentialVault } from '../../../services/credential-vault';

const mockGetCredentialVault = getCredentialVault as jest.Mock;

const makeVault = (overrides: Record<string, jest.Mock> = {}) => ({
  retrieve: jest.fn(),
  retrieveWithMetadata: jest.fn(),
  exists: jest.fn(),
  ...overrides,
});

const ctx = { userId: 'user-1', workflowId: 'wf-1', nodeId: 'node-1', nodeType: 'google_gmail' };

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── retrieveCredential ───────────────────────────────────────────────────────

describe('retrieveCredential', () => {
  it('returns value from vault on success', async () => {
    const vault = makeVault({ retrieve: jest.fn().mockResolvedValue('secret-token') });
    mockGetCredentialVault.mockReturnValue(vault);

    const result = await retrieveCredential(ctx, 'google_oauth');
    expect(result).toBe('secret-token');
  });

  it('calls vault.retrieve with correct context and key', async () => {
    const vault = makeVault({ retrieve: jest.fn().mockResolvedValue('x') });
    mockGetCredentialVault.mockReturnValue(vault);

    await retrieveCredential(ctx, 'my_key');
    expect(vault.retrieve).toHaveBeenCalledWith(ctx, 'my_key');
  });

  it('returns null when vault.retrieve resolves to null', async () => {
    const vault = makeVault({ retrieve: jest.fn().mockResolvedValue(null) });
    mockGetCredentialVault.mockReturnValue(vault);

    const result = await retrieveCredential(ctx, 'missing_key');
    expect(result).toBeNull();
  });

  it('returns null and logs when vault.retrieve throws an Error', async () => {
    const vault = makeVault({ retrieve: jest.fn().mockRejectedValue(new Error('vault down')) });
    mockGetCredentialVault.mockReturnValue(vault);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retrieveCredential(ctx, 'key');
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('key'),
      'vault down',
    );
    consoleSpy.mockRestore();
  });

  it('returns null when vault.retrieve throws a non-Error value', async () => {
    const vault = makeVault({ retrieve: jest.fn().mockRejectedValue('string error') });
    mockGetCredentialVault.mockReturnValue(vault);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retrieveCredential(ctx, 'key2');
    expect(result).toBeNull();
  });
});

// ─── retrieveCredentialWithMetadata ──────────────────────────────────────────

describe('retrieveCredentialWithMetadata', () => {
  it('returns value+metadata on success', async () => {
    const payload = { value: 'tok', metadata: { expiresAt: '2030-01-01' } };
    const vault = makeVault({ retrieveWithMetadata: jest.fn().mockResolvedValue(payload) });
    mockGetCredentialVault.mockReturnValue(vault);

    const result = await retrieveCredentialWithMetadata(ctx, 'oauth_key');
    expect(result).toEqual(payload);
  });

  it('calls vault.retrieveWithMetadata with correct context and key', async () => {
    const vault = makeVault({ retrieveWithMetadata: jest.fn().mockResolvedValue({ value: 'v' }) });
    mockGetCredentialVault.mockReturnValue(vault);

    await retrieveCredentialWithMetadata(ctx, 'target_key');
    expect(vault.retrieveWithMetadata).toHaveBeenCalledWith(ctx, 'target_key');
  });

  it('returns null when vault.retrieveWithMetadata throws', async () => {
    const vault = makeVault({ retrieveWithMetadata: jest.fn().mockRejectedValue(new Error('fail')) });
    mockGetCredentialVault.mockReturnValue(vault);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retrieveCredentialWithMetadata(ctx, 'key');
    expect(result).toBeNull();
  });

  it('logs error message when vault.retrieveWithMetadata throws an Error', async () => {
    const vault = makeVault({ retrieveWithMetadata: jest.fn().mockRejectedValue(new Error('network timeout')) });
    mockGetCredentialVault.mockReturnValue(vault);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await retrieveCredentialWithMetadata(ctx, 'tok_key');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('tok_key'),
      'network timeout',
    );
    consoleSpy.mockRestore();
  });
});

// ─── credentialExists ─────────────────────────────────────────────────────────

describe('credentialExists', () => {
  it('returns true when credential exists', async () => {
    const vault = makeVault({ exists: jest.fn().mockResolvedValue(true) });
    mockGetCredentialVault.mockReturnValue(vault);

    expect(await credentialExists(ctx, 'some_key')).toBe(true);
  });

  it('returns false when credential does not exist', async () => {
    const vault = makeVault({ exists: jest.fn().mockResolvedValue(false) });
    mockGetCredentialVault.mockReturnValue(vault);

    expect(await credentialExists(ctx, 'missing')).toBe(false);
  });

  it('calls vault.exists with correct context and key', async () => {
    const vault = makeVault({ exists: jest.fn().mockResolvedValue(true) });
    mockGetCredentialVault.mockReturnValue(vault);

    await credentialExists(ctx, 'check_key');
    expect(vault.exists).toHaveBeenCalledWith(ctx, 'check_key');
  });

  it('returns false and logs when vault.exists throws', async () => {
    const vault = makeVault({ exists: jest.fn().mockRejectedValue(new Error('db error')) });
    mockGetCredentialVault.mockReturnValue(vault);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await credentialExists(ctx, 'err_key');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
