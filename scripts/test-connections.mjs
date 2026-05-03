import 'dotenv/config';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function decrypt(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return encrypted;
  try {
    // format: v1:ivBase64url:authTagBase64url:cipherBase64url
    const parts = encrypted.split(':');
    if (parts[0] !== 'v1' || parts.length < 4) return encrypted;
    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const cipherText = parts.slice(3).join(':'); // re-join in case cipher had colons
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(cipherText, 'base64url', 'utf8') + decipher.final('utf8');
  } catch {
    return encrypted;
  }
}

function decryptCredentials(raw) {
  if (typeof raw === 'string' && raw.startsWith('v1:')) {
    // whole-blob encryption — decrypt then parse JSON
    try { return JSON.parse(decrypt(raw)); } catch { return {}; }
  }
  const creds = {};
  for (const [k, v] of Object.entries(raw)) {
    creds[k] = typeof v === 'string' ? decrypt(v) : v;
  }
  return creds;
}

function injectCredentials(url, headers, creds) {
  const outHeaders = { ...headers };
  if (creds.access_token) outHeaders['Authorization'] = `Bearer ${creds.access_token}`;
  if (creds.token) outHeaders['Authorization'] = `Bearer ${creds.token}`;
  if (creds.apiKey && !outHeaders['Authorization']) outHeaders['Authorization'] = `Bearer ${creds.apiKey}`;
  return { url, headers: outHeaders };
}

const TEST_REQUESTS = {
  google_oauth2:    { method: 'GET', url: 'https://www.googleapis.com/oauth2/v2/userinfo' },
  gitlab_oauth2:    { method: 'GET', url: 'https://gitlab.com/api/v4/user' },
  slack_oauth2:     { method: 'GET', url: 'https://slack.com/api/auth.test' },
  linear_oauth2:    { method: 'POST', url: 'https://api.linear.app/graphql', body: JSON.stringify({ query: '{ viewer { id name } }' }), extraHeaders: { 'Content-Type': 'application/json' } },
  linkedin_oauth2:  { method: 'GET', url: 'https://api.linkedin.com/v2/userinfo' },
  asana_oauth2:     { method: 'GET', url: 'https://app.asana.com/api/1.0/users/me' },
  zoho_oauth2:      { method: 'GET', url: 'https://www.zohoapis.in/crm/v2/users?type=CurrentUser' },
  clickup_api_token: { method: 'GET', url: 'https://api.clickup.com/api/v2/user', rawToken: true },
};

async function testConnection(conn) {
  const { rows } = await pool.query(
    'SELECT encrypted_credentials FROM connections WHERE id = $1',
    [conn.id]
  );
  if (!rows[0]) return { ok: false, message: 'Not found in DB' };

  const rawCreds = rows[0].encrypted_credentials || '{}';
  const creds = decryptCredentials(rawCreds);

  const spec = TEST_REQUESTS[conn.credential_type_id];
  if (!spec) return { ok: null, message: 'No test request defined — skipped' };

  if (conn.status === 'expired') return { ok: false, message: 'Token expired — needs reconnect' };

  const headers = { ...spec.extraHeaders };
  const tokenValue = creds.access_token || creds.token || creds.apiKey;
  if (spec.rawToken) {
    headers['Authorization'] = tokenValue;
  } else {
    headers['Authorization'] = `Bearer ${tokenValue}`;
  }

  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers,
      body: spec.body,
    });
    const ok = res.status < 400;
    return { ok, status: res.status, message: ok ? 'OK' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function main() {
  const { rows: connections } = await pool.query(
    `SELECT id, name, credential_type_id, status FROM connections
     WHERE user_id = 'd1f3dd1a-2081-7056-9577-8ef4e3a8082a'
     ORDER BY credential_type_id`
  );

  const seen = new Set();
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  CONNECTION TEST RESULTS');
  console.log('══════════════════════════════════════════════════════\n');

  for (const conn of connections) {
    if (seen.has(conn.credential_type_id)) continue;
    seen.add(conn.credential_type_id);

    process.stdout.write(`  ${conn.name.padEnd(35)} `);
    const result = await testConnection(conn);
    const icon = result.ok === true ? '✅' : result.ok === null ? '⏭ ' : '❌';
    console.log(`${icon}  ${result.message}${result.status ? ` (${result.status})` : ''}`);
  }

  console.log('\n══════════════════════════════════════════════════════\n');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
