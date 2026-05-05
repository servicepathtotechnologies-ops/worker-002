// Google Sheets API Helper
// Migrated from Supabase Edge Function
// Simplified version - full implementation available in functions/_shared/google-sheets.ts

import { getDbClient } from '../core/database/supabase-compat';
import { config } from '../core/config';
import { decryptToken, encryptToken } from '../core/utils/token-encryption';
import { resolveOAuthTokenString } from './credential-resolver';

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
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('google', userIds);
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
      access_token: encryptToken(tokenData.access_token),
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (tokenData.refresh_token) {
      updateData.refresh_token = encryptToken(tokenData.refresh_token);
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
