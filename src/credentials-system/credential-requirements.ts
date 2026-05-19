import type { NodeCredentialRequirement, NodeCredentialSchema } from '../core/types/unified-node-contract';
import { credentialTypeDefinitions, getCredentialType } from './credential-type-registry';
import type { CredentialTypeDefinition } from './types';

type CredentialCategory =
  | 'oauth'
  | 'api_key'
  | 'token'
  | 'bearer_token'
  | 'basic_auth'
  | 'webhook'
  | 'database'
  | 'credential'
  | string;

function unique(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)));
}

function normalizeProvider(provider?: string): string {
  return String(provider || '').trim().toLowerCase();
}

function categoryMatches(definition: CredentialTypeDefinition, category: CredentialCategory): boolean {
  const normalized = String(category || '').toLowerCase();
  const id = definition.id.toLowerCase();
  const authType = definition.authType;

  if (normalized === 'oauth' || normalized === 'oauth2') return authType === 'oauth2';
  if (normalized === 'basic_auth' || normalized === 'basic') return authType === 'basic_auth';
  if (normalized === 'bearer_token' || normalized === 'token') return authType === 'bearer_token' || id.includes('token') || id.includes('pat');
  if (normalized === 'webhook') return id.includes('webhook') || id.includes('incoming') || id.includes('url');
  if (normalized === 'database') return id.includes('connection') || ['basic_auth', 'api_key'].includes(authType);
  if (normalized === 'api_key' || normalized === 'apikey' || normalized === 'key') {
    return (
      authType === 'api_key' ||
      authType === 'bearer_token' ||
      authType === 'query_auth' ||
      authType === 'custom_header' ||
      id.includes('api_key') ||
      id.includes('_key')
    );
  }

  return id.includes(normalized.replace(/\s+/g, '_'));
}

function scoreDefinition(definition: CredentialTypeDefinition, requirement: NodeCredentialRequirement): number {
  const provider = normalizeProvider(requirement.provider);
  const category = String(requirement.category || '').toLowerCase();
  const description = String(requirement.description || '').toLowerCase();
  const describesOAuth = /\boauth2?\b/.test(description) && !description.includes('alternative to oauth');
  const describesPersonalAccessToken = /(personal access token|\bpat\b)/.test(description);
  const describesBasicAuth = /(basic auth|username|password|login)/.test(description);
  const describesHeaderToken = /(csrf|header|signature verification|secret token)/.test(description);
  const describesClientCredentials = /(client id|client secret)/.test(description);
  let score = 0;

  if (definition.provider === provider) score += 100;
  if (definition.id === requirement.credentialTypeId) score += 1000;
  if (requirement.authType && definition.authType === requirement.authType) score += 50;
  if (categoryMatches(definition, category)) score += 25;
  if (describesOAuth) score += definition.authType === 'oauth2' ? 60 : -30;
  if (describesPersonalAccessToken) score += definition.authType !== 'oauth2' ? 60 : -30;
  if (describesBasicAuth) score += definition.authType === 'basic_auth' ? 55 : -20;
  if (describesHeaderToken) score += definition.authType === 'custom_header' ? 60 : -10;
  if (describesClientCredentials) score += definition.id.includes('client_credentials') ? 80 : 0;
  if (category === 'credential') {
    if (description.includes('oauth') && definition.authType === 'oauth2') score += 25;
    if (/(api key|access token|secret key|secret|token|pat|bearer)/.test(description) && definition.authType !== 'oauth2') score += 25;
    if (/(database|postgres|mysql|server|host)/.test(description) && definition.id.includes('connection')) score += 25;
  }
  if (definition.id === `${provider}_${category}`) score += 40;
  if (definition.id === `${provider}_${category.replace('oauth', 'oauth2')}`) score += 40;
  if (definition.id === `${provider}_api_key` && (category === 'api_key' || category === 'apikey')) score += 40;
  if (definition.id === `${provider}_oauth2` && (category === 'oauth' || category === 'oauth2')) score += 40;

  return score;
}

