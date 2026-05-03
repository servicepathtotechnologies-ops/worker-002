import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { mergeContextInputs } from './http-integration-utils';

function toBuffer(value: unknown): Buffer {
  const raw = String(value || '');
  if (!raw) return Buffer.alloc(0);
  if (raw.startsWith('data:')) {
    return Buffer.from(raw.split(',')[1] || '', 'base64');
  }
  return Buffer.from(raw, /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? 'base64' : 'utf8');
}

export function overrideSftp(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const operationOptions = ['upload', 'download', 'list'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));

  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
    },
    host: { ...def.inputSchema.host, required: true, role: 'config' as const },
    port: { type: 'number' as const, description: 'SFTP port', required: false, default: 22, role: 'config' as const, fillMode: manualStatic },
    username: {
      type: 'string' as const,
      description: 'SFTP username',
      required: true,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    password: {
      type: 'string' as const,
      description: 'SFTP password. Required unless privateKey is provided.',
      required: false,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    privateKey: {
      type: 'string' as const,
      description: 'SFTP SSH private key. Required unless password is provided.',
      required: false,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    passphrase: {
      type: 'string' as const,
      description: 'Passphrase for encrypted SSH private keys',
      required: false,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    path: { ...def.inputSchema.path, required: false, role: 'id' as const },
    fileData: {
      type: 'string' as const,
      description: 'File content for upload. Supports plain text, base64, or data URL payloads.',
      required: false,
      role: 'content' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true },
    },
  };

  return {
    ...def,
    inputSchema,
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'host', 'username'])),
    credentialSchema: {
      requirements: [{ provider: 'sftp', category: 'credential', required: true, description: 'SFTP password or SSH private key' }],
      credentialFields: ['username', 'password', 'privateKey', 'passphrase'],
    },
    execute: async (context) => {
      const inputs = mergeContextInputs(context);
      const operation = String(inputs.operation || 'list');
      const SftpClient = require('ssh2-sftp-client') as any;
      const client = new SftpClient();

      try {
        const host = String(inputs.host || '').trim();
        const username = String(inputs.username || '').trim();
        const password = String(inputs.password || '');
        const privateKey = String(inputs.privateKey || '');
        if (!host) throw new Error('host is required');
        if (!username) throw new Error('username is required');
        if (!password && !privateKey) throw new Error('password or privateKey is required');

        await client.connect({
          host,
          port: Number(inputs.port || 22),
          username,
          ...(password ? { password } : {}),
          ...(privateKey ? { privateKey, passphrase: inputs.passphrase || undefined } : {}),
        });

        const remotePath = String(inputs.path || '.');
        let output: any;
        if (operation === 'list') {
          output = await client.list(remotePath);
        } else if (operation === 'download') {
          if (!inputs.path) throw new Error('path is required for download');
          const payload = await client.get(remotePath);
          const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
          output = { path: remotePath, size: buffer.length, dataBase64: buffer.toString('base64') };
        } else if (operation === 'upload') {
          if (!inputs.path) throw new Error('path is required for upload');
          const buffer = toBuffer(inputs.fileData);
          if (buffer.length === 0) throw new Error('fileData is required for upload');
          await client.put(buffer, remotePath);
          output = { path: remotePath, size: buffer.length, uploaded: true };
        } else {
          throw new Error(`Unsupported SFTP operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'SFTP_FAILED', message: error?.message || 'SFTP operation failed' } };
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}
