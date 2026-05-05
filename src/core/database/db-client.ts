/**
 * AWS RDS database client — canonical entry point.
 *
 * Re-exports everything from supabase-compat.ts under clean names.
 * New code should import from this file:
 *
 *   import { getDbClient } from '../core/database/db-client';
 *
 * The underlying implementation uses pg.Pool → AWS RDS PostgreSQL.
 * No Supabase SDK is used at runtime.
 */

export { getDbClient, getSupabaseClient, createSupabaseClient } from './supabase-compat';
