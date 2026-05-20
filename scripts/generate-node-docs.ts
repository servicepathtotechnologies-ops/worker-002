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
 * Usage (from repo root):
 *   cd worker && npx ts-node scripts/generate-node-docs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Suppress NodeLibrary console noise before loading it ─────────────────────
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;
console.log = () => {};
console.error = () => {};
console.warn = () => {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nodeLibrary: nodeLib } = require('../src/services/nodes/node-library') as typeof import('../src/services/nodes/node-library');

console.log = _origLog;
console.error = _origError;
console.warn = _origWarn;

// ── Import supporting data from ctrl_checks ───────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nodeDocManifest } = require('../../ctrl_checks/src/docs-content/manifest') as typeof import('../../ctrl_checks/src/docs-content/manifest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nodeContentOverrides } = require('../../ctrl_checks/src/docs-content/node-content-overrides') as typeof import('../../ctrl_checks/src/docs-content/node-content-overrides');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { credentialSteps } = require('../../ctrl_checks/src/docs-content/credential-steps') as typeof import('../../ctrl_checks/src/docs-content/credential-steps');

import type { NodeDoc, OperationDoc, FieldDoc, ResourceDoc } from '../../ctrl_checks/src/docs-content/types';
import type { NodeSchema, ConfigField } from '../src/services/nodes/node-library';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const NODES_OUT = path.join(REPO_ROOT, 'ctrl_checks', 'src', 'docs-content', 'nodes');
const DOCS_OUT = path.join(REPO_ROOT, 'ctrl_checks', 'src', 'docs-content');

