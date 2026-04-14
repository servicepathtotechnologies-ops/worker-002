/**
 * WhatsApp OAuth API Handlers
 *
 * Flow:
 * 1. GET /api/oauth/whatsapp/authorize  — redirects to Facebook OAuth dialog
 * 2. POST /api/oauth/whatsapp/callback  — exchanges code for long-lived token, saves to whatsapp_oauth_tokens
 * 3. DELETE /api/connections/whatsapp   — disconnects
 * 4. GET /api/connections/whatsapp/status — returns connection status
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';

const META_GRAPH = 'https://graph.facebook.com/v18.0';

// ─── Authorize ────────────────────────────────────────────────────────────────

export async function whatsappAuthorizeHandler(req: Request, res: Response) {
  try {
    const redirectUri = req.query.redirect_uri as string;
    if (!redirectUri) {
      return res.status(400).json({ success: false, error: 'redirect_uri is required' });
    }

    const clientId = process.env.FACEBOOK_APP_ID;
    if (!clientId) {
      return res.status(500).json({ success: false, error: 'FACEBOOK_APP_ID not configured' });
    }

    const state = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64url');

    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set(
      'scope',
      'whatsapp_business_messaging,whatsapp_business_management,pages_show_list',
    );

    res.redirect(authUrl.toString());
  } catch (err) {
    console.error('[WhatsAppOAuth] authorize error:', err);
    res.status(500).json({ success: false, error: 'Failed to initiate WhatsApp OAuth' });
  }
}

// ─── Callback ─────────────────────────────────────────────────────────────────

export async function whatsappCallbackHandler(req: Request, res: Response) {
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

    const { code, redirect_uri, phone_number_id, business_account_id } = req.body;
    if (!code || !redirect_uri) {
      return res.status(400).json({ success: false, error: 'code and redirect_uri are required' });
    }

    const clientId = process.env.FACEBOOK_APP_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ success: false, error: 'Facebook app credentials not configured' });
    }

    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL(`${META_GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirect_uri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(400).json({ success: false, error: `Token exchange failed: ${err}` });
    }
    const shortToken = (await tokenRes.json()) as { access_token: string };

    // Step 2: Exchange for long-lived token
    const longUrl = new URL(`${META_GRAPH}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', clientId);
    longUrl.searchParams.set('client_secret', clientSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken.access_token);

    const longRes = await fetch(longUrl.toString());
    if (!longRes.ok) {
      const err = await longRes.text();
      return res.status(400).json({ success: false, error: `Long-lived token exchange failed: ${err}` });
    }
    const longToken = (await longRes.json()) as { access_token: string; expires_in?: number };
    const accessToken = longToken.access_token;
    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000).toISOString()
      : null;

    // Step 3: Auto-resolve phone_number_id if not provided
    let resolvedPhoneNumberId = phone_number_id ?? null;
    let resolvedBusinessAccountId = business_account_id ?? null;
    let phoneNumber: string | null = null;

    if (!resolvedPhoneNumberId) {
      try {
        const phoneRes = await fetch(`${META_GRAPH}/me/phone_numbers?access_token=${accessToken}`);
        if (phoneRes.ok) {
          const phoneData = (await phoneRes.json()) as {
            data?: Array<{ id: string; display_phone_number?: string }>;
          };
          if (phoneData.data?.[0]) {
            resolvedPhoneNumberId = phoneData.data[0].id;
            phoneNumber = phoneData.data[0].display_phone_number ?? null;
          }
        }
      } catch { /* non-fatal */ }
    }

    return res.json({
      success: true,
      access_token: accessToken,
      expires_at: expiresAt,
      phone_number_id: resolvedPhoneNumberId,
      business_account_id: resolvedBusinessAccountId,
      phone_number: phoneNumber,
      scope: 'whatsapp_business_messaging,whatsapp_business_management,pages_show_list',
    });
  } catch (err) {
    console.error('[WhatsAppOAuth] callback error:', err);
    res.status(500).json({ success: false, error: 'Failed to process WhatsApp OAuth callback' });
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function whatsappStatusHandler(req: Request, res: Response) {
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
      .from('whatsapp_oauth_tokens' as any)
      .select('access_token, expires_at, phone_number_id, business_account_id, phone_number')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return res.json({ connected: false });
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const now = new Date();
    const connected = expiresAt ? expiresAt > now : true;

    return res.json({
      connected,
      needsReconnect: !connected,
      phone_number: data.phone_number ?? null,
      phone_number_id: data.phone_number_id ?? null,
      business_account_id: data.business_account_id ?? null,
      expires_at: data.expires_at ?? null,
    });
  } catch (err) {
    console.error('[WhatsAppOAuth] status error:', err);
    res.status(500).json({ success: false, error: 'Failed to check WhatsApp status' });
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function whatsappDisconnectHandler(req: Request, res: Response) {
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

    await supabase.from('whatsapp_oauth_tokens' as any).delete().eq('user_id', user.id);
    await supabase
      .from('user_credentials' as any)
      .delete()
      .eq('user_id', user.id)
      .eq('service', 'whatsapp');

    return res.json({ success: true });
  } catch (err) {
    console.error('[WhatsAppOAuth] disconnect error:', err);
    res.status(500).json({ success: false, error: 'Failed to disconnect WhatsApp' });
  }
}
