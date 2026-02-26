/**
 * Workflow Logger Service
 * 
 * Provides structured logging and execution tracing for workflows.
 * 
 * Features:
 * - Log each node execution
 * - Log input/output
 * - Log errors
 * - Log execution duration
 * - Correlation IDs per workflow
 * - Structured JSON logs
 * - Debug mode
 */

import { EventEmitter } from 'events';

/**
 * Log event types
 */
export type LogEvent = 
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'node:started'
  | 'node:completed'
  | 'node:failed'
  | 'node:skipped'
  | 'checkpoint:saved'
  | 'checkpoint:loaded'
  | 'error'
  | 'debug';

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry
 */
export interface WorkflowLogEntry {
  workflowId: string;
  executionId: string;
  correlationId: string;
  nodeId?: string;
  nodeName?: string;
  event: LogEvent;
  level: LogLevel;
  timestamp: string;
  duration?: number; // milliseconds
  input?: any;
  output?: any;
  error?: {
    message: string;
    stack?: string;
    code?: string;
    details?: any;
  };
  metadata?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  debugMode?: boolean;
  logToConsole?: boolean;
  logToDatabase?: boolean;
  logToFile?: boolean;
  filePath?: string;
  maxLogSize?: number; // bytes
  correlationIdPrefix?: string;
}

/**
 * Workflow Logger
 */
export class WorkflowLogger extends EventEmitter {
  private config: LoggerConfig;
  private correlationIds: Map<string, string> = new Map(); // executionId -> correlationId
  private nodeTimers: Map<string, number> = new Map(); // nodeId -> startTime
  private workflowTimers: Map<string, number> = new Map(); // executionId -> startTime
  private logs: WorkflowLogEntry[] = [];
  private maxLogs: number = 10000; // Keep last 10k logs in memory

  constructor(config?: Partial<LoggerConfig>) {
    super();
    
    this.config = {
      debugMode: config?.debugMode || process.env.DEBUG_MODE === 'true',
      logToConsole: config?.logToConsole !== false,
      logToDatabase: config?.logToDatabase || false,
      logToFile: config?.logToFile || false,
      filePath: config?.filePath || './logs/workflow.log',
      maxLogSize: config?.maxLogSize || 10 * 1024 * 1024, // 10MB
      correlationIdPrefix: config?.correlationIdPrefix || 'wf',
    };
  }

