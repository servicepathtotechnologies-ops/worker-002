/**
 * Notion Node Override — n8n-style structured inputs
 *
 * Zero JSON required from users. All content fields accept plain text.
 * The executor converts structured inputs into Notion API payloads internally.
 *
 * Resources & operations mirrored from n8n's Notion node:
 *   page     → get | create | update | archive | restore
 *   database → get | list | query | create | update
 *   block    → get | listChildren | appendChildren | update | delete
 *   user     → get | list | getMe
 *   comment  → list | create
 *   search   → search
 */

import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult, NodeInputSchema } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { resolveOAuthTokenString } from '../../../shared/credential-resolver';
import { Client } from '@notionhq/client';

// ─── Notion rich-text & block builders ───────────────────────────────────────

function toRichText(text: string) {
  return [{ type: 'text' as const, text: { content: text || '' } }];
}

const BLOCK_TYPES = [
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list_item', 'numbered_list_item', 'toggle',
  'quote', 'callout', 'code', 'divider',
] as const;
type BlockType = typeof BLOCK_TYPES[number];

function toBlock(type: BlockType, content: string, language = 'plain text') {
  if (type === 'divider') return { type: 'divider', divider: {} };
  if (type === 'code') return { type: 'code', code: { rich_text: toRichText(content), language } };
  return { type, [type]: { rich_text: toRichText(content) } };
}

// Convert simplified JSON like {"Status":"Done","Count":3} → Notion property format
// Supports type hints written as {"field__type": value} e.g. {"Done__checkbox": true}
function buildPropertiesFromSimpleJson(raw: any, titleText?: string): Record<string, any> {
  const props: Record<string, any> = {};

  // Always add title if provided
  if (titleText) {
    props['title'] = { title: toRichText(titleText) };
  }

  if (!raw || typeof raw !== 'object') return props;

  for (const [rawKey, val] of Object.entries(raw)) {
    // Support "FieldName__type" hint notation
    const [fieldName, typeHint] = rawKey.includes('__') ? rawKey.split('__') : [rawKey, null];

    const strVal = String(val ?? '');
    const type = typeHint || guessPropertyType(strVal);

    switch (type) {
      case 'title':
        props[fieldName] = { title: toRichText(strVal) };
        break;
      case 'rich_text':
      case 'text':
        props[fieldName] = { rich_text: toRichText(strVal) };
        break;
      case 'number':
        props[fieldName] = { number: typeof val === 'number' ? val : parseFloat(strVal) || 0 };
        break;
      case 'checkbox':
        props[fieldName] = { checkbox: val === true || strVal === 'true' || strVal === '1' };
        break;
      case 'select':
        props[fieldName] = { select: { name: strVal } };
        break;
      case 'multi_select':
        props[fieldName] = { multi_select: strVal.split(',').map(v => ({ name: v.trim() })).filter(v => v.name) };
        break;
      case 'date':
        props[fieldName] = { date: { start: strVal } };
        break;
      case 'url':
        props[fieldName] = { url: strVal };
        break;
      case 'email':
        props[fieldName] = { email: strVal };
        break;
      case 'phone_number':
        props[fieldName] = { phone_number: strVal };
        break;
      case 'status':
        props[fieldName] = { status: { name: strVal } };
        break;
      default:
        props[fieldName] = { rich_text: toRichText(strVal) };
    }
  }

  return props;
}

function guessPropertyType(value: string): string {
  if (value === 'true' || value === 'false') return 'checkbox';
  if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  if (/^https?:\/\//.test(value)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  return 'rich_text';
}

function parseJsonSafe(value: any): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

function buildNotionFilter(
  property: string,
  type: string,
  condition: string,
  value: string,
): any {
  const prop = property;
  switch (type) {
    case 'text':
    case 'rich_text':
    case 'title':
      return { property: prop, rich_text: { [condition]: value } };
    case 'number':
      return { property: prop, number: { [condition]: parseFloat(value) || 0 } };
    case 'checkbox':
      return { property: prop, checkbox: { equals: value === 'true' || value === '1' } };
    case 'select':
      return { property: prop, select: { [condition]: value } };
    case 'multi_select':
      return { property: prop, multi_select: { [condition]: value } };
    case 'date':
      return { property: prop, date: { [condition]: value } };
    case 'status':
      return { property: prop, status: { [condition]: value } };
    default:
      return { property: prop, rich_text: { [condition]: value } };
  }
}

// ─── Paginator ────────────────────────────────────────────────────────────────

async function collectAll<T>(
  fn: (cursor?: string) => Promise<{ results: T[]; next_cursor: string | null; has_more: boolean }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const res = await fn(cursor);
    all.push(...res.results);
    hasMore = res.has_more && res.next_cursor !== null;
    cursor = res.next_cursor || undefined;
  }
  return all;
}

