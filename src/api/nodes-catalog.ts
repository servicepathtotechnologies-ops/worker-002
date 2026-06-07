import { Request, Response } from 'express';
import { buildNodeCatalogText } from '../services/ai/node-catalog-builder';

let _cachedCatalog: string | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes — registry only changes on deploy

export async function nodesCatalogHandler(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  if (!_cachedCatalog || now - _cachedAt > CACHE_TTL_MS) {
    _cachedCatalog = buildNodeCatalogText();
    _cachedAt = now;
  }
  res.json({ catalog: _cachedCatalog, cachedAt: _cachedAt });
}
