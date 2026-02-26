/**
 * Redis Node Definition
 * 
 * Supports operations:
 * - get: Get a value by key
 * - set: Set a key-value pair (with optional TTL)
 * - delete: Delete a key
 * - incr: Increment a numeric value
 * - hget: Get a field from a hash
 * - hset: Set a field in a hash
 * - lpush: Push to the left of a list
 * - rpop: Pop from the right of a list
 * - command: Execute a generic Redis command
 */

import { NodeDefinition } from '../../core/types/node-definition';
import { runRedisNode } from '../../services/database/redisNode';

export const redisNodeDefinition: NodeDefinition = {
  type: 'redis',
  label: 'Redis',
  category: 'database',
  description: 'Connect to and interact with Redis databases',
  icon: 'Database',
  version: 1,

  inputSchema: {
    host: {
      type: 'string',
      description: 'Redis hostname or IP address',
      required: true,
      default: 'localhost',
    },
    port: {
      type: 'number',
      description: 'Redis port (default: 6379)',
      required: false,
      default: 6379,
    },
    password: {
      type: 'string',
      description: 'Redis password (optional)',
      required: false,
      default: '',
    },
    db: {
      type: 'number',
      description: 'Redis database number (default: 0)',
      required: false,
      default: 0,
    },
    tls: {
      type: 'boolean',
      description: 'Enable TLS',
      required: false,
      default: false,
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'get',
      examples: ['get', 'set', 'delete', 'incr', 'hget', 'hset', 'lpush', 'rpop', 'command'],
    },
    key: {
      type: 'string',
      description: 'Redis key',
      required: false,
      default: '',
    },
    value: {
      type: 'string',
      description: 'Value to set',
      required: false,
      default: '',
    },
    ttl: {
      type: 'number',
      description: 'Time to live in seconds (for set operation)',
      required: false,
      default: null,
    },
    hash: {
      type: 'string',
      description: 'Hash name (for hget/hset operations)',
      required: false,
      default: '',
    },
    field: {
      type: 'string',
      description: 'Hash field name (for hget/hset operations)',
      required: false,
      default: '',
    },
    command: {
      type: 'string',
      description: 'Redis command (for command operation)',
      required: false,
      default: '',
    },
    args: {
      type: 'json',
      description: 'Command arguments array (for command operation)',
      required: false,
      default: null,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Redis operation result',
    },
  },

  requiredInputs: ['host', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.host || typeof inputs.host !== 'string' || inputs.host.trim() === '') {
      errors.push('host is required');
    }
    if (!inputs.operation) {
      errors.push('operation is required');
    }

    const validOperations = ['get', 'set', 'delete', 'incr', 'hget', 'hset', 'lpush', 'rpop', 'command'];
    if (inputs.operation && !validOperations.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOperations.join(', ')}`);
    }

    if (['get', 'set', 'delete', 'incr', 'lpush', 'rpop'].includes(inputs.operation) && (!inputs.key || typeof inputs.key !== 'string' || inputs.key.trim() === '')) {
      errors.push('key is required for this operation');
    }

    if (['set', 'lpush'].includes(inputs.operation) && (inputs.value === undefined || inputs.value === null)) {
      errors.push('value is required for this operation');
    }

    if (['hget', 'hset'].includes(inputs.operation)) {
      if (!inputs.hash || typeof inputs.hash !== 'string' || inputs.hash.trim() === '') {
        errors.push('hash is required for this operation');
      }
      if (!inputs.field || typeof inputs.field !== 'string' || inputs.field.trim() === '') {
        errors.push('field is required for this operation');
      }
      if (inputs.operation === 'hset' && (inputs.value === undefined || inputs.value === null)) {
        errors.push('value is required for hset operation');
      }
    }

    if (inputs.operation === 'command' && (!inputs.command || typeof inputs.command !== 'string' || inputs.command.trim() === '')) {
      errors.push('command is required for command operation');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
    tls: false,
    operation: 'get',
    key: '',
    value: '',
    ttl: null,
    hash: '',
    field: '',
    command: '',
    args: null,
  }),

  run: runRedisNode,
};
