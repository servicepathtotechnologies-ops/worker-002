'use strict';
/**
 * Node documentation generator.
 *
 * Rewrites all .doc.ts files in ctrl_checks/src/docs-content/nodes/ with:
 *  - Correct per-operation field lists (visibleIf / requiredIf filtering)
 *  - Correct required flags derived from the NodeLibrary schema
 *  - Real output examples from node-content-overrides.ts
 *  - Service-specific credential setup steps from credential-steps.ts
 *  - Realistic usage scenarios from node-content-overrides.ts
 *
 * Usage (from worker/):
 *   node scripts/generate-node-docs.cjs
 */

// ── Bootstrap ts-node so we can require TypeScript files from worker/src ──────
require('ts-node/register');

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// ── Helper: load a TypeScript data file from ctrl_checks (ESM package) ────────
// Uses TypeScript's compiler API to transpile to CJS in memory, then evaluates.
function loadTsData(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports', 'module', 'require', '__dirname', '__filename', result.outputText);
  fn(mod.exports, mod, require, path.dirname(filePath), filePath);
  return mod.exports;
}

// ── Silence NodeLibrary startup logs ──────────────────────────────────────────
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;
console.log = () => {};
console.error = () => {};
console.warn = () => {};

const { nodeLibrary: nodeLib } = require('../src/services/nodes/node-library');
const { NODE_OUTPUT_SCHEMAS } = require('../src/core/types/node-output-types');

console.log = _origLog;
console.error = _origError;
console.warn = _origWarn;

// ── Load ctrl_checks data files ───────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_SRC = path.join(REPO_ROOT, 'ctrl_checks', 'src', 'docs-content');

const { nodeDocManifest } = loadTsData(path.join(DOCS_SRC, 'manifest.ts'));
const { nodeContentOverrides } = loadTsData(path.join(DOCS_SRC, 'node-content-overrides.ts'));
const { credentialSteps, getCredentialSteps } = loadTsData(path.join(DOCS_SRC, 'credential-steps.ts'));

// Load per-node field content bible (node+operation+field specific helpText)
let NODE_FIELD_CONTENT = {};
const nodeFieldContentPath = path.join(DOCS_SRC, 'node-field-content.ts');
if (fs.existsSync(nodeFieldContentPath)) {
  const nfcModule = loadTsData(nodeFieldContentPath);
  NODE_FIELD_CONTENT = nfcModule.NODE_FIELD_CONTENT || {};
}

// ── Output paths ──────────────────────────────────────────────────────────────
const NODES_OUT = path.join(DOCS_SRC, 'nodes');

// ── Official docs URLs ────────────────────────────────────────────────────────
const OFFICIAL_DOCS = {
  activecampaign: 'https://developers.activecampaign.com/reference/overview',
  airtable: 'https://airtable.com/developers/web/api/introduction',
  amazon_ses: 'https://docs.aws.amazon.com/ses/latest/APIReference/Welcome.html',
  anthropic_claude: 'https://docs.anthropic.com/en/api/overview',
  aws_s3: 'https://docs.aws.amazon.com/AmazonS3/latest/API/API_Operations.html',
  bitbucket: 'https://developer.atlassian.com/cloud/bitbucket/rest/intro/',
  calendly: 'https://developer.calendly.com/api-docs',
  chargebee: 'https://apidocs.chargebee.com/docs/api',
  clickup: 'https://clickup.com/api',
  contentful: 'https://www.contentful.com/developers/docs/references/content-management-api/',
  discord: 'https://discord.com/developers/docs/intro',
  discord_webhook: 'https://discord.com/developers/docs/resources/webhook',
  dropbox: 'https://www.dropbox.com/developers/documentation/http/documentation',
  facebook: 'https://developers.facebook.com/docs/graph-api/',
  firebase: 'https://firebase.google.com/docs/reference',
  freshdesk: 'https://developers.freshdesk.com/api/',
  ftp: 'https://en.wikipedia.org/wiki/File_Transfer_Protocol',
  github: 'https://docs.github.com/en/rest',
  gitlab: 'https://docs.gitlab.com/api/',
  google_bigquery: 'https://cloud.google.com/bigquery/docs/reference/rest',
  google_calendar: 'https://developers.google.com/calendar/api/v3/reference',
  google_cloud_storage: 'https://cloud.google.com/storage/docs/json_api',
  google_contacts: 'https://developers.google.com/people/api/rest',
  google_doc: 'https://developers.google.com/docs/api/reference/rest',
  google_drive: 'https://developers.google.com/drive/api/reference/rest/v3',
  google_gemini: 'https://ai.google.dev/api',
  google_gmail: 'https://developers.google.com/gmail/api/reference/rest',
  google_sheets: 'https://developers.google.com/sheets/api/reference/rest',
  google_tasks: 'https://developers.google.com/tasks/reference/rest',
  hubspot: 'https://developers.hubspot.com/docs/api/overview',
  instagram: 'https://developers.facebook.com/docs/instagram-platform/',
  intercom: 'https://developers.intercom.com/docs/references/rest-api/api.intercom.io/',
  intuit_smes: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account',
  jira: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
  mailchimp: 'https://mailchimp.com/developer/marketing/api/',
  mailgun: 'https://documentation.mailgun.com/docs/mailgun/api-reference/overview',
  microsoft_dynamics: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview',
  microsoft_teams: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using',
  mongodb: 'https://www.mongodb.com/docs/drivers/node/current/',
  mysql: 'https://dev.mysql.com/doc/',
  netlify: 'https://docs.netlify.com/api/get-started/',
  notion: 'https://developers.notion.com/reference/intro',
  odoo: 'https://www.odoo.com/documentation/17.0/developer/reference/external_api.html',
  onedrive: 'https://learn.microsoft.com/en-us/onedrive/developer/rest-api/',
  openai_gpt: 'https://platform.openai.com/docs/api-reference',
  oracle_database: 'https://node-oracledb.readthedocs.io/en/latest/',
  outlook: 'https://learn.microsoft.com/en-us/graph/api/resources/message',
  paypal: 'https://developer.paypal.com/api/rest/',
  pinecone: 'https://docs.pinecone.io/reference/api/introduction',
  pipedrive: 'https://developers.pipedrive.com/docs/api/v1',
  postgresql: 'https://www.postgresql.org/docs/current/',
  redis: 'https://redis.io/docs/latest/commands/',
  salesforce: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm',
  sendgrid: 'https://www.twilio.com/docs/sendgrid/api-reference',
  sftp: 'https://en.wikipedia.org/wiki/SSH_File_Transfer_Protocol',
  shopify: 'https://shopify.dev/docs/api/admin-rest',
  slack_message: 'https://api.slack.com/messaging/webhooks',
  slack_webhook: 'https://api.slack.com/messaging/webhooks',
  stripe: 'https://docs.stripe.com/api',
  supabase: 'https://supabase.com/docs/reference/javascript/introduction',
  telegram: 'https://core.telegram.org/bots/api',
  twitter: 'https://developer.x.com/en/docs/x-api',
  typeform: 'https://www.typeform.com/developers/',
  vercel: 'https://vercel.com/docs/rest-api',
  whatsapp: 'https://developers.facebook.com/docs/whatsapp/cloud-api/reference',
  whatsapp_cloud: 'https://developers.facebook.com/docs/whatsapp/cloud-api/reference',
  woocommerce: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  wordpress: 'https://developer.wordpress.org/rest-api/reference/',
  workday: 'https://community.workday.com/sites/default/files/file-hosting/restapi/index.html',
  xero: 'https://developer.xero.com/documentation/api/accounting/overview',
  youtube: 'https://developers.google.com/youtube/v3/docs',
  zendesk: 'https://developer.zendesk.com/api-reference/',
  zoho_crm: 'https://www.zoho.com/crm/developer/docs/api/v6/',
};

