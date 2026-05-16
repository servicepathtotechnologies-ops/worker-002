import { readAcknowledgedHttpResponse } from '../acknowledged-response';

function makeResponse(body: string | null, init: ResponseInit): Response {
  return new Response(body, init);
}

describe('readAcknowledgedHttpResponse', () => {
  it('treats 204 No Content as empty success', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse(null, { status: 204 }));

    expect(parsed.ok).toBe(true);
    expect(parsed.operationStatus).toBe('succeeded');
    expect(parsed.acknowledgementStatus).toBe('empty_success');
    expect(parsed.data).toBeNull();
  });

  it('treats 205 Reset Content as empty success', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse(null, { status: 205 }));

    expect(parsed.ok).toBe(true);
    expect(parsed.acknowledgementStatus).toBe('empty_success');
    expect(parsed.data).toBeNull();
  });

  it('treats an empty 200 as empty success', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    expect(parsed.ok).toBe(true);
    expect(parsed.acknowledgementStatus).toBe('empty_success');
    expect(parsed.data).toBeNull();
  });

  it('parses normal JSON bodies', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse('{"deleted":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    expect(parsed.acknowledgementStatus).toBe('parsed');
    expect(parsed.data).toEqual({ deleted: true });
  });

  it('classifies invalid JSON after 2xx as acknowledgement parse failure', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse('{bad-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    expect(parsed.ok).toBe(true);
    expect(parsed.operationStatus).toBe('unknown');
    expect(parsed.acknowledgementStatus).toBe('parse_failed');
    expect(parsed.rawText).toBe('{bad-json');
  });

  it('preserves useful provider error text for non-2xx responses', async () => {
    const parsed = await readAcknowledgedHttpResponse(makeResponse('{"error":{"message":"No permission"}}', {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }));

    expect(parsed.ok).toBe(false);
    expect(parsed.operationStatus).toBe('failed');
    expect(parsed.acknowledgementStatus).toBe('parsed');
    expect(parsed.data).toEqual({ error: { message: 'No permission' } });
  });
});
