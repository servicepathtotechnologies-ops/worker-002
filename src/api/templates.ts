import { Request, Response } from 'express';
import { getDbClient } from '../core/database/supabase-compat';

function normalizeSearch(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export default async function templatesHandler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getDbClient();
  const templateId = req.params.id;
  const category = normalizeSearch(req.query.category);
  const search = normalizeSearch(req.query.search);

  try {
    let query = supabase
      .from('templates')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (templateId) {
      query = query.eq('id', templateId).limit(1);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    let templates = data || [];
    if (search) {
      templates = templates.filter((template: any) => {
        const name = String(template.name || '').toLowerCase();
        const description = String(template.description || '').toLowerCase();
        return name.includes(search) || description.includes(search);
      });
    }

    if (templateId) {
      const template = templates[0] || null;
      if (!template) return res.status(404).json({ error: 'Template not found' });
      return res.json({ template });
    }

    return res.json({ templates });
  } catch (error) {
    console.error('Templates API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch templates',
    });
  }
}
