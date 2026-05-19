import { Pool, PoolClient } from 'pg';

// ─── Pool Configuration ───────────────────────────────────────────────────────

const SLOW_QUERY_MS = 500;
const POOL_WARN_THRESHOLD = 0.8;

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    // Append connect_timeout so the TCP handshake fails in 4s rather than the
    // OS default (~2 min). This keeps latency low when RDS is unreachable.
    const connStr = (process.env.DATABASE_URL || '').includes('connect_timeout')
      ? process.env.DATABASE_URL!
      : `${process.env.DATABASE_URL}${process.env.DATABASE_URL?.includes('?') ? '&' : '?'}connect_timeout=4`;

    pool = new Pool({
      connectionString: connStr,
      ssl:  { rejectUnauthorized: false },
      min:  0,   // don't maintain idle connections — avoids endless retries when DB is unreachable
      max:  10,
      idleTimeoutMillis:            30_000,
      connectionTimeoutMillis:       5_000,  // fail fast if pool is exhausted
      statement_timeout:            30_000,
      keepAlive:                    true,    // prevent NAT/firewall silently dropping idle connections
      keepAliveInitialDelayMillis:  10_000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    setInterval(() => {
      if (!pool) return;
      const { totalCount, idleCount, waitingCount } = pool;
      const utilization = totalCount > 0 ? ((totalCount - idleCount) / totalCount) : 0;
      const level = waitingCount > 0 || utilization >= POOL_WARN_THRESHOLD ? 'warn' : 'info';
      console[level](
        `[DB] pool — total:${totalCount} idle:${idleCount} waiting:${waitingCount} util:${(utilization * 100).toFixed(0)}%`
      );
      if (waitingCount > 0) {
        console.error('[DB] ALERT — queries are waiting for a free connection.');
      }
    }, 60_000).unref();

    // Background health probe: when the circuit is open, proactively heal it
    // every 60 s instead of waiting for a user request to trigger the retry.
    // Also runs a heartbeat every 5 min during normal operation to catch stale
    // connections early (e.g. after an RDS maintenance window).
    let _lastHeartbeat = 0;
    setInterval(async () => {
      const now = Date.now();
      const circuitIsOpen   = now < _circuitOpenUntil;
      const heartbeatIsDue  = now - _lastHeartbeat > 5 * 60_000;
      if (circuitIsOpen || heartbeatIsDue) {
        const ok = await isDatabaseReachable().catch(() => false);
        if (ok) {
          _lastHeartbeat = now;
          if (circuitIsOpen) console.info('[DB] Health probe: circuit healed — DB is reachable again');
        } else if (circuitIsOpen) {
          console.warn('[DB] Health probe: DB still unreachable, circuit remains open');
        }
      }
    }, 60_000).unref();
  }
  return pool;
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────
// When the DB is unreachable every call would wait ~4s before timing out.
// After the first failure we open the circuit for 30s so all callers get an
// instant rejection instead of a per-request timeout storm.

let _circuitOpenUntil = 0;
const CIRCUIT_RESET_MS = 30_000;

function isConnectionError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connect timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'ENOTFOUND'
  );
}

export class DbUnavailableError extends Error {
  code = 'DB_UNAVAILABLE';
  statusCode = 503;
  constructor() { super('Service temporarily unavailable — please try again in a moment.'); }
}

async function withCircuit<T>(fn: () => Promise<T>): Promise<T> {
  if (Date.now() < _circuitOpenUntil) throw new DbUnavailableError();
  try {
    return await fn();
  } catch (err: any) {
    if (isConnectionError(err)) {
      _circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
      console.warn('[DB] Circuit opened — DB unreachable, fast-failing for 30s:', err.message);
      throw new DbUnavailableError();
    }
    throw err;
  }
}

// ─── Instrumented query helpers ───────────────────────────────────────────────

async function runQuery<T>(
  client: PoolClient | Pool,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const start = Date.now();
  const result = await (client as any).query(sql, params);
  const ms = Date.now() - start;
  if (ms > SLOW_QUERY_MS) {
    const preview = sql.replace(/\s+/g, ' ').slice(0, 120);
    console.warn(`[DB] slow query ${ms}ms — ${preview}`);
  }
  return result.rows;
}

/**
 * Run a query with user context set for RLS.
 */
export async function queryAsUser<T = any>(
  userId: string,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  return withCircuit(async () => {
    const client: PoolClient = await getDbPool().connect();
    try {
      await client.query(`SET LOCAL app.current_user_id = $1`, [userId]);
      await client.query(`SET LOCAL app.current_role = 'authenticated'`);
      return await runQuery<T>(client, sql, params);
    } finally {
      client.release();
    }
  });
}

/**
 * Run a query as service role (bypasses RLS user context).
 */
export async function queryAsService<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  return withCircuit(() => runQuery<T>(getDbPool(), sql, params));
}

// ─── Pool stats / reachability ────────────────────────────────────────────────

export function getPoolStats() {
  if (!pool) return { totalCount: 0, idleCount: 0, waitingCount: 0, utilization: 0 };
  const { totalCount, idleCount, waitingCount } = pool;
  const utilization = totalCount > 0 ? (totalCount - idleCount) / totalCount : 0;
  return { totalCount, idleCount, waitingCount, utilization: parseFloat((utilization * 100).toFixed(1)) };
}

export async function isDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  // Bypass the circuit for the explicit reachability probe
  try {
    const rows = await runQuery<{ ok: number }>(getDbPool(), 'SELECT 1 AS ok');
    _circuitOpenUntil = 0; // DB is back — close circuit
    return rows.length > 0;
  } catch {
    return false;
  }
}
