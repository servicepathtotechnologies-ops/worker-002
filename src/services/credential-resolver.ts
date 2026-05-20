import {
  DbUnavailableError,
  isDatabaseReachable,
  queryAsService as defaultQueryAsService,
} from '../core/database/db-pool';
import { config } from '../core/config';
import { decryptToken, encryptToken } from '../core/utils/token-encryption';
import {
  CredentialExpiredError,
  CredentialMissingScopeError,
  CredentialNotFoundError,
  CredentialRefreshError,
  CredentialStorageError,
} from './credential-errors';
import {
  normalizeProvider,
  requiredScopesForProvider,
  scopeSet,
  scopesCover,
  splitScopeSet,
} from './credential-scope-registry';
import { normalizeCredentialUserId } from './user-id-normalizer';
import { credentialTypeDefinitions } from '../credentials-system/credential-type-registry';

export interface ResolveCredentialInput {
  userId: string;
  provider: string;
  requiredScopes?: string[];
  action?: string;
  dryRun?: boolean;
}

export interface ResolvedCredential {
  id: string;
  userId: string;
  provider: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  source?: string | null;
}

interface CredentialRow {
  id: string;
  user_id: string;
  provider: string;
  scope_set: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | string | null;
  source: string | null;
  updated_at: Date | string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
type QueryAsService = typeof defaultQueryAsService;
let queryCredentials: QueryAsService = defaultQueryAsService;

export function __setCredentialQueryForTests(query?: QueryAsService): void {
  queryCredentials = query || defaultQueryAsService;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDbUnavailableError(error: unknown): boolean {
  return error instanceof DbUnavailableError || (error as any)?.code === 'DB_UNAVAILABLE';
}

async function canRecoverDbCircuit(error: unknown): Promise<boolean> {
  if (!isDbUnavailableError(error)) return false;
  if (queryCredentials !== defaultQueryAsService) return false;
  return isDatabaseReachable().catch(() => false);
}

async function queryCredentialStore<T>(
  sql: string,
  params: any[],
  context: {
    userId: string;
    provider: string;
    requiredScopes: string[];
    action?: string;
    resolverStep?: string;
  },
): Promise<T[]> {
  try {
    return await queryCredentials<T>(sql, params);
  } catch (error: any) {
    if (await canRecoverDbCircuit(error)) {
      try {
        return await queryCredentials<T>(sql, params);
      } catch (retryError: any) {
        throw new CredentialStorageError({
          ...context,
          causeMessage: getErrorMessage(retryError),
        });
      }
    }

    throw new CredentialStorageError({
      ...context,
      causeMessage: getErrorMessage(error),
    });
  }
}

function safeDecryptToken(value: string | null): string | null {
  if (!value) return null;
  return decryptToken(value);
}

function normalizeProviderScopes(provider: string, scopes: string[] = []): string[] {
  return requiredScopesForProvider(provider, scopes);
}

function getOAuthDefinition(provider: string) {
  const normalized = normalizeProvider(provider);
  return credentialTypeDefinitions.find((definition) => (
    definition.provider === normalized &&
    definition.authType === 'oauth2' &&
    definition.oauth2
  ))?.oauth2;
}

async function refreshCredential(row: CredentialRow, requiredScopes: string[], action?: string): Promise<ResolvedCredential> {
  const provider = normalizeProvider(row.provider);
  const refreshToken = safeDecryptToken(row.refresh_token);
  const context = { userId: row.user_id, provider, requiredScopes, action, resolverStep: 'refresh' };

  if (!refreshToken) {
    await markCredentialInactive(row.id, context);
    await deleteConnectionByUnifiedCredentialId(row.id, row.user_id);
    throw new CredentialExpiredError(context);
  }

  const oauth = getOAuthDefinition(provider);
  if (!oauth) {
    await markCredentialInactive(row.id, context);
    await deleteConnectionByUnifiedCredentialId(row.id, row.user_id);
    throw new CredentialRefreshError({ ...context, causeMessage: 'No OAuth refresh configuration found' });
  }

  const clientId = process.env[oauth.clientIdEnv];
  const clientSecret = process.env[oauth.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new CredentialRefreshError({ ...context, causeMessage: 'OAuth client env vars are missing' });
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (oauth.tokenAuthMethod === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(oauth.tokenUrl, { method: 'POST', headers, body });
  if (!response.ok) {
    await markCredentialInactive(row.id, context);
    await deleteConnectionByUnifiedCredentialId(row.id, row.user_id);
    throw new CredentialExpiredError({ ...context, causeMessage: await response.text().catch(() => response.statusText) });
  }

  const tokenResponse = await response.json() as Record<string, any>;
  const accessToken = String(tokenResponse.access_token || '');
  if (!accessToken) {
    await markCredentialInactive(row.id, context);
    await deleteConnectionByUnifiedCredentialId(row.id, row.user_id);
    throw new CredentialRefreshError({ ...context, causeMessage: 'Refresh response did not include access_token' });
  }

  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
    : null;
  const nextRefreshToken = tokenResponse.refresh_token ? String(tokenResponse.refresh_token) : refreshToken;

  await queryCredentialStore(
    `UPDATE unified_credentials
        SET access_token = $1,
            refresh_token = $2,
            expires_at = $3,
            raw_token_blob = $4,
            is_active = true,
            updated_at = NOW()
      WHERE id = $5`,
    [
      encryptToken(accessToken),
      nextRefreshToken ? encryptToken(nextRefreshToken) : null,
      expiresAt ? expiresAt.toISOString() : null,
      { encrypted: true, value: encryptToken(JSON.stringify(tokenResponse)) },
      row.id,
    ],
    context,
  );

  return {
    id: row.id,
    userId: row.user_id,
    provider,
    scopes: splitScopeSet(row.scope_set),
    accessToken,
    refreshToken: nextRefreshToken,
    expiresAt,
    source: row.source,
  };
}

async function markCredentialInactive(
  id: string,
  context: {
    userId: string;
    provider: string;
    requiredScopes: string[];
    action?: string;
    resolverStep?: string;
  },
): Promise<void> {
  await queryCredentialStore(
    `UPDATE unified_credentials SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id],
    context,
  );
}

async function deleteConnectionByUnifiedCredentialId(ucId: string, userId: string): Promise<void> {
  try {
    const rows = await queryCredentialStore<{ id: string }>(
      `SELECT c.id
       FROM connections c
       JOIN unified_credentials uc ON uc.user_id = c.user_id AND uc.provider = c.provider
       WHERE uc.id = $1 AND c.user_id = $2 AND c.status <> 'revoked'
       LIMIT 1`,
      [ucId, userId],
      { userId, provider: '', requiredScopes: [], resolverStep: 'delete_by_uc_id' },
    );
    if (rows[0]) {
      const { connectionService } = await import('../credentials-system/connection-service');
      await connectionService.deleteConnection(userId, rows[0].id);
    }
  } catch {
    // Best-effort — do not surface deletion errors to the caller
  }
}

export async function resolveCredential(input: ResolveCredentialInput): Promise<ResolvedCredential> {
  const provider = normalizeProvider(input.provider);
  const userId = await normalizeCredentialUserId(input.userId);
  const requiredScopes = normalizeProviderScopes(provider, input.requiredScopes);
  const context = { userId, provider, requiredScopes, action: input.action, resolverStep: 'unified_credentials' };

  const rows = await queryCredentialStore<CredentialRow>(
    `SELECT id, user_id, provider, scope_set, access_token, refresh_token, expires_at, source, updated_at
       FROM unified_credentials
      WHERE user_id = $1
        AND provider = $2
        AND is_active = true
      ORDER BY cardinality(string_to_array(scope_set, '+')) DESC, updated_at DESC
      LIMIT 20`,
    [userId, provider],
    context,
  );

  const availableScopes = Array.from(new Set(rows.flatMap((row) => splitScopeSet(row.scope_set))));
  const row = rows.find((candidate) => scopesCover(splitScopeSet(candidate.scope_set), requiredScopes));

  if (!row) {
    if (rows.length > 0) throw new CredentialMissingScopeError(context, availableScopes);
    throw new CredentialNotFoundError(context);
  }

  const accessToken = safeDecryptToken(row.access_token);
  if (!accessToken) throw new CredentialNotFoundError({ ...context, resolverStep: 'access_token' });

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const isExpiring = expiresAt ? expiresAt.getTime() <= Date.now() + FIVE_MINUTES_MS : false;

  if (isExpiring) return refreshCredential(row, requiredScopes, input.action);

  return {
    id: row.id,
    userId,
    provider,
    scopes: splitScopeSet(row.scope_set),
    accessToken,
    refreshToken: safeDecryptToken(row.refresh_token),
    expiresAt,
    source: row.source,
  };
}

export async function resolveCredentialDryRun(input: ResolveCredentialInput): Promise<Omit<ResolvedCredential, 'accessToken' | 'refreshToken'>> {
  const credential = await resolveCredential({ ...input, dryRun: true });
  return {
    id: credential.id,
    userId: credential.userId,
    provider: credential.provider,
    scopes: credential.scopes,
    expiresAt: credential.expiresAt,
    source: credential.source,
  };
}

export async function upsertUnifiedCredential(input: {
  userId: string;
  provider: string;
  scopes?: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | string | null;
  rawTokenBlob?: Record<string, unknown> | null;
  source: string;
  email?: string;
}): Promise<string> {
  const userId = await normalizeCredentialUserId(input.userId, input.email);
  const provider = normalizeProvider(input.provider);
  const scopes = normalizeProviderScopes(provider, input.scopes);
  const set = scopeSet(scopes);
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt || null;
  const rawTokenBlob = input.rawTokenBlob
    ? { encrypted: true, value: encryptToken(JSON.stringify(input.rawTokenBlob)) }
    : null;
  const context = { userId, provider, requiredScopes: scopes, resolverStep: 'upsertUnifiedCredential' };

  const rows = await queryCredentialStore<{ id: string }>(
    `INSERT INTO unified_credentials (
        user_id, provider, scope_set, access_token, refresh_token, expires_at, raw_token_blob, source, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      ON CONFLICT (user_id, provider, scope_set)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, unified_credentials.refresh_token),
        expires_at = EXCLUDED.expires_at,
        raw_token_blob = EXCLUDED.raw_token_blob,
        source = EXCLUDED.source,
        is_active = true,
        updated_at = NOW()
      RETURNING id`,
    [
      userId,
      provider,
      set,
      encryptToken(input.accessToken),
      input.refreshToken ? encryptToken(input.refreshToken) : null,
      expiresAt,
      rawTokenBlob,
      input.source,
    ],
    context,
  );

  const id = rows[0]?.id;
  if (!id) {
    throw new CredentialStorageError({ ...context, causeMessage: 'No credential id returned from upsert' });
  }
  return id;
}

export function formatCredentialError(error: unknown, action?: string) {
  if (error && typeof error === 'object' && 'toJSON' in error && typeof (error as any).toJSON === 'function') {
    return { ...(error as any).toJSON(), action: action || (error as any).context?.action };
  }
  return {
    error: 'CredentialError',
    action,
    message: error instanceof Error ? error.message : String(error),
  };
}

export const credentialResolver = {
  resolveCredential,
  resolveCredentialDryRun,
  upsertUnifiedCredential,
};
