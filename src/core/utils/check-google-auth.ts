import { Request } from 'express';
import { getSupabaseClient } from '../database/supabase-compat';
import { ErrorCode, createError } from './error-codes';

/**
 * Check if user has Google OAuth connected
 * Returns user ID if Google is connected, throws error otherwise
 */
export async function requireGoogleAuth(req: Request): Promise<string> {
  const supabase = getSupabaseClient();

  const authHeader = req.headers.authorization;
  let userId: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }
  }

  if (!userId) {
    throw createError(
      ErrorCode.UNAUTHORIZED,
      'Authentication required',
      { hint: 'Please sign in to continue' }
    );
  }

  // Check Google OAuth connection
  const { data: googleTokenData, error: googleError } = await supabase
    .from('google_oauth_tokens')
    .select('id, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  const now = new Date();
  let googleConnected = false;
  
  if (!googleError && googleTokenData) {
    const expiresAt = googleTokenData.expires_at ? new Date(googleTokenData.expires_at) : null;
    googleConnected = expiresAt ? expiresAt > now : true;
  }

  if (!googleConnected) {
    throw createError(
      ErrorCode.GOOGLE_AUTH_REQUIRED,
      'Google account connection required',
      { 
        hint: 'Please connect your Google account to create or run workflows',
        recoverable: true
      }
    );
  }

  return userId;
}
