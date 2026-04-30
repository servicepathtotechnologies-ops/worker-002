/**
 * Secure DB Proxy for frontend CRUD operations.
 * Only allows operations on whitelisted tables and scopes every query
 * to the authenticated user's data.
 *
 * Routes:
 *   GET    /api/db/:table            — SELECT rows (user-scoped + optional filters)
 *   POST   /api/db/:table            — INSERT row
 *   POST   /api/db/:table/upsert     — UPSERT row (INSERT … ON CONFLICT DO UPDATE)
 *   PUT    /api/db/:table/:id        — UPDATE row by id
 *   PUT    /api/db/:table?filter_x=y — UPDATE rows by filters
 *   DELETE /api/db/:table/:id        — DELETE row by id
 *   DELETE /api/db/:table?filter_x=y — DELETE rows by filters
 */

import { Request, Response } from 'express';
import { queryAsService, DbUnavailableError } from '../core/database/db-pool';
import { preparePayload } from '../core/database/column-types';
import { subscriptionService } from '../services/subscription-service';

function isDbUnavailable(err: any) {
  return err instanceof DbUnavailableError || err?.code === 'DB_UNAVAILABLE';
}

/** Tables the frontend is allowed to CRUD via this proxy */
const ALLOWED_TABLES = new Set([
  'api_keys',
  'workflows',
  'user_roles',
  'google_oauth_tokens',
  'linkedin_oauth_tokens',
  'notion_oauth_tokens',
  'social_tokens',
  'twitter_oauth_tokens',
  'instagram_oauth_tokens',
  'whatsapp_oauth_tokens',
  'zoho_oauth_tokens',
  'salesforce_oauth_tokens',
  'profiles',
  'executions',
  'execution_steps',
  'workflow_versions',
  'templates',
  'user_credentials',
  'credential_vault',
  'credential_store',
  'notifications',
]);

/**
 * For tables that don't have a direct user_id column, define the ownership
 * filter as a SQL fragment. $1 is always bound to the authenticated userId.
 */
const INDIRECT_USER_FILTER: Record<string, string> = {
  execution_steps: `"execution_id" IN (SELECT id FROM "executions" WHERE "user_id" = $1)`,
};

/** Column used as the user-ownership filter on each table */
const USER_COL: Record<string, string> = {
  api_keys:               'user_id',
  workflows:              'user_id',
  user_roles:             'user_id',
  google_oauth_tokens:    'user_id',
  linkedin_oauth_tokens:  'user_id',
  notion_oauth_tokens:    'user_id',
  social_tokens:          'user_id',
  twitter_oauth_tokens:   'user_id',
  instagram_oauth_tokens: 'user_id',
  whatsapp_oauth_tokens:  'user_id',
  zoho_oauth_tokens:      'user_id',
  salesforce_oauth_tokens:'user_id',
  profiles:               'user_id',
  executions:             'user_id',
  workflow_versions:      'created_by',
  templates:              'created_by',
  user_credentials:       'user_id',
  credential_vault:       'user_id',
  credential_store:       'user_id',
  notifications:          'user_id',
};

/** Columns allowed in ORDER BY (prevent SQL injection) */
const SAFE_COLS = /^[a-z_]+$/;

function deny(res: Response, msg: string, status = 403) {
  return res.status(status).json({ error: msg });
}

async function enforceWorkflowCreationLimit(userId: string, res: Response): Promise<boolean> {
  await subscriptionService.ensureFreeSubscription(userId);
  const canCreate = await subscriptionService.canCreateWorkflow(userId);
  if (canCreate) return true;

  const usage = await subscriptionService.getSubscriptionUsage(userId);
  res.status(403).json({
    data: null,
    error: {
      message: `You've reached your workflow limit (${usage.workflowLimit}). Upgrade your plan to create more workflows.`,
      code: 'WORKFLOW_LIMIT_EXCEEDED',
      workflowsUsed: usage.workflowsUsed,
      workflowLimit: usage.workflowLimit,
      remainingWorkflows: usage.remainingWorkflows,
      upgradeUrl: '/subscriptions',
    },
  });
  return false;
}

async function workflowExistsForUser(userId: string, id: unknown): Promise<boolean> {
  if (id === undefined || id === null || String(id).trim() === '') return false;
  const rows = await queryAsService<{ id: string }>(
    `SELECT id FROM "workflows" WHERE "user_id" = $1 AND "id" = $2 LIMIT 1`,
    [userId, id]
  );
  return rows.length > 0;
}

