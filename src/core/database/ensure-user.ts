import { queryAsService } from './db-pool';

const ensuredUsers = new Set<string>();

function safeEmail(userId: string, email?: string | null): string {
  return email && email.includes('@') ? email : `${userId}@cognito.local`;
}

function shouldIgnoreOptionalTableError(err: any): boolean {
  return ['42P01', '42703', '42704'].includes(err?.code);
}

/**
 * Ensures the canonical user's rows exist in public.users, profiles, and
 * user_roles.  Called after identity resolution so `userId` is always the
 * canonical DB ID (not a raw OAuth sub that might differ from the stored ID).
 *
 * The former auth.users insert was Supabase-specific and is intentionally
 * removed — this project now uses AWS RDS exclusively.
 */
export async function ensureUserRows(userId: string, email?: string | null, fullName?: string | null): Promise<void> {
  if (!userId) return;

  const normalizedEmail = safeEmail(userId, email);
  const cacheKey = `${userId}:${normalizedEmail}`;
  if (ensuredUsers.has(cacheKey)) return;

  await queryAsService(
    `INSERT INTO users (id, email, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET email      = COALESCE(EXCLUDED.email, users.email),
                   updated_at = NOW()`,
    [userId, normalizedEmail]
  ).catch((err) => {
    if (!shouldIgnoreOptionalTableError(err)) throw err;
  });

  await queryAsService(
    `INSERT INTO profiles (user_id, email, full_name, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET email      = COALESCE(EXCLUDED.email, profiles.email),
                   full_name  = COALESCE(profiles.full_name, EXCLUDED.full_name),
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
