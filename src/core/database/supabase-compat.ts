/**
 * AWS RDS compatibility layer — replaces @supabase/supabase-js
 *
 * Exports getSupabaseClient() with the same interface as before so all
 * existing callers work without changes. Internally uses pg.Pool → AWS RDS.
 *
 * Supported patterns:
 *   .from(table).select(cols).eq(col, val).single()
 *   .from(table).select(cols).eq(col, val).or('col1.op.val1,col2.op.val2')
 *   .from(table).select(cols).not('col', 'is', null)
 *   .from(table).select(cols).is('col', null)
 *   .from(table).insert(data)
 *   .from(table).update(data).eq(col, val)
 *   .from(table).delete().eq(col, val)
 *   .from(table).upsert(data, {onConflict})
 *   .rpc('function_name', { param: value })
 */

import { Pool, PoolClient } from 'pg';
import { getDbPool } from './db-pool';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { prepareDbValue } from './column-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Op = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'ILIKE' | 'IN';
type Condition = { col: string; op: Op; val: any };
type IsCondition = { col: string; val: any };       // IS NULL / IS NOT NULL
type NotCondition = { col: string; op: string; val: any }; // NOT conditions
type OrGroup = Array<{ col: string; op: string; val: string }>; // OR groups

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

// ─── Query Builder ────────────────────────────────────────────────────────────

class QueryBuilder {
  private _table: string;
  private _pool: Pool;
  private _userId?: string;
  private _op: Operation = 'select';
  private _cols = '*';
  private _conditions: Condition[] = [];
  private _isConditions: IsCondition[] = [];
  private _notConditions: NotCondition[] = [];
  private _orGroups: OrGroup[] = [];
  private _data: any = null;
  private _single = false;
  private _limitVal?: number;
  private _offsetVal?: number;
  private _orderCol?: string;
  private _orderAsc = true;
  private _upsertConflict?: string;

  constructor(table: string, pool: Pool, userId?: string) {
    this._table = table;
    this._pool = pool;
    this._userId = userId;
  }

  select(cols = '*') { this._cols = cols; return this; }
  insert(data: any)  { this._data = data; this._op = 'insert'; return this; }
  update(data: any)  { this._data = data; this._op = 'update'; return this; }
  delete()           { this._op = 'delete'; return this; }

  upsert(data: any, opts?: { onConflict?: string }) {
    this._data = data;
    this._op = 'upsert';
    this._upsertConflict = opts?.onConflict;
    return this;
  }

  eq(col: string, val: any)    { this._conditions.push({ col, op: '=',    val }); return this; }
  neq(col: string, val: any)   { this._conditions.push({ col, op: '!=',   val }); return this; }
  gt(col: string, val: any)    { this._conditions.push({ col, op: '>',    val }); return this; }
  gte(col: string, val: any)   { this._conditions.push({ col, op: '>=',   val }); return this; }
  lt(col: string, val: any)    { this._conditions.push({ col, op: '<',    val }); return this; }
  lte(col: string, val: any)   { this._conditions.push({ col, op: '<=',   val }); return this; }
  ilike(col: string, val: any) { this._conditions.push({ col, op: 'ILIKE', val }); return this; }
  in(col: string, vals: any[]) { this._conditions.push({ col, op: 'IN',   val: vals }); return this; }

  /** IS NULL / IS NOT NULL */
  is(col: string, val: any) { this._isConditions.push({ col, val }); return this; }

  /** NOT operator: .not('col', 'is', null) → col IS NOT NULL */
  not(col: string, op: string, val: any) { this._notConditions.push({ col, op, val }); return this; }

  /** PostgREST-style OR: .or('col1.lt.val1,col2.is.null') */
  or(raw: string) {
    const group: OrGroup = [];
    for (const part of raw.split(',')) {
      const firstDot  = part.indexOf('.');
      const secondDot = part.indexOf('.', firstDot + 1);
      if (firstDot === -1 || secondDot === -1) continue;
      group.push({
        col: part.substring(0, firstDot),
        op:  part.substring(firstDot + 1, secondDot),
        val: part.substring(secondDot + 1),
      });
    }
    if (group.length) this._orGroups.push(group);
    return this;
  }

