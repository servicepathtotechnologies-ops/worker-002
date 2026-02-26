/**
 * Supabase Node Definition
 * 
 * Supports operations:
 * - select: Query records with filters, limit, order
 * - insert: Insert records
 * - update: Update records
 * - delete: Delete records
 * - rpc: Call a Postgres function
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runSupabaseNode } from '../../services/database/supabaseNode';

export const supabaseNodeDefinition: NodeDefinition = {
  type: 'supabase',
  label: 'Supabase',
  category: 'database',
  description: 'Connect to and query Supabase databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    url: {
      type: 'string',
      description: 'Supabase project URL',
      required: true,
      default: '',
    },
    anonKey: {
      type: 'string',
      description: 'Supabase anonymous key (for public access)',
      required: false,
      default: '',
    },
    serviceRoleKey: {
      type: 'string',
      description: 'Supabase service role key (bypasses RLS)',
      required: false,
      default: '',
    },
    schema: {
      type: 'string',
      description: 'Database schema (default: public)',
      required: false,
      default: 'public',
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'select',
      examples: ['select', 'insert', 'update', 'delete', 'rpc'],
    },
    table: {
      type: 'string',
      description: 'Table name (for select/insert/update/delete operations)',
      required: false,
      default: '',
    },
    columns: {
      type: 'string',
      description: 'Comma-separated column names (for select operation, default: *)',
      required: false,
      default: '*',
    },
    filter: {
      type: 'json',
      description: 'Filter conditions as object (for select/update/delete operations)',
      required: false,
      default: null,
    },
    limit: {
      type: 'number',
      description: 'Limit number of results (for select operation)',
      required: false,
      default: null,
    },
    order: {
      type: 'json',
      description: 'Order specification: { column: string, ascending: boolean }',
      required: false,
      default: null,
    },
    data: {
      type: 'json',
      description: 'Data object or array (for insert/update operations)',
      required: false,
      default: null,
    },
    functionName: {
      type: 'string',
      description: 'Function name (for rpc operation)',
      required: false,
      default: '',
    },
    params: {
      type: 'json',
      description: 'Function parameters (for rpc operation)',
      required: false,
      default: null,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Supabase operation result',
    },
  },

  requiredInputs: ['url', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.url || typeof inputs.url !== 'string' || inputs.url.trim() === '') {
      errors.push('url is required');
    }
    if (!inputs.anonKey && !inputs.serviceRoleKey) {
      errors.push('Either anonKey or serviceRoleKey is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const validOperations = ['select', 'insert', 'update', 'delete', 'rpc'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (['select', 'insert', 'update', 'delete'].includes(inputs.operation) && (!inputs.table || typeof inputs.table !== 'string' || inputs.table.trim() === '')) {
      errors.push('table is required for this operation');
    }

    if (['insert', 'update'].includes(inputs.operation) && !inputs.data) {
      errors.push('data is required for this operation');
    }

    if (['update', 'delete'].includes(inputs.operation) && !inputs.filter) {
      errors.push('filter is required for this operation');
    }

    if (inputs.operation === 'rpc') {
      if (!inputs.functionName || typeof inputs.functionName !== 'string' || inputs.functionName.trim() === '') {
        errors.push('functionName is required for rpc operation');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    url: '',
    anonKey: '',
    serviceRoleKey: '',
    schema: 'public',
    operation: 'select',
    table: '',
    columns: '*',
    filter: null,
    limit: null,
    order: null,
    data: null,
    functionName: '',
    params: null,
  }),

  run: runSupabaseNode,
};
