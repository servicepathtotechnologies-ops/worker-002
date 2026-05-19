/* eslint-disable no-console */
import { queryAsService } from '../src/core/database/db-pool';

type JsonObject = Record<string, any>;

interface WorkflowRow {
  id: string;
  name?: string | null;
  title?: string | null;
  nodes?: any;
  graph?: any;
  definition?: any;
}

interface Change {
  table: string;
  workflowId: string;
  workflowName?: string | null;
  path: string;
  before: unknown;
  after: unknown;
}

const APPLY = process.argv.includes('--apply');

const TYPE_ALIASES: Record<string, string> = {
  html_extract: 'html',
  schedule_trigger: 'schedule',
};

const STRIPE_OPERATION_ALIASES: Record<string, string> = {
  create_payment: 'paymentintent',
  create_payment_intent: 'paymentintent',
  get_payment: 'get_payment_intent',
  list_payments: 'list_payment_intents',
  create_refund: 'refund',
  create_customer: 'create_customer',
  create_subscription: 'create_subscription',
  create_invoice: 'create_invoice',
};

const SHOPIFY_OPERATION_ALIASES: Record<string, { resource: string; operation: string }> = {
  get_product: { resource: 'product', operation: 'get' },
  list_products: { resource: 'product', operation: 'list' },
  create_product: { resource: 'product', operation: 'create' },
  update_product: { resource: 'product', operation: 'update' },
  get_order: { resource: 'order', operation: 'get' },
  list_orders: { resource: 'order', operation: 'list' },
  create_order: { resource: 'order', operation: 'create' },
  get_customer: { resource: 'customer', operation: 'get' },
  list_customers: { resource: 'customer', operation: 'list' },
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function setWithChange(changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, obj: JsonObject, key: string, value: unknown, path: string) {
  if (JSON.stringify(obj[key]) === JSON.stringify(value)) return;
  changes.push({ ...meta, path, before: obj[key], after: value });
  obj[key] = value;
}

function deleteWithChange(changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, obj: JsonObject, key: string, path: string) {
  if (!(key in obj)) return;
  changes.push({ ...meta, path, before: obj[key], after: undefined });
  delete obj[key];
}

function canonicalType(type: unknown): string {
  const raw = String(type || '').trim();
  return TYPE_ALIASES[raw] || raw;
}

function normalizeConfig(nodeType: string, config: JsonObject, changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, path: string) {
  const opRaw = typeof config.operation === 'string' ? config.operation.trim() : '';
  const opLower = opRaw.toLowerCase();

  if (nodeType === 'stripe' && STRIPE_OPERATION_ALIASES[opLower]) {
    setWithChange(changes, meta, config, 'operation', STRIPE_OPERATION_ALIASES[opLower], `${path}.operation`);
  }

  if (nodeType === 'shopify') {
    const mapped = SHOPIFY_OPERATION_ALIASES[opLower];
    if (mapped) {
      setWithChange(changes, meta, config, 'resource', mapped.resource, `${path}.resource`);
      setWithChange(changes, meta, config, 'operation', mapped.operation, `${path}.operation`);
    }
    if (!config.apiKey && config.accessToken) setWithChange(changes, meta, config, 'apiKey', config.accessToken, `${path}.apiKey`);
    if (!config.data && config.productData) setWithChange(changes, meta, config, 'data', config.productData, `${path}.data`);
    if (!config.data && config.orderData) setWithChange(changes, meta, config, 'data', config.orderData, `${path}.data`);
  }

  if (nodeType === 'google_calendar') {
    if (!config.start && config.startTime) {
      setWithChange(changes, meta, config, 'start', { dateTime: config.startTime }, `${path}.start`);
      deleteWithChange(changes, meta, config, 'startTime', `${path}.startTime`);
    }
    if (!config.end && config.endTime) {
      setWithChange(changes, meta, config, 'end', { dateTime: config.endTime }, `${path}.end`);
      deleteWithChange(changes, meta, config, 'endTime', `${path}.endTime`);
    }
  }

  if (['aws_s3', 'dropbox', 'onedrive', 'box', 'minio'].includes(nodeType) && !config.data && !config.dataBase64 && config.content) {
    setWithChange(changes, meta, config, 'data', config.content, `${path}.data`);
  }

  if (nodeType === 'csv' && !config.csv) {
    if (config.content) setWithChange(changes, meta, config, 'csv', config.content, `${path}.csv`);
    else if (config.input) setWithChange(changes, meta, config, 'csv', config.input, `${path}.csv`);
  }

  if (nodeType === 'json_parser' && !config.json) {
    if (config.content) setWithChange(changes, meta, config, 'json', config.content, `${path}.json`);
    else if (config.input) setWithChange(changes, meta, config, 'json', config.input, `${path}.json`);
  }
}

function normalizeNode(node: JsonObject, changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, path: string) {
  const data = isObject(node.data) ? node.data : undefined;
  const rawNodeType = data?.type ?? node.nodeType ?? (node.type === 'custom' ? undefined : node.type);
  const nodeType = canonicalType(rawNodeType);

  if (!nodeType) return;

  if (data?.type && data.type !== nodeType) {
    setWithChange(changes, meta, data, 'type', nodeType, `${path}.data.type`);
  }
  if (node.nodeType && node.nodeType !== nodeType) {
    setWithChange(changes, meta, node, 'nodeType', nodeType, `${path}.nodeType`);
  }
  if (node.type && node.type !== 'custom' && node.type !== nodeType) {
    setWithChange(changes, meta, node, 'type', nodeType, `${path}.type`);
  }

  const config = isObject(data?.config) ? data!.config : isObject(node.config) ? node.config : undefined;
  if (config) normalizeConfig(nodeType, config, changes, meta, `${path}.${isObject(data?.config) ? 'data.config' : 'config'}`);
}

function normalizeNodesArray(nodes: unknown, changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, path: string) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node, index) => {
    if (isObject(node)) normalizeNode(node, changes, meta, `${path}[${index}]`);
  });
}

