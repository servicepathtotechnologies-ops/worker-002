/**
 * Identity Resolver
 *
 * WHY: When a user registers with email/password (Cognito sub = UUID-A) then
 * later signs in with Google/Facebook OAuth (Cognito creates a new federated
 * sub = UUID-B), the DB has all their data under UUID-A.  Every auth method
 * for the same email must resolve to the same canonical database user ID so
 * queries always return the right data.
 *
 * Strategy: the canonical user is the OLDEST row in public.users with that
 * email.  This is stable and deterministic regardless of which provider the
 * user authenticates with first.
 */

import { queryAsService } from './db-pool';

const _cache = new Map<string, { canonicalId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

/**
 * Returns the canonical DB user ID for the given Cognito sub + email.
 *
 * If an older user row exists in public.users with the same email, that row's
 * ID is returned instead of `sub`.  Otherwise `sub` is returned as-is (first
 * login — ensureUserRows will create the row later in the request lifecycle).
 *
 * The result is cached for 5 minutes to avoid a DB round-trip on every request.
 */
export async function resolveCanonicalUserId(sub: string, email: string): Promise<string> {
  if (!sub) return sub;

  const cached = _cache.get(sub);
  if (cached && Date.now() < cached.expiresAt) return cached.canonicalId;

  if (!email || !email.includes('@')) {
    _cache.set(sub, { canonicalId: sub, expiresAt: Date.now() + CACHE_TTL_MS });
    return sub;
  }

  try {
    // Check users table first (email is synced there after first login)
    const rows = await queryAsService<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) ORDER BY created_at ASC LIMIT 1`,
      [email]
    );

    if (rows[0]?.id) {
      const canonicalId = rows[0].id;
      _cache.set(sub, { canonicalId, expiresAt: Date.now() + CACHE_TTL_MS });
      return canonicalId;
    }

    // Fallback: profiles table always stores the real email (from Cognito/OAuth providers)
    const profileRows = await queryAsService<{ user_id: string }>(
      `SELECT p.user_id FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE LOWER(p.email) = LOWER($1)
       ORDER BY u.created_at ASC LIMIT 1`,
      [email]
    );

    const canonicalId = profileRows[0]?.user_id ?? sub;
    _cache.set(sub, { canonicalId, expiresAt: Date.now() + CACHE_TTL_MS });
    return canonicalId;
  } catch {
    // DB unavailable — non-fatal, fall back to raw sub
    return sub;
  }
}

/** Invalidate the cache for a sub (e.g. after manual account merge). */
export function invalidateIdentityCache(sub: string): void {
  _cache.delete(sub);
}
