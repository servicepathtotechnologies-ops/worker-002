import { randomUUID } from 'crypto';
import { queryAsService } from '../core/database/db-pool';
import { decryptJson, encryptJson, maskSecrets } from './secret-crypto';
import { credentialTypeDefinitions, getCredentialType } from './credential-type-registry';
import type { ConnectionRecord, CredentialTypeDefinition, DecryptedConnection } from './types';

export class ConnectionApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ConnectionApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

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
    revokedAt: row.revoked_at,
    replacedByConnectionId: row.replaced_by_connection_id,
    externalAccountId: row.external_account_id,
    externalAccountEmail: row.external_account_email,
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
         AND status <> 'revoked'
       ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(mapConnection);
  }

  async findCanonicalConnection(userId: string, credentialTypeId: string): Promise<ConnectionRecord | null> {
    const rows = await queryAsService(
      `SELECT id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
              expires_at, revoked_at, replaced_by_connection_id, external_account_id,
              external_account_email, last_tested_at, last_used_at, created_at, updated_at
       FROM connections
       WHERE user_id = $1
         AND credential_type_id = $2
         AND status <> 'revoked'
       ORDER BY
         CASE
           WHEN status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) THEN 0
           WHEN status = 'active' THEN 1
           WHEN status = 'error' THEN 2
           WHEN status = 'expired' THEN 3
           ELSE 4
         END,
         last_used_at DESC NULLS LAST,
         updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId, credentialTypeId],
    );
    return rows[0] ? mapConnection(rows[0]) : null;
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

    const existing = await this.findCanonicalConnection(input.userId, definition.id);
    if (existing) {
      throw new ConnectionApiError(
        409,
        'CONNECTION_ALREADY_EXISTS',
        'Already connected. Disconnect first to connect another account.',
      );
    }

    const id = randomUUID();
    const rows = await queryAsService(
      `INSERT INTO connections (
         id, user_id, name, credential_type_id, provider, auth_type, encrypted_credentials,
         status, metadata, expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb, $9, NOW(), NOW())
       RETURNING id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
                 expires_at, revoked_at, replaced_by_connection_id, external_account_id,
                 external_account_email, last_tested_at, last_used_at, created_at, updated_at`,
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
    externalAccountId?: string | null;
    externalAccountEmail?: string | null;
  }): Promise<ConnectionRecord> {
    const existing = await this.getDecryptedConnection(userId, id);
    if (existing.status === 'revoked') {
      throw new ConnectionApiError(410, 'CONNECTION_REVOKED', 'Connection has been disconnected.');
    }
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
           external_account_id = COALESCE($8, external_account_id),
           external_account_email = COALESCE($9, external_account_email),
           updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING id, user_id, name, credential_type_id, provider, auth_type, status, metadata,
                 expires_at, revoked_at, replaced_by_connection_id, external_account_id,
                 external_account_email, last_tested_at, last_used_at, created_at, updated_at`,
      [
        userId,
        id,
        patch.name || null,
        encryptJson(credentials),
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        patch.status || null,
        patch.expiresAt === undefined ? existing.expiresAt : patch.expiresAt,
        patch.externalAccountId || null,
        patch.externalAccountEmail || null,
      ],
    );
    if (!rows[0]) throw new Error('Connection not found');
    await this.audit(userId, id, 'connection.updated', { fields: Object.keys(patch) });
    return mapConnection(rows[0]);
  }

  async deleteConnection(userId: string, id: string): Promise<void> {
    // Fetch provider before deleting so we know what to clean up
    const rows = await queryAsService(
      `SELECT provider FROM connections WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, id],
    );
    const provider: string | undefined = rows[0]?.provider;

    await queryAsService(
      `DELETE FROM connections WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );

    if (provider) {
      await Promise.allSettled([
        // unified_credentials (primary credential store for new OAuth flow)
        queryAsService(
          `DELETE FROM unified_credentials WHERE user_id = $1 AND provider = $2`,
          [userId, provider],
        ),
        // credential_vault (used by workflow execution via credential-retriever)
        queryAsService(
          `DELETE FROM credential_vault WHERE user_id = $1 AND key = $2`,
          [userId, provider],
        ),
        // user_credentials (legacy key-value store)
        queryAsService(
          `DELETE FROM user_credentials WHERE user_id = $1 AND service = $2`,
          [userId, provider],
        ),
        // provider-specific legacy token tables
        ...this.legacyTokenCleanup(userId, provider),
      ]);
    }

    await this.audit(userId, id, 'connection.deleted', { provider });
  }

  private legacyTokenCleanup(userId: string, provider: string): Promise<unknown>[] {
    const noop = () => Promise.resolve();
    const del = (sql: string, params: unknown[]) =>
      queryAsService(sql, params).catch(noop);

    const cleanups: Promise<unknown>[] = [];

    if (provider === 'google') {
      cleanups.push(
        del(`DELETE FROM google_oauth_tokens WHERE user_id = $1`, [userId]),
        del(`DELETE FROM social_tokens WHERE user_id = $1 AND provider = 'google'`, [userId]),
      );
    }
    if (provider === 'linkedin') {
      cleanups.push(del(`DELETE FROM linkedin_oauth_tokens WHERE user_id = $1`, [userId]));
    }
    if (provider === 'notion') {
      cleanups.push(del(`DELETE FROM notion_oauth_tokens WHERE user_id = $1`, [userId]));
    }
    if (provider === 'twitter') {
      cleanups.push(del(`DELETE FROM twitter_oauth_tokens WHERE user_id = $1`, [userId]));
    }
    if (provider === 'instagram') {
      cleanups.push(
        del(`DELETE FROM instagram_oauth_tokens WHERE user_id = $1`, [userId]),
        del(`DELETE FROM facebook_oauth_tokens WHERE user_id = $1`, [userId]),
      );
    }
    if (provider === 'salesforce') {
      cleanups.push(del(`DELETE FROM salesforce_oauth_tokens WHERE user_id = $1`, [userId]));
    }
    if (provider === 'facebook') {
      cleanups.push(
        del(`DELETE FROM facebook_oauth_tokens WHERE user_id = $1`, [userId]),
        del(`DELETE FROM social_tokens WHERE user_id = $1 AND provider = 'facebook'`, [userId]),
      );
    }
    if (provider === 'whatsapp') {
      cleanups.push(
        del(`DELETE FROM whatsapp_oauth_tokens WHERE user_id = $1`, [userId]),
        del(`DELETE FROM facebook_oauth_tokens WHERE user_id = $1`, [userId]),
      );
    }
    if (provider === 'zoho') {
      cleanups.push(del(`DELETE FROM zoho_oauth_tokens WHERE user_id = $1`, [userId]));
    }

    return cleanups;
  }

  async getDecryptedConnection(userId: string, id: string): Promise<DecryptedConnection> {
    const rows = await queryAsService(
      `SELECT id, user_id, name, credential_type_id, provider, auth_type, encrypted_credentials, status,
              metadata, expires_at, revoked_at, replaced_by_connection_id, external_account_id,
              external_account_email, last_tested_at, last_used_at, created_at, updated_at
       FROM connections
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, id],
    );
    if (!rows[0]) throw new Error('Connection not found');
    const mapped = mapConnection(rows[0]);
    if (mapped.status === 'revoked') {
      throw new ConnectionApiError(410, 'CONNECTION_REVOKED', 'Connection has been disconnected.');
    }
    const connection = { ...mapped, credentials: decryptJson(rows[0].encrypted_credentials) };
    if (connection.status === 'revoked') {
      throw new ConnectionApiError(410, 'CONNECTION_REVOKED', 'Connection has been disconnected.');
    }
    return connection;
  }

  async markUsed(userId: string, id: string): Promise<void> {
    await queryAsService(`UPDATE connections SET last_used_at = NOW() WHERE user_id = $1 AND id = $2`, [userId, id]);
  }

  async testConnection(userId: string, id: string): Promise<{ ok: boolean; status: number; message: string }> {
    const connection = await this.getDecryptedConnection(userId, id);
    if (connection.status === 'expired') {
      throw new ConnectionApiError(409, 'CONNECTION_EXPIRED', 'Reconnect required.');
    }
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
