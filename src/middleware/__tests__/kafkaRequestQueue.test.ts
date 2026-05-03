import { buildQueuedWriteRequest, createKafkaClient } from '../kafkaRequestQueue';

describe('kafkaRequestQueue', () => {
  it('builds a queued write payload from an authenticated request', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/db/workflows',
      params: { table: 'workflows' },
      query: { filter_id: 'wf1' },
      body: { name: 'Demo' },
      user: { id: 'user-1', role: 'user' },
    } as any;

    const job = buildQueuedWriteRequest(req);
    expect(job.method).toBe('POST');
    expect(job.table).toBe('workflows');
    expect(job.user.id).toBe('user-1');
    expect(job.attempt).toBe(0);
  });

  it('creates a Kafka client from env brokers', () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    expect(createKafkaClient()).toBeDefined();
  });
});
