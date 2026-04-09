import { FacebookNode } from '../../facebook-node';
import { FacebookApiClient } from '../shared/FacebookApi.client';

describe('FacebookNode integration scaffold', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes page.getAllPages successfully', async () => {
    jest.spyOn(FacebookApiClient.prototype, 'validateToken').mockResolvedValue(undefined);
    jest.spyOn(FacebookApiClient.prototype, 'get').mockResolvedValue({
      data: [{ id: '1', name: 'Page One' }],
      paging: { cursors: { after: 'abc' } },
    });

    const node = new FacebookNode('token-123');
    const result = await node.execute({
      resource: 'page',
      operation: 'getAllPages',
      returnAll: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.count).toBe(1);
    expect(result.error).toBeNull();
  });

  it('returns clear not implemented error for scaffolded operation', async () => {
    jest.spyOn(FacebookApiClient.prototype, 'validateToken').mockResolvedValue(undefined);

    const node = new FacebookNode('token-123');
    const result = await node.execute({
      resource: 'post',
      operation: 'createTextPost',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Not yet implemented');
  });
});
