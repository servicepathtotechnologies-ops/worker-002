import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const mockPublish = (jest.fn() as any).mockResolvedValue(1);
const mockSubscribe = (jest.fn() as any).mockResolvedValue(undefined);

// Track 'message' handlers registered on subscriber
const subscriberHandlers: { event: string; handler: Function }[] = [];

const mockSubscriberClient = {
  publish: mockPublish,
  subscribe: mockSubscribe,
  on: jest.fn((event: string, handler: Function) => {
    subscriberHandlers.push({ event, handler });
  }),
};

const mockPublisherClient = {
  publish: mockPublish,
  subscribe: mockSubscribe,
  on: jest.fn(),
};

let clientCallCount = 0;

jest.mock('../../shared/redis-client', () => ({
  getRedisClient: jest.fn(async () => {
    clientCallCount++;
    // odd call → publisher, even call → subscriber
    return clientCallCount % 2 === 1 ? mockPublisherClient : mockSubscriberClient;
  }),
  isRedisAvailable: jest.fn(async () => true),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  initWsRedisBridge,
  isBridgeActive,
  publishExecutionEvent,
  _resetBridgeForTest,
} from '../ws-redis-bridge';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockVisualizationService() {
  const listeners: Record<string, Function[]> = {};
  return {
    on: jest.fn((event: string, listener: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    }),
    broadcastExternal: jest.fn(),
    emit(event: string, data: any) {
      for (const fn of listeners[event] ?? []) fn(data);
    },
  };
}

function getMessageHandlers(): Function[] {
  return subscriberHandlers.filter(h => h.event === 'message').map(h => h.handler);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('initWsRedisBridge', () => {
  let visualizationService: ReturnType<typeof makeMockVisualizationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    clientCallCount = 0;
    subscriberHandlers.length = 0;
    _resetBridgeForTest();
    visualizationService = makeMockVisualizationService();
  });

  afterEach(() => {
    _resetBridgeForTest();
  });

  it('registers a broadcast listener on visualizationService', async () => {
    await initWsRedisBridge(visualizationService);
    expect(visualizationService.on).toHaveBeenCalledWith('broadcast', expect.any(Function));
  });

  it('publishes to Redis when a broadcast event fires', async () => {
    await initWsRedisBridge(visualizationService);

    visualizationService.emit('broadcast', {
      executionId: 'exec-123',
      message: { type: 'EXECUTION_UPDATE', data: { status: 'running' } },
    });

    expect(mockPublish).toHaveBeenCalledWith(
      expect.stringContaining('events'),
      expect.stringContaining('exec-123'),
    );
  });

  it('published payload includes executionId and sourceReplica', async () => {
    await initWsRedisBridge(visualizationService);

    visualizationService.emit('broadcast', {
      executionId: 'exec-456',
      message: { type: 'NODE_COMPLETE' },
    });

    const rawPayload = (mockPublish.mock.calls[0] as any[])[1] as string;
    const parsed = JSON.parse(rawPayload);
    expect(parsed.executionId).toBe('exec-456');
    expect(typeof parsed.sourceReplica).toBe('string');
    expect(typeof parsed.ts).toBe('number');
  });

  it('calls broadcastExternal when inbound Redis message arrives from a different replica', async () => {
    await initWsRedisBridge(visualizationService);

    const inboundEvent = {
      executionId: 'exec-remote',
      message: { type: 'EXECUTION_UPDATE', data: { status: 'success' } },
      sourceReplica: 'other-replica-xyz',
      ts: Date.now(),
    };

    for (const handler of getMessageHandlers()) {
      handler('ws:exec:events', JSON.stringify(inboundEvent));
    }

    expect(visualizationService.broadcastExternal).toHaveBeenCalledWith(
      'exec-remote',
      inboundEvent.message,
    );
  });

  it('does NOT call broadcastExternal for messages from this replica (dedup)', async () => {
    await initWsRedisBridge(visualizationService);

    // Fire a broadcast so we can capture this replica's ID from the published payload
    visualizationService.emit('broadcast', {
      executionId: 'exec-self',
      message: { type: 'EXECUTION_UPDATE' },
    });

    expect(mockPublish).toHaveBeenCalled();
    const rawPayload = (mockPublish.mock.calls[0] as any[])[1] as string;

    // Feed the same event back as if Redis echoed it to this replica
    for (const handler of getMessageHandlers()) {
      handler('ws:exec:events', rawPayload);
    }

    expect(visualizationService.broadcastExternal).not.toHaveBeenCalled();
  });

  it('subscribes to the execution events channel', async () => {
    await initWsRedisBridge(visualizationService);
    expect(mockSubscribe).toHaveBeenCalledWith(expect.stringContaining('events'));
  });
});

// ─── publishExecutionEvent ────────────────────────────────────────────────────

describe('publishExecutionEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clientCallCount = 0;
  });

  it('publishes a serialized event to Redis', async () => {
    await publishExecutionEvent('exec-789', { type: 'STATUS', data: { status: 'queued' } });
    expect(mockPublish).toHaveBeenCalledWith(
      expect.stringContaining('events'),
      expect.stringContaining('exec-789'),
    );
  });

  it('does not throw when Redis is unavailable', async () => {
    const { isRedisAvailable } = require('../../shared/redis-client');
    (isRedisAvailable as any).mockResolvedValueOnce(false);
    await expect(publishExecutionEvent('exec-x', {})).resolves.not.toThrow();
  });
});

// ─── isBridgeActive ───────────────────────────────────────────────────────────

describe('isBridgeActive', () => {
  afterEach(() => {
    _resetBridgeForTest();
  });

  it('returns false before initialization', () => {
    _resetBridgeForTest();
    expect(isBridgeActive()).toBe(false);
  });

  it('returns true after successful initialization', async () => {
    jest.clearAllMocks();
    clientCallCount = 0;
    subscriberHandlers.length = 0;
    _resetBridgeForTest();

    const vs = makeMockVisualizationService();
    await initWsRedisBridge(vs);
    expect(isBridgeActive()).toBe(true);
  });
});
