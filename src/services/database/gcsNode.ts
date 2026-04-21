/**
 * Google Cloud Storage Node Executor
 *
 * Supports operations:
 * - upload:   Store a file to a GCS bucket
 * - download: Retrieve a file from a GCS bucket
 * - delete:   Remove a file from a GCS bucket
 * - list:     Enumerate files in a GCS bucket with optional prefix filter
 *
 * Uses @google-cloud/storage SDK.
 * Each execution initializes a unique Storage client instance to prevent
 * connection state conflicts across concurrent workflow executions.
 */

import { Storage } from '@google-cloud/storage';
import { NodeExecutionContext } from '../../core/types/node-definition';

type GCSOperation = 'upload' | 'download' | 'delete' | 'list';

const VALID_OPERATIONS: GCSOperation[] = ['upload', 'download', 'delete', 'list'];

/**
 * Parse a value that may arrive as a JSON string or already be an object.
 */
function parseData(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

async function handleUpload(
  storage: Storage,
  inputs: Record<string, any>
): Promise<any> {
  const { bucket, fileName, fileContent } = inputs;

  if (!bucket) {
    return { success: false, error: 'bucket is required' };
  }
  if (!fileName) {
    return { success: false, error: 'fileName is required for upload' };
  }
  if (fileContent === undefined || fileContent === null) {
    return { success: false, error: 'fileContent is required for upload' };
  }

  const bucketRef = storage.bucket(bucket);
  const file = bucketRef.file(fileName);

  // Convert fileContent to buffer if it's a string
  let contentBuffer: Buffer;
  if (typeof fileContent === 'string') {
    contentBuffer = Buffer.from(fileContent, 'utf-8');
  } else if (Buffer.isBuffer(fileContent)) {
    contentBuffer = fileContent;
  } else {
    // If it's an object, convert to JSON string then to buffer
    contentBuffer = Buffer.from(JSON.stringify(fileContent), 'utf-8');
  }

  await file.save(contentBuffer);

  return {
    success: true,
    fileName,
    fileSize: contentBuffer.length,
  };
}

async function handleDownload(
  storage: Storage,
  inputs: Record<string, any>
): Promise<any> {
  const { bucket, fileName } = inputs;

  if (!bucket) {
    return { success: false, error: 'bucket is required' };
  }
  if (!fileName) {
    return { success: false, error: 'fileName is required for download' };
  }

  const bucketRef = storage.bucket(bucket);
  const file = bucketRef.file(fileName);

  const [data] = await file.download();

  return {
    success: true,
    fileName,
    data: data.toString('utf-8'),
  };
}

async function handleDelete(
  storage: Storage,
  inputs: Record<string, any>
): Promise<any> {
  const { bucket, fileName } = inputs;

  if (!bucket) {
    return { success: false, error: 'bucket is required' };
  }
  if (!fileName) {
    return { success: false, error: 'fileName is required for delete' };
  }

  const bucketRef = storage.bucket(bucket);
  const file = bucketRef.file(fileName);

  await file.delete();

  return {
    success: true,
    fileName,
    deleted: true,
  };
}

async function handleList(
  storage: Storage,
  inputs: Record<string, any>
): Promise<any> {
  const { bucket, filter } = inputs;

  if (!bucket) {
    return { success: false, error: 'bucket is required' };
  }

  const bucketRef = storage.bucket(bucket);

  const options: any = {};
  if (filter) {
    options.prefix = filter;
  }

  const [files] = await bucketRef.getFiles(options);

  const data = files.map((file) => ({
    name: file.name,
    size: file.metadata.size,
    updated: file.metadata.updated,
  }));

  return {
    success: true,
    data,
    count: data.length,
  };
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Run GCS node.
 *
 * Initializes a unique Google Cloud Storage client per execution to prevent
 * connection state conflicts, then dispatches to the appropriate
 * operation handler. The client is always closed in a finally block.
 */
export async function runGCSNode(context: NodeExecutionContext): Promise<any> {
  const { inputs, nodeId } = context;

  // --- Credential validation (before any SDK call) ---
  const projectId: string = inputs.projectId;
  const clientEmail: string = inputs.clientEmail;
  const privateKey: string = inputs.privateKey;

  if (!projectId) {
    return { success: false, error: 'projectId is required' };
  }
  if (!clientEmail) {
    return { success: false, error: 'clientEmail is required' };
  }
  if (!privateKey) {
    return { success: false, error: 'privateKey is required' };
  }

  // --- Operation validation ---
  const operation: string = inputs.operation;
  if (!operation || !VALID_OPERATIONS.includes(operation as GCSOperation)) {
    return { success: false, error: `Invalid operation: ${operation}` };
  }

  // --- Bucket validation ---
  const bucket: string = inputs.bucket;
  if (!bucket) {
    return { success: false, error: 'bucket is required' };
  }

  // --- Unique client name per execution ---
  const clientName = `gcs-${nodeId}-${Date.now()}`;

  let storage: Storage | null = null;

  try {
    storage = new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
    });

    switch (operation as GCSOperation) {
      case 'upload':
        return await handleUpload(storage, inputs);
      case 'download':
        return await handleDownload(storage, inputs);
      case 'delete':
        return await handleDelete(storage, inputs);
      case 'list':
        return await handleList(storage, inputs);
      default:
        return { success: false, error: `Invalid operation: ${operation}` };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'GCS operation failed',
    };
  } finally {
    // Note: Storage client from @google-cloud/storage doesn't require explicit cleanup
    // but we keep the pattern for consistency with Firebase
    if (storage) {
      try {
        // Close any open connections if needed
        // The Storage client handles this automatically
      } catch (closeError) {
        console.error('[GCS] Error closing storage client:', closeError);
      }
    }
  }
}
