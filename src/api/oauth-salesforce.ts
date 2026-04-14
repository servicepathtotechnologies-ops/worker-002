/**
 * Salesforce OAuth API Handlers
 *
 * Handles Salesforce OAuth 2.0 Authorization Code flow:
 * 1. GET  /api/oauth/salesforce/authorize - Initiates OAuth flow (redirects to Salesforce)
 * 2. POST /api/oauth/salesforce/callback  - Handles callback, exchanges code for tokens
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { salesforceTokenManager } from '../services/salesforce/salesforce-token-manager';

/**
 * Initiate Salesforce OAuth flow
 * GET /api/oauth/salesforce/authorize
 */
export async function salesforceAuthorizeHandler(req: Request, res: Response) {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    // Allow redirect_uri override via query param (like Twitter handler), fallback to env
    const redirectUri = (req.query.redirect_uri as string) || process.env.SALESFORCE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({
        success: false,
        error: 'Salesforce OAuth is not configured. Please set SALESFORCE_CLIENT_ID and SALESFORCE_REDIRECT_URI environment variables.',
      });
    }

    // Generate CSRF state token
    const state = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');

    const authUrl = new URL('https://login.salesforce.com/services/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'api refresh_token');
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Salesforce OAuth authorize error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initiate Salesforce OAuth',
    });
  }
}

/**
 * Handle Salesforce OAuth callback and exchange code for tokens
 * POST /api/oauth/salesforce/callback
 */
export async function salesforceCallbackHandler(req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();

    // Authenticate user via Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Handle user denial / cancellation
    if (req.query.error === 'access_denied') {
      return res.status(200).json({
        success: false,
        cancelled: true,
        message: 'Salesforce authorization was cancelled.',
      });
    }

    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required',
      });
    }

    if (!redirect_uri) {
      return res.status(400).json({
        success: false,
        error: 'Redirect URI is required',
      });
    }

    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'Salesforce OAuth credentials not configured. Please set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET environment variables.',
      });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Salesforce token exchange error:', errorText);
      return res.status(tokenResponse.status).json({
        success: false,
        error: `Failed to exchange authorization code for tokens: ${errorText}`,
      });
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      instance_url: string;
      issued_at: string;
      scope: string;
      token_type: string;
    };

    // Salesforce issued_at is a Unix timestamp in milliseconds
    const issuedAt = new Date(parseInt(tokenData.issued_at, 10));
    const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    await salesforceTokenManager.upsertToken(user.id, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      instanceUrl: tokenData.instance_url,
      issuedAt,
      expiresAt,
      scope: tokenData.scope ?? '',
    });

    return res.json({
      success: true,
      message: 'Salesforce account connected successfully.',
    });
  } catch (error) {
    console.error('Salesforce OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process Salesforce OAuth callback',
    });
  }
}
