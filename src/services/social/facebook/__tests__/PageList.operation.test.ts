import { executePageListOperation } from '../actions/page/PageList.operation';
import { FacebookApiClient } from '../shared/FacebookApi.client';

describe('PageList.operation', () => {
  it('returns paginated pages and summary', async () => {
    const client = {
      get: jest.fn().mockResolvedValue({
        data: [{ id: '1', name: 'Page One' }],
        paging: { cursors: { after: 'abc' } },
      }),
    } as unknown as FacebookApiClient;

    const result = await executePageListOperation(client, {
      resource: 'page',
      operation: 'getAllPages',
      limit: 25,
    });

    expect(result.data.count).toBe(1);
    expect((result.data.pages as any[])[0].name).toBe('Page One');
    expect(client.get).toHaveBeenCalledWith('/me/accounts', expect.objectContaining({ limit: 25 }));
  });
});
