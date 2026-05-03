/**
 * Google Suite End-to-End Node Test
 * Tests all 7 Google services: Gmail, Drive, Sheets, Calendar, Docs, Tasks, Contacts
 *
 * Run: node test-google-suite-e2e.js
 */

require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');
const crypto = require('crypto');

// ─── Token decryption (matches token-encryption.ts) ──────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY not set');
  return crypto.pbkdf2Sync(raw, 'ctrlchecks-token-encryption-salt', ITERATIONS, KEY_LENGTH, 'sha256');
}

function decryptToken(encrypted) {
  if (!encrypted) return null;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted; // plaintext fallback
  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let dec = decipher.update(encryptedHex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return encrypted;
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function gReq(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} – ${txt.slice(0, 200)}`);
  }
  return ct.includes('application/json') ? res.json() : res.text();
}

// ─── Result helpers ───────────────────────────────────────────────────────────

const results = [];
function pass(service, test, detail) {
  results.push({ status: 'PASS', service, test, detail });
  console.log(`  ✅ ${test}: ${detail}`);
}
function fail(service, test, err) {
  results.push({ status: 'FAIL', service, test, detail: err?.message || String(err) });
  console.log(`  ❌ ${test}: ${err?.message || err}`);
}

// ─── Individual service tests ─────────────────────────────────────────────────

async function testGmail(token) {
  console.log('\n─── 1. Gmail ─────────────────────────────────────────────────');
  try {
    const data = await gReq(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5',
      token
    );
    pass('Gmail', 'Read Emails (list)', `returned ${(data.messages || []).length} messages`);
  } catch (e) { fail('Gmail', 'Read Emails (list)', e); }

  try {
    const encoded = Buffer.from(
      `From: me\r\nTo: sptsprint9@gmail.com\r\nSubject: CtrlChecks E2E Test\r\nContent-Type: text/plain\r\n\r\nThis is an automated end-to-end test from CtrlChecks Google Suite tester.`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const sent = await gReq(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      token,
      { method: 'POST', body: JSON.stringify({ raw: encoded }) }
    );
    pass('Gmail', 'Send Email', `sent messageId=${sent.id}`);
  } catch (e) { fail('Gmail', 'Send Email', e); }

  try {
    const data = await gReq(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:CtrlChecks+E2E+Test&maxResults=3',
      token
    );
    pass('Gmail', 'Search Emails', `found ${(data.messages || []).length} matching messages`);
  } catch (e) { fail('Gmail', 'Search Emails', e); }
}

async function testGoogleDrive(token) {
  console.log('\n─── 2. Google Drive ──────────────────────────────────────────');
  let folderId;
  try {
    const folder = await gReq(
      'https://www.googleapis.com/drive/v3/files',
      token,
      {
        method: 'POST',
        body: JSON.stringify({ name: 'ctrlchecks-e2e-test', mimeType: 'application/vnd.google-apps.folder' }),
      }
    );
    folderId = folder.id;
    pass('Drive', 'Create Folder', `id=${folderId}`);
  } catch (e) { fail('Drive', 'Create Folder', e); }

  try {
    const list = await gReq(
      `https://www.googleapis.com/drive/v3/files?q=${folderId ? `'${folderId}' in parents` : ''}&pageSize=5&fields=files(id,name,mimeType)`,
      token
    );
    pass('Drive', 'List Files', `returned ${(list.files || []).length} files`);
  } catch (e) { fail('Drive', 'List Files', e); }

  // Upload a small file
  let fileId;
  try {
    const meta = JSON.stringify({ name: 'ctrlchecks-test.txt', ...(folderId ? { parents: [folderId] } : {}) });
    const boundary = 'e2eTestBoundary';
    const body =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: text/plain\r\n\r\nCtrlChecks E2E test file\r\n--${boundary}--`;
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body,
      }
    );
    const uploaded = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(uploaded));
    fileId = uploaded.id;
    pass('Drive', 'Upload File', `id=${fileId}`);
  } catch (e) { fail('Drive', 'Upload File', e); }

  if (fileId) {
    try {
      const dl = await gReq(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        token
      );
      pass('Drive', 'Download File', `content="${String(dl).slice(0, 30)}"`);
    } catch (e) { fail('Drive', 'Download File', e); }

    // Cleanup
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  }
  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  }
}

async function testGoogleSheets(token) {
  console.log('\n─── 3. Google Sheets ─────────────────────────────────────────');
  let ssId;
  try {
    const ss = await gReq(
      'https://sheets.googleapis.com/v4/spreadsheets',
      token,
      { method: 'POST', body: JSON.stringify({ properties: { title: 'CtrlChecks E2E Test Sheet' } }) }
    );
    ssId = ss.spreadsheetId;
    pass('Sheets', 'Create Spreadsheet', `id=${ssId}`);
  } catch (e) { fail('Sheets', 'Create Spreadsheet', e); }

  if (ssId) {
    try {
      await gReq(
        `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/A1:C1:append?valueInputOption=RAW`,
        token,
        { method: 'POST', body: JSON.stringify({ values: [['name', 'date', 'status']] }) }
      );
      pass('Sheets', 'Append Row', 'header row written');
    } catch (e) { fail('Sheets', 'Append Row', e); }

    try {
      const rows = await gReq(
        `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/A:C`,
        token
      );
      pass('Sheets', 'Read Rows', `returned ${(rows.values || []).length} rows`);
    } catch (e) { fail('Sheets', 'Read Rows', e); }

    // Cleanup
    await fetch(`https://www.googleapis.com/drive/v3/files/${ssId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  }
}

