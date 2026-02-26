import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { getProviderToken } from '../shared/social-token-manager';
import { getGitHubUser } from '../services/social/githubService';
import fetch from 'node-fetch';

/**
 * GitHub connection utilities:
 * - GET /api/connections/github/status
 * - POST /api/connections/github/disconnect
 */

export async function githubStatusHandler(req: Request, res: Response) {
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
        success: false,
        error: 'Unauthorized',
      });
    }

    const { data: tokenData, error: tokenError } = await supabase
      .from('social_tokens')
      .select('id, expires_at, scope, provider_user_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('provider', 'github')
      .maybeSingle();

    if (tokenError && tokenError.code !== 'PGRST116') {
      console.error('[GitHubStatus] Error querying social_tokens:', tokenError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to load GitHub connection status',
      });
    }

    const now = new Date();
    const expiresAt = tokenData?.expires_at ? new Date(tokenData.expires_at) : null;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    const connected = !!tokenData && (!!expiresAt ? expiresAt > now : true);
    const expiresSoon = !!expiresAt && expiresAt <= fiveMinutesFromNow;

    // Try to fetch GitHub user info if connected
    let githubUser = null;
    if (connected && tokenData) {
      try {
        const token = await getProviderToken(supabase, userId, 'github');
        if (token) {
          const userResult = await getGitHubUser(token);
          if (userResult.success && userResult.data) {
            githubUser = {
              login: userResult.data.login,
              name: userResult.data.name,
              avatar_url: userResult.data.avatar_url,
            };
          }
        }
      } catch (error) {
        console.warn('[GitHubStatus] Failed to fetch GitHub user info:', error);
        // Non-fatal, continue with basic status
      }
    }

    return res.json({
      success: true,
      connected,
      metadata: {
        tokenId: tokenData?.id,
        scope: tokenData?.scope,
        provider_user_id: tokenData?.provider_user_id,
        createdAt: tokenData?.created_at,
        updatedAt: tokenData?.updated_at,
        expiresAt: expiresAt?.toISOString() || null,
        expiresSoon,
        ...(githubUser ? { login: githubUser.login, name: githubUser.name, avatar_url: githubUser.avatar_url } : {}),
      },
    });
  } catch (error) {
    console.error('[GitHubStatus] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

export async function githubDisconnectHandler(req: Request, res: Response) {
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
        success: false,
        error: 'Unauthorized',
      });
    }

    // Delete GitHub token from social_tokens table
    const { error: tokenError } = await supabase
      .from('social_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'github');

    if (tokenError) {
      console.error('[GitHubDisconnect] Error deleting social_tokens:', tokenError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete GitHub tokens',
      });
    }

    // Delete vault credential entry for GitHub (if exists)
    const { error: vaultError } = await supabase
      .from('user_credentials')
      .delete()
      .eq('user_id', userId)
      .eq('service', 'github');

    if (vaultError && vaultError.code !== 'PGRST116') {
      console.error('[GitHubDisconnect] Error deleting user_credentials (github):', vaultError.message);
      // Non-fatal; tokens are already removed
    }

    return res.json({
      success: true,
      message: 'GitHub account disconnected successfully',
    });
  } catch (error) {
    console.error('[GitHubDisconnect] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
