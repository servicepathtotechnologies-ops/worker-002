/**
 * Twitter Token Manager
 * 
 * Helper functions to retrieve and manage Twitter OAuth tokens from Supabase.
 */

import { SupabaseClient } from '@supabase/supabase-js';

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
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      const { data: tokenData, error } = await supabase
        .from('twitter_oauth_tokens')
        .select('access_token, expires_at, refresh_token')
        .eq('user_id', uid)
        .single();

      if (error || !tokenData) {
        console.log(`[TwitterTokenManager] No token found for user ${uid}, trying next user...`);
        continue;
      }

      // Check if token is expired (with 5 minute buffer)
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        console.warn(`[TwitterTokenManager] Token for user ${uid} is expired or expiring soon`);
        
        // Try to refresh token if refresh_token is available
        if (tokenData.refresh_token) {
          const refreshed = await refreshTwitterToken(supabase, uid, tokenData.refresh_token);
          if (refreshed) {
            return refreshed;
          }
        }
        
        // If refresh failed, return null
        continue;
      }

      if (tokenData.access_token) {
        console.log(`[TwitterTokenManager] ✅ Found valid Twitter token for user ${uid}`);
        return tokenData.access_token;
      }
    } catch (error) {
      console.error(`[TwitterTokenManager] Error fetching token for user ${uid}:`, error);
      continue;
    }
  }

  console.warn('[TwitterTokenManager] No valid Twitter token found for any user');
  return null;
}

/**
 * Refresh Twitter access token
 */
async function refreshTwitterToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const clientId = process.env.TWITTER_OAUTH_CLIENT_ID;
    const clientSecret = process.env.TWITTER_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[TwitterTokenManager] Twitter OAuth credentials not configured for refresh');
      return null;
    }

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('[TwitterTokenManager] Failed to refresh token');
      return null;
    }

    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Update token in database
    await supabase
      .from('twitter_oauth_tokens')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return tokenData.access_token;
  } catch (error) {
    console.error('[TwitterTokenManager] Error refreshing token:', error);
    return null;
  }
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
