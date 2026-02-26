/**
 * Execution Reliability Service
 * 
 * Production-grade retry and failure handling for workflow execution.
 * 
 * Features:
 * - Automatic retry of failed node execution
 * - Configurable retry count
 * - Exponential backoff
 * - Timeout protection
 * - Mark workflow failed after max retries
 * - Continue execution where possible
 * - Store failure reason
 * - Prevent duplicate execution (idempotency key)
 */

import { WorkflowNode } from '../core/types/ai-types';
import { randomUUID } from 'crypto';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number; // Maximum number of retry attempts
  backoff: 'exponential' | 'linear' | 'fixed'; // Backoff strategy
  initialDelayMs: number; // Initial delay before first retry
  maxDelayMs: number; // Maximum delay between retries
  timeoutMs: number; // Timeout for each execution attempt
  retryableErrors?: string[]; // Error patterns that should be retried
  nonRetryableErrors?: string[]; // Error patterns that should NOT be retried
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoff: 'exponential',
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  timeoutMs: 30000, // 30 seconds
  retryableErrors: [
    'timeout',
    'network',
    'connection',
    'temporary',
    'rate limit',
    '503',
    '502',
    '504',
  ],
  nonRetryableErrors: [
    'validation',
    'authentication',
    'authorization',
    'not found',
    '400',
    '401',
    '403',
    '404',
  ],
};

/**
 * Execution attempt result
 */
export interface ExecutionAttempt {
  attempt: number;
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
  timestamp: number;
}

/**
 * Execution result with retry information
 */
export interface ReliableExecutionResult {
  success: boolean;
  result?: any;
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
    attempts: ExecutionAttempt[];
    finalFailure?: boolean;
  };
  attempts: ExecutionAttempt[];
  totalDuration: number;
  idempotencyKey: string;
}

/**
 * Failure reason storage
 */
export interface FailureReason {
  nodeId: string;
  nodeType: string;
  executionId: string;
  workflowId: string;
  error: string;
  errorCode?: string;
  attempts: number;
  timestamp: number;
  retryable: boolean;
  context?: Record<string, any>;
}

/**
 * Idempotency key storage
 */
interface IdempotencyRecord {
  key: string;
  nodeId: string;
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * Execution Reliability Manager
 */
export class ExecutionReliabilityManager {
  private idempotencyStore: Map<string, IdempotencyRecord> = new Map();
  private failureStore: Map<string, FailureReason[]> = new Map(); // workflowId -> failures
  private readonly idempotencyTTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Execute node with retry and reliability features
   */
  async executeWithReliability(
    node: WorkflowNode,
    executeFn: () => Promise<any>,
    config: Partial<RetryConfig> = {},
    context: {
      executionId: string;
      workflowId: string;
      userId?: string;
    }
  ): Promise<ReliableExecutionResult> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const idempotencyKey = this.generateIdempotencyKey(node, context);
    
    console.log(`[ExecutionReliability] Executing node ${node.id} with reliability (maxRetries: ${retryConfig.maxRetries}, timeout: ${retryConfig.timeoutMs}ms)`);
    
    // Check idempotency
    const existingRecord = this.idempotencyStore.get(idempotencyKey);
    if (existingRecord) {
      if (existingRecord.status === 'completed') {
        console.log(`[ExecutionReliability] Idempotent execution found for ${node.id}, returning cached result`);
        return {
          success: true,
          result: existingRecord.result,
          attempts: [],
          totalDuration: 0,
          idempotencyKey,
        };
      } else if (existingRecord.status === 'running') {
        console.log(`[ExecutionReliability] Execution already in progress for ${node.id}, waiting...`);
        // Wait for existing execution (with timeout)
        const waitResult = await this.waitForCompletion(idempotencyKey, retryConfig.timeoutMs);
        if (waitResult) {
          return waitResult;
        }
        // If wait timed out, continue with new execution
      }
    }
    
    // Mark as running
    this.idempotencyStore.set(idempotencyKey, {
      key: idempotencyKey,
      nodeId: node.id,
      executionId: context.executionId,
      workflowId: context.workflowId,
      status: 'running',
      createdAt: Date.now(),
    });
    