function fallbackCredentialTypeIds(requirement: NodeCredentialRequirement): string[] {
  const provider = normalizeProvider(requirement.provider);
  const category = String(requirement.category || '').toLowerCase();
  const description = String(requirement.description || '').toLowerCase();

  const basicProviders = new Set([
    'odoo',
    'jenkins',
    'oracle_database',
    'sql_server',
    'timescaledb',
    'wordpress',
  ]);
  const apiKeyProviders = new Set([
    'google_cloud_storage',
    'schedulewise',
    'chargebee',
    'langchain',
  ]);
  const bearerProviders = new Set([
    'vercel',
    'contentful',
    'netlify',
  ]);

  if (provider === 'webhook') return ['custom_header'];
  if (provider === 'oauth2') return ['basic_auth'];
  if (provider === 'sap') {
    if (description.includes('csrf')) return ['custom_header'];
    if (description.includes('basic') || description.includes('password')) return ['basic_auth'];
    return ['bearer_token'];
  }
  if (provider === 'intuit') {
    if (category === 'token' || description.includes('oauth') || description.includes('access token')) return ['bearer_token'];
    return ['api_key'];
  }
  if (provider === 'workday') {
    if (description.includes('basic') || description.includes('password')) return ['basic_auth'];
    return ['bearer_token'];
  }
  if (basicProviders.has(provider)) return ['basic_auth'];
  if (apiKeyProviders.has(provider)) return ['api_key'];
  if (bearerProviders.has(provider)) return ['bearer_token'];

  if (category === 'token' || category === 'bearer_token') return ['bearer_token'];
  if (category === 'basic_auth') return ['basic_auth'];
  if (category === 'webhook') return ['custom_header'];
  if (category === 'api_key') return ['api_key'];
  return [];
}

export function resolveCredentialTypeIds(requirement: NodeCredentialRequirement): string[] {
  const explicit = unique([
    requirement.credentialTypeId,
    ...(requirement.credentialTypeIds || []),
  ]);
  if (explicit.length > 0) return explicit.filter((id) => !!getCredentialType(id));

  const provider = normalizeProvider(requirement.provider);
  const providerDefinitions = credentialTypeDefinitions.filter((definition) => definition.provider === provider);
  if (providerDefinitions.length === 0) {
    return fallbackCredentialTypeIds(requirement).filter((id) => !!getCredentialType(id));
  }

  const scored = providerDefinitions
    .map((definition) => ({ definition, score: scoreDefinition(definition, requirement) }))
    .filter(({ score }) => score >= 125)
    .sort((a, b) => b.score - a.score || a.definition.id.localeCompare(b.definition.id));

  if (scored.length > 0) return scored.map(({ definition }) => definition.id);

  const fallbackIds = fallbackCredentialTypeIds(requirement).filter((id) => !!getCredentialType(id));
  if (fallbackIds.length > 0) return fallbackIds;

  return providerDefinitions.length === 1 ? [providerDefinitions[0].id] : [];
}

export function enrichCredentialRequirement(requirement: NodeCredentialRequirement): NodeCredentialRequirement {
  const credentialTypeIds = resolveCredentialTypeIds(requirement);
  const primaryDefinition = credentialTypeIds.length > 0 ? getCredentialType(credentialTypeIds[0]) : undefined;

  return {
    ...requirement,
    credentialTypeId: requirement.credentialTypeId || credentialTypeIds[0],
    credentialTypeIds,
    authType: requirement.authType || primaryDefinition?.authType,
    label: requirement.label || primaryDefinition?.displayName || `${requirement.provider} connection`,
    testable: requirement.testable ?? Boolean(primaryDefinition?.testRequest),
    requiredScopes: requirement.requiredScopes || requirement.scopes || primaryDefinition?.requiredScopes,
  };
}

export function enrichCredentialSchema(schema: NodeCredentialSchema | undefined): NodeCredentialSchema | undefined {
  if (!schema) return undefined;
  const enrichedRequirements = (schema.requirements || []).map(enrichCredentialRequirement);
  const providersWithExactTypes = new Set(
    enrichedRequirements
      .filter((requirement) => (requirement.credentialTypeIds || []).length > 0)
      .map((requirement) => requirement.provider),
  );

  return {
    ...schema,
    requirements: enrichedRequirements.filter((requirement) => {
      if ((requirement.credentialTypeIds || []).length > 0) return true;
      return !providersWithExactTypes.has(requirement.provider);
    }),
    credentialFields: schema.credentialFields ? Array.from(new Set(schema.credentialFields)) : schema.credentialFields,
  };
}
