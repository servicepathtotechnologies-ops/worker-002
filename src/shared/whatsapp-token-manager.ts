/**
 * WhatsApp Token Manager
 * 
 * Helper functions to retrieve and manage WhatsApp/Facebook OAuth tokens from Supabase.
 * WhatsApp uses Facebook OAuth tokens with WhatsApp Business API permissions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from '../core/utils/token-encryption';
import { resolveOAuthTokenString } from './credential-resolver';

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
  if (!userId) return null;
  const userIds = Array.isArray(userId) ? userId : [userId];
  return resolveOAuthTokenString('whatsapp', userIds);
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
