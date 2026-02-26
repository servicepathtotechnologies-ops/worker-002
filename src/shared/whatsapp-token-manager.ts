/**
 * WhatsApp Token Manager
 * 
 * Helper functions to retrieve and manage WhatsApp/Facebook OAuth tokens from Supabase.
 * WhatsApp uses Facebook OAuth tokens with WhatsApp Business API permissions.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface WhatsAppTokenData {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  token_type?: string;
  scope?: string | null;
  user_id?: string | null;
  phone_number_id?: string | null;
  business_account_id?: string | null;
}

/**
 * Get WhatsApp/Facebook access token from Supabase
 * Tries multiple user IDs in order (workflow owner, then current user)
 * 
 * Note: WhatsApp uses Facebook OAuth tokens with WhatsApp permissions.
 * The token should have permissions: whatsapp_business_messaging, 
 * whatsapp_business_management, whatsapp_business_profile
 */
export async function getWhatsAppAccessToken(
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
      // First, try to get from a dedicated whatsapp_oauth_tokens table (if it exists)
      // Otherwise, fall back to facebook_oauth_tokens or user_credentials
      let tokenData: any = null;
      let error: any = null;

      // Try whatsapp_oauth_tokens table first
      const { data: whatsappTokenData, error: whatsappError } = await supabase
        .from('whatsapp_oauth_tokens')
        .select('access_token, expires_at, refresh_token')
        .eq('user_id', uid)
        .single();

      if (!whatsappError && whatsappTokenData) {
        tokenData = whatsappTokenData;
      } else {
        // Fall back to facebook_oauth_tokens (WhatsApp uses Facebook OAuth)
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
            .eq('service', 'whatsapp')
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
        console.log(`[WhatsAppTokenManager] No token found for user ${uid}, trying next user...`);
        continue;
      }

      // Check if token is expired (with 5 minute buffer)
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        console.warn(`[WhatsAppTokenManager] Token for user ${uid} is expired or expiring soon`);
        
        // Try to refresh token if refresh_token is available
        if (tokenData.refresh_token) {
          const refreshed = await refreshWhatsAppToken(supabase, uid, tokenData.refresh_token);
          if (refreshed) {
            return refreshed;
          }
        }
        
        // If refresh failed, return null
        continue;
      }

      if (tokenData.access_token) {
        console.log(`[WhatsAppTokenManager] ✅ Found valid WhatsApp/Facebook token for user ${uid}`);
        return tokenData.access_token;
      }
    } catch (error) {
      console.error(`[WhatsAppTokenManager] Error fetching token for user ${uid}:`, error);
      continue;
    }
  }

  console.warn('[WhatsAppTokenManager] No valid WhatsApp/Facebook token found for any user');
  return null;
}

/**
 * Refresh WhatsApp/Facebook access token
 * Uses Facebook OAuth token refresh endpoint
 */
async function refreshWhatsAppToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const clientId = process.env.FACEBOOK_APP_ID || process.env.WHATSAPP_CLIENT_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.WHATSAPP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[WhatsAppTokenManager] Facebook/WhatsApp OAuth credentials not configured for refresh');
      return null;
    }

    // Facebook token refresh endpoint
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
      console.error('[WhatsAppTokenManager] Failed to refresh token');
      return null;
    }

    const tokenData = await refreshResponse.json() as {
      access_token: string;
      expires_in?: number;
    };

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Update token in database (try whatsapp_oauth_tokens first, then facebook_oauth_tokens)
    const updateData = {
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // Try to update whatsapp_oauth_tokens
    await supabase
      .from('whatsapp_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId);

    // Also try facebook_oauth_tokens
    await supabase
      .from('facebook_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId);

    return tokenData.access_token;
  } catch (error) {
    console.error('[WhatsAppTokenManager] Error refreshing token:', error);
    return null;
  }
}

/**
 * Get WhatsApp Business Account ID (WABA ID) from phone number ID
 * This is required for template management and some other operations
 */
export async function getWhatsAppBusinessAccountId(
  accessToken: string,
  phoneNumberId: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=whatsapp_business_account&access_token=${accessToken}`
    );
    
    if (!response.ok) {
      console.error('[WhatsAppTokenManager] Failed to fetch phone number details');
      return null;
    }

    const data = await response.json() as { 
      whatsapp_business_account?: { id: string } 
    };
    
    if (data.whatsapp_business_account?.id) {
      return data.whatsapp_business_account.id;
    }

    return null;
  } catch (error) {
    console.error('[WhatsAppTokenManager] Error getting WhatsApp Business Account ID:', error);
    return null;
  }
}

/**
 * Get full WhatsApp token data (including metadata)
 */
export async function getWhatsAppTokenData(
  supabase: SupabaseClient,
  userId?: string | string[]
): Promise<WhatsAppTokenData | null> {
  if (!userId) {
    return null;
  }

  const userIdsToTry = Array.isArray(userId) ? userId : [userId];

  for (const uid of userIdsToTry) {
    if (!uid) continue;

    try {
      // Try whatsapp_oauth_tokens first
      const { data: whatsappTokenData, error: whatsappError } = await supabase
        .from('whatsapp_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (!whatsappError && whatsappTokenData) {
        return whatsappTokenData as WhatsAppTokenData;
      }

      // Fall back to facebook_oauth_tokens
      const { data: facebookTokenData, error: facebookError } = await supabase
        .from('facebook_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (!facebookError && facebookTokenData) {
        return facebookTokenData as WhatsAppTokenData;
      }
    } catch (error) {
      console.error(`[WhatsAppTokenManager] Error fetching token data for user ${uid}:`, error);
      continue;
    }
  }

  return null;
}