export async function dbProxyGet(req: Request, res: Response) {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return deny(res, 'Table not allowed');

  const userId = (req as any).user?.id;
  if (!userId) return deny(res, 'Unauthenticated', 401);

  const userCol  = USER_COL[table];
  const indirectFilter = INDIRECT_USER_FILTER[table];
  const orderCol = req.query.order_col as string | undefined;
  const orderDir = (req.query.order_dir as string || 'DESC').toUpperCase();
  const limitVal = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  const ownershipClause = indirectFilter ?? `"${userCol}" = $1`;
  let sql = `SELECT * FROM "${table}" WHERE ${ownershipClause}`;
  const params: any[] = [userId];

  // Additional filters:
  // - filter_<col>=val (eq)
  // - in_<col>=["a","b"] or in_<col>=a,b
  // - notnull_<col>=true
  // - gte_<col>=val, lte_<col>=val, gt_<col>=val, lt_<col>=val
  const OPS: Record<string, string> = { filter: '=', gte: '>=', lte: '<=', gt: '>', lt: '<' };
  for (const [key, val] of Object.entries(req.query)) {
    const prefix = key.split('_')[0];
    if (prefix === 'in' && val) {
      const col = key.slice(prefix.length + 1);
      if (!SAFE_COLS.test(col)) continue;

      const rawValue = Array.isArray(val) ? val[0] : val;
      const parsedValues = (() => {
        if (Array.isArray(val)) return val.map(String);
        const text = String(rawValue);
        try {
          const json = JSON.parse(text);
          return Array.isArray(json) ? json.map(String) : [];
        } catch {
          return text.split(',').map((item) => item.trim()).filter(Boolean);
        }
      })();

      if (parsedValues.length === 0) {
        sql += ' AND FALSE';
        continue;
      }

      const placeholders = parsedValues.map((item) => {
        params.push(item);
        return `$${params.length}`;
      });
      sql += ` AND "${col}" IN (${placeholders.join(', ')})`;
      continue;
    }

    if (prefix === 'notnull' && val) {
      const col = key.slice(prefix.length + 1);
      if (SAFE_COLS.test(col)) {
        sql += ` AND "${col}" IS NOT NULL`;
      }
      continue;
    }

    if (prefix in OPS && val) {
      const col = key.slice(prefix.length + 1);
      if (SAFE_COLS.test(col)) {
        params.push(val);
        sql += ` AND "${col}" ${OPS[prefix]} $${params.length}`;
      }
    }
  }

  if (orderCol && SAFE_COLS.test(orderCol)) {
    sql += ` ORDER BY "${orderCol}" ${orderDir === 'ASC' ? 'ASC' : 'DESC'}`;
  }

  if (limitVal && limitVal > 0) {
    sql += ` LIMIT ${limitVal}`;
  }

  try {
    const rows = await queryAsService(sql, params);
    res.json({ data: rows, error: null });
  } catch (err: any) {
    // 42P01 = undefined_table, DB_UNAVAILABLE = circuit open — both return empty array
    if (err.code === '42P01' || isDbUnavailable(err)) return res.json({ data: [], error: null });
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

export async function dbProxyPost(req: Request, res: Response) {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return deny(res, 'Table not allowed');

  const userId = (req as any).user?.id;
  if (!userId) return deny(res, 'Unauthenticated', 401);

  const userCol = USER_COL[table];
  const payload = preparePayload(table, { ...req.body, [userCol]: userId });

  if (table === 'workflows') {
    const allowed = await enforceWorkflowCreationLimit(userId, res);
    if (!allowed) return;
  }

  const keys = Object.keys(payload);
  const vals: any[] = keys.map((k) => payload[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const cols = keys.map((k) => `"${k}"`).join(', ');

  try {
    const rows = await queryAsService(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    if (table === 'workflows') {
      await subscriptionService.incrementWorkflowCount(userId);
    }
    res.json({ data: rows[0] || null, error: null });
  } catch (err: any) {
    if (isDbUnavailable(err)) return res.status(503).json({ data: null, error: { message: 'Database temporarily unavailable' } });
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

export async function dbProxyUpsert(req: Request, res: Response) {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return deny(res, 'Table not allowed');

  const userId = (req as any).user?.id;
  if (!userId) return deny(res, 'Unauthenticated', 401);

  const userCol    = USER_COL[table];
  const { data: body, onConflict } = req.body as { data: any; onConflict?: string };
  const payload    = preparePayload(table, { ...(body || req.body), [userCol]: userId });

  const isWorkflowCreate = table === 'workflows' && !(await workflowExistsForUser(userId, payload.id));
  if (isWorkflowCreate) {
    const allowed = await enforceWorkflowCreationLimit(userId, res);
    if (!allowed) return;
  }

  const keys         = Object.keys(payload);
  const vals: any[]  = keys.map((k) => payload[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const cols         = keys.map((k) => `"${k}"`).join(', ');
  const conflictCols = onConflict
    ? onConflict
        .split(',')
        .map((col) => col.trim())
        .filter((col) => SAFE_COLS.test(col))
    : [];
  const effectiveConflictCols = conflictCols.length ? conflictCols : [userCol];

  // Build SET list excluding the conflict column
  const updateSets = keys
    .filter((k) => !effectiveConflictCols.includes(k))
    .map((k) => `"${k}" = EXCLUDED."${k}"`)
    .join(', ');
  const conflictSql = effectiveConflictCols.map((col) => `"${col}"`).join(', ');

  const sql = updateSets
    ? `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})
       ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateSets} RETURNING *`
    : `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})
       ON CONFLICT (${conflictSql}) DO NOTHING RETURNING *`;

  try {
    const rows = await queryAsService(sql, vals);
    if (isWorkflowCreate && rows[0]) {
      await subscriptionService.incrementWorkflowCount(userId);
    }
    res.json({ data: rows[0] || null, error: null });
  } catch (err: any) {
    if (isDbUnavailable(err)) return res.status(503).json({ data: null, error: { message: 'Database temporarily unavailable' } });
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

export async function dbProxyPut(req: Request, res: Response) {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return deny(res, 'Table not allowed');

  const userId = (req as any).user?.id;
  if (!userId) return deny(res, 'Unauthenticated', 401);

  const userCol = USER_COL[table];
  const payload = preparePayload(table, req.body || {});
  const keys    = Object.keys(payload);
  const vals: any[] = keys.map((k) => payload[k]);
  const sets    = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');

  if (keys.length === 0) {
    return res.status(400).json({ data: null, error: { message: 'No update fields provided' } });
  }

  let whereSql = `"${userCol}" = $${vals.length + 1}`;
  const whereVals: any[] = [userId];
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    whereSql += ` AND id = $${vals.length + whereVals.length + 1}`;
    whereVals.push(id);
  } else {
    for (const [key, val] of Object.entries(req.query)) {
      if (!key.startsWith('filter_')) continue;
      const col = key.slice('filter_'.length);
      if (!SAFE_COLS.test(col)) continue;
      whereSql += ` AND "${col}" = $${vals.length + whereVals.length + 1}`;
      whereVals.push(val);
    }
  }

  if (id === undefined && whereVals.length <= 1) {
    return res.status(400).json({ data: null, error: { message: 'At least one id or filter is required for update' } });
  }

  try {
    const rows = await queryAsService(
      `UPDATE "${table}" SET ${sets} WHERE ${whereSql} RETURNING *`,
      [...vals, ...whereVals]
    );
    if (!rows[0]) return res.status(404).json({ data: null, error: { message: 'Not found' } });
    res.json({ data: rows.length === 1 ? rows[0] : rows, error: null });
  } catch (err: any) {
    if (isDbUnavailable(err)) return res.status(503).json({ data: null, error: { message: 'Database temporarily unavailable' } });
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

export async function dbProxyDelete(req: Request, res: Response) {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return deny(res, 'Table not allowed');

  const userId = (req as any).user?.id;
  if (!userId) return deny(res, 'Unauthenticated', 401);

  const userCol = USER_COL[table];

  let whereSql = `"${userCol}" = $1`;
  const whereVals: any[] = [userId];
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    whereSql += ` AND id = $${whereVals.length + 1}`;
    whereVals.push(id);
  } else {
    for (const [key, val] of Object.entries(req.query)) {
      if (!key.startsWith('filter_')) continue;
      const col = key.slice('filter_'.length);
      if (!SAFE_COLS.test(col)) continue;
      whereSql += ` AND "${col}" = $${whereVals.length + 1}`;
      whereVals.push(val);
    }
  }

  if (id === undefined && whereVals.length <= 1) {
    return res.status(400).json({ data: null, error: { message: 'At least one id or filter is required for delete' } });
  }

  try {
    const rows = await queryAsService(
      `DELETE FROM "${table}" WHERE ${whereSql} RETURNING id`,
      whereVals
    );
    if (!rows[0] && id !== undefined && id !== null && String(id).trim() !== '') {
      return res.status(404).json({ data: null, error: { message: 'Not found' } });
    }
    if (table === 'workflows' && rows.length > 0) {
      await subscriptionService.decrementWorkflowCount(userId);
    }
    res.json({ data: null, error: null });
  } catch (err: any) {
    if (isDbUnavailable(err)) return res.status(503).json({ data: null, error: { message: 'Database temporarily unavailable' } });
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}
