import { CredentialMissingScopeError } from './credential-errors';
import {
  normalizeProvider,
  requiredScopesForProvider,
  scopeSet,
  scopesCover,
} from './credential-scope-registry';
import { upsertUnifiedCredential } from './credential-resolver';

export interface OAuthCallbackTokenResponse {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string | null;
  refreshToken?: string | null;
  expires_in?: number | string | null;
  expires_at?: string | null;
  scope?: string | string[] | null;
  scopes?: string[] | null;
  token_type?: string | null;
  [key: string]: unknown;
}

export interface HandleOAuthCallbackInput {
  provider: string;
  userId: string;
  email?: string;
  tokenResponse: OAuthCallbackTokenResponse;
  source: string;
  requiredScopes?: string[];
}

function parseReturnedScopes(tokenResponse: OAuthCallbackTokenResponse, fallbackScopes: string[]): string[] {
  if (Array.isArray(tokenResponse.scopes)) return tokenResponse.scopes;
  if (Array.isArray(tokenResponse.scope)) return tokenResponse.scope;
  if (typeof tokenResponse.scope === 'string') {
    return tokenResponse.scope
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }
  return fallbackScopes;
}

function expiresAtFromToken(tokenResponse: OAuthCallbackTokenResponse): string | null {
  if (tokenResponse.expires_at) return tokenResponse.expires_at;
  if (tokenResponse.expires_in) {
    const seconds = Number(tokenResponse.expires_in);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  return null;
}

export async function handleOAuthCallback(input: HandleOAuthCallbackInput): Promise<{ credentialId: string; scopes: string[] }> {
  const provider = normalizeProvider(input.provider);
  const requiredScopes = requiredScopesForProvider(provider, input.requiredScopes);
  const returnedScopes = parseReturnedScopes(input.tokenResponse, requiredScopes);
  const accessToken = input.tokenResponse.access_token || input.tokenResponse.accessToken;
  const refreshToken = input.tokenResponse.refresh_token || input.tokenResponse.refreshToken || null;

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error(`${provider} connection failed: OAuth provider did not return an access token.`);
  }

  if (!scopesCover(returnedScopes, requiredScopes)) {
    throw new CredentialMissingScopeError(
      {
        userId: input.userId,
        provider,
        requiredScopes,
        resolverStep: 'oauth_scope_validation',
      },
      returnedScopes,
    );
  }

  const credentialId = await upsertUnifiedCredential({
    userId: input.userId,
    email: input.email,
    provider,
    scopes: returnedScopes.length > 0 ? returnedScopes : requiredScopes,
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
    expiresAt: expiresAtFromToken(input.tokenResponse),
    rawTokenBlob: {
      ...input.tokenResponse,
      normalized_scope_set: scopeSet(returnedScopes.length > 0 ? returnedScopes : requiredScopes),
    },
    source: input.source,
  });

  return { credentialId, scopes: returnedScopes.length > 0 ? returnedScopes : requiredScopes };
}

