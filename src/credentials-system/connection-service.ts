import { randomUUID } from 'crypto';
import { queryAsService } from '../core/database/db-pool';
import { decryptJson, encryptJson, maskSecrets } from './secret-crypto';
import { credentialTypeDefinitions, getCredentialType } from './credential-type-registry';
import type { ConnectionRecord, CredentialTypeDefinition, DecryptedConnection } from './types';

function mapConnection(row: any): ConnectionRecord {
  const storedStatus = row.status;
  const status = row.expires_at && new Date(row.expires_at).getTime() <= Date.now() && storedStatus === 'active'
    ? 'expired'
    : storedStatus;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    credentialTypeId: row.credential_type_id,
    provider: row.provider,
    authType: row.auth_type,
    status,
    metadata: row.metadata || {},
    expiresAt: row.expires_at,
    lastTestedAt: row.last_tested_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ConnectionService {
  listCredentialTypes(): CredentialTypeDefinition[] {
    return credentialTypeDefinitions.map((definition) => ({
      ...definition,
      inputFields: definition.inputFields.map((field) => ({ ...field })),
      guide: {
        ...definition.guide,
        prerequisites: [...definition.guide.prerequisites],
        steps: [...definition.guide.steps],
        securityNotes: [...definition.guide.securityNotes],
        fieldGuides: Object.fromEntries(
          Object.entries(definition.guide.fieldGuides).map(([name, guide]) => [
            name,
            { ...guide, notes: guide.notes ? [...guide.notes] : undefined },
          ]),
        ),
      },
    }));
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    await queryAsService(
      `UPDATE connections
       SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1
         AND status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`,
      [userId],
    );

    const rows = await queryAsService(
      `SELECT id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
              expires_at, last_tested_at, last_used_at, created_at, updated_at
       FROM connections
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(mapConnection);
  }

  async createConnection(input: {
    userId: string;
    name: string;
    credentialTypeId: string;
    credentials: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    expiresAt?: string | null;
  }): Promise<ConnectionRecord> {
    const definition = getCredentialType(input.credentialTypeId);
    if (!definition) throw new Error(`Unknown credential type: ${input.credentialTypeId}`);
    this.validateCredentials(definition, input.credentials);

    const id = randomUUID();
    const rows = await queryAsService(
      `INSERT INTO connections (
         id, user_id, name, credential_type_id, provider, auth_type, encrypted_credentials,
         status, metadata, expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb, $9, NOW(), NOW())
       RETURNING id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
                 expires_at, last_tested_at, last_used_at, created_at, updated_at`,
      [
        id,
        input.userId,
        input.name,
        definition.id,
        definition.provider,
        definition.authType,
        encryptJson(input.credentials),
        JSON.stringify(input.metadata || {}),
        input.expiresAt || null,
      ],
    );
    await this.audit(input.userId, id, 'connection.created', { credentialTypeId: definition.id });
    return mapConnection(rows[0]);
  }

  async updateConnection(userId: string, id: string, patch: {
    name?: string;
    credentials?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    status?: string;
    expiresAt?: string | null;
  }): Promise<ConnectionRecord> {
    const existing = await this.getDecryptedConnection(userId, id);
    const definition = getCredentialType(existing.credentialTypeId);
    if (!definition) throw new Error(`Unknown credential type: ${existing.credentialTypeId}`);
    const credentials = patch.credentials ? { ...existing.credentials, ...patch.credentials } : existing.credentials;
    this.validateCredentials(definition, credentials);

    const rows = await queryAsService(
      `UPDATE connections
       SET name = COALESCE($3, name),
           encrypted_credentials = $4,
           metadata = COALESCE($5::jsonb, metadata),
           status = COALESCE($6, status),
           expires_at = $7,
           updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
                 expires_at, last_tested_at, last_used_at, created_at, updated_at`,
      [
        userId,
        id,
        patch.name || null,
        encryptJson(credentials),
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        patch.status || null,
        patch.expiresAt === undefined ? existing.expiresAt : patch.expiresAt,
      ],
    );
    if (!rows[0]) throw new Error('Connection not found');
    await this.audit(userId, id, 'connection.updated', { fields: Object.keys(patch) });
    return mapConnection(rows[0]);
  }

  async deleteConnection(userId: string, id: string): Promise<void> {
    await queryAsService(`DELETE FROM connections WHERE user_id = $1 AND id = $2`, [userId, id]);
    await this.audit(userId, id, 'connection.deleted', {});
  }

  async getDecryptedConnection(userId: string, id: string): Promise<DecryptedConnection> {
    const rows = await queryAsService(
      `SELECT id, user_id, name, credential_type_id, provider, auth_type, encrypted_credentials, status,
              metadata, expires_at, last_tested_at, last_used_at, created_at, updated_at
       FROM connections
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, id],
    );
    if (!rows[0]) throw new Error('Connection not found');
    return { ...mapConnection(rows[0]), credentials: decryptJson(rows[0].encrypted_credentials) };
  }

  async markUsed(userId: string, id: string): Promise<void> {
    await queryAsService(`UPDATE connections SET last_used_at = NOW() WHERE user_id = $1 AND id = $2`, [userId, id]);
  }

  async testConnection(userId: string, id: string): Promise<{ ok: boolean; status: number; message: string }> {
    const connection = await this.getDecryptedConnection(userId, id);
    const definition = getCredentialType(connection.credentialTypeId);
    if (!definition?.testRequest) return { ok: true, status: 200, message: 'No test request configured' };

    const { AuthInjectionEngine } = await import('./execution-auth');
    const request = await new AuthInjectionEngine(this).injectIntoRequest(
      { userId, nodeId: 'connection-test', nodeType: 'connection-test', connectionId: id },
      {
        method: definition.testRequest.method,
        url: definition.testRequest.url,
        headers: definition.testRequest.headers,
        query: definition.testRequest.query,
        body: definition.testRequest.body,
      },
    );
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    const successStatuses = definition.testRequest.successStatus || [200, 201, 204];
    const ok = successStatuses.includes(response.status);
    await queryAsService(
      `UPDATE connections SET status = $3, last_tested_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND id = $2`,
      [userId, id, ok ? 'active' : 'error'],
    );
    await this.audit(userId, id, 'connection.tested', { ok, status: response.status });
    return { ok, status: response.status, message: ok ? 'Connection test succeeded' : 'Connection test failed' };
  }

  mask(connection: DecryptedConnection): ConnectionRecord & { credentials: unknown } {
    return { ...connection, credentials: maskSecrets(connection.credentials) };
  }

  private validateCredentials(definition: CredentialTypeDefinition, credentials: Record<string, unknown>): void {
    for (const field of definition.validation.requiredFields) {
      if (credentials[field] === undefined || credentials[field] === null || credentials[field] === '') {
        throw new Error(`${field} is required`);
      }
    }

    for (const group of definition.validation.mutuallyExclusiveFields || []) {
      const present = group.filter((field) => credentials[field]);
      if (present.length > 1) throw new Error(`${present.join(', ')} are mutually exclusive`);
    }
  }

  private async audit(userId: string, connectionId: string, action: string, details: Record<string, unknown>): Promise<void> {
    await queryAsService(
      `INSERT INTO workflow_execution_logs (
         id, workflow_id, execution_id, correlation_id, node_id, node_name, event, level, metadata, created_at
       )
       VALUES ($1, 'credentials', $2, $2, $3, 'Credential System', $4, 'info', $5::jsonb, NOW())`,
      [randomUUID(), connectionId, userId, action, JSON.stringify({ connectionId, userId, ...details })],
    ).catch(() => {});
  }
}

export const connectionService = new ConnectionService();
