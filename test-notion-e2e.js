/**
 * Notion Node — End-to-End Test
 * Tests all 6 resources with real Notion API calls.
 * Run: node test-notion-e2e.js
 */

require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');
const crypto = require('crypto');
const { Client } = require('@notionhq/client');

// ─── Token decryption (matches token-encryption.ts) ──────────────────────────

function decryptToken(encrypted) {
  if (!encrypted) return null;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  try {
    const key = crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, 'ctrlchecks-token-encryption-salt', 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
  } catch { return encrypted; }
}

// ─── Result tracker ───────────────────────────────────────────────────────────

const results = [];
function pass(resource, op, detail) {
  results.push({ status: 'PASS', resource, op, detail });
  console.log(`  ✅ ${resource} › ${op}: ${detail}`);
}
function fail(resource, op, err) {
  results.push({ status: 'FAIL', resource, op, detail: err?.message || String(err) });
  console.log(`  ❌ ${resource} › ${op}: ${err?.message || err}`);
}

// ─── Helpers matching the new override ───────────────────────────────────────

function toRichText(text) {
  return [{ type: 'text', text: { content: text || '' } }];
}

function toBlock(type, content, language = 'plain text') {
  if (type === 'divider') return { type: 'divider', divider: {} };
  if (type === 'code') return { type: 'code', code: { rich_text: toRichText(content), language } };
  return { type, [type]: { rich_text: toRichText(content) } };
}

function buildPropertiesFromSimpleJson(raw, titleText) {
  const props = {};
  if (titleText) props['title'] = { title: toRichText(titleText) };
  if (!raw) return props;
  for (const [rawKey, val] of Object.entries(raw)) {
    const [fieldName, typeHint] = rawKey.includes('__') ? rawKey.split('__') : [rawKey, null];
    const strVal = String(val ?? '');
    const type = typeHint || (val === true || val === false ? 'checkbox' : (!isNaN(Number(val)) && strVal.trim() ? 'number' : 'rich_text'));
    if (type === 'rich_text' || type === 'text') { props[fieldName] = { rich_text: toRichText(strVal) }; }
    else if (type === 'number') { props[fieldName] = { number: typeof val === 'number' ? val : parseFloat(strVal) || 0 }; }
    else if (type === 'checkbox') { props[fieldName] = { checkbox: val === true || strVal === 'true' }; }
    else if (type === 'select') { props[fieldName] = { select: { name: strVal } }; }
    else if (type === 'multi_select') { props[fieldName] = { multi_select: strVal.split(',').map(v => ({ name: v.trim() })) }; }
    else { props[fieldName] = { rich_text: toRichText(strVal) }; }
  }
  return props;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// We need a parent page to create sub-pages and databases in.
// Set NOTION_TEST_PAGE_ID env var, OR we'll use the first page from search.

async function testPage(notion, parentPageId) {
  console.log('\n─── Resource: Page ───────────────────────────────────────────');
  let pageId;

  // CREATE child page
  try {
    const page = await notion.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: toRichText('CtrlChecks E2E Test Page') } },
      children: [toBlock('paragraph', 'This page was created by the CtrlChecks Notion node E2E test.')],
    });
    pageId = page.id;
    pass('page', 'create (child)', `id=${pageId}`);
  } catch (e) { fail('page', 'create (child)', e); }

  // GET page
  if (pageId) {
    try {
      const p = await notion.pages.retrieve({ page_id: pageId });
      pass('page', 'get', `title found, archived=${p.archived}`);
    } catch (e) { fail('page', 'get', e); }

    // UPDATE — change title via buildPropertiesFromSimpleJson
    try {
      const props = buildPropertiesFromSimpleJson(null, 'CtrlChecks E2E Test Page (Updated)');
      await notion.pages.update({ page_id: pageId, properties: props });
      pass('page', 'update', 'title updated');
    } catch (e) { fail('page', 'update', e); }

    // ARCHIVE
    try {
      await notion.pages.update({ page_id: pageId, archived: true });
      pass('page', 'archive', 'archived=true');
    } catch (e) { fail('page', 'archive', e); }

    // RESTORE
    try {
      await notion.pages.update({ page_id: pageId, archived: false });
      pass('page', 'restore', 'archived=false');
    } catch (e) { fail('page', 'restore', e); }

    // Final archive for cleanup
    await notion.pages.update({ page_id: pageId, archived: true }).catch(() => {});
  }
}

