/**
 * Amazon SES Node Type Definitions
 * 
 * Defines all TypeScript interfaces and types for the Amazon SES node integration.
 * These types ensure type safety across the Amazon SES node implementation.
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1
 */

/**
 * Amazon SES Configuration Interface
 * 
 * Represents the complete configuration for an Amazon SES node.
 * Includes email content, recipients, sender information, and AWS settings.
 * 
 * Requirement: 1.1 (Send Basic Email)
 */
export interface AmazonSesConfig {
  // Required fields
  recipients: AmazonSesRecipients;
  subject: string;
  body: string;

  // Template support (Requirement: 2.1)
  useTemplate?: boolean;
  templateName?: string;
  templateData?: Record<string, any>;

  // Sender configuration (Requirement: 1.3)
  fromAddress?: string;
  replyToAddresses?: string[];

  // Attachments (Requirement: 3.1)
  attachments?: AmazonSesAttachment[];

  // AWS Configuration (Requirement: 4.1, 4.2)
  awsRegion?: string;

  // Advanced options (Requirement: 5.1)
  configurationSetName?: string;
  tags?: Record<string, string>;
  returnPath?: string;
}

/**
 * Amazon SES Recipients Interface
 * 
 * Represents the recipient list for an email.
 * Supports To, Cc, and Bcc recipient types.
 * 
 * Requirement: 1.4 (Multiple recipient types)
 */
export interface AmazonSesRecipients {
  to?: string[];
  cc?: string[];
  bcc?: string[];
}

/**
 * Amazon SES Attachment Interface
 * 
 * Represents a file attachment for an email.
 * Includes filename, base64-encoded content, and content type.
 * 
 * Requirement: 3.1 (Handle Attachments)
 */
export interface AmazonSesAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

/**
 * Amazon SES Output Interface
 * 
 * Represents the output/result of an Amazon SES node execution.
 * Includes success status, message ID, recipient count, and error information.
 * 
 * Requirement: 5.1 (Track Email Delivery Status)
 */
export interface AmazonSesOutput {
  success: boolean;
  messageId?: string;
  recipientCount?: number;
  failedRecipients?: string[];
  error?: string;
  errorType?: 'temporary' | 'permanent';
  retryable?: boolean;
  timestamp: string;
}

/**
 * AWS Credentials Interface
 * 
 * Represents AWS credentials for authentication with AWS SES.
 * Includes access key ID, secret access key, and optional region.
 * 
 * Requirement: 4.1 (Configure AWS Connection)
 */
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

/**
 * AWS SES Template Interface
 * 
 * Represents an AWS SES template with subject, HTML, and text content.
 * 
 * Requirement: 2.1 (Send Templated Emails)
 */
export interface AmazonSesTemplate {
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Template Data Validation Result Interface
 * 
 * Represents the result of validating template data against a template schema.
 * 
 * Requirement: 2.4 (Template data validation)
 */
export interface TemplateDataValidationResult {
  valid: boolean;
  missingFields: string[];
  invalidFields: string[];
}

/**
 * Email Message Interface
 * 
 * Represents a complete email message ready to be sent via AWS SES.
 * 
 * Requirement: 1.1, 1.4, 1.5
 */
export interface EmailMessage {
  source: string;
  destination: {
    toAddresses: string[];
    ccAddresses?: string[];
    bccAddresses?: string[];
  };
  message: {
    subject: {
      data: string;
      charset: string;
    };
    body: {
      html?: {
        data: string;
        charset: string;
      };
      text?: {
        data: string;
        charset: string;
      };
    };
  };
  replyToAddresses?: string[];
  configurationSetName?: string;
  tags?: Array<{ name: string; value: string }>;
  returnPath?: string;
}

/**
 * Send Result Interface
 * 
 * Represents the result of sending an email via AWS SES.
 * 
 * Requirement: 5.1 (Track Email Delivery Status)
 */
export interface SendResult {
  messageId: string;
  recipientCount: number;
  failedRecipients: string[];
}

/**
 * Error Classification Interface
 * 
 * Represents the classification of an error as temporary or permanent.
 * 
 * Requirement: 7.3 (Error classification)
 */
export interface ErrorClassification {
  type: 'temporary' | 'permanent';
  retryable: boolean;
  message: string;
}

/**
 * Retry Configuration Interface
 * 
 * Represents the configuration for retry logic with exponential backoff.
 * 
 * Requirement: 7.1, 7.2 (Retry logic)
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

/**
 * Recipient Processing Result Interface
 * 
 * Represents the result of processing and validating recipients.
 * 
 * Requirement: 1.4, 8.1 (Recipient processing)
 */
export interface RecipientProcessingResult {
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  totalCount: number;
  invalidRecipients: string[];
}

/**
 * Attachment Processing Result Interface
 * 
 * Represents the result of processing and validating attachments.
 * 
 * Requirement: 3.1, 3.2, 3.3, 3.4 (Attachment handling)
 */
export interface AttachmentProcessingResult {
  valid: boolean;
  attachments: AmazonSesAttachment[];
  totalSize: number;
  errors: string[];
}

/**
 * Configuration Validation Result Interface
 * 
 * Represents the result of validating the complete Amazon SES configuration.
 * 
 * Requirement: 1.1, 2.1, 3.1, 4.1
 */
export interface ConfigurationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Email Sending Audit Log Interface
 * 
 * Represents an audit log entry for email sending attempts.
 * 
 * Requirement: 5.3 (Audit logging)
 */
export interface EmailAuditLog {
  workflowId: string;
  nodeId: string;
  recipients: string[];
  subject: string;
  status: 'sent' | 'failed' | 'retried';
  messageId?: string;
  error?: string;
  attemptNumber: number;
  timestamp: string;
}

/**
 * Bulk Recipient Handling Result Interface
 * 
 * Represents the result of handling bulk recipient operations.
 * 
 * Requirement: 8.1, 8.4 (Bulk recipient handling)
 */
export interface BulkRecipientResult {
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  batchResults: Array<{
    batchNumber: number;
    recipients: string[];
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/**
 * Rate Limiting Status Interface
 * 
 * Represents the current rate limiting status for AWS SES operations.
 * 
 * Requirement: 8.2, 8.3 (Rate limiting)
 */
export interface RateLimitingStatus {
  currentRate: number;
  maxRate: number;
  isThrottled: boolean;
  nextAvailableTime?: number;
  remainingQuota: number;
}

/**
 * Node Execution Context Interface
 * 
 * Represents the execution context for an Amazon SES node.
 * Includes workflow data, previous node outputs, and execution metadata.
 * 
 * Requirement: 6.1 (Workflow data integration)
 */
export interface AmazonSesExecutionContext {
  workflowId: string;
  nodeId: string;
  config: AmazonSesConfig;
  previousOutput: Record<string, any>;
  credentials: AWSCredentials;
  db: any; // SupabaseClient type
}

/**
 * Node Execution Result Interface
 * 
 * Represents the result of executing an Amazon SES node.
 * 
 * Requirement: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1
 */
export interface AmazonSesExecutionResult {
  success: boolean;
  output: AmazonSesOutput;
  executionTime: number;
  metadata?: Record<string, any>;
}
