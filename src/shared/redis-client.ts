// Redis Client for CtrlChecks AI
// Provides connection to Redis for short-term memory storage

import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisConnectionPromise: Promise<Redis | null> | null = null;

/**
 * Get or create Redis client connection
 * Uses connection pooling to avoid creating multiple connections
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (redisClient) {
    return redisClient;
  }

  // If connection is in progress, wait for it
  if (redisConnectionPromise) {
    return redisConnectionPromise;
  }

  // Start new connection
  redisConnectionPromise = connectRedis();
  redisClient = await redisConnectionPromise;
  redisConnectionPromise = null;

  return redisClient;
}

/**
 * Connect to Redis server
 */
async function connectRedis(): Promise<Redis | null> {
  const REDIS_URL = process.env.REDIS_URL;
  
  if (!REDIS_URL) {
    console.warn("REDIS_URL not set. Redis features will be disabled.");
    return null;
  }

  try {
    const client = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 20) return null; // stop retrying after ~20 attempts (~40s total)
        return Math.min(times * 50, 2000);
      },
      reconnectOnError: (err) => {
        // Reconnect on socket-level errors (ECONNRESET, EPIPE) so a dropped
        // TCP connection is healed without a process restart.
        const msg = err.message.toUpperCase();
        return msg.includes('ECONNRESET') || msg.includes('EPIPE');
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,  // queue commands during reconnect (default)
      lazyConnect: false,
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    // Test connection
    await client.ping();
    console.log(`Connected to Redis at ${REDIS_URL}`);

    return client;
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    return null;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (error) {
      console.error("Error closing Redis connection:", error);
    }
    redisClient = null;
  }
  redisConnectionPromise = null;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    await client.ping();
    return true;
  } catch {
    return false;
  }
}