async function testDatabase(notion, parentPageId) {
  console.log('\n─── Resource: Database ───────────────────────────────────────');
  let dbId;

  // CREATE database
  try {
    const db = await notion.databases.create({
      parent: { page_id: parentPageId },
      title: toRichText('CtrlChecks E2E Test DB'),
      properties: {
        Name:   { title: {} },
        Status: { select: { options: [{ name: 'To Do', color: 'red' }, { name: 'Done', color: 'green' }] } },
        Count:  { number: {} },
        Done:   { checkbox: {} },
      },
      is_inline: false,
    });
    dbId = db.id;
    pass('database', 'create', `id=${dbId}`);
  } catch (e) { fail('database', 'create', e); }

  if (dbId) {
    // GET database
    try {
      const db = await notion.databases.retrieve({ database_id: dbId });
      pass('database', 'get', `title=${db.title?.[0]?.plain_text}`);
    } catch (e) { fail('database', 'get', e); }

    // CREATE a page (row) in the database using simple JSON properties
    let rowPageId;
    try {
      const props = buildPropertiesFromSimpleJson(
        { Status__select: 'To Do', Count__number: 42, Done__checkbox: false },
        'Test Row 1'
      );
      const row = await notion.pages.create({ parent: { database_id: dbId }, properties: props });
      rowPageId = row.id;
      pass('page', 'create (database row)', `id=${rowPageId}`);
    } catch (e) { fail('page', 'create (database row)', e); }

    // QUERY database
    try {
      const q = await notion.databases.query({ database_id: dbId, page_size: 10 });
      pass('database', 'query', `returned ${q.results.length} rows`);
    } catch (e) { fail('database', 'query', e); }

    // QUERY with filter (filterProperty="Status", filterType="select", condition="equals", value="To Do")
    try {
      const q = await notion.databases.query({
        database_id: dbId,
        filter: { property: 'Status', select: { equals: 'To Do' } },
      });
      pass('database', 'query with filter', `returned ${q.results.length} matching rows`);
    } catch (e) { fail('database', 'query with filter', e); }

    // UPDATE database title
    try {
      await notion.databases.update({ database_id: dbId, title: toRichText('CtrlChecks E2E Test DB (Updated)') });
      pass('database', 'update', 'title updated');
    } catch (e) { fail('database', 'update', e); }

    // LIST databases (via search)
    try {
      const list = await notion.search({ filter: { property: 'object', value: 'database' }, page_size: 5 });
      pass('database', 'list', `found ${list.results.length} databases`);
    } catch (e) { fail('database', 'list', e); }

    // Archive the DB (cleanup)
    if (rowPageId) await notion.pages.update({ page_id: rowPageId, archived: true }).catch(() => {});
    await notion.pages.update({ page_id: dbId, archived: true }).catch(() => {});
  }
}

