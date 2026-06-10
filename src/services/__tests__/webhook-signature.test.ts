import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../webhook-signature';

describe('webhook-signature helpers', () => {
  it('generates 32-byte hex secrets', () => {
    const secret = generateWebhookSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs string and Buffer payloads with a stable sha256 HMAC prefix', () => {
    const expected = 'sha256=b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4';

    expect(signWebhookPayload('secret', 'payload')).toBe(expected);
    expect(signWebhookPayload('secret', Buffer.from('payload'))).toBe(expected);
  });

  it('accepts the first signature from an array header', () => {
    const payload = Buffer.from('{"event":"workflow.completed"}');
    const signature = signWebhookPayload('top-secret', payload);

    expect(
      verifyWebhookSignature({
        secret: 'top-secret',
        payload,
        signatureHeader: [signature, 'sha256=invalid'],
      }),
    ).toBe(true);
  });

  it('rejects missing, malformed, and mismatched signatures', () => {
    const payload = '{"event":"workflow.completed"}';
    const signature = signWebhookPayload('top-secret', payload);

    expect(verifyWebhookSignature({ secret: 'top-secret', payload })).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: 'top-secret',
        payload,
        signatureHeader: signature.replace('sha256=', 'sha1='),
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: 'top-secret',
        payload,
        signatureHeader: `${signature}00`,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: 'wrong-secret',
        payload,
        signatureHeader: signature,
      }),
    ).toBe(false);
  });
});
