export interface CredentialErrorContext {
  userId: string;
  provider: string;
  requiredScopes: string[];
  action?: string;
  resolverStep?: string;
  causeMessage?: string;
}

export class CredentialError extends Error {
  readonly code: string;
  readonly context: CredentialErrorContext;

  constructor(code: string, message: string, context: CredentialErrorContext) {
    super(message);
    this.name = code;
    this.code = code;
    this.context = context;
  }

  toJSON() {
    return {
      error: this.code,
      provider: this.context.provider,
      requiredScopes: this.context.requiredScopes,
      userId: this.context.userId,
      action: this.context.action,
      resolverStep: this.context.resolverStep,
      fix: credentialFixMessage(this.context.provider, this.context.requiredScopes),
    };
  }
}

export class CredentialNotFoundError extends CredentialError {
  constructor(context: CredentialErrorContext) {
    super(
      'CredentialNotFound',
      `${context.provider} credential not found for required scopes: ${context.requiredScopes.join(', ') || 'default'}`,
      context,
    );
  }
}

export class CredentialMissingScopeError extends CredentialError {
  readonly availableScopes: string[];

  constructor(context: CredentialErrorContext, availableScopes: string[]) {
    super(
      'CredentialMissingScope',
      `${context.provider} credential is missing required scopes: ${context.requiredScopes.join(', ')}`,
      context,
    );
    this.availableScopes = availableScopes;
  }

  override toJSON() {
    return { ...super.toJSON(), availableScopes: this.availableScopes };
  }
}

export class CredentialExpiredError extends CredentialError {
  constructor(context: CredentialErrorContext) {
    super('CredentialExpired', `${context.provider} credential expired and could not be refreshed`, context);
  }
}

export class CredentialRefreshError extends CredentialError {
  constructor(context: CredentialErrorContext) {
    super('CredentialRefreshFailed', `${context.provider} credential refresh failed`, context);
  }
}

export class CredentialStorageError extends CredentialError {
  constructor(context: CredentialErrorContext) {
    super('CredentialStorageError', `${context.provider} credential storage failed`, context);
  }
}

export class CredentialUserIdError extends CredentialError {
  constructor(context: CredentialErrorContext) {
    super('CredentialUserIdError', `Could not normalize credential user id for ${context.userId}`, context);
  }
}

export function credentialFixMessage(provider: string, scopes: string[]): string {
  const scopeLabel = scopes.length > 0 ? ` and approve ${scopes.join(', ')}` : '';
  return `Reconnect your ${provider} account${scopeLabel}.`;
}