async function testBlock(notion, parentPageId) {
  console.log('\n─── Resource: Block ──────────────────────────────────────────');

  // Create a test page to work with blocks
  let testPageId;
  try {
    const p = await notion.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: toRichText('CtrlChecks Block Test Page') } },
    });
    testPageId = p.id;
  } catch (e) { fail('block', 'setup (create page)', e); return; }

  let blockId;

  // APPEND children (paragraph block)
  try {
    const result = await notion.blocks.children.append({
      block_id: testPageId,
      children: [toBlock('paragraph', 'Hello from CtrlChecks block test!')],
    });
    blockId = result.results?.[0]?.id;
    pass('block', 'appendChildren (paragraph)', `id=${blockId}`);
  } catch (e) { fail('block', 'appendChildren (paragraph)', e); }

  // APPEND code block
  try {
    await notion.blocks.children.append({
      block_id: testPageId,
      children: [toBlock('code', 'console.log("Hello Notion")', 'javascript')],
    });
    pass('block', 'appendChildren (code)', 'code block appended');
  } catch (e) { fail('block', 'appendChildren (code)', e); }

  // APPEND heading
  try {
    await notion.blocks.children.append({
      block_id: testPageId,
      children: [toBlock('heading_2', 'Section Header')],
    });
    pass('block', 'appendChildren (heading_2)', 'heading appended');
  } catch (e) { fail('block', 'appendChildren (heading_2)', e); }

  // APPEND divider
  try {
    await notion.blocks.children.append({
      block_id: testPageId,
      children: [toBlock('divider', '')],
    });
    pass('block', 'appendChildren (divider)', 'divider appended');
  } catch (e) { fail('block', 'appendChildren (divider)', e); }

  // LIST children
  try {
    const list = await notion.blocks.children.list({ block_id: testPageId, page_size: 10 });
    pass('block', 'listChildren', `found ${list.results.length} blocks`);
  } catch (e) { fail('block', 'listChildren', e); }

  // GET block
  if (blockId) {
    try {
      const b = await notion.blocks.retrieve({ block_id: blockId });
      pass('block', 'get', `type=${b.type}`);
    } catch (e) { fail('block', 'get', e); }

    // UPDATE block
    try {
      await notion.blocks.update({ block_id: blockId, paragraph: { rich_text: toRichText('Updated paragraph text!') } });
      pass('block', 'update', 'block content updated');
    } catch (e) { fail('block', 'update', e); }

    // DELETE block
    try {
      await notion.blocks.delete({ block_id: blockId });
      pass('block', 'delete', 'block deleted');
    } catch (e) { fail('block', 'delete', e); }
  }

  // Cleanup test page
  await notion.pages.update({ page_id: testPageId, archived: true }).catch(() => {});
}

async function testUser(notion) {
  console.log('\n─── Resource: User ───────────────────────────────────────────');

  // GET ME
  let meId;
  try {
    const me = await notion.users.me({});
    meId = me.id;
    pass('user', 'getMe', `name=${me.name}, type=${me.type}`);
  } catch (e) { fail('user', 'getMe', e); }

  // LIST users
  try {
    const list = await notion.users.list({ page_size: 5 });
    pass('user', 'list', `found ${list.results.length} users`);
  } catch (e) { fail('user', 'list', e); }

  // GET specific user
  if (meId) {
    try {
      const user = await notion.users.retrieve({ user_id: meId });
      pass('user', 'get', `name=${user.name}`);
    } catch (e) { fail('user', 'get', e); }
  }
}

async function testComment(notion, parentPageId) {
  console.log('\n─── Resource: Comment ────────────────────────────────────────');

  // Create a page to comment on
  let testPageId;
  try {
    const p = await notion.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: toRichText('CtrlChecks Comment Test Page') } },
    });
    testPageId = p.id;
  } catch (e) { fail('comment', 'setup (create page)', e); return; }

  // CREATE comment (plain text → rich_text auto-build)
  try {
    await notion.comments.create({
      parent: { page_id: testPageId },
      rich_text: toRichText('This is a test comment from CtrlChecks E2E!'),
    });
    pass('comment', 'create', 'comment created on page');
  } catch (e) { fail('comment', 'create', e); }

  // LIST comments
  try {
    // Notion comments API always uses block_id (pages are blocks too)
    const list = await notion.comments.list({ block_id: testPageId, page_size: 10 });
    pass('comment', 'list', `found ${list.results.length} comments`);
  } catch (e) { fail('comment', 'list', e); }

  // Cleanup
  await notion.pages.update({ page_id: testPageId, archived: true }).catch(() => {});
}

