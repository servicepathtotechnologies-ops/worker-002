import crypto from 'crypto';

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function signWebhookPayload(secret: string, payload: string | Buffer): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  payload: string | Buffer;
  signatureHeader?: string | string[];
}): boolean {
  const signature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;
  if (!signature || !signature.startsWith('sha256=')) return false;

  const expected = signWebhookPayload(input.secret, input.payload);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

