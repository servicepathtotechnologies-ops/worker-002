/**
 * Supabase Node Executor
 * 
 * Supports operations:
 * - select: Query records with filters, limit, order
 * - insert: Insert records
 * - update: Update records
 * - delete: Delete records
 * - rpc: Call a Postgres function
 * 
 * Uses @supabase/supabase-js client.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NodeExecutionContext } from '../../core/types/node-definition';

interface SupabaseCredentials {
  url: string;
  anonKey?: string;
  serviceRoleKey?: string;
  schema?: string;
}

interface SupabaseOperation {
  name: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  table?: string;
  columns?: string;
  filter?: Record<string, any>;
  limit?: number;
  order?: { column: string; ascending?: boolean };
  data?: Record<string, any> | Record<string, any>[];
  functionName?: string;
  params?: Record<string, any>;
}

/**
 * Validate Supabase credentials
 */
function validateCredentials(credentials: SupabaseCredentials): { valid: boolean; error?: string } {
  if (!credentials.url || typeof credentials.url !== 'string' || credentials.url.trim() === '') {
    return { valid: false, error: 'url is required' };
  }
  if (!credentials.anonKey && !credentials.serviceRoleKey) {
    return { valid: false, error: 'Either anonKey or serviceRoleKey is required' };
  }

  return { valid: true };
}

/**
 * Execute Supabase operation
 */
async function executeOperation(
  client: SupabaseClient,
  operation: SupabaseOperation,
  schema: string
): Promise<any> {
  switch (operation.name) {
    case 'select': {
      if (!operation.table) {
        throw new Error('table is required for select operation');
      }

      let query = client
        .schema(schema)
        .from(operation.table)
        .select(operation.columns || '*');

      // Apply filters
      if (operation.filter) {
        for (const [key, value] of Object.entries(operation.filter)) {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Handle operators like { gt: 10 }, { eq: 'value' }, etc.
            for (const [op, opValue] of Object.entries(value)) {
              switch (op) {
                case 'eq':
                  query = query.eq(key, opValue);
                  break;
                case 'neq':
                  query = query.neq(key, opValue);
                  break;
                case 'gt':
                  query = query.gt(key, opValue);
                  break;
                case 'gte':
                  query = query.gte(key, opValue);
                  break;
                case 'lt':
                  query = query.lt(key, opValue);
                  break;
                case 'lte':
                  query = query.lte(key, opValue);
                  break;
                case 'like':
                  query = query.like(key, String(opValue));
                  break;
                case 'ilike':
                  query = query.ilike(key, String(opValue));
                  break;
                case 'in':
                  query = query.in(key, Array.isArray(opValue) ? opValue : [opValue]);
                  break;
                case 'is':
                  query = query.is(key, opValue);
                  break;
                default:
                  // Default to equality
                  query = query.eq(key, opValue);
              }
            }
          } else {
            // Simple equality
            query = query.eq(key, value);
          }
        }
      }

      // Apply ordering
      if (operation.order) {
        query = query.order(operation.order.column, {
          ascending: operation.order.ascending !== false,
        });
      }

      // Apply limit
      if (operation.limit) {
        query = query.limit(operation.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return {
        rows: data || [],
        count: data?.length || 0,
      };
    }

    case 'insert': {
      if (!operation.table) {
        throw new Error('table is required for insert operation');
      }
      if (!operation.data) {
        throw new Error('data is required for insert operation');
      }

      const dataArray = Array.isArray(operation.data) ? operation.data : [operation.data];

      const { data, error } = await client
        .schema(schema)
        .from(operation.table)
        .insert(dataArray)
        .select();

      if (error) {
        throw error;
      }

      return {
        inserted: data || [],
        count: data?.length || 0,
      };
    }

    case 'update': {
      if (!operation.table) {
        throw new Error('table is required for update operation');
      }
      if (!operation.data) {
        throw new Error('data is required for update operation');
      }
      if (!operation.filter) {
        throw new Error('filter is required for update operation');
      }

      let query = client
        .schema(schema)
        .from(operation.table)
        .update(operation.data);

      // Apply filters
      for (const [key, value] of Object.entries(operation.filter)) {
        query = query.eq(key, value);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }

      return {
        rows: data || [],
        count: data?.length || 0,
      };
    }

    case 'delete': {
      if (!operation.table) {
        throw new Error('table is required for delete operation');
      }
      if (!operation.filter) {
        throw new Error('filter is required for delete operation');
      }

      let query = client
        .schema(schema)
        .from(operation.table)
        .delete();

      // Apply filters
      for (const [key, value] of Object.entries(operation.filter)) {
        query = query.eq(key, value);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }

      return {
        rows: data || [],
        count: data?.length || 0,
      };
    }

    case 'rpc': {
      if (!operation.functionName) {
        throw new Error('functionName is required for rpc operation');
      }

      const { data, error } = await client
        .schema(schema)
        .rpc(operation.functionName, operation.params || {});

      if (error) {
        throw error;
      }

      return {
        result: data,
      };
    }

    default:
      throw new Error(`Unsupported operation: ${operation.name}`);
  }
}

/**
 * Run Supabase node
 */
export async function runSupabaseNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  // Extract credentials
  const credentials: SupabaseCredentials = {
    url: inputs.url,
    anonKey: inputs.anonKey,
    serviceRoleKey: inputs.serviceRoleKey,
    schema: inputs.schema || 'public',
  };

  // Extract operation
  const operation: SupabaseOperation = {
    name: inputs.operation,
    table: inputs.table,
    columns: inputs.columns,
    filter: inputs.filter,
    limit: inputs.limit,
    order: inputs.order,
    data: inputs.data,
    functionName: inputs.functionName,
    params: inputs.params,
  };

  // Validate credentials
  const validation = validateCredentials(credentials);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Validate operation
  if (!operation.name) {
    return {
      success: false,
      error: 'operation is required',
    };
  }

  const validOperations = ['select', 'insert', 'update', 'delete', 'rpc'];
  if (!validOperations.includes(operation.name)) {
    return {
      success: false,
      error: `operation must be one of: ${validOperations.join(', ')}`,
    };
  }

  try {
    // Create Supabase client
    // Use serviceRoleKey if provided (bypasses RLS), otherwise use anonKey
    const key = credentials.serviceRoleKey || credentials.anonKey!;
    const client = createClient(credentials.url, key);

    // Execute operation
    const result = await executeOperation(client, operation, credentials.schema || 'public');

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Supabase operation failed',
    };
  }
}
