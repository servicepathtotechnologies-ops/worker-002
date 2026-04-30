import { resolveOAuthTokenString } from './credential-resolver';

export async function getLinkedInAccessToken(
  supabase: any,
  userId: string | string[]
): Promise<string | null> {
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('linkedin', userIds);
}
