require('ts-node/register');

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const outRoot = path.join(repoRoot, 'ctrl_checks', 'src', 'docs-content');
const nodesOut = path.join(outRoot, 'nodes');
const searchOut = path.join(outRoot, 'search');

const silent = console.log;
console.log = () => {};
console.warn = () => {};
console.error = () => {};
require('../src/nodes/definitions');
const { unifiedNodeRegistry } = require('../src/core/registry/unified-node-registry');
console.log = silent;

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
  zoho_crm: 'https://www.zoho.com/crm/developer/docs/api/v6/'
};

const CATEGORY_LABELS = {
  ai: 'AI',
  communication: 'Communication',
  data: 'Data',
  logic: 'Logic',
  transformation: 'Transformation',
  trigger: 'Triggers',
  utility: 'Utility'
};

function pascal(value) {
  return String(value)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function optionValues(field) {
  return (field && field.ui && Array.isArray(field.ui.options) ? field.ui.options : [])
    .map((o) => String(o.label || o.value))
    .filter(Boolean);
}

function optionPairs(field) {
  return (field && field.ui && Array.isArray(field.ui.options) ? field.ui.options : [])
    .map((o) => ({ label: String(o.label || o.value), value: String(o.value || o.label) }))
    .filter((o) => o.value);
}

function displayFromKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapFieldType(key, field) {
  const lower = key.toLowerCase();
  const widget = field.ui && field.ui.widget;
  if (optionValues(field).length > 0) return 'select';
  if (widget === 'textarea') return 'textarea';
  if (widget === 'json' || field.type === 'object' || field.type === 'array' || field.type === 'json') return 'json';
  if (lower.includes('password') || lower.includes('secret') || lower.includes('token') || lower.includes('apikey') || lower.includes('api_key')) return 'password';
  if (lower.includes('email')) return 'email';
  if (lower.includes('url') || lower.includes('endpoint')) return 'url';
  if (lower.includes('date') || lower.includes('time')) return 'date';
  if (field.type === 'number') return 'number';
  if (field.type === 'boolean') return 'boolean';
  return 'string';
}

function exampleFor(key, field) {
  if (field.exampleValue !== undefined) return String(field.exampleValue);
  if (Array.isArray(field.examples) && field.examples.length) return String(field.examples[0]);
  if (field.default !== undefined && field.default !== null && field.default !== '') {
    return typeof field.default === 'object' ? JSON.stringify(field.default) : String(field.default);
  }
  const lower = key.toLowerCase();
  if (optionValues(field).length) return optionValues(field)[0];
  if (lower.includes('email')) return '{{ $json.email }}';
  if (lower.includes('url')) return 'https://api.example.com/resource';
  if (lower.includes('message') || lower.includes('body') || lower.includes('text')) return 'Created from workflow data: {{ $json.summary }}';
  if (lower.includes('query')) return 'status:open';
  if (field.type === 'number') return '25';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'object' || field.type === 'json') return '{"key":"value"}';
  if (field.type === 'array') return '["value"]';
  return `{{ $json.${key} }}`;
}

function fieldDoc(key, field) {
  const options = optionValues(field);
  const out = {
    name: displayFromKey(key),
    internalKey: key,
    type: mapFieldType(key, field),
    required: !!field.required,
    description: field.description || `${displayFromKey(key)} used by this node.`,
    example: exampleFor(key, field)
  };
  if (field.exampleValue || (Array.isArray(field.examples) && field.examples.length)) out.placeholder = exampleFor(key, field);
  if (field.default !== undefined) out.defaultValue = typeof field.default === 'object' ? JSON.stringify(field.default) : String(field.default);
  if (options.length) out.options = options;
  if (out.type === 'password') out.notes = 'Stored and displayed as a masked credential value.';
  return out;
}

function exampleValueForSchema(schema, key) {
  const type = schema && schema.type ? schema.type : 'string';
  if (key.toLowerCase().includes('success')) return true;
  if (type === 'number' || type === 'integer') return 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return key;
}

