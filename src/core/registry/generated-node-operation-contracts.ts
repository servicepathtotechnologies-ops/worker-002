import type { UnifiedNodeDefinition } from '../types/unified-node-contract';

export const GENERATED_NODE_OPERATION_VALUES: Record<string, string[]> = {
  activecampaign: ['add', 'delete', 'update'],
  aggregate: ['avg', 'count', 'join', 'max', 'min', 'sum'],
  airtable: ['create', 'delete', 'read', 'update'],
  aws_s3: ['download', 'list', 'upload'],
  bitbucket: ['create', 'delete', 'read', 'update'],
  calendly: ['get_event_types', 'get_events', 'get_scheduled_events', 'get_user'],
  chargebee: ['cancel_subscription', 'create_customer', 'create_subscription', 'get_customer'],
  clickup: ['create_task', 'get_tasks_list', 'get_tasks_space'],
  contentful: ['create_entry', 'delete_entry', 'get_entries', 'get_entry', 'update_entry'],
  csv: ['generate', 'parse'],
  date_time: ['add', 'convertTimezone', 'diff', 'format', 'getTimezoneInfo', 'now', 'subtract'],
  db: ['delete', 'insert', 'select', 'update'],
  dropbox: ['delete', 'list', 'read', 'upload'],
  freshdesk: ['create', 'delete', 'list', 'update'],
  ftp: ['delete', 'get', 'list', 'put'],
  github: ['add_issue_comment', 'create_issue', 'create_pr', 'list_repos', 'trigger_workflow'],
  gitlab: ['create', 'read'],
  google_calendar: ['create', 'delete', 'get', 'list', 'search', 'update'],
  google_contacts: ['create', 'delete', 'read', 'update'],
  google_doc: ['append', 'create', 'read', 'write'],
  google_drive: ['download', 'list', 'upload'],
  google_gmail: ['get', 'list', 'search', 'send'],
  google_sheets: ['append', 'read', 'update', 'write'],
  google_tasks: ['create', 'delete', 'read', 'update'],
  html: ['extract', 'parse', 'toText'],
  hubspot: ['batchCreate', 'batchDelete', 'batchUpdate', 'create', 'delete', 'get', 'getMany', 'search', 'update'],
  instagram: ['createAndPublish', 'delete', 'get', 'getMedia', 'getRecentMedia', 'hide', 'list', 'reply', 'replyDM', 'search', 'sendMedia', 'sendTemplate', 'sendText', 'unhide'],
  intercom: ['get', 'list', 'send'],
  intuit_smes: ['createCustomer', 'createInvoice', 'getCustomers', 'getInvoices', 'updateCustomer'],
  jenkins: ['build', 'cancel', 'status'],
  jira: ['create', 'delete', 'read', 'update'],
  langchain: ['run_agent', 'run_chain'],
  linkedin: ['get_profile', 'create_post', 'create_post_media', 'create_article', 'delete_post'],
  mailchimp: ['send', 'subscribe', 'unsubscribe'],
  mailgun: ['send_email'],
  math: ['add', 'divide', 'multiply', 'subtract'],
  microsoft_dynamics: ['createRecord', 'deleteRecord', 'fetchXml', 'getRecord', 'getRecords', 'updateRecord'],
  mongodb: ['delete', 'find', 'insert', 'update'],
  netlify: ['create_deploy', 'get_deploy', 'get_site', 'list_deploys', 'list_sites'],
  notion: ['appendChildren', 'archive', 'create', 'delete', 'get', 'getMe', 'list', 'listChildren', 'query', 'restore', 'search', 'update'],
  odoo: ['createRecord', 'deleteRecord', 'executeMethod', 'getRecords', 'updateRecord'],
  onedrive: ['delete', 'list', 'read', 'upload'],
  oracle_database: ['delete', 'execute_sql', 'insert', 'insert_or_update', 'select', 'update'],
  outlook: ['send_email'],
  paypal: ['charge', 'refund'],
  pinecone: ['delete', 'query', 'upsert'],
  pipedrive: ['create', 'delete', 'get', 'search', 'update'],
  redis: ['delete', 'get', 'set'],
  salesforce: ['bulkCreate', 'bulkDelete', 'bulkUpdate', 'bulkUpsert', 'create', 'delete', 'get', 'query', 'search', 'update', 'upsert'],
  sap: ['delete', 'get', 'patch', 'post', 'put'],
  sendgrid: ['send_email'],
  sftp: ['delete', 'get', 'list', 'put'],
  shopify: ['create', 'delete', 'get', 'update'],
  sql_server: ['delete', 'executeQuery', 'insert', 'storedProcedure', 'update'],
  stripe: ['create_customer', 'create_invoice', 'create_payment_intent', 'create_refund', 'create_subscription', 'get_payment', 'list_payments'],
  tally: ['create_voucher', 'get_company_info', 'get_ledger', 'get_stock_items', 'get_voucher'],
  timescaledb: ['delete', 'executeQuery', 'first', 'insert', 'last', 'timeBucket', 'update'],
  twitter: ['create', 'delete', 'get', 'getMe', 'recent'],
  typeform: ['create_form', 'get_form', 'get_responses'],
  vercel: ['deploy', 'list_deployments'],
  whatsapp: ['markAsRead', 'sendContact', 'sendInteractiveButtons', 'sendInteractiveCTA', 'sendInteractiveList', 'sendLocation', 'sendMedia', 'sendTemplate', 'sendText'],
  whatsapp_cloud: ['sendContact', 'sendLocation', 'sendMedia', 'sendReaction', 'sendTemplate', 'sendText'],
  woocommerce: ['create', 'delete', 'get', 'update'],
  wordpress: ['create_post', 'delete_post', 'get_posts', 'update_post'],
  workday: ['create', 'get_by_id', 'get_many', 'update'],
  xero: ['create', 'get_by_id', 'get_many', 'update'],
  xml: ['extract', 'parse', 'validate'],
  youtube: ['list_my_channels', 'get_channel', 'search_videos', 'get_video_stats', 'upload_video', 'update_video_metadata', 'delete_video'],
  zendesk: ['create_ticket', 'delete_ticket', 'get_ticket', 'get_tickets', 'get_users', 'update_ticket'],
  zoho_crm: ['create', 'delete', 'get', 'search', 'update'],
  zoom_video: ['createMeeting', 'deleteMeeting', 'getMeeting', 'listMeetings', 'updateMeeting'],
};

