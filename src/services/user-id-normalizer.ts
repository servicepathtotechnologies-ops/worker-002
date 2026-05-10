import { queryAsService } from '../core/database/db-pool';
import { CredentialUserIdError } from './credential-errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export async function normalizeCredentialUserId(userId: string, email?: string): Promise<string> {
  if (isUuid(userId)) return userId;

  const context = { userId, provider: 'identity', requiredScopes: [], resolverStep: 'normalizeUserId' };

  const linkRows = await queryAsService<{ canonical_user_id: string }>(
    `SELECT canonical_user_id
       FROM identity_links
      WHERE linked_user_id = $1
      LIMIT 1`,
    [userId],
  );
  if (isUuid(linkRows[0]?.canonical_user_id)) return linkRows[0].canonical_user_id;

  if (email) {
    const profileRows = await queryAsService<{ user_id: string }>(
      `SELECT user_id
         FROM profiles
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [email],
    );
    if (isUuid(profileRows[0]?.user_id)) return profileRows[0].user_id;
  }

  throw new CredentialUserIdError(context);
}
