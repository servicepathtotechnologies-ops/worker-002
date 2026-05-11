import crypto, { randomUUID } from 'crypto';
import { queryAsService } from '../core/database/db-pool';
import { connectionService } from './connection-service';
import { getCredentialType, getRedirectUri } from './credential-type-registry';
import type { CredentialTypeDefinition } from './types';
import { handleOAuthCallback } from '../services/oauth-callback-handler';

function base64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function oauthClient(definition: CredentialTypeDefinition): { clientId: string; clientSecret: string; redirectUri: string } {
  if (!definition.oauth2) throw new Error('Credential type is not OAuth2');
  const clientId = process.env[definition.oauth2.clientIdEnv];
  const clientSecret = process.env[definition.oauth2.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`OAuth provider ${definition.provider} is missing ${definition.oauth2.clientIdEnv}/${definition.oauth2.clientSecretEnv}`);
  }
  return { clientId, clientSecret, redirectUri: getRedirectUri(definition) };
}

export class OAuthService {
  async start(input: {
    userId: string;
    credentialTypeId: string;
    connectionId?: string;
    name?: string;
    scopes?: string[];
    returnTo?: string;
  }): Promise<{ authorizationUrl: string; state: string }> {
    const definition = getCredentialType(input.credentialTypeId);
    if (!definition?.oauth2) throw new Error(`OAuth2 credential type not found: ${input.credentialTypeId}`);
    if (input.connectionId) {
      const existing = await connectionService.getDecryptedConnection(input.userId, input.connectionId);
      if (existing.credentialTypeId !== definition.id) {
        const error = new Error('Connection does not match requested credential type') as Error & { statusCode?: number; code?: string };
        error.statusCode = 400;
        error.code = 'CONNECTION_TYPE_MISMATCH';
        throw error;
      }
    } else {
      const existing = await connectionService.findCanonicalConnection(input.userId, definition.id);
      if (existing) {
        const error = new Error('Already connected. Disconnect first to connect another account.') as Error & { statusCode?: number; code?: string };
        error.statusCode = 409;
        error.code = 'CONNECTION_ALREADY_EXISTS';
        throw error;
      }
    }
    const { clientId, redirectUri } = oauthClient(definition);
    const state = base64Url(24);
    const verifier = base64Url(48);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const scopes = input.scopes?.length ? input.scopes : definition.oauth2.defaultScopes;

    await queryAsService(
      `INSERT INTO oauth_states (
         id, user_id, provider, credential_type_id, connection_id, state_hash, code_verifier,
         redirect_uri, scopes, return_to, expires_at, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW() + INTERVAL '10 minutes', NOW())`,
      [
        randomUUID(),
        input.userId,
        definition.provider,
        definition.id,
        input.connectionId || null,
        crypto.createHash('sha256').update(state).digest('hex'),
        verifier,
        redirectUri,
        JSON.stringify(scopes),
        input.returnTo || null,
      ],
    );

    const url = new URL(definition.oauth2.authorizationUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    if (scopes.length) url.searchParams.set('scope', scopes.join(definition.oauth2.scopeSeparator || ' '));
    if (definition.oauth2.pkce !== false) {
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    if (definition.oauth2.accessType) url.searchParams.set('access_type', definition.oauth2.accessType);
    if (definition.oauth2.prompt) url.searchParams.set('prompt', definition.oauth2.prompt);
    for (const [key, value] of Object.entries(definition.oauth2.authParams || {})) {
      url.searchParams.set(key, value);
    }

    return { authorizationUrl: url.toString(), state };
  }

  async callback(input: { code: string; state: string }): Promise<{ connectionId: string; returnTo?: string | null }> {
    const stateHash = crypto.createHash('sha256').update(input.state).digest('hex');
    const rows = await queryAsService(
      `SELECT *
       FROM oauth_states
       WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [stateHash],
    );
    const state = rows[0];
    if (!state) throw new Error('Invalid or expired OAuth state');
    await queryAsService(`UPDATE oauth_states SET consumed_at = NOW() WHERE id = $1`, [state.id]);

    const definition = getCredentialType(state.credential_type_id);
    if (!definition?.oauth2) throw new Error('OAuth state references an unknown credential type');
    const token = await this.exchangeCode(definition, input.code, state.code_verifier, state.redirect_uri);
    const scopes = Array.isArray(state.scopes) ? state.scopes : JSON.parse(state.scopes || '[]');
    const result = await handleOAuthCallback({
      provider: definition.provider,
      userId: state.user_id,
      tokenResponse: { ...token, scopes },
      requiredScopes: definition.requiredScopes || definition.oauth2.defaultScopes,
      source: 'generic_oauth',
    });
    const connection = await this.persistConnectionFromCallback({
      userId: state.user_id,
      connectionId: state.connection_id,
      definition,
      token,
      scopes: result.scopes,
      unifiedCredentialId: result.credentialId,
    });

    return { connectionId: connection.id, returnTo: state.return_to };
  }

  async refreshConnection(userId: string, connectionId: string): Promise<void> {
    const connection = await connectionService.getDecryptedConnection(userId, connectionId);
    const definition = getCredentialType(connection.credentialTypeId);
    if (!definition?.oauth2) throw new Error('Connection is not OAuth2');
    const refreshToken = String(connection.credentials.refresh_token || '');
    if (!refreshToken) throw new Error('OAuth connection has no refresh token');

    const { clientId, clientSecret } = oauthClient(definition);
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetch(definition.oauth2.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`OAuth refresh failed: ${JSON.stringify(payload)}`);
    const expiresAt = typeof payload.expires_in === 'number'
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : connection.expiresAt;
    await connectionService.updateConnection(userId, connectionId, {
      credentials: { ...connection.credentials, ...this.normalizeTokenPayload(payload), refresh_token: payload.refresh_token || refreshToken },
      status: 'active',
      expiresAt,
      metadata: { ...connection.metadata, refreshedAt: new Date().toISOString() },
    });
  }

  private async exchangeCode(definition: CredentialTypeDefinition, code: string, verifier: string, redirectUri: string): Promise<Record<string, unknown>> {
    const { clientId, clientSecret } = oauthClient(definition);
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });
    if (definition.oauth2?.pkce !== false) {
      params.set('code_verifier', verifier);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (definition.oauth2?.tokenAuthMethod === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    } else {
      params.set('client_secret', clientSecret);
    }

    const response = await fetch(definition.oauth2!.tokenUrl, { method: 'POST', headers, body: params });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`OAuth token exchange failed: ${JSON.stringify(payload)}`);
    return payload;
  }

  private normalizeTokenPayload(payload: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries({
        ...payload,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        token_type: payload.token_type || 'Bearer',
        obtained_at: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined),
    );
  }

  private expiresAtFromToken(payload: Record<string, unknown>): string | null {
    if (typeof payload.expires_at === 'string') return payload.expires_at;
    const seconds = Number(payload.expires_in);
    return Number.isFinite(seconds) && seconds > 0
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : null;
  }

  private extractExternalAccount(payload: Record<string, unknown>): { id?: string; email?: string } {
    const explicitId = payload.account_id || payload.user_id || payload.sub;
    const explicitEmail = payload.email;
    if (typeof explicitId === 'string' || typeof explicitEmail === 'string') {
      return {
        id: typeof explicitId === 'string' ? explicitId : undefined,
        email: typeof explicitEmail === 'string' ? explicitEmail : undefined,
      };
    }

    const idToken = typeof payload.id_token === 'string' ? payload.id_token : '';
    const parts = idToken.split('.');
    if (parts.length < 2) return {};
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
      return {
        id: typeof claims.sub === 'string' ? claims.sub : undefined,
        email: typeof claims.email === 'string' ? claims.email : undefined,
      };
    } catch {
      return {};
    }
  }

  private async persistConnectionFromCallback(input: {
    userId: string;
    connectionId?: string | null;
    definition: CredentialTypeDefinition;
    token: Record<string, unknown>;
    scopes: string[];
    unifiedCredentialId: string;
  }) {
    const credentials = this.normalizeTokenPayload(input.token);
    const expiresAt = this.expiresAtFromToken(input.token);
    const external = this.extractExternalAccount(input.token);
    const metadata = {
      oauth: {
        scopes: input.scopes,
        unifiedCredentialId: input.unifiedCredentialId,
        connectedAt: new Date().toISOString(),
      },
    };

    if (input.connectionId) {
      const existing = await connectionService.getDecryptedConnection(input.userId, input.connectionId);
      if (existing.credentialTypeId !== input.definition.id) {
        const error = new Error('OAuth state does not match the target connection') as Error & { statusCode?: number; code?: string };
        error.statusCode = 400;
        error.code = 'CONNECTION_TYPE_MISMATCH';
        throw error;
      }
      return connectionService.updateConnection(input.userId, input.connectionId, {
        credentials,
        status: 'active',
        expiresAt,
        metadata: { ...existing.metadata, ...metadata },
        externalAccountId: external.id,
        externalAccountEmail: external.email,
      });
    }

    const existing = await connectionService.findCanonicalConnection(input.userId, input.definition.id);
    if (existing) {
      return connectionService.updateConnection(input.userId, existing.id, {
        credentials,
        status: 'active',
        expiresAt,
        metadata: { ...existing.metadata, ...metadata },
        externalAccountId: external.id,
        externalAccountEmail: external.email,
      });
    }

    return connectionService.createConnection({
      userId: input.userId,
      name: `${input.definition.displayName} Connection`,
      credentialTypeId: input.definition.id,
      credentials,
      expiresAt,
      metadata,
    });
  }
}

export const oauthService = new OAuthService();