    const attempts: ExecutionAttempt[] = [];
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    // Retry loop
    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        console.log(`[ExecutionReliability] Attempt ${attempt}/${retryConfig.maxRetries + 1} for node ${node.id}`);
        
        // Execute with timeout
        const result = await this.executeWithTimeout(
          executeFn,
          retryConfig.timeoutMs,
          node.id
        );
        
        const attemptDuration = Date.now() - attemptStartTime;
        
        // Success!
        attempts.push({
          attempt,
          success: true,
          result,
          duration: attemptDuration,
          timestamp: attemptStartTime,
        });
        
        // Store successful result
        this.idempotencyStore.set(idempotencyKey, {
          key: idempotencyKey,
          nodeId: node.id,
          executionId: context.executionId,
          workflowId: context.workflowId,
          status: 'completed',
          result,
          createdAt: Date.now(),
          completedAt: Date.now(),
        });
        
        console.log(`[ExecutionReliability] Node ${node.id} executed successfully on attempt ${attempt}`);
        
        return {
          success: true,
          result,
          attempts,
          totalDuration: Date.now() - startTime,
          idempotencyKey,
        };
        
      } catch (error: any) {
        const attemptDuration = Date.now() - attemptStartTime;
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const errorMessage = lastError.message.toLowerCase();
        const isRetryable = this.isRetryableError(errorMessage, retryConfig);
        
        attempts.push({
          attempt,
          success: false,
          error: lastError,
          duration: attemptDuration,
          timestamp: attemptStartTime,
        });
        
        console.warn(`[ExecutionReliability] Attempt ${attempt} failed for node ${node.id}: ${lastError.message}`);
        console.warn(`[ExecutionReliability] Retryable: ${isRetryable}, Remaining attempts: ${retryConfig.maxRetries + 1 - attempt}`);
        
        // Check if we should retry
        if (attempt <= retryConfig.maxRetries && isRetryable) {
          // Calculate backoff delay
          const delay = this.calculateBackoff(attempt, retryConfig);
          console.log(`[ExecutionReliability] Retrying in ${delay}ms...`);
          await this.delay(delay);
        } else {
          // No more retries or non-retryable error
          break;
        }
      }
    }
    
    // All attempts failed
    const totalDuration = Date.now() - startTime;
    const finalFailure = attempts.length === retryConfig.maxRetries + 1;
    
    // Store failure reason
    this.storeFailureReason({
      nodeId: node.id,
      nodeType: node.data?.type || node.type,
      executionId: context.executionId,
      workflowId: context.workflowId,
      error: lastError?.message || 'Unknown error',
      errorCode: this.extractErrorCode(lastError),
      attempts: attempts.length,
      timestamp: Date.now(),
      retryable: lastError ? this.isRetryableError(lastError.message.toLowerCase(), retryConfig) : false,
      context: {
        nodeLabel: node.data?.label,
        config: node.data?.config,
      },
    });
    
    // Mark as failed
    this.idempotencyStore.set(idempotencyKey, {
      key: idempotencyKey,
      nodeId: node.id,
      executionId: context.executionId,
      workflowId: context.workflowId,
      status: 'failed',
      error: lastError?.message,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });
    
    console.error(`[ExecutionReliability] Node ${node.id} failed after ${attempts.length} attempts`);
    
    return {
      success: false,
      error: {
        message: lastError?.message || 'Execution failed',
        code: this.extractErrorCode(lastError),
        retryable: lastError ? this.isRetryableError(lastError.message.toLowerCase(), retryConfig) : false,
        attempts,
        finalFailure,
      },
      attempts,
      totalDuration,
      idempotencyKey,
    };
  }
  
  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    nodeId: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timeout after ${timeoutMs}ms for node ${nodeId}`));
        }, timeoutMs);
      }),
    ]);
  }
  
  /**
   * Calculate backoff delay
   */
  private calculateBackoff(attempt: number, config: RetryConfig): number {
    let delay: number;
    
    switch (config.backoff) {
      case 'exponential':
        delay = config.initialDelayMs * Math.pow(2, attempt - 1);
        break;
      case 'linear':
        delay = config.initialDelayMs * attempt;
        break;
      case 'fixed':
        delay = config.initialDelayMs;
        break;
      default:
        delay = config.initialDelayMs;
    }
    
    // Cap at max delay
    return Math.min(delay, config.maxDelayMs);
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryableError(errorMessage: string, config: RetryConfig): boolean {
    // Check non-retryable errors first
    if (config.nonRetryableErrors) {
      for (const pattern of config.nonRetryableErrors) {
        if (errorMessage.includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }
    
    // Check retryable errors
    if (config.retryableErrors) {
      for (const pattern of config.retryableErrors) {
        if (errorMessage.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
    
    // Default: retryable (for transient errors)
    return true;
  }
  
  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(
    node: WorkflowNode,
    context: { executionId: string; workflowId: string }
  ): string {
    // Use node ID + execution ID + workflow ID for idempotency
    // Include node config hash if needed for more granular idempotency
    const configHash = this.hashConfig(node.data?.config || {});
    return `${context.workflowId}:${context.executionId}:${node.id}:${configHash}`;
  }
  
  /**
   * Hash node config for idempotency
   */
  private hashConfig(config: Record<string, any>): string {
    // Simple hash - in production, use crypto.createHash
    const configStr = JSON.stringify(config);
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Wait for existing execution to complete
   */
  private async waitForCompletion(
    idempotencyKey: string,
    timeoutMs: number
  ): Promise<ReliableExecutionResult | null> {
    const startTime = Date.now();
    const pollInterval = 100; // Check every 100ms
    
    while (Date.now() - startTime < timeoutMs) {
      const record = this.idempotencyStore.get(idempotencyKey);
      
      if (record) {
        if (record.status === 'completed') {
          return {
            success: true,
            result: record.result,
            attempts: [],
            totalDuration: Date.now() - startTime,
            idempotencyKey,
          };
        } else if (record.status === 'failed') {
          return {
            success: false,
            error: {
              message: record.error || 'Execution failed',
              retryable: false,
              attempts: [],
            },
            attempts: [],
            totalDuration: Date.now() - startTime,
            idempotencyKey,
          };
        }
      }
      
      await this.delay(pollInterval);
    }
    
    // Timeout waiting
    return null;
  }
  
  /**
   * Store failure reason
   */
  private storeFailureReason(failure: FailureReason): void {
    const workflowFailures = this.failureStore.get(failure.workflowId) || [];
    workflowFailures.push(failure);
    this.failureStore.set(failure.workflowId, workflowFailures);
    
    console.log(`[ExecutionReliability] Stored failure reason for node ${failure.nodeId}: ${failure.error}`);
  }
  
  /**
   * Get failure reasons for a workflow
   */
  getFailureReasons(workflowId: string): FailureReason[] {
    return this.failureStore.get(workflowId) || [];
  }
  
  /**
   * Clear failure reasons for a workflow
   */
  clearFailureReasons(workflowId: string): void {
    this.failureStore.delete(workflowId);
  }
  
  /**
   * Extract error code from error
   */
  private extractErrorCode(error: Error | null): string | undefined {
    if (!error) return undefined;
    
    // Try to extract HTTP status code
    const statusMatch = error.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      return statusMatch[1];
    }
    
    // Try to extract error type
    const errorType = error.constructor.name;
    if (errorType !== 'Error') {
      return errorType;
    }
    
    return undefined;
  }
  
  /**
   * Clean up old idempotency records
   */
  cleanupIdempotencyRecords(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, record] of this.idempotencyStore.entries()) {
      if (now - record.createdAt > this.idempotencyTTL) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.idempotencyStore.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      console.log(`[ExecutionReliability] Cleaned up ${keysToDelete.length} old idempotency records`);
    }
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const executionReliability = new ExecutionReliabilityManager();

// Types are already exported above, no need to re-export

// Cleanup old records periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    executionReliability.cleanupIdempotencyRecords();
  }, 60 * 60 * 1000); // Every hour
}