function labelForOperation(operation: string): string {
  return operation.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function applyGeneratedOperationContracts(def: UnifiedNodeDefinition): UnifiedNodeDefinition {
  const operations = GENERATED_NODE_OPERATION_VALUES[def.type];
  if (!operations || operations.length === 0) return def;

  const existingOperationField = ((def.inputSchema.operation || {
    type: 'string',
    description: 'Operation to perform',
    required: true,
  }) as unknown) as Record<string, unknown>;
  const {
    options: _oldOptions,
    enum: _oldEnum,
    examples: _oldExamples,
    ...operationFieldBase
  } = existingOperationField;
  const existingUiOptions = ((existingOperationField.ui as { options?: Array<string | { label?: string; value?: string }> } | undefined)?.options || []);
  const existingOptionLabels = new Map(
    existingUiOptions
      .map((option): [string, string] | null => {
        if (typeof option === 'string') return [option, labelForOperation(option)];
        if (option && typeof option.value === 'string') return [option.value, option.label || labelForOperation(option.value)];
        return null;
      })
      .filter((option): option is [string, string] => Boolean(option)),
  );
  const requiredFields = def.requiredInputs || [];
  const optionalFields = Object.keys(def.inputSchema || {}).filter((key) => !requiredFields.includes(key));
  const credentialProviders = Array.from(new Set((def.credentialSchema?.requirements || []).map((req) => req.provider).filter(Boolean)));
  const outputFields = Object.keys(def.outputSchema || {});
  const existingContracts = def.operationContracts?.filter((contract) => operations.includes(contract.operation)) || [];

  return {
    ...def,
    inputSchema: {
      ...def.inputSchema,
      operation: ({
        ...operationFieldBase,
        default: operations.includes(String((def.inputSchema.operation as any)?.default || ''))
          ? (def.inputSchema.operation as any)?.default
          : operations[0],
        ui: {
          ...((def.inputSchema.operation as any)?.ui || {}),
          options: operations.map((operation) => ({
            label: existingOptionLabels.get(operation) || labelForOperation(operation),
            value: operation,
          })),
        },
      } as any),
    },
    operationContracts: existingContracts.length > 0
      ? existingContracts
      : operations.map((operation) => ({
          operation,
          label: labelForOperation(operation),
          requiredFields,
          optionalFields: optionalFields.filter((field) => field !== 'operation'),
          credentialProviders,
          outputFields,
          legacyAliases: [],
          status: 'implemented' as const,
        })),
  };
}