  single()     { this._single = true; this._limitVal = 1; return this; }
  maybeSingle(){ this._single = true; this._limitVal = 1; return this; }
  limit(n: number) { this._limitVal = n; return this; }
  range(from: number, to: number) {
    const start = Number.isFinite(from) ? Math.max(0, Math.floor(from)) : 0;
    const end = Number.isFinite(to) ? Math.max(start, Math.floor(to)) : start;
    this._offsetVal = start;
    this._limitVal = end - start + 1;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this._orderCol = col;
    this._orderAsc = opts?.ascending !== false;
    return this;
  }

  // ─── SQL building ────────────────────────────────────────────────────────

  private sanitizeCols(raw: string): string {
    if (raw === '*') return '*';
    return raw
      .split(',')
      .map((c) => c.trim())
      .filter((c) => !c.includes('(') && !c.includes('!'))
      .map((c) => c.split(' ')[0].split(':')[0].trim())
      .filter(Boolean)
      .map((c) => (c === '*' ? '*' : `"${c}"`))
      .join(', ') || '*';
  }

  private buildWhere(startIdx: number): { sql: string; values: any[] } {
    const values: any[] = [];
    const parts: string[] = [];

    // AND conditions
    for (const { col, op, val } of this._conditions) {
      if (op === 'IN') {
        const ph = (val as any[]).map((v) => { values.push(v); return `$${startIdx + values.length - 1}`; });
        parts.push(`"${col}" IN (${ph.join(', ')})`);
      } else {
        values.push(val);
        parts.push(`"${col}" ${op} $${startIdx + values.length - 1}`);
      }
    }

    // IS NULL / IS NOT NULL
    for (const { col, val } of this._isConditions) {
      parts.push(val === null ? `"${col}" IS NULL` : `"${col}" IS NOT NULL`);
    }

    // NOT conditions: .not('col', 'is', null) → col IS NOT NULL
    for (const { col, op, val } of this._notConditions) {
      if (op === 'is' && val === null) {
        parts.push(`"${col}" IS NOT NULL`);
      } else if (op === 'eq') {
        values.push(val);
        parts.push(`"${col}" != $${startIdx + values.length - 1}`);
      } else {
        values.push(val);
        parts.push(`NOT ("${col}" ${op.toUpperCase()} $${startIdx + values.length - 1})`);
      }
    }

    // OR groups (PostgREST syntax)
    for (const group of this._orGroups) {
      const orParts = group.map(({ col, op, val }) => {
        if (op === 'is') {
          return val === 'null' ? `"${col}" IS NULL` : `"${col}" IS NOT NULL`;
        }
        const pgOp: Record<string, string> = { eq: '=', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=', like: 'LIKE', ilike: 'ILIKE' };
        values.push(val);
        return `"${col}" ${pgOp[op] || '='} $${startIdx + values.length - 1}`;
      });
      parts.push(`(${orParts.join(' OR ')})`);
    }

    if (!parts.length) return { sql: '', values: [] };
    return { sql: ` WHERE ${parts.join(' AND ')}`, values };
  }

  private async run(): Promise<{ data: any; error: any }> {
    const client: PoolClient = await this._pool.connect();
    try {
      if (this._userId) {
        await client.query(`SET LOCAL app.current_user_id = $1`, [this._userId]);
        await client.query(`SET LOCAL app.current_role = 'authenticated'`);
      }

      let rows: any[];

      if (this._op === 'select') {
        const cols = this.sanitizeCols(this._cols);
        const { sql: where, values } = this.buildWhere(1);
        let sql = `SELECT ${cols} FROM "${this._table}"${where}`;
        if (this._orderCol) sql += ` ORDER BY "${this._orderCol}" ${this._orderAsc ? 'ASC' : 'DESC'}`;
        if (this._limitVal) sql += ` LIMIT ${this._limitVal}`;
        if (this._offsetVal !== undefined) sql += ` OFFSET ${this._offsetVal}`;
        rows = (await client.query(sql, values)).rows;

      } else if (this._op === 'insert') {
        const arr = Array.isArray(this._data) ? this._data : [this._data];
        if (!arr.length) return { data: [], error: null };
        const keys = Object.keys(arr[0]);
        const allVals: any[] = [];
        const rowPH = arr.map((row: any) =>
          `(${keys.map((k) => { allVals.push(prepareDbValue(this._table, k, row[k])); return `$${allVals.length}`; }).join(', ')})`
        );
        const returning = this.sanitizeCols(this._cols);
        const sql = `INSERT INTO "${this._table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES ${rowPH.join(', ')} RETURNING ${returning}`;
        rows = (await client.query(sql, allVals)).rows;

      } else if (this._op === 'update') {
        const keys = Object.keys(this._data);
        const vals: any[] = [];
        const sets = keys.map((k) => { vals.push(prepareDbValue(this._table, k, this._data[k])); return `"${k}" = $${vals.length}`; });
        const { sql: where, values: whereVals } = this.buildWhere(vals.length + 1);
        const returning = this.sanitizeCols(this._cols);
        const sql = `UPDATE "${this._table}" SET ${sets.join(', ')}${where} RETURNING ${returning}`;
        rows = (await client.query(sql, [...vals, ...whereVals])).rows;

      } else if (this._op === 'delete') {
        const { sql: where, values } = this.buildWhere(1);
        const returning = this.sanitizeCols(this._cols);
        rows = (await client.query(`DELETE FROM "${this._table}"${where} RETURNING ${returning}`, values)).rows;

      } else { // upsert
        const arr = Array.isArray(this._data) ? this._data : [this._data];
        if (!arr.length) return { data: [], error: null };
        const keys = Object.keys(arr[0]);
        const allVals: any[] = [];
        const rowPH = arr.map((row: any) =>
          `(${keys.map((k) => { allVals.push(prepareDbValue(this._table, k, row[k])); return `$${allVals.length}`; }).join(', ')})`
        );
        const conflictCols = this._upsertConflict
          ? this._upsertConflict
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
        const conflict = conflictCols.length
          ? `(${conflictCols.map((c) => `"${c}"`).join(', ')})`
          : '';
        const updateSet = keys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ');
        const returning = this.sanitizeCols(this._cols);
        const sql = `INSERT INTO "${this._table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES ${rowPH.join(', ')} ON CONFLICT ${conflict} DO UPDATE SET ${updateSet} RETURNING ${returning}`;
        rows = (await client.query(sql, allVals)).rows;
      }

      return { data: this._single ? (rows[0] ?? null) : rows, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message, code: err.code, details: err.detail } };
    } finally {
      client.release();
    }
  }

