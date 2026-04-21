/**
 * Canonical "how to get it" / credential guidance categories for node input fields.
 * Single inference used by UnifiedNodeRegistry and (serialized via API) the frontend guide UX.
 */

export const FIELD_HELP_CATEGORIES = [
  'api_key',
  'oauth_token',
  'refresh_token',
  'client_id',
  'client_secret',
  'generic_token',
  'credential_id',
  'bearer_token',
  'webhook_secret',
  'base_url',
  'api_endpoint',
  'webhook_url',
  'callback_url',
  'redirect_url',
  'spreadsheet_id',
  'document_id',
  'sheet_name',
  'calendar_id',
  'table_id',
  'base_id',
  'page_id',
  'account_id',
  'shop_domain',
  'smtp_host',
  'smtp_username',
  'smtp_password',
  'database_name',
  'host',
  'port',
  'db_password',
  'private_key',
  'consumer_key',
  'consumer_secret',
  'generic_credential',
  'email_address',
  'phone_number',
  'cron_expression',
  'json_payload',
  'expression',
  'prompt_text',
  'resource_select',
  'operation_select',
  'none',
] as const;

export type FieldHelpCategory = (typeof FIELD_HELP_CATEGORIES)[number];

/** Categories that should surface in credential-collection flows (wizard / preflight). */
export const CREDENTIAL_QUESTION_HELP_CATEGORIES: ReadonlySet<FieldHelpCategory> = new Set([
  'api_key',
  'oauth_token',
  'refresh_token',
  'client_id',
  'client_secret',
  'generic_token',
  'credential_id',
  'bearer_token',
  'webhook_secret',
  // webhook_url removed: incoming webhook URLs are config values shown inline, not vault secrets
  'smtp_password',
  'db_password',
  'private_key',
  'consumer_key',
  'consumer_secret',
  'generic_credential',
]);

export interface FieldHelpMetadata {
  helpCategory: FieldHelpCategory;
  docsUrl?: string;
  exampleValue?: string;
}

function docsForNodeField(nodeType: string, category: FieldHelpCategory): string | undefined {
  const t = nodeType.toLowerCase();
  if (category === 'api_key') {
    if (t.includes('openai') || t.includes('gpt')) return 'https://platform.openai.com/api-keys';
    if (t.includes('anthropic') || t.includes('claude')) return 'https://console.anthropic.com/settings/keys';
    if (t.includes('gemini') || t.includes('google_gemini')) return 'https://aistudio.google.com/apikey';
    if (t.includes('google_sheets') || t.includes('sheets')) return 'https://console.cloud.google.com/apis/credentials';
  }
  if (category === 'oauth_token' || category === 'credential_id') {
    if (t.includes('slack')) return 'https://api.slack.com/apps';
    if (t.includes('google')) return 'https://console.cloud.google.com/apis/credentials';
  }
  if (category === 'generic_token') {
    if (t.includes('vercel')) return 'https://vercel.com/account/tokens';
  }
  if (category === 'spreadsheet_id') return 'https://docs.google.com/spreadsheets';
  if (category === 'document_id' && t.includes('google_doc')) return 'https://docs.google.com/document';
  if (t.includes('shopify') && category === 'shop_domain') return 'https://admin.shopify.com';
  if (t.includes('facebook') || t.includes('instagram')) return 'https://developers.facebook.com';
  return undefined;
}

/**
 * Infer help metadata from node type and field name (registry-wide, no per-workflow state).
 */
