import { createClient, RedisClientType } from 'redis';
import { config } from '../../core/config';

export interface PlannerSessionRecord<T = Record<string, unknown>> {
  id: string;
  workflowId?: string;
  stage: 'analyze' | 'generate' | 'confirm';
  status: 'pending' | 'needs_clarification' | 'awaiting_answers' | 'ready' | 'failed';
  version: number;
  createdAt: string;
  updatedAt: string;
  artifacts: T;
}

let redisClient: RedisClientType | null = null;
let redisConnected = false;
let redisInitPromise: Promise<void> | null = null;
const SESSION_PREFIX = 'planner-session:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 6;

function plannerSessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient && redisConnected) return redisClient;
  if (redisInitPromise) {
    await redisInitPromise;
    if (redisClient && redisConnected) return redisClient;
    throw new Error('Planner session repository unavailable');
  }

  const redisUrl = config.redisUrl || process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Redis URL is required for planner sessions');
  }

  redisInitPromise = (async () => {
    try {
      redisClient = createClient({ url: redisUrl }) as RedisClientType;
      redisClient.on('error', () => {
        redisConnected = false;
      });
      redisClient.on('connect', () => {
        redisConnected = true;
      });
      await redisClient.connect();
      redisConnected = true;
    } finally {
      redisInitPromise = null;
    }
  })();

  await redisInitPromise;
  if (!redisClient || !redisConnected) throw new Error('Planner session repository unavailable');
  return redisClient;
}

export async function upsertPlannerSession<T = Record<string, unknown>>(
  session: PlannerSessionRecord<T>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const redis = await getRedisClient();
  const toStore: PlannerSessionRecord<T> = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await redis.setEx(plannerSessionKey(session.id), ttlSeconds, JSON.stringify(toStore));
}

export async function getPlannerSession<T = Record<string, unknown>>(
  sessionId: string,
): Promise<PlannerSessionRecord<T> | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(plannerSessionKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlannerSessionRecord<T>;
  } catch {
    return null;
  }
}