function outputExample(def) {
  const port = def.outputSchema && (def.outputSchema.default || Object.values(def.outputSchema)[0]);
  const props = port && port.schema && port.schema.properties;
  if (props && typeof props === 'object' && Object.keys(props).length) {
    const out = {};
    for (const [key, value] of Object.entries(props)) {
      out[key] = exampleValueForSchema(value, key);
    }
    return out;
  }
  return {
    success: true,
    data: {},
    nodeType: def.type
  };
}

function outputDescription(def) {
  const port = def.outputSchema && (def.outputSchema.default || Object.values(def.outputSchema)[0]);
  const props = port && port.schema && port.schema.properties;
  if (props && typeof props === 'object' && Object.keys(props).length) {
    return Object.keys(props)
      .map((key) => `${key}: ${props[key].description || `Value returned by the ${def.label} node.`}`)
      .join('\n');
  }
  return `success: Indicates that the ${def.label} node completed successfully.\ndata: Contains the service response or transformed payload returned at runtime.\nnodeType: The CtrlChecks node type that produced this output.`;
}

function credentialInfo(def) {
  const schema = def.credentialSchema;
  const requirements = schema && Array.isArray(schema.requirements) ? schema.requirements : [];
  const fields = schema && Array.isArray(schema.credentialFields) ? schema.credentialFields : [];
  if (!requirements.length && !fields.length) {
    return {
      type: 'None',
      url: '',
      steps: []
    };
  }
  const providers = Array.from(new Set(requirements.map((r) => r.provider).filter(Boolean)));
  const provider = providers[0] || fields[0] || 'service';
  const type = requirements.length
    ? requirements.map((r) => `${displayFromKey(r.provider)} ${displayFromKey(r.category)}`).join(', ')
    : `${displayFromKey(provider)} Credential`;
  return {
    type,
    url: OFFICIAL_DOCS[def.type] || 'https://docs.ctrlchecks.com',
    steps: [
      `Open the ${def.label} developer console or account settings.`,
      'Create or locate the required API key, token, OAuth client, webhook URL, or connection value.',
      'In CtrlChecks, open Connections or the node configuration panel for this service.',
      `Add the ${type} value and save the connection.`,
      'Test the connection before running the workflow.'
    ]
  };
}

function makeOperation(def, opLabel, opValue, fields, externalDocsUrl) {
  const fieldDocs = fields.map(([key, field]) => fieldDoc(key, field));
  const inputValues = Object.fromEntries(fieldDocs.slice(0, 10).map((f) => [f.name, f.example || '']));
  return {
    name: opLabel,
    value: opValue,
    description: `${opLabel} with the ${def.label} node using the configured input fields.`,
    fields: fieldDocs,
    outputExample: outputExample(def),
    outputDescription: outputDescription(def),
    usageExample: {
      scenario: `Use ${def.label} in a workflow and pass upstream data into ${opLabel.toLowerCase()}.`,
      inputValues,
      expectedOutput: `The node runs ${opLabel.toLowerCase()} and exposes its result in the output panel for the next node.`
    },
    externalDocsUrl
  };
}

function resourcesFor(def) {
  const entries = Object.entries(def.inputSchema || {});
  const resource = entries.find(([key]) => key === 'resource');
  const operation = entries.find(([key]) => key === 'operation');
  const resourceOptions = resource ? optionPairs(resource[1]) : [];
  const operationOptions = operation ? optionPairs(operation[1]) : [];
  const fieldsWithoutSelectors = entries.filter(([key]) => key !== 'resource' && key !== 'operation');
  const fields = entries;
  const docsUrl = OFFICIAL_DOCS[def.type] || 'https://docs.ctrlchecks.com';

  if (resourceOptions.length && operationOptions.length) {
    return resourceOptions.map((res) => ({
      name: res.label,
      description: `${res.label} is a ${def.label} resource available in this node.`,
      operations: operationOptions.map((op) => makeOperation(def, op.label, op.value, fieldsWithoutSelectors, docsUrl))
    }));
  }

  if (operationOptions.length) {
    return [
      {
        name: 'Operations',
        description: `${def.label} exposes operation choices directly.`,
        operations: operationOptions.map((op) => makeOperation(def, op.label, op.value, fieldsWithoutSelectors, docsUrl))
      }
    ];
  }

  return [
    {
      name: 'Configuration',
      description: `${def.label} is configured directly with input fields and does not use a resource or operation selector.`,
      operations: [
        makeOperation(def, 'Configure', 'configure', fields, docsUrl)
      ]
    }
  ];
}

