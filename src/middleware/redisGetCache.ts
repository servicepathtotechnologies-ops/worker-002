import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { createClient, RedisClientType } from 'redis';

interface CacheOptions {
  redisUrl?: string;
  ttlSeconds?: number;
  skipPaths?: string[];
}

let cacheClient: RedisClientType | null = null;
let cacheConnecting: Promise<RedisClientType | null> | null = null;

/**
 * Returns a singleton Redis client for cache-aside GET responses.
 */
export async function getCacheRedisClient(redisUrl: string): Promise<RedisClientType | null> {
  if (cacheClient?.isOpen) return cacheClient;
  if (cacheConnecting) return cacheConnecting;

  cacheConnecting = (async () => {
    try {
      const client = createClient({ url: redisUrl }) as RedisClientType;
      client.on('error', (error) => console.error('[RedisGetCache] Redis error:', error));
      await client.connect();
      cacheClient = client;
      return client;
    } catch (error) {
      console.error('[RedisGetCache] Redis unavailable:', error);
      cacheClient = null;
      return null;
    } finally {
      cacheConnecting = null;
    }
  })();

  return cacheConnecting;
}

/**
 * Builds a stable cache key using the route path and a hash of params/query/auth context.
 */
export function buildCacheKey(req: Request): string {
  const auth = req.headers.authorization ? crypto.createHash('sha256').update(req.headers.authorization).digest('hex').slice(0, 16) : 'anon';
  const source = JSON.stringify({ params: req.params, query: req.query, body: req.body, auth });
  const paramsHash = crypto.createHash('sha256').update(source).digest('hex');
  return `${req.path}:${paramsHash}`;
}

/**
 * Caches successful JSON GET responses with a cache-aside Redis pattern.
 */
export function redisGetCache(options: CacheOptions = {}) {
  const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://redis:6379';
  const ttlSeconds = options.ttlSeconds || Number(process.env.GET_CACHE_TTL_SECONDS || 60);
  const skipPaths = new Set(options.skipPaths || ['/health', '/metrics']);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET' || skipPaths.has(req.path)) return next();

    const client = await getCacheRedisClient(redisUrl);
    if (!client) return next();

    const key = buildCacheKey(req);
    const cached = await client.get(key);
    if (cached) {
      console.log(`[RedisGetCache] hit ${key}`);
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(cached);
      return;
    }

    console.log(`[RedisGetCache] miss ${key}`);
    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        client.setEx(key, ttlSeconds, JSON.stringify(body)).catch((error) => {
          console.error('[RedisGetCache] write failed:', error);
        });
      }
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}