// ── Credential type map (slug → credentialSteps key) ─────────────────────────
const CREDENTIAL_TYPE_MAP = {
  google_gmail: 'Gmail OAuth',
  google_sheets: 'Google Sheets OAuth',
  google_drive: 'Google Drive OAuth',
  google_calendar: 'Google Calendar OAuth',
  google_contacts: 'Google OAuth',
  google_bigquery: 'Google OAuth',
  google_doc: 'Google Docs OAuth',
  google_tasks: 'Google OAuth',
  google_cloud_storage: 'Google Cloud Storage Credential',
  youtube: 'Google Credential',
  google_gemini: 'Google Gemini API Key',
  openai_gpt: 'OpenAI API Key',
  anthropic_claude: 'Anthropic API Key',
  slack_message: 'Slack OAuth',
  slack_webhook: 'Slack Webhook URL',
  discord: 'Discord Bot Token',
  discord_webhook: 'Discord Bot Token',
  telegram: 'Telegram Bot Token',
  twitter: 'Twitter API Key',
  linkedin: 'LinkedIn OAuth',
  instagram: 'Meta App Credentials',
  instagram_trigger: 'Meta App Credentials',
  facebook: 'Meta App Credentials',
  whatsapp: 'Meta App Credentials',
  whatsapp_trigger: 'Meta App Credentials',
  whatsapp_cloud: 'Meta App Credentials',
  microsoft_teams: 'Microsoft Credential',
  outlook: 'Microsoft Credential',
  microsoft_dynamics: 'Microsoft Credential',
  onedrive: 'Microsoft Credential',
  workday: 'Workday Credential',
  zoom_video: 'Zoom Credential',
  twilio: 'Twilio Credential',
  mailgun: 'Mailgun API Key',
  sendgrid: 'SendGrid API Key',
  amazon_ses: 'AWS Credential',
  aws_s3: 'AWS Credential',
  email: 'SMTP Credential',
  postgresql: 'PostgreSQL Credential',
  supabase: 'Supabase Credential',
  mongodb: 'MongoDB Credential',
  mysql: 'MySQL Credential',
  redis: 'Redis Credential',
  firebase: 'Firebase Credential',
  airtable: 'Airtable API Key',
  notion: 'Notion API Key',
  clickup: 'ClickUp API Key',
  dropbox: 'Dropbox Credential',
  ftp: 'FTP Credential',
  sftp: 'SFTP Credential',
  salesforce: 'Salesforce Credential',
  sap: 'SAP Credential',
  hubspot: 'HubSpot API Key',
  zoho_crm: 'Zoho Credential',
  pipedrive: 'Pipedrive API Key',
  intuit_smes: 'Intuit Credential',
  tally: 'Tally API Key',
  freshdesk: 'Freshdesk API Key',
  intercom: 'Intercom API Key',
  mailchimp: 'Mailchimp API Key',
  activecampaign: 'ActiveCampaign API Key',
  chargebee: 'Chargebee API Key',
  odoo: 'Odoo Credential',
  stripe: 'Stripe API Key',
  paypal: 'PayPal Credential',
  shopify: 'Shopify API Key',
  woocommerce: 'WooCommerce API Key',
  github: 'GitHub API Key',
  gitlab: 'GitLab API Key',
  bitbucket: 'Atlassian API Key',
  jira: 'Atlassian API Key',
  jenkins: 'Jenkins API Key',
  vercel: 'Vercel API Key',
  netlify: 'Netlify API Key',
  wordpress: 'WordPress Credential',
  contentful: 'Contentful API Key',
  pinecone: 'Pinecone API Key',
  typeform: 'Typeform API Key',
  calendly: 'Calendly API Key',
  xero: 'Xero Credential',
  zendesk: 'Zendesk API Key',
  oracle_database: 'Oracle Credential',
  cohere: 'Cohere API Key',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayName(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCamelCase(slug) {
  return slug.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
}

function inferFieldType(key, field) {
  const lower = key.toLowerCase();
  if (field.options && field.options.length > 0) return 'select';
  if (lower.includes('password') || lower.includes('secret') ||
      lower === 'token' || lower === 'apikey' || lower === 'api_key') return 'password';
  if (lower.includes('email') && !lower.includes('body') && !lower.includes('template')) return 'email';
  if (lower.includes('url') || lower === 'endpoint' || lower.includes('webhook')) return 'url';
  if ((lower === 'body' || lower.includes('body') && !lower.endsWith('id')) ||
      (lower === 'message' || lower === 'messagetext') ||
      lower.includes('content') || lower === 'description' || lower === 'text' ||
      lower.includes('template') || lower === 'prompt' || lower === 'query' ||
      lower === 'html' || lower === 'xml') return 'textarea';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'number') return 'number';
  if (field.type === 'object' || field.type === 'array') return 'json';
  return 'string';
}

function exampleFor(key, field) {
  if (field.examples && field.examples.length > 0) {
    const ex = field.examples[0];
    return typeof ex === 'object' ? JSON.stringify(ex) : String(ex);
  }
  if (field.default !== undefined && field.default !== null && field.default !== '') {
    return typeof field.default === 'object' ? JSON.stringify(field.default) : String(field.default);
  }
  if (field.options && field.options.length > 0) return field.options[0].value;
  const lower = key.toLowerCase();
  if (lower.includes('email')) return 'user@example.com';
  if (lower.includes('url') || lower.includes('endpoint')) return 'https://api.example.com';
  if (lower.includes('id')) return 'abc123';
  if (lower === 'contacts') return '[{"name":{"formatted_name":"Alice Kumar","first_name":"Alice"},"phones":[{"phone":"+919876543210","type":"MOBILE"}]}]';
  if (field.type === 'number') return '10';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'object') return '{"key":"value"}';
  if (field.type === 'array') return '["item"]';
  return undefined;
}

