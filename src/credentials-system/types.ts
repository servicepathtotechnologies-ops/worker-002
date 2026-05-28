export type AuthType =
  | 'oauth2'
  | 'api_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'custom_header'
  | 'query_auth';

export type ConnectionStatus = 'active' | 'expired' | 'error' | 'revoked';

export type CredentialFieldType = 'text' | 'password' | 'url' | 'number' | 'select' | 'textarea';

export interface CredentialFieldSchema {
  name: string;
  label: string;
  type: CredentialFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  helpText?: string;
  guide?: CredentialFieldGuide;
  secret?: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    url?: boolean;
  };
}

export interface CredentialFieldGuide {
  label: string;
  description: string;
  whereToFind: string;
  example?: string;
  notes?: string[];
}

export interface CredentialGuide {
  summary: string;
  prerequisites: string[];
  steps: string[];
  fieldGuides: Record<string, CredentialFieldGuide>;
  securityNotes: string[];
  docsUrl?: string;
  troubleshooting?: string[];
}

export interface CredentialTestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  successStatus?: number[];
}

export interface RuntimeInjectionRule {
  target: 'header' | 'query' | 'basic_auth';
  name?: string;
  valueTemplate: string;
}

export interface OAuth2ProviderConfig {
  provider: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  userInfoUrl?: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectUriEnv?: string;
  defaultScopes: string[];
  scopeSeparator?: string;
  accessType?: 'offline' | 'online';
  prompt?: string;
  authParams?: Record<string, string>;
  tokenAuthMethod?: 'client_secret_post' | 'basic';
  pkce?: boolean;
}

export interface CredentialTypeDefinition {
  id: string;
  provider: string;
  displayName: string;
  authType: AuthType;
  requiredScopes?: string[];
  inputFields: CredentialFieldSchema[];
  guide: CredentialGuide;
  form: {
    layout: 'stacked' | 'sections';
    submitLabel?: string;
    oauthButtonLabel?: string;
    testLabel?: string;
  };
  validation: {
    requiredFields: string[];
    mutuallyExclusiveFields?: string[][];
  };
  testRequest?: CredentialTestRequest;
  injection: RuntimeInjectionRule[];
  oauth2?: OAuth2ProviderConfig;
  refresh?: {
    enabled: boolean;
    refreshBeforeSeconds: number;
  };
  maskFields: string[];
}

export interface NodeOperationDefinition {
  id: string;
  displayName: string;
  resource: string;
  operation: string;
  method?: string;
  path?: string;
  inputFields: CredentialFieldSchema[];
  outputSchema: Record<string, unknown>;
}

export interface NodeDefinitionRecord {
  id: string;
  type: string;
  displayName: string;
  provider?: string;
  category: string;
  resources: string[];
  operations: NodeOperationDefinition[];
  inputFields: CredentialFieldSchema[];
  outputSchema: Record<string, unknown>;
  credentialRequirements: Array<{
    credentialTypeId: string;
    required: boolean;
    scopes?: string[];
  }>;
}

export interface ConnectionRecord {
  id: string;
  userId: string;
  name: string;
  credentialTypeId: string;
  provider: string;
  authType: AuthType;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  revokedAt?: string | null;
  replacedByConnectionId?: string | null;
  externalAccountId?: string | null;
  externalAccountEmail?: string | null;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedConnection extends ConnectionRecord {
  credentials: Record<string, unknown>;
}

export interface RuntimeRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface RuntimeExecutionContext {
  userId: string;
  workflowId?: string;
  nodeId: string;
  nodeType: string;
  connectionId: string;
}
