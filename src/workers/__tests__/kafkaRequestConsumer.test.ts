jest.mock('../../api/db-proxy', () => ({
  dbProxyDelete: jest.fn(),
  dbProxyPost: jest.fn(),
  dbProxyPut: jest.fn(),
  dbProxyUpsert: jest.fn(),
}));

import { publishRetryOrDeadLetter, retryBackoffMs } from '../kafkaRequestConsumer';

describe('kafkaRequestConsumer', () => {
  it('computes bounded exponential backoff', () => {
    expect(retryBackoffMs(0)).toBe(1000);
    expect(retryBackoffMs(2)).toBe(4000);
    expect(retryBackoffMs(10)).toBe(30000);
  });

  it('publishes failures to the dead-letter topic at max attempts', async () => {
    process.env.KAFKA_MAX_ATTEMPTS = '3';
    const producer = { send: jest.fn().mockResolvedValue(undefined) } as any;
    await publishRetryOrDeadLetter(producer, {
      id: 'job-1',
      method: 'POST',
      path: '/api/db/workflows',
      table: 'workflows',
      params: { table: 'workflows' },
      query: {},
      body: {},
      user: { id: 'user-1' },
      attempt: 2,
      createdAt: new Date().toISOString(),
    }, new Error('boom'));

    expect(producer.send).toHaveBeenCalledWith(expect.objectContaining({
      topic: 'request-queue-dlq',
    }));
  });
});
