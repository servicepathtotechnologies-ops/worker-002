/**
 * Event Store
 * 
 * Event sourcing for workflow execution history.
 * Features:
 * - Store all execution events
 * - Deterministic replay
 * - Event versioning
 * - Event querying
 */

import { createClient, RedisClientType } from 'redis';

export enum EventType {
  WORKFLOW_STARTED = 'workflow_started',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',
  NODE_STARTED = 'node_started',
  NODE_COMPLETED = 'node_completed',
  NODE_FAILED = 'node_failed',
  CHECKPOINT_CREATED = 'checkpoint_created',
  STATE_TRANSITION = 'state_transition',
  RETRY_ATTEMPTED = 'retry_attempted',
  TIMEOUT = 'timeout',
}

export interface WorkflowEvent {
  id: string;
  executionId: string;
  workflowId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, any>;
  version: number; // Event version for replay
  metadata?: Record<string, any>;
}

/**
 * Event Store
 * Stores workflow execution events for event sourcing
 */
export class EventStore {
  private redis: RedisClientType | null = null;
  private isConnected = false;
  private readonly eventKeyPrefix = 'workflow:event:';
  private readonly executionEventsKeyPrefix = 'workflow:execution:events:';
  private readonly eventIndexKey = 'workflow:events:index';

  /**
   * Initialize Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    try {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = createClient({ url }) as RedisClientType;
      
      this.redis.on('error', (err) => {
        console.error('[EventStore] Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[EventStore] ✅ Connected to Redis');
        this.isConnected = true;
      });

      await this.redis.connect();
      console.log('[EventStore] ✅ Event store initialized');
    } catch (error) {
      console.error('[EventStore] ❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Append event to event store
   */
  async appendEvent(event: Omit<WorkflowEvent, 'id' | 'version'>): Promise<WorkflowEvent> {
    if (!this.isAvailable()) {
      throw new Error('Event store not available');
    }

    // Get next version for this execution
    const version = await this.getNextVersion(event.executionId);

    const workflowEvent: WorkflowEvent = {
      id: `${event.executionId}:${version}`,
      ...event,
      version,
    };

    const eventKey = `${this.eventKeyPrefix}${workflowEvent.id}`;
    const eventData = JSON.stringify(workflowEvent);

    // Store event
    await this.redis!.setEx(eventKey, 2592000, eventData); // 30 days TTL

    // Add to execution events list (sorted by version)
    const executionEventsKey = `${this.executionEventsKeyPrefix}${event.executionId}`;
    await this.redis!.zAdd(executionEventsKey, {
      score: version,
      value: workflowEvent.id,
    });

    // Add to index
    await this.redis!.sAdd(this.eventIndexKey, workflowEvent.id);

    console.log(`[EventStore] ✅ Appended event ${workflowEvent.id} (version ${version}, type: ${event.type})`);
    return workflowEvent;
  }

  /**
   * Get next version for execution
   */
  private async getNextVersion(executionId: string): Promise<number> {
    const executionEventsKey = `${this.executionEventsKeyPrefix}${executionId}`;
    const count = await this.redis!.zCard(executionEventsKey);
    return count + 1;
  }

  /**
   * Get all events for execution (ordered by version)
   */
  async getExecutionEvents(executionId: string): Promise<WorkflowEvent[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const executionEventsKey = `${this.executionEventsKeyPrefix}${executionId}`;
    const eventIds = await this.redis!.zRange(executionEventsKey, 0, -1);

    const events: WorkflowEvent[] = [];
    for (const eventId of eventIds) {
      const eventKey = `${this.eventKeyPrefix}${eventId}`;
      const eventData = await this.redis!.get(eventKey);
      if (eventData) {
        events.push(JSON.parse(eventData));
      }
    }

    return events;
  }

  /**
   * Get events by type
   */
  async getEventsByType(executionId: string, type: EventType): Promise<WorkflowEvent[]> {
    const allEvents = await this.getExecutionEvents(executionId);
    return allEvents.filter(e => e.type === type);
  }

  /**
   * Get events in range
   */
  async getEventsInRange(
    executionId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<WorkflowEvent[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const executionEventsKey = `${this.executionEventsKeyPrefix}${executionId}`;
    const eventIds = await this.redis!.zRangeByScore(
      executionEventsKey,
      fromVersion,
      toVersion
    );

    const events: WorkflowEvent[] = [];
    for (const eventId of eventIds) {
      const eventKey = `${this.eventKeyPrefix}${eventId}`;
      const eventData = await this.redis!.get(eventKey);
      if (eventData) {
        events.push(JSON.parse(eventData));
      }
    }

    return events;
  }

  /**
   * Get latest event
   */
  async getLatestEvent(executionId: string): Promise<WorkflowEvent | null> {
    const events = await this.getExecutionEvents(executionId);
    return events.length > 0 ? events[events.length - 1] : null;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[EventStore] ✅ Redis connection closed');
    }
  }
}

// Export singleton instance
let eventStoreInstance: EventStore | null = null;

export function getEventStore(): EventStore {
  if (!eventStoreInstance) {
    eventStoreInstance = new EventStore();
  }
  return eventStoreInstance;
}