function commonErrors(def) {
  const creds = credentialInfo(def);
  const errors = [
    {
      error: 'Required field missing',
      cause: 'A required input is empty or an expression resolved to an empty value.',
      fix: 'Open the node, fill the required field, and inspect upstream output before running again.'
    },
    {
      error: 'Invalid input format',
      cause: 'A field value does not match the format expected by the node or service API.',
      fix: 'Check JSON, date, URL, email, and ID fields against the examples shown in the node.'
    }
  ];
  if (creds.type !== 'None') {
    errors.unshift({
      error: 'Authentication failed',
      cause: 'The saved connection, token, API key, or OAuth grant is missing, expired, or lacks permission.',
      fix: 'Reconnect the service in CtrlChecks Connections, then run the node again.'
    });
  }
  return errors;
}

function relatedNodes(def, defs) {
  return defs
    .filter((other) => other.type !== def.type && other.category === def.category)
    .slice(0, 5)
    .map((other) => other.type);
}

function nodeDoc(def, defs) {
  const creds = credentialInfo(def);
  return {
    slug: def.type,
    displayName: def.label,
    category: CATEGORY_LABELS[def.category] || displayFromKey(def.category),
    logoUrl: `/icons/nodes/${def.type}.svg`,
    description: `${def.description} Use this node when a workflow needs ${def.label.toLowerCase()} behavior with schema-driven inputs from the CtrlChecks node registry.`,
    credentialType: creds.type,
    credentialSetupSteps: creds.steps,
    credentialDocsUrl: creds.url,
    resources: resourcesFor(def),
    commonErrors: commonErrors(def),
    relatedNodes: relatedNodes(def, defs)
  };
}