function operationConditionMatches(condition, opValue) {
  if (!condition || condition.field !== 'operation') return false;
  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    return Array.isArray(condition.equals)
      ? condition.equals.includes(opValue)
      : condition.equals === opValue;
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
    return Array.isArray(condition.notEquals)
      ? !condition.notEquals.includes(opValue)
      : condition.notEquals !== opValue;
  }
  return false;
}

function guideText(parts) {
  return parts.filter(Boolean).join('\n');
}

function dynamicTip(key, fieldType) {
  if (fieldType === 'boolean' || fieldType === 'select') return null;
  return `Tip: To use data from an earlier node, type {{$json.${key}}} or pick the value from the data picker.`;
}

function deriveHelpText(key, field, fieldType, context = {}) {
  const lower = key.toLowerCase();
  const label = toDisplayName(key);
  const plainLabel = label.toLowerCase();
  const description = field.description || `${label} for this node.`;
  const nodeName = context.displayName || toDisplayName(context.slug || 'node');
  const opName = context.opName || toDisplayName(context.opValue || 'execute');
  const opContext = `${nodeName} / ${opName}`;

  // ── 1. Check content bible: exact node + operation + field match ──────────
  const slug = context.slug || '';
  const opValue = context.opValue || 'default';
  const exactMatch = NODE_FIELD_CONTENT?.[slug]?.[opValue]?.[key];
  if (exactMatch) return exactMatch;

  // ── 2. Check content bible: node-level wildcard (all operations) ──────────
  const wildcardMatch = NODE_FIELD_CONTENT?.[slug]?.['*']?.[key];
  if (wildcardMatch) return wildcardMatch;

  // ── 3. Fall through to generic rules below ────────────────────────────────

  if (lower === 'operation') {
    return guideText([
      `What this field is: Operation chooses the exact action ${nodeName} will perform.`,
      `How to fill it: Pick the action that matches your goal for this ${nodeName} step. Use the choices shown in this node, not examples from another service.`,
      `Example: In ${nodeName}, choose "${opName}" when you want this node to run the ${opName.toLowerCase()} action.`,
      'Output: The operation result becomes the data available to the next workflow node.',
    ]);
  }
  if (lower === 'resource') {
    return guideText([
      `What this field is: Resource chooses the kind of ${nodeName} item this node works with.`,
      `How to fill it: Pick the service object you want, such as contact, company, deal, message, file, row, issue, or another choice shown by ${nodeName}.`,
      `Example: In ${nodeName}, pick the type of record you want to work with, such as contact, message, order, or another type shown in this node.`,
      'Tip: Choose the resource first, then choose the operation that should happen to that resource.',
    ]);
  }
  if (context.slug === 'hubspot' && lower === 'properties') {
    return guideText([
      `What this field is: HubSpot properties are the fields CtrlChecks sends when ${opName.toLowerCase()} runs for the selected HubSpot resource.`,
      'Where to find property names: In HubSpot, open Settings -> Properties, choose the object type, and copy the internal property name.',
      'Contact example: {"email":"alice@example.com","firstname":"Alice","lastname":"Kumar","phone":"+919876543210"}',
      'Deal example: {"dealname":"Website redesign","amount":"25000","pipeline":"default","dealstage":"appointmentscheduled"}',
      'Dynamic example: {"email":"{{$json.email}}","firstname":"{{$json.firstName}}"}',
      'Common mistake: Use HubSpot internal names such as firstname, not only the visible label such as First name.',
    ]);
  }
  if ((context.slug === 'whatsapp' || context.slug === 'whatsapp_cloud') && lower === 'contacts') {
    return guideText([
      `What this field is: Contact data that WhatsApp sends as a contact card during ${opContext}.`,
      'How to fill it: Provide a JSON array of contact objects with name and phone information.',
      'Example: [{"name":{"formatted_name":"Alice Kumar","first_name":"Alice"},"phones":[{"phone":"+919876543210","type":"MOBILE"}]}]',
      'What the user sees: The recipient receives a WhatsApp contact card they can save on their phone.',
    ]);
  }
  if (lower.includes('spreadsheetid') || lower.includes('sheetid')) {
    return guideText([
      `What this field is: This is the unique Google Sheet file ID used by ${opContext}.`,
      'Where to find it: Open the Google Sheet and copy the long text between /d/ and /edit in the browser URL.',
      'Format: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit',
      'Example: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    ]);
  }
  if (lower.includes('url') || lower === 'endpoint' || lower.includes('webhook')) {
    return guideText([
      `What this field is: ${description} for ${opContext}.`,
      `How to fill it: Paste the full web address ${nodeName} should use, starting with https:// whenever possible.`,
      'Example: https://api.example.com/customers',
      dynamicTip(key, fieldType),
    ]);
  }
  if (lower.includes('email') || lower === 'to' || lower.includes('recipient')) {
    return guideText([
      `What this field is: The email address that ${nodeName} should use for ${plainLabel}.`,
      'How to fill it: Type one email address, or multiple addresses separated by commas if the field supports several recipients.',
      'Example: alice@example.com',
      'Dynamic example: {{$json.email}} uses the email value from an earlier node.',
    ]);
  }
  if (lower.includes('channel')) {
    return guideText([
      `What this field is: The channel or conversation where ${nodeName} sends or reads data during ${opName}.`,
      'Where to find it: Open the service, choose the channel/conversation, and copy its visible name or ID from details.',
      'Example: #alerts or C01234567',
    ]);
  }
  if (lower.includes('token') || lower.includes('apikey') || lower.includes('api_key') || lower.includes('secret')) {
    return guideText([
      `What this field is: A private key or token that lets CtrlChecks access ${nodeName}.`,
      `Where to get it: Open the ${nodeName} dashboard, go to API Keys, Developers, Apps, or Settings, then create or copy the key/token.`,
      'Important: Keep this value private. Do not paste it into normal text fields unless the node specifically asks for it.',
      'Example format: sk_live_..., xoxb-..., or token_...',
    ]);
  }
  if (lower.includes('query') || lower.includes('filter') || lower === 'where') {
    return guideText([
      `What this field is: ${description} for ${opContext}.`,
      `How to fill it: Enter the search, filter, SQL, or API query that tells ${nodeName} which records to return or affect.`,
      'Leave it blank only when you really want all available records and the node allows it.',
      'Example: status = active or from:billing@example.com',
      dynamicTip(key, fieldType),
    ]);
  }
  if (lower.includes('body') || lower.includes('text') || lower.includes('message') ||
      lower.includes('content') || lower === 'prompt' || fieldType === 'textarea') {
    return guideText([
      `What this field is: ${description} for ${opContext}.`,
      `How to fill it: Type the message, prompt, or content you want ${nodeName} to send or process.`,
      'Example: Hello {{$json.name}}, your report is ready.',
      'Tip: Anything inside {{ }} can come from an earlier workflow step.',
    ]);
  }
  if (lower.endsWith('id') || lower.includes('id')) {
    return guideText([
      `What this field is: ${description} for ${opContext}.`,
      `Where to find it: Open the item in ${nodeName} and copy its ID from the URL, details page, API response, or earlier node output.`,
      'Example: abc123, cus_123, msg_123, or C01234567',
      dynamicTip(key, fieldType),
    ]);
  }
  if (lower.includes('range')) {
    return guideText([
      'What this field is: The exact cells in a spreadsheet that this node should read or write.',
      'Format: Use A1 notation: Sheet1!A1:D100 means columns A to D, rows 1 to 100 on Sheet1.',
      'Example: Sheet1!A2:D500',
      'Tip: Leave it blank only if the node documentation says it can use the whole sheet.',
    ]);
  }
  if (lower.includes('sheet')) {
    return guideText([
      `What this field is: The spreadsheet sheet or tab used for ${plainLabel}.`,
      'Where to find it: Open the spreadsheet and copy the tab name shown at the bottom, such as Sheet1 or Customers.',
      'Example: Sheet1',
    ]);
  }
  if (fieldType === 'json') {
    return guideText([
      `What this field is: ${description} for ${opContext}.`,
      `How to fill it: Enter valid JSON in the format ${nodeName} expects. Use { } for one object, or [ ] for a list.`,
      'Example object: {"name":"Alice","email":"alice@example.com"}',
      'Example list: [{"name":"Alice"},{"name":"Bob"}]',
      dynamicTip(key, fieldType),
    ]);
  }
  if (fieldType === 'number') {
    return guideText([
      `What this field is: A number used for ${plainLabel} in ${opContext}.`,
      'How to fill it: Type digits only unless the field description says decimals are allowed.',
      'Example: 10',
      dynamicTip(key, fieldType),
    ]);
  }
  if (fieldType === 'boolean') {
    return guideText([
      `What this field is: An on/off choice for ${plainLabel} in ${opContext}.`,
      'How to fill it: Turn it on for Yes/True, or off for No/False.',
      `Example: Turn it on only when you want ${nodeName} to use this optional behavior.`,
    ]);
  }
  if (fieldType === 'select' || field.options?.length) {
    return guideText([
      `What this field is: A list of allowed choices for ${plainLabel} in ${opContext}.`,
      `How to fill it: Pick the option that matches what ${nodeName} should do. Do not type a custom value unless the UI allows it.`,
      field.options?.length ? `Available choices: ${field.options.map((o) => `${o.label} (${o.value})`).join(', ')}.` : null,
    ]);
  }
  return guideText([
    `What this field is: ${description} for ${opContext}.`,
    `How to fill it: Enter the ${plainLabel} value requested by ${nodeName}, or map it from the previous workflow step.`,
    dynamicTip(key, fieldType),
  ]);
}

function placeholderFor(key, field, fieldType, ex) {
  if (ex !== undefined) return ex;
  const lower = key.toLowerCase();
  if (lower === 'operation') return 'Select an operation';
  if (lower.includes('spreadsheetid') || lower.includes('sheetid')) return '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  if (lower.includes('sheetname')) return 'Sheet1';
  if (lower.includes('range')) return 'Sheet1!A1:D100';
  if (lower.includes('channel')) return '#alerts or C01234567';
  if (lower.includes('email') || lower === 'to' || lower.includes('recipient')) return 'alice@example.com';
  if (lower.includes('url') || lower === 'endpoint' || lower.includes('webhook')) return 'https://api.example.com/data';
  if (lower.includes('token')) return 'token_...';
  if (lower.includes('apikey') || lower.includes('api_key')) return 'sk_...';
  if (lower.includes('query')) return 'status = active';
  if (lower.includes('body')) return '{"name":"{{$json.name}}"}';
  if (lower === 'contacts') return '[{"name":{"formatted_name":"Alice Kumar","first_name":"Alice"},"phones":[{"phone":"+919876543210","type":"MOBILE"}]}]';
  if (lower.includes('text') || lower.includes('message')) return 'Hello {{$json.name}}';
  if (lower === 'prompt') return 'Summarize {{$json.text}}';
  if (lower.includes('subject')) return 'Welcome, {{$json.name}}';
  if (lower.includes('table')) return 'customers';
  if (lower.includes('id')) return 'abc123';
  if (fieldType === 'number') return '10';
  if (fieldType === 'boolean') return 'false';
  if (fieldType === 'json') return '{"key":"value"}';
  return `Enter ${toDisplayName(key)}`;
}

function isStructurallyEssential(slug, opValue, key, field) {
  if (field.default !== undefined && field.default !== null && field.default !== '') return false;
  const lower = key.toLowerCase();
  if (lower.includes('credential') || lower.includes('apikey') || lower.includes('api_key') ||
      lower.includes('token') || lower.includes('secret') || lower.includes('password')) return false;

  const specialRequired = {
    http_request: {
      GET: ['url'],
      POST: ['url', 'body'],
      PUT: ['url', 'body'],
      PATCH: ['url', 'body'],
      DELETE: ['url'],
    },
    postgresql: {
      query: ['query'],
      insert: ['table', 'data'],
      update: ['table', 'data'],
      delete: ['table'],
    },
    google_sheets: {
      read: ['spreadsheetId'],
      write: ['spreadsheetId', 'range', 'values'],
      append: ['spreadsheetId', 'range', 'values'],
      update: ['spreadsheetId', 'range', 'values'],
    },
    slack_message: {
      default: ['channel', 'text'],
    },
    linkedin: {
      create_post: ['text'],
      post: ['text'],
      create_post_media: ['mediaUrl'],
      delete_post: ['postId'],
    },
    anthropic_claude: {
      default: ['prompt'],
    },
  };
  const opReq = specialRequired[slug]?.[opValue] || specialRequired[slug]?.default || [];
  if (opReq.includes(key)) return true;

  return ['url', 'query', 'prompt', 'subject', 'body', 'message', 'text', 'table', 'data', 'values']
    .includes(lower);
}

function specialOperationsFor(slug) {
  if (slug === 'http_request') {
    return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((v) => ({ name: v, value: v }));
  }
  if (slug === 'postgresql') {
    return [
      { name: 'Query', value: 'query' },
      { name: 'Insert', value: 'insert' },
      { name: 'Update', value: 'update' },
      { name: 'Delete', value: 'delete' },
    ];
  }
  return null;
}

/** Detect operations for a multi-op node from the `operation` field. */
function getOperations(schema, slug) {
  const special = specialOperationsFor(slug);
  if (special) return special;

  const opField = schema.configSchema.optional && schema.configSchema.optional.operation;
  if (!opField) return [{ name: 'Execute', value: 'default' }];

  const values = [];
  if (opField.examples && opField.examples.length > 0) {
    for (const ex of opField.examples) {
      if (typeof ex === 'string') values.push(ex);
    }
  }
  if (values.length === 0 && opField.options && opField.options.length > 0) {
    for (const opt of opField.options) values.push(opt.value);
  }

  if (values.length === 0) return [{ name: 'Execute', value: 'default' }];
  return values.map((v) => ({
    name: v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '),
    value: v,
  }));
}

/**
 * Return fields for a given operation with correct required flags.
 *
 * Inclusion rules (multi-op node):
 *  - Skip `operation` and `credentialId` (internal)
 *  - Exclude if requiredIf.field==='operation' && equals !== opValue
 *  - Exclude if visibleIf.field==='operation'  && equals !== opValue
 *  - Everything else is included
 *
 * Required = true when:
 *  - Key is in configSchema.required[]
 *  - requiredIf.field==='operation' && equals===opValue
 */
function getFieldsForOperation(schema, opValue, slug, displayName, opName) {
  const { required: requiredList, optional } = schema.configSchema;
  const isSingleOp = opValue === 'default';
  const fields = [];

  const specialAllowed = {
    http_request: {
      GET: ['url', 'method', 'headers', 'qs', 'timeout', 'retryOnFail', 'maxRetries'],
      POST: ['url', 'method', 'headers', 'body', 'qs', 'timeout', 'retryOnFail', 'maxRetries'],
      PUT: ['url', 'method', 'headers', 'body', 'qs', 'timeout', 'retryOnFail', 'maxRetries'],
      PATCH: ['url', 'method', 'headers', 'body', 'qs', 'timeout', 'retryOnFail', 'maxRetries'],
      DELETE: ['url', 'method', 'headers', 'qs', 'timeout', 'retryOnFail', 'maxRetries'],
    },
    postgresql: {
      query: ['connectionString', 'query', 'parameters'],
      insert: ['connectionString', 'table', 'data'],
      update: ['connectionString', 'table', 'data', 'where'],
      delete: ['connectionString', 'table', 'where'],
    },
    google_sheets: {
      read: ['spreadsheetId', 'sheetName', 'range', 'outputFormat'],
      write: ['spreadsheetId', 'sheetName', 'range', 'values'],
      append: ['spreadsheetId', 'sheetName', 'range', 'values'],
      update: ['spreadsheetId', 'sheetName', 'range', 'values'],
    },
    google_gmail: {
      send: ['recipientEmails', 'subject', 'body', 'from'],
      get: ['messageId'],
      list: ['query', 'maxResults'],
      search: ['query', 'maxResults'],
    },
    slack_message: {
      default: ['channel', 'text', 'blocks', 'username', 'iconEmoji'],
    },
    anthropic_claude: {
      default: ['model', 'prompt', 'messages'],
    },
    hubspot: {
      get: ['resource', 'operation', 'id', 'objectId'],
      getMany: ['resource', 'operation', 'limit', 'after'],
      create: ['resource', 'operation', 'properties'],
      update: ['resource', 'operation', 'id', 'objectId', 'properties'],
      delete: ['resource', 'operation', 'id', 'objectId'],
      search: ['resource', 'operation', 'searchQuery', 'limit', 'after'],
      batchCreate: ['resource', 'operation', 'properties'],
      batchUpdate: ['resource', 'operation', 'properties'],
      batchDelete: ['resource', 'operation', 'id', 'objectId'],
    },
    whatsapp: {
      sendText: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'text', 'message', 'previewUrl'],
      sendMedia: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'mediaType', 'mediaUrl', 'mediaId', 'caption'],
      sendLocation: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'latitude', 'longitude', 'locationName', 'address'],
      sendContact: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'contacts'],
      sendReaction: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'messageId', 'emoji'],
      sendTemplate: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'templateName', 'language', 'templateComponents'],
      sendInteractiveButtons: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'bodyText', 'headerText', 'footerText', 'buttons'],
      sendInteractiveList: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'bodyText', 'headerText', 'footerText', 'buttonText', 'sections'],
      sendInteractiveCTA: ['resource', 'operation', 'phoneNumberId', 'businessAccountId', 'to', 'bodyText', 'headerText', 'footerText', 'ctaUrl'],
      markAsRead: ['resource', 'operation', 'phoneNumberId', 'messageId'],
    },
    whatsapp_cloud: {
      sendText: ['resource', 'operation', 'phoneNumberId', 'to', 'text', 'message'],
      sendMedia: ['resource', 'operation', 'phoneNumberId', 'to', 'mediaUrl'],
      sendLocation: ['resource', 'operation', 'phoneNumberId', 'to', 'latitude', 'longitude', 'locationName', 'address'],
      sendContact: ['resource', 'operation', 'phoneNumberId', 'to', 'contacts'],
      sendReaction: ['resource', 'operation', 'phoneNumberId', 'to', 'messageId', 'emoji'],
      sendTemplate: ['resource', 'operation', 'phoneNumberId', 'to', 'templateName', 'language', 'templateComponents'],
    },
  };
  const allowedKeys = specialAllowed[slug]?.[opValue] || specialAllowed[slug]?.default || null;

  for (const [key, field] of Object.entries(optional)) {
    if (key === 'credentialId' || key === 'operation') continue;
    if (allowedKeys && !allowedKeys.includes(key)) continue;

    const reqIfOp = field.requiredIf && field.requiredIf.field === 'operation';
    const visIfOp = field.visibleIf && field.visibleIf.field === 'operation';

    if (!isSingleOp) {
      if (reqIfOp && !operationConditionMatches(field.requiredIf, opValue)) continue;
      if (visIfOp && !operationConditionMatches(field.visibleIf, opValue)) continue;
    }

    const isRequired =
      requiredList.includes(key) ||
      (reqIfOp && operationConditionMatches(field.requiredIf, opValue)) ||
      (field.requiredIf && !reqIfOp) ||
      isStructurallyEssential(slug, opValue, key, field);

    const ex = exampleFor(key, field);
    const fieldType = inferFieldType(key, field);

    const fieldDoc = {
      name: toDisplayName(key),
      internalKey: key,
      type: fieldType,
      required: isRequired,
      description: field.description || `${toDisplayName(key)} for this node.`,
      helpText: deriveHelpText(key, field, fieldType, { slug, displayName, opValue, opName }),
      placeholder: placeholderFor(key, field, fieldType, ex),
    };

    if (ex !== undefined) {
      fieldDoc.example = ex;
    }

    if (field.default !== undefined && field.default !== null && field.default !== '') {
      fieldDoc.defaultValue = typeof field.default === 'object'
        ? JSON.stringify(field.default)
        : String(field.default);
    }

    if (field.options && field.options.length > 0) {
      fieldDoc.options = field.options.map((o) => o.label);
    }

    // Conditional-required note for non-operation requiredIf
    if (field.requiredIf && !reqIfOp && !isRequired) {
      fieldDoc.notes = `Required when ${field.requiredIf.field} is "${field.requiredIf.equals ?? 'set'}".`;
    }

    if (fieldDoc.type === 'password') {
      fieldDoc.notes = 'Stored and displayed as a masked credential value.';
    }

    fields.push(fieldDoc);
  }

  if (slug === 'postgresql' && opValue !== 'query') {
    const syntheticFields = {
      table: { type: 'string', description: 'Database table name' },
      data: { type: 'object', description: 'Row data to write as JSON' },
      where: { type: 'object', description: 'Filter condition for update/delete' },
    };
    for (const key of (specialAllowed.postgresql[opValue] || []).filter((k) => !fields.some((f) => f.internalKey === k))) {
      const field = syntheticFields[key];
      if (!field) continue;
      const fieldType = inferFieldType(key, field);
      fields.push({
        name: toDisplayName(key),
        internalKey: key,
        type: fieldType,
        required: isStructurallyEssential(slug, opValue, key, field),
        description: field.description,
        helpText: deriveHelpText(key, field, fieldType, { slug, displayName, opValue, opName }),
        placeholder: placeholderFor(key, field, fieldType),
      });
    }
  }

  if (slug === 'anthropic_claude' && !fields.some((f) => f.internalKey === 'prompt')) {
    const field = { type: 'string', description: 'Prompt to send to Claude' };
    const fieldType = inferFieldType('prompt', field);
    fields.push({
      name: 'Prompt',
      internalKey: 'prompt',
      type: fieldType,
      required: true,
      description: field.description,
      helpText: deriveHelpText('prompt', field, fieldType, { slug, displayName, opValue, opName }),
      placeholder: placeholderFor('prompt', field, fieldType),
    });
  }

  return fields;
}

