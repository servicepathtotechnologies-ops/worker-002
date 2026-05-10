import '../src/core/env-loader';
import { queryAsService } from '../src/core/database/db-pool';
import { decryptToken } from '../src/core/utils/token-encryption';
import { decryptJson } from '../src/credentials-system/secret-crypto';
import { upsertUnifiedCredential } from '../src/services/credential-resolver';
import { requiredScopesForProvider } from '../src/services/credential-scope-registry';

type LegacyRow = Record<string, any>;

function decryptMaybe(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptToken(value);
}

function parseScopes(provider: string, value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return requiredScopesForProvider(provider);
}

async function queryOptional<T = LegacyRow>(sql: string): Promise<T[]> {
  try {
    return await queryAsService<T>(sql);
  } catch (error: any) {
    console.warn(`[UnifiedCredentialMigration] Skipping source query: ${error?.message || error}`);
    return [];
  }
}

async function migrateOAuthTable(table: string, provider: string, source: string) {
  const rows = await queryOptional(
    `SELECT *, COALESCE(updated_at, created_at, NOW()) AS migrated_updated_at FROM ${table} ORDER BY migrated_updated_at ASC`,
  );
  for (const row of rows) {
    const accessToken = decryptMaybe(row.access_token);
    if (!accessToken) continue;
    await upsertUnifiedCredential({
      userId: row.user_id,
      provider,
      scopes: parseScopes(provider, row.scope),
      accessToken,
      refreshToken: decryptMaybe(row.refresh_token),
      expiresAt: row.expires_at || null,
      rawTokenBlob: { ...row, access_token: '[migrated]', refresh_token: row.refresh_token ? '[migrated]' : null },
      source,
    });
  }
  console.log(`[UnifiedCredentialMigration] Migrated ${rows.length} rows from ${table}`);
}

async function migrateSocialTokens() {
  const rows = await queryOptional(
    `SELECT *, COALESCE(updated_at, created_at, NOW()) AS migrated_updated_at FROM social_tokens ORDER BY migrated_updated_at ASC`,
  );
  for (const row of rows) {
    const provider = String(row.provider || '').toLowerCase();
    const accessToken = decryptMaybe(row.access_token);
    if (!provider || !accessToken) continue;
    await upsertUnifiedCredential({
      userId: row.user_id,
      provider,
      scopes: parseScopes(provider, row.scope),
      accessToken,
      refreshToken: decryptMaybe(row.refresh_token),
      expiresAt: row.expires_at || null,
      rawTokenBlob: { ...row, access_token: '[migrated]', refresh_token: row.refresh_token ? '[migrated]' : null },
      source: `legacy_social_${provider}`,
    });
  }
  console.log(`[UnifiedCredentialMigration] Migrated ${rows.length} rows from social_tokens`);
}

async function migrateUserCredentials() {
  const rows = await queryOptional(
    `SELECT *, COALESCE(updated_at, created_at, NOW()) AS migrated_updated_at FROM user_credentials ORDER BY migrated_updated_at ASC`,
  );
  for (const row of rows) {
    const provider = String(row.service || row.provider || '').toLowerCase();
    const credentials = row.credentials || {};
    const accessToken = decryptMaybe(credentials.access_token || credentials.accessToken || credentials.token);
    if (!provider || !accessToken) continue;
    await upsertUnifiedCredential({
      userId: row.user_id,
      provider,
      scopes: parseScopes(provider, credentials.scope || credentials.scopes),
      accessToken,
      refreshToken: decryptMaybe(credentials.refresh_token || credentials.refreshToken),
      expiresAt: credentials.expires_at || credentials.expiresAt || null,
      rawTokenBlob: { ...credentials, access_token: '[migrated]', refresh_token: credentials.refresh_token ? '[migrated]' : null },
      source: 'legacy_user_credentials',
    });
  }
  console.log(`[UnifiedCredentialMigration] Migrated ${rows.length} rows from user_credentials`);
}

async function migrateCredentialVault() {
  const rows = await queryOptional(
    `SELECT *, COALESCE(updated_at, created_at, NOW()) AS migrated_updated_at FROM credential_vault ORDER BY migrated_updated_at ASC`,
  );
  for (const row of rows) {
    const provider = String(row.key || row.provider || '').toLowerCase();
    if (!provider) continue;
    let credentials: Record<string, any> = {};
    try {
      credentials = typeof row.encrypted_value === 'string'
        ? decryptJson(row.encrypted_value)
        : row.credentials || {};
    } catch {
      credentials = row.credentials || {};
    }
    const accessToken = decryptMaybe(credentials.access_token || credentials.accessToken || credentials.token || credentials.apiKey);
    if (!accessToken) continue;
    await upsertUnifiedCredential({
      userId: row.user_id,
      provider,
      scopes: parseScopes(provider, credentials.scope || credentials.scopes),
      accessToken,
      refreshToken: decryptMaybe(credentials.refresh_token || credentials.refreshToken),
      expiresAt: credentials.expires_at || credentials.expiresAt || null,
      rawTokenBlob: { source_key: row.key, migrated: true },
      source: 'legacy_credential_vault',
    });
  }
  console.log(`[UnifiedCredentialMigration] Migrated ${rows.length} rows from credential_vault`);
}

async function migrateConnections() {
  const rows = await queryOptional(
    `SELECT *, COALESCE(updated_at, created_at, NOW()) AS migrated_updated_at FROM connections WHERE status = 'active' ORDER BY migrated_updated_at ASC`,
  );
  for (const row of rows) {
    const provider = String(row.provider || '').toLowerCase();
    if (!provider || !row.encrypted_credentials) continue;
    let credentials: Record<string, any>;
    try {
      credentials = decryptJson(row.encrypted_credentials);
    } catch {
      continue;
    }
    const accessToken = credentials.access_token || credentials.accessToken || credentials.token;
    if (!accessToken || typeof accessToken !== 'string') continue;
    await upsertUnifiedCredential({
      userId: row.user_id,
      provider,
      scopes: parseScopes(provider, row.metadata?.scopes || credentials.scope || credentials.scopes),
      accessToken,
      refreshToken: typeof credentials.refresh_token === 'string' ? credentials.refresh_token : null,
      expiresAt: row.expires_at || credentials.expires_at || null,
      rawTokenBlob: { connection_id: row.id, credential_type_id: row.credential_type_id },
      source: 'generic_oauth_connections',
    });
  }
  console.log(`[UnifiedCredentialMigration] Migrated ${rows.length} rows from connections`);
}

async function main() {
  await migrateOAuthTable('google_oauth_tokens', 'google', 'legacy_google');
  await migrateOAuthTable('linkedin_oauth_tokens', 'linkedin', 'legacy_linkedin');
  await migrateOAuthTable('notion_oauth_tokens', 'notion', 'legacy_notion');
  await migrateOAuthTable('twitter_oauth_tokens', 'twitter', 'legacy_twitter');
  await migrateOAuthTable('instagram_oauth_tokens', 'instagram', 'legacy_instagram');
  await migrateOAuthTable('whatsapp_oauth_tokens', 'whatsapp', 'legacy_whatsapp');
  await migrateOAuthTable('salesforce_oauth_tokens', 'salesforce', 'legacy_salesforce');
  await migrateOAuthTable('zoho_oauth_tokens', 'zoho', 'legacy_zoho');
  await migrateSocialTokens();
  await migrateUserCredentials();
  await migrateCredentialVault();
  await migrateConnections();
}

main().catch((error) => {
  console.error('[UnifiedCredentialMigration] Failed:', error);
  process.exitCode = 1;
});

