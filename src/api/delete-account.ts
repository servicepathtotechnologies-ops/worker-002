import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';

// DELETE /api/user/account
// Authenticates the caller via their own JWT and deletes only their own account.
export default async function deleteAccountHandler(req: Request, res: Response) {
  const supabase = getSupabaseClient();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authData.user.id;
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
