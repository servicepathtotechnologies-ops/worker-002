/**
 * AWS RDS database type shim — replaces @supabase/supabase-js type imports.
 *
 * Previously named supabase-shim.ts. Mapped via tsconfig paths so that
 * `import type { SupabaseClient } from '@supabase/supabase-js'` resolves here
 * at compile time (no actual Supabase SDK required at runtime).
 *
 * All types are `any` because the RDS client is duck-typed to match the
 * Supabase JS client interface — no generated types needed.
 */

// Re-export everything from the shim for backward compatibility
export * from './supabase-shim';

// Preferred aliases for new code
export type DbClient = any;
export type DbError = any;
export type DbResponse<T = any> = { data: T | null; error: DbError | null };
