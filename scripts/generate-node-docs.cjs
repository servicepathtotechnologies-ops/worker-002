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
const { credentialSteps } = loadTsData(path.join(DOCS_SRC, 'credential-steps.ts'));

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
  google_gemini: 'Google Gemini API Key',
  openai_gpt: 'OpenAI API Key',
  anthropic_claude: 'Anthropic API Key',
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
  if (field.type === 'number') return '10';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'object') return '{"key":"value"}';
  if (field.type === 'array') return '["item"]';
  return undefined;
}

/** Detect operations for a multi-op node from the `operation` field. */
function getOperations(schema) {
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
function getFieldsForOperation(schema, opValue) {
  const { required: requiredList, optional } = schema.configSchema;
  const isSingleOp = opValue === 'default';
  const fields = [];

  for (const [key, field] of Object.entries(optional)) {
    if (key === 'credentialId' || key === 'operation') continue;

    const reqIfOp = field.requiredIf && field.requiredIf.field === 'operation';
    const visIfOp = field.visibleIf && field.visibleIf.field === 'operation';

    if (!isSingleOp) {
      if (reqIfOp && field.requiredIf.equals !== undefined && field.requiredIf.equals !== opValue) continue;
      if (visIfOp && field.visibleIf.equals !== opValue) continue;
    }

    const isRequired =
      requiredList.includes(key) ||
      (reqIfOp && field.requiredIf.equals === opValue);

    const ex = exampleFor(key, field);

    const fieldDoc = {
      name: toDisplayName(key),
      internalKey: key,
      type: inferFieldType(key, field),
      required: isRequired,
      description: field.description || `${toDisplayName(key)} for this node.`,
    };

    if (ex !== undefined) {
      fieldDoc.example = ex;
      fieldDoc.placeholder = ex;
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

  return fields;
}

/** Build a real output example from NODE_OUTPUT_SCHEMAS or content overrides. */
function buildOutputExample(slug, opValue) {
  // Check content overrides first
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.outputExample) return override.outputExample;

  // Fall back to NODE_OUTPUT_SCHEMAS
  const schema = NODE_OUTPUT_SCHEMAS[slug];
  if (!schema) return { success: true, data: {} };

  const type = schema.type;
  if (type === 'string') return { result: 'Operation completed successfully.', text: '' };
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

  return { success: true, data: {} };
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

function buildOutputDescription(slug, opValue) {
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.outputDescription) return override.outputDescription;

  const example = buildOutputExample(slug, opValue);
  if (Array.isArray(example)) {
    return 'Returns an array of result objects. Access individual fields via {{$json.fieldName}} in downstream nodes.';
  }
  return Object.keys(example)
    .map((k) => `${k}: Value returned by this node.`)
    .join('\n');
}

function buildUsageExample(slug, displayName, opValue, opName, fields) {
  const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][opValue]) ||
    (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);
  if (override && override.usageExample) return override.usageExample;

  const inputValues = {};
  for (const f of fields.slice(0, 5)) {
    inputValues[f.name] = f.example || '';
  }

  return {
    scenario: `Use ${displayName} to ${opName.toLowerCase()} in a workflow.`,
    inputValues,
    expectedOutput: `The node executes ${opName.toLowerCase()} and exposes its result for downstream nodes.`,
  };
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
  const credGuide = credType !== 'None' ? credentialSteps[credType] : null;
  const hasAuth = credType !== 'None';

  const externalDocsUrl = OFFICIAL_DOCS[slug] || 'https://docs.ctrlchecks.com';
  const operations = schema ? getOperations(schema) : [{ name: 'Execute', value: 'default' }];

  const operationDocs = operations.map(({ name, value }) => {
    const override = (nodeContentOverrides[slug] && nodeContentOverrides[slug][value]) ||
      (nodeContentOverrides[slug] && nodeContentOverrides[slug]['default']);

    const fields = schema ? getFieldsForOperation(schema, value) : [];

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
