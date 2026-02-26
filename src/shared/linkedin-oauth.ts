// LinkedIn OAuth Helper
// Similar to Google OAuth - uses Supabase OAuth provider

import { getSupabaseClient } from '../core/database/supabase-compat';

/**
 * Get LinkedIn access token for a user
 * @param supabase - Supabase client
 * @param userId - User ID or array of user IDs to try (in order)
 * @returns Access token or null if not found
 */
export async function getLinkedInAccessToken(
  supabase: any,
  userId: string | string[]
): Promise<string | null> {
  try {
    // Support both single user ID and array of user IDs (for fallback)
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    // Try each user ID in order until we find a valid token
    for (const uid of userIds) {
      if (!uid) continue;
      
      const { data: tokenData, error } = await supabase
        .from('linkedin_oauth_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', uid)
        .single();

      if (error || !tokenData) {
        // Try next user ID
        continue;
      }

      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // Check if token is expired or about to expire
      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        // Try to refresh if we have a refresh token
        if (tokenData.refresh_token) {
          const refreshedToken = await refreshLinkedInToken(
            supabase,
            uid,
            tokenData.refresh_token
          );
          if (refreshedToken) {
            return refreshedToken;
          }
          // Refresh failed - credentials might not be configured, but try using expired token anyway.
          // The API call will fail with a proper error if token is truly invalid.
          console.warn('[LinkedIn OAuth] Token refresh failed. Falling back to existing token (may be expired).');
          return tokenData.access_token;
        }
        // Token expired and no refresh token - try using it anyway, API will return proper error
        console.warn('[LinkedIn OAuth] Token expired and no refresh token available. Using existing token (may be expired).');
        return tokenData.access_token;
      }

      // Found valid token
      return tokenData.access_token;
    }

    // No valid token found for any user ID
    return null;
  } catch (error) {
    // Only log unexpected errors, not configuration issues
    console.error('[LinkedIn OAuth] Unexpected error getting access token:', error);
    return null;
  }
}

async function refreshLinkedInToken(
  supabase: any,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('[LinkedIn OAuth] Cannot refresh token - LINKEDIN_CLIENT_ID/SECRET not configured.');
      return null;
    }

    // Use LinkedIn OAuth 2.0 token endpoint for refresh
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[LinkedIn OAuth] Token refresh HTTP error:', response.status, errorText.slice(0, 200));
      return null;
    }

    const json = await response.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
    };

    if (!json.access_token) {
      console.warn('[LinkedIn OAuth] Token refresh response missing access_token.');
      return null;
    }

    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;

    // Persist refreshed token back to linkedin_oauth_tokens
    const { error: updateError } = await supabase
      .from('linkedin_oauth_tokens')
      .update({
        access_token: json.access_token,
        refresh_token: json.refresh_token || refreshToken,
        expires_at: expiresAt,
        scope: json.scope || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.warn('[LinkedIn OAuth] Failed to persist refreshed token:', updateError.message);
      // Still return the new token so the current execution can proceed
    } else {
      console.log('[LinkedIn OAuth] Token refreshed and persisted for user', userId);
    }

    return json.access_token;
  } catch (error) {
    console.error('[LinkedIn OAuth] Error refreshing token:', error);
    return null;
  }
}
