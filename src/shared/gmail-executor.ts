/**
 * Gmail Node Executor
 * 
 * ✅ CRITICAL: Complete Gmail execution pipeline with credential resolution
 * 
 * Features:
 * - Automatic OAuth token resolution
 * - Token refresh handling
 * - Scope validation
 * - Error handling with clear messages
 * - Support for send/list/get/search operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from './google-sheets';
import { fetchWithRetry, parseGoogleApiError, validateEmail } from './google-api-utils';

export interface GmailCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  userId: string;
}

export interface GmailSendConfig {
  to: string;
  subject: string;
  body: string;
  from?: string; // Optional - uses OAuth account if not provided
}

export interface GmailListConfig {
  query?: string;
  maxResults?: number;
}

export interface GmailGetConfig {
  messageId: string;
}

/**
 * Required Gmail scopes
 */
export const REQUIRED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

/**
 * Resolve Gmail credentials for a workflow/node
 * 
 * Strategy:
 * 1. Try workflow owner's Google OAuth tokens
 * 2. Try current user's Google OAuth tokens (if different)
 * 3. Validate scopes
 * 4. Refresh token if expired
 */
export async function resolveGmailCredentials(
  supabase: SupabaseClient,
  workflowId: string,
  nodeId: string,
  userId?: string,
  currentUserId?: string
): Promise<GmailCredential | null> {
  console.log(`[GmailNode] Resolving credentials for workflow ${workflowId}, node ${nodeId}`);
  
  // Try user IDs in order: workflow owner first, then current user
  const userIdsToTry: string[] = [];
  if (userId) userIdsToTry.push(userId);
  if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
  
  if (userIdsToTry.length === 0) {
    console.warn('[GmailNode] No user IDs provided for credential resolution');
    return null;
  }
  
  // Try each user ID until we find valid credentials
  for (const uid of userIdsToTry) {
    if (!uid) continue;
    
    try {
      // Fetch token data including scopes (field is 'scope' in DB, may be string or array)
      const { data: tokenData, error } = await supabase
        .from('google_oauth_tokens')
        .select('access_token, refresh_token, expires_at, scope')
        .eq('user_id', uid)
        .single();
      
      if (error || !tokenData) {
        console.log(`[GmailNode] No token found for user ${uid}, trying next user...`);
        continue;
      }
      
      // Check if token has required scopes (DB field is 'scope', may be string or array)
      const scopeField = (tokenData as any).scope || (tokenData as any).scopes || '';
      const scopes = Array.isArray(scopeField) ? scopeField : 
                     (typeof scopeField === 'string' ? scopeField.split(' ') : []);
      const scopesArray = scopes.map((s: string) => s.trim()).filter(Boolean);
      
      // Check if any required scope is present
      const hasRequiredScopes = REQUIRED_GMAIL_SCOPES.some(requiredScope =>
        scopesArray.some((scope: string) => scope === requiredScope || scope.includes('gmail'))
      );
      
      if (!hasRequiredScopes && scopesArray.length > 0) {
        console.warn(`[GmailNode] Token found but missing required Gmail scopes. Found: ${scopesArray.join(', ')}. Required: ${REQUIRED_GMAIL_SCOPES.join(' or ')}`);
        // Continue to next user instead of failing - might have valid token
      }
      
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      let accessToken = tokenData.access_token;
      let wasRefreshed = false;
      
      // Refresh token if expired or about to expire
      if (expiresAt && expiresAt < fiveMinutesFromNow) {
        if (tokenData.refresh_token) {
          console.log(`[GmailNode] Token expired, refreshing for user ${uid}...`);
          const refreshedToken = await refreshGmailToken(supabase, uid, tokenData.refresh_token);
          if (refreshedToken) {
            accessToken = refreshedToken;
            wasRefreshed = true;
            console.log(`[GmailNode] ✅ Token refreshed successfully`);
          } else {
            console.warn(`[GmailNode] ⚠️ Token refresh failed, using existing token (may be expired)`);
          }
        } else {
          console.warn(`[GmailNode] ⚠️ Token expired but no refresh token available`);
        }
      }
      
      console.log(`[GmailNode] ✅ Resolved credential: { userId: ${uid}, scopes: ${scopesArray.join(', ') || 'none'}, expiresAt: ${expiresAt?.toISOString() || 'N/A'}, refreshed: ${wasRefreshed} }`);
      
      return {
        accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: expiresAt || undefined,
        scopes: scopesArray,
        userId: uid,
      };
    } catch (error) {
      console.error(`[GmailNode] Error resolving credentials for user ${uid}:`, error);
      continue;
    }
  }
  
  console.error(`[GmailNode] ❌ No valid credentials found for any user`);
  return null;
}

