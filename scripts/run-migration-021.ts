// One-shot script: run migration 021 (add ai_calls, ai_tokens to executions table)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getDbPool } from '../src/core/database/db-pool';

async function run() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE executions
        ADD COLUMN IF NOT EXISTS ai_calls  INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ai_tokens INTEGER NOT NULL DEFAULT 0
    `);
    console.log('✅ Migration 021 applied: ai_calls and ai_tokens columns added to executions table.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