/** Official docs URLs (same as the original generator). */
const OFFICIAL_DOCS: Record<string, string> = {
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

/** Map from slug → credential type name used in credentialSteps map. */
const CREDENTIAL_TYPE_MAP: Record<string, string> = {
  // Google
  google_gmail: 'Google Credential',
  google_sheets: 'Google Credential',
  google_drive: 'Google Credential',
  google_calendar: 'Google Credential',
  google_contacts: 'Google Credential',
  google_bigquery: 'Google Credential',
  google_doc: 'Google Credential',
  google_tasks: 'Google Credential',
  google_cloud_storage: 'Google Credential',
  youtube: 'Google Credential',
  // AI
  google_gemini: 'Google Gemini API Key',
  openai_gpt: 'OpenAI API Key',
  anthropic_claude: 'Anthropic API Key',
  ollama: 'None',
  cohere: 'Cohere API Key',
  ai_agent: 'None',
  ai_chat_model: 'None',
  chat_model: 'None',
  text_summarizer: 'None',
  sentiment_analyzer: 'None',
  memory: 'None',
  tool: 'None',
  // Communication
  slack_message: 'Slack Credential',
  slack_webhook: 'Slack Credential',
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
  zoom_video: 'Zoom Credential',
  twilio: 'Twilio Credential',
  mailgun: 'Mailgun API Key',
  sendgrid: 'SendGrid API Key',
  amazon_ses: 'AWS Credential',
  email: 'SMTP Credential',
  // Data
  google_sheets2: 'Google Credential',
  postgresql: 'PostgreSQL Credential',
  supabase: 'Supabase Credential',
  mongodb: 'MongoDB Credential',
  mysql: 'MySQL Credential',
  redis: 'Redis Credential',
  firebase: 'Firebase Credential',
  aws_s3: 'AWS Credential',
  airtable: 'Airtable API Key',
  notion: 'Notion API Key',
  clickup: 'ClickUp API Key',
  dropbox: 'Dropbox Credential',
  onedrive: 'Microsoft Credential',
  ftp: 'FTP Credential',
  sftp: 'SFTP Credential',
  // CRM
  salesforce: 'Salesforce Credential',
  microsoft_dynamics: 'Microsoft Credential',
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
  // Payments & eCommerce
  stripe: 'Stripe API Key',
  paypal: 'PayPal Credential',
  shopify: 'Shopify API Key',
  woocommerce: 'WooCommerce API Key',
  // DevOps
  github: 'GitHub API Key',
  gitlab: 'GitLab API Key',
  bitbucket: 'Atlassian API Key',
  jira: 'Atlassian API Key',
  jenkins: 'Jenkins API Key',
  vercel: 'Vercel API Key',
  netlify: 'Netlify API Key',
  // CMS / Misc
  wordpress: 'WordPress Credential',
  contentful: 'Contentful API Key',
  pinecone: 'Pinecone API Key',
  typeform: 'Typeform API Key',
  calendly: 'Calendly API Key',
  workday: 'Workday Credential',
  xero: 'Xero Credential',
  zendesk: 'Zendesk API Key',
  oracle_database: 'Oracle Credential',
  schedulewise: 'None',
};

/** Nodes that require no credential. */
const NO_CREDENTIAL_SLUGS = new Set([
  'schedule', 'webhook', 'manual_trigger', 'interval', 'chat_trigger', 'form',
  'error_trigger', 'workflow_trigger',
  'if_else', 'switch', 'filter', 'loop', 'merge', 'split_in_batches',
  'delay', 'wait', 'timeout', 'return', 'execute_workflow',
  'try_catch', 'retry', 'parallel', 'error_handler', 'stop_and_error', 'noop',
  'limit', 'aggregate', 'sort', 'function', 'function_item',
  'set_variable', 'set', 'javascript', 'date_time', 'text_formatter',
  'json_parser', 'merge_data', 'edit_fields', 'math', 'html', 'xml', 'csv',
  'rename_keys',
  'http_request', 'http_post', 'graphql',
  'respond_to_webhook', 'webhook_response',
  'cache_get', 'cache_set', 'queue_push', 'queue_consume',
  'api_key_auth', 'oauth2_auth',
  'db', 'database_read', 'database_write',
  'log_output', 'read_binary_file', 'write_binary_file',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCamelCase(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase());
}

function inferFieldDocType(key: string, field: ConfigField): FieldDoc['type'] {
  const lower = key.toLowerCase();
  if (field.options && field.options.length > 0) return 'select';
  if (
    lower.includes('password') || lower.includes('secret') ||
    lower === 'token' || lower.includes('apikey') || lower.includes('api_key')
  ) return 'password';
  if (lower.includes('email') && !lower.includes('body') && !lower.includes('template')) return 'email';
  if (lower.includes('url') || lower.includes('endpoint') || lower.includes('webhook')) return 'url';
  if (
    lower.includes('body') || lower.includes('message') || lower.includes('content') ||
    lower.includes('description') || lower === 'text' || lower.includes('template') ||
    lower === 'prompt' || lower === 'query' || lower === 'html' || lower === 'xml' || lower === 'csv'
  ) return 'textarea';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'number') return 'number';
  if (field.type === 'object' || field.type === 'array') return 'json';
  return 'string';
}

function exampleFor(key: string, field: ConfigField): string | undefined {
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
  if (lower.includes('url') || lower.includes('endpoint')) return 'https://api.example.com/data';
  if (lower.includes('id')) return 'abc123';
  if (field.type === 'number') return '10';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'object') return '{"key":"value"}';
  if (field.type === 'array') return '["item"]';
  return undefined;
}