/**
 * Refresh Gmail OAuth token
 */
async function refreshGmailToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const { config } = await import('../core/config');
    const clientId = config.googleOAuthClientId;
    const clientSecret = config.googleOAuthClientSecret;
    
    if (!clientId || !clientSecret) {
      console.warn('[GmailNode] Google OAuth credentials not configured - cannot refresh token');
      return null;
    }
    
    console.log(`[GmailNode] Refreshing token for user ${userId}...`);
    
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
      console.error(`[GmailNode] Token refresh failed: ${response.status} ${errorText}`);
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
      console.error('[GmailNode] Failed to update refreshed token in database:', updateError);
      return null;
    }
    
    console.log(`[GmailNode] ✅ Token refreshed and saved`);
    return tokenData.access_token;
  } catch (error) {
    console.error('[GmailNode] Error refreshing token:', error);
    return null;
  }
}

/**
 * Send email via Gmail API
 */
export async function sendGmailEmail(
  credential: GmailCredential,
  config: GmailSendConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Validate inputs
    if (!config.to || !config.to.trim()) {
      return { success: false, error: 'Gmail: "to" field is required' };
    }
    
    if (!config.subject || !config.subject.trim()) {
      return { success: false, error: 'Gmail: "subject" field is required' };
    }
    
    if (!config.body || !config.body.trim()) {
      return { success: false, error: 'Gmail: "body" field is required' };
    }
    
    // Validate email format
    if (!validateEmail(config.to)) {
      return { success: false, error: `Gmail: Invalid email address format: ${config.to}` };
    }
    
    console.log(`[GmailNode] Sending email to ${config.to} with subject: ${config.subject.substring(0, 50)}...`);
    
    // Create email message in RFC 2822 format
    const fromEmail = config.from || 'me'; // 'me' uses authenticated user's email
    const emailMessage = [
      `To: ${config.to}`,
      `From: ${fromEmail}`,
      `Subject: ${config.subject}`,
      '',
      config.body,
    ].join('\r\n');
    
    // Encode message in base64url format (RFC 4648)
    const encodedMessage = Buffer.from(emailMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Send via Gmail API
    const response = await fetchWithRetry(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedMessage,
        }),
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        retryableStatuses: [429, 500, 502, 503, 504],
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = parseGoogleApiError(response, errorText);
      
      // Map specific error codes
      if (response.status === 401) {
        return { success: false, error: `Gmail: Authentication failed. Token invalid or expired. Please re-authenticate with Google. ${errorMessage}` };
      }
      if (response.status === 403) {
        return { success: false, error: `Gmail: Permission denied. Missing required scope: ${REQUIRED_GMAIL_SCOPES.join(' or ')}. ${errorMessage}` };
      }
      if (response.status === 400) {
        return { success: false, error: `Gmail: Invalid request. Check email address format. ${errorMessage}` };
      }
      if (response.status === 429) {
        return { success: false, error: `Gmail: Rate limit exceeded. Please try again later. ${errorMessage}` };
      }
      
      return { success: false, error: `Gmail API error: ${errorMessage}` };
    }
    
    const result = await response.json() as { id?: string };
    console.log(`[GmailNode] ✅ Email sent successfully. Message ID: ${result.id || 'N/A'}`);
    
    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[GmailNode] Error sending email:', errorMessage);
    return { success: false, error: `Gmail: ${errorMessage}` };
  }
}

/**
 * List Gmail messages
 */
export async function listGmailMessages(
  credential: GmailCredential,
  config: GmailListConfig
): Promise<{ success: boolean; messages?: any[]; error?: string }> {
  try {
    const maxResults = config.maxResults || 10;
    const query = config.query || '';
    
    const queryParams = new URLSearchParams({
      maxResults: String(maxResults),
    });
    if (query) {
      queryParams.append('q', query);
    }
    
    const response = await fetchWithRetry(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = parseGoogleApiError(response, errorText);
      return { success: false, error: `Gmail API error: ${errorMessage}` };
    }
    
    const result = await response.json() as { messages?: any[] };
    return {
      success: true,
      messages: result.messages || [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Gmail: ${errorMessage}` };
  }
}

/**
 * Get Gmail message by ID
 */
export async function getGmailMessage(
  credential: GmailCredential,
  config: GmailGetConfig
): Promise<{ success: boolean; message?: any; error?: string }> {
  try {
    if (!config.messageId) {
      return { success: false, error: 'Gmail: messageId is required' };
    }
    
    const response = await fetchWithRetry(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${config.messageId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credential.accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = parseGoogleApiError(response, errorText);
      return { success: false, error: `Gmail API error: ${errorMessage}` };
    }
    
    const message = await response.json();
    return {
      success: true,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Gmail: ${errorMessage}` };
  }
}
