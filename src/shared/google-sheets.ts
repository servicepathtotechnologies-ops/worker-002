// Google Sheets API Helper
// Migrated from Supabase Edge Function
// Simplified version - full implementation available in functions/_shared/google-sheets.ts

import { getSupabaseClient } from '../core/database/supabase-compat';
import { config } from '../core/config';

interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName?: string;
  range?: string;
  operation: 'read' | 'write' | 'append' | 'update';
  outputFormat?: 'json' | 'keyvalue' | 'text';
  readDirection?: 'rows' | 'columns';
  data?: unknown[][];
  accessToken: string;
}

interface GoogleSheetsResponse {
  success: boolean;
  data?: unknown;
  rows?: number;
  columns?: number;
  error?: string;
}

/**
 * Get Google access token for a user
 * @param supabase - Supabase client
 * @param userId - User ID or array of user IDs to try (in order)
 * @returns Access token or null if not found
 */
export async function getGoogleAccessToken(
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
        .from('google_oauth_tokens')
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
          const refreshedToken = await refreshGoogleToken(
            supabase,
            uid,
            tokenData.refresh_token
          );
          if (refreshedToken) {
            return refreshedToken;
          }
          // Refresh failed - credentials might not be configured, but try using expired token anyway
          // The API call will fail with a proper error if token is truly invalid
          console.log('[Google OAuth] Token refresh failed (credentials may not be configured). Using existing token - it may be expired.');
          return tokenData.access_token;
        }
        // Token expired and no refresh token - try using it anyway, API will return proper error
        console.log('[Google OAuth] Token expired but no refresh token available. Using expired token - API call may fail.');
        return tokenData.access_token;
      }

      // Found valid token
      return tokenData.access_token;
    }

    // No valid token found for any user ID
    return null;
  } catch (error) {
    // Only log unexpected errors, not configuration issues
    console.error('[Google OAuth] Unexpected error getting access token:', error);
    return null;
  }
}

async function refreshGoogleToken(
  supabase: any,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const clientId = config.googleOAuthClientId;
    const clientSecret = config.googleOAuthClientSecret;

    if (!clientId || !clientSecret) {
      // Return null instead of throwing - credentials not configured
      return null;
    }

    console.log('[Google OAuth] Refreshing token for user:', userId);

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
      console.error('[Google OAuth] Token refresh failed:', errorText);
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
    };

    if (tokenData.refresh_token) {
      updateData.refresh_token = tokenData.refresh_token;
    }

    const { error: updateError } = await supabase
      .from('google_oauth_tokens')
      .update(updateData)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Google OAuth] Failed to update token in database:', updateError);
      return null;
    }

    console.log('[Google OAuth] Token refreshed successfully');
    return tokenData.access_token as string;
  } catch (error) {
    console.error('[Google OAuth] Error refreshing token:', error);
    return null;
  }
}

export async function executeGoogleSheetsOperation(
  config: GoogleSheetsConfig
): Promise<GoogleSheetsResponse> {
  // Simplified implementation
  // Full implementation would handle read/write/append operations
  // See functions/_shared/google-sheets.ts for complete implementation
  
  return {
    success: false,
    error: 'Google Sheets operation not fully implemented. See functions/_shared/google-sheets.ts for full implementation.',
  };
}