async function testGoogleCalendar(token) {
  console.log('\n─── 4. Google Calendar ───────────────────────────────────────');
  let eventId;
  try {
    const now = new Date();
    const start = new Date(now.getTime() + 3600_000);
    const end = new Date(now.getTime() + 7200_000);
    const ev = await gReq(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: 'CtrlChecks E2E Test Event',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      }
    );
    eventId = ev.id;
    pass('Calendar', 'Create Event', `id=${eventId}`);
  } catch (e) { fail('Calendar', 'Create Event', e); }

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const events = await gReq(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${today.toISOString()}&timeMax=${tomorrow.toISOString()}&singleEvents=true`,
      token
    );
    pass('Calendar', 'Get Events', `found ${(events.items || []).length} events today`);
  } catch (e) { fail('Calendar', 'Get Events', e); }

  if (eventId) {
    try {
      await gReq(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        token,
        { method: 'PATCH', body: JSON.stringify({ summary: 'CtrlChecks E2E Test Event (Updated)' }) }
      );
      pass('Calendar', 'Update Event', 'title updated');
    } catch (e) { fail('Calendar', 'Update Event', e); }

    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      pass('Calendar', 'Delete Event', 'deleted');
    } catch (e) { fail('Calendar', 'Delete Event', e); }
  }
}

async function testGoogleDocs(token) {
  console.log('\n─── 5. Google Docs ───────────────────────────────────────────');
  let docId;
  try {
    const doc = await gReq(
      'https://docs.googleapis.com/v1/documents',
      token,
      { method: 'POST', body: JSON.stringify({ title: 'CtrlChecks E2E Test Doc' }) }
    );
    docId = doc.documentId;
    pass('Docs', 'Create Document', `id=${docId}`);
  } catch (e) { fail('Docs', 'Create Document', e); }

  if (docId) {
    try {
      const doc = await gReq(
        `https://docs.googleapis.com/v1/documents/${docId}`,
        token
      );
      pass('Docs', 'Get Document', `title="${doc.title}"`);
    } catch (e) { fail('Docs', 'Get Document', e); }

    try {
      const doc = await gReq(`https://docs.googleapis.com/v1/documents/${docId}`, token);
      const endIndex = doc.body?.content?.slice(-1)[0]?.endIndex || 1;
      await gReq(
        `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: endIndex - 1 }, text: '\nCtrlChecks E2E test content.' } }],
          }),
        }
      );
      pass('Docs', 'Update Document', 'text appended');
    } catch (e) { fail('Docs', 'Update Document', e); }

    // Cleanup
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  }
}

async function testGoogleTasks(token) {
  console.log('\n─── 6. Google Tasks ──────────────────────────────────────────');
  let taskId;
  try {
    const task = await gReq(
      'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
      token,
      { method: 'POST', body: JSON.stringify({ title: 'CtrlChecks E2E Test Task', notes: 'Automated test' }) }
    );
    taskId = task.id;
    pass('Tasks', 'Create Task', `id=${taskId}`);
  } catch (e) { fail('Tasks', 'Create Task', e); }

  try {
    const tasks = await gReq(
      'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
      token
    );
    pass('Tasks', 'Get Tasks', `returned ${(tasks.items || []).length} tasks`);
  } catch (e) { fail('Tasks', 'Get Tasks', e); }

  if (taskId) {
    try {
      await gReq(
        `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`,
        token,
        { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }
      );
      pass('Tasks', 'Update Task (complete)', 'marked completed');
    } catch (e) { fail('Tasks', 'Update Task (complete)', e); }

    try {
      await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      pass('Tasks', 'Delete Task', 'deleted');
    } catch (e) { fail('Tasks', 'Delete Task', e); }
  }
}

async function testGoogleContacts(token) {
  console.log('\n─── 7. Google Contacts ───────────────────────────────────────');
  let contactId;
  try {
    const contact = await gReq(
      'https://people.googleapis.com/v1/people:createContact',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          names: [{ displayName: 'CtrlChecks E2E Test' }],
          emailAddresses: [{ value: 'e2etest@ctrlchecks.ai' }],
          phoneNumbers: [{ value: '+10000000000' }],
        }),
      }
    );
    contactId = contact.resourceName;
    pass('Contacts', 'Create Contact', `resourceName=${contactId}`);
  } catch (e) { fail('Contacts', 'Create Contact', e); }

  try {
    const list = await gReq(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=10',
      token
    );
    pass('Contacts', 'Get Contacts', `returned ${(list.connections || []).length} contacts`);
  } catch (e) { fail('Contacts', 'Get Contacts', e); }

  if (contactId) {
    try {
      const existing = await gReq(
        `https://people.googleapis.com/v1/${contactId}?personFields=metadata,names,emailAddresses,phoneNumbers`,
        token
      );
      await gReq(
        `https://people.googleapis.com/v1/${contactId}:updateContact?updatePersonFields=phoneNumbers`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ etag: existing.etag, phoneNumbers: [{ value: '+19999999999' }] }),
        }
      );
      pass('Contacts', 'Update Contact', 'phone updated');
    } catch (e) { fail('Contacts', 'Update Contact', e); }

    try {
      await gReq(
        `https://people.googleapis.com/v1/${contactId}:deleteContact`,
        token,
        { method: 'DELETE' }
      );
      pass('Contacts', 'Delete Contact', 'deleted');
    } catch (e) { fail('Contacts', 'Delete Contact', e); }
  }
}

