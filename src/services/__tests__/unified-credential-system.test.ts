const queryAsService = jest.fn();

jest.mock('../../core/utils/token-encryption', () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => value?.startsWith('enc:') ? value.slice(4) : value,
}));

const { handleOAuthCallback } = require('../oauth-callback-handler') as typeof import('../oauth-callback-handler');
const { resolveCredential, __setCredentialQueryForTests } = require('../credential-resolver') as typeof import('../credential-resolver');
const { CredentialExpiredError, CredentialMissingScopeError } = require('../credential-errors') as typeof import('../credential-errors');
const { executionPreflight } = require('../execution-preflight') as typeof import('../execution-preflight');
const { signWebhookPayload, verifyWebhookSignature } = require('../webhook-signature') as typeof import('../webhook-signature');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const AWS_SHAPED_USER = 'e1031dfa-7031-703e-0004-80c6c3028371';

interface StoredCredential {
  id: string;
  user_id: string;
  provider: string;
  scope_set: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  source: string;
  is_active: boolean;
  updated_at: string;
}

let store: StoredCredential[];

function installCredentialStoreMock() {
  store = [];
  queryAsService.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM identity_links')) return [];
    if (sql.includes('FROM profiles')) return [];
    if (sql.includes('INSERT INTO unified_credentials')) {
      const [userId, provider, scopeSet, accessToken, refreshToken, expiresAt, _raw, source] = params;
      const existing = store.find((row) => row.user_id === userId && row.provider === provider && row.scope_set === scopeSet);
      const row = existing || {
        id: `cred-${store.length + 1}`,
        user_id: userId,
        provider,
        scope_set: scopeSet,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        source,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      row.access_token = accessToken;
      row.refresh_token = refreshToken || row.refresh_token;
      row.expires_at = expiresAt;
      row.source = source;
      row.is_active = true;
      if (!existing) store.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('FROM unified_credentials')) {
      const [userId, provider] = params;
      return store
        .filter((row) => row.user_id === userId && row.provider === provider && row.is_active)
        .sort((a, b) => b.scope_set.split('+').length - a.scope_set.split('+').length);
    }
    if (sql.includes('SET is_active = false')) {
      const [id] = params;
      const row = store.find((item) => item.id === id);
      if (row) row.is_active = false;
      return [];
    }
    if (sql.includes('UPDATE unified_credentials')) return [];
    return [];
  });
}

beforeEach(() => {
  process.env.ENCRYPTION_KEY = 'test-key';
  queryAsService.mockReset();
  __setCredentialQueryForTests(queryAsService as any);
  installCredentialStoreMock();
});

describe('unified credential runtime', () => {
  it('accepts existing AWS UUID-shaped user ids during OAuth callback', async () => {
    await handleOAuthCallback({
      provider: 'google',
      userId: AWS_SHAPED_USER,
      source: 'generic_oauth',
      tokenResponse: {
        access_token: 'aws-google-access',
        refresh_token: 'aws-google-refresh',
        expires_in: 3600,
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
      },
    });

    await expect(resolveCredential({
      userId: AWS_SHAPED_USER,
      provider: 'google',
      requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    })).resolves.toMatchObject({ accessToken: 'aws-google-access', userId: AWS_SHAPED_USER });
  });

  it('new dashboard Google connection resolves for Gmail and Sheets runtime scopes', async () => {
    await handleOAuthCallback({
      provider: 'google',
      userId: USER_A,
      source: 'generic_oauth',
      tokenResponse: {
        access_token: 'google-access',
        refresh_token: 'google-refresh',
        expires_in: 3600,
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
      },
    });

    await expect(resolveCredential({
      userId: USER_A,
      provider: 'google',
      requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    })).resolves.toMatchObject({ accessToken: 'google-access', provider: 'google' });

    await expect(resolveCredential({
      userId: USER_A,
      provider: 'google',
      requiredScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })).resolves.toMatchObject({ accessToken: 'google-access', provider: 'google' });
  });

  it('blocks missing scopes with a typed error', async () => {
    await handleOAuthCallback({
      provider: 'twitter',
      userId: USER_A,
      source: 'generic_oauth',
      requiredScopes: ['tweet.read'],
      tokenResponse: {
        access_token: 'twitter-access',
        refresh_token: 'twitter-refresh',
        scope: 'tweet.read users.read offline.access',
      },
    });

    await expect(resolveCredential({
      userId: USER_A,
      provider: 'twitter',
      requiredScopes: ['tweet.write'],
    })).rejects.toBeInstanceOf(CredentialMissingScopeError);
  });

  it('preflight uses workflow owner credentials and ignores triggering user credentials', async () => {
    await handleOAuthCallback({
      provider: 'google',
      userId: USER_A,
      source: 'generic_oauth',
      tokenResponse: {
        access_token: 'owner-google',
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
      },
    });
    await handleOAuthCallback({
      provider: 'google',
      userId: USER_B,
      source: 'generic_oauth',
      tokenResponse: {
        access_token: 'triggering-user-google',
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
      },
    });

    const result = await executionPreflight({
      workflowId: 'workflow-1',
      ownerId: USER_A,
      nodes: [{ id: 'gmail-1', type: 'google_gmail', data: { label: 'Send Gmail' } }],
    });

    expect(result.ok).toBe(true);
    await expect(resolveCredential({ userId: USER_A, provider: 'google' }))
      .resolves.toMatchObject({ accessToken: 'owner-google' });
  });

  it('expired token without refresh token fails as CredentialExpiredError', async () => {
    store.push({
      id: 'expired',
      user_id: USER_A,
      provider: 'whatsapp',
      scope_set: 'business_management+whatsapp_business_management+whatsapp_business_messaging',
      access_token: 'enc:old',
      refresh_token: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      source: 'legacy_whatsapp',
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    await expect(resolveCredential({ userId: USER_A, provider: 'whatsapp' }))
      .rejects.toBeInstanceOf(CredentialExpiredError);
    expect(store[0].is_active).toBe(false);
  });

  it('WhatsApp unified credential resolves for WhatsApp nodes', async () => {
    await handleOAuthCallback({
      provider: 'whatsapp',
      userId: USER_A,
      source: 'legacy_whatsapp_callback',
      tokenResponse: {
        access_token: 'whatsapp-access',
        scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
      },
    });

    await expect(resolveCredential({ userId: USER_A, provider: 'whatsapp' }))
      .resolves.toMatchObject({ accessToken: 'whatsapp-access', provider: 'whatsapp' });
  });
});

describe('webhook signatures', () => {
  it('rejects missing or invalid webhook signatures', () => {
    const payload = JSON.stringify({ hello: 'world' });
    expect(verifyWebhookSignature({ secret: 'secret', payload })).toBe(false);
    expect(verifyWebhookSignature({
      secret: 'secret',
      payload,
      signatureHeader: 'sha256=bad',
    })).toBe(false);
  });

  it('accepts a valid webhook HMAC signature', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const signature = signWebhookPayload('secret', payload);
    expect(verifyWebhookSignature({ secret: 'secret', payload, signatureHeader: signature })).toBe(true);
  });
});
