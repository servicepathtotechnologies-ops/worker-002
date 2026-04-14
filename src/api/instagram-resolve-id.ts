/**
 * Instagram ID Resolution Endpoint
 *
 * POST /api/connections/instagram/resolve-id
 *
 * After OAuth connect, if ig_user_id couldn't be auto-resolved,
 * this endpoint lets the user provide their Instagram username
 * and we resolve the ID using the stored access token.
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { createHmac } from 'crypto';

const META_GRAPH = 'https://graph.facebook.com/v18.0';

function getAppSecretProof(accessToken: string): string {
  const secret = process.env.FACEBOOK_APP_SECRET ?? '';
  return createHmac('sha256', secret).update(accessToken).digest('hex');
}

export async function instagramResolveIdHandler(req: Request, res: Response) {
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

    // Get stored token
    const { data: tokenRow } = await supabase
      .from('instagram_oauth_tokens' as any)
      .select('access_token, ig_user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return res.status(404).json({ success: false, error: 'No Instagram token found. Please connect first.' });
    }

    // If already resolved, return it
    if (tokenRow.ig_user_id) {
      return res.json({ success: true, ig_user_id: tokenRow.ig_user_id, already_resolved: true });
    }

    const accessToken = tokenRow.access_token;
    const proof = getAppSecretProof(accessToken);

    // Try to resolve using Business Discovery API with username
    const { username } = req.body;
    let igUserId: string | null = null;
    let igUsername: string | null = null;

    if (username) {
      // Use Business Discovery API to find IG user ID by username
      // This requires a Facebook Page to query from, so try me/accounts first
      const pagesRes = await fetch(
        `${META_GRAPH}/me/accounts?fields=id,instagram_business_account&access_token=${accessToken}&appsecret_proof=${proof}`,
      );

      if (pagesRes.ok) {
        const pagesData = (await pagesRes.json()) as {
          data?: Array<{ id: string; instagram_business_account?: { id: string } }>;
        };

        for (const page of pagesData.data ?? []) {
          if (page.id) {
            // Use Business Discovery to find IG account by username
            const discoveryRes = await fetch(
              `${META_GRAPH}/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}&appsecret_proof=${proof}`,
            );
            if (discoveryRes.ok) {
              const discoveryData = (await discoveryRes.json()) as {
                instagram_business_account?: { id: string; username?: string };
              };
              if (discoveryData.instagram_business_account?.id) {
                igUserId = discoveryData.instagram_business_account.id;
                igUsername = discoveryData.instagram_business_account.username ?? null;
                break;
              }
            }
          }
        }
      }
    }

    // If still not resolved, try fetching all pages with instagram accounts
    if (!igUserId) {
      const pagesRes = await fetch(
        `${META_GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${accessToken}&appsecret_proof=${proof}`,
      );
      if (pagesRes.ok) {
        const pagesData = (await pagesRes.json()) as {
          data?: Array<{ instagram_business_account?: { id: string; username?: string; name?: string } }>;
        };
        for (const page of pagesData.data ?? []) {
          if (page.instagram_business_account?.id) {
            igUserId = page.instagram_business_account.id;
            igUsername = page.instagram_business_account.username ?? null;
            break;
          }
        }
      }
    }

    if (!igUserId) {
      return res.json({
        success: false,
        error: 'Could not resolve Instagram user ID. Your Instagram account needs to be linked to a Facebook Page.',
        hint: 'Create a free Facebook Page and link your Instagram account to it, then try again.',
      });
    }

    // Update the stored token with the resolved ig_user_id
    await supabase
      .from('instagram_oauth_tokens' as any)
      .update({
        ig_user_id: igUserId,
        username: igUsername,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return res.json({ success: true, ig_user_id: igUserId, username: igUsername });
  } catch (err) {
    console.error('[InstagramResolveId] error:', err);
    res.status(500).json({ success: false, error: 'Failed to resolve Instagram ID' });
  }
}