// ─── Token refresh helper ─────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       CtrlChecks — Google Suite End-to-End Node Test        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 1. Connect to DB and fetch the most recently updated Google token
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let token;
  try {
    console.log('\n[Auth] Connecting to database...');
    const res = await pool.query(
      `SELECT access_token, refresh_token, expires_at, user_id
       FROM google_oauth_tokens
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    if (!res.rows.length) {
      console.log('❌ No Google OAuth tokens found in the database.');
      console.log('   → Connect a Google account in the CtrlChecks app first, then re-run this test.');
      await pool.end();
      process.exit(1);
    }

    const row = res.rows[0];
    console.log(`[Auth] Found token for user_id=${row.user_id}, expires_at=${row.expires_at}`);

    const rawAccess = decryptToken(row.access_token);
    const rawRefresh = row.refresh_token ? decryptToken(row.refresh_token) : null;

    // Refresh if expired (or within 2 minutes of expiry)
    const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 120_000;
    if (expired && rawRefresh) {
      console.log('[Auth] Access token expired — refreshing...');
      token = await refreshAccessToken(rawRefresh);
      console.log('[Auth] Token refreshed ✅');
    } else {
      token = rawAccess;
      console.log('[Auth] Using stored access token ✅');
    }
  } catch (e) {
    console.error('❌ DB/token error:', e.message);
    await pool.end();
    process.exit(1);
  } finally {
    await pool.end();
  }

  // 2. Run all service tests
  await testGmail(token);
  await testGoogleDrive(token);
  await testGoogleSheets(token);
  await testGoogleCalendar(token);
  await testGoogleDocs(token);
  await testGoogleTasks(token);
  await testGoogleContacts(token);

  // 3. Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const services = ['Gmail', 'Drive', 'Sheets', 'Calendar', 'Docs', 'Tasks', 'Contacts'];
  for (const svc of services) {
    const svcResults = results.filter(r => r.service === svc);
    const passed = svcResults.filter(r => r.status === 'PASS').length;
    const total = svcResults.length;
    const icon = passed === total ? '✅' : passed > 0 ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${svc.padEnd(12)} ${passed}/${total} tests passed`);
    svcResults.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`       └─ FAIL: ${r.test} — ${r.detail}`);
    });
  }

  const totalPass = results.filter(r => r.status === 'PASS').length;
  const totalFail = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n  Total: ${totalPass} passed, ${totalFail} failed out of ${results.length} tests`);

  if (totalFail > 0) {
    console.log('\n  Common failure reasons:');
    console.log('  • 401 – Token expired and no refresh token stored');
    console.log('  • 403 – Missing OAuth scope (re-connect Google account with required scopes)');
    console.log('  • 404 – Resource not found (expected for first-time runs)');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
