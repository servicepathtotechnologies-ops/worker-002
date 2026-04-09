interface PagingCursor {
  before?: string;
  after?: string;
}

interface PagingMeta {
  next?: string;
  previous?: string;
  cursors?: PagingCursor;
}

export interface PaginationResult<T> {
  items: T[];
  paging?: PagingMeta;
}

export async function collectCursorPages<T>(
  fetchPage: (after?: string) => Promise<{ data: T[]; paging?: PagingMeta }>,
  returnAll = false,
): Promise<PaginationResult<T>> {
  const first = await fetchPage();
  if (!returnAll) {
    return { items: first.data || [], paging: first.paging };
  }

  const items: T[] = [...(first.data || [])];
  let after = first.paging?.cursors?.after;
  let paging = first.paging;

  while (after) {
    const page = await fetchPage(after);
    items.push(...(page.data || []));
    paging = page.paging;
    after = page.paging?.cursors?.after;
  }

  return { items, paging };
}