  /**
   * Generate correlation ID for execution
   */
  private generateCorrelationId(executionId: string): string {
    const existing = this.correlationIds.get(executionId);
    if (existing) {
      return existing;
    }
    
    const correlationId = `${this.config.correlationIdPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.correlationIds.set(executionId, correlationId);
    return correlationId;
  }

  /**
   * Get correlation ID for execution
   */
  getCorrelationId(executionId: string): string {
    return this.correlationIds.get(executionId) || this.generateCorrelationId(executionId);
  }

  /**
   * Create log entry
   */
  private createLogEntry(
    workflowId: string,
    executionId: string,
    event: LogEvent,
    options?: {
      nodeId?: string;
      nodeName?: string;
      level?: LogLevel;
      input?: any;
      output?: any;
      error?: Error | { message: string; stack?: string; code?: string; details?: any };
      duration?: number;
      metadata?: Record<string, any>;
    }
  ): WorkflowLogEntry {
    const correlationId = this.getCorrelationId(executionId);
    const timestamp = new Date().toISOString();
    
    // Determine log level
    let level: LogLevel = options?.level || 'info';
    if (event.includes('failed') || event === 'error') {
      level = 'error';
    } else if (event === 'debug') {
      level = 'debug';
    } else if (event.includes('warn')) {
      level = 'warn';
    }

    // Calculate duration if not provided
    let duration = options?.duration;
    if (!duration) {
      if (options?.nodeId) {
        const startTime = this.nodeTimers.get(options.nodeId);
        if (startTime) {
          duration = Date.now() - startTime;
        }
      } else if (event === 'workflow:completed' || event === 'workflow:failed') {
        const startTime = this.workflowTimers.get(executionId);
        if (startTime) {
          duration = Date.now() - startTime;
        }
      }
    }

    // Format error
    let error: WorkflowLogEntry['error'];
    if (options?.error) {
      if (options.error instanceof Error) {
        error = {
          message: options.error.message,
          stack: options.error.stack,
          details: (options.error as any).details,
        };
      } else {
        error = options.error;
      }
    }

    const entry: WorkflowLogEntry = {
      workflowId,
      executionId,
      correlationId,
      nodeId: options?.nodeId,
      nodeName: options?.nodeName,
      event,
      level,
      timestamp,
      duration,
      input: this.sanitizeData(options?.input),
      output: this.sanitizeData(options?.output),
      error,
      metadata: options?.metadata,
    };

    return entry;
  }

  /**
   * Sanitize data for logging (remove sensitive info, limit size)
   */
  private sanitizeData(data: any): any {
    if (data === undefined || data === null) {
      return data;
    }

    // Limit object depth and size
    const maxDepth = 5;
    const maxSize = 10000; // characters
    
    const sanitize = (obj: any, depth: number = 0): any => {
      if (depth > maxDepth) {
        return '[Max depth reached]';
      }

      if (typeof obj === 'string') {
        // Check for sensitive patterns
        const sensitivePatterns = [
          /password/i,
          /secret/i,
          /token/i,
          /key/i,
          /auth/i,
          /credential/i,
        ];
        
        for (const pattern of sensitivePatterns) {
          if (pattern.test(JSON.stringify(obj))) {
            return '[Redacted: sensitive data]';
          }
        }

        // Limit string size
        if (obj.length > maxSize) {
          return obj.substring(0, maxSize) + '...[truncated]';
        }
        
        return obj;
      }

      if (typeof obj !== 'object') {
        return obj;
      }

      if (Array.isArray(obj)) {
        // Limit array size
        if (obj.length > 100) {
          return obj.slice(0, 100).map(item => sanitize(item, depth + 1)).concat(['...[truncated]']);
        }
        return obj.map(item => sanitize(item, depth + 1));
      }

      // Limit object keys
      const keys = Object.keys(obj);
      if (keys.length > 50) {
        const limited: any = {};
        for (let i = 0; i < 50; i++) {
          limited[keys[i]] = sanitize(obj[keys[i]], depth + 1);
        }
        limited['...[truncated]'] = `${keys.length - 50} more keys`;
        return limited;
      }

      const sanitized: any = {};
      for (const key of keys) {
        // Redact sensitive keys
        if (/password|secret|token|key|auth|credential/i.test(key)) {
          sanitized[key] = '[Redacted]';
        } else {
          sanitized[key] = sanitize(obj[key], depth + 1);
        }
      }

      return sanitized;
    };

    return sanitize(data);
  }

  /**
   * Write log entry
   */
  private async writeLog(entry: WorkflowLogEntry): Promise<void> {
    // Add to in-memory logs
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest
    }

    // Emit event
    this.emit('log', entry);
    this.emit(entry.event, entry);

    // Console logging
    if (this.config.logToConsole) {
      this.logToConsole(entry);
    }

    // Database logging
    if (this.config.logToDatabase) {
      await this.logToDatabase(entry).catch(err => {
        console.error('[WorkflowLogger] Failed to log to database:', err);
      });
    }

    // File logging
    if (this.config.logToFile) {
      await this.logToFile(entry).catch(err => {
        console.error('[WorkflowLogger] Failed to log to file:', err);
      });
    }
  }

  /**
   * Log to console
   */
  private logToConsole(entry: WorkflowLogEntry): void {
    const prefix = `[${entry.level.toUpperCase()}] [${entry.correlationId}]`;
    const message = `${entry.event}${entry.nodeId ? ` [${entry.nodeId}]` : ''}`;
    
    const logData: any = {
      workflowId: entry.workflowId,
      executionId: entry.executionId,
      event: entry.event,
      ...(entry.nodeId && { nodeId: entry.nodeId }),
      ...(entry.duration !== undefined && { duration: `${entry.duration}ms` }),
      ...(entry.error && { error: entry.error.message }),
    };

    // Only log in debug mode if it's a debug event
    if (entry.event === 'debug' && !this.config.debugMode) {
      return;
    }

    switch (entry.level) {
      case 'error':
        console.error(`${prefix} ${message}`, logData);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`, logData);
        break;
      case 'debug':
        if (this.config.debugMode) {
          console.debug(`${prefix} ${message}`, logData);
        }
        break;
      default:
        console.log(`${prefix} ${message}`, logData);
    }
  }

  /**
   * Log to database
   */
  private async logToDatabase(entry: WorkflowLogEntry): Promise<void> {
    try {
      const { getSupabaseClient } = await import('../core/database/supabase-compat');
      const supabase = getSupabaseClient();
      
      await supabase
        .from('workflow_execution_logs')
        .insert({
          workflow_id: entry.workflowId,
          execution_id: entry.executionId,
          correlation_id: entry.correlationId,
          node_id: entry.nodeId,
          node_name: entry.nodeName,
          event: entry.event,
          level: entry.level,
          timestamp: entry.timestamp,
          duration_ms: entry.duration,
          input_data: entry.input,
          output_data: entry.output,
          error_data: entry.error,
          metadata: entry.metadata,
        });
    } catch (error) {
      // Silently fail - don't break workflow execution
      console.error('[WorkflowLogger] Database log error:', error);
    }
  }

  /**
   * Log to file
   */
  private async logToFile(entry: WorkflowLogEntry): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const logDir = path.dirname(this.config.filePath!);
      await fs.mkdir(logDir, { recursive: true });
      
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.config.filePath!, logLine);
    } catch (error) {
      // Silently fail - don't break workflow execution
      console.error('[WorkflowLogger] File log error:', error);
    }
  }

  /**
   * Log workflow started
   */
  logWorkflowStarted(
    workflowId: string,
    executionId: string,
    input?: any,
    metadata?: Record<string, any>
  ): void {
    this.workflowTimers.set(executionId, Date.now());
    
    const entry = this.createLogEntry(workflowId, executionId, 'workflow:started', {
      input,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Log workflow completed
   */
  logWorkflowCompleted(
    workflowId: string,
    executionId: string,
    output?: any,
    metadata?: Record<string, any>
  ): void {
    const startTime = this.workflowTimers.get(executionId);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    const entry = this.createLogEntry(workflowId, executionId, 'workflow:completed', {
      output,
      duration,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
    
    // Cleanup
    this.workflowTimers.delete(executionId);
  }

  /**
   * Log workflow failed
   */
  logWorkflowFailed(
    workflowId: string,
    executionId: string,
    error: Error | { message: string; stack?: string; code?: string; details?: any },
    metadata?: Record<string, any>
  ): void {
    const startTime = this.workflowTimers.get(executionId);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    const entry = this.createLogEntry(workflowId, executionId, 'workflow:failed', {
      error,
      duration,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
    
    // Cleanup
    this.workflowTimers.delete(executionId);
  }

  /**
   * Log node started
   */
  logNodeStarted(
    workflowId: string,
    executionId: string,
    nodeId: string,
    nodeName: string,
    input?: any,
    metadata?: Record<string, any>
  ): void {
    this.nodeTimers.set(nodeId, Date.now());
    
    const entry = this.createLogEntry(workflowId, executionId, 'node:started', {
      nodeId,
      nodeName,
      input,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Log node completed
   */
  logNodeCompleted(
    workflowId: string,
    executionId: string,
    nodeId: string,
    nodeName: string,
    output?: any,
    duration?: number,
    metadata?: Record<string, any>
  ): void {
    const startTime = this.nodeTimers.get(nodeId);
    const calculatedDuration = duration !== undefined ? duration : (startTime ? Date.now() - startTime : undefined);
    
    const entry = this.createLogEntry(workflowId, executionId, 'node:completed', {
      nodeId,
      nodeName,
      output,
      duration: calculatedDuration,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
    
    // Cleanup
    this.nodeTimers.delete(nodeId);
  }

  /**
   * Log node failed
   */
  logNodeFailed(
    workflowId: string,
    executionId: string,
    nodeId: string,
    nodeName: string,
    error: Error | { message: string; stack?: string; code?: string; details?: any },
    input?: any,
    metadata?: Record<string, any>
  ): void {
    const startTime = this.nodeTimers.get(nodeId);
    const duration = startTime ? Date.now() - startTime : undefined;
    
    const entry = this.createLogEntry(workflowId, executionId, 'node:failed', {
      nodeId,
      nodeName,
      error,
      input,
      duration,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
    
    // Cleanup
    this.nodeTimers.delete(nodeId);
  }

  /**
   * Log node skipped
   */
  logNodeSkipped(
    workflowId: string,
    executionId: string,
    nodeId: string,
    nodeName: string,
    reason?: string,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(workflowId, executionId, 'node:skipped', {
      nodeId,
      nodeName,
      metadata: {
        ...metadata,
        reason,
      },
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Log checkpoint saved
   */
  logCheckpointSaved(
    workflowId: string,
    executionId: string,
    nodeId: string,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(workflowId, executionId, 'checkpoint:saved', {
      nodeId,
      metadata,
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Log checkpoint loaded
   */
  logCheckpointLoaded(
    workflowId: string,
    executionId: string,
    completedNodes: number,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(workflowId, executionId, 'checkpoint:loaded', {
      metadata: {
        ...metadata,
        completedNodes,
      },
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Log debug message
   */
  logDebug(
    workflowId: string,
    executionId: string,
    message: string,
    data?: any,
    nodeId?: string
  ): void {
    if (!this.config.debugMode) {
      return;
    }

    const entry = this.createLogEntry(workflowId, executionId, 'debug', {
      nodeId,
      level: 'debug',
      metadata: {
        message,
        data,
      },
    });
    
    this.writeLog(entry).catch(err => {
      console.error('[WorkflowLogger] Failed to write log:', err);
    });
  }

  /**
   * Get logs for execution
   */
  getLogs(executionId: string): WorkflowLogEntry[] {
    return this.logs.filter(log => log.executionId === executionId);
  }

  /**
   * Get logs for workflow
   */
  getWorkflowLogs(workflowId: string): WorkflowLogEntry[] {
    return this.logs.filter(log => log.workflowId === workflowId);
  }

  /**
   * Get logs by correlation ID
   */
  getLogsByCorrelationId(correlationId: string): WorkflowLogEntry[] {
    return this.logs.filter(log => log.correlationId === correlationId);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.correlationIds.clear();
    this.nodeTimers.clear();
    this.workflowTimers.clear();
  }
}

// Export singleton instance
let workflowLoggerInstance: WorkflowLogger | null = null;

export function getWorkflowLogger(config?: Partial<LoggerConfig>): WorkflowLogger {
  if (!workflowLoggerInstance) {
    workflowLoggerInstance = new WorkflowLogger(config);
  }
  return workflowLoggerInstance;
}

// Types are already exported above, no need to re-export
