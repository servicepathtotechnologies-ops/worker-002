export interface NormalizedBinaryData {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export function detectMimeType(filename = ''): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  return 'application/octet-stream';
}

export function normalizeBase64Data(base64: string, filename = 'upload.bin'): NormalizedBinaryData {
  const normalized = base64.includes(',') ? base64.split(',')[1] : base64;
  const buffer = Buffer.from(normalized, 'base64');
  return {
    buffer,
    mimeType: detectMimeType(filename),
    filename,
  };
}
