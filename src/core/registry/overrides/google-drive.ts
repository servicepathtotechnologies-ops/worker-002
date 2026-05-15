import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { getGoogleTokenForContext, googleApiRequest, mergedInputs } from './google-workspace-utils';

export function overrideGoogleDrive(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const operationOptions = ['list', 'download', 'upload'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));
  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
    },
    fileData: {
      type: 'string' as const,
      description: 'File content for upload. Supports plain text, base64, or data URL payloads.',
      required: false,
      ownership: 'value' as const,
      role: 'content' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true },
    },
    mimeType: {
      type: 'string' as const,
      description: 'MIME type for uploaded file',
      required: false,
      default: 'application/octet-stream',
      ownership: 'value' as const,
      role: 'config' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false },
    },
    folderId: {
      type: 'string' as const,
      description: 'Optional parent folder ID for uploads/lists',
      required: false,
      ownership: 'value' as const,
      role: 'id' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false },
    },
  };

  return {
    ...def,
    inputSchema,
    credentialSchema: {
      requirements: [{ provider: 'google', category: 'oauth', required: true, description: 'Google OAuth with Drive scope' }],
      credentialFields: ['accessToken'],
    },
    execute: async (context) => {
      const inputs = mergedInputs(context);
      const operation = String(inputs.operation || 'list');
      try {
        const accessToken = await getGoogleTokenForContext(context, ['https://www.googleapis.com/auth/drive']);
        let output: any;
        if (operation === 'list') {
          const query = inputs.folderId ? `'${String(inputs.folderId).replace(/'/g, "\\'")}' in parents` : undefined;
          const params = new URLSearchParams({
            pageSize: String(inputs.pageSize || 100),
            fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
            ...(query ? { q: query } : {}),
          });
          output = await googleApiRequest(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);
        } else if (operation === 'download') {
          const fileId = String(inputs.fileId || '').trim();
          if (!fileId) throw new Error('fileId is required for download');
          output = await googleApiRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, accessToken);
        } else if (operation === 'upload') {
          const fileName = String(inputs.fileName || '').trim();
          if (!fileName) throw new Error('fileName is required for upload');
          const rawData = String(inputs.fileData || '');
          if (!rawData) throw new Error('fileData is required for upload');
          const mimeType = String(inputs.mimeType || 'application/octet-stream');
          const data = rawData.startsWith('data:')
            ? Buffer.from(rawData.split(',')[1] || '', 'base64')
            : Buffer.from(rawData, /^[A-Za-z0-9+/]+={0,2}$/.test(rawData) ? 'base64' : 'utf8');
          const boundary = `ctrlchecks_${Date.now()}`;
          const metadata: Record<string, any> = { name: fileName };
          if (inputs.folderId) metadata.parents = [String(inputs.folderId)];
          const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
            data,
            Buffer.from(`\r\n--${boundary}--`),
          ]);
          output = await googleApiRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink', accessToken, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body,
          });
        } else {
          throw new Error(`Unsupported Google Drive operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'GOOGLE_DRIVE_FAILED', message: error?.message || 'Google Drive operation failed' } };
      }
    },
  };
}
