import { FacebookApiClient } from '../../shared/FacebookApi.client';
import { collectCursorPages } from '../../shared/Pagination.helper';
import { FacebookNodeParams } from '../../types/facebook.types';

export async function executePageListOperation(
  client: FacebookApiClient,
  params: FacebookNodeParams,
): Promise<{ data: Record<string, unknown>; pagination?: { next?: string; previous?: string; cursors?: { before?: string; after?: string } } }> {
  const limit = Math.min(Math.max(Number(params.limit || 25), 1), 500);
  const fields =
    typeof params.fields === 'string' && params.fields.trim().length > 0
      ? params.fields
      : 'id,name,category,fan_count,verification_status,access_token,perms';

  const result = await collectCursorPages<any>(
    async (after?: string) =>
      client.get('/me/accounts', {
        fields,
        limit,
        after: after || params.after,
      }),
    Boolean(params.returnAll),
  );

  return {
    data: {
      pages: result.items,
      count: result.items.length,
      summary: {
        managedPages: result.items.length,
      },
    },
    pagination: result.paging,
  };
}
