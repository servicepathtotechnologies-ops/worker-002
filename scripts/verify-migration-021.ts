import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getDbPool } from '../src/core/database/db-pool';

async function run() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'executions' AND column_name IN ('ai_calls','ai_tokens')
      ORDER BY column_name
    `);
    if (res.rows.length === 2) {
      console.log('✅ Columns confirmed:');
      res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} DEFAULT ${r.column_default}`));
    } else {
      console.warn('⚠️  Expected 2 columns, found:', res.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err.message); process.exit(1); });