/** Build a real output example from NODE_OUTPUT_SCHEMAS or content overrides. */
function buildOutputExample(slug, opValue) {
  // Check content overrides first
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.outputExample && !isPlaceholderOutput(override.outputExample)) return override.outputExample;

  const specialExamples = {
    linkedin: {
      create_post: { id: 'urn:li:share:1234567890', lifecycleState: 'PUBLISHED', visibility: 'PUBLIC' },
      post: { id: 'urn:li:share:1234567890', lifecycleState: 'PUBLISHED', visibility: 'PUBLIC' },
      get_posts: { elements: [{ id: 'urn:li:share:1234567890', text: 'New product update', visibility: 'PUBLIC' }], count: 1 },
      delete_post: { deleted: true, id: 'urn:li:share:1234567890' },
    },
    google_gmail: {
      send: { messageId: '18abc123def', threadId: '18abc123', labelIds: ['SENT'] },
      get: { id: '18abc123def', threadId: '18abc123', subject: 'Welcome', from: 'team@example.com', body: 'Hello Alice' },
      list: { messages: [{ id: '18abc123def', threadId: '18abc123', snippet: 'Welcome...' }], resultSizeEstimate: 1 },
      search: { messages: [{ id: '18abc999def', threadId: '18abc999', snippet: 'Invoice...' }], resultSizeEstimate: 1 },
    },
    google_sheets: {
      read: { rows: [{ Name: 'Alice', Email: 'alice@example.com' }], count: 1 },
      write: { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', updatedRange: 'Sheet1!A1:D2', updatedRows: 1 },
      append: { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', updates: { updatedRange: 'Sheet1!A2:D2', updatedRows: 1 } },
      update: { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', updatedRange: 'Sheet1!A2:D2', updatedCells: 4 },
    },
    http_request: {
      GET: { status: 200, body: { id: 1 }, headers: { 'content-type': 'application/json' } },
      POST: { status: 201, body: { id: 1, created: true }, headers: { 'content-type': 'application/json' } },
      PUT: { status: 200, body: { id: 1, updated: true }, headers: { 'content-type': 'application/json' } },
      PATCH: { status: 200, body: { id: 1, patched: true }, headers: { 'content-type': 'application/json' } },
      DELETE: { status: 204, body: null, headers: {} },
    },
    postgresql: {
      query: { rows: [{ id: 1, name: 'Alice' }], rowCount: 1 },
      insert: { rows: [{ id: 1, name: 'Alice' }], rowCount: 1 },
      update: { rows: [{ id: 1, status: 'active' }], rowCount: 1 },
      delete: { rowCount: 1 },
    },
    slack_message: {
      default: { ok: true, ts: '1234567890.123456', channel: 'C01234567' },
    },
    stripe: {
      charge: { id: 'ch_1abc', amount: 2000, currency: 'usd', status: 'succeeded' },
      create_charge: { id: 'ch_1abc', amount: 2000, currency: 'usd', status: 'succeeded' },
    },
    anthropic_claude: {
      default: { id: 'msg_01ABC', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Here is the answer.' }], model: 'claude-3-5-sonnet-latest' },
    },
  };
  const special = specialExamples[slug]?.[opValue] || specialExamples[slug]?.default;
  if (special) return special;

  // Fall back to NODE_OUTPUT_SCHEMAS
  const schema = NODE_OUTPUT_SCHEMAS[slug];
  if (!schema) return {
    success: true,
    operation: opValue,
    data: { id: 'item_123', status: 'completed' },
  };

  const type = schema.type;
  if (type === 'string') {
    const text = exampleTextForStringOutput(slug, opValue);
    return { text, length: text.length };
  }
  if (type === 'void') return {};
  if (type === 'array') {
    return [{ id: '1', name: 'Example item', createdAt: '2025-01-15T09:00:00Z' }];
  }

  // object type
  if (schema.structure && schema.structure.fields) {
    const example = {};
    for (const [field, fieldType] of Object.entries(schema.structure.fields)) {
      example[field] = defaultValForType(field, fieldType);
    }
    return example;
  }

  return { success: true, operation: opValue, data: { id: 'item_123', status: 'completed' } };
}

function isPlaceholderOutput(outputExample) {
  return !!(
    outputExample &&
    typeof outputExample === 'object' &&
    !Array.isArray(outputExample) &&
    outputExample.result === 'Operation completed successfully.'
  );
}

function defaultValForType(field, type) {
  if (field.toLowerCase().includes('id')) return 'abc123';
  if (field.toLowerCase().includes('success')) return true;
  if (field.toLowerCase().includes('count') || field.toLowerCase().includes('number')) return 1;
  if (field.toLowerCase().includes('time') || field.toLowerCase().includes('date')) return '2025-01-15T09:00:00Z';
  if (field.toLowerCase().includes('url')) return 'https://example.com';
  if (type === 'boolean') return true;
  if (type === 'number') return 1;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return '';
}

function exampleTextForStringOutput(slug, opValue) {
  const key = `${slug}:${opValue}`;
  const examples = {
    'ai_agent:default': 'The order is ready to ship and the customer has been notified.',
    'date_time:calculate': '2025-01-22T09:00:00.000Z',
    'date_time:extract': 'Wednesday, January 15, 2025 at 09:00 UTC',
    'facebook:default': 'Post published to the selected Facebook page.',
    'google_gemini:default': 'Here is a concise summary of the uploaded document.',
    'html:extract': 'Alice Smith',
    'html:clean': 'Clean page text without scripts, styles, or markup.',
    'linkedin:create_post_media': 'Media post published with image attachment.',
    'linkedin:create_article': 'Article draft created and ready for review.',
    'linkedin:{{$json.operation}}': 'LinkedIn operation completed with provider result data.',
    'ollama:default': 'Local model generated a response for the prompt.',
    'openai_gpt:default': 'Here is the generated response from the selected model.',
    'twitter:create': 'Tweet published successfully.',
    'twitter:delete': 'Tweet deleted successfully.',
    'twitter:getMe': 'Authenticated account: @ctrlchecks',
    'twitter:recent': 'Latest tweet: Product update is now live.',
    'xml:extract': 'Extracted value from the selected XML path.',
  };
  return examples[key] || `Example ${toDisplayName(slug)} output for downstream workflow steps.`;
}

function buildOutputDescription(slug, opValue) {
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.outputDescription && !/operation completed successfully/i.test(override.outputDescription)) return override.outputDescription;

  const example = buildOutputExample(slug, opValue);
  if (Array.isArray(example)) {
    return 'Returns an array of result objects. Access individual fields via {{$json.fieldName}} in downstream nodes.';
  }
  return Object.keys(example)
    .map((k) => `${k}: ${describeOutputKey(k)}.`)
    .join('\n');
}

function describeOutputKey(key) {
  const lower = key.toLowerCase();
  if (lower === 'id' || lower.endsWith('id')) return 'Unique identifier returned by the service';
  if (lower.includes('status') || lower.includes('state')) return 'Current state of the requested action';
  if (lower === 'rows' || lower === 'messages' || lower === 'elements' || lower === 'data') return 'Returned records from the service';
  if (lower.includes('count') || lower.includes('size')) return 'Number of records affected or returned';
  if (lower === 'body') return 'Parsed response body';
  if (lower === 'headers') return 'Response headers';
  if (lower === 'ok' || lower === 'success') return 'Whether the service accepted the request';
  if (lower === 'ts') return 'Provider timestamp that also acts as a message identifier';
  if (lower.includes('range')) return 'Spreadsheet range affected by the operation';
  return 'Value returned by this operation';
}

function buildUsageExample(slug, displayName, opValue, opName, fields) {
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.usageExample && !isGenericScenario(override.usageExample.scenario)) return override.usageExample;

  const inputValues = {};
  for (const f of fields.slice(0, 5)) {
    inputValues[f.name] = f.example || '';
  }

  const subject = humanizeOperation(opName);
  const specialScenarios = {
    'linkedin:create_post': 'Publish a social update after a new blog post is detected via RSS feed',
    'linkedin:post': 'Publish a social update after a new blog post is detected via RSS feed',
    'google_gmail:send': 'Send a welcome email after a new user form submission',
    'google_sheets:read': 'Fetch customer records from a CRM export sheet before sending a campaign',
    'if_else:default': 'Route orders over $100 to premium fulfillment, under $100 to standard',
    'http_request:GET': 'Fetch product details from an external REST API before updating a record',
    'http_request:POST': 'Submit a completed lead form to an external CRM endpoint',
    'postgresql:query': 'Load customer records from PostgreSQL before generating a weekly report',
    'postgresql:insert': 'Save a new order row after a checkout webhook is received',
    'slack_message:default': 'Alert the operations channel when a deployment or workflow run completes',
    'anthropic_claude:default': 'Summarize a long support ticket before creating an agent handoff note',
  };
  return {
    scenario: specialScenarios[`${slug}:${opValue}`] ||
      `Process incoming ${displayName} data with ${subject} after a related upstream event is received`,
    inputValues,
    expectedOutput: `${displayName} returns structured ${subject} data that downstream nodes can reference with {{$json.fieldName}}.`,
  };
}

function isGenericScenario(scenario) {
  return !scenario || /^Use .+ to .+ in a workflow\.?$/i.test(scenario);
}

function humanizeOperation(value) {
  return String(value || 'execute')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function getCredentialType(slug) {
  return CREDENTIAL_TYPE_MAP[slug] || 'None';
}

function buildCommonErrors(displayName, hasAuth) {
  const errors = [
    {
      error: 'Required field missing',
      cause: 'A required input is empty or an upstream expression resolved to an empty value.',
      fix: 'Open the node, fill every required field, and verify the upstream node output before running.',
    },
    {
      error: 'Invalid input format',
      cause: 'A field value does not match the format expected by the node or service API.',
      fix: 'Check JSON, date, URL, email, and ID fields against the examples shown in the node documentation.',
    },
  ];
  if (hasAuth) {
    errors.unshift({
      error: 'Authentication failed',
      cause: 'The saved credential, token, API key, or OAuth grant is missing, expired, or lacks the required scope.',
      fix: `Reconnect the service in CtrlChecks → Connections, then re-run the ${displayName} node.`,
    });
  }
  return errors;
}

// ── Main doc builder ──────────────────────────────────────────────────────────

function buildNodeDoc(item) {
  const { slug, displayName, category, logoUrl, description } = item;
  const schema = nodeLib.getSchema(slug);

  const credType = getCredentialType(slug);
  const credGuide = credType !== 'None'
    ? (credentialSteps[credType] || (typeof getCredentialSteps === 'function' ? getCredentialSteps(credType) : null))
    : credentialSteps.None;
  const hasAuth = credType !== 'None';

  const externalDocsUrl = OFFICIAL_DOCS[slug] || 'https://docs.ctrlchecks.com';
  const operations = schema ? getOperations(schema, slug) : [{ name: 'Execute', value: 'default' }];

  const operationDocs = operations.map(({ name, value }) => {
    const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][value]) ||
      (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);

    const fields = schema ? getFieldsForOperation(schema, value, slug, displayName, name) : [];

    return {
      name,
      value,
      description: (override && override.description) || `${name} using the ${displayName} node.`,
      fields,
      outputExample: buildOutputExample(slug, value),
      outputDescription: buildOutputDescription(slug, value),
      usageExample: buildUsageExample(slug, displayName, value, name, fields),
      externalDocsUrl,
    };
  });

  const hasMultiOps = operationDocs.length > 1;

  return {
    slug,
    displayName,
    category,
    logoUrl,
    description: (schema && schema.description) || description,
    credentialType: credType,
    credentialSetupSteps: (credGuide && credGuide.steps) || ['No credential required.'],
    credentialDocsUrl: (credGuide && credGuide.docsUrl) || externalDocsUrl,
    resources: [
      {
        name: hasMultiOps ? 'Operations' : 'Configuration',
        description: hasMultiOps
          ? `${displayName} exposes operation choices directly.`
          : `${displayName} is configured directly with input fields.`,
        operations: operationDocs,
      },
    ],
    commonErrors: buildCommonErrors(displayName, hasAuth),
    relatedNodes: [],
  };
}