/** Detect the operations for a node from the `operation` field in configSchema. */
function getOperations(schema: NodeSchema): { name: string; value: string }[] {
  const opField = schema.configSchema.optional?.operation;
  if (!opField) return [{ name: 'Execute', value: 'default' }];

  const values: string[] = [];
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
 * Return the fields that should appear in the doc for a given operation.
 *
 * Inclusion rules for a multi-op node:
 *  - Skip `operation` and `credentialId` (internal/meta)
 *  - Exclude field if requiredIf.field==='operation' && requiredIf.equals !== opValue
 *  - Exclude field if visibleIf.field==='operation'  && visibleIf.equals  !== opValue
 *  - Everything else is included
 *
 * Required flag:
 *  - requiredList.includes(key)  → always required
 *  - requiredIf.field==='operation' && requiredIf.equals===opValue → required in this op
 */
function getFieldsForOperation(schema: NodeSchema, opValue: string): FieldDoc[] {
  const { required: requiredList, optional } = schema.configSchema;
  const isSingleOp = opValue === 'default';
  const fields: FieldDoc[] = [];

  for (const [key, field] of Object.entries(optional)) {
    if (key === 'credentialId' || key === 'operation') continue;

    const reqIfOp = field.requiredIf?.field === 'operation';
    const visIfOp = field.visibleIf?.field === 'operation';

    if (!isSingleOp) {
      // Exclude if this field is only required/visible for a DIFFERENT operation
      if (reqIfOp && field.requiredIf!.equals !== undefined && field.requiredIf!.equals !== opValue) continue;
      if (visIfOp && field.visibleIf!.equals !== opValue) continue;
    }

    const isRequired =
      requiredList.includes(key) ||
      (reqIfOp && field.requiredIf!.equals === opValue);

    const ex = exampleFor(key, field);
    const fieldDoc: FieldDoc = {
      name: toDisplayName(key),
      internalKey: key,
      type: inferFieldDocType(key, field),
      required: isRequired,
      description: field.description,
      ...(ex !== undefined ? { example: ex, placeholder: ex } : {}),
      ...(field.default !== undefined && field.default !== null && field.default !== ''
        ? { defaultValue: typeof field.default === 'object' ? JSON.stringify(field.default) : String(field.default) }
        : {}),
    };

    if (field.options && field.options.length > 0) {
      fieldDoc.options = field.options.map((o) => o.label);
    }

    // Add conditional-required note for non-operation requiredIf
    if (field.requiredIf && !reqIfOp && !isRequired) {
      fieldDoc.notes = `Required when ${field.requiredIf.field} is "${field.requiredIf.equals ?? 'set'}".`;
    }

    if (fieldDoc.type === 'password') {
      fieldDoc.notes = 'Stored and displayed as a masked credential value.';
    }

    fields.push(fieldDoc);
  }

  return fields;
}

function getCredentialType(slug: string): string {
  if (NO_CREDENTIAL_SLUGS.has(slug)) return 'None';
  return CREDENTIAL_TYPE_MAP[slug] ?? 'API Key';
}

function buildOperationDoc(
  slug: string,
  displayName: string,
  schema: NodeSchema | undefined,
  opName: string,
  opValue: string,
  externalDocsUrl: string,
): OperationDoc {
  const override =
    nodeContentOverrides[slug]?.[opValue] ??
    nodeContentOverrides[slug]?.['default'];

  const fields: FieldDoc[] = schema
    ? getFieldsForOperation(schema, opValue)
    : [];

  const outputExample: Record<string, unknown> =
    override?.outputExample ?? { success: true, data: {} };

  const outputDescription: string =
    override?.outputDescription ??
    Object.keys(outputExample)
      .map((k) => `${k}: Value returned by the ${displayName} node.`)
      .join('\n');

  const usageExample = override?.usageExample ?? {
    scenario: `Use ${displayName} to ${opName.toLowerCase()} in a workflow.`,
    inputValues: Object.fromEntries(
      fields.slice(0, 5).map((f) => [f.name, f.example ?? ''])
    ),
    expectedOutput: `The node executes ${opName.toLowerCase()} and exposes its result for downstream nodes.`,
  };

  return {
    name: opName,
    value: opValue,
    description: override?.description ?? `${opName} using the ${displayName} node.`,
    fields,
    outputExample,
    outputDescription,
    usageExample,
    externalDocsUrl,
  };
}

function buildNodeDoc(manifestItem: { slug: string; displayName: string; category: string; description: string; logoUrl: string }): NodeDoc {
  const { slug, displayName, category, logoUrl } = manifestItem;
  const schema = nodeLib.getSchema(slug);

  const credType = getCredentialType(slug);
  const credGuide = credType !== 'None' ? credentialSteps[credType] : undefined;

  const externalDocsUrl = OFFICIAL_DOCS[slug] ?? 'https://docs.ctrlchecks.com';

  const operations = schema
    ? getOperations(schema)
    : [{ name: 'Execute', value: 'default' }];

  const operationDocs: OperationDoc[] = operations.map(({ name, value }) =>
    buildOperationDoc(slug, displayName, schema, name, value, externalDocsUrl)
  );

  const hasMultipleOps = operationDocs.length > 1;
  const resource: ResourceDoc = {
    name: hasMultipleOps ? 'Operations' : 'Configuration',
    description: hasMultipleOps
      ? `${displayName} exposes operation choices directly.`
      : `${displayName} is configured directly with input fields.`,
    operations: operationDocs,
  };

  return {
    slug,
    displayName,
    category,
    logoUrl,
    description: schema?.description ?? manifestItem.description,
    credentialType: credType,
    credentialSetupSteps: credGuide?.steps ?? ['No credential required.'],
    credentialDocsUrl: credGuide?.docsUrl ?? externalDocsUrl,
    resources: [resource],
    commonErrors: buildCommonErrors(displayName, credType !== 'None'),
    relatedNodes: [],
  };
}

function buildCommonErrors(displayName: string, requiresAuth: boolean) {
  const errors = [
    {
      error: 'Required field missing',
      cause: 'A required input is empty or an upstream expression resolved to an empty value.',
      fix: 'Open the node, fill every required field, and check the upstream node output before running.',
    },
    {
      error: 'Invalid input format',
      cause: 'A field value does not match the format expected by the node or service API.',
      fix: 'Check JSON, date, URL, email, and ID fields against the examples shown in the node.',
    },
  ];
  if (requiresAuth) {
    errors.unshift({
      error: 'Authentication failed',
      cause: 'The saved credential, token, API key, or OAuth grant is missing, expired, or lacks the required scope.',
      fix: `Reconnect the service in CtrlChecks → Connections, then re-run the ${displayName} node.`,
    });
  }
  return errors;
}

// ── File writer ────────────────────────────────────────────────────────────────

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function writeDocFile(doc: NodeDoc): void {
  const constName = `${toCamelCase(doc.slug)}Doc`;
  const content =
    `import type { NodeDoc } from '../types';\n\nexport const ${constName}: NodeDoc = ${serialize(doc)};\n`;

  fs.mkdirSync(NODES_OUT, { recursive: true });
  fs.writeFileSync(path.join(NODES_OUT, `${doc.slug}.doc.ts`), content, 'utf8');
}

function writeIndexFile(docs: NodeDoc[]): void {
  const imports = docs
    .map((d) => {
      const constName = `${toCamelCase(d.slug)}Doc`;
      return `import { ${constName} } from './nodes/${d.slug}.doc';`;
    })
    .join('\n');

  const arrayItems = docs
    .map((d) => `  ${toCamelCase(d.slug)}Doc`)
    .join(',\n');

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

  fs.writeFileSync(path.join(DOCS_OUT, 'index.ts'), content, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`[generate-node-docs] Starting — ${nodeDocManifest.length} nodes to process`);

  fs.mkdirSync(NODES_OUT, { recursive: true });

  // Remove old doc files
  for (const file of fs.readdirSync(NODES_OUT)) {
    if (file.endsWith('.doc.ts')) fs.unlinkSync(path.join(NODES_OUT, file));
  }

  const docs: NodeDoc[] = [];
  let withSchema = 0;
  let withoutSchema = 0;

  for (const item of nodeDocManifest) {
    const schema = nodeLib.getSchema(item.slug);
    if (schema) withSchema++;
    else withoutSchema++;

    const doc = buildNodeDoc(item);
    writeDocFile(doc);
    docs.push(doc);
  }

  writeIndexFile(docs);

  console.log(`[generate-node-docs] Done.`);
  console.log(`  ✅ ${docs.length} .doc.ts files written to ctrl_checks/src/docs-content/nodes/`);
  console.log(`  ✅ index.ts regenerated`);
  console.log(`  📋 NodeLibrary schemas found: ${withSchema}/${nodeDocManifest.length}`);
  if (withoutSchema > 0) {
    const missing = nodeDocManifest
      .filter((item) => !nodeLib.getSchema(item.slug))
      .map((item) => item.slug);
    console.log(`  ⚠️  No schema for: ${missing.join(', ')}`);
  }
}

main();
