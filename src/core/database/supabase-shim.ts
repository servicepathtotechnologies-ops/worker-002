/**
 * Type shim — replaces @supabase/supabase-js type imports across the worker.
 * Mapped via tsconfig paths so `import type { SupabaseClient } from '@supabase/supabase-js'`
 * resolves here at compile time (no actual Supabase SDK required at runtime).
 */

export type SupabaseClient = any;
export type PostgrestError = any;
export type PostgrestResponse<T = any> = { data: T | null; error: PostgrestError | null };
export type PostgrestSingleResponse<T = any> = { data: T | null; error: PostgrestError | null };
export type User = any;
export type Session = any;
export type AuthChangeEvent = string;
export type AuthError = any;
export type RealtimeChannel = any;
export type SupabaseClientOptions = any;

export function createClient(_url: string, _key: string, _opts?: any): SupabaseClient {
  throw new Error(
    'createClient (supabase-shim): Use the RDS-backed db-pool or the dynamic Supabase node executor instead.'
  );
}