// ── File writer ────────────────────────────────────────────────────────────────

function writeDocFile(doc) {
  const constName = `${toCamelCase(doc.slug)}Doc`;
  const content = `import type { NodeDoc } from '../types';\n\nexport const ${constName}: NodeDoc = ${JSON.stringify(doc, null, 2)};\n`;
  fs.writeFileSync(path.join(NODES_OUT, `${doc.slug}.doc.ts`), content, 'utf8');
}

function writeIndexFile(docs) {
  const imports = docs
    .map((d) => `import { ${toCamelCase(d.slug)}Doc } from './nodes/${d.slug}.doc';`)
    .join('\n');

  const arrayItems = docs.map((d) => `  ${toCamelCase(d.slug)}Doc`).join(',\n');

  const content = `import type { NodeDoc } from './types';\n${imports}\n
export const allNodes: NodeDoc[] = [\n${arrayItems},\n];\n
export const nodesBySlug = Object.fromEntries(
  allNodes.map((node) => [node.slug, node])
) as Record<string, NodeDoc>;\n
export const nodesByCategory = allNodes.reduce((acc, node) => {
  if (!acc[node.category]) acc[node.category] = [];
  acc[node.category].push(node);
  return acc;
}, {} as Record<string, NodeDoc[]>);\n
export const searchIndex = allNodes.flatMap((node) => {
  const nodeEntry = {
    type: 'node' as const,
    title: node.displayName,
    slug: node.slug,
    category: node.category,
    href: \`/docs/nodes/\${node.slug}\`,
    text: [node.displayName, node.description, node.category].join(' '),
  };

  const operationEntries = node.resources.flatMap((resource) =>
    resource.operations.map((operation) => ({
      type: 'operation' as const,
      title: \`\${node.displayName}: \${operation.name}\`,
      slug: node.slug,
      category: node.category,
      href: \`/docs/nodes/\${node.slug}#operation-\${operation.value}\`,
      text: [node.displayName, resource.name, operation.name, operation.description].join(' '),
    }))
  );

  const fieldEntries = node.resources.flatMap((resource) =>
    resource.operations.flatMap((operation) =>
      operation.fields.map((field) => ({
        type: 'field' as const,
        title: \`\${node.displayName}: \${field.name}\`,
        slug: node.slug,
        category: node.category,
        href: \`/docs/nodes/\${node.slug}#operation-\${operation.value}\`,
        text: [node.displayName, resource.name, operation.name, field.name, field.description].join(' '),
      }))
    )
  );

  return [nodeEntry, ...operationEntries, ...fieldEntries];
});\n`;

  fs.writeFileSync(path.join(DOCS_SRC, 'index.ts'), content, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log(`[generate-node-docs] Starting — ${nodeDocManifest.length} nodes`);

  fs.mkdirSync(NODES_OUT, { recursive: true });

  // Remove old files
  for (const file of fs.readdirSync(NODES_OUT)) {
    if (file.endsWith('.doc.ts')) fs.unlinkSync(path.join(NODES_OUT, file));
  }

  const docs = [];
  let withSchema = 0;

  for (const item of nodeDocManifest) {
    const schema = nodeLib.getSchema(item.slug);
    if (schema) withSchema++;

    const doc = buildNodeDoc(item);
    writeDocFile(doc);
    docs.push(doc);
  }

  writeIndexFile(docs);

  console.log(`[generate-node-docs] Done.`);
  console.log(`  ✅ ${docs.length} .doc.ts files written`);
  console.log(`  ✅ index.ts regenerated`);
  console.log(`  📋 NodeLibrary schemas found: ${withSchema}/${nodeDocManifest.length}`);
  if (withSchema < nodeDocManifest.length) {
    const missing = nodeDocManifest
      .filter((item) => !nodeLib.getSchema(item.slug))
      .map((item) => item.slug);
    console.log(`  ⚠️  No schema for: ${missing.join(', ')}`);
  }
}

main();
