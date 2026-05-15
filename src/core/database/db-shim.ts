/**
 * AWS RDS type shim — replaces legacy @db/db-js type imports across the worker.
 * Mapped via tsconfig paths so `import type { DbClient } from '@db/db-js'`
 * resolves here at compile time (no actual external DB SDK required at runtime).
 *
 * Prefer importing from db-types.ts for new code.
 */

export type DbClient = any;
/** @deprecated Use DbClient */
export type SupabaseClient = DbClient;
export type PostgrestError = any;
export type PostgrestResponse<T = any> = { data: T | null; error: PostgrestError | null };
export type PostgrestSingleResponse<T = any> = { data: T | null; error: PostgrestError | null };
export type User = any;
export type Session = any;
export type AuthChangeEvent = string;
export type AuthError = any;
export type RealtimeChannel = any;
export type DbClientOptions = any;
/** @deprecated Use DbClientOptions */
export type SupabaseClientOptions = DbClientOptions;

export function createClient(_url: string, _key: string, _opts?: any): DbClient {
  throw new Error(
    'createClient (db-shim): Use the RDS-backed db-pool or the dynamic third-party node executor instead.'
  );
}
