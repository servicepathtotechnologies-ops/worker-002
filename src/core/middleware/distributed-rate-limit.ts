import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

interface DistributedRateLimitOptions {
  endpointKey: string;
  perUserLimit: number;
  globalLimit: number;
  windowMs: number;
}

let redisClient: RedisClientType | null = null;
let redisReady = false;
let redisConnecting: Promise<void> | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisReady) {
    return redisClient;
  }

  if (redisConnecting) {
    await redisConnecting;
    if (redisReady && redisClient) {
      return redisClient;
    }
    throw new Error('Distributed rate limiter unavailable');
  }

  const redisUrl = config.reliability?.distributedRateLimitRedisUrl || config.redisUrl;
  if (!redisUrl) {
    throw new Error('Redis URL is required for distributed rate limiting');
  }

  redisConnecting = (async () => {
    try {
      redisClient = createClient({ url: redisUrl }) as RedisClientType;
      redisClient.on('error', (error) => {
        redisReady = false;
        console.error('[DistributedRateLimit] Redis client error:', error);
      });
      redisClient.on('connect', () => {
        redisReady = true;
      });
      await redisClient.connect();
      redisReady = true;
      console.log('[DistributedRateLimit] ✅ Redis limiter connected');
    } catch (error) {
      redisReady = false;
      redisClient = null;
      console.error('[DistributedRateLimit] ❌ Redis limiter unavailable:', error);
    } finally {
      redisConnecting = null;
    }
  })();

  await redisConnecting;
  if (!redisReady || !redisClient) {
    throw new Error('Distributed rate limiter unavailable');
  }
  return redisClient;
}

function pickUserKey(req: Request): string {
  const anyReq = req as any;
  const authUserId = anyReq?.user?.id;
  if (typeof authUserId === 'string' && authUserId.length > 0) {
    return `user:${authUserId}`;
  }

  const apiKey = req.get('x-api-key');
  if (apiKey) {
    return `api_key:${apiKey.slice(0, 16)}`;
  }

  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token.length > 0) {
      return `bearer:${token.slice(0, 16)}`;
    }
  }

  return `ip:${req.ip || 'unknown'}`;
}

async function applyRedisRateLimit(
  client: RedisClientType,
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const now = Date.now();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const pipeline = client.multi();
  pipeline.incr(key);
  pipeline.expire(key, windowSec, 'NX');
  pipeline.ttl(key);
  const result = await pipeline.exec();

  const count = Number(result?.[0] ?? 0);
  const ttl = Number(result?.[2] ?? windowSec);
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const retryAfterSec = Math.max(1, ttl > 0 ? ttl : windowSec - Math.floor((Date.now() - now) / 1000));

  return { allowed, remaining, retryAfterSec };
}

export function distributedRateLimit(options: DistributedRateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userKey = pickUserKey(req);
    const endpoint = options.endpointKey;
    const perUserCounterKey = `ratelimit:${endpoint}:user:${userKey}`;
    const globalCounterKey = `ratelimit:${endpoint}:global`;

    try {
      const redis = await getRedisClient();
      const perUserResult = await applyRedisRateLimit(redis, perUserCounterKey, options.perUserLimit, options.windowMs);

      if (!perUserResult.allowed) {
        return res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_PER_USER',
          endpoint,
          retryAfter: perUserResult.retryAfterSec,
          message: `Per-user limit exceeded for ${endpoint}`,
        });
      }

      const globalResult = await applyRedisRateLimit(redis, globalCounterKey, options.globalLimit, options.windowMs);

      if (!globalResult.allowed) {
        return res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_GLOBAL',
          endpoint,
          retryAfter: globalResult.retryAfterSec,
          message: `Global limit exceeded for ${endpoint}`,
        });
      }

      res.setHeader('X-RateLimit-Endpoint', endpoint);
      res.setHeader('X-RateLimit-Remaining-User', String(perUserResult.remaining));
      res.setHeader('X-RateLimit-Remaining-Global', String(globalResult.remaining));
      next();
    } catch (error) {
      console.error('[DistributedRateLimit] limiter failure:', error);
      res.status(503).json({
        error: 'Rate limiter unavailable',
        code: 'RATE_LIMITER_UNAVAILABLE',
        endpoint,
        message: 'Distributed rate limiter is unavailable',
      });
    }
  };
}

