/**
 * credential-resolver.ts
 *
 * Single source of truth for OAuth token resolution.
 *
 * Used by:
 *   - All node executors (Google Sheets, Gmail, LinkedIn, GitHub …)
 *   - connectionsStatusHandler (UI connection check)
 *
 * Lookup order per user ID candidate:
 *   1. Provider-specific OAuth table  (google_oauth_tokens, linkedin_oauth_tokens …)
 *   2. credential_vault               (key = provider name)
 *   3. user_credentials               (legacy fallback)
 *
 * Example:
 *   const result = await resolveOAuthToken('google', [workflowOwnerId, currentUserId]);
 *   if (result.token) { ... }
 */

import { queryAsService } from '../core/database/db-pool';
import { getCredentialVault } from '../services/credential-vault';
import { decryptToken } from '../core/utils/token-encryption';
import { config } from '../core/config';

// ─── Public types ─────────────────────────────────────────────────────────────

export type OAuthProvider =
  | 'google'
  | 'linkedin'
  | 'github'
  | 'facebook'
  | 'notion'
  | 'twitter'
  | 'instagram'
  | 'whatsapp'
  | 'zoho'
  | 'salesforce';

export type TokenSource = 'oauth_table' | 'credential_vault' | 'user_credentials';

export interface ResolvedToken {
  token: string;
  userId: string;
  source: TokenSource;
}

// ─── Internal provider → table mapping ───────────────────────────────────────

interface ProviderTableConfig {
  table: string;
  /** Column that holds the access token (may be encrypted) */
  accessTokenCol: string;
  /** Column that holds the refresh token (may be encrypted) */
  refreshTokenCol: string;
  /** Column that holds the expiry timestamp */
  expiresAtCol: string;
  /** For tables shared across providers (social_tokens) */
  providerFilterCol?: string;
  providerFilterVal?: string;
}

