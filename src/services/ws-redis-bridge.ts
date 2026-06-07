/**
 * WebSocket Redis Bridge
 *
 * Forwards execution state events across backend replicas:
 *   Local Execution → broadcast event → Redis pub/sub → remote replicas → local WS clients
 *
 * Architecture:
 *   1. VisualizationService emits 'broadcast' when sending to local WS clients.
 *   2. This bridge subscribes to that event and publishes to Redis.
 *   3. Each replica subscribes to the Redis channel.
 *   4. On Redis message, this bridge calls visualizationService.broadcastExternal()
 *      which sends to locally connected clients WITHOUT re-emitting 'broadcast'.
 *
 * This means a client connected to replica B will receive events from an execution
 * running on replica A — resolving the multi-replica sticky-session problem.
 */

import { getRedisClient, isRedisAvailable } from '../shared/redis-client';

const CHANNEL_PREFIX = process.env.WEBSOCKET_REDIS_CHANNEL_PREFIX || 'ws:exec:';
const EXECUTION_CHANNEL = `${CHANNEL_PREFIX}events`;

interface BridgeEvent {
  executionId: string;
  message: any;
  sourceReplica: string;
  ts: number;
}

// Unique ID for this replica instance (prevents echoing own messages back)
const REPLICA_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let bridgeActive = false;

/**
 * Initialize the Redis bridge for a VisualizationService instance.
 * Call this once after the WebSocket server has started.
 */
export async function initWsRedisBridge(visualizationService: {
  on(event: 'broadcast', listener: (data: { executionId: string; message: any }) => void): any;
  broadcastExternal(executionId: string, message: any): void;
}): Promise<void> {
  if (bridgeActive) return;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('[WsRedisBridge] Redis not available — bridge disabled. Only single-replica WS will work.');
    return;
  }

  const publisher = await getRedisClient();
  if (!publisher) {
    console.warn('[WsRedisBridge] Could not get Redis publisher client.');
    return;
  }

  // Subscriber needs a dedicated connection (subscribing locks the client)
  const subscriber = await getRedisClient();
  if (!subscriber) {
    console.warn('[WsRedisBridge] Could not get Redis subscriber client.');
    return;
  }

  // ── OUTBOUND: local broadcast → Redis ────────────────────────────────────
  visualizationService.on('broadcast', ({ executionId, message }) => {
    const event: BridgeEvent = {
      executionId,
      message,
      sourceReplica: REPLICA_ID,
      ts: Date.now(),
    };
    publisher.publish(EXECUTION_CHANNEL, JSON.stringify(event)).catch((err: any) => {
      console.error('[WsRedisBridge] Publish error:', err?.message);
    });
  });

  // ── INBOUND: Redis → local WS clients ────────────────────────────────────
  // ioredis requires subscribing first, then listening via the 'message' event.
  await subscriber.subscribe(EXECUTION_CHANNEL);
  subscriber.on('message', (_channel: string, rawMessage: string) => {
    try {
      const event: BridgeEvent = JSON.parse(rawMessage);

      // Skip messages published by this replica (already sent to local clients)
      if (event.sourceReplica === REPLICA_ID) return;

      visualizationService.broadcastExternal(event.executionId, event.message);
    } catch (err: any) {
      console.error('[WsRedisBridge] Error handling Redis message:', err?.message);
    }
  });

  bridgeActive = true;
  console.log(`[WsRedisBridge] ✅ Active — replica ${REPLICA_ID}, channel: ${EXECUTION_CHANNEL}`);
}

/**
 * Publish an execution status event directly (e.g. from the execution queue worker).
 * Use this when you want to notify all replicas about a status change without
 * going through VisualizationService locally.
 */
export async function publishExecutionEvent(executionId: string, message: any): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) return;

  const redis = await getRedisClient();
  if (!redis) return;

  const event: BridgeEvent = {
    executionId,
    message,
    sourceReplica: REPLICA_ID,
    ts: Date.now(),
  };

  try {
    await redis.publish(EXECUTION_CHANNEL, JSON.stringify(event));
  } catch (err: any) {
    console.error('[WsRedisBridge] publishExecutionEvent error:', err?.message);
  }
}

export function isBridgeActive(): boolean {
  return bridgeActive;
}

/** Reset bridge state (test use only). */
export function _resetBridgeForTest(): void {
  bridgeActive = false;
}
