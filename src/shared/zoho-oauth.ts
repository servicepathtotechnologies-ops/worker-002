// Zoho OAuth 2.0 Token Manager
// Handles token retrieval, refresh, and region-specific endpoints

import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../core/config';

export type ZohoRegion = 'US' | 'EU' | 'IN' | 'AU' | 'CN' | 'JP';

interface ZohoTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  region?: ZohoRegion;
}

interface ZohoCredentials {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  region: ZohoRegion;
}

/**
 * Get Zoho region-specific token endpoint
 */
export function getZohoTokenEndpoint(region: ZohoRegion): string {
  const endpoints: Record<ZohoRegion, string> = {
    US: 'https://accounts.zoho.com/oauth/v2/token',
    EU: 'https://accounts.zoho.eu/oauth/v2/token',
    IN: 'https://accounts.zoho.in/oauth/v2/token',
    AU: 'https://accounts.zoho.com.au/oauth/v2/token',
    CN: 'https://accounts.zoho.com.cn/oauth/v2/token',
    JP: 'https://accounts.zoho.jp/oauth/v2/token',
  };
  return endpoints[region];
}

/**
 * Get Zoho region-specific API base URL
 */
export function getZohoApiBaseUrl(region: ZohoRegion): string {
  const baseUrls: Record<ZohoRegion, string> = {
    US: 'https://www.zohoapis.com',
    EU: 'https://www.zohoapis.eu',
    IN: 'https://www.zohoapis.in',
    AU: 'https://www.zohoapis.com.au',
    CN: 'https://www.zohoapis.com.cn',
    JP: 'https://www.zohoapis.jp',
  };
  return baseUrls[region];
}

/**
 * Get Zoho access token for a user
 * @param supabase - Supabase client
 * @param userId - User ID or array of user IDs to try (in order)
 * @param region - Zoho region (defaults to US)
 * @returns Access token or null if not found
 */
export async function getZohoAccessToken(
  supabase: SupabaseClient,
  userId: string | string[],
  region: ZohoRegion = 'US'
): Promise<string | null> {
  try {
    // Support both single user ID and array of user IDs (for fallback)
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    // Try each user ID in order until we find a valid token
    for (const uid of userIds) {
      if (!uid) continue;
      
      const { data: tokenData, error } = await supabase
        .from('zoho_oauth_tokens')
        .select('access_token, refresh_token, expires_at, region')
        .eq('user_id', uid)
        .eq('region', region)
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
          const refreshedToken = await refreshZohoToken(
            supabase,
            uid,
            tokenData.refresh_token,
            (tokenData.region as ZohoRegion) || region
          );
          if (refreshedToken) {
            return refreshedToken;
          }
          // Refresh failed - credentials might not be configured, but try using expired token anyway
          console.log('[Zoho OAuth] Token refresh failed (credentials may not be configured). Using existing token - it may be expired.');
          return tokenData.access_token;
        }
        // Token expired and no refresh token - try using it anyway, API will return proper error
        console.log('[Zoho OAuth] Token expired but no refresh token available. Using expired token - API call may fail.');
        return tokenData.access_token;
      }

      // Found valid token
      return tokenData.access_token;
    }

    // No valid token found for any user ID
    return null;
  } catch (error) {
    // Only log unexpected errors, not configuration issues
    console.error('[Zoho OAuth] Unexpected error getting access token:', error);
    return null;
  }
}

/**
 * Refresh Zoho OAuth token
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param refreshToken - Refresh token
 * @param region - Zoho region
 * @returns New access token or null if refresh failed
 */
export async function refreshZohoToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string,
  region: ZohoRegion = 'US'
): Promise<string | null> {
  try {
    // Get client credentials from config or node config
    // For now, we'll need to get these from the node config or environment
    // In a real implementation, these might be stored per-user or globally
    const clientId = config.zohoOAuthClientId || process.env.ZOHO_OAUTH_CLIENT_ID;
    const clientSecret = config.zohoOAuthClientSecret || process.env.ZOHO_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      // Return null instead of throwing - credentials not configured
      console.warn('[Zoho OAuth] Client credentials not configured - cannot refresh token');
      return null;
    }

    console.log(`[Zoho OAuth] Refreshing token for user ${userId} in region ${region}`);

    const tokenEndpoint = getZohoTokenEndpoint(region);

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Zoho OAuth] Token refresh failed:', errorText);
      return null;
    }

    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    const updateData: Record<string, unknown> = {
      access_token: tokenData.access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
      region: region,
    };

    if (tokenData.refresh_token) {
      updateData.refresh_token = tokenData.refresh_token;
    }

    const { error: updateError } = await supabase
      .from('zoho_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId)
      .eq('region', region);

    if (updateError) {
      console.error('[Zoho OAuth] Failed to update token in database:', updateError);
      return null;
    }

    console.log('[Zoho OAuth] Token refreshed successfully');
    return tokenData.access_token as string;
  } catch (error) {
    console.error('[Zoho OAuth] Error refreshing token:', error);
    return null;
  }
}

/**
 * Get Zoho credentials from node config or database
 * This function handles credentials that might be passed directly from node config
 * or retrieved from the database
 */
export async function getZohoCredentials(
  supabase: SupabaseClient,
  nodeConfig: Record<string, unknown>,
  userId?: string | string[],
  currentUserId?: string
): Promise<ZohoCredentials | null> {
  // First, try to get credentials from node config (if provided directly)
  const configAccessToken = nodeConfig.accessToken as string | undefined;
  const configRefreshToken = nodeConfig.refreshToken as string | undefined;
  const configClientId = nodeConfig.clientId as string | undefined;
  const configClientSecret = nodeConfig.clientSecret as string | undefined;
  const configRegion = (nodeConfig.region as ZohoRegion) || 'US';

  // If all credentials are in config, use them
  if (configAccessToken && configRefreshToken && configClientId && configClientSecret) {
    return {
      accessToken: configAccessToken,
      refreshToken: configRefreshToken,
      clientId: configClientId,
      clientSecret: configClientSecret,
      region: configRegion,
    };
  }

  // Otherwise, try to get from database
  if (userId || currentUserId) {
    const userIdsToTry: string[] = [];
    if (userId) {
      userIdsToTry.push(...(Array.isArray(userId) ? userId : [userId]));
    }
    if (currentUserId && !userIdsToTry.includes(currentUserId)) {
      userIdsToTry.push(currentUserId);
    }

    for (const uid of userIdsToTry) {
      const { data: tokenData } = await supabase
        .from('zoho_oauth_tokens')
        .select('access_token, refresh_token, region')
        .eq('user_id', uid)
        .eq('region', configRegion)
        .single();

      if (tokenData) {
        const clientId = config.zohoOAuthClientId || process.env.ZOHO_OAUTH_CLIENT_ID;
        const clientSecret = config.zohoOAuthClientSecret || process.env.ZOHO_OAUTH_CLIENT_SECRET;

        if (clientId && clientSecret && tokenData.access_token && tokenData.refresh_token) {
          // Try to get a fresh token
          const freshToken = await getZohoAccessToken(supabase, uid, (tokenData.region as ZohoRegion) || configRegion);
          if (freshToken) {
            return {
              accessToken: freshToken,
              refreshToken: tokenData.refresh_token,
              clientId,
              clientSecret,
              region: (tokenData.region as ZohoRegion) || configRegion,
            };
          }
        }
      }
    }
  }

  return null;
}
