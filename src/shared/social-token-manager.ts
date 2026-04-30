/**
 * Social Token Manager
 * 
 * Unified token management for all social media providers.
 * Handles token retrieval, storage, and refresh with encryption.
 * 
 * Supports providers: github, facebook, twitter, linkedin, google
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken, encryptTokens, decryptTokens } from '../core/utils/token-encryption';
import { resolveOAuthTokenString, OAuthProvider } from './credential-resolver';

export type SocialProvider = 'github' | 'facebook' | 'twitter' | 'linkedin' | 'google';

export interface SocialTokenData {
  access_token: string;
  refresh_token?: string | null;
  token_type?: string;
  expires_at?: string | null;
  scope?: string | null;
  provider_user_id?: string | null;
}

export interface StoredSocialToken extends SocialTokenData {
  id: string;
  user_id: string;
  provider: SocialProvider;
  created_at: string;
  updated_at: string;
}

/**
 * Get provider token for a user
 * Automatically handles token refresh if expired
 * 
 * @param supabase - Supabase client
 * @param userId - User ID (or array of user IDs to try in order)
 * @param provider - Social media provider
 * @returns Access token or null if not found
 */
export async function getProviderToken(
  supabase: SupabaseClient,
  userId: string | string[],
  provider: SocialProvider
): Promise<string | null> {
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString(provider as OAuthProvider, userIds);
}

/**
 * Save provider token for a user
 * Tokens are encrypted before storage
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param provider - Social media provider
 * @param tokenData - Token data to save
 */
export async function saveProviderToken(
  supabase: SupabaseClient,
  userId: string,
  provider: SocialProvider,
  tokenData: SocialTokenData
): Promise<void> {
  try {
    // Encrypt tokens before storage
    const encryptedTokens = encryptTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
    });
    
    const { error } = await supabase
      .from('social_tokens')
      .upsert({
        user_id: userId,
        provider,
        access_token: encryptedTokens.access_token,
        refresh_token: encryptedTokens.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: tokenData.expires_at || null,
        scope: tokenData.scope || null,
        provider_user_id: tokenData.provider_user_id || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });
    
    if (error) {
      throw new Error(`Failed to save ${provider} token: ${error.message}`);
    }
    
    console.log(`[Social Token] ✅ Saved ${provider} token for user ${userId}`);
  } catch (error) {
    console.error(`[Social Token] Error saving ${provider} token:`, error);
    throw error;
  }
}

/**
 * Refresh provider token
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param provider - Social media provider
 * @param refreshToken - Refresh token (already decrypted)
 * @returns New access token or null if refresh failed
 */
export async function refreshProviderToken(
  supabase: SupabaseClient,
  userId: string,
  provider: SocialProvider,
  refreshToken: string
): Promise<string | null> {
  try {
    // Import provider-specific refresh functions
    let newTokenData: SocialTokenData | null = null;
    
    switch (provider) {
      case 'github':
        // GitHub tokens don't expire, but we can refresh if needed
        // For now, return null (no refresh needed)
        return null;
        
      case 'facebook':
        newTokenData = await refreshFacebookToken(refreshToken);
        break;
        
      case 'twitter':
        // Twitter OAuth 1.0a doesn't use refresh tokens
        return null;
        
      case 'linkedin':
        newTokenData = await refreshLinkedInToken(refreshToken);
        break;
        
      case 'google':
        newTokenData = await refreshGoogleToken(refreshToken);
        break;
        
      default:
        console.warn(`[Social Token] Refresh not supported for provider: ${provider}`);
        return null;
    }
    
    if (!newTokenData) {
      return null;
    }
    
    // Save refreshed token
    await saveProviderToken(supabase, userId, provider, newTokenData);
    
    return newTokenData.access_token;
  } catch (error) {
    console.error(`[Social Token] Error refreshing ${provider} token:`, error);
    return null;
  }
}

/**
 * Refresh Facebook token
 */
async function refreshFacebookToken(refreshToken: string): Promise<SocialTokenData | null> {
  const clientId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  
  if (!clientId || !clientSecret) {
    console.warn('[Social Token] Facebook OAuth credentials not configured');
    return null;
  }
  
  try {
    const response = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Social Token] Facebook token refresh failed:', errorText);
      return null;
    }
    
    const data = await response.json() as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };
    
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    
    return {
      access_token: data.access_token,
      token_type: data.token_type || 'Bearer',
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error('[Social Token] Facebook token refresh error:', error);
    return null;
  }
}

/**
 * Refresh LinkedIn token
 */
async function refreshLinkedInToken(refreshToken: string): Promise<SocialTokenData | null> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.warn('[Social Token] LinkedIn OAuth credentials not configured');
    return null;
  }
  
  try {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Social Token] LinkedIn token refresh failed:', errorText);
      return null;
    }
    
    const data = await response.json() as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      token_type?: string;
    };
    
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_type: data.token_type || 'Bearer',
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error('[Social Token] LinkedIn token refresh error:', error);
    return null;
  }
}

/**
 * Refresh Google token
 */
async function refreshGoogleToken(refreshToken: string): Promise<SocialTokenData | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.warn('[Social Token] Google OAuth credentials not configured');
    return null;
  }
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
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
      console.error('[Social Token] Google token refresh failed:', errorText);
      return null;
    }
    
    const data = await response.json() as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      token_type?: string;
    };
    
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_type: data.token_type || 'Bearer',
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error('[Social Token] Google token refresh error:', error);
    return null;
  }
}

/**
 * Delete provider token for a user
 */
export async function deleteProviderToken(
  supabase: SupabaseClient,
  userId: string,
  provider: SocialProvider
): Promise<void> {
  try {
    const { error } = await supabase
      .from('social_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);
    
    if (error) {
      throw new Error(`Failed to delete ${provider} token: ${error.message}`);
    }
    
    console.log(`[Social Token] ✅ Deleted ${provider} token for user ${userId}`);
  } catch (error) {
    console.error(`[Social Token] Error deleting ${provider} token:`, error);
    throw error;
  }
}

/**
 * Check if user has a connected provider
 */
export async function hasProviderToken(
  supabase: SupabaseClient,
  userId: string,
  provider: SocialProvider
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('social_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();
    
    return !error && !!data;
  } catch (error) {
    return false;
  }
}
