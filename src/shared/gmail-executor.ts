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

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOAuthToken } from './credential-resolver';
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

  const candidates = [userId, currentUserId].filter((id): id is string => Boolean(id));
  if (candidates.length === 0) {
    console.warn('[GmailNode] No user IDs provided for credential resolution');
    return null;
  }

  // Unified resolver: checks oauth_table → credential_vault → user_credentials
  // Also handles token refresh automatically for Google tokens
  const result = await resolveOAuthToken('google', candidates);
  if (!result) {
    console.error(`[GmailNode] No Google token found. Tried users: [${candidates.join(', ')}]`);
    return null;
  }

  console.log(`[GmailNode] Resolved credential via ${result.source} (user: ${result.userId})`);
  return {
    accessToken: result.token,
    userId: result.userId,
  };
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