  then(resolve: (v: { data: any; error: any }) => any, reject?: (r?: any) => any) {
    return this.run().then(resolve, reject);
  }
  catch(reject: (r?: any) => any) { return this.run().catch(reject); }
}

// ─── RPC Builder ──────────────────────────────────────────────────────────────

class RPCBuilder {
  private _pool: Pool;
  private _fn: string;
  private _params: Record<string, any>;

  constructor(pool: Pool, fn: string, params: Record<string, any>) {
    this._pool = pool;
    this._fn = fn;
    this._params = params;
  }

  private async run(): Promise<{ data: any; error: any }> {
    const client: PoolClient = await this._pool.connect();
    try {
      const keys = Object.keys(this._params);
      const values = Object.values(this._params);
      const namedArgs = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const sql = `SELECT * FROM "${this._fn}"(${namedArgs})`;
      const rows = (await client.query(sql, values)).rows;
      return { data: rows.length === 1 ? rows[0] : rows, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message, code: err.code } };
    } finally {
      client.release();
    }
  }

  then(resolve: (v: { data: any; error: any }) => any, reject?: (r?: any) => any) {
    return this.run().then(resolve, reject);
  }
  catch(reject: (r?: any) => any) { return this.run().catch(reject); }
}

// ─── Auth stub ────────────────────────────────────────────────────────────────

class AdminStub {
  private _pool: Pool;

  constructor(pool: Pool) {
    this._pool = pool;
  }

