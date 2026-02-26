// Get user credentials endpoint
// Returns stored credentials for LinkedIn/Google integrations

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';

export default async function getCredentialsHandler(req: Request, res: Response) {
  const supabase = getSupabaseClient();

  try {
    const { service } = req.query;

    if (!service || (service !== 'linkedin' && service !== 'google')) {
      return res.status(400).json({
        error: 'Invalid service. Must be "linkedin" or "google"',
      });
    }

    // Get current user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    // Fetch credentials from database
    const { data, error } = await supabase
      .from('user_credentials')
      .select('credentials')
      .eq('user_id', user.id)
      .eq('service', service)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No credentials found
        return res.json({ credentials: null });
      }
      throw error;
    }

    return res.json({
      credentials: data?.credentials || null,
    });
  } catch (error) {
    console.error('Error getting credentials:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get credentials',
    });
  }
}
