const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = 'postgresql://ctrlchecks_admin:CtrlChecks2026@ctrlchecks-db.cxm8gymyysvy.ap-south-1.rds.amazonaws.com:5432/ctrlchecks';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const MIGRATION_FILES = [
  '001_distributed_workflow_engine.sql',
  '002_durable_execution_enhancements.sql',
  '002_fix_executions_workflow_id_fkey.sql',
  '003_add_missing_execution_steps_columns.sql',
  '003_workflow_events_audit_trail.sql',
  '004_production_hardening.sql',
  '004_unified_execution_engine_fixes.sql',
  '005_add_workflow_phase_columns.sql',
  '006_fix_phase_status_sync_trigger.sql',
  '006_workflow_checkpoints.sql',
  '007_workflow_execution_logs.sql',
  '008_credential_vault.sql',
  '008_workflow_execution_events_allowed_types.sql',
  '009_memory_archive_tables.sql',
  '009_workflow_versions.sql',
  '010_add_workflows_metadata.sql',
  '011_subscription_management_schema.sql',
  '011_subscription_management_schema_fixed.sql',
  '012_dashboard_connection_credentials.sql',
  '012_subscription_default_data.sql',
  '013_subscription_performance_indexes.sql',
  '014_subscription_constraints_validation.sql',
  '015_fix_subscription_upgrade_history.sql',
  '016_sync_workflow_usage_from_workflows.sql',
  '017_add_workflow_quota_credits.sql',
  '018_identity_links.sql',
  '019_credentials_connections_system.sql',
  '020_fix_schema_alignment.sql',
  '021_add_ai_usage_to_executions.sql',
  '022_execution_perf_indexes.sql',
  '023_add_workflow_confirmed_setup_columns.sql',
];

// PostgreSQL error codes that mean "already exists" or "no change needed" — safe to skip
const ALREADY_EXISTS_CODES = new Set([
  '42710', // duplicate_object (policy, rule, etc.)
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42P16', // invalid_table_definition (some ALTER TABLE re-runs)
  '23505', // unique_violation (INSERT conflicts on setup data)
  '42704', // undefined_object when dropping something that doesn't exist
  '42P13', // invalid_function_definition (parameter name change on OR REPLACE — function already exists)
  '42P17', // invalid_object_definition (e.g. index predicate uses non-immutable function — skip)
]);

function splitStatements(sql) {
  // Split on semicolons that are NOT inside -- comments, string literals, or $$ dollar-quote blocks
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inLineComment = false;
  let inSingleQuote = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Handle newline — ends a line comment
    if (ch === '\n') {
      inLineComment = false;
      current += ch;
      i++;
      continue;
    }

    // Inside a line comment — just accumulate, no splitting
    if (inLineComment) {
      current += ch;
      i++;
      continue;
    }

    // Detect start of a -- line comment (only outside dollar-quote and strings)
    if (!inDollarQuote && !inSingleQuote && ch === '-' && sql[i + 1] === '-') {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }

    // Handle single-quoted strings
    if (!inDollarQuote && ch === "'") {
      inSingleQuote = !inSingleQuote;
      current += ch;
      i++;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      i++;
      continue;
    }

    // Detect start/end of dollar-quote block (e.g. $$ or $body$)
    if (!inDollarQuote) {
      const dollarMatch = sql.slice(i).match(/^\$([A-Za-z_]*)\$/);
      if (dollarMatch) {
        inDollarQuote = true;
        dollarTag = dollarMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    } else {
      if (sql.slice(i).startsWith(dollarTag)) {
        inDollarQuote = false;
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (!inDollarQuote && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed + ';');
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  const trimmed = current.trim();
  if (trimmed && trimmed !== '--') statements.push(trimmed);
  return statements;
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to AWS RDS database\n');

    // Tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migration_history (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const file of MIGRATION_FILES) {
      const filePath = path.join(MIGRATIONS_DIR, file);

      if (!fs.existsSync(filePath)) {
        console.log(`  SKIP  ${file}  (file not found)`);
        continue;
      }

      const { rows } = await client.query(
        'SELECT 1 FROM _migration_history WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`  SKIP  ${file}  (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      const statements = splitStatements(sql).filter(s => {
        const clean = s.replace(/--[^\n]*/g, '').trim();
        return clean.length > 1;
      });

      console.log(`  RUN   ${file} (${statements.length} statements)`);
      let skipped = 0;
      let failed = false;

      for (const stmt of statements) {
        try {
          await client.query(stmt);
        } catch (err) {
          if (ALREADY_EXISTS_CODES.has(err.code)) {
            skipped++;
          } else {
            console.error(`  FAIL  ${file}`);
            console.error(`        Statement: ${stmt.slice(0, 120)}...`);
            console.error(`        Error [${err.code}]: ${err.message}`);
            failed = true;
            break;
          }
        }
      }

      if (failed) {
        process.exit(1);
      }

      await client.query(
        'INSERT INTO _migration_history (filename) VALUES ($1)',
        [file]
      );

      const note = skipped > 0 ? `  (${skipped} already-existed, skipped)` : '';
      console.log(`  OK    ${file}${note}`);
    }

    console.log('\nAll migrations applied successfully.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
