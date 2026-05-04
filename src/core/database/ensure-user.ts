import { queryAsService } from './db-pool';

const ensuredUsers = new Set<string>();

function safeEmail(userId: string, email?: string | null): string {
  return email && email.includes('@') ? email : `${userId}@cognito.local`;
}

function shouldIgnoreOptionalTableError(err: any): boolean {
  return ['42P01', '42703', '42704'].includes(err?.code);
}

const PRESERVE_REAL_EMAIL = `
  CASE
    WHEN EXCLUDED.email NOT LIKE '%@cognito.local' THEN EXCLUDED.email
    WHEN au.email IS NULL
      OR au.email = ''
      OR au.email LIKE '%@cognito.local'
    THEN EXCLUDED.email
    ELSE au.email
  END`;

const PRESERVE_REAL_PUBLIC_EMAIL = `
  CASE
    WHEN EXCLUDED.email NOT LIKE '%@cognito.local' THEN EXCLUDED.email
    WHEN u.email IS NULL
      OR u.email = ''
      OR u.email LIKE '%@cognito.local'
    THEN EXCLUDED.email
    ELSE u.email
  END`;

const PRESERVE_REAL_PROFILE_EMAIL = `
  CASE
    WHEN EXCLUDED.email NOT LIKE '%@cognito.local' THEN EXCLUDED.email
    WHEN p.email IS NULL
      OR p.email = ''
      OR p.email LIKE '%@cognito.local'
    THEN EXCLUDED.email
    ELSE p.email
  END`;

/**
 * Ensures the canonical user's rows exist in auth.users, public.users,
 * profiles, and user_roles.  Called after identity resolution so `userId` is
 * always the canonical DB ID (not a raw OAuth sub that might differ).
 *
 * auth.users must be written FIRST: 23 downstream tables (workflows,
 * executions, social_tokens, profiles, user_roles, ...) all carry FK constraints
 * pointing at auth.users(id).  A Cognito sub that bypasses this step can
 * never insert into any of those tables.
 */
export async function ensureUserRows(userId: string, email?: string | null, fullName?: string | null): Promise<void> {
  if (!userId) return;

  const normalizedEmail = safeEmail(userId, email);
  const cacheKey = `${userId}:${normalizedEmail}`;
  if (ensuredUsers.has(cacheKey)) return;

  // Write auth.users first - all downstream FK constraints reference this table.
  await queryAsService(
    `INSERT INTO auth.users AS au (id, email, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET email      = ${PRESERVE_REAL_EMAIL},
                   updated_at = NOW()`,
    [userId, normalizedEmail]
  ).catch((err) => {
    if (!shouldIgnoreOptionalTableError(err)) throw err;
  });

  await queryAsService(
    `INSERT INTO users AS u (id, email, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET email      = ${PRESERVE_REAL_PUBLIC_EMAIL},
                   updated_at = NOW()`,
    [userId, normalizedEmail]
  ).catch((err) => {
    if (!shouldIgnoreOptionalTableError(err)) throw err;
  });

  await queryAsService(
    `INSERT INTO profiles AS p (user_id, email, full_name, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET email      = ${PRESERVE_REAL_PROFILE_EMAIL},
                   full_name  = COALESCE(p.full_name, EXCLUDED.full_name),
                   updated_at = NOW()`,
    [userId, normalizedEmail, fullName || normalizedEmail.split('@')[0]]
  ).catch((err) => {
    if (!shouldIgnoreOptionalTableError(err)) throw err;
  });

  await queryAsService(
    `INSERT INTO user_roles (user_id, role, created_at)
     VALUES ($1, 'user', NOW())
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId]
  ).catch((err) => {
    if (!shouldIgnoreOptionalTableError(err)) throw err;
  });

  ensuredUsers.add(cacheKey);
}
