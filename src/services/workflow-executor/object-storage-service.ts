/**
 * Object Storage Service
 * 
 * Handles large payloads (>1MB) in S3/MinIO.
 * Database stores only reference URLs.
 * 
 * This prevents database bloat and improves performance for large data.
 */

export interface ObjectStorageReference {
  _storage: 's3';
  _key: string;
  _url: string;
}

/**
 * Object Storage Service
 * 
 * Manages large payloads in object storage (S3/MinIO).
 * Database stores only reference objects.
 */
export class ObjectStorageService {
  private s3Client: any; // AWS S3 or MinIO client
  private bucketName: string;
  private enabled: boolean;

  constructor(s3Client?: any, bucketName?: string) {
    this.s3Client = s3Client;
    this.bucketName = bucketName || process.env.S3_BUCKET_NAME || '';
    this.enabled = !!s3Client && !!this.bucketName;
    
    if (!this.enabled) {
      console.warn('[ObjectStorageService] Object storage not configured. Large payloads will be stored in database.');
    }
  }

  /**
   * Store large payload in object storage
   * 
   * Returns reference object to store in database.
   * 
   * @param executionId Execution ID
   * @param nodeId Node ID
   * @param payload Payload to store
   * @returns Reference object for database storage
   */
  async store(
    executionId: string,
    nodeId: string,
    payload: unknown
  ): Promise<ObjectStorageReference> {
    if (!this.enabled) {
      throw new Error('Object storage not configured');
    }

    try {
      const key = `executions/${executionId}/${nodeId}/output.json`;
      const data = JSON.stringify(payload);

      // Upload to S3/MinIO
      await this.s3Client.putObject({
        Bucket: this.bucketName,
        Key: key,
        Body: data,
        ContentType: 'application/json',
      });

      const url = `s3://${this.bucketName}/${key}`;

      console.log(`[ObjectStorageService] ✅ Stored payload in object storage: ${key}`);

      return {
        _storage: 's3',
        _key: key,
        _url: url,
      };
    } catch (error: any) {
      console.error(`[ObjectStorageService] ❌ Failed to store in object storage:`, error);
      throw new Error(`Failed to store in object storage: ${error.message}`);
    }
  }

  /**
   * Load payload from object storage
   * 
   * @param reference Reference object from database
   * @returns Payload data
   */
  async load(reference: ObjectStorageReference): Promise<unknown> {
    if (!this.enabled) {
      throw new Error('Object storage not configured');
    }

    try {
      const { Body } = await this.s3Client.getObject({
        Bucket: this.bucketName,
        Key: reference._key,
      });

      const data = JSON.parse(Body.toString());
      console.log(`[ObjectStorageService] ✅ Loaded payload from object storage: ${reference._key}`);
      return data;
    } catch (error: any) {
      console.error(`[ObjectStorageService] ❌ Failed to load from object storage:`, error);
      throw new Error(`Failed to load from object storage: ${error.message}`);
    }
  }

  /**
   * Delete payload from object storage
   * 
   * Used for cleanup after execution completes.
   */
  async delete(reference: ObjectStorageReference): Promise<void> {
    if (!this.enabled) {
      return; // No-op if not configured
    }

    try {
      await this.s3Client.deleteObject({
        Bucket: this.bucketName,
        Key: reference._key,
      });

      console.log(`[ObjectStorageService] ✅ Deleted payload from object storage: ${reference._key}`);
    } catch (error: any) {
      console.error(`[ObjectStorageService] ❌ Failed to delete from object storage:`, error);
      // Don't throw - cleanup failures are non-critical
    }
  }

  /**
   * Check if object storage is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create object storage service from environment
 * 
 * Supports AWS S3 and MinIO.
 */
export function createObjectStorageService(): ObjectStorageService | undefined {
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3AccessKey = process.env.S3_ACCESS_KEY;
  const s3SecretKey = process.env.S3_SECRET_KEY;
  const s3BucketName = process.env.S3_BUCKET_NAME;
  const s3RegionRaw = process.env.S3_REGION || 'us-east-1';

  if (!s3AccessKey || !s3SecretKey || !s3BucketName) {
    return undefined; // Object storage not configured
  }

  // Validate region parameter to address security advisory
  // Region must be a non-empty string matching AWS region format (alphanumeric with hyphens)
  const s3Region = typeof s3RegionRaw === 'string' && 
                   s3RegionRaw.trim().length > 0 && 
                   /^[a-z0-9-]+$/.test(s3RegionRaw.trim().toLowerCase())
    ? s3RegionRaw.trim()
    : 'us-east-1'; // Default to safe value if invalid

  try {
    // Try to import AWS SDK
    const AWS = require('aws-sdk');
    
    const s3Config: any = {
      accessKeyId: s3AccessKey,
      secretAccessKey: s3SecretKey,
      region: s3Region,
    };

    // If endpoint is provided, assume MinIO
    if (s3Endpoint) {
      s3Config.endpoint = s3Endpoint;
      s3Config.s3ForcePathStyle = true; // Required for MinIO
    }

    const s3Client = new AWS.S3(s3Config);
    
    return new ObjectStorageService(s3Client, s3BucketName);
  } catch (error) {
    console.warn('[ObjectStorageService] Failed to initialize S3 client:', error);
    return undefined;
  }
}
