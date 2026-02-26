/**
 * Instagram Token Manager
 * 
 * Helper functions to retrieve and manage Instagram/Facebook OAuth tokens from Supabase.
 * Instagram uses Facebook OAuth tokens with Instagram permissions.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface InstagramTokenData {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  token_type?: string;
  scope?: string | null;
  user_id?: string | null;
  instagram_business_account_id?: string | null;
}

/**
 * Get Instagram/Facebook access token from Supabase
 * Tries multiple user IDs in order (workflow owner, then current user)
 * 
 * Note: Instagram uses Facebook OAuth tokens with Instagram permissions.
 * The token should have permissions: instagram_basic, instagram_content_publish, 
 * pages_show_list, business_management
 */
export async function getInstagramAccessToken(
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
      // First, try to get from a dedicated instagram_oauth_tokens table (if it exists)
      // Otherwise, fall back to facebook_oauth_tokens or user_credentials
      let tokenData: any = null;
      let error: any = null;

      // Try instagram_oauth_tokens table first
      const { data: instagramTokenData, error: instagramError } = await supabase
        .from('instagram_oauth_tokens')
        .select('access_token, expires_at, refresh_token')
        .eq('user_id', uid)
        .single();

      if (!instagramError && instagramTokenData) {
        tokenData = instagramTokenData;
      } else {
        // Fall back to facebook_oauth_tokens (Instagram uses Facebook OAuth)
        const { data: facebookTokenData, error: facebookError } = await supabase
          .from('facebook_oauth_tokens')
          .select('access_token, expires_at, refresh_token')
          .eq('user_id', uid)
          .single();

        if (!facebookError && facebookTokenData) {
          tokenData = facebookTokenData;
        } else {
          // Try user_credentials table as last resort
          const { data: credentialsData, error: credentialsError } = await supabase
            .from('user_credentials')
            .select('credentials')
            .eq('user_id', uid)
            .eq('service', 'instagram')
            .single();

          if (!credentialsError && credentialsData?.credentials) {
            const creds = credentialsData.credentials as any;
            tokenData = {
              access_token: creds.accessToken || creds.access_token,
              expires_at: creds.expires_at || creds.expiresAt,
              refresh_token: creds.refreshToken || creds.refresh_token,
            };
          }
        }
      }

      if (!tokenData || !tokenData.access_token) {
        console.log(`[InstagramTokenManager] No token found for user ${uid}, trying next user...`);
        continue;
      }

      // Check if token is expired (with 5 minute buffer)
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        console.warn(`[InstagramTokenManager] Token for user ${uid} is expired or expiring soon`);
        
        // Try to refresh token if refresh_token is available
        if (tokenData.refresh_token) {
          const refreshed = await refreshInstagramToken(supabase, uid, tokenData.refresh_token);
          if (refreshed) {
            return refreshed;
          }
        }
        
        // If refresh failed, return null
        continue;
      }

      if (tokenData.access_token) {
        console.log(`[InstagramTokenManager] ✅ Found valid Instagram/Facebook token for user ${uid}`);
        return tokenData.access_token;
      }
    } catch (error) {
      console.error(`[InstagramTokenManager] Error fetching token for user ${uid}:`, error);
      continue;
    }
  }

  console.warn('[InstagramTokenManager] No valid Instagram/Facebook token found for any user');
  return null;
}

/**
 * Refresh Instagram/Facebook access token
 * Uses Facebook OAuth token refresh endpoint
 */
async function refreshInstagramToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const clientId = process.env.FACEBOOK_APP_ID || process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[InstagramTokenManager] Facebook/Instagram OAuth credentials not configured for refresh');
      return null;
    }

    // Facebook token refresh endpoint
    const response = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const url = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    url.searchParams.append('grant_type', 'fb_exchange_token');
    url.searchParams.append('client_id', clientId);
    url.searchParams.append('client_secret', clientSecret);
    url.searchParams.append('fb_exchange_token', refreshToken);

    const refreshResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!refreshResponse.ok) {
      console.error('[InstagramTokenManager] Failed to refresh token');
      return null;
    }

    const tokenData = await refreshResponse.json() as {
      access_token: string;
      expires_in?: number;
    };

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Update token in database (try instagram_oauth_tokens first, then facebook_oauth_tokens)
    const updateData = {
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // Try to update instagram_oauth_tokens
    await supabase
      .from('instagram_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId);

    // Also try facebook_oauth_tokens
    await supabase
      .from('facebook_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId);

    return tokenData.access_token;
  } catch (error) {
    console.error('[InstagramTokenManager] Error refreshing token:', error);
    return null;
  }
}

/**
 * Get Instagram Business Account ID from Facebook Page
 * This is required for most Instagram Graph API operations
 */
export async function getInstagramBusinessAccountId(
  accessToken: string,
  pageId?: string
): Promise<string | null> {
  try {
    // If pageId is provided, get Instagram account from that page
    if (pageId) {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
      );
      
      if (response.ok) {
        const data = await response.json() as { instagram_business_account?: { id: string } };
        if (data.instagram_business_account?.id) {
          return data.instagram_business_account.id;
        }
      }
    }

    // Otherwise, get user's pages and find the one with Instagram account
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );

    if (!pagesResponse.ok) {
      console.error('[InstagramTokenManager] Failed to fetch pages');
      return null;
    }

    const pagesData = await pagesResponse.json() as {
      data?: Array<{ id: string; instagram_business_account?: { id: string } }>;
    };

    if (pagesData.data && pagesData.data.length > 0) {
      // Find first page with Instagram business account
      for (const page of pagesData.data) {
        if (page.instagram_business_account?.id) {
          return page.instagram_business_account.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[InstagramTokenManager] Error getting Instagram Business Account ID:', error);
    return null;
  }
}

/**
 * Get full Instagram token data (including metadata)
 */
export async function getInstagramTokenData(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<InstagramTokenData | null> {
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      // Try instagram_oauth_tokens first
      const { data: instagramTokenData, error: instagramError } = await supabase
        .from('instagram_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (!instagramError && instagramTokenData) {
        return instagramTokenData as InstagramTokenData;
      }

      // Fall back to facebook_oauth_tokens
      const { data: facebookTokenData, error: facebookError } = await supabase
        .from('facebook_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (!facebookError && facebookTokenData) {
        return facebookTokenData as InstagramTokenData;
      }
    } catch (error) {
      console.error(`[InstagramTokenManager] Error fetching token data for user ${uid}:`, error);
      continue;
    }
  }

  return null;
}
