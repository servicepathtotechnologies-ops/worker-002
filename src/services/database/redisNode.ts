/**
 * Redis Node Executor
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
 * 
 * Uses ioredis driver.
 */

import Redis from 'ioredis';
import { NodeExecutionContext } from '../../core/types/node-definition';

interface RedisCredentials {
  host: string;
  port: number | string;
  password?: string;
  db?: number | string;
  tls?: boolean;
}

interface RedisOperation {
  name: 'get' | 'set' | 'delete' | 'incr' | 'hget' | 'hset' | 'lpush' | 'rpop' | 'command';
  key?: string;
  value?: string | number;
  ttl?: number;
  field?: string;
  hash?: string;
  command?: string;
  args?: any[];
}

/**
 * Validate Redis credentials
 */
function validateCredentials(credentials: RedisCredentials): { valid: boolean; error?: string } {
  if (!credentials.host || typeof credentials.host !== 'string' || credentials.host.trim() === '') {
    return { valid: false, error: 'host is required' };
  }
  
  const port = parseInt(String(credentials.port || 6379));
  if (isNaN(port) || port < 1 || port > 65535) {
    return { valid: false, error: 'port must be a valid number between 1 and 65535' };
  }

  return { valid: true };
}

/**
 * Execute Redis operation
 */
async function executeOperation(
  client: Redis,
  operation: RedisOperation
): Promise<any> {
  switch (operation.name) {
    case 'get': {
      if (!operation.key) {
        throw new Error('key is required for get operation');
      }
      const value = await client.get(operation.key);
      return {
        key: operation.key,
        value: value,
      };
    }

    case 'set': {
      if (!operation.key) {
        throw new Error('key is required for set operation');
      }
      if (operation.value === undefined || operation.value === null) {
        throw new Error('value is required for set operation');
      }
      
      let result: string;
      if (operation.ttl && operation.ttl > 0) {
        result = await client.setex(operation.key, operation.ttl, String(operation.value));
      } else {
        result = await client.set(operation.key, String(operation.value));
      }
      
      return {
        key: operation.key,
        value: operation.value,
        result: result === 'OK' ? 'OK' : result,
      };
    }

    case 'delete': {
      if (!operation.key) {
        throw new Error('key is required for delete operation');
      }
      const result = await client.del(operation.key);
      return {
        key: operation.key,
        deleted: result > 0,
        count: result,
      };
    }

    case 'incr': {
      if (!operation.key) {
        throw new Error('key is required for incr operation');
      }
      const result = await client.incr(operation.key);
      return {
        key: operation.key,
        value: result,
      };
    }

    case 'hget': {
      if (!operation.hash) {
        throw new Error('hash is required for hget operation');
      }
      if (!operation.field) {
        throw new Error('field is required for hget operation');
      }
      const value = await client.hget(operation.hash, operation.field);
      return {
        hash: operation.hash,
        field: operation.field,
        value: value,
      };
    }

    case 'hset': {
      if (!operation.hash) {
        throw new Error('hash is required for hset operation');
      }
      if (!operation.field) {
        throw new Error('field is required for hset operation');
      }
      if (operation.value === undefined || operation.value === null) {
        throw new Error('value is required for hset operation');
      }
      const result = await client.hset(operation.hash, operation.field, String(operation.value));
      return {
        hash: operation.hash,
        field: operation.field,
        value: operation.value,
        result: result,
      };
    }

    case 'lpush': {
      if (!operation.key) {
        throw new Error('key is required for lpush operation');
      }
      if (operation.value === undefined || operation.value === null) {
        throw new Error('value is required for lpush operation');
      }
      const result = await client.lpush(operation.key, String(operation.value));
      return {
        key: operation.key,
        length: result,
      };
    }

    case 'rpop': {
      if (!operation.key) {
        throw new Error('key is required for rpop operation');
      }
      const value = await client.rpop(operation.key);
      return {
        key: operation.key,
        value: value,
      };
    }

    case 'command': {
      if (!operation.command) {
        throw new Error('command is required for command operation');
      }
      const args = operation.args || [];
      const result = await (client as any).call(operation.command, ...args);
      return {
        command: operation.command,
        args: args,
        result: result,
      };
    }

    default:
      throw new Error(`Unsupported operation: ${operation.name}`);
  }
}

/**
 * Run Redis node
 */
export async function runRedisNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  // Extract credentials
  const credentials: RedisCredentials = {
    host: inputs.host,
    port: inputs.port || 6379,
    password: inputs.password,
    db: inputs.db || 0,
    tls: inputs.tls === true,
  };

  // Extract operation
  const operation: RedisOperation = {
    name: inputs.operation,
    key: inputs.key,
    value: inputs.value,
    ttl: inputs.ttl,
    field: inputs.field,
    hash: inputs.hash,
    command: inputs.command,
    args: inputs.args,
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

  const validOperations = ['get', 'set', 'delete', 'incr', 'hget', 'hset', 'lpush', 'rpop', 'command'];
  if (!validOperations.includes(operation.name)) {
    return {
      success: false,
      error: `operation must be one of: ${validOperations.join(', ')}`,
    };
  }

  // Create Redis client
  const client = new Redis({
    host: credentials.host,
    port: parseInt(String(credentials.port)),
    password: credentials.password || undefined,
    db: parseInt(String(credentials.db || 0)),
    tls: credentials.tls ? {} : undefined,
    retryStrategy: () => null, // Disable retry for faster failure
    maxRetriesPerRequest: 1,
  });

  try {
    // Test connection
    await client.ping();

    // Execute operation
    const result = await executeOperation(client, operation);

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Redis operation failed',
    };
  } finally {
    try {
      client.disconnect();
    } catch (closeError) {
      console.error('[Redis] Error disconnecting client:', closeError);
    }
  }
}