function writeTs(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

const defs = unifiedNodeRegistry.getAllTypes().map((type) => unifiedNodeRegistry.get(type));
fs.mkdirSync(nodesOut, { recursive: true });
for (const file of fs.readdirSync(nodesOut)) {
  if (file.endsWith('.doc.ts')) fs.unlinkSync(path.join(nodesOut, file));
}

for (const def of defs) {
  const constName = `${def.type.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())}Doc`;
  const doc = nodeDoc(def, defs);
  writeTs(
    path.join(nodesOut, `${def.type}.doc.ts`),
    `import type { NodeDoc } from '../types';\n\nexport const ${constName}: NodeDoc = ${serialize(doc)};\n`
  );
}

const imports = defs
  .map((def) => {
    const constName = `${def.type.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())}Doc`;
    return `import { ${constName} } from './nodes/${def.type}.doc';`;
  })
  .join('\n');
const arrayItems = defs
  .map((def) => `  ${def.type.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())}Doc`)
  .join(',\n');

writeTs(
  path.join(outRoot, 'index.ts'),
  `import type { NodeDoc } from './types';\n${imports}\n\nexport const allNodes: NodeDoc[] = [\n${arrayItems},\n];\n\nexport const nodesBySlug = Object.fromEntries(\n  allNodes.map((node) => [node.slug, node])\n) as Record<string, NodeDoc>;\n\nexport const nodesByCategory = allNodes.reduce((acc, node) => {\n  if (!acc[node.category]) acc[node.category] = [];\n  acc[node.category].push(node);\n  return acc;\n}, {} as Record<string, NodeDoc[]>);\n\nexport const searchIndex = allNodes.flatMap((node) => {\n  const nodeEntry = {\n    type: 'node' as const,\n    title: node.displayName,\n    slug: node.slug,\n    category: node.category,\n    href: \`/docs/nodes/\${node.slug}\`,\n    text: [node.displayName, node.description, node.category].join(' '),\n  };\n\n  const operationEntries = node.resources.flatMap((resource) =>\n    resource.operations.map((operation) => ({\n      type: 'operation' as const,\n      title: \`\${node.displayName}: \${operation.name}\`,\n      slug: node.slug,\n      category: node.category,\n      href: \`/docs/nodes/\${node.slug}#operation-\${operation.value}\`,\n      text: [node.displayName, resource.name, operation.name, operation.description].join(' '),\n    }))\n  );\n\n  const fieldEntries = node.resources.flatMap((resource) =>\n    resource.operations.flatMap((operation) =>\n      operation.fields.map((field) => ({\n        type: 'field' as const,\n        title: \`\${node.displayName}: \${field.name}\`,\n        slug: node.slug,\n        category: node.category,\n        href: \`/docs/nodes/\${node.slug}#operation-\${operation.value}\`,\n        text: [node.displayName, resource.name, operation.name, field.name, field.description].join(' '),\n      }))\n    )\n  );\n\n  return [nodeEntry, ...operationEntries, ...fieldEntries];\n});\n`
);

const manifestItems = defs.map((def) => {
  const doc = nodeDoc(def, defs);
  return {
    slug: doc.slug,
    displayName: doc.displayName,
    category: doc.category,
    description: doc.description,
    logoUrl: doc.logoUrl,
  };
});

writeTs(
  path.join(outRoot, 'manifest.ts'),
  `export interface NodeDocManifestItem {\n  slug: string;\n  displayName: string;\n  category: string;\n  description: string;\n  logoUrl: string;\n}\n\nexport const nodeDocManifest = ${serialize(manifestItems)} satisfies NodeDocManifestItem[];\n\nexport const nodeManifestBySlug = Object.fromEntries(\n  nodeDocManifest.map((node) => [node.slug, node])\n) as Record<string, NodeDocManifestItem>;\n\nexport const nodeManifestByCategory = nodeDocManifest.reduce((acc, node) => {\n  if (!acc[node.category]) acc[node.category] = [];\n  acc[node.category].push(node);\n  return acc;\n}, {} as Record<string, NodeDocManifestItem[]>);\n`
);

const compactSearchIndex = defs.flatMap((def) => {
  const doc = nodeDoc(def, defs);
  const entries = [
    {
      type: 'node',
      title: doc.displayName,
      slug: doc.slug,
      category: doc.category,
      href: `/docs/nodes/${doc.slug}`,
      text: [doc.displayName, doc.description, doc.category].join(' ')
    }
  ];
  for (const resource of doc.resources) {
    for (const operation of resource.operations) {
      entries.push({
        type: 'operation',
        title: `${doc.displayName}: ${operation.name}`,
        slug: doc.slug,
        category: doc.category,
        href: `/docs/nodes/${doc.slug}#operation-${operation.value}`,
        text: [doc.displayName, resource.name, operation.name, operation.description, operation.value].join(' ')
      });
      for (const field of operation.fields) {
        entries.push({
          type: 'field',
          title: `${doc.displayName}: ${field.name}`,
          slug: doc.slug,
          category: doc.category,
          href: `/docs/nodes/${doc.slug}#operation-${operation.value}`,
          text: [doc.displayName, resource.name, operation.name, field.name, field.internalKey, field.description].join(' ')
        });
      }
    }
  }
  return entries;
});

fs.mkdirSync(searchOut, { recursive: true });
for (const file of fs.readdirSync(searchOut)) {
  if (file.endsWith('.ts')) fs.unlinkSync(path.join(searchOut, file));
}

const searchLoaders = [];
for (const def of defs) {
  const key = def.type;
  const items = compactSearchIndex.filter((item) => item.slug === def.type);
  const exportName = `${def.type.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())}SearchIndex`;
  searchLoaders.push({ key, exportName });
  writeTs(
    path.join(searchOut, `${key}.ts`),
    `import type { DocsSearchIndexItem } from '../search-index';\n\nexport const ${exportName} = ${serialize(items)} satisfies DocsSearchIndexItem[];\n`
  );
}

writeTs(
  path.join(outRoot, 'search-index.ts'),
  `export type DocsSearchIndexItem = {\n  type: 'node' | 'operation' | 'field';\n  title: string;\n  slug: string;\n  category: string;\n  href: string;\n  text: string;\n};\n\nexport async function loadDocsSearchIndex(): Promise<DocsSearchIndexItem[]> {\n  const chunks = await Promise.all([\n${searchLoaders.map(({ key, exportName }) => `    import('./search/${key}').then((mod) => mod.${exportName}),`).join('\n')}\n  ]);\n  return chunks.flat();\n}\n`
);

console.log(`Generated ${defs.length} node docs in ${nodesOut}`);
