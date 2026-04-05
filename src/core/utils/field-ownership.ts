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
  // webhook_url is intentionally NOT here — incoming webhook URLs (Slack, Discord, etc.)
  // are configuration values the user provides, not secrets. They appear inline with
  // other node config fields on the unified configuration page.
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

  // URL-type categories are config values, not secrets — always return 'value'
  // This guard takes priority over STRICT_CREDENTIAL_CATEGORIES to prevent future regressions
  const URL_CONFIG_CATEGORIES = new Set(['webhook_url', 'base_url', 'api_endpoint', 'callback_url', 'redirect_url']);
  if (helpCategory && URL_CONFIG_CATEGORIES.has(helpCategory)) return 'value';

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
