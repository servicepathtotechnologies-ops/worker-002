import type { FieldHelpCategory } from './field-help-metadata';
import type { FieldOwnershipClass, NodeInputField } from '../types/unified-node-contract';

const STRICT_CREDENTIAL_CATEGORIES = new Set<FieldHelpCategory>([
  'api_key',
  'oauth_token',
  'refresh_token',
  'client_id',
  'client_secret',
  'generic_token',
  'credential_id',
  'bearer_token',
  'webhook_secret',
  /** Incoming webhooks (Slack, Discord, etc.) — vault/attach-credentials, not normal config. */
  'webhook_url',
  'smtp_password',
  'db_password',
  'private_key',
  'consumer_key',
  'consumer_secret',
  'generic_credential',
]);

export function classifyFieldOwnership(
  fieldName: string,
  field: Pick<NodeInputField, 'fillMode' | 'role' | 'helpCategory'>
): FieldOwnershipClass {
  const helpCategory = field.helpCategory;
  if (helpCategory && STRICT_CREDENTIAL_CATEGORIES.has(helpCategory)) {
    return 'credential';
  }

  const role = field.role;
  if (role === 'raw_json' || role === 'config') {
    return 'structural';
  }
  if (field.fillMode?.supportsRuntimeAI === false) {
    return 'structural';
  }

  const f = (fieldName || '').toLowerCase();
  if (
    f === 'fields' ||
    f === 'expression' ||
    f.includes('condition') ||
    f.includes('case') ||
    f.includes('schema') ||
    f.includes('layout') ||
    f.includes('template')
  ) {
    return 'structural';
  }

  return 'value';
}

export function isStructuralOwnership(
  fieldName: string,
  field: Pick<NodeInputField, 'ownership' | 'fillMode' | 'role' | 'helpCategory'>
): boolean {
  return (field.ownership ?? classifyFieldOwnership(fieldName, field)) === 'structural';
}

export function isCredentialOwnership(
  fieldName: string,
  field: Pick<NodeInputField, 'ownership' | 'fillMode' | 'role' | 'helpCategory'>
): boolean {
  return (field.ownership ?? classifyFieldOwnership(fieldName, field)) === 'credential';
}
