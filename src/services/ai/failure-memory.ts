// PHASE-2: Failure Memory Store
// Learns from errors and auto-fixes next time
// Errors become training signals

import { WorkflowNode } from '../../core/types/ai-types';

export interface FailureRecord {
  id: string;
  nodeType: string;
  error: string;
  errorType: string;
  fix: string;
  fixApplied: boolean;
  occurrences: number;
  lastOccurred: string;
  firstOccurred: string;
  context?: {
    workflowId?: string;
    nodeId?: string;
    inputData?: any;
  };
}

export interface FailureMemory {
  failures: Map<string, FailureRecord>;
  patterns: Map<string, string[]>; // error pattern -> fix patterns
}

/**
 * Failure Memory Store - PHASE-2 Feature #6
 * 
 * Stores failures and learns from them:
 * - Same error → auto-fix next time
 * - Errors become training signals
 * - Improves agent over time
 */
export class FailureMemoryStore {
  private memory: FailureMemory;

  constructor() {
    this.memory = {
      failures: new Map(),
      patterns: new Map(),
    };
  }

  /**
   * Record a failure
   */
  recordFailure(
    nodeType: string,
    error: string,
    fix?: string,
    context?: { workflowId?: string; nodeId?: string; inputData?: any }
  ): void {
    const errorKey = this.generateErrorKey(nodeType, error);
    const existing = this.memory.failures.get(errorKey);

    if (existing) {
      // Update existing record
      existing.occurrences++;
      existing.lastOccurred = new Date().toISOString();
      if (fix && !existing.fix) {
        existing.fix = fix;
      }
      if (context) {
        existing.context = { ...existing.context, ...context };
      }
    } else {
      // Create new record
      const now = new Date().toISOString();
      const record: FailureRecord = {
        id: errorKey,
        nodeType,
        error,
        errorType: this.categorizeError(error),
        fix: fix || '',
        fixApplied: false,
        occurrences: 1,
        lastOccurred: now,
        firstOccurred: now,
        context,
      };
      this.memory.failures.set(errorKey, record);
    }

    console.log(`📝 [FailureMemory] Recorded failure: ${nodeType} - ${error.substring(0, 50)}`);
  }

  /**
   * Get fix for known error
   */
  getFix(nodeType: string, error: string): string | null {
    const errorKey = this.generateErrorKey(nodeType, error);
    const record = this.memory.failures.get(errorKey);

    if (record && record.fix) {
      console.log(`🔧 [FailureMemory] Found fix for known error: ${error.substring(0, 50)}`);
      return record.fix;
    }

    // Try pattern matching
    const patternFix = this.findPatternFix(nodeType, error);
    if (patternFix) {
      return patternFix;
    }

    return null;
  }

  /**
   * Check if error is known
   */
  isKnownError(nodeType: string, error: string): boolean {
    const errorKey = this.generateErrorKey(nodeType, error);
    return this.memory.failures.has(errorKey);
  }

  /**
   * Apply learned fix
   */
  applyLearnedFix(node: WorkflowNode, error: string): { fixed: boolean; changes?: any } {
    const fix = this.getFix(node.type, error);

    if (!fix) {
      return { fixed: false };
    }

    // Apply fix based on fix description
    const changes = this.parseFix(fix, node);
    
    if (changes) {
      // Mark fix as applied
      const errorKey = this.generateErrorKey(node.type, error);
      const record = this.memory.failures.get(errorKey);
      if (record) {
        record.fixApplied = true;
      }

      console.log(`✅ [FailureMemory] Applied learned fix for ${node.type}`);
      return { fixed: true, changes };
    }

    return { fixed: false };
  }

  /**
   * Get failure statistics
   */
  getStatistics(): {
    totalFailures: number;
    uniqueErrors: number;
    fixesAvailable: number;
    mostCommonErrors: Array<{ nodeType: string; error: string; occurrences: number }>;
  } {
    const failures = Array.from(this.memory.failures.values());
    const mostCommon = failures
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10)
      .map(f => ({
        nodeType: f.nodeType,
        error: f.error,
        occurrences: f.occurrences,
      }));

    return {
      totalFailures: failures.reduce((sum, f) => sum + f.occurrences, 0),
      uniqueErrors: failures.length,
      fixesAvailable: failures.filter(f => f.fix).length,
      mostCommonErrors: mostCommon,
    };
  }

  /**
   * Generate error key
   */
  private generateErrorKey(nodeType: string, error: string): string {
    // Normalize error message
    const normalized = error
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    return `${nodeType}:${normalized}`;
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: string): string {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('credential') || errorLower.includes('auth') || errorLower.includes('token')) {
      return 'credential';
    }
    if (errorLower.includes('invalid') || errorLower.includes('malformed')) {
      return 'validation';
    }
    if (errorLower.includes('timeout') || errorLower.includes('time out')) {
      return 'timeout';
    }
    if (errorLower.includes('rate limit') || errorLower.includes('too many')) {
      return 'rate_limit';
    }
    if (errorLower.includes('not found') || errorLower.includes('404')) {
      return 'not_found';
    }
    if (errorLower.includes('permission') || errorLower.includes('forbidden') || errorLower.includes('403')) {
      return 'permission';
    }

    return 'unknown';
  }

  /**
   * Find pattern-based fix
   */
  private findPatternFix(nodeType: string, error: string): string | null {
    const errorType = this.categorizeError(error);

    // Pattern-based fixes
    const patternFixes: Record<string, Record<string, string>> = {
      credential: {
        slack_message: 'Configure Slack API token in credentials',
        email: 'Configure email credentials (SMTP or OAuth)',
        google_sheets: 'Grant OAuth access to Google Sheets',
      },
      validation: {
        http_request: 'Check URL format and required parameters',
        database_write: 'Validate data schema matches table structure',
      },
      timeout: {
        http_request: 'Increase timeout or add retry logic',
        ai_agent: 'Reduce max_tokens or simplify prompt',
      },
      rate_limit: {
        http_request: 'Add rate limiting or backoff strategy',
        slack_message: 'Reduce message frequency or batch messages',
      },
    };

    return patternFixes[errorType]?.[nodeType] || null;
  }

  /**
   * Parse fix description into actionable changes
   */
  private parseFix(fix: string, node: WorkflowNode): any {
    // Simple fix parsing - can be enhanced
    const fixLower = fix.toLowerCase();

    if (fixLower.includes('configure') || fixLower.includes('credential')) {
      return {
        type: 'credential',
        message: fix,
      };
    }

    if (fixLower.includes('timeout')) {
      return {
        type: 'timeout',
        value: 30000, // Increase to 30s
      };
    }

    if (fixLower.includes('retry')) {
      return {
        type: 'retry',
        maxRetries: 3,
        retryDelay: 1000,
      };
    }

    return null;
  }
}

// Export singleton instance
export const failureMemoryStore = new FailureMemoryStore();
