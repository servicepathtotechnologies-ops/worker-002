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
  'connection_string',
  'username',
  'password',
  'generic_credential',
  'service_account_email',
  'email_address',
  'phone_number',
  'phone_number_id',
  'business_account_id',
  'cron_expression',
  'json_payload',
  'http_headers',
  'http_body',
  'query_params',
  'field_mapping',
  'case_list',
  'form_fields',
  'expression',
  'sql_query',
  'graphql_query',
  'search_query',
  'prompt_text',
  'code_snippet',
  'resource_select',
  'operation_select',
  'database_id',
  'workspace_id',
  'channel_id',
  'list_id',
  'folder_id',
  'file_path',
  'project_id',
  'dataset_id',
  'bucket_name',
  'region',
  'model_id',
  'timezone',
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
  'connection_string',
  'username',
  'password',
  'generic_credential',
]);

export interface FieldHelpMetadata {
  helpCategory: FieldHelpCategory;
  docsUrl?: string;
  exampleValue?: string;
}

function docsForNodeField(nodeType: string, category: FieldHelpCategory): string | undefined {
  const t = nodeType.toLowerCase();
  const providerDocs: Array<[RegExp, string]> = [
    [/activecampaign/, 'https://developers.activecampaign.com/reference/overview'],
    [/airtable/, 'https://airtable.com/developers/web/api/introduction'],
    [/anthropic|claude/, 'https://console.anthropic.com/settings/keys'],
    [/aws|amazon_ses|s3/, 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html'],
    [/bitbucket/, 'https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/'],
    [/clickup/, 'https://clickup.com/api'],
    [/discord/, 'https://discord.com/developers/docs/intro'],
    [/dropbox/, 'https://www.dropbox.com/developers/apps'],
    [/facebook|instagram|whatsapp|meta/, 'https://developers.facebook.com/'],
    [/freshdesk/, 'https://developers.freshdesk.com/api/'],
    [/github/, 'https://github.com/settings/tokens'],
    [/gitlab/, 'https://docs.gitlab.com/user/profile/personal_access_tokens/'],
    [/google_bigquery/, 'https://console.cloud.google.com/bigquery'],
    [/google|gmail|sheets|drive|calendar|firestore|gcs/, 'https://console.cloud.google.com/apis/credentials'],
    [/hubspot/, 'https://developers.hubspot.com/docs/api/private-apps'],
    [/intercom/, 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication'],
    [/jira/, 'https://id.atlassian.com/manage-profile/security/api-tokens'],
    [/jenkins/, 'https://www.jenkins.io/doc/book/system-administration/authenticating-scripted-clients/'],
    [/linkedin/, 'https://www.linkedin.com/developers/apps'],
    [/mailchimp/, 'https://mailchimp.com/developer/marketing/guides/quick-start/'],
    [/mailgun/, 'https://documentation.mailgun.com/docs/mailgun/user-manual/account-settings/api_keys/'],
    [/notion/, 'https://www.notion.so/my-integrations'],
    [/odoo/, 'https://www.odoo.com/documentation/17.0/developer/reference/external_api.html'],
    [/openai|gpt/, 'https://platform.openai.com/api-keys'],
    [/paypal/, 'https://developer.paypal.com/dashboard/applications/live'],
    [/pipedrive/, 'https://pipedrive.readme.io/docs/how-to-find-the-api-token'],
    [/salesforce/, 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm&type=5'],
    [/sendgrid/, 'https://app.sendgrid.com/settings/api_keys'],
    [/shopify/, 'https://admin.shopify.com/'],
    [/slack/, 'https://api.slack.com/apps'],
    [/stripe/, 'https://dashboard.stripe.com/apikeys'],
    [/db/, 'https://db.com/dashboard/project/_/settings/api'],
    [/telegram/, 'https://core.telegram.org/bots/features#botfather'],
    [/twilio/, 'https://console.twilio.com/'],
    [/twitter|x_/, 'https://developer.x.com/en/portal/dashboard'],
    [/typeform/, 'https://developer.typeform.com/get-started/personal-access-token/'],
    [/vercel/, 'https://vercel.com/account/tokens'],
    [/woocommerce/, 'https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication'],
    [/zoho/, 'https://api-console.zoho.com/'],
  ];

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
  if (category === 'project_id' && t.includes('google')) return 'https://console.cloud.google.com/';
  if (category === 'bucket_name' && (t.includes('s3') || t.includes('aws'))) return 'https://s3.console.aws.amazon.com/s3/buckets';
  if (category === 'bucket_name' && t.includes('google')) return 'https://console.cloud.google.com/storage/browser';
  if (category === 'database_id' && t.includes('notion')) return 'https://developers.notion.com/reference/database';
  if (category === 'phone_number_id' || category === 'business_account_id') return 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started';
  if (t.includes('facebook') || t.includes('instagram')) return 'https://developers.facebook.com';
  const matched = providerDocs.find(([pattern]) => pattern.test(t));
  if (matched && category !== 'none') return matched[1];
  return undefined;
}

function exampleForNodeField(nodeType: string, fieldName: string, category: FieldHelpCategory): string | undefined {
  const f = fieldName.toLowerCase();
  const t = nodeType.toLowerCase();
  switch (category) {
    case 'api_key':
      if (t.includes('openai')) return 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      if (t.includes('anthropic')) return 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx';
      if (t.includes('google') || t.includes('gemini')) return 'AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      if (t.includes('stripe')) return 'stripe_api_key_xxxxxxxxxxxxxxxxxxxxxxxx';
      return 'service_api_key_xxxxxxxxxxxxxxxxxxxxx';
    case 'oauth_token':
    case 'generic_token':
    case 'bearer_token':
      if (t.includes('slack')) return 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx';
      if (t.includes('github')) return 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      if (t.includes('facebook') || t.includes('instagram') || t.includes('whatsapp')) return 'EAAGxxxxxxxxxxxxxxxxxxxxxxxx';
      return 'token_xxxxxxxxxxxxxxxxxxxxx';
    case 'client_id':
      if (t.includes('google')) return '1234567890-abc.apps.googleusercontent.com';
      return 'client_id_xxxxxxxxxxxxxxxxxxxxx';
    case 'client_secret':
      if (t.includes('google')) return 'GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx';
      return 'client_secret_xxxxxxxxxxxxxxxxxxxxx';
    case 'connection_string':
      if (t.includes('postgres')) return 'postgresql://user:password@host:5432/database?sslmode=require';
      if (t.includes('mysql')) return 'mysql://user:password@host:3306/database';
      if (t.includes('mongo')) return 'mongodb+srv://user:password@cluster.example.mongodb.net/database';
      if (t.includes('redis')) return 'redis://default:password@host:6379';
      return 'protocol://username:password@host:port/database';
    case 'service_account_email':
      return 'workflow-service@project-id.iam.gserviceaccount.com';
    case 'spreadsheet_id':
      return '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    case 'document_id':
      return '1A2B3C4D5E6F7G8H9I0J';
    case 'sheet_name':
      return 'Sheet1';
    case 'database_id':
      return '307d872b-594c-80d2-b90d-003713fd0d7f';
    case 'workspace_id':
      return t.includes('slack') ? 'T0123456789' : 'workspace_123456';
    case 'channel_id':
      return t.includes('slack') ? 'C0123456789' : 'channel_123456';
    case 'list_id':
      return t.includes('mailchimp') ? 'a1b2c3d4e5' : 'list_123456';
    case 'folder_id':
      return '1a2B3cD4EfGhIjKlMnOp';
    case 'project_id':
      return t.includes('google') ? 'my-gcp-project-id' : 'project_123456';
    case 'dataset_id':
      return 'analytics_dataset';
    case 'bucket_name':
      return t.includes('s3') ? 'my-s3-bucket' : 'my-storage-bucket';
    case 'region':
      return t.includes('aws') ? 'us-east-1' : 'us-central1';
    case 'model_id':
      if (t.includes('openai') || t.includes('gpt')) return 'gpt-4o-mini';
      if (t.includes('anthropic') || t.includes('claude')) return 'claude-3-5-sonnet-latest';
      return 'provider-model-name';
    case 'phone_number':
      return '+14155552671';
    case 'phone_number_id':
      return '123456789012345';
    case 'business_account_id':
      return '123456789012345';
    case 'sql_query':
      return f.includes('soql') ? 'SELECT Id, Name, Email FROM Contact LIMIT 10' : 'SELECT * FROM users WHERE id = $1';
    case 'graphql_query':
      return 'query GetItem($id: ID!) { item(id: $id) { id name } }';
    case 'search_query':
      if (t.includes('gmail')) return 'is:unread newer_than:7d';
      return 'status:active';
    case 'http_headers':
      return '{ "Authorization": "Bearer {{$credentials.apiToken}}", "Content-Type": "application/json" }';
    case 'http_body':
      return '{ "name": "{{$json.name}}", "email": "{{$json.email}}" }';
    case 'query_params':
      return '{ "limit": 10, "status": "active" }';
    case 'field_mapping':
      return '{ "name": "{{$json.name}}", "email": "{{$json.email}}" }';
    case 'case_list':
      return '[{ "value": "new", "label": "New" }, { "value": "done", "label": "Done" }]';
    case 'form_fields':
      return '[{ "key": "email", "label": "Email", "type": "email", "required": true }]';
    case 'code_snippet':
      return 'return { ...$json, processed: true };';
    case 'timezone':
      return 'Asia/Kolkata';
    default:
      return undefined;
  }
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

  const pick = (helpCategory: FieldHelpCategory): FieldHelpMetadata => {
    const docsUrl = docsForNodeField(nt, helpCategory);
    const exampleValue = exampleForNodeField(nt, f, helpCategory);
    return {
      helpCategory,
      ...(docsUrl ? { docsUrl } : {}),
      ...(exampleValue ? { exampleValue } : {}),
    };
  };

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
  if (f === 'clientemail' || f === 'client_email' || f === 'serviceaccountemail' || f === 'service_account_email') return pick('service_account_email');
  if (f === 'publickey' || f === 'public_key') return pick('generic_credential');
  if (f === 'consumerkey' || f === 'consumer_key') return pick('consumer_key');
  if (f === 'consumersecret' || f === 'consumer_secret') return pick('consumer_secret');
  if (f === 'connectionstring' || f === 'connection_string' || f === 'databaseurl' || f === 'database_url') return pick('connection_string');
  if (f === 'username' && /(postgres|mysql|mongo|redis|database|ftp|sftp|jenkins|bitbucket|smtp|mail)/.test(nt)) return pick('username');
  if ((f === 'password' || f === 'apppassword' || f === 'app_password') && /(postgres|mysql|mongo|redis|database|ftp|sftp|jenkins|bitbucket|smtp|mail)/.test(nt)) return pick('password');

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
  if (f === 'databaseid' || f === 'database_id') return pick('database_id');
  if (f === 'sheetname' || f === 'sheet_name') return pick('sheet_name');
  if (f === 'calendarid' || f === 'calendar_id') return pick('calendar_id');
  if (f === 'tableid' || f === 'table_id') return pick('table_id');
  if (f === 'baseid' || f === 'base_id') return pick('base_id');
  if (f === 'workspaceid' || f === 'workspace_id' || f === 'teamid' || f === 'team_id') return pick('workspace_id');
  if (f === 'channelid' || f === 'channel_id') return pick('channel_id');
  if (f === 'listid' || f === 'list_id') return pick('list_id');
  if (f === 'folderid' || f === 'folder_id') return pick('folder_id');
  if (f === 'projectid' || f === 'project_id') return pick('project_id');
  if (f === 'datasetid' || f === 'dataset_id') return pick('dataset_id');
  if (f === 'bucket' || f === 'bucketname' || f === 'bucket_name') return pick('bucket_name');
  if (f === 'region' || f === 'awsregion' || f === 'aws_region') return pick('region');
  if (f === 'model' || f === 'modelid' || f === 'model_id') return pick('model_id');
  if (f.includes('pageid') || f.includes('page_id') || f.includes('page-token')) return pick('page_id');
  if (f.includes('phonenumberid') || f.includes('phone_number_id')) return pick('phone_number_id');
  if (f.includes('businessaccountid') || f.includes('business_account_id') || f.includes('wabaid') || f.includes('waba_id')) return pick('business_account_id');
  if (f.includes('accountid') || f.includes('account_id')) return pick('account_id');
  if (f.includes('shopdomain') || f.includes('shop_domain') || f.includes('shop url')) return pick('shop_domain');
  if (f.includes('filepath') || f.includes('file_path') || f === 'filename' || f === 'file_name' || f === 'remote_path' || f === 'remotepath') return pick('file_path');

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
  if (f.includes('password') && !f.includes('webhookurl')) return pick('password');
  if (f.includes('secret') && !f.includes('webhookurl')) return pick('generic_credential');

  if (f === 'cron' || f.includes('cron')) return pick('cron_expression');
  if (f === 'query' && /(postgres|mysql|bigquery|database|sql)/.test(nt)) return pick('sql_query');
  if (f === 'soql' || f === 'sosl' || f.includes('fetchxml')) return pick('sql_query');
  if (f === 'query' && nt.includes('graphql')) return pick('graphql_query');
  if (f === 'query' || f === 'searchquery' || f === 'search_query') return pick('search_query');
  if (f.includes('timezone') || f === 'tz') return pick('timezone');

  if (t === 'json' || t === 'object' || t === 'array') {
    if (f === 'headers' || f.includes('headers')) return pick('http_headers');
    if (f === 'body' || f === 'payload' || f === 'data' || f.includes('payload')) return pick('http_body');
    if (f === 'qs' || f.includes('queryparams') || f.includes('query_params') || f.includes('params')) return pick('query_params');
    if (f === 'fields' && nt === 'form') return pick('form_fields');
    if (f === 'fields' || f.includes('mapping') || f.includes('mergefields') || f.includes('merge_fields')) return pick('field_mapping');
    if (f.includes('case') || f.includes('rules')) return pick('case_list');
    if (f.includes('condition') || f.includes('expression') || f.includes('template')) return pick('expression');
    return pick('json_payload');
  }
  if (f.includes('expression') || f.includes('condition') && t === 'string') return pick('expression');
  if (f.includes('prompt') || (f.includes('system') && f.includes('prompt'))) return pick('prompt_text');
  if (f === 'code' || f === 'script' || f === 'javascript' || f.includes('codesnippet') || f.includes('code_snippet')) return pick('code_snippet');
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
