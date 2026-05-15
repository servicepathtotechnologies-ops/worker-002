/**
 * Instagram Token Manager
 * 
 * Helper functions to retrieve and manage Instagram/Facebook OAuth tokens from the database.
 * Instagram uses Facebook OAuth tokens with Instagram permissions.
 */

import type { DbClient } from '@db/db-js';
import { decryptToken, encryptToken } from '../core/utils/token-encryption';
import { resolveOAuthTokenString } from './credential-resolver';

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
 * Get Instagram/Facebook access token from DB
 * Tries multiple user IDs in order (workflow owner, then current user)
 * 
 * Note: Instagram uses Facebook OAuth tokens with Instagram permissions.
 * The token should have permissions: instagram_basic, instagram_content_publish, 
 * pages_show_list, business_management
 */
export async function getInstagramAccessToken(
  db: DbClient,
  userId?: string | string[]
): Promise<string | null> {
  if (!userId) return null;
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('instagram', userIds);
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
  db: DbClient,
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
      const { data: instagramTokenData, error: instagramError } = await db
        .from('instagram_oauth_tokens')
        .select('*')
        .eq('user_id', uid)
        .single();

      if (!instagramError && instagramTokenData) {
        return instagramTokenData as InstagramTokenData;
      }

      // Fall back to facebook_oauth_tokens
      const { data: facebookTokenData, error: facebookError } = await db
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