function normalizeDocument(doc: unknown, changes: Change[], meta: Omit<Change, 'path' | 'before' | 'after'>, path: string) {
  if (!isObject(doc)) return;
  normalizeNodesArray(doc.nodes, changes, meta, `${path}.nodes`);
  if (isObject(doc.graph)) normalizeNodesArray(doc.graph.nodes, changes, meta, `${path}.graph.nodes`);
  if (isObject(doc.definition)) normalizeNodesArray(doc.definition.nodes, changes, meta, `${path}.definition.nodes`);
}

async function tableColumns(table: string): Promise<Set<string>> {
  const rows = await queryAsService<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function processTable(table: string): Promise<{ workflowsScanned: number; workflowsChanged: number; changes: Change[] }> {
  const columns = await tableColumns(table);
  if (!columns.has('id')) return { workflowsScanned: 0, workflowsChanged: 0, changes: [] };

  const jsonColumns = ['nodes', 'graph', 'definition'].filter((column) => columns.has(column));
  if (jsonColumns.length === 0) return { workflowsScanned: 0, workflowsChanged: 0, changes: [] };

  const nameColumns = ['name', 'title'].filter((column) => columns.has(column));
  const selectColumns = ['id', ...nameColumns, ...jsonColumns].map((column) => `"${column}"`).join(', ');
  const rows = await queryAsService<WorkflowRow>(`SELECT ${selectColumns} FROM "${table}"`);
  const allChanges: Change[] = [];
  let workflowsChanged = 0;

  for (const row of rows) {
    const meta = { table, workflowId: row.id, workflowName: row.name ?? row.title ?? null };
    const before: WorkflowRow = clone(row);
    const changes: Change[] = [];

    for (const column of jsonColumns) {
      normalizeDocument((row as JsonObject)[column], changes, meta, column);
      if (column === 'nodes') normalizeNodesArray(row.nodes, changes, meta, 'nodes');
    }

    if (changes.length > 0) {
      workflowsChanged += 1;
      allChanges.push(...changes);

      if (APPLY) {
        const assignments = jsonColumns
          .filter((column) => JSON.stringify((before as JsonObject)[column]) !== JSON.stringify((row as JsonObject)[column]))
          .map((column, index) => `"${column}" = $${index + 2}::jsonb`);

        if (assignments.length > 0) {
          const params = [
            row.id,
            ...jsonColumns
              .filter((column) => JSON.stringify((before as JsonObject)[column]) !== JSON.stringify((row as JsonObject)[column]))
              .map((column) => JSON.stringify((row as JsonObject)[column])),
          ];
          const updatedAt = columns.has('updated_at') ? ', "updated_at" = NOW()' : '';
          await queryAsService(`UPDATE "${table}" SET ${assignments.join(', ')}${updatedAt} WHERE "id" = $1`, params);
        }
      }
    }
  }

  return { workflowsScanned: rows.length, workflowsChanged, changes: allChanges };
}

async function main() {
  const tables = ['workflows', 'memory_workflows'];
  const results = [];

  for (const table of tables) {
    try {
      results.push({ table, ...(await processTable(table)) });
    } catch (error) {
      results.push({
        table,
        workflowsScanned: 0,
        workflowsChanged: 0,
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const changes = results.flatMap((result) => result.changes);
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    tables: results.map(({ changes: _changes, ...result }) => result),
    totalChanges: changes.length,
    changes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
