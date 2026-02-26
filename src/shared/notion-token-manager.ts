/**
 * Notion Token Manager
 * 
 * Helper functions to retrieve and manage Notion OAuth tokens from Supabase.
 */

import { SupabaseClient } from '@supabase/supabase-js';

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
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      const { data: tokenData, error } = await supabase
        .from('notion_oauth_tokens')
        .select('access_token, expires_at')
        .eq('user_id', uid)
        .single();

      if (error || !tokenData) {
        console.log(`[NotionTokenManager] No token found for user ${uid}, trying next user...`);
        continue;
      }

      // Check if token is expired (with 5 minute buffer)
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        console.warn(`[NotionTokenManager] Token for user ${uid} is expired or expiring soon`);
        // Note: Notion tokens typically don't expire, but we check anyway
        // If token is expired, we could refresh it here if refresh_token is available
        // For now, we'll still return it and let the API call fail if truly expired
      }

      if (tokenData.access_token) {
        console.log(`[NotionTokenManager] ✅ Found valid Notion token for user ${uid}`);
        return tokenData.access_token;
      }
    } catch (error) {
      console.error(`[NotionTokenManager] Error fetching token for user ${uid}:`, error);
      continue;
    }
  }

  console.warn('[NotionTokenManager] No valid Notion token found for any user');
  return null;
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