// ─── Token resolver ───────────────────────────────────────────────────────────

async function getNotionToken(context: NodeExecutionContext): Promise<string> {
  const direct = String(context.config?.accessToken || context.inputs?.accessToken || '').trim();
  if (direct) return direct;

  const ids: string[] = [];
  if (context.userId) ids.push(context.userId);
  if (context.currentUserId && context.currentUserId !== context.userId) ids.push(context.currentUserId);

  if (ids.length > 0) {
    const token = await resolveOAuthTokenString('notion', ids);
    if (token) return token;
  }

  throw new Error('Notion account not connected. Please connect via the Connections panel.');
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function str(v: any, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function num(v: any, fallback = 100): number {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? fallback : Math.min(Math.max(1, n), 100);
}

function bool(v: any, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

function merged(context: NodeExecutionContext): Record<string, any> {
  return { ...(context.config || {}), ...(context.inputs || {}) };
}

/**
 * Extracts a bare Notion UUID from whatever the user pastes:
 *   - Already a UUID with dashes  → returned as-is
 *   - 32-char hex string          → formatted with dashes
 *   - "PageName-...-<32hex>"      → last 32 hex chars extracted & formatted
 *   - Full Notion URL             → ID extracted from path segment
 */
function notionId(value: any): string {
  const raw = str(value);
  if (!raw) return '';

  // Already a properly dashed UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw.toLowerCase();
  }

  // Extract 32-char hex block — works for:
  //   "CtrlChecks-E2E-Root-Page-35355e30b52a81fc83ddfccfe6d52ca2"
  //   "https://www.notion.so/workspace/Page-35355e30b52a81fc83ddfccfe6d52ca2"
  const match = raw.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i);
  if (match) {
    const hex = match[1].toLowerCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Return as-is and let Notion API give a clear error
  return raw;
}

// ─── Override ─────────────────────────────────────────────────────────────────

export function overrideNotion(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {

  const runtimeAI = { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true };
  const buildAI   = { default: 'buildtime_ai_once' as const, supportsRuntimeAI: false, supportsBuildtimeAI: true };

  const resourceOpts = ['page', 'database', 'block', 'user', 'comment', 'search'].map(v => ({
    label: v.charAt(0).toUpperCase() + v.slice(1), value: v,
  }));

  const blockTypeOpts = BLOCK_TYPES.map(v => ({ label: v.replace(/_/g, ' '), value: v }));

  const filterTypeOpts = ['text', 'number', 'checkbox', 'select', 'multi_select', 'date', 'status'].map(v => ({ label: v, value: v }));
  const filterConditionOpts = [
    'equals', 'does_not_equal', 'contains', 'does_not_contain',
    'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
    'greater_than', 'greater_than_or_equal_to', 'less_than', 'less_than_or_equal_to',
  ].map(v => ({ label: v.replace(/_/g, ' '), value: v }));

  const inputSchema: NodeInputSchema = {
    // ── Selectors ───────────────────────────────────────────────────────────
    resource: {
      type: 'string',
      description: 'Notion resource: page, database, block, user, comment, search',
      required: true,
      default: 'page',
      fillMode: buildAI,
      ui: { options: resourceOpts },
    },
    operation: {
      type: 'string',
      description: 'Notion operation: read, create, update, delete',
      required: true,
      default: 'get',
      fillMode: buildAI,
      ui: {
        options: [
          { label: 'Get', value: 'get' },
          { label: 'List', value: 'list' },
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Archive', value: 'archive' },
          { label: 'Restore', value: 'restore' },
          { label: 'Query', value: 'query' },
          { label: 'Append Children', value: 'appendChildren' },
          { label: 'List Children', value: 'listChildren' },
          { label: 'Delete', value: 'delete' },
          { label: 'Get Me', value: 'getMe' },
          { label: 'Search', value: 'search' },
        ],
      },
    },

    // ── ID fields ────────────────────────────────────────────────────────────
    pageId: {
      type: 'string',
      description: 'Notion Page ID',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },
    databaseId: {
      type: 'string',
      description: 'Notion Database ID',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },
    parentPageId: {
      type: 'string',
      description: 'Parent Page ID (for creating pages or databases inside a page)',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },
    blockId: {
      type: 'string',
      description: 'Notion Block ID',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },
    userId: {
      type: 'string',
      description: 'Notion User ID',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },

    // ── Page / content fields ────────────────────────────────────────────────
    title: {
      type: 'string',
      description: 'Page title or database title (plain text — no JSON needed)',
      required: false,
      role: 'title_like',
      fillMode: runtimeAI,
    },
    content: {
      type: 'string',
      description: 'Page body / block text content (plain text)',
      required: false,
      role: 'content',
      fillMode: runtimeAI,
    },
    blockType: {
      type: 'string',
      description: 'Block type for create/append: paragraph, heading_1, heading_2, heading_3, bulleted_list_item, numbered_list_item, code, quote, toggle, divider',
      required: false,
      default: 'paragraph',
      fillMode: buildAI,
      ui: { options: blockTypeOpts },
    },
    codeLanguage: {
      type: 'string',
      description: 'Programming language for code blocks (e.g. javascript, python)',
      required: false,
      default: 'plain text',
      fillMode: buildAI,
    },

    // ── Properties (smart JSON — simple key:value, not Notion format) ────────
    properties: {
      type: 'string',
      description: 'Page properties as simple JSON. Example: {"Status":"In Progress","Priority":"High","Count":3,"Done":false}. Use "Field__type" for explicit types: {"Tags__multi_select":"Design,Frontend"}. No Notion API format required.',
      required: false,
      role: 'raw_json',
      fillMode: runtimeAI,
    },

    // ── Database query: simple filter ────────────────────────────────────────
    filterProperty: {
      type: 'string',
      description: 'Database filter: property name (e.g. "Status")',
      required: false,
      fillMode: runtimeAI,
    },
    filterType: {
      type: 'string',
      description: 'Database filter: property type (text, number, checkbox, select, multi_select, date, status)',
      required: false,
      default: 'text',
      fillMode: buildAI,
      ui: { options: filterTypeOpts },
    },
    filterCondition: {
      type: 'string',
      description: 'Database filter: condition (equals, contains, starts_with, greater_than, etc.)',
      required: false,
      default: 'equals',
      fillMode: buildAI,
      ui: { options: filterConditionOpts },
    },
    filterValue: {
      type: 'string',
      description: 'Database filter: value to match',
      required: false,
      fillMode: runtimeAI,
    },

    // ── Database sort ────────────────────────────────────────────────────────
    sortProperty: {
      type: 'string',
      description: 'Sort results by this property name (e.g. "Created")',
      required: false,
      fillMode: runtimeAI,
    },
    sortDirection: {
      type: 'string',
      description: 'Sort direction',
      required: false,
      default: 'ascending',
      fillMode: buildAI,
      ui: { options: [{ label: 'Ascending', value: 'ascending' }, { label: 'Descending', value: 'descending' }] },
    },

    // ── Comment text ─────────────────────────────────────────────────────────
    comment: {
      type: 'string',
      description: 'Comment text (plain text — no rich text JSON needed)',
      required: false,
      role: 'content',
      fillMode: runtimeAI,
    },
    parentDiscussionId: {
      type: 'string',
      description: 'Parent Discussion ID (for inline comments on a discussion thread)',
      required: false,
      role: 'id',
      fillMode: runtimeAI,
    },

    // ── Search ───────────────────────────────────────────────────────────────
    searchQuery: {
      type: 'string',
      description: 'Search query text (leave empty to list all)',
      required: false,
      fillMode: runtimeAI,
    },
    searchFilter: {
      type: 'string',
      description: 'Limit search to: page, database (leave empty for all)',
      required: false,
      fillMode: buildAI,
      ui: { options: [{ label: 'All', value: '' }, { label: 'Pages only', value: 'page' }, { label: 'Databases only', value: 'database' }] },
    },

    // ── Database create/update ───────────────────────────────────────────────
    schemaJson: {
      type: 'string',
      description: 'Database property schema as JSON. Example: {"Name":{"title":{}},"Status":{"select":{"options":[{"name":"To Do"},{"name":"Done"}]}},"Count":{"number":{}}}',
      required: false,
      role: 'raw_json',
      fillMode: buildAI,
    },
    isInline: {
      type: 'boolean',
      description: 'Create database inline inside a page (vs. full-page database)',
      required: false,
      default: false,
      fillMode: buildAI,
    },

    // ── Pagination ───────────────────────────────────────────────────────────
    returnAll: {
      type: 'boolean',
      description: 'Return all results (auto-paginate)',
      required: false,
      default: false,
      fillMode: buildAI,
    },
    pageSize: {
      type: 'number',
      description: 'Results per page (1–100)',
      required: false,
      default: 10,
      fillMode: buildAI,
    },
  };

  return {
    ...def,
    inputSchema,
    credentialSchema: {
      requirements: [{ provider: 'notion', category: 'oauth', required: true, description: 'Notion OAuth — connect via Connections panel' }],
      credentialFields: ['accessToken'],
    },

    execute: async (context: NodeExecutionContext): Promise<NodeExecutionResult> => {
      const cfg = merged(context);
      const resource  = str(cfg.resource,  'page');
      const operation = str(cfg.operation, 'get');

      let token: string;
      try {
        token = await getNotionToken(context);
      } catch (e: any) {
        return { success: false, error: { code: 'NOTION_NO_TOKEN', message: e.message } };
      }

      const notion = new Client({ auth: token });

      const clampedPageSize = () => num(cfg.pageSize, 10);
      const returnAll       = () => bool(cfg.returnAll, false);

      try {
        let result: any;

        // ════════════════════════════════════════════════════════════════════
        //  PAGE
        // ════════════════════════════════════════════════════════════════════
        if (resource === 'page') {

          if (operation === 'get') {
            const pageId = notionId(cfg.pageId);
            if (!pageId) throw new Error('pageId is required for page › get');
            result = await notion.pages.retrieve({ page_id: pageId });
          }

          else if (operation === 'create') {
            const databaseId   = notionId(cfg.databaseId);
            // Accept both 'parentPageId' and legacy 'parentId' key name
            const parentPageId = notionId(cfg.parentPageId) || notionId(cfg.parentId);

            if (!databaseId && !parentPageId) {
              throw new Error('Provide either databaseId (create row in database) or parentPageId (create child page)');
            }
            if (databaseId && parentPageId) {
              throw new Error('Provide either databaseId OR parentPageId, not both');
            }

            if (databaseId) {
              // ── Create page (row) in a database ──────────────────────────
              const simpleProps = parseJsonSafe(cfg.properties);
              const titleText   = str(cfg.title);
              const props = buildPropertiesFromSimpleJson(simpleProps, titleText || undefined);

              if (Object.keys(props).length === 0) {
                throw new Error('Provide at least a title, or a properties JSON with the page data');
              }

              result = await notion.pages.create({
                parent: { database_id: databaseId },
                properties: props as any,
              });

            } else {
              // ── Create child page ─────────────────────────────────────────
              const titleText   = str(cfg.title);
              const content     = str(cfg.content);
              const blockType   = (str(cfg.blockType, 'paragraph') || 'paragraph') as BlockType;
              const codeLanguage = str(cfg.codeLanguage, 'plain text');

              const pageData: any = {
                parent: { page_id: parentPageId },
                properties: {
                  title: { title: toRichText(titleText || 'Untitled') },
                },
              };

              if (content) {
                pageData.children = [toBlock(blockType, content, codeLanguage)];
              }

              result = await notion.pages.create(pageData);
            }
          }

          else if (operation === 'update') {
            const pageId = notionId(cfg.pageId);
            if (!pageId) throw new Error('pageId is required for page › update');

            const simpleProps = parseJsonSafe(cfg.properties);
            const titleText   = str(cfg.title);
            const props = buildPropertiesFromSimpleJson(simpleProps, titleText || undefined);

            if (Object.keys(props).length === 0) {
              throw new Error('Provide title and/or properties to update');
            }

            result = await notion.pages.update({ page_id: pageId, properties: props as any });
          }

          else if (operation === 'archive') {
            const pageId = notionId(cfg.pageId);
            if (!pageId) throw new Error('pageId is required for page › archive');
            result = await notion.pages.update({ page_id: pageId, archived: true });
          }

          else if (operation === 'restore') {
            const pageId = notionId(cfg.pageId);
            if (!pageId) throw new Error('pageId is required for page › restore');
            result = await notion.pages.update({ page_id: pageId, archived: false });
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "page"`);
          }
        }

        // ════════════════════════════════════════════════════════════════════
        //  DATABASE
        // ════════════════════════════════════════════════════════════════════
        else if (resource === 'database') {

          if (operation === 'get') {
            const databaseId = notionId(cfg.databaseId);
            if (!databaseId) throw new Error('databaseId is required for database › get');
            result = await notion.databases.retrieve({ database_id: databaseId });
          }

          else if (operation === 'list') {
            const ps  = clampedPageSize();
            const all = returnAll();
            const fn  = (cursor?: string) => notion.search({
              filter: { property: 'object', value: 'database' },
              start_cursor: cursor,
              page_size: ps,
            });
            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else if (operation === 'query') {
            const databaseId = notionId(cfg.databaseId);
            if (!databaseId) throw new Error('databaseId is required for database › query');

            const ps  = clampedPageSize();
            const all = returnAll();

            // Build filter from structured inputs (or fallback to raw JSON)
            const filterProp      = str(cfg.filterProperty);
            const filterType      = str(cfg.filterType, 'text');
            const filterCondition = str(cfg.filterCondition, 'equals');
            const filterValue     = str(cfg.filterValue);

            let filter: any = undefined;
            if (filterProp && filterValue) {
              filter = buildNotionFilter(filterProp, filterType, filterCondition, filterValue);
            }

            // Build sort from structured inputs
            const sortProp = str(cfg.sortProperty);
            const sortDir  = str(cfg.sortDirection, 'ascending');
            let sorts: any[] = [];
            if (sortProp) {
              sorts = [{ property: sortProp, direction: sortDir }];
            }

            const fn = (cursor?: string) => notion.databases.query({
              database_id: databaseId,
              ...(filter ? { filter } : {}),
              ...(sorts.length > 0 ? { sorts } : {}),
              start_cursor: cursor,
              page_size: ps,
            });

            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else if (operation === 'create') {
            // Accept both 'parentPageId' and legacy 'parentId' key name
            const parentPageId = notionId(cfg.parentPageId) || notionId(cfg.parentId);
            if (!parentPageId) throw new Error('parentPageId is required for database › create');

            const titleText = str(cfg.title) || str(cfg.databaseTitle) || 'Untitled Database';
            const schemaRaw = parseJsonSafe(cfg.schemaJson) || { Name: { title: {} } };
            const isInline  = bool(cfg.isInline, false);

            result = await notion.databases.create({
              parent: { page_id: parentPageId },
              title: toRichText(titleText) as any,
              properties: schemaRaw as any,
              is_inline: isInline,
            });
          }

          else if (operation === 'update') {
            const databaseId = notionId(cfg.databaseId);
            if (!databaseId) throw new Error('databaseId is required for database › update');

            const titleText = str(cfg.title) || str(cfg.databaseTitle);
            const schemaRaw = parseJsonSafe(cfg.schemaJson);

            const updatePayload: any = { database_id: databaseId };
            if (titleText) updatePayload.title = toRichText(titleText);
            if (schemaRaw)  updatePayload.properties = schemaRaw;

            if (!titleText && !schemaRaw) {
              throw new Error('Provide title and/or schemaJson to update the database');
            }

            result = await notion.databases.update(updatePayload);
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "database"`);
          }
        }

        // ════════════════════════════════════════════════════════════════════
        //  BLOCK
        // ════════════════════════════════════════════════════════════════════
        else if (resource === 'block') {

          if (operation === 'get') {
            const blockId = notionId(cfg.blockId);
            if (!blockId) throw new Error('blockId is required for block › get');
            result = await notion.blocks.retrieve({ block_id: blockId });
          }

          else if (operation === 'listChildren') {
            const blockId = notionId(cfg.blockId);
            if (!blockId) throw new Error('blockId is required for block › listChildren');
            const ps  = clampedPageSize();
            const all = returnAll();
            const fn  = (cursor?: string) => notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: ps });
            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else if (operation === 'appendChildren') {
            const blockId = notionId(cfg.blockId);
            if (!blockId) throw new Error('blockId is required for block › appendChildren');

            const content      = str(cfg.content);
            const blockType    = (str(cfg.blockType, 'paragraph') || 'paragraph') as BlockType;
            const codeLanguage = str(cfg.codeLanguage, 'plain text');

            if (!content && blockType !== 'divider') {
              throw new Error('content is required to append a block');
            }

            const children = [toBlock(blockType, content, codeLanguage)];
            result = await notion.blocks.children.append({ block_id: blockId, children: children as any });
          }

          else if (operation === 'update') {
            const blockId = notionId(cfg.blockId);
            if (!blockId) throw new Error('blockId is required for block › update');

            const content      = str(cfg.content);
            const blockType    = (str(cfg.blockType, 'paragraph') || 'paragraph') as BlockType;
            const codeLanguage = str(cfg.codeLanguage, 'plain text');

            if (!content && blockType !== 'divider') {
              throw new Error('content is required to update a block');
            }

            const blockPayload = toBlock(blockType, content, codeLanguage);
            result = await notion.blocks.update({ block_id: blockId, ...(blockPayload as any) });
          }

          else if (operation === 'delete') {
            const blockId = notionId(cfg.blockId);
            if (!blockId) throw new Error('blockId is required for block › delete');
            result = await notion.blocks.delete({ block_id: blockId });
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "block"`);
          }
        }

        // ════════════════════════════════════════════════════════════════════
        //  USER
        // ════════════════════════════════════════════════════════════════════
        else if (resource === 'user') {

          if (operation === 'get') {
            const userId = notionId(cfg.userId);
            if (!userId) throw new Error('userId is required for user › get');
            result = await notion.users.retrieve({ user_id: userId });
          }

          else if (operation === 'list') {
            const ps  = clampedPageSize();
            const all = returnAll();
            const fn  = (cursor?: string) => notion.users.list({ start_cursor: cursor, page_size: ps });
            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else if (operation === 'getMe') {
            result = await notion.users.me({});
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "user"`);
          }
        }

        // ════════════════════════════════════════════════════════════════════
        //  COMMENT
        // ════════════════════════════════════════════════════════════════════
        else if (resource === 'comment') {

          if (operation === 'list') {
            const pageId  = notionId(cfg.pageId);
            const blockId = notionId(cfg.blockId);
            if (!pageId && !blockId) throw new Error('Provide pageId or blockId for comment › list');

            const ps  = clampedPageSize();
            const all = returnAll();
            const fn  = (cursor?: string) => {
              const params: any = { start_cursor: cursor, page_size: ps };
              // Notion comments API always uses block_id — pages are blocks too
              params.block_id = pageId || blockId;
              return (notion.comments as any).list(params);
            };
            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else if (operation === 'create') {
            const pageId           = notionId(cfg.pageId);
            const discussionId     = str(cfg.parentDiscussionId);
            const commentText      = str(cfg.comment) || str(cfg.content);

            if (!pageId && !discussionId) {
              throw new Error('Provide pageId (new discussion) or parentDiscussionId (reply) for comment › create');
            }
            if (!commentText) throw new Error('comment text is required for comment › create');

            const commentData: any = { rich_text: toRichText(commentText) };
            commentData.parent = pageId
              ? { page_id: pageId }
              : { discussion_id: discussionId };

            result = await (notion.comments as any).create(commentData);
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "comment"`);
          }
        }

        // ════════════════════════════════════════════════════════════════════
        //  SEARCH
        // ════════════════════════════════════════════════════════════════════
        else if (resource === 'search') {

          if (operation === 'search' || operation === 'get' || operation === 'list') {
            const query       = str(cfg.searchQuery);
            const filterType  = str(cfg.searchFilter);
            const sortDir     = str(cfg.sortDirection, 'descending');
            const ps          = clampedPageSize();
            const all         = returnAll();

            const fn = (cursor?: string) => {
              const params: any = { start_cursor: cursor, page_size: ps };
              if (query)      params.query  = query;
              if (filterType) params.filter = { property: 'object', value: filterType };
              if (sortDir)    params.sort   = { direction: sortDir, timestamp: 'last_edited_time' };
              return notion.search(params);
            };

            result = all
              ? { results: await collectAll(fn as any), object: 'list' }
              : await fn();
          }

          else {
            throw new Error(`Unknown operation "${operation}" for resource "search"`);
          }
        }

        else {
          throw new Error(`Unknown Notion resource "${resource}"`);
        }

        return { success: true, output: { resource, operation, data: result } };

      } catch (err: any) {
        const msg     = err?.message || 'Notion operation failed';
        const status  = err?.status  || err?.code || 'unknown';
        return {
          success: false,
          error: {
            code:    'NOTION_EXEC_ERROR',
            message: `Notion ${resource} › ${operation}: ${msg}`,
            details: { status, body: err?.body },
          },
        };
      }
    },
  };
}
