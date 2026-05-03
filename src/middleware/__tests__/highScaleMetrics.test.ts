import { routeLabel, setKafkaQueueDepth } from '../highScaleMetrics';

describe('highScaleMetrics', () => {
  it('uses the Express route path when available', () => {
    const req = { baseUrl: '/api', route: { path: '/items/:id' }, path: '/api/items/123' } as any;
    expect(routeLabel(req)).toBe('/api/items/:id');
  });

  it('updates queue depth without throwing', () => {
    expect(() => setKafkaQueueDepth(12)).not.toThrow();
  });
});
