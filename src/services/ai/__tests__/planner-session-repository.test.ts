import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const redisStore = new Map<string, string>();
const mockRedis = {
  on: jest.fn(),
  connect: jest.fn(async () => undefined),
  setEx: jest.fn(async (key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
  }),
  get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis),
}));

describe('planner session repository', () => {
  beforeEach(() => {
    redisStore.clear();
    mockRedis.on.mockClear();
    mockRedis.connect.mockClear();
    mockRedis.setEx.mockClear();
    mockRedis.get.mockClear();
  });

  it('persists and restores stage artifacts with versioned state', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const repo = await import('../planner-session-repository');

    await repo.upsertPlannerSession({
      id: 'session_1',
      stage: 'analyze',
      status: 'pending',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: { prompt: 'build approval workflow', stageArtifact: { summary: 'v1' } },
    });

    const restored = await repo.getPlannerSession<{ prompt: string; stageArtifact: { summary: string } }>('session_1');
    expect(restored).not.toBeNull();
    expect(restored?.version).toBe(1);
    expect(restored?.artifacts.stageArtifact.summary).toBe('v1');
  });
});