  async listUsers() {
    const client = await this._pool.connect();
    try {
      let rows: any[] = [];
      try {
        rows = (await client.query(
          `SELECT
             id,
             email,
             created_at,
             updated_at,
             NULL::timestamptz AS last_sign_in_at,
             banned_until
           FROM "users"
           ORDER BY created_at DESC`
        )).rows;
      } catch (columnErr: any) {
        if (!String(columnErr?.message || '').includes('banned_until')) {
          throw columnErr;
        }
        // Some DBs don't have users.banned_until yet; keep auth payload shape stable.
        rows = (await client.query(
          `SELECT
             id,
             email,
             created_at,
             updated_at,
             NULL::timestamptz AS last_sign_in_at,
             NULL::timestamptz AS banned_until
           FROM "users"
           ORDER BY created_at DESC`
        )).rows;
      }
      return { data: { users: rows }, error: null };
    } catch (err: any) {
      return { data: { users: [] }, error: { message: err.message } };
    } finally {
      client.release();
    }
  }

  async getUserById(userId: string) {
    const client = await this._pool.connect();
    try {
      const rows = (await client.query(`SELECT * FROM "users" WHERE id = $1 LIMIT 1`, [userId])).rows;
      return { data: { user: rows[0] ?? null }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: { message: err.message } };
    } finally {
      client.release();
    }
  }

  async updateUserById(userId: string, attributes: Record<string, any>) {
    const client = await this._pool.connect();
    try {
      const keys = Object.keys(attributes);
      const vals: any[] = [];
      const sets = keys.map((k) => { vals.push(attributes[k]); return `"${k}" = $${vals.length}`; });
      vals.push(userId);
      const rows = (await client.query(
        `UPDATE "users" SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
        vals
      )).rows;
      return { data: { user: rows[0] ?? null }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: { message: err.message } };
    } finally {
      client.release();
    }
  }

  async deleteUser(userId: string) {
    const client = await this._pool.connect();
    try {
      await client.query(`DELETE FROM "users" WHERE id = $1`, [userId]);
      return { data: {}, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    } finally {
      client.release();
    }
  }
}

class AuthStub {
  readonly admin: AdminStub;
  private readonly verifier = config.cognitoUserPoolId
    ? CognitoJwtVerifier.create({
        userPoolId: config.cognitoUserPoolId,
        tokenUse: 'access',
        clientId: null,
      })
    : null;

  constructor(pool: Pool) {
    this.admin = new AdminStub(pool);
  }

  async getUser(token: string) {
    try {
      if (this.verifier) {
        const payload = await (this.verifier as any).verify(token, { clientId: null });
        // Access tokens may lack the email claim for federated (Google/Facebook) users.
        // Fall back: use the username if it looks like an email (email/password + GitHub flow).
        const sub      = payload.sub as string;
        const direct   = (payload.email as string) || '';
        const username = (payload.username as string) || (payload['cognito:username'] as string) || '';
        const email    = direct || (username.includes('@') ? username : '');
        return {
          data: {
            user: {
              id: sub,
              email,
              user_metadata: {
                role: ((payload['cognito:groups'] as string[] | undefined)?.[0] === 'admin' ? 'admin' : 'user'),
              },
            },
          },
          error: null,
        };
      }
    } catch {
      // fall through to legacy JWT
    }

    try {
      if (config.jwtSecret) {
        const legacy = jwt.verify(token, config.jwtSecret) as any;
        return {
          data: {
            user: {
              id: legacy.userId,
              email: legacy.email || '',
              user_metadata: { role: legacy.role || 'user' },
            },
          },
          error: null,
        };
      }
    } catch {
      // invalid token
    }

    return { data: { user: null }, error: { message: 'Invalid or expired token' } };
  }
  async getSession() {
    return { data: { session: null }, error: null };
  }
}

// ─── Client facade ────────────────────────────────────────────────────────────

class RDSClient {
  readonly auth: AuthStub;
  private _userId?: string;

  constructor(userId?: string) {
    this._userId = userId;
    this.auth = new AuthStub(getDbPool());
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(table, getDbPool(), this._userId);
  }

  rpc(fn: string, params: Record<string, any> = {}): RPCBuilder {
    return new RPCBuilder(getDbPool(), fn, params);
  }

  withUser(userId: string): RDSClient {
    return new RDSClient(userId);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: RDSClient | null = null;

export function getSupabaseClient(): any {
  if (!_client) {
    _client = new RDSClient();
  }
  return _client;
}

export function createSupabaseClient(_url?: string, _key?: string): any {
  return new RDSClient();
}
