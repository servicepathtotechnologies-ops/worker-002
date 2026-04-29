import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  lastActivity: string;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}

let redisClient: RedisClientType | null = null;
let redisConnected = false;
let redisInitPromise: Promise<void> | null = null;

function sessionKey(sessionId: string): string {
  const prefix = config.reliability?.redisSessionPrefix || 'session:';
  return `${prefix}${sessionId}`;
}

function userSessionsIndexKey(userId: string): string {
  const prefix = config.reliability?.redisSessionPrefix || 'session:';
  return `${prefix}user-index:${userId}`;
}

async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisConnected) {
    return redisClient;
  }

  if (redisInitPromise) {
    await redisInitPromise;
    if (redisConnected && redisClient) {
      return redisClient;
    }
    throw new Error('Session repository unavailable');
  }

  const redisUrl = config.redisUrl || process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Redis URL is required for session repository');
  }

  redisInitPromise = (async () => {
    try {
      redisClient = createClient({ url: redisUrl }) as RedisClientType;
      redisClient.on('error', (error) => {
        redisConnected = false;
        console.error('[SessionRepository] Redis error:', error);
      });
      redisClient.on('connect', () => {
        redisConnected = true;
      });
      await redisClient.connect();
      redisConnected = true;
      console.log('[SessionRepository] ✅ Redis session store connected');
    } catch (error) {
      redisConnected = false;
      redisClient = null;
      console.error('[SessionRepository] ❌ Redis unavailable:', error);
    } finally {
      redisInitPromise = null;
    }
  })();

  await redisInitPromise;
  if (!redisConnected || !redisClient) {
    throw new Error('Session repository unavailable');
  }
  return redisClient;
}

export async function upsertSession(session: SessionRecord, maxAgeMs: number): Promise<void> {
  const redis = await getRedisClient();
  const ttlSec = Math.max(1, Math.ceil(maxAgeMs / 1000));
  await redis.setEx(sessionKey(session.id), ttlSec, JSON.stringify(session));
  await redis.sAdd(userSessionsIndexKey(session.userId), session.id);
  await redis.expire(userSessionsIndexKey(session.userId), ttlSec);
}

export async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  const redis = await getRedisClient();
  const value = await redis.get(sessionKey(sessionId));
  if (!value) return null;
  try {
    return JSON.parse(value) as SessionRecord;
  } catch {
    return null;
  }
}

export async function invalidateSessionRecord(sessionId: string, maxAgeMs: number): Promise<boolean> {
  const existing = await getSessionRecord(sessionId);
  if (!existing) return false;
  const updated: SessionRecord = {
    ...existing,
    isActive: false,
    lastActivity: new Date().toISOString(),
  };
  await upsertSession(updated, maxAgeMs);
  return true;
}

export async function invalidateAllSessionsForUser(userId: string, maxAgeMs: number): Promise<number> {
  const redis = await getRedisClient();
  const nowIso = new Date().toISOString();
  const ids = await redis.sMembers(userSessionsIndexKey(userId));
  let invalidated = 0;
  for (const id of ids) {
    const existing = await getSessionRecord(id);
    if (!existing) continue;
    await upsertSession({ ...existing, isActive: false, lastActivity: nowIso }, maxAgeMs);
    invalidated++;
  }
  return invalidated;
}

export async function trimUserSessions(userId: string, keepLatest: number, maxAgeMs: number): Promise<void> {
  const redis = await getRedisClient();
  const ids = await redis.sMembers(userSessionsIndexKey(userId));
  const sessions: SessionRecord[] = [];
  for (const id of ids) {
    const session = await getSessionRecord(id);
    if (session) sessions.push(session);
  }

  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const toDeactivate = sessions.slice(keepLatest);
  for (const session of toDeactivate) {
    await upsertSession({ ...session, isActive: false }, maxAgeMs);
  }
}

export async function cleanupSessionRecords(maxAgeMs: number): Promise<number> {
  const now = Date.now();
  const redis = await getRedisClient();
  let cleaned = 0;

  const userIndexPattern = `${config.reliability?.redisSessionPrefix || 'session:'}user-index:*`;
  const keys = await redis.keys(userIndexPattern);
  for (const userIndexKey of keys) {
    const ids = await redis.sMembers(userIndexKey);
    for (const sessionId of ids) {
      const record = await getSessionRecord(sessionId);
      if (!record) {
        await redis.sRem(userIndexKey, sessionId);
        continue;
      }
      const age = now - new Date(record.lastActivity).getTime();
      if (age > maxAgeMs || !record.isActive) {
        await redis.del(sessionKey(sessionId));
        await redis.sRem(userIndexKey, sessionId);
        cleaned++;
      }
    }
  }

  return cleaned;
}