const PROVIDER_TABLE: Record<OAuthProvider, ProviderTableConfig> = {
  google:     { table: 'google_oauth_tokens',    accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  linkedin:   { table: 'linkedin_oauth_tokens',  accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  notion:     { table: 'notion_oauth_tokens',    accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  twitter:    { table: 'twitter_oauth_tokens',   accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  instagram:  { table: 'instagram_oauth_tokens', accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  salesforce: { table: 'salesforce_oauth_tokens',accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  zoho:       { table: 'zoho_oauth_tokens',      accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at' },
  github:     { table: 'social_tokens', accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at', providerFilterCol: 'provider', providerFilterVal: 'github' },
  facebook:   { table: 'social_tokens', accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at', providerFilterCol: 'provider', providerFilterVal: 'facebook' },
  whatsapp:   { table: 'social_tokens', accessTokenCol: 'access_token', refreshTokenCol: 'refresh_token', expiresAtCol: 'expires_at', providerFilterCol: 'provider', providerFilterVal: 'whatsapp' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Decrypt a stored token; if it is already plaintext, return as-is. */
function safeDecrypt(value: string): string {
  try {
    return decryptToken(value);
  } catch {
    return value;
  }
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Refresh a Google access token using the stored refresh token.
 * Persists the new token back to the database.
 */
async function refreshGoogleAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const clientId     = config.googleOAuthClientId;
  const clientSecret = config.googleOAuthClientSecret;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    });

    if (!response.ok) return null;

    const body = await response.json() as {
      access_token:  string;
      expires_in:    number;
      refresh_token?: string;
    };

    const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();

    await queryAsService(
      `UPDATE google_oauth_tokens
          SET access_token = $1, expires_at = $2, updated_at = NOW()
        WHERE user_id = $3`,
      [body.access_token, expiresAt, userId],
    ).catch(() => { /* non-fatal — we still return the fresh token */ });

    return body.access_token;
  } catch {
    return null;
  }
}

// ─── Tier 1: OAuth table lookup ───────────────────────────────────────────────

async function lookupOAuthTable(
  provider: OAuthProvider,
  userId: string,
): Promise<string | null> {
  const cfg = PROVIDER_TABLE[provider];
  if (!cfg) return null;

  try {
    const hasProviderFilter = Boolean(cfg.providerFilterCol);
    const sql = `
      SELECT "${cfg.accessTokenCol}", "${cfg.refreshTokenCol}", "${cfg.expiresAtCol}"
        FROM "${cfg.table}"
       WHERE user_id = $1
         ${hasProviderFilter ? `AND "${cfg.providerFilterCol}" = $2` : ''}
       LIMIT 1
    `;
    const params: any[] = hasProviderFilter
      ? [userId, cfg.providerFilterVal]
      : [userId];

    const rows = await queryAsService<Record<string, string | null>>(sql, params);
    if (!rows.length) return null;

    const row          = rows[0];
    const rawToken     = row[cfg.accessTokenCol];
    const rawRefresh   = row[cfg.refreshTokenCol] ?? null;
    const expiresAtStr = row[cfg.expiresAtCol]    ?? null;

    if (!rawToken) return null;

    const accessToken  = safeDecrypt(rawToken);
    const expiresAt    = expiresAtStr ? new Date(expiresAtStr) : null;
    const isExpiring   = expiresAt ? expiresAt.getTime() < Date.now() + FIVE_MINUTES_MS : false;

    // Auto-refresh Google tokens before they expire
    if (isExpiring && rawRefresh && provider === 'google') {
      const refreshToken = safeDecrypt(rawRefresh);
      const refreshed    = await refreshGoogleAccessToken(userId, refreshToken);
      if (refreshed) return refreshed;
    }

    return accessToken;
  } catch {
    return null;
  }
}

// ─── Tier 2: Credential vault lookup ─────────────────────────────────────────

async function lookupCredentialVault(
  provider: OAuthProvider,
  userId: string,
): Promise<string | null> {
  try {
    return await getCredentialVault().retrieve({ userId }, provider);
  } catch {
    return null;
  }
}

// ─── Tier 3: Legacy user_credentials table lookup ────────────────────────────

async function lookupUserCredentials(
  provider: OAuthProvider,
  userId: string,
): Promise<string | null> {
  try {
    const rows = await queryAsService<{ credentials: Record<string, string> | null }>(
      `SELECT credentials
         FROM user_credentials
        WHERE user_id = $1
          AND service  = $2
        LIMIT 1`,
      [userId, provider],
    );
    if (!rows.length || !rows[0].credentials) return null;

    const creds = rows[0].credentials;
    return creds.access_token ?? creds.accessToken ?? creds.token ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve an OAuth access token for the given provider.
 *
 * Tries each userId in order, checking all three storage tiers per user
 * before moving to the next candidate.
 *
 * @param provider - OAuth provider ('google', 'linkedin', …)
 * @param userIds  - Candidates to try in priority order:
 *                   typically [workflowOwnerId, currentUserId]
 * @returns ResolvedToken (with token + userId + source) or null if not found
 */
export async function resolveOAuthToken(
  provider: OAuthProvider,
  userIds: Array<string | undefined | null>,
): Promise<ResolvedToken | null> {
  const candidates = userIds.filter((id): id is string => Boolean(id));

  for (const userId of candidates) {
    const oauthToken = await lookupOAuthTable(provider, userId);
    if (oauthToken) {
      console.log(`[CredentialResolver] ${provider} → oauth_table (user: ${userId})`);
      return { token: oauthToken, userId, source: 'oauth_table' };
    }

    const vaultToken = await lookupCredentialVault(provider, userId);
    if (vaultToken) {
      console.log(`[CredentialResolver] ${provider} → credential_vault (user: ${userId})`);
      return { token: vaultToken, userId, source: 'credential_vault' };
    }

    const legacyToken = await lookupUserCredentials(provider, userId);
    if (legacyToken) {
      console.log(`[CredentialResolver] ${provider} → user_credentials (user: ${userId})`);
      return { token: legacyToken, userId, source: 'user_credentials' };
    }
  }

  console.warn(`[CredentialResolver] No ${provider} token found. Tried users: [${candidates.join(', ')}]`);
  return null;
}

/**
 * Convenience wrapper — returns the raw token string (or null).
 * Use this when callers only need the token value, not the metadata.
 */
export async function resolveOAuthTokenString(
  provider: OAuthProvider,
  userIds: Array<string | undefined | null>,
): Promise<string | null> {
  const result = await resolveOAuthToken(provider, userIds);
  return result?.token ?? null;
}

/**
 * Resolve a canonical user ID by email address.
 *
 * When the same person has multiple Cognito sub IDs (e.g., one from
 * email/password login, another from Google OAuth login), this finds
 * the sub that actually has a stored OAuth token for Google — so workflow
 * execution can use the right credentials regardless of how the user logged in.
 *
 * @param email - The authenticated user's email address
 * @returns     - The user ID that has a Google token, or the first email match, or null
 */
export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;

  try {
    const rows = await queryAsService<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 10`,
      [email],
    );
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0].id;

    const userIds = rows.map(r => r.id);

    // Return the sub with the most OAuth tokens across all provider tables.
    // This ensures we pick the "real" production account regardless of which
    // provider the user first authenticated with.
    const tokenCounts = await queryAsService<{ user_id: string; token_count: string }>(
      `SELECT user_id, COUNT(*) AS token_count
         FROM (
           SELECT user_id FROM google_oauth_tokens    WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM linkedin_oauth_tokens  WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM notion_oauth_tokens    WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM twitter_oauth_tokens   WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM instagram_oauth_tokens WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM salesforce_oauth_tokens WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM zoho_oauth_tokens      WHERE user_id = ANY($1)
           UNION ALL
           SELECT user_id FROM social_tokens          WHERE user_id = ANY($1)
         ) combined
        GROUP BY user_id
        ORDER BY token_count DESC
        LIMIT 1`,
      [userIds],
    );

    if (tokenCounts.length) return tokenCounts[0].user_id;

    // No tokens found under any sub — return first matching sub
    return rows[0].id;
  } catch {
    return null;
  }
}
