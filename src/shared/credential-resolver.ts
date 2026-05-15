/**
 * Compatibility facade for older imports.
 *
 * Runtime credentials are resolved exclusively through services/credential-resolver.ts.
 * This file intentionally contains no credential-table queries.
 */

import { queryAsService } from '../core/database/db-pool';
import { resolveCredential } from '../services/credential-resolver';
import { normalizeProvider } from '../services/credential-scope-registry';

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

export type TokenSource = 'unified_credentials';

export interface ResolvedToken {
  token: string;
  userId: string;
  source: TokenSource;
}

function ownerOnly(userIds: Array<string | undefined | null>): string | null {
  const candidates = userIds.filter((id): id is string => Boolean(id));
  if (candidates.length > 1 && candidates[0] !== candidates[1]) {
    console.info('[CredentialResolver] Ignoring current-user credential fallback; workflow owner credentials are isolated.', {
      workflowOwnerId: candidates[0],
      currentUserId: candidates[1],
    });
  }
  return candidates[0] || null;
}

export async function resolveOAuthToken(
  provider: OAuthProvider,
  userIds: Array<string | undefined | null>,
  requiredScopes?: string[],
): Promise<ResolvedToken> {
  const userId = ownerOnly(userIds);
  if (!userId) {
    throw new Error(`Credential resolution requires a workflow owner user id for provider ${provider}`);
  }

  const credential = await resolveCredential({
    userId,
    provider: normalizeProvider(provider),
    requiredScopes: requiredScopes || [],
  });

  return {
    token: credential.accessToken,
    userId: credential.userId,
    source: 'unified_credentials',
  };
}

export async function resolveOAuthTokenString(
  provider: OAuthProvider,
  userIds: Array<string | undefined | null>,
  requiredScopes?: string[],
): Promise<string> {
  const result = await resolveOAuthToken(provider, userIds, requiredScopes);
  return result.token;
}

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;

  const rows = await queryAsService<{ id: string }>(
    `SELECT id
       FROM users
      WHERE LOWER(email) = LOWER($1)
      ORDER BY created_at ASC
      LIMIT 1`,
    [email],
  );
  return rows[0]?.id || null;
}
