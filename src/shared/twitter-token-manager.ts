/**
 * Twitter Token Manager
 * 
 * Helper functions to retrieve and manage Twitter OAuth tokens from Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOAuthTokenString } from './credential-resolver';

export interface TwitterTokenData {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  token_type?: string;
  scope?: string | null;
  user_id_twitter?: string | null;
  username?: string | null;
  name?: string | null;
}

/**
 * Get Twitter access token from Supabase
 * Tries multiple user IDs in order (workflow owner, then current user)
 */
export async function getTwitterAccessToken(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<string | null> {
  if (!userId) return null;
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('twitter', userIds);
}

/**
 * Get full Twitter token data (including metadata)
 */
export async function getTwitterTokenData(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<TwitterTokenData | null> {
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      const { data: tokenData, error } = await supabase
        .from('twitter_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (error || !tokenData) {
        continue;
      }

      return tokenData as TwitterTokenData;
    } catch (error) {
      console.error(`[TwitterTokenManager] Error fetching token data for user ${uid}:`, error);
      continue;
    }
  }

  return null;
}
