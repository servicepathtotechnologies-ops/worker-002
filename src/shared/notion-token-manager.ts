/**
 * Notion Token Manager
 * 
 * Helper functions to retrieve and manage Notion OAuth tokens from Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOAuthTokenString } from './credential-resolver';

export interface NotionTokenData {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  token_type?: string;
  scope?: string | null;
  bot_id?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
}

/**
 * Get Notion access token from Supabase
 * Tries multiple user IDs in order (workflow owner, then current user)
 */
export async function getNotionAccessToken(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<string | null> {
  if (!userId) return null;
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('notion', userIds);
}

/**
 * Get full Notion token data (including metadata)
 */
export async function getNotionTokenData(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<NotionTokenData | null> {
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      const { data: tokenData, error } = await supabase
        .from('notion_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (error || !tokenData) {
        continue;
      }

      return tokenData as NotionTokenData;
    } catch (error) {
      console.error(`[NotionTokenManager] Error fetching token data for user ${uid}:`, error);
      continue;
    }
  }

  return null;
}
