/**
 * Instagram OAuth API Handlers
 *
 * Uses the Instagram Login API (INSTAGRAM_APP_ID: 133263958623775).
 * This works for ALL Instagram users — personal, creator, and business.
 * No Facebook Page required. ig_user_id is returned directly in the token exchange.
 *
 * OAuth flow:
 * 1. Redirect to https://api.instagram.com/oauth/authorize
 * 2. Exchange code at https://api.instagram.com/oauth/access_token → short-lived token + user_id
 * 3. Exchange for long-lived token at https://graph.instagram.com/access_token
 * 4. Fetch profile from https://graph.instagram.com/me
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';

const IG_OAUTH_URL = 'https://api.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_LONG_TOKEN_URL = 'https://graph.instagram.com/access_token';
const IG_GRAPH_URL = 'https://graph.instagram.com/v18.0';

function getInstagramAppId(): string {
  return process.env.INSTAGRAM_APP_ID || '';
}

function getInstagramAppSecret(): string {
  return process.env.INSTAGRAM_APP_SECRET || '';
}

// ─── Authorize ────────────────────────────────────────────────────────────────

export async function instagramAuthorizeHandler(req: Request, res: Response) {
  try {
    const redirectUri = req.query.redirect_uri as string;
    if (!redirectUri) {
      return res.status(400).json({ success: false, error: 'redirect_uri is required' });
    }

    const clientId = getInstagramAppId();
    if (!clientId) {
      return res.status(500).json({ success: false, error: 'INSTAGRAM_APP_ID not configured' });
    }

    const state = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64url');

    const authUrl = new URL(IG_OAUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set(
      'scope',
      'instagram_business_basic,instagram_business_manage_messages,instagram_manage_comments,instagram_content_publish,instagram_manage_insights',
    );

    res.redirect(authUrl.toString());
  } catch (err) {
    console.error('[InstagramOAuth] authorize error:', err);
    res.status(500).json({ success: false, error: 'Failed to initiate Instagram OAuth' });
  }
}

// ─── Callback ─────────────────────────────────────────────────────────────────

export async function instagramCallbackHandler(req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    const { code, redirect_uri } = req.body;
    if (!code || !redirect_uri) {
      return res.status(400).json({ success: false, error: 'code and redirect_uri are required' });
    }

    const clientId = getInstagramAppId();
    const clientSecret = getInstagramAppSecret();
    if (!clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET must be configured in .env',
      });
    }

    // Step 1: Exchange code for short-lived token
    // Instagram Login API returns { access_token, user_id } directly — no Facebook Page needed
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirect_uri,
      code: code,
    });

    const tokenRes = await fetch(IG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenText = await tokenRes.text();
    console.log(`[InstagramOAuth] short-lived token status: ${tokenRes.status}, body: ${tokenText}`);

    if (!tokenRes.ok) {
      return res.status(400).json({ success: false, error: `Token exchange failed: ${tokenText}` });
    }

    const shortTokenData = JSON.parse(tokenText) as {
      access_token: string;
      user_id: number;
    };

    const shortToken = shortTokenData.access_token;
    // ig_user_id is returned directly — works for ALL Instagram users
    const igUserId = String(shortTokenData.user_id);
    console.log(`[InstagramOAuth] ✅ ig_user_id from token exchange: ${igUserId}`);

    // Step 2: Exchange for long-lived token (60-day expiry)
    const longTokenUrl = new URL(IG_LONG_TOKEN_URL);
    longTokenUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longTokenUrl.searchParams.set('client_secret', clientSecret);
    longTokenUrl.searchParams.set('access_token', shortToken);

    const longRes = await fetch(longTokenUrl.toString());
    const longText = await longRes.text();
    console.log(`[InstagramOAuth] long-lived token status: ${longRes.status}, body: ${longText}`);

    if (!longRes.ok) {
      return res.status(400).json({ success: false, error: `Long-lived token exchange failed: ${longText}` });
    }

    const longTokenData = JSON.parse(longText) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    const accessToken = longTokenData.access_token;
    const expiresAt = longTokenData.expires_in
      ? new Date(Date.now() + longTokenData.expires_in * 1000).toISOString()
      : null;

    // Step 3: Fetch Instagram profile using the long-lived token
    let igUsername: string | null = null;
    let igName: string | null = null;
    let igProfilePic: string | null = null;

    try {
      const profileRes = await fetch(
        `${IG_GRAPH_URL}/me?fields=id,username,name,profile_picture_url&access_token=${accessToken}`,
      );
      const profileText = await profileRes.text();
      console.log(`[InstagramOAuth] profile status: ${profileRes.status}, body: ${profileText}`);

      if (profileRes.ok) {
        const profileData = JSON.parse(profileText) as {
          id?: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
        };
        igUsername = profileData.username ?? null;
        igName = profileData.name ?? null;
        igProfilePic = profileData.profile_picture_url ?? null;
        console.log(`[InstagramOAuth] ✅ Profile: @${igUsername} (${igName})`);
      }
    } catch (err) {
      console.warn('[InstagramOAuth] profile fetch failed (non-fatal):', err);
    }

    return res.json({
      success: true,
      access_token: accessToken,
      expires_at: expiresAt,
      ig_user_id: igUserId,
      username: igUsername,
      name: igName,
      profile_picture_url: igProfilePic,
      scope: 'instagram_business_basic,instagram_business_manage_messages,instagram_manage_comments,instagram_content_publish,instagram_manage_insights',
    });
  } catch (err) {
    console.error('[InstagramOAuth] callback error:', err);
    res.status(500).json({ success: false, error: 'Failed to process Instagram OAuth callback' });
  }
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function instagramRefreshHandler(req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const { data: tokenRow } = await supabase
      .from('instagram_oauth_tokens' as any)
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return res.status(404).json({ success: false, error: 'No Instagram token found' });
    }

    // Instagram Login API refresh endpoint
    const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
    refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
    refreshUrl.searchParams.set('access_token', tokenRow.access_token);

    const refreshRes = await fetch(refreshUrl.toString());
    if (!refreshRes.ok) {
      const err = await refreshRes.text();
      return res.status(400).json({ success: false, error: `Token refresh failed: ${err}` });
    }

    const refreshData = (await refreshRes.json()) as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

    await supabase
      .from('instagram_oauth_tokens' as any)
      .update({
        access_token: refreshData.access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return res.json({ success: true, expires_at: expiresAt });
  } catch (err) {
    console.error('[InstagramOAuth] refresh error:', err);
    res.status(500).json({ success: false, error: 'Failed to refresh Instagram token' });
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function instagramStatusHandler(req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const { data, error } = await supabase
      .from('instagram_oauth_tokens' as any)
      .select('access_token, expires_at, ig_user_id, username, name, profile_picture_url')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return res.json({ connected: false });
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const connected = expiresAt ? expiresAt > new Date() : true;

    return res.json({
      connected,
      needsReconnect: !connected,
      username: data.username ?? null,
      name: data.name ?? null,
      profile_picture_url: data.profile_picture_url ?? null,
      ig_user_id: data.ig_user_id ?? null,
      expires_at: data.expires_at ?? null,
    });
  } catch (err) {
    console.error('[InstagramOAuth] status error:', err);
    res.status(500).json({ success: false, error: 'Failed to check Instagram status' });
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function instagramDisconnectHandler(req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    await supabase.from('instagram_oauth_tokens' as any).delete().eq('user_id', user.id);
    await supabase
      .from('user_credentials' as any)
      .delete()
      .eq('user_id', user.id)
      .eq('service', 'instagram');

    return res.json({ success: true });
  } catch (err) {
    console.error('[InstagramOAuth] disconnect error:', err);
    res.status(500).json({ success: false, error: 'Failed to disconnect Instagram' });
  }
}
