/**
 * Storage Manager
 * 
 * Unified interface for routing data to appropriate storage:
 * - Small data (< 100KB) → Database (JSONB)
 * - Large data (> 100KB) → Object Storage (S3/MinIO)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ObjectStorageService } from '../object-storage-service';

const MAX_DB_SIZE = 100 * 1024; // 100KB threshold
const MAX_JSON_SIZE = 50 * 1024; // 50KB for JSON objects

export interface StorageReference {
  _storage: 'db' | 's3';
  _key?: string;
  _url?: string;
  _data?: unknown; // For small data stored directly
}

/**
 * Storage Manager
 * 
 * Intelligently routes data to appropriate storage based on size.
 */
export class StorageManager {
  private supabase: SupabaseClient;
  private objectStorage?: ObjectStorageService;

  constructor(
    supabase: SupabaseClient,
    objectStorage?: ObjectStorageService
  ) {
    this.supabase = supabase;
    this.objectStorage = objectStorage;
  }

  /**
   * Store execution input data
   * 
   * Routes to DB or object storage based on size.
   */
  async storeExecutionInput(
    inputData: Record<string, unknown>,
    executionId?: string
  ): Promise<Record<string, unknown>> {
    const stored: Record<string, unknown> = {};
    const execId = executionId || 'input';

    for (const [key, value] of Object.entries(inputData)) {
      if (this.shouldUseObjectStorage(value)) {
        // Store in object storage
        if (this.objectStorage) {
          const storageRef = await this.objectStorage.store(
            execId,
            key,
            value
          );
          stored[key] = {
            _storage: 's3',
            _key: storageRef._key,
            _url: storageRef._url,
          };
        } else {
          // Fallback to DB if object storage not available
          stored[key] = value;
        }
      } else {
        // Store directly in DB (small data)
        stored[key] = value;
      }
    }

    return stored;
  }

  /**
   * Store execution output data
   */
  async storeExecutionOutput(
    executionId: string,
    outputData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const stored: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(outputData)) {
      if (this.shouldUseObjectStorage(value)) {
        // Store in object storage
        if (this.objectStorage) {
          const storageRef = await this.objectStorage.store(
            executionId,
            `output-${key}`,
            value
          );
          stored[key] = {
            _storage: 's3',
            _key: storageRef._key,
            _url: storageRef._url,
          };
        } else {
          stored[key] = value;
        }
      } else {
        stored[key] = value;
      }
    }

    return stored;
  }

  /**
   * Store node output data
   */
  async storeNodeOutput(
    executionId: string,
    nodeId: string,
    outputData: unknown
  ): Promise<StorageReference> {
    if (this.shouldUseObjectStorage(outputData)) {
      // Store in object storage
      if (this.objectStorage) {
        const storageRef = await this.objectStorage.store(
          executionId,
          nodeId,
          outputData
        );
        return {
          _storage: 's3',
          _key: storageRef._key,
          _url: storageRef._url,
        };
      } else {
        // Fallback to DB
        return {
          _storage: 'db',
          _data: outputData,
        };
      }
    } else {
      // Store directly in DB
      return {
        _storage: 'db',
        _data: outputData,
      };
    }
  }

  /**
   * Load data from storage reference
   */
  async loadData(reference: StorageReference | Record<string, unknown>): Promise<unknown> {
    // Check if it's a storage reference
    if (reference && typeof reference === 'object' && '_storage' in reference) {
      const ref = reference as StorageReference;

      if (ref._storage === 'db') {
        // Data stored directly
        return ref._data;
      } else if (ref._storage === 's3' && this.objectStorage) {
        // Load from object storage
        if (ref._key) {
          return await this.objectStorage.load({
            _storage: 's3',
            _key: ref._key,
            _url: ref._url || '',
          });
        }
      }
    }

    // Not a storage reference, return as-is
    return reference;
  }

  /**
   * Load node input data
   */
  async loadNodeInputs(
    executionId: string,
    inputRefs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const loaded: Record<string, unknown> = {};

    for (const [key, ref] of Object.entries(inputRefs)) {
      // Type assertion: ref from Object.entries is unknown, but we know it's either
      // a StorageReference or a plain object
      if (ref && typeof ref === 'object') {
        loaded[key] = await this.loadData(ref as StorageReference | Record<string, unknown>);
      } else {
        // If it's not an object, use it as-is
        loaded[key] = ref;
      }
    }

    return loaded;
  }

  /**
   * Determine if data should be stored in object storage
   */
  private shouldUseObjectStorage(data: unknown): boolean {
    if (data === null || data === undefined) {
      return false;
    }

    // Check string/buffer size
    if (typeof data === 'string') {
      return data.length > MAX_DB_SIZE;
    }

    if (Buffer.isBuffer(data)) {
      return data.length > MAX_DB_SIZE;
    }

    // Check JSON size
    if (typeof data === 'object') {
      try {
        const jsonString = JSON.stringify(data);
        return jsonString.length > MAX_JSON_SIZE;
      } catch (error) {
        // If can't stringify, assume it's large
        return true;
      }
    }

    // Arrays
    if (Array.isArray(data)) {
      try {
        const jsonString = JSON.stringify(data);
        return jsonString.length > MAX_JSON_SIZE;
      } catch (error) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get storage path for execution artifact
   */
  generateStoragePath(
    executionId: string,
    nodeId: string,
    artifactType: string
  ): string {
    return `executions/${executionId}/${nodeId}/${artifactType}`;
  }
}
