import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';

/**
 * GET /api/auth/status
 * Returns authentication status for Google and LinkedIn OAuth connections
 */
export async function authStatusHandler(req: Request, res: Response) {
  try {
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
      return res.status(401).json({
        googleConnected: false,
        linkedinConnected: false,
        error: 'Unauthorized',
      });
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

    // Check LinkedIn OAuth connection
    const { data: linkedinTokenData, error: linkedinError } = await supabase
      .from('linkedin_oauth_tokens')
      .select('id, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    let linkedinConnected = false;
    
    if (!linkedinError && linkedinTokenData) {
      const expiresAt = linkedinTokenData.expires_at ? new Date(linkedinTokenData.expires_at) : null;
      linkedinConnected = expiresAt ? expiresAt > now : true;
    }

    return res.json({
      googleConnected,
      linkedinConnected,
    });
  } catch (error) {
    console.error('[AuthStatus] Unexpected error:', error);
    return res.status(500).json({
      googleConnected: false,
      linkedinConnected: false,
      error: 'Internal server error',
    });
  }
}