export function inferFieldHelpMetadata(
  nodeType: string,
  fieldName: string,
  fieldType: string
): FieldHelpMetadata {
  const f = (fieldName || '').toLowerCase();
  const t = (fieldType || 'string').toLowerCase();
  const nt = (nodeType || '').toLowerCase();

  const pick = (helpCategory: FieldHelpCategory): FieldHelpMetadata => ({
    helpCategory,
    docsUrl: docsForNodeField(nt, helpCategory),
  });

  if (f === 'credentialid' || f === 'credential_id') return pick('credential_id');
  if (f === 'apikey' || f === 'api_key') return pick('api_key');
  if (f === 'accesstoken' || f === 'access_token') return pick('oauth_token');
  if (f === 'refreshtoken' || f === 'refresh_token') return pick('refresh_token');
  if (f === 'clientid' || f === 'client_id') return pick('client_id');
  if (f === 'clientsecret' || f === 'client_secret') return pick('client_secret');
  if (f === 'bottoken' || f === 'bot_token') return pick('generic_token');
  if (f === 'bearer' || f === 'bearertoken' || f === 'bearer_token') return pick('bearer_token');
  if (f.includes('secrettoken') || f.includes('secret_token')) return pick('webhook_secret');
  if (f === 'privatekey' || f === 'private_key') return pick('private_key');
  if (f === 'publickey' || f === 'public_key') return pick('generic_credential');
  if (f === 'consumerkey' || f === 'consumer_key') return pick('consumer_key');
  if (f === 'consumersecret' || f === 'consumer_secret') return pick('consumer_secret');

  if (f === 'webhookurl' || f === 'webhook_url') return pick('webhook_url');
  if (f === 'callbackurl' || f === 'callback_url') return pick('callback_url');
  if (f === 'redirecturl' || f === 'redirect_url') return pick('redirect_url');
  if (f === 'baseurl' || f === 'base_url') return pick('base_url');
  if (f === 'apiurl' || f === 'api_url' || (f.includes('endpoint') && !f.includes('client'))) return pick('api_endpoint');
  if (f.includes('url') && !f.includes('webhook') && !f.includes('callback') && !f.includes('redirect')) {
    return pick('api_endpoint');
  }

  if (f === 'spreadsheetid' || f === 'spreadsheet_id') return pick('spreadsheet_id');
  if (f === 'documentid' || f === 'document_id') return pick('document_id');
  if (f === 'sheetname' || f === 'sheet_name') return pick('sheet_name');
  if (f === 'calendarid' || f === 'calendar_id') return pick('calendar_id');
  if (f === 'tableid' || f === 'table_id') return pick('table_id');
  if (f === 'baseid' || f === 'base_id') return pick('base_id');
  if (f.includes('pageid') || f.includes('page_id') || f.includes('page-token')) return pick('page_id');
  if (f.includes('accountid') || f.includes('account_id')) return pick('account_id');
  if (f.includes('shopdomain') || f.includes('shop_domain') || f.includes('shop url')) return pick('shop_domain');

  if (f.includes('smtp') && f.includes('host')) return pick('smtp_host');
  if (f.includes('smtp') && (f.includes('user') || f.includes('username'))) return pick('smtp_username');
  if (f.includes('smtp') && f.includes('pass')) return pick('smtp_password');

  if ((f.includes('database') && f.includes('name')) || f === 'dbname' || f === 'db_name') return pick('database_name');
  if (f === 'host' || f === 'hostname' || f === 'server' || f === 'serverurl' || f === 'server_url') return pick('host');
  if (f === 'port') return pick('port');
  if (f.includes('password') && (f.includes('db') || f.includes('database') || nt.includes('postgres') || nt.includes('mysql') || nt.includes('mongo'))) {
    return pick('db_password');
  }

  if (f.includes('token') && !f.includes('message') && !f.includes('messagetype')) return pick('generic_token');
  if ((f.includes('secret') || f.includes('password')) && !f.includes('webhookurl')) return pick('generic_credential');

  if (f === 'cron' || f.includes('cron')) return pick('cron_expression');
  if (t === 'json' || t === 'object' || t === 'array') {
    if (f.includes('condition') || f.includes('expression') || f.includes('template')) return pick('expression');
    return pick('json_payload');
  }
  if (f.includes('expression') || f.includes('condition') && t === 'string') return pick('expression');
  if (f.includes('prompt') || (f.includes('system') && f.includes('prompt'))) return pick('prompt_text');
  if (f.includes('email') || f === 'to' || f === 'from' || f.includes('recipient')) return pick('email_address');
  if (f.includes('phone') || f.includes('tel')) return pick('phone_number');

  if (f === 'operation' || f === 'action' || f === 'method') return pick('operation_select');
  if (f === 'resource' || f === 'module' || f === 'object') return pick('resource_select');

  return { helpCategory: 'none' };
}

export function isCredentialQuestionCategory(category: FieldHelpCategory | undefined): boolean {
  if (!category || category === 'none') return false;
  return CREDENTIAL_QUESTION_HELP_CATEGORIES.has(category);
}
