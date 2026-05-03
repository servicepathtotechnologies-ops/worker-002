import { URL } from 'url';
import type { RuntimeExecutionContext, RuntimeRequest } from './types';
import { ConnectionService, connectionService } from './connection-service';
import { getCredentialType } from './credential-type-registry';

function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (_, key: string, fallback: string) => {
    const value = values[key.trim()];
    return value === undefined || value === null || value === '' ? (fallback || '') : String(value);
  });
}

function expiresSoon(expiresAt: string | null, refreshBeforeSeconds: number): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() <= refreshBeforeSeconds * 1000;
}

export class AuthInjectionEngine {
  constructor(private readonly connections: ConnectionService = connectionService) {}

  async injectIntoRequest(context: RuntimeExecutionContext, request: RuntimeRequest): Promise<RuntimeRequest> {
    const connection = await this.connections.getDecryptedConnection(context.userId, context.connectionId);
    const definition = getCredentialType(connection.credentialTypeId);
    if (!definition) throw new Error(`Unknown credential type: ${connection.credentialTypeId}`);

    const readyConnection = definition.authType === 'oauth2' && definition.refresh?.enabled && expiresSoon(connection.expiresAt, definition.refresh.refreshBeforeSeconds)
      ? await this.refreshOAuthConnection(context.userId, connection.id)
      : connection;

    const headers = { ...(request.headers || {}) };
    const url = new URL(request.url);
    for (const [key, value] of Object.entries(request.query || {})) {
      url.searchParams.set(key, value);
    }

    for (const rule of definition.injection) {
      if (rule.target === 'header' && rule.name) {
        headers[renderTemplate(rule.name, readyConnection.credentials)] = renderTemplate(rule.valueTemplate, readyConnection.credentials);
      }
      if (rule.target === 'query' && rule.name) {
        url.searchParams.set(renderTemplate(rule.name, readyConnection.credentials), renderTemplate(rule.valueTemplate, readyConnection.credentials));
      }
      if (rule.target === 'basic_auth') {
        const raw = renderTemplate(rule.valueTemplate, readyConnection.credentials);
        headers.Authorization = `Basic ${Buffer.from(raw).toString('base64')}`;
      }
    }

    await this.connections.markUsed(context.userId, context.connectionId);
    return { ...request, url: url.toString(), headers };
  }

  async executeNodeRequest(context: RuntimeExecutionContext, request: RuntimeRequest): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }> {
    const injected = await this.injectIntoRequest(context, request);
    const response = await fetch(injected.url, {
      method: injected.method,
      headers: injected.headers,
      body: injected.body ? JSON.stringify(injected.body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    };
  }

  private async refreshOAuthConnection(userId: string, connectionId: string) {
    const { oauthService } = await import('./oauth-service');
    await oauthService.refreshConnection(userId, connectionId);
    return this.connections.getDecryptedConnection(userId, connectionId);
  }
}

export const authInjectionEngine = new AuthInjectionEngine();
