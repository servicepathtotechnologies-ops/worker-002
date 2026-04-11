import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta on inbound webhook requests.
 *
 * @param appSecret - The Facebook App Secret (`FACEBOOK_APP_SECRET`)
 * @param rawBody   - The raw request body as a Buffer (must not be parsed/modified)
 * @param signatureHeader - The value of the `X-Hub-Signature-256` header (format: `sha256=<hex>`)
 * @returns `true` if the signature is valid, `false` otherwise
 *
 * Requirements: 7.5, 13.6
 */
export function verifyMetaWebhookSignature(
  appSecret: string,
  rawBody: Buffer,
  signatureHeader: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice('sha256='.length);

  // Hex strings must be non-empty and even-length to be valid
  if (!receivedHex || receivedHex.length % 2 !== 0) {
    return false;
  }

  let receivedBuffer: Buffer;
  try {
    receivedBuffer = Buffer.from(receivedHex, 'hex');
  } catch {
    return false;
  }

  // A zero-length decoded buffer means the hex was invalid
  if (receivedBuffer.length === 0) {
    return false;
  }

  const expectedHmac = createHmac('sha256', appSecret).update(rawBody).digest();

  // Buffers must be the same length for timingSafeEqual
  if (expectedHmac.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedHmac, receivedBuffer);
}
