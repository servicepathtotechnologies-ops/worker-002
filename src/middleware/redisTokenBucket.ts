import { NextFunction, Request, Response } from 'express';
import { createClient, RedisClientType } from 'redis';

interface TokenBucketOptions {
  redisUrl?: string;
  capacity?: number;
  refillPerMinute?: number;
  prefix?: string;
  skipPaths?: string[];
}

let redisClient: RedisClientType | null = null;
let redisConnecting: Promise<RedisClientType | null> | null = null;

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local bucket = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])
if tokens == nil then
  tokens = capacity
  updated_at = now
end
local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + (elapsed * refill_per_ms))
local allowed = 0
local retry_after = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after = math.ceil((1 - tokens) / refill_per_ms / 1000)
end
redis.call('HMSET', key, 'tokens', tokens, 'updated_at', now)
redis.call('PEXPIRE', key, ttl)
return { allowed, math.floor(tokens), retry_after }
`;

/**
 * Returns a singleton Redis client for distributed token-bucket state.
 */
export async function getRateLimitRedisClient(redisUrl: string): Promise<RedisClientType | null> {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnecting) return redisConnecting;

  redisConnecting = (async () => {
    try {
      const client = createClient({ url: redisUrl }) as RedisClientType;
      client.on('error', (error) => {
        console.error('[TokenBucketRateLimit] Redis error:', error);
      });
      await client.connect();
      redisClient = client;
      return client;
    } catch (error) {
      console.error('[TokenBucketRateLimit] Redis unavailable:', error);
      redisClient = null;
      return null;
    } finally {
      redisConnecting = null;
    }
  })();

  return redisConnecting;
}

/**
 * Resolves the best client identity for per-IP limiting behind a proxy.
 */
export function clientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Creates a Redis-backed token bucket limiter shared by all app instances.
 */
export function tokenBucketRateLimiter(options: TokenBucketOptions = {}) {
  const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://redis:6379';
  const capacity = options.capacity || Number(process.env.RATE_LIMIT_PER_MINUTE || 100);
  const refillPerMinute = options.refillPerMinute || capacity;
  const refillPerMs = refillPerMinute / 60_000;
  const prefix = options.prefix || 'token-bucket';
  const skipPaths = new Set(options.skipPaths || ['/health', '/metrics']);
  const ttlMs = 120_000;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (skipPaths.has(req.path)) return next();

    const client = await getRateLimitRedisClient(redisUrl);
    if (!client) {
      res.status(503).json({ error: 'Rate limiter unavailable', code: 'RATE_LIMITER_UNAVAILABLE' });
      return;
    }

    const key = `${prefix}:${clientIp(req)}`;
    const result = await client.eval(TOKEN_BUCKET_SCRIPT, {
      keys: [key],
      arguments: [String(capacity), String(refillPerMs), String(Date.now()), String(ttlMs)],
    }) as unknown as [number, number, number];

    const allowed = Number(result[0]) === 1;
    const remaining = Number(result[1] || 0);
    const retryAfter = Math.max(1, Number(result[2] || 60));

    res.setHeader('X-RateLimit-Limit', String(capacity));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfter });
      return;
    }

    next();
  };
}