async function testSearch(notion) {
  console.log('\n─── Resource: Search ─────────────────────────────────────────');

  // SEARCH all
  try {
    const res = await notion.search({ page_size: 5 });
    pass('search', 'search (all)', `found ${res.results.length} results`);
  } catch (e) { fail('search', 'search (all)', e); }

  // SEARCH pages only
  try {
    const res = await notion.search({ filter: { property: 'object', value: 'page' }, page_size: 5 });
    pass('search', 'search (pages)', `found ${res.results.length} pages`);
  } catch (e) { fail('search', 'search (pages)', e); }

  // SEARCH databases only
  try {
    const res = await notion.search({ filter: { property: 'object', value: 'database' }, page_size: 5 });
    pass('search', 'search (databases)', `found ${res.results.length} databases`);
  } catch (e) { fail('search', 'search (databases)', e); }

  // SEARCH with query
  try {
    const res = await notion.search({ query: 'CtrlChecks', page_size: 5 });
    pass('search', 'search (query)', `found ${res.results.length} results for "CtrlChecks"`);
  } catch (e) { fail('search', 'search (query)', e); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         CtrlChecks — Notion Node End-to-End Test            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Fetch Notion token from DB
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let token;
  try {
    console.log('\n[Auth] Fetching Notion token from database...');
    const res = await pool.query('SELECT access_token FROM notion_oauth_tokens ORDER BY updated_at DESC LIMIT 1');
    if (!res.rows.length) {
      console.log('❌ No Notion OAuth token found. Connect Notion via the Connections panel first.');
      await pool.end(); process.exit(1);
    }
    token = decryptToken(res.rows[0].access_token);
    console.log('[Auth] Token found ✅');
  } catch (e) {
    console.error('❌ DB error:', e.message);
    await pool.end(); process.exit(1);
  } finally {
    await pool.end();
  }

  const notion = new Client({ auth: token });

  // Find a parent page to create test resources inside
  let parentPageId = process.env.NOTION_TEST_PAGE_ID;
  if (!parentPageId) {
    console.log('\n[Setup] NOTION_TEST_PAGE_ID not set — searching for a page to use as parent...');
    const search = await notion.search({ filter: { property: 'object', value: 'page' }, page_size: 1 });
    if (!search.results.length) {
      console.log('❌ No pages found in your Notion workspace. Create any page first, or set NOTION_TEST_PAGE_ID.');
      process.exit(1);
    }
    parentPageId = search.results[0].id;
    const titleParts = search.results[0].properties?.title?.title || search.results[0].properties?.Name?.title || [];
    const titleText = titleParts[0]?.plain_text || '(untitled)';
    console.log(`[Setup] Using page "${titleText}" (id=${parentPageId}) as parent`);
  }

  // Run all resource tests
  await testPage(notion, parentPageId);
  await testDatabase(notion, parentPageId);
  await testBlock(notion, parentPageId);
  await testUser(notion);
  await testComment(notion, parentPageId);
  await testSearch(notion);

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const resources = ['page', 'database', 'block', 'user', 'comment', 'search'];
  for (const r of resources) {
    const rRes  = results.filter(x => x.resource === r);
    const pass_ = rRes.filter(x => x.status === 'PASS').length;
    const total = rRes.length;
    const icon  = pass_ === total ? '✅' : pass_ > 0 ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${r.padEnd(10)} ${pass_}/${total} passed`);
    rRes.filter(x => x.status === 'FAIL').forEach(x => console.log(`       └─ FAIL: ${x.op} — ${x.detail}`));
  }

  const totalPass = results.filter(x => x.status === 'PASS').length;
  const totalFail = results.filter(x => x.status === 'FAIL').length;
  console.log(`\n  Total: ${totalPass} passed, ${totalFail} failed out of ${results.length} tests`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
